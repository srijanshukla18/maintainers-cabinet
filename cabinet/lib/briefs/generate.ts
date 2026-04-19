/**
 * Morning Brief orchestrator.
 *
 * Flow:
 * 1. Ensure repo record exists (public mode)
 * 2. Fetch issues + PRs + commits via gh CLI
 * 3. Run Triage + PR Review agents across the queue
 * 4. Run Priority Agent to rank top items
 * 5. Run Briefing Agent to write the email
 * 6. Persist brief + full trace
 */

import { withTrace } from "@openai/agents";
import { prisma } from "../db/client";
import {
  getRepoInfo,
  listOpenIssues,
  listOpenPRs,
  listRecentCommits,
  type PublicIssue,
  type PublicPR,
  type PublicRepo,
  type PublicCommit,
} from "../github/public";
import { runTriageAgentDetailed } from "../agents/triage";
import { runPrReviewAgentDetailed } from "../agents/pr-review";
import { runPriorityAgentDetailed } from "../agents/priority";
import {
  runBriefingAgentDetailed,
  renderBriefMarkdown,
  renderBriefHtml,
} from "../agents/briefing";
import {
  DEFAULT_CONFIG,
  type WorkPacket,
  type TriageOutput,
  type PrReviewOutput,
  type PriorityOutput,
  type BriefingOutput,
} from "../agents/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DEFAULT_CACHE_MINUTES = 360;

export interface GenerateBriefOptions {
  owner: string;
  name: string;
  maxIssuesToTriage?: number;
  maxPrsToReview?: number;
}

export async function findCachedBrief(
  owner: string,
  name: string,
  maxAgeMinutes = DEFAULT_CACHE_MINUTES
) {
  const repo = await prisma.repo.findUnique({
    where: { owner_name: { owner, name } },
  });

  if (!repo) return null;

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  return prisma.brief.findFirst({
    where: {
      repoId: repo.id,
      generatedAt: { gte: cutoff },
      status: "done",
    },
    orderBy: { generatedAt: "desc" },
  });
}

export async function generateBrief(opts: GenerateBriefOptions) {
  const startTime = Date.now();
  return withTrace(`morning_brief:${opts.owner}/${opts.name}`, () =>
    _generateBrief(opts, startTime)
  );
}

