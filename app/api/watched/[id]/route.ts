import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const repo = await prisma.watchedRepo.update({
    where: { id },
    data: {
      ...(body.emailRecipient !== undefined && { emailRecipient: body.emailRecipient }),
      ...(body.scheduleHour !== undefined && { scheduleHour: Number(body.scheduleHour) }),
      ...(body.autoPostComments !== undefined && { autoPostComments: Boolean(body.autoPostComments) }),
      ...(body.autoAddLabels !== undefined && { autoAddLabels: Boolean(body.autoAddLabels) }),
      ...(body.duplicateThreshold !== undefined && { duplicateThreshold: Number(body.duplicateThreshold) }),
      ...(body.active !== undefined && { active: Boolean(body.active) }),
    },
  });

  return NextResponse.json(repo);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.watchedRepo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
