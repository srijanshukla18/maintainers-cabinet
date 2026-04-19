import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { runEvalCase } from "@/lib/evals/runner";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const caseId: string | undefined = body.caseId;

  const cases = caseId
    ? await prisma.evalCase.findMany({ where: { id: caseId } })
    : await prisma.evalCase.findMany();

  const results = [];
  for (const c of cases) {
    const result = await runEvalCase(c);
    results.push(result);
  }

  return NextResponse.json({ results, passed: results.filter((r) => r.passed).length, total: results.length });
}
