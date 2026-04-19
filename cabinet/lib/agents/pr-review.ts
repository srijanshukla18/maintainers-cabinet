import { Agent, run } from "@openai/agents";
import { PrReviewOutputSchema, type PrReviewOutput, type WorkPacket } from "./types";

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
- risk levels: low = trivial/docs-only, medium = needs review, high = risky without tests or context.
`.trim();

const prReviewAgent = new Agent({
  name: "PR Review Agent",
  instructions: PR_REVIEW_INSTRUCTIONS,
  model: "gpt-4o",
  outputType: PrReviewOutputSchema,
});

export async function runPrReviewAgent(packet: WorkPacket): Promise<PrReviewOutput> {
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

  const userMessage = `
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

  const result = await run(prReviewAgent, userMessage);

  const output = result.finalOutput as PrReviewOutput;
  if (!output) throw new Error("PR Review agent returned no output");
  return output;
}
