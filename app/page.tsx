import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { RepoScanner } from "./repo-scanner";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/github/start");

  const recentScans = await prisma.scan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { repo: true },
  });

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-gray-950">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">Cabinet</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Maintainer attention triage</h1>
          </div>
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full border border-gray-200" />
            ) : null}
            <div className="text-right">
              <div className="text-sm font-semibold">{user.login}</div>
              <div className="text-xs text-gray-400">GitHub data, private recommendations</div>
            </div>
            <LogoutButton />
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="max-w-3xl">
              <h2 className="text-5xl font-semibold tracking-tight text-gray-950">
                Find what maintainers should inspect first.
              </h2>
              <p className="mt-5 text-lg leading-8 text-gray-600">
                Paste any public GitHub repo. Cabinet compresses the open issue and PR queue into a private attention packet:
                risky PRs, likely AI slop, missing-repro reports, duplicate clusters, docs/release impact, and security-looking threads.
              </p>
            </div>
            <RepoScanner />
          </div>

          <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Recent packets</div>
            <div className="mt-4 space-y-3">
              {recentScans.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
                  Your scanned repos will appear here.
                </div>
              ) : (
                recentScans.map((scan) => (
                  <a
                    key={scan.id}
                    href={`/scans/${scan.id}`}
                    className="block rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 transition-colors hover:bg-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {scan.repo.owner}/{scan.repo.name}
                        </div>
                        <div className="mt-1 text-xs text-gray-400">
                          {scan.issueCount} issues · {scan.prCount} PRs · {formatDate(scan.createdAt)}
                        </div>
                      </div>
                      <span className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500">
                        {scan.status}
                      </span>
                    </div>
                  </a>
                ))
              )}
            </div>
          </aside>
        </section>
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

