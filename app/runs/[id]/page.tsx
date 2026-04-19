import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  done: "bg-green-900 text-green-300",
  running: "bg-yellow-900 text-yellow-300",
  error: "bg-red-900 text-red-300",
  pending: "bg-gray-800 text-gray-400",
  success: "bg-green-900 text-green-300",
};

function Badge({ label, status }: { label: string; status: string }) {
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded ${STATUS_COLOR[status] ?? "bg-gray-800 text-gray-400"}`}>
      {label}
    </span>
  );
}

function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="bg-gray-950 text-gray-300 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-64">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const run = await prisma.run.findUnique({
    where: { id },
    include: {
      repo: true,
      githubEvent: true,
      agentSteps: { orderBy: { startedAt: "asc" } },
      githubActions: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!run) notFound();

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-2">
          <Link
            href={`/repos/${run.repo.owner}/${run.repo.name}`}
            className="text-sm text-gray-500 hover:text-gray-300"
          >
            ← {run.repo.owner}/{run.repo.name}
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-white font-mono">{id}</h1>
            <Badge label={run.status} status={run.status} />
          </div>
          <p className="text-gray-400 text-sm">
            {run.runType} · trigger: {run.triggerSource}
            {run.githubTargetType && run.githubTargetNumber && (
              <> · {run.githubTargetType} #{run.githubTargetNumber}</>
            )}
          </p>
          {run.summary && (
            <p className="text-gray-300 text-sm mt-2 bg-gray-900 border border-gray-800 rounded p-3">
              {run.summary}
            </p>
          )}
        </div>

        {/* Agent Steps */}
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-200 mb-3">Agent Steps</h2>
          {run.agentSteps.length === 0 ? (
            <p className="text-gray-500 text-sm">No steps recorded.</p>
          ) : (
            <div className="space-y-3">
              {run.agentSteps.map((step: (typeof run.agentSteps)[number]) => (
                <div key={step.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono text-white text-sm font-medium">{step.agentName}</span>
                    <Badge label={step.status} status={step.status} />
                    {step.error && (
                      <span className="text-xs text-red-400">{step.error}</span>
                    )}
                  </div>
                  <details className="mb-2">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 mb-1">Input</summary>
                    <JsonBlock data={step.inputJson} />
                  </details>
                  {step.outputJson && (
                    <details>
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 mb-1">Output</summary>
                      <JsonBlock data={step.outputJson} />
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* GitHub Actions */}
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-200 mb-3">GitHub Actions</h2>
          {run.githubActions.length === 0 ? (
            <p className="text-gray-500 text-sm">No GitHub actions taken.</p>
          ) : (
            <div className="space-y-2">
              {run.githubActions.map((action: (typeof run.githubActions)[number]) => (
                <div key={action.id} className="rounded border border-gray-800 bg-gray-900 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-200">{action.actionType}</span>
                    <Badge label={action.status} status={action.status} />
                  </div>
                  {action.githubUrl && (
                    <a
                      href={action.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      View on GitHub →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Raw Event */}
        {run.githubEvent && (
          <section>
            <h2 className="text-base font-semibold text-gray-200 mb-3">Raw Event</h2>
            <details>
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 mb-1">
                {run.githubEvent.eventType}.{run.githubEvent.action} · {run.githubEvent.deliveryId}
              </summary>
              <JsonBlock data={run.githubEvent.payloadJson} />
            </details>
          </section>
        )}
      </div>
    </main>
  );
}
