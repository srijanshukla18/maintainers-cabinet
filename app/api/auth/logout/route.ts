import { NextRequest, NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}

