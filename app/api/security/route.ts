import { NextRequest, NextResponse } from "next/server";
import { verifySignedRequest } from "@/lib/http/signature";
import { ingestSecurityAlert } from "@/lib/security/verdicts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureError = verifySignedRequest(req, rawBody);
  if (signatureError) return signatureError;

  const body = (JSON.parse(rawBody || "{}") as Record<string, unknown>);
  const repoOwner = typeof body.repoOwner === "string" ? body.repoOwner : "";
  const repoName = typeof body.repoName === "string" ? body.repoName : "";
  const advisoryRef = typeof body.advisoryRef === "string" ? body.advisoryRef : "";
  const packageName = typeof body.packageName === "string" ? body.packageName : "";
  const severity = typeof body.severity === "string" ? body.severity : "";
  const summary = typeof body.summary === "string" ? body.summary : "";

  if (!repoOwner || !repoName || !advisoryRef || !packageName || !severity || !summary) {
    return NextResponse.json({ error: "Missing required security alert fields" }, { status: 400 });
  }

  const result = await ingestSecurityAlert({
    repoOwner,
    repoName,
    advisoryRef,
    packageName,
    severity,
    manifestPath: typeof body.manifestPath === "string" ? body.manifestPath : null,
    reachableHint: typeof body.reachableHint === "boolean" ? body.reachableHint : null,
    summary,
  });

  return NextResponse.json({ ok: true, ...result });
}
