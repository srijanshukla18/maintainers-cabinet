import { NextRequest, NextResponse } from "next/server";

const PASSWORD = process.env.CABINET_PASSWORD ?? "cabinet2026";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = body.password ?? "";

  if (password !== PASSWORD) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("cabinet_auth", PASSWORD, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
  return res;
}
