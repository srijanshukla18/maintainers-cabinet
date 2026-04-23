/**
 * Job processor — runs cabinet workflows for a pending github_event.
 * Called directly from the webhook handler (background, no BullMQ).
 */

import { prisma } from "../db/client";
import { getInstallationClient, getRepoConfig, searchIssues, getPullRequest, getPullRequestFiles, listMergedPullRequests } from "../github/client";
import { parseConfig } from "../github/config";
import { runManager } from "../agents/manager";
import type { WorkPacket } from "../agents/types";

export async function processEvent(githubEventId: string): Promise<void> {
  const event = await prisma.githubEvent.findUnique({
    where: { id: githubEventId },
    include: { repo: true },
  });

  if (!event) throw new Error(`Event ${githubEventId} not found`);
  if (event.status === "done") return;

  await prisma.githubEvent.update({
    where: { id: githubEventId },
    data: { status: "processing" },
  });

  try {
    const { repo } = event;
    const payload = event.payloadJson as Record<string, unknown>;
    const installationId = Number(repo.installationId);

    const octokit = await getInstallationClient(installationId);

    // Load config
    const rawConfig = await getRepoConfig(octokit, repo.owner, repo.name);
    const config = parseConfig(rawConfig);

    // Create run
    const run = await prisma.run.create({
      data: {
        repoId: repo.id,
        githubEventId: event.id,
        runType: mapEventToRunType(event.eventType),
        status: "running",
        triggerSource: "webhook",
        githubTargetType: getTargetType(event.eventType),
        githubTargetNumber: getTargetNumber(payload, event.eventType),
      },
    });

    const basePacket: WorkPacket = {
      runId: run.id,
      repoOwner: repo.owner,
      repoName: repo.name,
      installationId,
      config,
    };

    // ── Feature flag: webhook auto-processing (default off) ────────────────
    // Slash commands (/cabinet ...) always run regardless of this flag.
    const webhookProcessingEnabled = process.env.CABINET_WEBHOOK_PROCESSING === "true";

    // ── Route event ────────────────────────────────────────────────────────
    if (event.eventType === "issues" && event.action === "opened") {
      if (!webhookProcessingEnabled) {
        await prisma.run.update({ where: { id: run.id }, data: { status: "done", finishedAt: new Date(), summary: "Webhook auto-processing disabled (CABINET_WEBHOOK_PROCESSING != true). Event stored for audit." } });
      } else {
        const issuePayload = payload as { issue: { number: number; title: string; body: string; user: { login: string }; labels: Array<{ name: string }> } };
        const issue = issuePayload.issue;
        const similarRaw = await searchIssues(octokit, repo.owner, repo.name, issue.title.split(" ").slice(0, 5).join(" "));

        basePacket.issue = {
          number: issue.number,
          title: issue.title,
          body: issue.body ?? "",
          author: issue.user.login,
          labels: (issue.labels ?? []).map((l) => l.name),
          similarIssues: similarRaw
            .filter((s) => s.number !== issue.number)
            .slice(0, 3)
            .map((s) => ({ number: s.number, title: s.title })),
        };

        await runManager(basePacket);
      }
    } else if (
      event.eventType === "issue_comment" &&
      event.action === "created"
    ) {
      await handleSlashCommand(event.id, payload, basePacket, octokit, { id: repo.id, owner: repo.owner, name: repo.name });
      // Mark the initial run as done — handleSlashCommand creates its own run for actual slash commands
      await prisma.run.update({ where: { id: run.id }, data: { status: "done", finishedAt: new Date(), summary: "Routed to slash command handler." } });
    } else if (
      (event.eventType === "pull_request" && event.action === "opened") ||
      (event.eventType === "pull_request" && event.action === "synchronize")
    ) {
      if (!webhookProcessingEnabled) {
        await prisma.run.update({ where: { id: run.id }, data: { status: "done", finishedAt: new Date(), summary: "Webhook auto-processing disabled (CABINET_WEBHOOK_PROCESSING != true). Event stored for audit." } });
      } else {
        const prPayload = payload as { pull_request: { number: number; title: string; body: string; user: { login: string }; head: { sha: string } } };
        const pr = prPayload.pull_request;
        const files = await getPullRequestFiles(octokit, repo.owner, repo.name, pr.number);

        basePacket.pr = {
          number: pr.number,
          title: pr.title,
          body: pr.body ?? "",
          author: pr.user.login,
          headSha: pr.head.sha,
          changedFiles: files.map((f) => ({
            filename: f.filename,
            status: f.status,
            patch: f.patch,
          })),
        };

        await runManager(basePacket);
      }
    } else if (
      event.eventType === "workflow_run" &&
      event.action === "completed"
    ) {
      if (!webhookProcessingEnabled) {
        await prisma.run.update({ where: { id: run.id }, data: { status: "done", finishedAt: new Date(), summary: "Webhook auto-processing disabled (CABINET_WEBHOOK_PROCESSING != true). Event stored for audit." } });
      } else {
        const wfPayload = payload as { workflow_run: { conclusion: string; name: string; pull_requests?: Array<{ number: number }> }; workflow_run_jobs?: Array<{ conclusion: string; name: string }> };
        const wf = wfPayload.workflow_run;
        if (wf.conclusion !== "failure") {
          await prisma.run.update({ where: { id: run.id }, data: { status: "done", finishedAt: new Date(), summary: "Workflow succeeded — no action." } });
        } else {
          basePacket.workflowRun = {
            conclusion: wf.conclusion,
            name: wf.name,
            failedJobs: [],
            prNumber: wf.pull_requests?.[0]?.number,
          };
          await runManager(basePacket);
        }
      }
    } else {
      await prisma.run.update({ where: { id: run.id }, data: { status: "done", finishedAt: new Date(), summary: "Unhandled event type." } });
    }

    await prisma.githubEvent.update({
      where: { id: githubEventId },
      data: { status: "done", processedAt: new Date() },
    });
  } catch (err) {
    await prisma.githubEvent.update({
      where: { id: githubEventId },
      data: { status: "error" },
    });
    throw err;
  }
}

