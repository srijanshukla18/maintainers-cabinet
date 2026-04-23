import OpenAI from "openai";
import { prisma } from "@/lib/db/client";
import { buildAttentionPacket } from "./heuristics";
import {
  createGitHubClient,
  fetchOpenIssues,
  fetchOpenPullRequests,
  fetchPullRequestDetails,
  fetchPullRequestFiles,
  fetchRepoSummary,
  parseRepoInput,
} from "./github";
import type { AttentionPacket, PacketItem, PublicPullRequest, PullRequestFile, ScanContext } from "./types";

type UserWithToken = {
  id: string;
  githubAccessToken: string;
};

function json(value: unknown): object {
  return JSON.parse(JSON.stringify(value ?? {})) as object;
}

function estimateOpenAiCost(usage: { prompt_tokens?: number; completion_tokens?: number } | undefined) {
  if (!usage) return 0;
  return ((usage.prompt_tokens ?? 0) * 0.15 + (usage.completion_tokens ?? 0) * 0.6) / 1_000_000;
}

async function recordTrace(input: {
  scanId: string;
  stepType: string;
  stepName: string;
  inputJson?: unknown;
  outputJson?: unknown;
  latencyMs?: number;
  costUsd?: number;
  status?: string;
  error?: string;
}) {
  await prisma.scanTraceStep.create({
    data: {
      scanId: input.scanId,
      stepType: input.stepType,
      stepName: input.stepName,
      inputJson: json(input.inputJson),
      outputJson: input.outputJson === undefined ? undefined : json(input.outputJson),
      latencyMs: input.latencyMs,
      costUsd: input.costUsd,
      status: input.status ?? "done",
      error: input.error,
      finishedAt: new Date(),
    },
  });
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, latencyMs: Date.now() - started };
}

export async function createInitialScan(user: UserWithToken, repoInput: string) {
  const parsed = parseRepoInput(repoInput);
  if (!parsed) {
    throw new Error("Invalid repo input. Use owner/name or a GitHub URL.");
  }

  const started = Date.now();
  const octokit = createGitHubClient(user.githubAccessToken);
  const repoFetch = await timed(() => fetchRepoSummary(octokit, parsed.owner, parsed.name));
  const repo = await prisma.repo.upsert({
    where: { owner_name: { owner: repoFetch.value.owner, name: repoFetch.value.name } },
    create: {
      githubRepoId: BigInt(repoFetch.value.id),
      owner: repoFetch.value.owner,
      name: repoFetch.value.name,
      fullName: repoFetch.value.fullName,
      description: repoFetch.value.description,
      defaultBranch: repoFetch.value.defaultBranch,
      stars: repoFetch.value.stars,
      openIssuesCount: repoFetch.value.openIssuesCount,
      isPrivate: repoFetch.value.isPrivate,
      language: repoFetch.value.language,
      url: repoFetch.value.url,
    },
    update: {
      githubRepoId: BigInt(repoFetch.value.id),
      fullName: repoFetch.value.fullName,
      description: repoFetch.value.description,
      defaultBranch: repoFetch.value.defaultBranch,
      stars: repoFetch.value.stars,
      openIssuesCount: repoFetch.value.openIssuesCount,
      isPrivate: repoFetch.value.isPrivate,
      language: repoFetch.value.language,
      url: repoFetch.value.url,
    },
  });

  const scan = await prisma.scan.create({
    data: {
      userId: user.id,
      repoId: repo.id,
      status: "pending",
      stage: "created",
    },
  });

  try {
    await recordTrace({
      scanId: scan.id,
      stepType: "fetch_repo",
      stepName: "Fetched public repository metadata",
      inputJson: parsed,
      outputJson: repoFetch.value,
      latencyMs: repoFetch.latencyMs,
    });

    const [issuesFetch, prsFetch] = await Promise.all([
      timed(() => fetchOpenIssues(octokit, repoFetch.value.owner, repoFetch.value.name, 60)),
      timed(() => fetchOpenPullRequests(octokit, repoFetch.value.owner, repoFetch.value.name, 50)),
    ]);

    await Promise.all([
      recordTrace({
        scanId: scan.id,
        stepType: "fetch_issues",
        stepName: `Fetched ${issuesFetch.value.length} open issues`,
        outputJson: { count: issuesFetch.value.length },
        latencyMs: issuesFetch.latencyMs,
      }),
      recordTrace({
        scanId: scan.id,
        stepType: "fetch_prs",
        stepName: `Fetched ${prsFetch.value.length} open pull requests`,
        outputJson: { count: prsFetch.value.length },
        latencyMs: prsFetch.latencyMs,
      }),
    ]);

    const packet = buildAttentionPacket(repoFetch.value, issuesFetch.value, prsFetch.value);
    await recordTrace({
      scanId: scan.id,
      stepType: "analyze",
      stepName: "Built initial maintainer attention packet",
      inputJson: { issues: issuesFetch.value.length, prs: prsFetch.value.length },
      outputJson: packet.queueHealth,
    });

    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "ready",
        stage: "initial",
        issueCount: issuesFetch.value.length,
        prCount: prsFetch.value.length,
        summary: packet.summary,
        packetJson: json(packet),
        latencyMs: Date.now() - started,
      },
    });

    return { scanId: scan.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "error",
        error: message,
        latencyMs: Date.now() - started,
      },
    });
    await recordTrace({
      scanId: scan.id,
      stepType: "error",
      stepName: "Initial scan failed",
      status: "error",
      error: message,
    });
    throw error;
  }
}