async function _generateBrief(opts: GenerateBriefOptions, startTime: number) {
  const repoInfo = getRepoInfo(opts.owner, opts.name);
  let repo = await prisma.repo.findUnique({
    where: { owner_name: { owner: opts.owner, name: opts.name } },
  });

  if (!repo) {
    repo = await prisma.repo.create({
      data: {
        owner: opts.owner,
        name: opts.name,
        defaultBranch: repoInfo.defaultBranch,
        accessMode: "public",
      },
    });
  }

  const brief = await prisma.brief.create({
    data: {
      repoId: repo.id,
      subject: `Generating brief for ${opts.owner}/${opts.name}...`,
      bodyMarkdown: "",
      bodyHtml: "",
      contextJson: {},
      prioritiesJson: {},
      status: "pending",
      runIds: [],
    },
  });

  const [issues, prs, commits] = await Promise.all([
    timedStep(() => listOpenIssues(opts.owner, opts.name, 60)),
    timedStep(() => listOpenPRs(opts.owner, opts.name, 60)),
    timedStep(() => listRecentCommits(opts.owner, opts.name, 10)),
  ]);

  await Promise.all([
    recordBriefStep({
      briefId: brief.id,
      stepType: "fetch_repo",
      stepName: `Repo metadata for ${opts.owner}/${opts.name}`,
      inputJson: { owner: opts.owner, name: opts.name },
      outputJson: repoInfo,
      latencyMs: 0,
    }),
    recordBriefStep({
      briefId: brief.id,
      stepType: "fetch_issues",
      stepName: `Fetched ${issues.value.length} open issues`,
      inputJson: { owner: opts.owner, name: opts.name, limit: 60 },
      outputJson: issues.value,
      latencyMs: issues.latencyMs,
    }),
    recordBriefStep({
      briefId: brief.id,
      stepType: "fetch_prs",
      stepName: `Fetched ${prs.value.length} open PRs`,
      inputJson: { owner: opts.owner, name: opts.name, limit: 60 },
      outputJson: prs.value,
      latencyMs: prs.latencyMs,
    }),
    recordBriefStep({
      briefId: brief.id,
      stepType: "fetch_commits",
      stepName: `Fetched ${commits.value.length} recent commits`,
      inputJson: { owner: opts.owner, name: opts.name, limit: 10 },
      outputJson: commits.value,
      latencyMs: commits.latencyMs,
    }),
  ]);

  const issueLimit = Math.min(opts.maxIssuesToTriage ?? 25, issues.value.length);
  const prLimit = Math.min(opts.maxPrsToReview ?? 20, prs.value.length);

  const issuesToTriage = [...issues.value]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, issueLimit);

  const prsToReview = [...prs.value]
    .filter((p) => !p.isDraft)
    .sort((a, b) => b.daysStale - a.daysStale)
    .slice(0, prLimit);

  const triageOutputs = await Promise.all(
    issuesToTriage.map((issue) => triageOne(brief.id, issue))
  );

  const reviewOutputs = await Promise.all(
    prsToReview.map((pr) => reviewOne(brief.id, opts.owner, opts.name, pr))
  );

  const issuesWithTriage = issues.value.map((issue) => {
    const detailed = triageOutputs.find((t) => t.issueNumber === issue.number);
    return {
      ...issue,
      triage: detailed?.output,
      traceStepId: detailed?.stepId,
    };
  });

  const prsWithReview = prs.value.map((pr) => {
    const detailed = reviewOutputs.find((r) => r.prNumber === pr.number);
    return {
      ...pr,
      review: detailed?.output,
      traceStepId: detailed?.stepId,
    };
  });

  const recentCommitSummary = commits.value
    .slice(0, 5)
    .map((c) => `${c.sha} ${c.message} (${c.author})`)
    .join("\n");

  const priorityDetailed = await timedStep(() =>
    runPriorityAgentDetailed({
      repo: repoInfo,
      issues: issuesWithTriage,
      prs: prsWithReview,
      recentCommitSummary,
    })
  );

  await recordBriefStep({
    briefId: brief.id,
    stepType: "priority",
    stepName: "Priority agent ranked today’s queue",
    inputJson: {
      repo: repoInfo,
      issuesCount: issuesWithTriage.length,
      prsCount: prsWithReview.length,
      recentCommitSummary,
    },
    outputJson: priorityDetailed.value.output,
    traceJson: priorityDetailed.value.trace,
    latencyMs: priorityDetailed.latencyMs,
  });

  const briefingDetailed = await timedStep(() =>
    runBriefingAgentDetailed(repoInfo, priorityDetailed.value.output)
  );

  await recordBriefStep({
    briefId: brief.id,
    stepType: "briefing",
    stepName: "Briefing agent wrote the maintainer email",
    inputJson: {
      repo: repoInfo,
      priority: priorityDetailed.value.output,
    },
    outputJson: briefingDetailed.value.output,
    traceJson: briefingDetailed.value.trace,
    latencyMs: briefingDetailed.latencyMs,
  });

  const bodyMarkdown = renderBriefMarkdown(
    briefingDetailed.value.output,
    issuesWithTriage,
    prsWithReview
  );
  const bodyHtml = renderBriefHtml(
    briefingDetailed.value.output,
    `${APP_URL}/briefs/${brief.id}`,
    issuesWithTriage,
    prsWithReview
  );

  const finalBrief = await prisma.brief.update({
    where: { id: brief.id },
    data: {
      subject: briefingDetailed.value.output.subject,
      bodyMarkdown,
      bodyHtml,
      contextJson: {
        repo: repoInfo,
        issuesCount: issues.value.length,
        prsCount: prs.value.length,
        commitsCount: commits.value.length,
        triagedCount: triageOutputs.length,
        reviewedCount: reviewOutputs.length,
        issueLimit,
        prLimit,
        issues: issuesWithTriage,
        prs: prsWithReview,
        commits: commits.value,
      } as object,
      prioritiesJson: priorityDetailed.value.output as unknown as object,
      latencyMs: Date.now() - startTime,
      status: "done",
    },
    include: { traceSteps: true, repo: true },
  });

  return finalBrief;
}

