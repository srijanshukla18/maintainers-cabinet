import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;

  const repoRecord = await prisma.repo.findUnique({
    where: { owner_name: { owner, name: repo } },
  });

  if (!repoRecord) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const runs = await prisma.run.findMany({
    where: { repoId: repoRecord.id },
    orderBy: { startedAt: "desc" },
    take: 20,
    include: {
      githubActions: true,
      agentSteps: { select: { agentName: true, status: true } },
    },
  });

  return NextResponse.json({
    repo: {
      id: repoRecord.id,
      owner: repoRecord.owner,
      name: repoRecord.name,
      defaultBranch: repoRecord.defaultBranch,
    },
    runs,
  });
}