function toPacket(value: unknown): AttentionPacket {
  return value as AttentionPacket;
}

function candidatePrNumbers(packet: AttentionPacket) {
  const ids = [...packet.topActions, ...packet.riskyPrs, ...packet.aiSlop, ...packet.docsReleaseImpact]
    .map((entry) => (entry.reference.startsWith("PR #") ? Number(entry.reference.replace("PR #", "")) : null))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return [...new Set(ids)].slice(0, 10);
}

function findPr(prs: PublicPullRequest[], number: number) {
  return prs.find((pr) => pr.number === number);
}

function hasDocsFile(files: PullRequestFile[]) {
  return files.some((file) => /(^|\/)(docs?|website)\//i.test(file.filename) || /(^|\/)README\.md$/i.test(file.filename));
}

function hasTestFile(files: PullRequestFile[]) {
  return files.some((file) => /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\./i.test(file.filename));
}

function sensitiveFiles(files: PullRequestFile[]) {
  return files
    .map((file) => file.filename)
    .filter((filename) => /\b(auth|security|token|secret|credential|rbac|admission|apiserver|kubelet|scheduler|controller|parser|config)\b/i.test(filename));
}

function enrichFromFiles(packet: AttentionPacket, prs: PublicPullRequest[], filesByPr: Map<number, PullRequestFile[]>) {
  const docsReleaseImpact: PacketItem[] = [...packet.docsReleaseImpact];
  const riskyPrs: PacketItem[] = [...packet.riskyPrs];

  for (const [number, files] of filesByPr.entries()) {
    const pr = findPr(prs, number);
    if (!pr) continue;

    const riskyFiles = sensitiveFiles(files);
    const docsTouched = hasDocsFile(files);
    const testsTouched = hasTestFile(files);
    const publicBehavior = /\b(api|flag|config|behavior|deprecat|breaking|feature gate|default)\b/i.test(`${pr.title}\n${pr.body}`);

    if (riskyFiles.length > 0 || (!testsTouched && files.length >= 6)) {
      riskyPrs.push({
        id: `pr:${number}:deep-risk`,
        type: "pr",
        reference: `PR #${number}`,
        title: pr.title,
        url: pr.url,
        score: Math.min(96, 72 + riskyFiles.length * 5 + (!testsTouched ? 8 : 0)),
        label: riskyFiles.length > 0 ? "Sensitive files touched" : "Large PR without test signal",
        why: "Deepening found file-level review risk that should be inspected before a maintainer spends time on the full diff.",
        evidence: [
          `${files.length} files inspected`,
          testsTouched ? "Tests touched" : "No test file detected in inspected files",
          riskyFiles.length > 0 ? `Sensitive files: ${riskyFiles.slice(0, 4).join(", ")}` : "No sensitive filename detected",
        ],
        nextStep: "Review file scope and ask for targeted tests or maintainer context before deeper review.",
      });
    }

    if (publicBehavior && !docsTouched) {
      docsReleaseImpact.push({
        id: `pr:${number}:deep-docs`,
        type: "pr",
        reference: `PR #${number}`,
        title: pr.title,
        url: pr.url,
        score: 78,
        label: "Docs/release impact likely",
        why: "Deepening found user-visible change language without docs files in the inspected PR files.",
        evidence: [`${files.length} files inspected`, "No docs/README file detected", "Behavior/config/API language detected"],
        nextStep: "Ask whether docs and release notes are required before merge review.",
      });
    }
  }

  return {
    ...packet,
    riskyPrs: dedupeItems(riskyPrs).sort((a, b) => b.score - a.score).slice(0, 12),
    docsReleaseImpact: dedupeItems(docsReleaseImpact).sort((a, b) => b.score - a.score).slice(0, 10),
  };
}

function dedupeItems(items: PacketItem[]) {
  return items.filter((item, index, entries) => entries.findIndex((candidate) => candidate.id === item.id) === index);
}

async function llmDeepNotes(context: ScanContext, packet: AttentionPacket, filesByPr: Map<number, PullRequestFile[]>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const fileContext = [...filesByPr.entries()].map(([number, files]) => ({
    pr: number,
    files: files.slice(0, 12).map((file) => ({
      filename: file.filename,
      status: file.status,
      patch: file.patch?.slice(0, 1200) ?? null,
    })),
  }));

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You analyze public GitHub issue and PR queues for overloaded OSS maintainers. Return strict JSON with a notes array of 3-6 short, practical maintainer observations. Be blunt about likely AI slop or missing AI disclosure, but do not recommend public shaming.",
      },
      {
        role: "user",
        content: JSON.stringify({
          repo: context.repo.fullName,
          queueHealth: packet.queueHealth,
          topActions: packet.topActions.slice(0, 8),
          fileContext,
        }),
      },
    ],
  });

  const content = response.choices[0]?.message.content ?? "{}";
  const parsed = JSON.parse(content) as { notes?: unknown };
  const notes = Array.isArray(parsed.notes) ? parsed.notes.map(String).filter(Boolean).slice(0, 6) : [];
  return {
    notes,
    costUsd: estimateOpenAiCost(response.usage),
  };
}

