import Link from "next/link";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const repos = await prisma.repo.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { runs: true } } },
  });

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-1">Maintainer's Cabinet</h1>
          <p className="text-gray-400 text-sm">GitHub-native multi-agent maintainer assistant</p>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-200">Installed Repos</h2>
          <Link href="/evals" className="text-sm text-indigo-400 hover:text-indigo-300">
            Eval runner →
          </Link>
        </div>

        {repos.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-gray-400 mb-2">No repos installed yet.</p>
            <p className="text-gray-500 text-sm">
              Install the GitHub App on a repo to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {repos.map((repo: (typeof repos)[number]) => (
              <Link
                key={repo.id}
                href={`/repos/${repo.owner}/${repo.name}`}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 hover:bg-gray-800 transition-colors"
              >
                <div>
                  <span className="font-mono text-white font-medium">
                    {repo.owner}/{repo.name}
                  </span>
                  <p className="text-gray-500 text-xs mt-0.5">
                    default branch: {repo.defaultBranch}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm text-gray-300">{repo._count.runs} runs</span>
                  <p className="text-gray-600 text-xs">
                    {new Date(repo.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
