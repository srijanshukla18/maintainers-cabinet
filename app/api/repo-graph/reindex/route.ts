import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const owner = typeof body.owner === "string" ? body.owner : "";
  const name = typeof body.name === "string" ? body.name : "";

  if (!owner || !name) {
    return NextResponse.json({ error: "Missing owner or repo name" }, { status: 400 });
  }

  try {
    const execution = await prisma.executionRecord.create({
      data: {
        executorKind: "repo-graph",
        status: "pending",
        summary: `Queued repo graph rebuild for ${owner}/${name}.`,
        payloadJson: {
          owner,
          name,
          revision: typeof body.revision === "string" ? body.revision : null,
        } as object,
      },
    });
    return NextResponse.json({ ok: true, queued: true, executionId: execution.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
