import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const all = await prisma.evalResult.findMany({
    orderBy: { createdAt: "asc" },
    select: { passed: true, createdAt: true },
  });

  if (all.length === 0) return NextResponse.json([]);

  // Group into runs: new run when gap between consecutive results > 2 min
  const runs: Array<{ runAt: string; passed: number; total: number; rate: number }> = [];
  let group: typeof all = [];

  for (let i = 0; i < all.length; i++) {
    group.push(all[i]);
    const next = all[i + 1];
    const gap = next
      ? new Date(next.createdAt).getTime() - new Date(all[i].createdAt).getTime()
      : Infinity;

    if (gap > 2 * 60 * 1000) {
      const passed = group.filter((r) => r.passed).length;
      runs.push({
        runAt: group[0].createdAt.toISOString(),
        passed,
        total: group.length,
        rate: Math.round((passed / group.length) * 100),
      });
      group = [];
    }
  }

  return NextResponse.json(runs);
}
