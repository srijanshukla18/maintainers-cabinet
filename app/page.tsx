import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { getInboxState } from "@/lib/inbox/service";
import { InboxClient } from "./inbox-client";
import { HomeConsole } from "./home-console";
import { WatchConsole } from "./watch-console";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [inbox, watched, recent] = await Promise.all([
    getInboxState(),
    prisma.watchedRepo.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.brief.findMany({
      orderBy: { generatedAt: "desc" },
      take: 6,
      include: { repo: true },
    }),
  ]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f6f7fb,white_35%)] text-gray-900">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-[0.28em] text-gray-400">Maintainer OS</div>
            <h1 className="mt-2 text-5xl font-semibold tracking-tight text-gray-950">
              One queue. One active card. Clear the mess.
            </h1>
            <p className="mt-4 text-base leading-7 text-gray-600">
              The homepage is now the execution surface. The rest of the product stays available as operator tooling and trace depth when you need it.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/evals"
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Eval runner
            </Link>
            <Link
              href="/diff"
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Diff runs
            </Link>
          </div>
        </header>

        <InboxClient initialState={inbox} />

        <section className="mt-10 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Operator Tools</div>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900">Manual controls stay available</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                These are now secondary surfaces. They exist for forcing a digest, configuring watched repos, and inspecting the old control-plane workflow.
              </p>
            </div>
            <HomeConsole />
          </div>

          <WatchConsole
            initial={watched.map((repo) => ({
              ...repo,
              lastRunAt: repo.lastRunAt?.toISOString() ?? null,
            }))}
          />
        </section>

        {recent.length > 0 ? (
          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Trace Archive</div>
                <h2 className="mt-1 text-2xl font-semibold text-gray-900">Recent digests and observability packets</h2>
              </div>
              <Link href="/evals" className="text-sm font-semibold text-gray-500 hover:text-gray-900">
                Open evals
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recent.map((brief) => (
                <Link
                  key={brief.id}
                  href={`/briefs/${brief.id}`}
                  className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {brief.repo.owner}/{brief.repo.name}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">{formatDate(brief.generatedAt)}</div>
                    </div>
                    <div className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500">
                      {brief.emailSentAt ? "emailed" : "draft"}
                    </div>
                  </div>
                  <div className="mt-4 text-sm leading-6 text-gray-600">{brief.subject}</div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function formatDate(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
