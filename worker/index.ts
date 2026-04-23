import { getInboxState } from "../lib/inbox/service";
import { prisma } from "../lib/db/client";
import { syncInboxState } from "../lib/inbox/persistence";
import { syncAgentMailMoneyThreads } from "../lib/money/sync";
import { buildRepoGraphSnapshot } from "../lib/repo-graph";

const POLL_INTERVAL_MS = Number(process.env.MAINTAINER_WORKER_INTERVAL_MS ?? "30000");
const RUN_ONCE = process.env.MAINTAINER_WORKER_ONESHOT === "1";

async function main() {
  do {
    const summary = await runWorkerCycle();
    console.log(JSON.stringify(summary, null, 2));
    if (RUN_ONCE) break;
    await sleep(POLL_INTERVAL_MS);
  } while (true);
}

async function runWorkerCycle() {
  const moneySync = await syncAgentMailMoneyThreads().catch(() => null);
  const compiledState = await getInboxState({ compile: true });
  await syncInboxState(compiledState);
  const processedRepoGraphs = await processPendingRepoGraphExecutions();
  const state = await getInboxState();

  return {
    worker: "maintainer-os",
    compiledAt: new Date().toISOString(),
    mode: RUN_ONCE ? "oneshot" : "loop",
    intervalMs: RUN_ONCE ? null : POLL_INTERVAL_MS,
    syncedMoneyThreads: moneySync?.synced.length ?? 0,
    processedRepoGraphs,
    queue: state.summary,
  };
}

async function processPendingRepoGraphExecutions() {
  const pending = await prisma.executionRecord.findMany({
    where: {
      executorKind: "repo-graph",
      status: "pending",
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  let processed = 0;

  for (const record of pending) {
    const claim = await prisma.executionRecord.updateMany({
      where: {
        id: record.id,
        status: "pending",
      },
      data: {
        status: "running",
        summary: `Running repo graph rebuild for queued execution ${record.id}.`,
      },
    });

    if (claim.count === 0) continue;

    const payload = record.payloadJson as Record<string, unknown>;
    const owner = typeof payload.owner === "string" ? payload.owner : "";
    const name = typeof payload.name === "string" ? payload.name : "";
    const revision = typeof payload.revision === "string" ? payload.revision : undefined;

    if (!owner || !name) {
      await prisma.executionRecord.update({
        where: { id: record.id },
        data: {
          status: "error",
          summary: "Missing owner or name in queued repo-graph execution.",
        },
      });
      continue;
    }

    try {
      const result = await buildRepoGraphSnapshot({ owner, name, revision });
      await prisma.executionRecord.update({
        where: { id: record.id },
        data: {
          status: "done",
          summary: `Rebuilt repo graph for ${owner}/${name}.`,
          payloadJson: {
            ...payload,
            result,
          } as object,
        },
      });
      processed += 1;
    } catch (error) {
      await prisma.executionRecord.update({
        where: { id: record.id },
        data: {
          status: "error",
          summary: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return processed;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  console.error("[worker] failed:", error);
  process.exitCode = 1;
});
