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
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="mb-8 flex items-start justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-indigo-600 font-bold mb-1">Maintainer&apos;s Cabinet</div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">
              Morning Brief
            </h1>
            <p className="text-gray-500 text-lg max-w-2xl">
              Scan any public repo. Agents triage, review, prioritize, and write the brief.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 min-w-[240px] shadow-sm">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">System</div>
            <div className="space-y-2 text-sm">
              <StatusRow label="Agent API" value="online" tone="good" />
              <StatusRow label="Email" value="agentmail" tone="good" />
              <StatusRow label="Repos scanned" value={String(latestBriefs.length)} tone="neutral" />
            </div>
          </div>
        </header>

        <div className="grid xl:grid-cols-[1.2fr_0.8fr] gap-6 items-start mb-10">
          <HomeConsole />

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Pipeline</div>
            <ol className="space-y-3 text-sm text-gray-600">
              <li><span className="text-indigo-600 font-mono font-bold mr-2">01</span> Read full issue queue, PR queue, and recent commits.</li>
              <li><span className="text-indigo-600 font-mono font-bold mr-2">02</span> Run triage and PR review agents in parallel.</li>
              <li><span className="text-indigo-600 font-mono font-bold mr-2">03</span> Priority agent ranks what matters today.</li>
              <li><span className="text-indigo-600 font-mono font-bold mr-2">04</span> Briefing agent writes the email.</li>
              <li><span className="text-indigo-600 font-mono font-bold mr-2">05</span> Full per-step trace is explorable in the UI.</li>
            </ol>
          </div>
        </div>

        {latestBriefs.length > 0 && (
          <section className="mb-8">
            <div className="mb-4">
              <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Archive</div>
              <h2 className="text-2xl font-bold text-gray-900">Recent Briefs</h2>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {latestBriefs.map((brief) => {
                const priority = brief.prioritiesJson as unknown as BriefPriorityJson;
                const context = brief.contextJson as unknown as BriefContextJson;
                return (
                  <Link
                    key={brief.id}
                    href={`/briefs/${brief.id}`}
                    className="rounded-2xl border border-gray-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="text-base font-bold text-gray-900 font-mono">
                        {brief.repo.owner}/{brief.repo.name}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono text-indigo-600 font-semibold">{brief.latencyMs ? `${(brief.latencyMs / 1000).toFixed(1)}s` : "-"}</div>
                        <div className="text-xs text-gray-400">{formatRelative(brief.generatedAt)}</div>
                      </div>
                    </div>

                    <div className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">
                      {priority.summary_line}
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <MiniStat label="Issues" value={context.issuesCount} />
                      <MiniStat label="PRs" value={context.prsCount} />
                      <MiniStat label="Alerts" value={priority.items.length} />
                    </div>

                    <div className="space-y-2 mb-3">
                      {priority.items.slice(0, 3).map((item, index) => (
                        <div key={index} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-3 mb-0.5">
                            <span className="text-xs font-mono text-gray-500 font-semibold">{item.reference}</span>
                            <PriorityPill priority={item.priority} />
                          </div>
                          <div className="text-sm text-gray-800 font-medium line-clamp-1">{item.title}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{brief.emailSentAt ? `sent to ${brief.emailRecipient}` : "generated"}</span>
                      <span className="text-indigo-600 font-semibold">open →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <footer className="border-t border-gray-200 pt-6 flex items-center justify-between text-xs text-gray-400 font-mono">
          <Link href="/evals" className="hover:text-gray-600">evals</Link>
          <div>7 agents · trace-first · agentmail</div>
        </footer>
      </div>
    </main>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "good" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className={`font-mono font-semibold ${tone === "good" ? "text-emerald-600" : "text-indigo-600"}`}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center">
      <div className="text-lg font-bold text-gray-900">{value}</div>
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
