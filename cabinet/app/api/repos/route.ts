import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const repos = await prisma.repo.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { runs: true } },
    },
  });
  type RepoWithCount = (typeof repos)[number];
  return NextResponse.json(
    repos.map((r: RepoWithCount) => ({
      id: r.id,
      owner: r.owner,
      name: r.name,
      defaultBranch: r.defaultBranch,
      runCount: r._count.runs,
      updatedAt: r.updatedAt,
    }))
  );
}