// ── Slash command dispatcher ─────────────────────────────────────────────────

async function handleSlashCommand(
  eventId: string,
  payload: Record<string, unknown>,
  basePacket: WorkPacket,
  octokit: Awaited<ReturnType<typeof getInstallationClient>>,
  repo: { id: string; owner: string; name: string }
) {
  const commentPayload = payload as {
    comment: { body: string; user: { login: string } };
    issue: { number: number; title?: string; body?: string; pull_request?: unknown };
  };
  const body = commentPayload.comment.body.trim();
  const commenter = commentPayload.comment.user.login;
  const issueNumber = commentPayload.issue.number;

  if (!body.startsWith("/cabinet ")) return;

  const command = body.replace("/cabinet ", "").trim();
  const targetType = commentPayload.issue.pull_request ? "pr" : "issue";

  // Supported commands
  const allowed = ["triage", "review", "docs-impact", "release-plan", "explain"];
  const cmd = command.split(" ")[0];
  if (!allowed.includes(cmd)) return;

  const run = await prisma.run.create({
    data: {
      repoId: repo.id,
      githubEventId: eventId,
      runType: "slash_command",
      status: "running",
      triggerSource: "slash_command",
      githubTargetType: targetType,
      githubTargetNumber: issueNumber,
    },
  });

  basePacket.runId = run.id;
  basePacket.slashCommand = { command: cmd, commenter, issueOrPrNumber: issueNumber, targetType };

  if (cmd === "triage" || cmd === "explain") {
    const issue = commentPayload.issue;
    const similarRaw = await searchIssues(octokit, repo.owner, repo.name, (issue.title ?? "").split(" ").slice(0, 5).join(" "));
    basePacket.issue = {
      number: issueNumber,
      title: issue.title ?? "",
      body: issue.body ?? "",
      author: commenter,
      labels: [],
      similarIssues: similarRaw.filter((s) => s.number !== issueNumber).slice(0, 3).map((s) => ({ number: s.number, title: s.title })),
    };
  } else if (cmd === "review" || cmd === "docs-impact") {
    const prData = await getPullRequest(octokit, repo.owner, repo.name, issueNumber).catch(() => null);
    if (prData) {
      const files = await getPullRequestFiles(octokit, repo.owner, repo.name, issueNumber);
      basePacket.pr = {
        number: prData.number,
        title: prData.title,
        body: prData.body ?? "",
        author: prData.user?.login ?? commenter,
        headSha: prData.head.sha,
        changedFiles: files.map((f) => ({ filename: f.filename, status: f.status, patch: f.patch })),
      };
    }
  } else if (cmd === "release-plan") {
    // Fetch merged PRs since last tag and build a release plan
    const mergedPRs = await listMergedPullRequests(octokit, repo.owner, repo.name);
    if (mergedPRs.length > 0) {
      const pr = mergedPRs[0];
      basePacket.pr = {
        number: pr.number,
        title: pr.title,
        body: pr.body ?? "",
        author: pr.user?.login ?? "",
        headSha: pr.merge_commit_sha ?? "",
        changedFiles: [],
      };
    }
  }

  await runManager(basePacket);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function mapEventToRunType(eventType: string): string {
  if (eventType === "issues") return "issue_triage";
  if (eventType === "pull_request") return "pr_review";
  if (eventType === "workflow_run") return "workflow_failure";
  if (eventType === "issue_comment") return "slash_command";
  return "unknown";
}

function getTargetType(eventType: string): string | undefined {
  if (eventType === "issues" || eventType === "issue_comment") return "issue";
  if (eventType === "pull_request" || eventType === "workflow_run") return "pull_request";
  return undefined;
}

function getTargetNumber(payload: Record<string, unknown>, eventType: string): number | undefined {
  if (eventType === "issues") {
    return (payload.issue as { number?: number })?.number;
  }
  if (eventType === "pull_request") {
    return (payload.pull_request as { number?: number })?.number;
  }
  if (eventType === "issue_comment") {
    return (payload.issue as { number?: number })?.number;
  }
  return undefined;
}
