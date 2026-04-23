import { prisma } from "../lib/db/client";
import { executeActionProposalById } from "../lib/inbox/execute";
import { getInboxState } from "../lib/inbox/service";

const TOOLS = ["queue.summary", "queue.next", "item.inspect", "action.approve", "action.reject", "docs.search", "security.summary", "money.summary"] as const;

async function main() {
  const tool = process.argv[2];
  const args = process.argv.slice(3);

  if (!tool || tool === "tools") {
    print({
      name: "maintainer-os-mcp",
      tools: TOOLS,
    });
    return;
  }

  switch (tool) {
    case "queue.summary":
      return queueSummary();
    case "queue.next":
      return queueNext();
    case "item.inspect":
      return itemInspect(args[0]);
    case "action.approve":
      return actionApprove(args[0], args[1]);
    case "action.reject":
      return actionReject(args[0], args[1]);
    case "docs.search":
      return docsSearch(args.join(" "));
    case "security.summary":
      return securitySummary();
    case "money.summary":
      return moneySummary();
    default:
      throw new Error(`Unknown MCP command: ${tool}`);
  }
}

async function queueSummary() {
  const state = await getInboxState();
  print({
    total: state.summary.total,
    urgent: state.summary.urgent,
    approvalRequired: state.summary.approvalRequired,
    autoExecutable: state.summary.autoExecutable,
    bySurface: state.summary.bySurface,
    next: state.items[0]
      ? {
          id: state.items[0].id,
          title: state.items[0].title,
          pillar: state.items[0].pillar,
          priority: state.items[0].scores.priority,
        }
      : null,
  });
}

async function queueNext() {
  const state = await getInboxState();
  print(state.items[0] ?? null);
}

async function itemInspect(id?: string) {
  if (!id) throw new Error("Missing item id");
  const state = await getInboxState();
  const item = state.items.find((entry) => entry.id === id);
  if (!item) throw new Error(`Item not found: ${id}`);
  print(item);
}

async function actionApprove(workItemId?: string, actionId?: string) {
  if (!workItemId) throw new Error("Missing work item id");
  const state = await getInboxState();
  const item = state.items.find((entry) => entry.id === workItemId);
  if (!item) throw new Error(`Item not found: ${workItemId}`);
  const action = actionId ? item.actions.find((entry) => entry.id === actionId) : item.actions[0];
  if (!action) throw new Error(`Action not found for ${workItemId}`);
  const result = await executeActionProposalById({
    workItemId,
    actionProposalId: action.id,
  });
  print(result);
}

async function actionReject(workItemId?: string, actionId?: string) {
  if (!workItemId || !actionId) throw new Error("Missing work item id or action id");
  const action = await prisma.actionProposal.findUnique({
    where: { id: actionId },
    select: { id: true, workItemId: true },
  });
  if (!action || action.workItemId !== workItemId) {
    throw new Error(`Action ${actionId} does not belong to ${workItemId}`);
  }
  await prisma.actionProposal.update({
    where: { id: action.id },
    data: {
      status: "rejected",
      decidedAt: new Date(),
    },
  });
  await prisma.executionRecord.create({
    data: {
      workItemId,
      actionProposalId: action.id,
      executorKind: "operator",
      status: "done",
      summary: `Rejected action ${actionId}.`,
      payloadJson: { actionId, rejectedAt: new Date().toISOString() } as object,
    },
  });
  print({ ok: true, rejected: actionId });
}

async function docsSearch(query: string) {
  const support = await prisma.supportResolution.findMany({
    where: query
      ? {
          OR: [
            { answerDraft: { contains: query } },
            { workItem: { title: { contains: query } } },
            { workItem: { summary: { contains: query } } },
          ],
        }
      : {},
    include: {
      workItem: {
        select: { id: true, title: true, sourceUrl: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  print(
    support.map((entry) => ({
      workItemId: entry.workItemId,
      title: entry.workItem.title,
      answerDraft: entry.answerDraft,
      sourceUrl: entry.workItem.sourceUrl,
    }))
  );
}

async function securitySummary() {
  const verdicts = await prisma.securityVerdict.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const counts = verdicts.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.verdict] = (acc[entry.verdict] ?? 0) + 1;
    return acc;
  }, {});
  print({
    total: verdicts.length,
    byVerdict: counts,
    recent: verdicts.slice(0, 5).map((entry) => ({
      advisoryRef: entry.advisoryRef,
      packageName: entry.packageName,
      severity: entry.severity,
      verdict: entry.verdict,
    })),
  });
}

async function moneySummary() {
  const threads = await prisma.moneyThread.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const counts = threads.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.status] = (acc[entry.status] ?? 0) + 1;
    return acc;
  }, {});
  print({
    total: threads.length,
    byStatus: counts,
    recent: threads.slice(0, 5).map((entry) => ({
      threadKey: entry.threadKey,
      kind: entry.kind,
      status: entry.status,
      counterparty: entry.counterparty,
      subject: entry.subject,
    })),
  });
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

void main().catch((error) => {
  console.error("[mcp] failed:", error);
  process.exitCode = 1;
});
