import { prisma } from "@/lib/db/client";
import { generateBrief } from "@/lib/briefs/generate";
import { sendBrief } from "@/lib/email/client";
import { addLabels, getInstallationClient, postIssueComment, reopenIssue } from "@/lib/github/client";
import type { InboxAction } from "./types";

export async function executeInboxAction(action: InboxAction) {
  return executeResolvedInboxAction(action);
}

export async function executeActionProposalById(input: {
  workItemId: string;
  actionProposalId: string;
}) {
  const proposal = await prisma.actionProposal.findUnique({
    where: { id: input.actionProposalId },
    include: {
      workItem: {
        select: {
          id: true,
          status: true,
          repoId: true,
          sourceRef: true,
          sourceUrl: true,
        },
      },
    },
  });

  if (!proposal || !proposal.workItem || proposal.workItem.id !== input.workItemId) {
    throw new Error("Action proposal not found");
  }
  if (proposal.status !== "proposed" && proposal.status !== "approved") {
    throw new Error(`Action proposal is not executable from status ${proposal.status}`);
  }
  if (proposal.workItem.status !== "open") {
    throw new Error("Work item is not open");
  }

  const action = actionFromProposal(proposal);
  return executeResolvedInboxAction(action, {
    workItemId: proposal.workItem.id,
    actionProposalId: proposal.id,
  });
}

async function executeResolvedInboxAction(
  action: InboxAction,
  ref?: { workItemId?: string | null; actionProposalId?: string | null }
) {
  switch (action.kind) {
    case "run_brief":
      return runBriefAction(action, ref);
    case "send_digest":
      return sendDigestAction(action, ref);
    case "mark_low_signal":
      return markLowSignalAction(action, ref);
    case "close_verified_slop":
      return markLowSignalAction(action, ref);
    case "reopen_issue":
      return reopenIssueAction(action, ref);
    case "reply_support":
      return replySupportAction(action, ref);
    case "open_docs_patch":
      return docsPatchAction(action, ref);
    case "open_money_thread":
      return inspectMoneyThreadAction(action, ref);
    case "draft_money_reply":
      return draftMoneyReplyAction(action, ref);
    case "reindex_repo_graph":
      return reindexRepoGraphAction(action, ref);
    default:
      throw new Error(`Unsupported inbox action: ${action.kind}`);
  }
}

async function runBriefAction(action: InboxAction, ref?: { workItemId?: string | null; actionProposalId?: string | null }) {
  const owner = expectString(action.payload?.owner, "Missing owner");
  const name = expectString(action.payload?.name, "Missing repo name");
  const brief = await generateBrief({ owner, name });
  await recordExecution(action, "brief", `Generated a fresh digest for ${owner}/${name}.`, { owner, name, briefId: brief.id }, ref);

  return {
    ok: true,
    resolveItem: true,
    redirectTo: `/briefs/${brief.id}`,
    message: `Generated a fresh digest for ${owner}/${name}.`,
  };
}

async function sendDigestAction(action: InboxAction, ref?: { workItemId?: string | null; actionProposalId?: string | null }) {
  const briefId = expectString(action.payload?.briefId, "Missing brief id");
  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
  });

  if (!brief) throw new Error("Brief not found");

  const recipient = brief.emailRecipient ?? process.env.MAINTAINER_EMAIL ?? "";
  if (!recipient) throw new Error("Missing recipient email");

  const { inboxId, messageId } = await sendBrief({
    to: recipient,
    subject: brief.subject,
    text: brief.bodyMarkdown,
    html: brief.bodyHtml,
  });

  await prisma.brief.update({
    where: { id: brief.id },
    data: {
      emailSentAt: new Date(),
      emailInboxId: inboxId,
      emailMessageId: messageId,
      emailRecipient: recipient,
    },
  });
  await recordExecution(action, "email", `Sent digest ${brief.id} to ${recipient}.`, { briefId: brief.id, recipient, inboxId, messageId }, ref);

  return {
    ok: true,
    resolveItem: false,
    message: `Sent the digest to ${recipient}.`,
  };
}

