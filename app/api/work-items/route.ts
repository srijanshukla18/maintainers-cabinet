import { NextResponse } from "next/server";
import { getInboxState } from "@/lib/inbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getInboxState();
  return NextResponse.json(state);
}