async function triageOne(briefId: string, issue: PublicIssue) {
  const packet: WorkPacket = {
    runId: `brief_triage_${issue.number}`,
    repoOwner: "",
    repoName: "",
    installationId: 0,
    config: DEFAULT_CONFIG,
    issue: {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      author: issue.author,
      labels: issue.labels,
      similarIssues: [],
    },
  };

  try {
    const detailed = await timedStep(() => runTriageAgentDetailed(packet));
    const step = await recordBriefStep({
      briefId,
      stepType: "triage_issue",
      stepName: `Triage issue #${issue.number}`,
      targetRef: `#${issue.number}`,
      inputJson: issue,
      outputJson: detailed.value.output,
      traceJson: detailed.value.trace,
      latencyMs: detailed.latencyMs,
    });
    return { issueNumber: issue.number, output: detailed.value.output, stepId: step.id };
  } catch (error) {
    await recordBriefStep({
      briefId,
      stepType: "triage_issue",
      stepName: `Triage issue #${issue.number}`,
      targetRef: `#${issue.number}`,
      inputJson: issue,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      issueNumber: issue.number,
      output: undefined,
      stepId: undefined,
    };
  }
}

async function reviewOne(briefId: string, owner: string, repo: string, pr: PublicPR) {
  const packet: WorkPacket = {
    runId: `brief_review_${pr.number}`,
    repoOwner: owner,
    repoName: repo,
    installationId: 0,
    config: DEFAULT_CONFIG,
    pr: {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      author: pr.author,
      headSha: "",
      changedFiles: [{ filename: `(${pr.changedFiles} files changed)`, status: "modified" }],
      ciStatus: pr.statusCheckRollup ?? undefined,
    },
  };

  try {
    const detailed = await timedStep(() => runPrReviewAgentDetailed(packet));
    const step = await recordBriefStep({
      briefId,
      stepType: "review_pr",
      stepName: `Review PR #${pr.number}`,
      targetRef: `PR #${pr.number}`,
      inputJson: pr,
      outputJson: detailed.value.output,
      traceJson: detailed.value.trace,
      latencyMs: detailed.latencyMs,
    });
    return { prNumber: pr.number, output: detailed.value.output, stepId: step.id };
  } catch (error) {
    await recordBriefStep({
      briefId,
      stepType: "review_pr",
      stepName: `Review PR #${pr.number}`,
      targetRef: `PR #${pr.number}`,
      inputJson: pr,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      prNumber: pr.number,
      output: undefined,
      stepId: undefined,
    };
  }
}

async function recordBriefStep(input: {
  briefId: string;
  stepType: string;
  stepName: string;
  targetRef?: string;
  status?: string;
  inputJson: unknown;
  outputJson?: unknown;
  traceJson?: unknown;
  latencyMs?: number;
  error?: string;
}) {
  return prisma.briefTraceStep.create({
    data: {
      briefId: input.briefId,
      stepType: input.stepType,
      stepName: input.stepName,
      targetRef: input.targetRef,
      status: input.status ?? "done",
      inputJson: json(input.inputJson),
      outputJson: input.outputJson === undefined ? undefined : json(input.outputJson),
      traceJson: input.traceJson === undefined ? undefined : json(input.traceJson),
      latencyMs: input.latencyMs,
      error: input.error,
      finishedAt: new Date(),
    },
  });
}

function json(value: unknown): object {
  return JSON.parse(JSON.stringify(value ?? {})) as object;
}

async function timedStep<T>(fn: () => Promise<T> | T): Promise<{ value: T; latencyMs: number }> {
  const startedAt = Date.now();
  const value = await fn();
  return { value, latencyMs: Date.now() - startedAt };
}

export type BriefContextJson = {
  repo: PublicRepo;
  issuesCount: number;
  prsCount: number;
  commitsCount: number;
  triagedCount: number;
  reviewedCount: number;
  issueLimit: number;
  prLimit: number;
  issues: Array<PublicIssue & { triage?: TriageOutput; traceStepId?: string }>;
  prs: Array<PublicPR & { review?: PrReviewOutput; traceStepId?: string }>;
  commits: PublicCommit[];
};

export type BriefPriorityJson = PriorityOutput;
export type BriefOutputJson = BriefingOutput;
