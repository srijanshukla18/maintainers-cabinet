import { Agent, run } from "@openai/agents";
import { BriefingOutputSchema, type BriefingOutput, type PriorityOutput, type PrReviewOutput, type TriageOutput } from "./types";
import type { PublicIssue, PublicPR, PublicRepo } from "../github/public";
import { type AgentTrace, extractUsage } from "./triage";

const BRIEFING_INSTRUCTIONS = `
You are the Briefing Agent for Maintainer's Cabinet.

Your job is to write the maintainer's morning email. Calm, clear, scannable. Not marketing copy.

## Style
- Tone: peer-to-peer, like a trusted chief of staff. No hype. No emojis.
- Opening: one sentence greeting + the headline. Example: "Good morning. 3 things need you today."
- top_actions: one heading + 2-3 sentence body per item. Include the GitHub URL.
- queue_summary: 2-4 lines of numbers. E.g. "Open issues: 247 (12 triaged since yesterday). Open PRs: 53 (8 ready for review, 5 awaiting author)."
- closing: one-line sign off. Not "Warmly," — "— Cabinet" is fine.

## Do NOT
- Invent numbers or items not in the priorities input.
- Praise the maintainer.
- Use bullet characters like • — use text or plain hyphens.
- Use emojis.

## Subject line
- Format: "Morning Brief for {owner}/{repo} — {short headline}"
- Keep subject under 80 chars.
`.trim();

const briefingAgent = new Agent({
  name: "Briefing Agent",
  instructions: BRIEFING_INSTRUCTIONS,
  model: "gpt-4o",
  outputType: BriefingOutputSchema,
});

function buildBriefingMessage(repo: PublicRepo, priority: PriorityOutput): string {
  const itemsSummary = priority.items
    .map((i) => `- [${i.priority}] ${i.reference} "${i.title}" (score ${i.score}) — ${i.reason}. Action: ${i.action}. URL: ${i.url}`)
    .join("\n");

  return `
## Repo
${repo.owner}/${repo.name}

## Priority items to cover
${priority.summary_line}

${itemsSummary}

## Queue health
Open issues: ${priority.queue_health.open_issues}
Open PRs: ${priority.queue_health.open_prs}
Stale PRs: ${priority.queue_health.stale_prs}
Ready to merge: ${priority.queue_health.ready_to_merge}
Needs triage: ${priority.queue_health.needs_triage}
Security flags: ${priority.queue_health.security_flags}

Write the morning brief. Return a BriefingOutput JSON.
`.trim();
}

export async function runBriefingAgent(
  repo: PublicRepo,
  priority: PriorityOutput
): Promise<BriefingOutput> {
  const result = await run(briefingAgent, buildBriefingMessage(repo, priority), { maxTurns: 3 });
  const output = result.finalOutput as BriefingOutput | undefined;
  if (!output) throw new Error("Briefing agent returned no output");
  return output;
}

export async function runBriefingAgentDetailed(
  repo: PublicRepo,
  priority: PriorityOutput
): Promise<AgentTrace<BriefingOutput>> {
  const prompt = buildBriefingMessage(repo, priority);
  const result = await run(briefingAgent, prompt, { maxTurns: 3 });
  const output = result.finalOutput as BriefingOutput | undefined;
  if (!output) throw new Error("Briefing agent returned no output");

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

// ── Rendering ────────────────────────────────────────────────────────────────

export function renderBriefMarkdown(
  brief: BriefingOutput,
  issues: Array<PublicIssue & { triage?: TriageOutput }>,
  prs: Array<PublicPR & { review?: PrReviewOutput }>
): string {
  const lines: string[] = [];
  lines.push(brief.opening);
  lines.push("");

  for (const [idx, action] of brief.top_actions.entries()) {
    lines.push(`## ${idx + 1}. ${action.heading}`);
    lines.push("");
    lines.push(action.body);
    if (action.url) {
      lines.push("");
      lines.push(`[Open on GitHub →](${action.url})`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("**Queue snapshot**");
  lines.push("");
  lines.push(brief.queue_summary);
  lines.push("");
  lines.push("**Full issue queue**");
  lines.push("");
  for (const issue of issues) {
    const triage = issue.triage
      ? `${issue.triage.classification} ${Math.round(issue.triage.confidence * 100)}%`
      : "scanned";
    lines.push(`- #${issue.number} ${issue.title} — ${triage}`);
  }
  lines.push("");
  lines.push("**Full PR queue**");
  lines.push("");
  for (const pr of prs) {
    const review = pr.review ? `risk:${pr.review.risk}` : `ci:${pr.statusCheckRollup ?? "unknown"}`;
    lines.push(`- PR #${pr.number} ${pr.title} — ${review}`);
  }
  lines.push("");
  lines.push(brief.closing);
  return lines.join("\n");
}

export function renderBriefHtml(
  brief: BriefingOutput,
  traceUrl: string,
  issues: Array<PublicIssue & { triage?: TriageOutput }>,
  prs: Array<PublicPR & { review?: PrReviewOutput }>
): string {
  const actionsHtml = brief.top_actions
    .map(
      (a, i) => `
      <div style="margin:24px 0;padding:16px;border-left:3px solid #6366f1;background:#f9fafb;border-radius:4px;">
        <h3 style="margin:0 0 8px 0;font-size:16px;color:#111827;">${i + 1}. ${escapeHtml(a.heading)}</h3>
        <p style="margin:0 0 12px 0;color:#374151;line-height:1.6;">${escapeHtml(a.body).replace(/\n/g, "<br>")}</p>
        ${a.url ? `<a href="${a.url}" style="color:#6366f1;text-decoration:none;font-size:14px;">Open on GitHub →</a>` : ""}
      </div>
    `
    )
    .join("");

  const issueRows = issues
    .map((issue) => {
      const triage = issue.triage
        ? `${issue.triage.classification} · ${Math.round(issue.triage.confidence * 100)}%`
        : "scanned";
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><a href="${issue.url}" style="color:#111827;text-decoration:none;">#${issue.number} ${escapeHtml(issue.title)}</a></td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">${escapeHtml(triage)}</td></tr>`;
    })
    .join("");

  const prRows = prs
    .map((pr) => {
      const review = pr.review ? `risk:${pr.review.risk}` : `ci:${pr.statusCheckRollup ?? "unknown"}`;
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><a href="${pr.url}" style="color:#111827;text-decoration:none;">PR #${pr.number} ${escapeHtml(pr.title)}</a></td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">${escapeHtml(review)}</td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827;line-height:1.6;">
  <p style="font-size:16px;margin:0 0 24px 0;">${escapeHtml(brief.opening)}</p>
  ${actionsHtml}
  <hr style="margin:32px 0;border:0;border-top:1px solid #e5e7eb;">
  <h4 style="margin:0 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Queue snapshot</h4>
  <p style="color:#374151;white-space:pre-wrap;margin:0 0 24px 0;">${escapeHtml(brief.queue_summary)}</p>
  <h4 style="margin:24px 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Full issue queue</h4>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${issueRows}</table>
  <h4 style="margin:24px 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Full PR queue</h4>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${prRows}</table>
  <p style="color:#6b7280;font-size:14px;margin:24px 0 0 0;">${escapeHtml(brief.closing)}</p>
  <p style="color:#9ca3af;font-size:12px;margin:32px 0 0 0;">
    <a href="${traceUrl}" style="color:#9ca3af;">View full trace →</a>
  </p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
