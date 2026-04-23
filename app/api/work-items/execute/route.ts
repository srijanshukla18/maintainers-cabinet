import { NextRequest, NextResponse } from "next/server";
import { executeActionProposalById } from "@/lib/inbox/execute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { workItemId?: string; actionId?: string };
  if (!body.workItemId || !body.actionId) {
    return NextResponse.json({ error: "Missing workItemId or actionId" }, { status: 400 });
  }

  try {
    const result = await executeActionProposalById({
      workItemId: body.workItemId,
      actionProposalId: body.actionId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
