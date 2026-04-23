import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const STATE_COOKIE = "cabinet_oauth_state";
const NEXT_COOKIE = "cabinet_oauth_next";

function baseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
}

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GITHUB_OAUTH_CLIENT_ID is not configured" }, { status: 503 });
  }

  const state = randomBytes(24).toString("hex");
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${baseUrl(req)}/api/auth/github/callback`);
  authorizeUrl.searchParams.set("scope", "read:user");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  };
  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(NEXT_COOKIE, safeNext(req.nextUrl.searchParams.get("next")), cookieOptions);
  return response;
}

