import { Agent, run } from "@openai/agents";
import { PrReviewOutputSchema, type PrReviewOutput, type WorkPacket } from "./types";
import { type AgentTrace, extractUsage } from "./triage";

const PR_REVIEW_INSTRUCTIONS = `
You are the PR Review Agent for Maintainer's Cabinet.

Your job is to produce a lightweight, structured review summary for a pull request.

## Rules
- Never approve or request changes — only summarize.
- Do not claim tests pass unless CI explicitly says they pass.
- Flag missing tests for files matching risky_paths or require_tests_for patterns.
- Flag large PRs with low context (empty body, many files, no description).
- Flag security-sensitive changes touching auth, config, or parser paths.
- findings must be specific: include file and evidence where possible.
- risk levels: low = docs-only changes or a small well-explained fix with tests and green CI; medium = needs review but has enough context; high = large or sensitive change with missing context and/or no test evidence.
- labels MUST use the exact cabinet label names with the "cabinet:" prefix.
- Valid labels are ONLY: cabinet:review-needed, cabinet:docs-needed, cabinet:release-note-needed.
- Do not invent labels like "bugfix", "parser", "security", or "documentation".
- Add cabinet:review-needed when the PR is not low risk.
- Add cabinet:docs-needed when behavior changes introduce a new flag, API, config behavior, or user-visible workflow that is not already documented in changed docs files.
- Add cabinet:release-note-needed when the PR adds a user-visible feature or behavior change.
`.trim();

const prReviewAgent = new Agent({
  name: "PR Review Agent",
  instructions: PR_REVIEW_INSTRUCTIONS,
  model: "gpt-4o",
  outputType: PrReviewOutputSchema,
});

function buildPrReviewMessage(packet: WorkPacket): string {
  if (!packet.pr) throw new Error("No PR context in work packet");

  const { pr, config } = packet;

  const filesSummary = pr.changedFiles
    .map((f) => `- ${f.filename} (${f.status})`)
    .join("\n");

  const patchSample = pr.changedFiles
    .slice(0, 5)
    .map((f) =>
      f.patch
        ? `### ${f.filename}\n\`\`\`diff\n${f.patch.slice(0, 800)}\n\`\`\``
        : `### ${f.filename}\n(no patch)`
    )
    .join("\n\n");

  return `
## Pull Request

**Title:** ${pr.title}
**Body:** ${pr.body || "(empty)"}
**Author:** ${pr.author}
**CI status:** ${pr.ciStatus ?? "unknown"}

## Changed files (${pr.changedFiles.length})
${filesSummary}

## Patch sample
${patchSample}

## Repo config
- require_tests_for: ${config.review.require_tests_for.join(", ")}
- docs_paths: ${config.review.docs_paths.join(", ")}
- risky_paths: ${config.review.risky_paths.join(", ")}
`.trim();
}

export async function runPrReviewAgent(packet: WorkPacket): Promise<PrReviewOutput> {
  const result = await run(prReviewAgent, buildPrReviewMessage(packet));

  const output = result.finalOutput as PrReviewOutput;
  if (!output) throw new Error("PR Review agent returned no output");
  return normalizePrReviewOutput(packet, output);
}

export async function runPrReviewAgentDetailed(packet: WorkPacket): Promise<AgentTrace<PrReviewOutput>> {
  const input = buildPrReviewMessage(packet);
  const result = await run(prReviewAgent, input);
  const output = result.finalOutput as PrReviewOutput | undefined;
  if (!output) throw new Error("PR Review agent returned no output");

  return {
    output: normalizePrReviewOutput(packet, output),
    trace: {
      input,
      history: (result as { history?: unknown }).history ?? null,
      newItems: (result as { newItems?: unknown }).newItems ?? null,
      lastAgent: (result as { lastAgent?: { name?: string } }).lastAgent?.name ?? null,
    },
    usage: extractUsage(result),
  };
}

function normalizePrReviewOutput(packet: WorkPacket, output: PrReviewOutput): PrReviewOutput {
  if (!packet.pr) return output;

  const analysis = analyzePr(packet);
  const labels = new Set<string>();

  if (analysis.risk !== "low") labels.add("cabinet:review-needed");
  if (analysis.docsImpact) labels.add("cabinet:docs-needed");
  if (analysis.releaseNoteNeeded) labels.add("cabinet:release-note-needed");

  return {
    ...output,
    risk: analysis.risk,
    labels: Array.from(labels),
  };
}

function analyzePr(packet: WorkPacket): {
  risk: PrReviewOutput["risk"];
  docsImpact: boolean;
  releaseNoteNeeded: boolean;
} {
  if (!packet.pr) {
    return { risk: "medium", docsImpact: false, releaseNoteNeeded: false };
  }

  const { pr, config } = packet;
  const filenames = pr.changedFiles.map((file) => file.filename);
  const body = pr.body.trim();
  const titleAndBody = `${pr.title}\n${body}`;
  const changedCount = pr.changedFiles.length;
  const docsOnly = filenames.length > 0 && filenames.every((name) => matchesAnyPattern(name, config.review.docs_paths));
  const touchesRisky = filenames.some((name) => matchesAnyPattern(name, config.review.risky_paths));
  const hasTests = filenames.some(isTestFile);
  const hasContext = body.length >= 20;
  const ciSuccess = pr.ciStatus === "success";
  const lowContext = body.length === 0;
  const isLarge = changedCount >= 5;
  const mentionsBehaviorChange = /\b(flag|api|config|behavior|strict mode|strict validation|user-visible|new option|new command|new setting)\b/i.test(titleAndBody);
  const mentionsFeature = /\b(add|adds|added|introduce|introduces|new)\b/i.test(titleAndBody);
  const isBugFix = /\bfix|fixes|fixed|bug|regression|null dereference|null pointer|guard clause\b/i.test(titleAndBody);

  let risk: PrReviewOutput["risk"] = "medium";
  if (docsOnly) {
    risk = "low";
  } else if (lowContext && (isLarge || touchesRisky)) {
    risk = "high";
  } else if (hasTests && ciSuccess && changedCount <= 2 && hasContext && !mentionsBehaviorChange) {
    risk = "low";
  }

  const docsChanged = filenames.some((name) => matchesAnyPattern(name, config.review.docs_paths));
  const docsImpact = !docsChanged && !docsOnly && (mentionsBehaviorChange || /--[a-z0-9-]+/i.test(titleAndBody));
  const releaseNoteNeeded = !docsOnly && !docsChanged && !isBugFix && (mentionsBehaviorChange || mentionsFeature);

  return {
    risk,
    docsImpact,
    releaseNoteNeeded,
  };
}

function matchesAnyPattern(filename: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(filename, pattern));
}

function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    return filename.startsWith(pattern.slice(0, -2));
  }

  return filename === pattern;
}

function isTestFile(filename: string): boolean {
  return /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\./i.test(filename);
}
