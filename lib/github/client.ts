import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";

let appInstance: App | null = null;

export function getApp(): App {
  if (!appInstance) {
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY ?? "";
    appInstance = new App({
      appId: process.env.GITHUB_APP_ID ?? "",
      privateKey: privateKey.replace(/\\n/g, "\n"),
      webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET ?? "" },
      Octokit,  // use @octokit/rest so all REST methods are available
    });
  }
  return appInstance;
}

export async function getInstallationClient(installationId: number): Promise<Octokit> {
  const app = getApp();
  const octokit = await app.getInstallationOctokit(installationId);
  return octokit as unknown as Octokit;
}

// ── typed wrappers ──────────────────────────────────────────────────────────

export async function getRepoConfig(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const res = await octokit.repos.getContent({ owner, repo, path: ".github/cabinet.yml" });
    if ("content" in res.data && typeof res.data.content === "string") {
      return Buffer.from(res.data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

export async function getIssue(octokit: Octokit, owner: string, repo: string, issueNumber: number) {
  const res = await octokit.issues.get({ owner, repo, issue_number: issueNumber });
  return res.data;
}

export async function listIssueComments(octokit: Octokit, owner: string, repo: string, issueNumber: number) {
  const res = await octokit.issues.listComments({ owner, repo, issue_number: issueNumber, per_page: 20 });
  return res.data;
}

export async function searchIssues(octokit: Octokit, owner: string, repo: string, query: string) {
  try {
    const res = await octokit.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} is:issue ${query}`,
      per_page: 5,
    });
    return res.data.items ?? [];
  } catch {
    return [];
  }
}

export async function addLabels(octokit: Octokit, owner: string, repo: string, issueNumber: number, labels: string[]) {
  await octokit.issues.addLabels({ owner, repo, issue_number: issueNumber, labels });
}

export async function postIssueComment(octokit: Octokit, owner: string, repo: string, issueNumber: number, body: string) {
  const res = await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body });
  return res.data;
}

export async function closeIssue(octokit: Octokit, owner: string, repo: string, issueNumber: number) {
  const res = await octokit.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: "closed",
  });
  return res.data;
}

export async function reopenIssue(octokit: Octokit, owner: string, repo: string, issueNumber: number) {
  const res = await octokit.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: "open",
  });
  return res.data;
}

export async function getPullRequest(octokit: Octokit, owner: string, repo: string, pullNumber: number) {
  const res = await octokit.pulls.get({ owner, repo, pull_number: pullNumber });
  return res.data;
}

export async function getPullRequestFiles(octokit: Octokit, owner: string, repo: string, pullNumber: number) {
  const res = await octokit.pulls.listFiles({ owner, repo, pull_number: pullNumber, per_page: 50 });
  return res.data;
}

export async function createCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  headSha: string,
  name: string,
  status: "in_progress" | "completed",
  conclusion?: "success" | "failure" | "neutral" | "cancelled",
  output?: { title: string; summary: string }
) {
  const res = await octokit.checks.create({
    owner, repo, name, head_sha: headSha, status,
    ...(conclusion && { conclusion }),
    ...(output && { output }),
  });
  return res.data;
}

export async function updateCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  status: "in_progress" | "completed",
  conclusion?: "success" | "failure" | "neutral" | "cancelled",
  output?: { title: string; summary: string }
) {
  const res = await octokit.checks.update({
    owner, repo, check_run_id: checkRunId, status,
    ...(conclusion && { conclusion }),
    ...(output && { output }),
  });
  return res.data;
}

export async function postPullRequestComment(octokit: Octokit, owner: string, repo: string, pullNumber: number, body: string) {
  const res = await octokit.issues.createComment({ owner, repo, issue_number: pullNumber, body });
  return res.data;
}

export async function listMergedPullRequests(octokit: Octokit, owner: string, repo: string, since?: string) {
  const res = await octokit.pulls.list({ owner, repo, state: "closed", sort: "updated", direction: "desc", per_page: 30 });
  return res.data.filter((pr) => {
    if (!pr.merged_at) return false;
    if (since && new Date(pr.merged_at) < new Date(since)) return false;
    return true;
  });
}

export async function ensureLabelsExist(octokit: Octokit, owner: string, repo: string) {
  const cabinetLabels = [
    { name: "cabinet:triaged", color: "0075ca" },
    { name: "cabinet:needs-info", color: "e4e669" },
    { name: "cabinet:possible-duplicate", color: "cfd3d7" },
    { name: "cabinet:support", color: "d93f0b" },
    { name: "cabinet:bug-likely", color: "b60205" },
    { name: "cabinet:docs-needed", color: "0052cc" },
    { name: "cabinet:release-note-needed", color: "5319e7" },
    { name: "cabinet:review-needed", color: "fbca04" },
    { name: "cabinet:community-risk", color: "ee0701" },
  ];

  const existing = await octokit.issues.listLabelsForRepo({ owner, repo, per_page: 100 });
  const existingNames = new Set(existing.data.map((l) => l.name));

  for (const label of cabinetLabels) {
    if (!existingNames.has(label.name)) {
      try {
        await octokit.issues.createLabel({ owner, repo, ...label });
      } catch {
        // already exists in a race
      }
    }
  }
}

export async function getCollaboratorPermission(
  octokit: Octokit,
  owner: string,
  repo: string,
  username: string
): Promise<"admin" | "write" | "read" | "none"> {
  try {
    const res = await octokit.repos.getCollaboratorPermissionLevel({ owner, repo, username });
    const perm = res.data.permission;
    if (perm === "admin") return "admin";
    if (perm === "write") return "write";
    if (perm === "read") return "read";
    return "none";
  } catch {
    return "none";
  }
}
