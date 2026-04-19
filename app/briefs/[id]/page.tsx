import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import BriefActions from "./actions";
import TraceFlow from "./trace-flow";
import type { BriefContextJson, BriefPriorityJson } from "@/lib/briefs/generate";

export const dynamic = "force-dynamic";

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
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 font-semibold">← mission control</Link>
            <div className="text-xs uppercase tracking-widest text-indigo-600 font-bold mt-3 mb-1">
              Morning Brief · {brief.repo.owner}/{brief.repo.name}
            </div>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-2">
              {brief.subject}
            </h1>
            <div className="flex items-center gap-3 text-sm text-gray-400 font-mono flex-wrap">
              <span>{formatDate(brief.generatedAt)}</span>
              {brief.latencyMs && <span>· {(brief.latencyMs / 1000).toFixed(1)}s total</span>}
              <span>· {brief.traceSteps.length} trace steps</span>
              {brief.emailSentAt && <span className="text-emerald-600 font-semibold">sent to {brief.emailRecipient}</span>}
            </div>
          </div>

          <div className="min-w-[260px] rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Controls</div>
            <BriefActions briefId={brief.id} alreadySent={!!brief.emailSentAt} />
            <div className="mt-4 space-y-2 text-sm font-mono text-gray-400">
              <div className="flex items-center justify-between"><span>Issues scanned</span><span className="text-gray-900 font-semibold">{context.issuesCount}</span></div>
              <div className="flex items-center justify-between"><span>PRs scanned</span><span className="text-gray-900 font-semibold">{context.prsCount}</span></div>
              <div className="flex items-center justify-between"><span>Triaged</span><span className="text-violet-600 font-semibold">{context.triagedCount}</span></div>
              <div className="flex items-center justify-between"><span>Reviewed</span><span className="text-amber-600 font-semibold">{context.reviewedCount}</span></div>
            </div>
          </div>
        </div>

        {/* Priorities + Queue Health */}
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 mb-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Today&apos;s Priorities</div>
            <p className="text-lg text-gray-700 font-medium mb-6">{priorities.summary_line}</p>
            <div className="space-y-4">
              {priorities.items.map((item, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-gray-500 font-semibold">{item.reference}</span>
                      <PriorityPill priority={item.priority} />
                      <span className="text-xs font-mono text-gray-400">score {item.score}</span>
                    </div>
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 font-semibold hover:underline shrink-0">GitHub →</a>
                  </div>
                  <div className="text-base text-gray-900 font-semibold mb-1">{item.title}</div>
                  <div className="text-sm text-gray-500 mb-2">{item.reason}</div>
                  <div className="text-sm font-mono text-indigo-600 font-semibold">→ {item.action}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Queue Health</div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <QueueStat label="Open issues" value={priorities.queue_health.open_issues} />
              <QueueStat label="Open PRs" value={priorities.queue_health.open_prs} />
              <QueueStat label="Stale PRs" value={priorities.queue_health.stale_prs} tone="warn" />
              <QueueStat label="Ready to merge" value={priorities.queue_health.ready_to_merge} tone="good" />
              <QueueStat label="Needs triage" value={priorities.queue_health.needs_triage} tone="warn" />
              <QueueStat label="Security flags" value={priorities.queue_health.security_flags} tone="danger" />
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Recent commits</div>
              <div className="space-y-2">
                {context.commits?.slice(0, 5).map((commit) => (
                  <div key={commit.sha} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <span className="font-mono text-indigo-600 font-semibold mr-2">{commit.sha}</span>
                      <span className="text-gray-700">{commit.message}</span>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{commit.author}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Full queues */}
        <div className="grid xl:grid-cols-2 gap-6 mb-6">
          <QueuePanel title="Full Issue Queue" subtitle={`${issues.length} issues scanned`} items={issues.map((issue) => ({
            key: `issue-${issue.number}`,
            title: `#${issue.number} ${issue.title}`,
            subline: issue.triage
              ? `${issue.triage.classification} · ${Math.round(issue.triage.confidence * 100)}%`
              : "scanned",
            action: issue.url,
            meta: `${issue.comments} comments · ${issue.author}`,
          }))} />

          <QueuePanel title="Full PR Queue" subtitle={`${prs.length} PRs scanned`} items={prs.map((pr) => ({
            key: `pr-${pr.number}`,
            title: `PR #${pr.number} ${pr.title}`,
            subline: pr.review
              ? `risk: ${pr.review.risk}`
              : `ci: ${pr.statusCheckRollup ?? "unknown"}`,
            action: pr.url,
            meta: `${pr.changedFiles} files · stale ${pr.daysStale}d · ${pr.author}`,
          }))} />
        </div>

        {/* Trace flowchart */}
        <section className="rounded-2xl border border-gray-200 bg-white p-6 mb-6 shadow-sm">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Agent Pipeline</div>
            <h2 className="text-2xl font-bold text-gray-900">What every agent did</h2>
            <div className="text-sm text-gray-500 mt-1">Click any node to inspect input, output, and agent conversation.</div>
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

        {/* Email preview */}
        <details className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-gray-400 font-semibold hover:text-gray-600">
            Email preview
          </summary>
          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 max-h-[680px] overflow-y-auto">
            <iframe srcDoc={brief.bodyHtml} className="w-full min-h-[620px] border-0 rounded-lg" sandbox="" />
          </div>
        </details>
      </div>
    </main>
  );
}

function QueuePanel({ title, subtitle, items }: { title: string; subtitle: string; items: Array<{ key: string; title: string; subline: string; action: string; meta: string }> }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <div className="text-sm text-gray-500">{subtitle}</div>
      </div>

      <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
        {items.map((item) => (
          <a key={item.key} href={item.action} target="_blank" rel="noreferrer" className="block rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors">
            <div className="flex items-center justify-between gap-4 mb-0.5">
              <div className="text-sm text-gray-900 font-semibold line-clamp-1">{item.title}</div>
              <span className="text-xs text-indigo-600 font-semibold shrink-0">GitHub →</span>
            </div>
            <div className="text-sm text-gray-500 line-clamp-1">{item.subline}</div>
            <div className="text-xs text-gray-400 font-mono mt-1">{item.meta}</div>
          </a>
        ))}
      </div>
    </section>
  );
}

function QueueStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warn" | "good" | "danger" }) {
  const color = tone === "danger"
    ? "text-red-600"
    : tone === "warn"
    ? "text-amber-600"
    : tone === "good"
    ? "text-emerald-600"
    : "text-gray-900";

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{label}</div>
    </div>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const style = priority === "do_today"
    ? "bg-red-100 text-red-700 border-red-200"
    : priority === "this_week"
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-gray-100 text-gray-500 border-gray-200";

  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${style}`}>
      {priority.replace(/_/g, " ")}
    </span>
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
