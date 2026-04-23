import { prisma } from "@/lib/db/client";
import type { InboxState, InboxWorkItem } from "./types";

export async function syncInboxState(state: InboxState) {
  const seenIds = new Set<string>();
  const repoIds = await loadRepoIds(state.items);

  for (const item of state.items) {
    seenIds.add(item.id);
    await upsertWorkItem(item, repoIds);
  }

  const existing = await prisma.workItem.findMany({
    where: { source: "compiled" },
    select: { id: true, status: true },
  });

  for (const item of existing) {
    if (!seenIds.has(item.id) && item.status === "open") {
      await prisma.workItem.update({
        where: { id: item.id },
        data: { status: "resolved" },
      });
    }
  }
}

async function loadRepoIds(items: InboxWorkItem[]) {
  const pairs = items
    .filter((item) => item.repo)
    .map((item) => `${item.repo!.owner}/${item.repo!.name}`);
  const uniquePairs = [...new Set(pairs)];

  if (uniquePairs.length === 0) return new Map<string, string>();

  const repos = await prisma.repo.findMany({
    where: {
      OR: uniquePairs.map((pair) => {
        const [owner, name] = pair.split("/");
        return { owner, name };
      }),
    },
    select: { id: true, owner: true, name: true },
  });

  return new Map(repos.map((repo) => [`${repo.owner}/${repo.name}`, repo.id]));
}

async function upsertWorkItem(item: InboxWorkItem, repoIds: Map<string, string>) {
  const repoId = item.repo ? repoIds.get(`${item.repo.owner}/${item.repo.name}`) ?? null : null;

  await prisma.workItem.upsert({
    where: { id: item.id },
    create: {
      id: item.id,
      repoId,
      kind: item.kind,
      source: "compiled",
      status: "open",
      title: item.title,
      summary: item.summary,
      sourceRef: item.targetRef,
      sourceUrl: item.targetUrl,
      urgencyScore: item.scores.urgency,
      impactScore: item.scores.impact,
      trustScore: item.scores.trust,
      slopScore: item.scores.slop,
      autoExecutable: Boolean(item.autoReason),
      requiresApproval: item.actions.some((action) => action.approvalRequired),
      evidenceJson: item.evidence as unknown as object,
      payloadJson: {
        traceUrl: item.traceUrl,
        pillar: item.pillar,
        scores: item.scores,
        autoReason: item.autoReason,
        repo: item.repo,
      } as object,
      createdAt: new Date(item.createdAt),
    },
    update: {
      repoId,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      sourceRef: item.targetRef,
      sourceUrl: item.targetUrl,
      urgencyScore: item.scores.urgency,
      impactScore: item.scores.impact,
      trustScore: item.scores.trust,
      slopScore: item.scores.slop,
      autoExecutable: Boolean(item.autoReason),
      requiresApproval: item.actions.some((action) => action.approvalRequired),
      evidenceJson: item.evidence as unknown as object,
      payloadJson: {
        traceUrl: item.traceUrl,
        pillar: item.pillar,
        scores: item.scores,
        autoReason: item.autoReason,
        repo: item.repo,
      } as object,
      status: "open",
    },
  });

  const nextActionIds = new Set(item.actions.map((action) => action.id));

  for (const action of item.actions) {
    await prisma.actionProposal.upsert({
      where: { id: action.id },
      create: {
        id: action.id,
        workItemId: item.id,
        kind: action.kind,
        label: action.label,
        status: "proposed",
        reversible: action.reversible,
        downstreamJson: action.downstream as unknown as object,
        payloadJson: {
          description: action.description,
          href: action.href ?? null,
          approvalRequired: action.approvalRequired,
          tone: action.tone ?? null,
          payload: action.payload ?? {},
        } as object,
      },
      update: {
        kind: action.kind,
        label: action.label,
        reversible: action.reversible,
        downstreamJson: action.downstream as unknown as object,
        payloadJson: {
          description: action.description,
          href: action.href ?? null,
          approvalRequired: action.approvalRequired,
          tone: action.tone ?? null,
          payload: action.payload ?? {},
        } as object,
      },
    });
  }

  await prisma.actionProposal.updateMany({
    where: {
      workItemId: item.id,
      status: "proposed",
      id: { notIn: [...nextActionIds] },
    },
    data: {
      status: "rejected",
      decidedAt: new Date(),
    },
  });
}
