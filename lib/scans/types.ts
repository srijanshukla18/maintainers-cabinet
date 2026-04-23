export type ScanStatus = "pending" | "ready" | "deepening" | "complete" | "error";

export interface PublicRepoSummary {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  openIssuesCount: number;
  isPrivate: boolean;
  language: string | null;
  url: string;
}

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

export interface PublicPullRequest {
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  url: string;
  isDraft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  comments: number;
  reviewComments: number;
  daysStale: number;
}

export interface PullRequestFile {
  filename: string;
  status: string;
  patch: string | null;
}

export interface PacketItem {
  id: string;
  type: "issue" | "pr" | "cluster";
  reference: string;
  title: string;
  url: string;
  score: number;
  label: string;
  why: string;
  evidence: string[];
  nextStep: string;
}

export interface QueueHealth {
  openIssues: number;
  openPrs: number;
  stalePrs: number;
  missingRepro: number;
  likelyAiSlop: number;
  securityLooking: number;
}

export interface AttentionPacket {
  generatedAt: string;
  repo: PublicRepoSummary;
  queueHealth: QueueHealth;
  summary: string;
  topActions: PacketItem[];
  aiSlop: PacketItem[];
  riskyPrs: PacketItem[];
  issueTriage: PacketItem[];
  duplicateCandidates: PacketItem[];
  docsReleaseImpact: PacketItem[];
  securityThreads: PacketItem[];
  deepNotes: string[];
}

export interface ScanContext {
  repo: PublicRepoSummary;
  issues: PublicIssue[];
  prs: PublicPullRequest[];
}

