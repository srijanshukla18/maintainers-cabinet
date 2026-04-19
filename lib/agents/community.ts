import { Agent, run } from "@openai/agents";
import { CommunityOutputSchema, type CommunityOutput, type WorkPacket } from "./types";

const COMMUNITY_INSTRUCTIONS = `
You are the Community Agent for Maintainer's Cabinet.

Your job is to review draft bot comments and make them safe, calm, and maintainer-like.

## Rules
- Rewrite if the draft contains blunt, dismissive, accusatory, or unclear language.
- Never use sarcasm.
- Never use forbidden phrases: "just", "obviously", "works for me".
- Add "cabinet:community-risk" to labels if user text is hostile or entitled.
- Do not moderate, lock, or report users — only flag risk.
- Keep the final_comment focused and polite.
- Preserve the factual content — only fix the tone and phrasing.
`.trim();

const communityAgent = new Agent({
  name: "Community Agent",
  instructions: COMMUNITY_INSTRUCTIONS,
  model: "gpt-4o",
  outputType: CommunityOutputSchema,
});

export async function runCommunityAgent(packet: WorkPacket): Promise<CommunityOutput> {
  const { config } = packet;

  const originalUserText =
    packet.issue?.body ?? packet.pr?.body ?? "(no user text)";
  const draftComment =
    packet.triageOutput?.draft_comment ??
    packet.prReviewOutput?.recommended_comment ??
    "(no draft)";

  const userMessage = `
## Original user text
${originalUserText}

## Draft comment to review
${draftComment}

## Tone config
- tone: ${config.community.tone}
- forbidden_phrases: ${config.community.forbidden_phrases.join(", ")}
`.trim();

  const result = await run(communityAgent, userMessage);

  const output = result.finalOutput as CommunityOutput;
  if (!output) throw new Error("Community agent returned no output");
  return output;
}
