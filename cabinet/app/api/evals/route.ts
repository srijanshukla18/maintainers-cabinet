import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const cases = await prisma.evalCase.findMany({
    orderBy: { caseType: "asc" },
    include: {
      evalResults: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json(cases);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, caseType, inputJson, expectedJson } = body;

  const evalCase = await prisma.evalCase.upsert({
    where: { name },
    create: { name, caseType, inputJson, expectedJson },
    update: { caseType, inputJson, expectedJson },
  });

  return NextResponse.json(evalCase);
}
