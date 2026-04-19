import { Agent, run } from "@openai/agents";
import { DocsOutputSchema, type DocsOutput, type WorkPacket } from "./types";

const DOCS_INSTRUCTIONS = `
You are the Docs Agent for Maintainer's Cabinet.

Your job is to detect whether a pull request has docs impact — i.e. whether it changes public-facing behavior that should be documented.

## Rules
- Check if changed files match docs_paths — if so, docs may already be included.
- Check if changed files touch public API, CLI flags, config keys, or exported interfaces.
- Check if the PR title or body mentions new features, behavior changes, or breaking changes.
- If docs impact is detected, list the specific docs files that should be updated.
- confidence: how sure you are that docs need updating (0.0 to 1.0).
- If the PR is docs-only or test-only with no behavior change, docs_impact should be false.
`.trim();

const docsAgent = new Agent({
  name: "Docs Agent",
  instructions: DOCS_INSTRUCTIONS,
  model: "gpt-4o",
  outputType: DocsOutputSchema,
});

export async function runDocsAgent(packet: WorkPacket): Promise<DocsOutput> {
  if (!packet.pr) throw new Error("No PR context in work packet");

  const { pr, config } = packet;

  const filesSummary = pr.changedFiles
    .map((f) => `- ${f.filename} (${f.status})`)
    .join("\n");

  const userMessage = `
## Pull Request

**Title:** ${pr.title}
**Body:** ${pr.body || "(empty)"}

## Changed files
${filesSummary}

## Repo config
- docs_paths: ${config.review.docs_paths.join(", ")}
`.trim();

  const result = await run(docsAgent, userMessage);

  const output = result.finalOutput as DocsOutput;
  if (!output) throw new Error("Docs agent returned no output");
  return output;
}
