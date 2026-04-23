import { prisma } from "@/lib/db/client";
import { ensureCabinetInbox, getAgentMail } from "@/lib/email/client";

function classifyMoneyThread(subject: string, labels: string[]) {
  const normalized = `${subject} ${labels.join(" ")}`.toLowerCase();
  if (normalized.includes("invoice") || normalized.includes("billing")) return { kind: "invoice", status: "invoice_due" };
  if (normalized.includes("license") || normalized.includes("enterprise")) return { kind: "enterprise", status: "license_request" };
  if (normalized.includes("tax") || normalized.includes("w-8") || normalized.includes("vat")) return { kind: "compliance", status: "tax_doc_needed" };
  if (normalized.includes("renewal") || normalized.includes("failed")) return { kind: "enterprise", status: "renewal_failed" };
  return { kind: "sponsor", status: "new_sponsor" };
}

export async function syncAgentMailMoneyThreads() {
  const inboxId = await ensureCabinetInbox();
  const client = getAgentMail();
  const response = (await client.inboxes.messages.list(inboxId, {
    limit: 25,
  })) as unknown as { messages?: Array<Record<string, unknown>> };

  const messages = response.messages ?? [];
  const synced: string[] = [];

  for (const raw of messages) {
    const labels = Array.isArray(raw.labels) ? raw.labels.map((entry) => String(entry)) : [];
    const subject = typeof raw.subject === "string" ? raw.subject : "(no subject)";
    const from = typeof raw.from === "string" ? raw.from : typeof raw.sender === "string" ? raw.sender : "unknown";
    const threadKey =
      typeof raw.threadId === "string"
        ? raw.threadId
        : typeof raw.thread_id === "string"
        ? raw.thread_id
        : typeof raw.messageId === "string"
        ? raw.messageId
        : typeof raw.message_id === "string"
        ? raw.message_id
        : subject;

    if (!labels.some((label) => ["enterprise", "invoice", "sponsor", "compliance", "billing", "license"].includes(label))) {
      continue;
    }

    const classification = classifyMoneyThread(subject, labels);
    const workItemId = `agentmail:money:${threadKey}`;

    await prisma.moneyThread.upsert({
      where: { source_threadKey: { source: "agentmail", threadKey } },
      create: {
        source: "agentmail",
        threadKey,
        kind: classification.kind,
        status: classification.status,
        counterparty: from,
        subject,
        payloadJson: {
          labels,
          preview: typeof raw.text === "string" ? raw.text.slice(0, 800) : null,
        } as object,
        nextActionJson: {
          recommendation:
            classification.status === "invoice_due"
              ? "Review invoice status and send or chase payment."
              : classification.status === "license_request"
              ? "Reply with pricing or licensing path."
              : classification.status === "tax_doc_needed"
              ? "Send the requested tax/compliance document."
              : "Acknowledge the sponsor or renewal signal.",
        } as object,
      },
      update: {
        kind: classification.kind,
        status: classification.status,
        counterparty: from,
        subject,
        payloadJson: {
          labels,
          preview: typeof raw.text === "string" ? raw.text.slice(0, 800) : null,
        } as object,
      },
    });

    await prisma.workItem.upsert({
      where: { id: workItemId },
      create: {
        id: workItemId,
        kind: "money_thread",
        source: "agentmail",
        status: "open",
        title: subject,
        summary: `${classification.status.replace(/_/g, " ")} from ${from}`,
        sourceRef: threadKey,
        urgencyScore: classification.status === "invoice_due" ? 82 : classification.status === "renewal_failed" ? 78 : 56,
        impactScore: classification.kind === "enterprise" ? 76 : 58,
        requiresApproval: true,
        evidenceJson: [
          { label: "Counterparty", detail: from },
          { label: "Labels", detail: labels.join(", ") || "none" },
          { label: "Classification", detail: `${classification.kind} / ${classification.status}` },
        ] as unknown as object,
        payloadJson: {
          inboxId,
          threadKey,
          labels,
          subject,
        } as object,
      },
      update: {
        title: subject,
        summary: `${classification.status.replace(/_/g, " ")} from ${from}`,
        urgencyScore: classification.status === "invoice_due" ? 82 : classification.status === "renewal_failed" ? 78 : 56,
        impactScore: classification.kind === "enterprise" ? 76 : 58,
        evidenceJson: [
          { label: "Counterparty", detail: from },
          { label: "Labels", detail: labels.join(", ") || "none" },
          { label: "Classification", detail: `${classification.kind} / ${classification.status}` },
        ] as unknown as object,
        payloadJson: {
          inboxId,
          threadKey,
          labels,
          subject,
        } as object,
      },
    });

    await prisma.actionProposal.deleteMany({ where: { workItemId } });
    await prisma.actionProposal.createMany({
      data: [
        {
          id: `${workItemId}:open`,
          workItemId,
          kind: "open_money_thread",
          label: "Inspect money thread",
          status: "proposed",
          reversible: true,
          downstreamJson: ["agentmail", "money"] as unknown as object,
          payloadJson: {
            description: "Open the money thread in AgentMail or the ops UI.",
            approvalRequired: false,
            payload: { inboxId, threadKey },
            tone: "primary",
          } as object,
        },
        {
          id: `${workItemId}:reply`,
          workItemId,
          kind: "draft_money_reply",
          label: "Draft next reply",
          status: "proposed",
          reversible: true,
          downstreamJson: ["agentmail", "money"] as unknown as object,
          payloadJson: {
            description: "Prepare the next sponsor, billing, or enterprise reply.",
            approvalRequired: true,
            payload: { inboxId, threadKey, subject },
            tone: "secondary",
          } as object,
        },
      ],
    });

    synced.push(workItemId);
  }

  return { synced, inboxId };
}