export async function deepenScan(user: UserWithToken, scanId: string) {
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, userId: user.id },
    include: { repo: true },
  });
  if (!scan) throw new Error("Scan not found");
  if (scan.status === "complete") return scan;
  if (scan.status === "deepening") return scan;
  if (scan.status === "error") throw new Error(scan.error ?? "Scan is in an error state");

  const started = Date.now();
  await prisma.scan.update({
    where: { id: scan.id },
    data: { status: "deepening" },
  });

  try {
    const octokit = createGitHubClient(user.githubAccessToken);
    const packet = toPacket(scan.packetJson);
    const [issues, prs] = await Promise.all([
      fetchOpenIssues(octokit, scan.repo.owner, scan.repo.name, 60),
      fetchOpenPullRequests(octokit, scan.repo.owner, scan.repo.name, 50),
    ]);

    const details = await Promise.all(
      candidatePrNumbers(packet).map(async (number) => {
        const [prDetails, files] = await Promise.all([
          fetchPullRequestDetails(octokit, scan.repo.owner, scan.repo.name, number).catch(() => null),
          fetchPullRequestFiles(octokit, scan.repo.owner, scan.repo.name, number).catch(() => []),
        ]);
        return { number, prDetails, files };
      })
    );

    const filesByPr = new Map<number, PullRequestFile[]>();
    for (const detail of details) {
      filesByPr.set(detail.number, detail.files);
    }

    await recordTrace({
      scanId: scan.id,
      stepType: "deepen_fetch",
      stepName: `Fetched file context for ${filesByPr.size} pull requests`,
      outputJson: {
        prs: [...filesByPr.entries()].map(([number, files]) => ({ number, files: files.length })),
      },
    });

    let enriched = enrichFromFiles(packet, prs, filesByPr);
    const llm = await llmDeepNotes({ repo: packet.repo, issues, prs }, enriched, filesByPr);
    enriched = {
      ...enriched,
      deepNotes: llm.notes,
      topActions: dedupeItems([...enriched.topActions, ...enriched.riskyPrs, ...enriched.docsReleaseImpact])
        .sort((a, b) => b.score - a.score)
        .slice(0, 12),
      summary: `${enriched.summary} Deep analysis added ${llm.notes.length} maintainer notes.`,
    };

    await recordTrace({
      scanId: scan.id,
      stepType: "deepen_llm",
      stepName: "Generated deep maintainer notes",
      inputJson: { candidates: candidatePrNumbers(packet) },
      outputJson: { notes: llm.notes },
      latencyMs: Date.now() - started,
      costUsd: llm.costUsd,
    });

    return prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "complete",
        stage: "deepened",
        summary: enriched.summary,
        packetJson: json(enriched),
        costUsd: llm.costUsd,
        latencyMs: (scan.latencyMs ?? 0) + Date.now() - started,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "error",
        error: message,
        latencyMs: (scan.latencyMs ?? 0) + Date.now() - started,
      },
    });
    await recordTrace({
      scanId: scan.id,
      stepType: "deepen_error",
      stepName: "Deep scan failed",
      status: "error",
      error: message,
    });
    throw error;
  }
}

