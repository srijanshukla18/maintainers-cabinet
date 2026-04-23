import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth/session";
import { createInitialScan } from "@/lib/scans/service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { repo?: string };
  if (!body.repo) {
    return NextResponse.json({ error: "Missing repo" }, { status: 400 });
  }

  try {
    const result = await createInitialScan(user, body.repo);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /not found|public repositories|invalid repo/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

