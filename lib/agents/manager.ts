import { withTrace } from "@openai/agents";
import { prisma } from "../db/client";
import { getInstallationClient, addLabels, postIssueComment, postPullRequestComment, createCheckRun, updateCheckRun, ensureLabelsExist } from "../github/client";
import { runTriageAgent } from "./triage";
import { runCommunityAgent } from "./community";
import { runPrReviewAgent } from "./pr-review";
import { runDocsAgent } from "./docs";
import { runReleaseAgent } from "./release";
import type { WorkPacket } from "./types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ── run a single agent step and persist it ──────────────────────────────────

async function runStep<T>(
  runId: string,
  agentName: string,
  input: object,
  fn: () => Promise<T>
): Promise<T> {
  const step = await prisma.agentStep.create({
    data: { runId, agentName, inputJson: input, status: "running" },
  });

  try {
    const output = await fn();
    await prisma.agentStep.update({
      where: { id: step.id },
      data: { outputJson: output as object, status: "done", finishedAt: new Date() },
    });
    return output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.agentStep.update({
      where: { id: step.id },
      data: { status: "error", error: msg, finishedAt: new Date() },
    });
    throw err;
  }
}

// ── record a github action ───────────────────────────────────────────────────

async function recordAction(
  runId: string,
  actionType: string,
  target: object,
  payload: object,
  status: "success" | "error",
  githubUrl?: string
) {
  await prisma.githubAction.create({
    data: { runId, actionType, targetJson: target, payloadJson: payload, status, githubUrl },
  });
}

// ── dedup labels ──────────────────────────────────────────────────────────────

function dedup(labels: string[]): string[] {
  return [...new Set(labels)];
}

// ── MANAGER ───────────────────────────────────────────────────────────────────

export async function runManager(packet: WorkPacket): Promise<void> {
  const traceName = packet.issue
    ? `issue_triage:${packet.repoOwner}/${packet.repoName}#${packet.issue.number}`
    : packet.pr
    ? `pr_review:${packet.repoOwner}/${packet.repoName}#${packet.pr.number}`
    : `cabinet_run:${packet.runId}`;

  return withTrace(traceName, () => _runManager(packet));
}

async function _runManager(packet: WorkPacket): Promise<void> {
  const { runId, repoOwner, repoName, installationId, config } = packet;

  const octokit = await getInstallationClient(installationId);
  await ensureLabelsExist(octokit, repoOwner, repoName);

  // ── Issue triage flow ──────────────────────────────────────────────────────
  if (packet.issue) {
    const issueNumber = packet.issue.number;

    // Step 1: Triage
    const triageOutput = await runStep(runId, "triage", { issue: packet.issue }, () =>
      runTriageAgent(packet)
    );
    packet.triageOutput = triageOutput;

    // Step 2: Community
    const communityOutput = await runStep(runId, "community", { draft: triageOutput.draft_comment }, () =>
      runCommunityAgent(packet)
    );
    packet.communityOutput = communityOutput;

    // Collect all labels
    const allLabels = dedup([
      ...triageOutput.labels,
      ...communityOutput.labels,
    ]);

    // Apply labels
    if (config.autonomy.add_labels && allLabels.length > 0) {
      try {
        await addLabels(octokit, repoOwner, repoName, issueNumber, allLabels);
        await recordAction(runId, "add_labels", { issueNumber }, { labels: allLabels }, "success");
      } catch (err) {
        await recordAction(runId, "add_labels", { issueNumber }, { labels: allLabels }, "error");
      }
    }

    // Post comment
    if (config.autonomy.post_comments) {
      const body = buildIssueComment(communityOutput.final_comment, runId);
      try {
        const comment = await postIssueComment(octokit, repoOwner, repoName, issueNumber, body);
        await recordAction(runId, "post_comment", { issueNumber }, { body }, "success", comment.html_url);
      } catch (err) {
        await recordAction(runId, "post_comment", { issueNumber }, { body }, "error");
      }
    }

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "done",
        finishedAt: new Date(),
        summary: `Classified as ${triageOutput.classification} (${Math.round(triageOutput.confidence * 100)}% confidence). Labels: ${allLabels.join(", ")}.`,
      },
    });
    return;
  }

  // ── PR review flow ─────────────────────────────────────────────────────────
  if (packet.pr) {
    const prNumber = packet.pr.number;
    const headSha = packet.pr.headSha;

    // Create check run (in_progress)
    let checkRunId: number | null = null;
    try {
      const check = await createCheckRun(
        octokit, repoOwner, repoName, headSha,
        "Cabinet Review", "in_progress"
      );
      checkRunId = check.id;
      await recordAction(runId, "create_check_run", { prNumber }, { checkRunId }, "success");
    } catch (err) {
      await recordAction(runId, "create_check_run", { prNumber }, {}, "error");
    }

    // Step 1: PR Review
    const prReviewOutput = await runStep(runId, "pr_review", { pr: packet.pr }, () =>
      runPrReviewAgent(packet)
    );
    packet.prReviewOutput = prReviewOutput;

    // Step 2: Community (rewrite PR comment)
    const communityOutput = await runStep(runId, "community", { draft: prReviewOutput.recommended_comment }, () =>
      runCommunityAgent(packet)
    );
    packet.communityOutput = communityOutput;

    // Step 3: Docs
    const docsOutput = await runStep(runId, "docs", { pr: packet.pr }, () =>
      runDocsAgent(packet)
    );
    packet.docsOutput = docsOutput;

    // Step 4: Release
    const releaseOutput = await runStep(runId, "release", { pr: packet.pr }, () =>
      runReleaseAgent(packet)
    );
    packet.releaseOutput = releaseOutput;

    // Collect labels
    const allLabels = dedup([
      ...prReviewOutput.labels,
      ...communityOutput.labels,
      ...docsOutput.labels,
      ...releaseOutput.labels,
    ]);

    if (config.autonomy.add_labels && allLabels.length > 0) {
      try {
        await addLabels(octokit, repoOwner, repoName, prNumber, allLabels);
        await recordAction(runId, "add_labels", { prNumber }, { labels: allLabels }, "success");
      } catch {
        await recordAction(runId, "add_labels", { prNumber }, { labels: allLabels }, "error");
      }
    }

    // Build and post PR comment
    if (config.autonomy.post_comments) {
      const body = buildPrComment(packet, runId);
      try {
        const comment = await postPullRequestComment(octokit, repoOwner, repoName, prNumber, body);
        await recordAction(runId, "post_comment", { prNumber }, { body }, "success", comment.html_url);
      } catch {
        await recordAction(runId, "post_comment", { prNumber }, { body }, "error");
      }
    }

    // Finalize check run
    if (checkRunId) {
      const checkSummary = buildCheckRunSummary(packet, runId);
      try {
        await updateCheckRun(
          octokit, repoOwner, repoName, checkRunId,
          "completed",
          prReviewOutput.risk === "high" ? "failure" : "neutral",
          { title: `Cabinet Review — ${prReviewOutput.risk} risk`, summary: checkSummary }
        );
        await recordAction(runId, "update_check_run", { prNumber, checkRunId }, {}, "success");
      } catch {
        await recordAction(runId, "update_check_run", { prNumber, checkRunId }, {}, "error");
      }
    }

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "done",
        finishedAt: new Date(),
        summary: `PR review: ${prReviewOutput.risk} risk. Docs impact: ${docsOutput.docs_impact}. Release note: ${releaseOutput.release_note_needed}.`,
      },
    });
    return;
  }

  // ── Workflow failure ───────────────────────────────────────────────────────
  if (packet.workflowRun?.prNumber) {
    const prNumber = packet.workflowRun.prNumber;
    const body = buildWorkflowFailureComment(packet, runId);
    if (config.autonomy.post_comments) {
      try {
        await postPullRequestComment(octokit, repoOwner, repoName, prNumber, body);
        await recordAction(runId, "post_comment", { prNumber }, { body }, "success");
      } catch {
        await recordAction(runId, "post_comment", { prNumber }, { body }, "error");
      }
    }
    await prisma.run.update({
      where: { id: runId },
      data: { status: "done", finishedAt: new Date(), summary: `CI failure summary posted.` },
    });
    return;
  }

  // fallback
  await prisma.run.update({
    where: { id: runId },
    data: { status: "done", finishedAt: new Date(), summary: "No action taken." },
  });
}

