import { NextRequest, NextResponse } from "next/server";
import { findCachedBrief, generateBrief } from "@/lib/briefs/generate";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min

function parseRepoInput(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "");
  // URL form
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (urlMatch) return { owner: urlMatch[1], name: urlMatch[2] };
  // owner/name form
  const slashMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) return { owner: slashMatch[1], name: slashMatch[2] };
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const repoInput: string = body.repo ?? "";
  const forceRefresh: boolean = Boolean(body.forceRefresh);

  const parsed = parseRepoInput(repoInput);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid repo input. Use 'owner/name' or GitHub URL." }, { status: 400 });
  }

  try {
    if (!forceRefresh) {
      const cached = await findCachedBrief(parsed.owner, parsed.name);
      if (cached) {
        return NextResponse.json({ id: cached.id, cached: true });
      }
    }

    const brief = await generateBrief({ owner: parsed.owner, name: parsed.name });
    return NextResponse.json({ id: brief.id, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[briefs/generate] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
