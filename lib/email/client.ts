import { AgentMailClient } from "agentmail";

let client: AgentMailClient | null = null;

export function getAgentMail(): AgentMailClient {
  if (!client) {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) throw new Error("AGENTMAIL_API_KEY not set");
    client = new AgentMailClient({ apiKey });
  }
  return client;
}

/**
 * Ensure an inbox exists for the cabinet. Returns the inbox ID (email address).
 */
export async function ensureCabinetInbox(): Promise<string> {
  const fromEnv = process.env.AGENTMAIL_INBOX;
  if (fromEnv) return fromEnv;

  const c = getAgentMail();

  // try to reuse an existing inbox
  try {
    const list = (await c.inboxes.list()) as unknown as {
      inboxes?: Array<{ inboxId?: string; inbox_id?: string }>;
    };
    const first = list?.inboxes?.[0];
    const id = first?.inboxId ?? first?.inbox_id;
    if (id) return id;
  } catch {
    // fall through to create
  }

  // create one
  const inbox = (await c.inboxes.create({ clientId: "cabinet-default" })) as unknown as {
    inboxId?: string;
    inbox_id?: string;
  };
  const id = inbox.inboxId ?? inbox.inbox_id;
  if (!id) throw new Error("AgentMail create inbox did not return an ID");
  return id;
}

export async function sendBrief(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ inboxId: string; messageId?: string }> {
  const c = getAgentMail();
  const inboxId = await ensureCabinetInbox();

  const res = (await c.inboxes.messages.send(inboxId, {
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    labels: ["morning-brief"],
  })) as unknown as { messageId?: string; message_id?: string };

  return { inboxId, messageId: res.messageId ?? res.message_id };
}
