import { Octokit } from "@octokit/rest";
import type { PublicIssue, PublicPullRequest, PublicRepoSummary, PullRequestFile } from "./types";

export function parseRepoInput(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "");
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (urlMatch) return { owner: urlMatch[1], name: urlMatch[2] };
  const slashMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) return { owner: slashMatch[1], name: slashMatch[2] };
  return null;
}

export function createGitHubClient(accessToken: string) {
  return new Octokit({ auth: accessToken });
}

function labelNames(labels: Array<string | { name?: string | null }> | undefined) {
  return (labels ?? [])
    .map((label) => (typeof label === "string" ? label : label.name ?? ""))
    .filter(Boolean);
}

export async function fetchRepoSummary(
  octokit: Octokit,
  owner: string,
  name: string
): Promise<PublicRepoSummary> {
  const { data } = await octokit.repos.get({ owner, repo: name });
  if (data.private) {
    throw new Error("Cabinet v1 only supports public repositories.");
  }

  return {
    id: data.id,
    owner: data.owner.login,
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    defaultBranch: data.default_branch,
    stars: data.stargazers_count ?? 0,
    openIssuesCount: data.open_issues_count ?? 0,
    isPrivate: data.private,
    language: data.language,
    url: data.html_url,
  };
}

export async function fetchOpenIssues(
  octokit: Octokit,
  owner: string,
  name: string,
  limit = 60
): Promise<PublicIssue[]> {
  const { data } = await octokit.issues.listForRepo({
    owner,
    repo: name,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: Math.min(limit, 100),
  });

  return data
    .filter((issue) => !issue.pull_request)
    .slice(0, limit)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      author: issue.user?.login ?? "unknown",
      labels: labelNames(issue.labels),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      url: issue.html_url,
      comments: issue.comments ?? 0,
    }));
}

export async function fetchOpenPullRequests(
  octokit: Octokit,
  owner: string,
  name: string,
  limit = 50
): Promise<PublicPullRequest[]> {
  const { data } = await octokit.pulls.list({
    owner,
    repo: name,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: Math.min(limit, 100),
  });
  const now = Date.now();

  return data.slice(0, limit).map((pr) => {
    const counts = pr as { comments?: number; review_comments?: number };
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body ?? "",
      author: pr.user?.login ?? "unknown",
      labels: labelNames(pr.labels),
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      url: pr.html_url,
      isDraft: Boolean(pr.draft),
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      comments: counts.comments ?? 0,
      reviewComments: counts.review_comments ?? 0,
      daysStale: Math.max(0, Math.round((now - new Date(pr.updated_at).getTime()) / 86_400_000)),
    };
  });
}

export async function fetchPullRequestDetails(
  octokit: Octokit,
  owner: string,
  name: string,
  pullNumber: number
) {
  const { data } = await octokit.pulls.get({ owner, repo: name, pull_number: pullNumber });
  return {
    additions: data.additions ?? 0,
    deletions: data.deletions ?? 0,
    changedFiles: data.changed_files ?? 0,
    mergeable: data.mergeable,
  };
}

export async function fetchPullRequestFiles(
  octokit: Octokit,
  owner: string,
  name: string,
  pullNumber: number
): Promise<PullRequestFile[]> {
  const { data } = await octokit.pulls.listFiles({
    owner,
    repo: name,
    pull_number: pullNumber,
    per_page: 40,
  });

  return data.map((file) => ({
    filename: file.filename,
    status: file.status,
    patch: file.patch ?? null,
  }));
}
