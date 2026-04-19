/**
 * POST /api/cron
 * Manually trigger a brief for a watched repo right now.
 * Used for demo ("trigger the daily brief on demand").
 */

import { NextRequest, NextResponse } from "next/server";
import { runNow } from "@/lib/cron/scheduler";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { owner, name, emailRecipient } = body;

  if (!owner || !name || !emailRecipient) {
    return NextResponse.json({ error: "Missing owner, name, or emailRecipient" }, { status: 400 });
  }

  try {
    const briefId = await runNow(owner, name, emailRecipient);
    return NextResponse.json({ ok: true, briefId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