export async function getScanForUser(userId: string, scanId: string) {
  return prisma.scan.findFirst({
    where: { id: scanId, userId },
    include: {
      repo: true,
      traceSteps: { orderBy: { startedAt: "asc" } },
    },
  });
}

type ScanRecord = NonNullable<Awaited<ReturnType<typeof getScanForUser>>>;

export function serializeScan(scan: ScanRecord) {
  return {
    id: scan.id,
    status: scan.status,
    stage: scan.stage,
    summary: scan.summary,
    issueCount: scan.issueCount,
    prCount: scan.prCount,
    costUsd: scan.costUsd,
    latencyMs: scan.latencyMs,
    packetJson: scan.packetJson,
    error: scan.error,
    createdAt: scan.createdAt.toISOString(),
    updatedAt: scan.updatedAt.toISOString(),
    completedAt: scan.completedAt?.toISOString() ?? null,
    repo: {
      id: scan.repo.id,
      githubRepoId: scan.repo.githubRepoId?.toString() ?? null,
      owner: scan.repo.owner,
      name: scan.repo.name,
      fullName: scan.repo.fullName,
      description: scan.repo.description,
      defaultBranch: scan.repo.defaultBranch,
      stars: scan.repo.stars,
      openIssuesCount: scan.repo.openIssuesCount,
      isPrivate: scan.repo.isPrivate,
      language: scan.repo.language,
      url: scan.repo.url,
      createdAt: scan.repo.createdAt.toISOString(),
      updatedAt: scan.repo.updatedAt.toISOString(),
    },
    traceSteps: scan.traceSteps.map((step) => ({
      id: step.id,
      stepType: step.stepType,
      stepName: step.stepName,
      status: step.status,
      inputJson: step.inputJson,
      outputJson: step.outputJson,
      latencyMs: step.latencyMs,
      costUsd: step.costUsd,
      error: step.error,
      startedAt: step.startedAt.toISOString(),
      finishedAt: step.finishedAt?.toISOString() ?? null,
    })),
  };
}
