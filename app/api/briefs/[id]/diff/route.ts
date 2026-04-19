import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const otherId = req.nextUrl.searchParams.get("vs");

  if (!otherId) return NextResponse.json({ error: "Missing ?vs= param" }, { status: 400 });

  const [a, b] = await Promise.all([
    prisma.brief.findUnique({ where: { id }, include: { repo: true, traceSteps: { orderBy: { startedAt: "asc" } } } }),
    prisma.brief.findUnique({ where: { id: otherId }, include: { repo: true, traceSteps: { orderBy: { startedAt: "asc" } } } }),
  ]);

  if (!a || !b) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

  return NextResponse.json({ a, b });
}
