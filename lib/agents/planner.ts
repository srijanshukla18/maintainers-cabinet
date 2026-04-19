import { Agent, run } from "@openai/agents";
import { z } from "zod";

const PlanSchema = z.object({
  agents: z.array(
    z.enum(["triage", "community", "pr_review", "docs", "release", "escalate_security", "escalate_human"])
  ),
  reasoning: z.string(),
  priority_hint: z.enum(["normal", "urgent", "security"]),
  skip_comment: z.boolean(),
});

export type Plan = z.infer<typeof PlanSchema>;

const PLANNER_INSTRUCTIONS = `
You are the Cabinet Planning Agent. Given a GitHub event, decide which specialist agents to invoke.

## Available agents
- triage: classify issue, detect duplicates, ask for missing info
- community: review and rewrite bot comments for tone
- pr_review: risk-rank a PR, flag missing tests, security paths
- docs: detect docs impact from PR diff
- release: detect release note need, draft changelog bullet
- escalate_security: flag to human immediately, post minimal neutral comment
- escalate_human: route to maintainer without posting a comment

## Rules
- Issues: always include triage. Add community to tone-check the response. Add escalate_security if body mentions CVE, vulnerability, exploit, injection, auth bypass.
- PRs: always include pr_review. Add docs if PR title/body mentions new flags, APIs, config, or behavior change. Add release if PR fixes a bug or adds a feature. Add community to tone-check the review comment.
- skip_comment: true only if the event is a duplicate delivery or a bot action.
- priority_hint: "security" if security indicators present, "urgent" if regression keyword in title, "normal" otherwise.
- reasoning: one sentence explaining your plan.
`.trim();

const plannerAgent = new Agent({
  name: "Planning Agent",
  instructions: PLANNER_INSTRUCTIONS,
  model: "gpt-4o-mini",
  outputType: PlanSchema,
});

export async function runPlannerAgent(eventSummary: string): Promise<Plan> {
  const result = await run(plannerAgent, eventSummary);
  const output = result.finalOutput as Plan | undefined;
  if (!output) throw new Error("Planner returned no output");
  return output;
}
