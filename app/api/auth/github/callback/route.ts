import { Octokit } from "@octokit/rest";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const STATE_COOKIE = "cabinet_oauth_state";
const NEXT_COOKIE = "cabinet_oauth_next";

function baseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
}

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

type GitHubToken = {
  access_token: string;
  token_type?: string;
  scope?: string;
};

async function exchangeCode(req: NextRequest, code: string): Promise<GitHubToken> {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${baseUrl(req)}/api/auth/github/callback`,
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? "GitHub OAuth token exchange failed");
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    scope: data.scope,
  };
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid GitHub OAuth callback" }, { status: 401 });
  }

  try {
    const token = await exchangeCode(req, code);
    const accessToken = token.access_token;
    const octokit = new Octokit({ auth: accessToken });
    const { data: githubUser } = await octokit.users.getAuthenticated();

    const user = await prisma.user.upsert({
      where: { githubUserId: BigInt(githubUser.id) },
      create: {
        githubUserId: BigInt(githubUser.id),
        login: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        githubAccessToken: accessToken,
        tokenType: token.token_type,
        scope: token.scope,
      },
      update: {
        login: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        githubAccessToken: accessToken,
        tokenType: token.token_type,
        scope: token.scope,
      },
    });

    const sessionToken = await createSession(user.id);
    const response = NextResponse.redirect(new URL(safeNext(req.cookies.get(NEXT_COOKIE)?.value), req.url));
    response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(NEXT_COOKIE);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
