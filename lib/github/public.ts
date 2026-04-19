/**
 * Public GitHub data fetcher — uses the local `gh` CLI.
 * Works for any public repo without needing a GitHub App install.
 */

import { execFileSync } from "child_process";

function gh(args: string[]): string {
  return execFileSync("gh", args, {
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function ghJson<T = unknown>(args: string[]): T {
  return JSON.parse(gh(args));
}

// ── Repo metadata ────────────────────────────────────────────────────────────

export interface PublicRepo {
  owner: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  openIssuesCount: number;
  language: string | null;
}

export function getRepoInfo(owner: string, repo: string): PublicRepo {
  const data = ghJson<{
    name: string;
    description: string;
    defaultBranchRef: { name: string };
    stargazerCount: number;
    issues: { totalCount: number };
    languages: Array<{ node: { name: string } }>;
  }>([
    "repo",
    "view",
    `${owner}/${repo}`,
    "--json",
    "name,description,defaultBranchRef,stargazerCount,issues,languages",
  ]);
  return {
    owner,
    name: data.name,
    description: data.description ?? null,
    defaultBranch: data.defaultBranchRef?.name ?? "main",
    stars: data.stargazerCount ?? 0,
    openIssuesCount: data.issues?.totalCount ?? 0,
    language: data.languages?.[0]?.node?.name ?? null,
  };
}

// ── Issues ──────────────────────────────────────────────────────────────────

export interface PublicIssue {
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  url: string;
  comments: number;
}

export function listOpenIssues(owner: string, repo: string, limit = 30): PublicIssue[] {
  const raw = ghJson<
    Array<{
      number: number;
      title: string;
      body: string;
      author: { login?: string };
      labels: Array<{ name: string }>;
      createdAt: string;
      updatedAt: string;
      url: string;
      comments: Array<unknown>;
    }>
  >([
    "issue",
    "list",
    "-R",
    `${owner}/${repo}`,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    "number,title,body,author,labels,createdAt,updatedAt,url,comments",
  ]);
  return raw.map((i) => ({
    number: i.number,
    title: i.title,
    body: i.body ?? "",
    author: i.author?.login ?? "unknown",
    labels: (i.labels ?? []).map((l) => l.name),
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    url: i.url,
    comments: (i.comments ?? []).length,
  }));
}

// ── Pull Requests ───────────────────────────────────────────────────────────

export interface PublicPR {
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  url: string;
  isDraft: boolean;
  reviewDecision: string | null;
  mergeable: string | null;
  statusCheckRollup: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commentsCount: number;
  reviewsCount: number;
  daysStale: number;
}

export function listOpenPRs(owner: string, repo: string, limit = 30): PublicPR[] {
  const raw = ghJson<
    Array<{
      number: number;
      title: string;
      body: string;
      author: { login?: string };
      labels: Array<{ name: string }>;
      createdAt: string;
      updatedAt: string;
      url: string;
      isDraft: boolean;
      reviewDecision: string | null;
      mergeable: string | null;
      statusCheckRollup: Array<{ state?: string; conclusion?: string }> | null;
      additions: number;
      deletions: number;
      changedFiles: number;
      comments: Array<unknown>;
      reviews: Array<unknown>;
    }>
  >([
    "pr",
    "list",
    "-R",
    `${owner}/${repo}`,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    "number,title,body,author,labels,createdAt,updatedAt,url,isDraft,reviewDecision,mergeable,statusCheckRollup,additions,deletions,changedFiles,comments,reviews",
  ]);

  const now = Date.now();
  return raw.map((p) => {
    const updated = new Date(p.updatedAt).getTime();
    const daysStale = Math.round((now - updated) / (1000 * 60 * 60 * 24));
    const checks = p.statusCheckRollup ?? [];
    const anyFail = checks.some((c) => c.conclusion === "FAILURE" || c.state === "FAILURE");
    const allPass = checks.length > 0 && checks.every((c) => c.conclusion === "SUCCESS" || c.state === "SUCCESS");
    const statusCheckRollup = anyFail ? "failing" : allPass ? "passing" : checks.length > 0 ? "pending" : null;

    return {
      number: p.number,
      title: p.title,
      body: p.body ?? "",
      author: p.author?.login ?? "unknown",
      labels: (p.labels ?? []).map((l) => l.name),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      url: p.url,
      isDraft: p.isDraft,
      reviewDecision: p.reviewDecision,
      mergeable: p.mergeable,
      statusCheckRollup,
      additions: p.additions,
      deletions: p.deletions,
      changedFiles: p.changedFiles,
      commentsCount: (p.comments ?? []).length,
      reviewsCount: (p.reviews ?? []).length,
      daysStale,
    };
  });
}

// ── PR files (for review agent) ────────────────────────────────────────────

export function getPRFiles(owner: string, repo: string, number: number): Array<{ filename: string; status: string; patch?: string }> {
  try {
    const raw = gh(["pr", "diff", "--name-only", String(number), "-R", `${owner}/${repo}`]);
    return raw.split("\n").filter(Boolean).map((filename) => ({ filename, status: "modified" }));
  } catch {
    return [];
  }
}

// ── Recent commits ──────────────────────────────────────────────────────────

export interface PublicCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export function listRecentCommits(owner: string, repo: string, limit = 10): PublicCommit[] {
  try {
    const raw = ghJson<Array<{
      sha: string;
      commit: { message: string; author: { name: string; date: string } };
    }>>(["api", `repos/${owner}/${repo}/commits?per_page=${limit}`]);
    return raw.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
    }));
  } catch {
    return [];
  }
}
