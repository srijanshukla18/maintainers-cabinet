/**
 * POST /api/webhook
 * Receives GitHub App webhook events.
 * Verifies signature, deduplicates, stores, and triggers background processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/client";
import { processEvent } from "@/lib/worker/processor";

export const runtime = "nodejs";

// GitHub signs payloads with HMAC-SHA256
function verifySignature(secret: string, signature: string, body: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const deliveryId = req.headers.get("x-github-delivery") ?? "";
  const eventType = req.headers.get("x-github-event") ?? "";
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  const rawBody = await req.text();

  // Verify signature
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return NextResponse.json({ error: "GITHUB_WEBHOOK_SECRET is not configured" }, { status: 503 });
  }
  if (!verifySignature(secret, signature, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = (payload.action as string) ?? null;

  // Identify installation and repo
  const installation = payload.installation as { id: number } | undefined;
  const repository = payload.repository as { id: number; owner: { login: string }; name: string; default_branch?: string } | undefined;

  if (!installation || !repository) {
    // App install/uninstall events
    if (eventType === "installation") {
      await handleInstallation(payload);
    }
    return NextResponse.json({ ok: true });
  }

  // Find or create repo record
  const repo = await prisma.repo.upsert({
    where: { githubRepoId: BigInt(repository.id) },
    create: {
      githubRepoId: BigInt(repository.id),
      owner: repository.owner.login,
      name: repository.name,
      installationId: BigInt(installation.id),
      defaultBranch: repository.default_branch ?? "main",
    },
    update: {
      installationId: BigInt(installation.id),
    },
  });

  // Deduplicate by delivery ID
  const existing = await prisma.githubEvent.findUnique({ where: { deliveryId } });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Only process events we care about
  const handledEvents = [
    "issues",
    "issue_comment",
    "pull_request",
    "workflow_run",
  ];

  if (!handledEvents.includes(eventType)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Filter actions we care about
  const handledActions: Record<string, string[]> = {
    issues: ["opened"],
    issue_comment: ["created"],
    pull_request: ["opened", "synchronize"],
    workflow_run: ["completed"],
  };

  if (action && !handledActions[eventType]?.includes(action)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Store event
  const githubEvent = await prisma.githubEvent.create({
    data: {
      repoId: repo.id,
      deliveryId,
      eventType,
      action,
      payloadJson: payload as object,
      status: "pending",
    },
  });

  // Process async (fire and forget — Next.js keeps the process alive)
  void processEvent(githubEvent.id).catch((err) => {
    console.error(`[webhook] processEvent failed for ${githubEvent.id}:`, err);
  });

  return NextResponse.json({ ok: true, eventId: githubEvent.id });
}

async function handleInstallation(payload: Record<string, unknown>) {
  const installation = payload.installation as { id: number; account: { login: string } };
  const action = payload.action as string;
  const repos = (payload.repositories as Array<{ id: number; name: string; default_branch?: string }>) ?? [];

  if (action === "created" || action === "added") {
    for (const r of repos) {
      await prisma.repo.upsert({
        where: { githubRepoId: BigInt(r.id) },
        create: {
          githubRepoId: BigInt(r.id),
          owner: installation.account.login,
          name: r.name,
          installationId: BigInt(installation.id),
          defaultBranch: r.default_branch ?? "main",
        },
        update: { installationId: BigInt(installation.id) },
      });
    }
  }
}
