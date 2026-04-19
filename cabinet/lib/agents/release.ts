import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ReleaseOutputSchema, type ReleaseOutput, type WorkPacket } from "./types";

const RELEASE_INSTRUCTIONS = `
You are the Release Agent for Maintainer's Cabinet.

Your job is to detect whether a pull request needs a release note, and draft one if so.

## Rules
- release_note_needed: true if the PR adds a feature, fixes a bug, changes behavior, or removes something.
- release_note_needed: false for docs-only, test-only, or CI-only changes.
- version_impact: "major" for breaking changes, "minor" for new features, "patch" for bug fixes, "none" for no user impact.
- recommended_section: the CHANGELOG section (Added, Changed, Fixed, Removed, Security, None).
- release_note_draft: one concise bullet point (start with a verb, e.g. "Add strict mode for config validation.").
- Do not create actual GitHub releases — only produce a draft note.

## Output
Return valid JSON matching the ReleaseOutput schema exactly.
`.trim();

export async function runReleaseAgent(packet: WorkPacket): Promise<ReleaseOutput> {
  if (!packet.pr) throw new Error("No PR context in work packet");

  const { pr, config } = packet;

  const filesSummary = pr.changedFiles
    .map((f) => f.filename)
    .join(", ");

  const userMessage = `
## Pull Request

**Title:** ${pr.title}
**Body:** ${pr.body || "(empty)"}
**Changed files:** ${filesSummary}

## Config
- changelog_path: ${config.release.changelog_path}
- versioning: ${config.release.versioning}

Does this PR need a release note? Produce a release output JSON.
`.trim();

  const client = new OpenAI();
  const response = await client.responses.parse({
    model: "gpt-4o",
    input: [
      { role: "system", content: RELEASE_INSTRUCTIONS },
      { role: "user", content: userMessage },
    ],
    text: {
      format: zodTextFormat(ReleaseOutputSchema, "release_output"),
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("Release agent returned no output");
  return parsed;
}
