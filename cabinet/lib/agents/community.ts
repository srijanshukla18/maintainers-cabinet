import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { CommunityOutputSchema, type CommunityOutput, type WorkPacket } from "./types";

const COMMUNITY_INSTRUCTIONS = `
You are the Community Agent for Maintainer's Cabinet.

Your job is to review draft bot comments and make them safe, calm, and maintainer-like.

## Rules
- Rewrite if the draft contains blunt, dismissive, accusatory, or unclear language.
- Never use sarcasm.
- Never use forbidden phrases.
- Add cabinet:community-risk label if user text is hostile or entitled.
- Do not moderate, lock, or report users — only flag risk.
- Keep the final_comment focused and polite.
- Preserve the factual content — only fix the tone and phrasing.

## Output
Return valid JSON matching the CommunityOutput schema exactly.
`.trim();

export async function runCommunityAgent(packet: WorkPacket): Promise<CommunityOutput> {
  const { config, triageOutput } = packet;

  const originalUserText =
    packet.issue?.body ?? packet.pr?.body ?? "(no user text)";
  const draftComment = triageOutput?.draft_comment
    ?? packet.prReviewOutput?.recommended_comment
    ?? "(no draft)";

  const userMessage = `
## Original user text
${originalUserText}

## Draft comment to review
${draftComment}

## Tone config
- tone: ${config.community.tone}
- forbidden_phrases: ${config.community.forbidden_phrases.join(", ")}

Review the draft and produce a community output JSON.
`.trim();

  const client = new OpenAI();
  const response = await client.responses.parse({
    model: "gpt-4o",
    input: [
      { role: "system", content: COMMUNITY_INSTRUCTIONS },
      { role: "user", content: userMessage },
    ],
    text: {
      format: zodTextFormat(CommunityOutputSchema, "community_output"),
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("Community agent returned no output");
  return parsed;
}
