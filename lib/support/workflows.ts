import { prisma } from "@/lib/db/client";

export function draftSupportResolution(input: {
  source: "discord" | "github";
  author: string;
  subject: string;
  body: string;
  threadKey: string;
}) {
  const normalized = `${input.subject}\n${input.body}`.toLowerCase();
  const knowledgeRefs: Array<{ type: string; match: string; confidence: number }> = [];

  if (normalized.includes("install") || normalized.includes("setup")) {
    knowledgeRefs.push({ type: "docs", match: "installation/setup", confidence: 0.74 });
  }
  if (normalized.includes("webpack")) {
    knowledgeRefs.push({ type: "docs", match: "bundler/webpack", confidence: 0.71 });
  }
  if (normalized.includes("permission") || normalized.includes("401")) {
    knowledgeRefs.push({ type: "docs", match: "auth/permissions", confidence: 0.66 });
  }

  const answerDraft = [
    `Hey ${input.author}, this looks like a support thread rather than a new defect.`,
    `The likely path is documented in the ${knowledgeRefs[0]?.match ?? "setup guide"}.`,
    `If you still hit this after trying the documented fix, reply with the exact version, environment, and minimal reproduction so the maintainer can treat it as a bug instead of support drift.`,
  ].join(" ");

  const docsPatch = {
    title: `Tighten docs for recurring ${knowledgeRefs[0]?.match ?? "support"} question`,
    summary: `Add a short troubleshooting note sourced from ${input.source} thread ${input.threadKey}.`,
    targetPath: "docs/troubleshooting.md",
  };

  return {
    answerDraft,
    docsPatch,
    knowledgeRefs,
  };
}

export async function createSupportWorkItem(input: {
  source: "discord" | "github";
  repoOwner?: string;
  repoName?: string;
  threadKey: string;
  threadUrl?: string | null;
  author: string;
  subject: string;
  body: string;
}) {
  const repo =
    input.repoOwner && input.repoName
      ? await prisma.repo.findUnique({
          where: { owner_name: { owner: input.repoOwner, name: input.repoName } },
        })
      : null;

  const workflow = draftSupportResolution({
    source: input.source,
    author: input.author,
    subject: input.subject,
    body: input.body,
    threadKey: input.threadKey,
  });

  const workItemId = `${input.source}:support:${input.threadKey}`;

  await prisma.workItem.upsert({
    where: { id: workItemId },
    create: {
      id: workItemId,
      repoId: repo?.id ?? null,
      kind: "support_resolution",
      source: input.source,
      status: "open",
      title: input.subject,
      summary: workflow.answerDraft,
      sourceRef: input.threadKey,
      sourceUrl: input.threadUrl,
      urgencyScore: 46,
      impactScore: workflow.knowledgeRefs.length > 0 ? 60 : 42,
      requiresApproval: true,
      evidenceJson: [
        { label: "Source", detail: input.source },
        { label: "Author", detail: input.author },
        { label: "Matched knowledge", detail: workflow.knowledgeRefs.map((entry) => entry.match).join(", ") || "No strong match yet" },
      ] as unknown as object,
      payloadJson: {
        author: input.author,
        body: input.body,
        docsPatch: workflow.docsPatch,
      } as object,
    },
    update: {
      repoId: repo?.id ?? null,
      title: input.subject,
      summary: workflow.answerDraft,
      sourceUrl: input.threadUrl,
      impactScore: workflow.knowledgeRefs.length > 0 ? 60 : 42,
      evidenceJson: [
        { label: "Source", detail: input.source },
        { label: "Author", detail: input.author },
        { label: "Matched knowledge", detail: workflow.knowledgeRefs.map((entry) => entry.match).join(", ") || "No strong match yet" },
      ] as unknown as object,
      payloadJson: {
        author: input.author,
        body: input.body,
        docsPatch: workflow.docsPatch,
      } as object,
      status: "open",
    },
  });

  await prisma.supportResolution.upsert({
    where: { workItemId },
    create: {
      workItemId,
      status: "draft",
      answerDraft: workflow.answerDraft,
      docsPatchJson: workflow.docsPatch as object,
      knowledgeRefsJson: workflow.knowledgeRefs as unknown as object,
    },
    update: {
      answerDraft: workflow.answerDraft,
      docsPatchJson: workflow.docsPatch as object,
      knowledgeRefsJson: workflow.knowledgeRefs as unknown as object,
      status: "draft",
    },
  });

  await prisma.actionProposal.deleteMany({
    where: { workItemId },
  });
  await prisma.actionProposal.createMany({
    data: [
      {
        id: `${workItemId}:reply`,
        workItemId,
        kind: "reply_support",
        label: "Send reply draft",
        status: "proposed",
        reversible: false,
        downstreamJson: [input.source, "support"] as unknown as object,
        payloadJson: {
          description: "Approve the drafted support reply.",
          approvalRequired: true,
          payload: {
            source: input.source,
            threadKey: input.threadKey,
            answerDraft: workflow.answerDraft,
          },
          tone: "primary",
        } as object,
      },
      {
        id: `${workItemId}:docs`,
        workItemId,
        kind: "open_docs_patch",
        label: "Queue docs update",
        status: "proposed",
        reversible: true,
        downstreamJson: ["docs", "support"] as unknown as object,
        payloadJson: {
          description: "Queue the docs patch proposal linked to this support thread.",
          approvalRequired: true,
          payload: workflow.docsPatch,
          tone: "secondary",
        } as object,
      },
    ],
  });

  return { workItemId };
}
