import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const repos = await prisma.watchedRepo.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(repos);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { owner, name, emailRecipient, scheduleHour } = body;

  if (!owner || !name || !emailRecipient) {
    return NextResponse.json({ error: "Missing owner, name, or emailRecipient" }, { status: 400 });
  }

  const repo = await prisma.watchedRepo.upsert({
    where: { owner_name: { owner, name } },
    create: { owner, name, emailRecipient, scheduleHour: scheduleHour ?? 8, active: true },
    update: { emailRecipient, scheduleHour: scheduleHour ?? 8, active: true },
  });

  return NextResponse.json(repo);
}
