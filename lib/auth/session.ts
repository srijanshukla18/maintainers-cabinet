import { createHmac, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";

export const SESSION_COOKIE = "cabinet_session";
const SESSION_DAYS = 30;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function hashSessionToken(token: string) {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

function expiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export function sessionCookieOptions(maxAge = SESSION_DAYS * 24 * 60 * 60) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: expiresAt(),
    },
  });
  return token;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await prisma.session.deleteMany({
    where: { tokenHash: hashSessionToken(token) },
  });
}

async function userFromToken(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return session.user;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  return userFromToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getUserFromRequest(req: NextRequest) {
  return userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
}

