import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth/session";
import { getScanForUser, serializeScan } from "@/lib/scans/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const scan = await getScanForUser(user.id, id);
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  return NextResponse.json(serializeScan(scan));
}