async function markLowSignalAction(action: InboxAction, ref?: { workItemId?: string | null; actionProposalId?: string | null }) {
  const owner = expectString(action.payload?.owner, "Missing owner");
  const name = expectString(action.payload?.name, "Missing repo name");
  const issueNumber = expectNumber(action.payload?.issueNumber, "Missing issue number");
  const classification = expectString(action.payload?.classification, "Missing classification");

  const repo = await prisma.repo.findUnique({
    where: { owner_name: { owner, name } },
  });

  if (!repo?.installationId) {
    throw new Error("Verified-slop close requires the repo to be installed through the GitHub App.");
  }

  const octokit = await getInstallationClient(Number(repo.installationId));
  await addLabels(octokit, owner, name, issueNumber, ["cabinet:triaged", "cabinet:needs-info"]);
  await postIssueComment(
    octokit,
    owner,
    name,
    issueNumber,
    [
      `Thanks for the report. Cabinet marked this as needing more maintainer-actionable detail before it can be prioritized.`,
      `The current classifier result is ${classification.replace(/_/g, " ")} and the report is missing enough reproduction or environment detail to distinguish it from support/noise.`,
      `Please add a minimal reproduction, expected behavior, actual behavior, version, environment, and relevant logs. A maintainer can then revisit it with the extra context.`,
    ].join("\n\n")
  );
  await recordExecution(
    action,
    "github",
    `Marked #${issueNumber} in ${owner}/${name} as low-signal and requested reproduction details.`,
    { owner, name, issueNumber, classification },
    ref
  );

  return {
    ok: true,
    resolveItem: true,
    message: `Marked #${issueNumber} in ${owner}/${name} as needing more signal.`,
  };
}

async function reopenIssueAction(action: InboxAction, ref?: { workItemId?: string | null; actionProposalId?: string | null }) {
  const owner = expectString(action.payload?.owner, "Missing owner");
  const name = expectString(action.payload?.name, "Missing repo name");
  const issueNumber = expectNumber(action.payload?.issueNumber, "Missing issue number");

  const repo = await prisma.repo.findUnique({
    where: { owner_name: { owner, name } },
  });

  if (!repo?.installationId) {
    throw new Error("Reopening requires the repo to be installed through the GitHub App.");
  }

  const octokit = await getInstallationClient(Number(repo.installationId));
  await reopenIssue(octokit, owner, name, issueNumber);
  await recordExecution(action, "github", `Reopened #${issueNumber} in ${owner}/${name}.`, { owner, name, issueNumber }, ref);

  return {
    ok: true,
    resolveItem: false,
    message: `Reopened #${issueNumber} in ${owner}/${name}.`,
  };
}

async function replySupportAction(action: InboxAction, ref?: { workItemId?: string | null; actionProposalId?: string | null }) {
  const threadKey = expectString(action.payload?.threadKey, "Missing support thread key");
  const answerDraft = expectString(action.payload?.answerDraft, "Missing support reply draft");
  await prisma.supportResolution.updateMany({
    where: { workItemId: action.id.replace(/:reply$/, "") },
    data: {
      status: "ready_to_send",
      answerDraft,
    },
  });
  await recordExecution(action, "support", `Prepared the support reply for ${threadKey}.`, { threadKey, answerDraft }, ref);
  return {
    ok: true,
    resolveItem: false,
    message: `Prepared the reply draft for ${threadKey}.`,
  };
}

async function docsPatchAction(action: InboxAction, ref?: { workItemId?: string | null; actionProposalId?: string | null }) {
  const targetPath = expectString(action.payload?.targetPath, "Missing docs target path");
  await prisma.supportResolution.updateMany({
    where: { workItemId: action.id.replace(/:docs$/, "") },
    data: {
      status: "docs_queued",
    },
  });
  await recordExecution(action, "docs", `Queued docs patch proposal for ${targetPath}.`, { targetPath, payload: action.payload ?? {} }, ref);
  return {
    ok: true,
    resolveItem: false,
    message: `Queued a docs patch proposal for ${targetPath}.`,
  };
}

async function inspectMoneyThreadAction(action: InboxAction, ref?: { workItemId?: string | null; actionProposalId?: string | null }) {
  const threadKey = expectString(action.payload?.threadKey, "Missing money thread key");
  await prisma.moneyThread.updateMany({
    where: { source: "agentmail", threadKey },
    data: {
      nextActionJson: {
        threadKey,
        inspectedAt: new Date().toISOString(),
        status: "ready_for_follow_up",
      } as object,
    },
  });
  await recordExecution(action, "money", `Inspected money thread ${threadKey}.`, { threadKey, payload: action.payload ?? {} }, ref);
  return {
    ok: true,
    resolveItem: false,
    message: `Money thread ${threadKey} is ready for follow-up.`,
  };
}

