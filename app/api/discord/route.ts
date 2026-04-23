import { NextRequest, NextResponse } from "next/server";
import { verifySignedRequest } from "@/lib/http/signature";
import { createSupportWorkItem } from "@/lib/support/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureError = verifySignedRequest(req, rawBody);
  if (signatureError) return signatureError;

  const body = (JSON.parse(rawBody || "{}") as Record<string, unknown>);
  const threadKey = typeof body.threadKey === "string" ? body.threadKey : "";
  const author = typeof body.author === "string" ? body.author : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const message = typeof body.message === "string" ? body.message : "";

  if (!threadKey || !author || !subject || !message) {
    return NextResponse.json({ error: "Missing discord threadKey, author, subject, or message" }, { status: 400 });
  }

  const result = await createSupportWorkItem({
    source: "discord",
    repoOwner: typeof body.repoOwner === "string" ? body.repoOwner : undefined,
    repoName: typeof body.repoName === "string" ? body.repoName : undefined,
    threadKey,
    threadUrl: typeof body.threadUrl === "string" ? body.threadUrl : null,
    author,
    subject,
    body: message,
  });

  return NextResponse.json({ ok: true, ...result });
}