// ── comment builders ──────────────────────────────────────────────────────────

function buildIssueComment(finalComment: string, runId: string): string {
  return `${finalComment}\n\n_Cabinet run: [\`${runId}\`](${APP_URL}/runs/${runId})_`;
}

function buildPrComment(packet: WorkPacket, runId: string): string {
  const { prReviewOutput, docsOutput, releaseOutput, communityOutput } = packet;
  const lines: string[] = ["## Cabinet Review\n"];

  if (communityOutput?.final_comment) {
    lines.push(communityOutput.final_comment);
    lines.push("");
  }

  if (prReviewOutput) {
    lines.push(`**Risk:** ${prReviewOutput.risk}`);
    if (prReviewOutput.findings.length > 0) {
      lines.push("\n**Findings:**");
      for (const f of prReviewOutput.findings) {
        lines.push(`- [${f.severity}] **${f.title}**: ${f.evidence}`);
      }
    }
  }

  if (docsOutput?.docs_impact) {
    lines.push(`\n**Docs impact:** ${docsOutput.affected_docs.join(", ")} may need updating.`);
  }

  if (releaseOutput?.release_note_needed) {
    lines.push(`\n**Release note draft:** ${releaseOutput.release_note_draft}`);
  }

  lines.push(`\n_Cabinet run: [\`${runId}\`](${APP_URL}/runs/${runId})_`);
  return lines.join("\n");
}

function buildCheckRunSummary(packet: WorkPacket, runId: string): string {
  const { prReviewOutput, docsOutput, releaseOutput } = packet;
  const lines: string[] = [];

  if (prReviewOutput) {
    lines.push(`**Risk:** ${prReviewOutput.risk}\n`);
    lines.push(prReviewOutput.summary + "\n");
    if (prReviewOutput.findings.length > 0) {
      lines.push("**Findings:**");
      for (const f of prReviewOutput.findings) {
        lines.push(`- [${f.severity}] ${f.title}`);
      }
    }
  }

  if (docsOutput?.docs_impact) {
    lines.push(`\n**Docs impact:** ${docsOutput.affected_docs.join(", ")}`);
  }

  if (releaseOutput?.release_note_needed) {
    lines.push(`\n**Release note needed** (${releaseOutput.version_impact}): ${releaseOutput.release_note_draft}`);
  }

  lines.push(`\n[View trace](${APP_URL}/runs/${runId})`);
  return lines.join("\n");
}

function buildWorkflowFailureComment(packet: WorkPacket, runId: string): string {
  const { workflowRun } = packet;
  const lines = [
    "The latest CI run failed.\n",
    `**Workflow:** ${workflowRun?.name ?? "unknown"}`,
  ];
  if (workflowRun?.failedJobs.length) {
    lines.push("\n**Failed jobs:**");
    for (const j of workflowRun.failedJobs) {
      lines.push(`- ${j}`);
    }
  }
  lines.push(`\n_Cabinet run: [\`${runId}\`](${APP_URL}/runs/${runId})_`);
  return lines.join("\n");
}