async function draftMoneyReplyAction(action: InboxAction, ref?: { workItemId?: string | null; actionProposalId?: string | null }) {
  const threadKey = expectString(action.payload?.threadKey, "Missing money thread key");
  const subject = expectString(action.payload?.subject, "Missing money thread subject");
  const draft = [
    `Thanks for reaching out about "${subject}".`,
    "I reviewed the thread and pulled the next operator action into the maintainer queue.",
    "Reply with any hard deadline or compliance requirement if this needs same-day handling.",
  ].join(" ");
  await prisma.moneyThread.updateMany({
    where: { source: "agentmail", threadKey },
    data: {
      nextActionJson: {
        threadKey,
        draft,
        draftedAt: new Date().toISOString(),
      } as object,
    },
  });
  await recordExecution(action, "money", `Prepared the next reply draft for ${threadKey}.`, { threadKey, draft, payload: action.payload ?? {} }, ref);
  return {
    ok: true,
    resolveItem: false,
    message: `Prepared the next money reply draft for ${threadKey}.`,
  };
}

async function reindexRepoGraphAction(action: InboxAction, ref?: { workItemId?: string | null; actionProposalId?: string | null }) {
  const owner = expectString(action.payload?.owner, "Missing owner");
  const name = expectString(action.payload?.name, "Missing repo name");
  const queuedExecution = await prisma.executionRecord.create({
    data: {
      workItemId: ref?.workItemId ?? null,
      actionProposalId: ref?.actionProposalId ?? null,
      executorKind: "repo-graph",
      status: "pending",
      summary: `Queued repo graph rebuild for ${owner}/${name}.`,
      payloadJson: {
        owner,
        name,
        revision: typeof action.payload?.revision === "string" ? action.payload.revision : null,
      } as object,
    },
  });
  if (ref?.actionProposalId) {
    await prisma.actionProposal.update({
      where: { id: ref.actionProposalId },
      data: {
        status: "executed",
        decidedAt: new Date(),
      },
    });
  }
  return {
    ok: true,
    resolveItem: false,
    message: `Queued the repo graph rebuild for ${owner}/${name}.`,
    executionId: queuedExecution.id,
  };
}

async function recordExecution(
  action: InboxAction,
  executorKind: string,
  summary: string,
  payload: Record<string, unknown>,
  ref?: { workItemId?: string | null; actionProposalId?: string | null }
) {
  if (ref?.actionProposalId) {
    await prisma.actionProposal.update({
      where: { id: ref.actionProposalId },
      data: {
        status: "executed",
        decidedAt: new Date(),
      },
    });
  }

  await prisma.executionRecord.create({
    data: {
      workItemId: ref?.workItemId ?? null,
      actionProposalId: ref?.actionProposalId ?? null,
      executorKind,
      status: "done",
      summary,
      payloadJson: {
        actionId: action.id,
        kind: action.kind,
        ...payload,
      } as object,
    },
  });
}

function expectString(value: unknown, message: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }

  return value;
}

function expectNumber(value: unknown, message: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(message);
  }

  return value;
}

function actionFromProposal(proposal: {
  id: string;
  kind: string;
  label: string;
  reversible: boolean;
  downstreamJson: unknown;
  payloadJson: unknown;
}) {
  const payloadJson = asRecord(proposal.payloadJson);
  return {
    id: proposal.id,
    kind: proposal.kind as InboxAction["kind"],
    label: proposal.label,
    description: asString(payloadJson.description),
    approvalRequired: Boolean(payloadJson.approvalRequired ?? true),
    reversible: proposal.reversible,
    downstream: asArray(proposal.downstreamJson).map((entry) => String(entry)),
    href: asString(payloadJson.href) || undefined,
    payload: asRecord(payloadJson.payload),
    tone: (asString(payloadJson.tone) as InboxAction["tone"]) || "secondary",
  } satisfies InboxAction;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
