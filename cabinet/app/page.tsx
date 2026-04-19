import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { HomeConsole } from "./home-console";
import type { BriefPriorityJson, BriefContextJson } from "@/lib/briefs/generate";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const recent = await prisma.brief.findMany({
    orderBy: { generatedAt: "desc" },
    take: 12,
    include: { repo: true },
  });

  const byRepo = new Map<string, (typeof recent)[number]>();
  for (const brief of recent) {
    const key = `${brief.repo.owner}/${brief.repo.name}`;
    if (!byRepo.has(key)) byRepo.set(key, brief);
  }
  const latestBriefs = [...byRepo.values()].slice(0, 6);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.10),transparent_22%),linear-gradient(180deg,#020617_0%,#020617_60%,#010409_100%)] text-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="mb-8 flex items-center justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.32em] text-cyan-400 font-mono mb-2">Maintainer&apos;s Cabinet</div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-2">
              Morning Brief Mission Control
            </h1>
            <p className="text-slate-400 text-lg max-w-3xl leading-relaxed">
              Scan any public repo, keep the latest brief cached, and drill into the full agent trace behind every decision.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-5 py-4 min-w-[260px] shadow-[0_0_60px_rgba(15,23,42,0.45)]">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-mono mb-3">System Status</div>
            <div className="space-y-2 text-sm">
              <StatusRow label="Agent API" value="online" tone="good" />
              <StatusRow label="Email delivery" value="agentmail active" tone="good" />
              <StatusRow label="Scanned repos" value={String(latestBriefs.length)} tone="neutral" />
            </div>
          </div>
        </header>

        <div className="grid xl:grid-cols-[1.2fr_0.8fr] gap-6 items-start mb-8">
          <HomeConsole />

          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_0_0_1px_rgba(59,130,246,0.06),0_0_80px_rgba(2,6,23,0.35)]">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500 font-mono mb-3">Pipeline</div>
            <ol className="space-y-3 text-sm text-slate-300">
              <li><span className="text-cyan-400 font-mono mr-2">01</span> Read full issue queue, PR queue, and recent commits.</li>
              <li><span className="text-cyan-400 font-mono mr-2">02</span> Run triage and PR review agents across the queue in parallel.</li>
              <li><span className="text-cyan-400 font-mono mr-2">03</span> Priority agent ranks what matters today.</li>
              <li><span className="text-cyan-400 font-mono mr-2">04</span> Briefing agent writes the email.</li>
              <li><span className="text-cyan-400 font-mono mr-2">05</span> Keep the full per-step trace explorable.</li>
            </ol>
          </div>
        </div>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500 font-mono">Archive</div>
              <h2 className="text-2xl font-semibold text-white">Recent Briefs</h2>
            </div>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {latestBriefs.map((brief) => {
              const priority = brief.prioritiesJson as unknown as BriefPriorityJson;
              const context = brief.contextJson as unknown as BriefContextJson;
              return (
                <Link
                  key={brief.id}
                  href={`/briefs/${brief.id}`}
                  className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 hover:border-cyan-700/50 hover:bg-slate-950 transition-colors shadow-[0_20px_40px_rgba(2,6,23,0.35)]"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-mono mb-1">repo</div>
                      <div className="text-lg font-semibold text-white font-mono">
                        {brief.repo.owner}/{brief.repo.name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono text-cyan-400">{brief.latencyMs ? `${(brief.latencyMs / 1000).toFixed(1)}s` : "-"}</div>
                      <div className="text-[11px] text-slate-600">{formatRelative(brief.generatedAt)}</div>
                    </div>
                  </div>

                  <div className="text-sm text-slate-300 mb-4 line-clamp-2">
                    {priority.summary_line}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <MiniStat label="Issues" value={context.issuesCount} />
                    <MiniStat label="PRs" value={context.prsCount} />
                    <MiniStat label="Alerts" value={priority.items.length} />
                  </div>

                  <div className="space-y-2 mb-4">
                    {priority.items.slice(0, 3).map((item, index) => (
                      <div key={index} className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className="text-xs font-mono text-slate-500">{item.reference}</span>
                          <span className="text-[11px] font-mono text-cyan-300">{item.priority.replace(/_/g, " ")}</span>
                        </div>
                        <div className="text-sm text-white line-clamp-1">{item.title}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-500">{brief.emailSentAt ? `sent to ${brief.emailRecipient}` : "generated"}</span>
                    <span className="text-cyan-400">open →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <footer className="border-t border-slate-900 pt-6 flex items-center justify-between text-xs text-slate-500 font-mono">
          <div className="space-x-4">
            <Link href="/evals" className="hover:text-slate-300">evals</Link>
          </div>
          <div>cache • trace • queue • email</div>
        </footer>
      </div>
    </main>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "good" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={tone === "good" ? "text-emerald-400 font-mono" : "text-cyan-300 font-mono"}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-600 font-mono">{label}</div>
    </div>
  );
}

function formatRelative(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
