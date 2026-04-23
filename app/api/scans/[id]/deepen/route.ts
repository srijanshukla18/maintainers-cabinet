import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth/session";
import { deepenScan, getScanForUser, serializeScan } from "@/lib/scans/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await deepenScan(user, id);
    const scan = await getScanForUser(user.id, id);
    if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    return NextResponse.json(serializeScan(scan));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
