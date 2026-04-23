import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "cabinet-auth";

export async function POST(req: NextRequest) {
  const configuredPassword = process.env.CABINET_PASSWORD;
  if (!configuredPassword) {
    return NextResponse.json({ error: "CABINET_PASSWORD is not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const password = typeof body.password === "string" ? body.password : "";
  if (password !== configuredPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: AUTH_COOKIE,
    value: configuredPassword,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
