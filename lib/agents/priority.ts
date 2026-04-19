import { Agent, run } from "@openai/agents";
import { PriorityOutputSchema, type PriorityOutput } from "./types";
import type { PublicIssue, PublicPR, PublicRepo } from "../github/public";
import type { TriageOutput, PrReviewOutput } from "./types";
import { type AgentTrace, extractUsage } from "./triage";
import type { RepoMemorySnapshot } from "../briefs/memory";

const PRIORITY_INSTRUCTIONS = `
You are the Priority Agent for Maintainer's Cabinet.

Your job is to look across the whole repo's open queue and rank what the maintainer should do TODAY.

## Inputs you receive
- Repo metadata (stars, description, language)
- List of open issues (with Cabinet triage output: classification, labels, confidence)
- List of open PRs (with Cabinet PR review output: risk, findings) + staleness, CI status, review decision
- Recent commits

## Rules
- Pick the top 3-7 items that actually need the maintainer's attention today.
- "do_today" = urgent: security, regression, PR ready to merge, hostile thread.
- "this_week" = important but not critical.
- "watch" = keep an eye on, no action needed now.
- Score 0-100 = your confidence the maintainer should act. Security and ready-to-merge PRs get high scores.
- Each item needs a clear "action" line: "Review PR #340", "Triage #101 (regression)", etc.
- "reason" should be short and evidence-based. No fluff.
- Compute queue_health numerically from the input data.
- summary_line is a one-sentence top-of-email hook like: "3 things need you today: a security report, a stalled PR, and an unhappy user."

## Do NOT
- Invent issues/PRs that aren't in the input.
- Reference private data.
- Tell the maintainer to close/merge things — they decide that. You only surface.
`.trim();

const priorityAgent = new Agent({
  name: "Priority Agent",
  instructions: PRIORITY_INSTRUCTIONS,
  model: "gpt-4o",
  outputType: PriorityOutputSchema,
});

export interface PriorityInput {
  repo: PublicRepo;
  issues: Array<PublicIssue & { triage?: TriageOutput }>;
  prs: Array<PublicPR & { review?: PrReviewOutput }>;
  recentCommitSummary: string;
  memory?: RepoMemorySnapshot;
}

function buildPriorityMessage(input: PriorityInput): string {
  const issuesSummary = input.issues
    .slice(0, 30)
    .map((i) => {
      const t = i.triage;
      return `#${i.number} "${i.title}" | author:${i.author} | labels:[${i.labels.join(",")}] | comments:${i.comments} | ${t ? `triage:${t.classification}(${Math.round(t.confidence * 100)}%) rec:${t.recommended_action}` : "not-triaged"}`;
    })
    .join("\n");

  const prsSummary = input.prs
    .slice(0, 30)
    .map((p) => {
      const r = p.review;
      const stale = p.daysStale > 7 ? ` STALE(${p.daysStale}d)` : "";
      const ci = p.statusCheckRollup ? ` ci:${p.statusCheckRollup}` : "";
      const rev = p.reviewDecision ? ` review:${p.reviewDecision}` : "";
      return `PR #${p.number} "${p.title}" | author:${p.author} | ${p.additions}+/${p.deletions}- in ${p.changedFiles} files${stale}${ci}${rev} | ${r ? `risk:${r.risk}` : "not-reviewed"}`;
    })
    .join("\n");

  return `
## Repo
${input.repo.owner}/${input.repo.name} (${input.repo.language ?? "unknown lang"}, ★${input.repo.stars})
${input.repo.description ?? ""}

## Open Issues (${input.issues.length})
${issuesSummary || "(none)"}

## Open PRs (${input.prs.length})
${prsSummary || "(none)"}

## Recent commits
${input.recentCommitSummary}
${input.memory ? `
## Memory from previous briefs
- Last brief: ${input.memory.lastBriefAt ?? "none"}
- Last summary: ${input.memory.lastBriefSummary ?? "none"}
- Recurring themes: ${input.memory.recurringThemes.join(", ") || "none"}
- Previous actions recommended: ${input.memory.previousActions.join("; ") || "none"}
- Top contributors: ${input.memory.topContributors.map((c) => `${c.login}(${c.count})`).join(", ") || "none"}
- Known issue types: ${Object.entries(input.memory.knownIssueTypes).map(([k, v]) => `${k}:${v}`).join(", ") || "none"}

Use this memory to avoid repeating the same recommendations and to notice patterns (e.g. "stale PRs flagged 3 briefs in a row").
` : ""}
Produce a PriorityOutput JSON. Be decisive — pick 3-7 items that matter today.
`.trim();
}

export async function runPriorityAgent(input: PriorityInput): Promise<PriorityOutput> {
  const result = await run(priorityAgent, buildPriorityMessage(input), { maxTurns: 3 });
  const output = result.finalOutput as PriorityOutput | undefined;
  if (!output) throw new Error("Priority agent returned no output");
  return output;
}

export async function runPriorityAgentDetailed(input: PriorityInput): Promise<AgentTrace<PriorityOutput>> {
  const prompt = buildPriorityMessage(input);
  const result = await run(priorityAgent, prompt, { maxTurns: 3 });
  const output = result.finalOutput as PriorityOutput | undefined;
  if (!output) throw new Error("Priority agent returned no output");

  return {
    output,
    trace: {
      input: prompt,
      history: (result as { history?: unknown }).history ?? null,
      newItems: (result as { newItems?: unknown }).newItems ?? null,
      lastAgent: (result as { lastAgent?: { name?: string } }).lastAgent?.name ?? null,
    },
    usage: extractUsage(result),
  };
}
