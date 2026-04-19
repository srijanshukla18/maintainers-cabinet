import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import BriefActions from "./actions";
import TraceFlow from "./trace-flow";
import type { BriefContextJson, BriefPriorityJson } from "@/lib/briefs/generate";

export const dynamic = "force-dynamic";

const PRIORITY_COLOR: Record<string, string> = {
  do_today: "border-red-800/60 bg-red-950/30 text-red-300",
  this_week: "border-amber-800/60 bg-amber-950/30 text-amber-300",
  watch: "border-slate-700 bg-slate-900 text-slate-400",
};


export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const brief = await prisma.brief.findUnique({
    where: { id },
    include: {
      repo: true,
      traceSteps: { orderBy: { startedAt: "asc" } },
    },
  });

  if (!brief) notFound();

  const priorities = brief.prioritiesJson as unknown as BriefPriorityJson;
  const context = brief.contextJson as unknown as BriefContextJson;
  const issues = context.issues ?? [];
  const prs = context.prs ?? [];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.10),transparent_22%),linear-gradient(180deg,#020617_0%,#020617_55%,#010409_100%)] text-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-4 flex items-center justify-between gap-6">
          <div>
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-300 font-mono">← mission control</Link>
            <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-400 font-mono mt-3 mb-2">
              Morning Brief · {brief.repo.owner}/{brief.repo.name}
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-white leading-tight mb-2">
              {brief.subject}
            </h1>
            <div className="flex items-center gap-3 text-xs text-slate-500 font-mono flex-wrap">
              <span>{formatDate(brief.generatedAt)}</span>
              {brief.latencyMs && <span>· {(brief.latencyMs / 1000).toFixed(1)}s total</span>}
              <span>· {brief.traceSteps.length} trace steps</span>
              {brief.emailSentAt && <span className="text-emerald-400">sent to {brief.emailRecipient}</span>}
            </div>
          </div>

          <div className="min-w-[280px] rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-mono mb-3">Brief Controls</div>
            <BriefActions briefId={brief.id} alreadySent={!!brief.emailSentAt} />
            <div className="mt-4 space-y-2 text-xs font-mono text-slate-500">
              <div className="flex items-center justify-between"><span>Issues scanned</span><span className="text-white">{context.issuesCount}</span></div>
              <div className="flex items-center justify-between"><span>PRs scanned</span><span className="text-white">{context.prsCount}</span></div>
              <div className="flex items-center justify-between"><span>Triaged</span><span className="text-violet-300">{context.triagedCount}</span></div>
              <div className="flex items-center justify-between"><span>Reviewed</span><span className="text-amber-300">{context.reviewedCount}</span></div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 mb-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-[0_0_80px_rgba(2,6,23,0.35)]">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500 font-mono mb-3">Today&apos;s Priorities</div>
            <p className="text-lg text-slate-200 mb-6">{priorities.summary_line}</p>
            <div className="space-y-4">
              {priorities.items.map((item, i) => (
                <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-slate-500">{item.reference}</span>
                      <span className={`text-[11px] uppercase tracking-[0.2em] px-2 py-1 rounded-full border ${PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.watch}`}>
                        {item.priority.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] font-mono text-cyan-300">score {item.score}</span>
                    </div>
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 shrink-0">GitHub →</a>
                  </div>
                  <div className="text-lg text-white font-medium mb-2">{item.title}</div>
                  <div className="text-sm text-slate-400 mb-2">{item.reason}</div>
                  <div className="text-sm font-mono text-cyan-300">→ {item.action}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-[0_0_80px_rgba(2,6,23,0.35)]">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500 font-mono mb-3">Queue Telemetry</div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <QueueStat label="Open issues" value={priorities.queue_health.open_issues} />
              <QueueStat label="Open PRs" value={priorities.queue_health.open_prs} />
              <QueueStat label="Stale PRs" value={priorities.queue_health.stale_prs} tone="warn" />
              <QueueStat label="Ready to merge" value={priorities.queue_health.ready_to_merge} tone="good" />
              <QueueStat label="Needs triage" value={priorities.queue_health.needs_triage} tone="warn" />
              <QueueStat label="Security flags" value={priorities.queue_health.security_flags} tone="danger" />
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-mono mb-2">Recent commits sampled</div>
              <div className="space-y-2">
                {context.commits.slice(0, 5).map((commit) => (
                  <div key={commit.sha} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <div className="font-mono text-cyan-300">{commit.sha}</div>
                      <div className="text-slate-300">{commit.message}</div>
                    </div>
                    <div className="text-right text-xs text-slate-500 shrink-0">{commit.author}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="grid xl:grid-cols-[1fr_1fr] gap-6 mb-6">
          <QueuePanel title="Full Issue Queue" subtitle={`${issues.length} issues scanned`} items={issues.map((issue) => ({
            key: `issue-${issue.number}`,
            title: `#${issue.number} ${issue.title}`,
            subline: issue.triage
              ? `${issue.triage.classification} · ${Math.round(issue.triage.confidence * 100)}%`
              : "scanned · no triage pass",
            action: issue.url,
            meta: `${issue.comments} comments · ${issue.author}`,
          }))} />

          <QueuePanel title="Full PR Queue" subtitle={`${prs.length} PRs scanned`} items={prs.map((pr) => ({
            key: `pr-${pr.number}`,
            title: `PR #${pr.number} ${pr.title}`,
            subline: pr.review
              ? `risk:${pr.review.risk}`
              : `ci:${pr.statusCheckRollup ?? "unknown"}`,
            action: pr.url,
            meta: `${pr.changedFiles} files · stale ${pr.daysStale}d · ${pr.author}`,
          }))} />
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 mb-6 shadow-[0_0_80px_rgba(2,6,23,0.35)]">
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500 font-mono">Agent Pipeline</div>
            <h2 className="text-2xl font-semibold text-white">What every agent did</h2>
            <div className="text-sm text-slate-500 mt-1">Click any node to inspect its input, output, and agent conversation.</div>
          </div>

          <TraceFlow steps={brief.traceSteps.map((s) => ({
            id: s.id,
            stepType: s.stepType,
            stepName: s.stepName,
            targetRef: s.targetRef,
            status: s.status,
            inputJson: s.inputJson,
            outputJson: s.outputJson,
            traceJson: s.traceJson,
            latencyMs: s.latencyMs,
            tokensIn: s.tokensIn,
            tokensOut: s.tokensOut,
            costUsd: s.costUsd,
            error: s.error,
          }))} />
        </section>

        <details className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-[0_0_80px_rgba(2,6,23,0.35)]">
          <summary className="cursor-pointer text-[11px] uppercase tracking-[0.26em] text-slate-500 font-mono hover:text-slate-300">
            Email preview
          </summary>
          <div className="mt-5 bg-white rounded-2xl p-4 max-h-[680px] overflow-y-auto">
            <iframe srcDoc={brief.bodyHtml} className="w-full min-h-[620px] border-0 rounded-xl" sandbox="" />
          </div>
        </details>
      </div>
    </main>
  );
}

function QueuePanel({ title, subtitle, items }: { title: string; subtitle: string; items: Array<{ key: string; title: string; subline: string; action: string; meta: string }> }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 shadow-[0_0_80px_rgba(2,6,23,0.35)]">
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500 font-mono">Queue View</div>
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <div className="text-sm text-slate-500">{subtitle}</div>
      </div>

      <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
        {items.map((item) => (
          <a key={item.key} href={item.action} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 hover:border-cyan-800 hover:bg-slate-900 transition-colors">
            <div className="flex items-center justify-between gap-4 mb-1">
              <div className="text-white font-medium line-clamp-1">{item.title}</div>
              <span className="text-xs text-cyan-400 shrink-0">GitHub →</span>
            </div>
            <div className="text-sm text-slate-400 line-clamp-1">{item.subline}</div>
            <div className="text-xs text-slate-600 font-mono mt-1">{item.meta}</div>
          </a>
        ))}
      </div>
    </section>
  );
}

function QueueStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warn" | "good" | "danger" }) {
  const color = tone === "danger"
    ? "text-red-400"
    : tone === "warn"
    ? "text-amber-400"
    : tone === "good"
    ? "text-emerald-400"
    : "text-white";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-600 font-mono">{label}</div>
    </div>
  );
}


function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
