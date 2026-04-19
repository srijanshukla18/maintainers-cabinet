import { Agent, run } from "@openai/agents";
import { ReleaseOutputSchema, type ReleaseOutput, type WorkPacket } from "./types";

const RELEASE_INSTRUCTIONS = `
You are the Release Agent for Maintainer's Cabinet.

Your job is to detect whether a pull request needs a release note, and draft one if so.

## Rules
- release_note_needed: true if the PR adds a feature, fixes a bug, changes behavior, or removes something user-facing.
- release_note_needed: false for docs-only, test-only, or CI-only changes.
- version_impact: "major" for breaking changes, "minor" for new features, "patch" for bug fixes, "none" for no user impact.
- recommended_section: the CHANGELOG section (Added, Changed, Fixed, Removed, Security, None).
- release_note_draft: one concise bullet point starting with a verb, e.g. "Fix null dereference in session expiry check."
- Do not create actual GitHub releases — only produce a draft note.
`.trim();

const releaseAgent = new Agent({
  name: "Release Agent",
  instructions: RELEASE_INSTRUCTIONS,
  model: "gpt-4o",
  outputType: ReleaseOutputSchema,
});

export async function runReleaseAgent(packet: WorkPacket): Promise<ReleaseOutput> {
  if (!packet.pr) throw new Error("No PR context in work packet");

  const { pr, config } = packet;

  const filesSummary = pr.changedFiles.map((f) => f.filename).join(", ");

  const userMessage = `
## Pull Request

**Title:** ${pr.title}
**Body:** ${pr.body || "(empty)"}
**Changed files:** ${filesSummary || "(none listed)"}

## Config
- changelog_path: ${config.release.changelog_path}
- versioning: ${config.release.versioning}
`.trim();

  const result = await run(releaseAgent, userMessage);

  const output = result.finalOutput as ReleaseOutput;
  if (!output) throw new Error("Release agent returned no output");
  return output;
}
