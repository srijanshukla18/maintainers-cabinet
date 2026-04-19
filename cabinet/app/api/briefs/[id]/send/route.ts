import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendBrief } from "@/lib/email/client";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const recipient: string = body.to ?? process.env.MAINTAINER_EMAIL ?? "";

  if (!recipient) {
    return NextResponse.json({ error: "Missing recipient email" }, { status: 400 });
  }

  const brief = await prisma.brief.findUnique({ where: { id } });
  if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

  try {
    const { inboxId, messageId } = await sendBrief({
      to: recipient,
      subject: brief.subject,
      text: brief.bodyMarkdown,
      html: brief.bodyHtml,
    });

    const updated = await prisma.brief.update({
      where: { id },
      data: {
        emailSentAt: new Date(),
        emailInboxId: inboxId,
        emailMessageId: messageId,
        emailRecipient: recipient,
      },
    });

    return NextResponse.json({ ok: true, sentTo: recipient, inboxId, messageId, brief: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[briefs/send] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
