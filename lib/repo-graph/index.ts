import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db/client";

type GraphLanguage = "typescript" | "javascript" | "python" | "go" | "rust" | "unknown";
type RepoGraphSnapshotLike = {
  revision?: string;
  languageSummary?: unknown;
  publicApisJson?: unknown;
  symbolsJson?: unknown;
  edgesJson?: unknown;
};

const execFileAsync = promisify(execFile);

async function gh(args: string[]) {
  const { stdout } = await execFileAsync("gh", args, {
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function ghJson<T>(args: string[]) {
  return JSON.parse(await gh(args)) as T;
}

export async function buildRepoGraphSnapshot(input: {
  owner: string;
  name: string;
  revision?: string;
}) {
  const repo = await prisma.repo.findUnique({
    where: { owner_name: { owner: input.owner, name: input.name } },
  });
  const revision = input.revision ?? repo?.defaultBranch ?? "main";

  const tree = await ghJson<{ tree?: Array<{ path?: string; type?: string }> }>([
    "api",
    `repos/${input.owner}/${input.name}/git/trees/${revision}?recursive=1`,
  ]);

  const files = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && entry.path)
    .map((entry) => entry.path as string);

  const sourceFiles = files.filter(isSourceFile).slice(0, 400);
  const docsFiles = files.filter((path) => path.startsWith("docs/") || path.toLowerCase().includes("readme"));

  const languageSummary = summarizeLanguages(sourceFiles);
  const symbols = sourceFiles.slice(0, 120).map((path) => ({
    file: path,
    kind: inferSymbolKind(path),
    language: detectLanguage(path),
  }));
  const publicApis = sourceFiles
    .filter((path) => /(^|\/)(src|lib|cmd|pkg|api)\//.test(path) && !/test|spec|__tests__/i.test(path))
    .slice(0, 80)
    .map((path) => ({
      file: path,
      exposure: inferExposure(path),
      language: detectLanguage(path),
    }));
  const edges = sourceFiles.slice(0, 120).flatMap((path) => inferEdges(path));

  const persistedRepo = await prisma.repo.upsert({
    where: { owner_name: { owner: input.owner, name: input.name } },
    create: {
      owner: input.owner,
      name: input.name,
      defaultBranch: revision,
      accessMode: "public",
    },
    update: {
      defaultBranch: repo?.defaultBranch ?? revision,
    },
    select: { id: true },
  });

  const snapshot = await prisma.repoGraphSnapshot.create({
    data: {
      repoId: persistedRepo.id,
      revision,
      languageSummary: languageSummary as object,
      symbolsJson: symbols as unknown as object,
      edgesJson: edges as unknown as object,
      publicApisJson: publicApis as unknown as object,
    },
  });

  return {
    snapshotId: snapshot.id,
    revision,
    languageSummary,
    docsFiles,
  };
}

export function summarizePrImpact(input: {
  changedFiles: Array<{ filename: string; patch?: string }>;
  snapshot?: RepoGraphSnapshotLike;
}) {
  const changed = input.changedFiles.map((file) => file.filename);
  const docsTouched = changed.filter((file) => file.startsWith("docs/") || file.toLowerCase().includes("readme"));
  const configTouched = changed.filter((file) => /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|\.env|config)/i.test(file));
  const sourceTouched = changed.filter(isSourceFile);
  const testsTouched = changed.filter((file) => /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\./i.test(file));
  const publicSurfaceTouched = sourceTouched.filter((file) => /(^|\/)(src|lib|cmd|pkg|api)\//.test(file));
  const cliTouched = sourceTouched.filter((file) => /(^|\/)(cmd|cli|bin)\//.test(file));
  const apiTouched = sourceTouched.filter((file) => /api|route|handler/i.test(file));
  const snapshotPublicApis = asArray(input.snapshot?.publicApisJson).map((entry) => asRecord(entry));
  const impactedModules = unique([
    ...sourceTouched.map((file) => normalizeModule(file)),
    ...snapshotPublicApis
      .map((entry) => String(entry.file ?? ""))
      .filter((file) => file && sourceTouched.some((changedFile) => sharesModule(changedFile, file)))
      .map((file) => normalizeModule(file)),
  ]).slice(0, 8);
  const languageSummary = asRecord(input.snapshot?.languageSummary);
  const languagesInScope = unique(
    sourceTouched.map(detectLanguage).filter((lang) => lang !== "unknown")
  );
  const releaseImpact =
    cliTouched.length > 0 || configTouched.length > 0
      ? "high"
      : apiTouched.length > 0 || publicSurfaceTouched.length > 0
      ? "medium"
      : "low";

  return {
    changedCount: changed.length,
    docsTouched,
    configTouched,
    sourceTouched,
    testsTouched,
    publicSurfaceTouched,
    impactedModules,
    docsDriftLikely: docsTouched.length === 0 && (publicSurfaceTouched.length > 0 || configTouched.length > 0 || cliTouched.length > 0),
    releaseImpact,
    languagesInScope,
    graphRevision: typeof input.snapshot?.revision === "string" ? input.snapshot.revision : null,
    indexedLanguageCount: Object.keys(languageSummary).length,
    downstreamRisk:
      publicSurfaceTouched.length > 0 && testsTouched.length === 0
        ? "high"
        : publicSurfaceTouched.length > 0
        ? "medium"
        : "low",
  };
}

function isSourceFile(path: string) {
  return /\.(ts|tsx|js|jsx|py|go|rs)$/.test(path);
}

function detectLanguage(path: string): GraphLanguage {
  if (/\.(ts|tsx)$/.test(path)) return "typescript";
  if (/\.(js|jsx)$/.test(path)) return "javascript";
  if (/\.py$/.test(path)) return "python";
  if (/\.go$/.test(path)) return "go";
  if (/\.rs$/.test(path)) return "rust";
  return "unknown";
}

function summarizeLanguages(paths: string[]) {
  return paths.reduce<Record<string, number>>((acc, path) => {
    const lang = detectLanguage(path);
    acc[lang] = (acc[lang] ?? 0) + 1;
    return acc;
  }, {});
}

function inferSymbolKind(path: string) {
  if (/route|controller|handler/i.test(path)) return "entrypoint";
  if (/config|settings|options/i.test(path)) return "config";
  if (/cli|command|cmd/i.test(path)) return "cli";
  if (/api|client/i.test(path)) return "api";
  return "module";
}

function inferExposure(path: string) {
  if (/(^|\/)(cmd|cli|bin)\//.test(path)) return "cli";
  if (/api|route|handler/i.test(path)) return "http";
  if (/lib|src/.test(path)) return "library";
  return "internal";
}

function inferEdges(path: string) {
  const dir = path.split("/").slice(0, -1).join("/") || ".";
  return [{ from: dir, to: path, type: "contains" }];
}

function normalizeModule(path: string) {
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return parts.slice(0, 2).join("/");
}

function sharesModule(left: string, right: string) {
  return normalizeModule(left) === normalizeModule(right);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
