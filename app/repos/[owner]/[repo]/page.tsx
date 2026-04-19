import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  done: "text-green-600",
  running: "text-yellow-600",
  error: "text-red-500",
  pending: "text-gray-400",
};

const RUN_TYPE_LABEL: Record<string, string> = {
  issue_triage: "Issue Triage",
  pr_review: "PR Review",
  workflow_failure: "CI Failure",
  slash_command: "Slash Command",
  release_plan: "Release Plan",
};

export default async function RepoPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  const repoRecord = await prisma.repo.findUnique({
    where: { owner_name: { owner, name: repo } },
  });

  if (!repoRecord) notFound();

  const runs = await prisma.run.findMany({
    where: { repoId: repoRecord.id },
    orderBy: { startedAt: "desc" },
    take: 30,
    include: {
      agentSteps: { select: { agentName: true, status: true } },
      githubActions: { select: { actionType: true, status: true } },
    },
  });

  type RunItem = (typeof runs)[number];
  const errorCount = runs.filter((r: RunItem) => r.status === "error").length;
  const doneCount = runs.filter((r: RunItem) => r.status === "done").length;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-2">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">← Home</Link>
        </div>
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-indigo-600 font-bold mb-1">Repository</div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{owner}/{repo}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {doneCount} runs completed · {errorCount} errors
          </p>
        </div>

        <h2 className="text-base font-semibold text-gray-800 mb-4">Recent Runs</h2>

        {runs.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-400">No runs yet. Trigger an event on GitHub to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run: RunItem) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-800">
                        {RUN_TYPE_LABEL[run.runType] ?? run.runType}
                      </span>
                      {run.githubTargetType && run.githubTargetNumber && (
                        <span className="text-xs text-gray-400 font-mono">
                          #{run.githubTargetNumber}
                        </span>
                      )}
                      <span className={`text-xs font-medium ${STATUS_COLOR[run.status] ?? "text-gray-400"}`}>
                        {run.status}
                      </span>
                    </div>
                    {run.summary && (
                      <p className="text-gray-500 text-sm truncate">{run.summary}</p>
                    )}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {run.agentSteps.map((s: { agentName: string; status: string }, i: number) => (
                        <span
                          key={i}
                          className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5"
                        >
                          {s.agentName}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">
                      {new Date(run.startedAt).toLocaleString()}
                    </p>
                    {run.latencyMs && (
                      <p className="text-xs text-gray-300">{run.latencyMs}ms</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}