import { z } from "zod";

// ── Triage ──────────────────────────────────────────────────────────────────

export const TriageOutputSchema = z.object({
  classification: z.enum([
    "bug_likely",
    "feature_request",
    "support_question",
    "docs_issue",
    "possible_duplicate",
    "needs_info",
    "invalid_unclear",
    "security_sensitive",
  ]),
  confidence: z.number().min(0).max(1),
  labels: z.array(z.string()),
  missing_fields: z.array(z.string()),
  similar_issues: z.array(
    z.object({
      number: z.number(),
      similarity: z.number(),
      reason: z.string(),
    })
  ),
  recommended_action: z.enum([
    "ask_for_info",
    "label_only",
    "suggest_duplicate",
    "route_to_discussion",
    "flag_for_maintainer",
  ]),
  draft_comment: z.string(),
});

export type TriageOutput = z.infer<typeof TriageOutputSchema>;

// ── Community ────────────────────────────────────────────────────────────────

export const CommunityOutputSchema = z.object({
  tone_risk: z.enum(["low", "medium", "high"]),
  rewrite_needed: z.boolean(),
  final_comment: z.string(),
  labels: z.array(z.string()),
  notes: z.array(z.string()),
});

export type CommunityOutput = z.infer<typeof CommunityOutputSchema>;

// ── PR Review ────────────────────────────────────────────────────────────────

export const PrReviewOutputSchema = z.object({
  risk: z.enum(["low", "medium", "high"]),
  summary: z.string(),
  labels: z.array(z.string()),
  findings: z.array(
    z.object({
      severity: z.enum(["info", "warning", "blocking"]),
      file: z.string().optional(),
      line: z.number().optional(),
      title: z.string(),
      evidence: z.string(),
      suggested_fix: z.string().optional(),
    })
  ),
  recommended_comment: z.string(),
});

export type PrReviewOutput = z.infer<typeof PrReviewOutputSchema>;

// ── Docs ─────────────────────────────────────────────────────────────────────

export const DocsOutputSchema = z.object({
  docs_impact: z.boolean(),
  confidence: z.number().min(0).max(1),
  affected_docs: z.array(z.string()),
  labels: z.array(z.string()),
  comment: z.string(),
});

export type DocsOutput = z.infer<typeof DocsOutputSchema>;

// ── Release ──────────────────────────────────────────────────────────────────

export const ReleaseOutputSchema = z.object({
  release_note_needed: z.boolean(),
  recommended_section: z.enum([
    "Added",
    "Changed",
    "Fixed",
    "Removed",
    "Security",
    "None",
  ]),
  version_impact: z.enum(["none", "patch", "minor", "major"]),
  labels: z.array(z.string()),
  release_note_draft: z.string(),
});

export type ReleaseOutput = z.infer<typeof ReleaseOutputSchema>;

// ── Work Packet ──────────────────────────────────────────────────────────────

export interface WorkPacket {
  runId: string;
  repoOwner: string;
  repoName: string;
  installationId: number;
  config: CabinetConfig;

  // issue context (populated for issue events)
  issue?: {
    number: number;
    title: string;
    body: string;
    author: string;
    labels: string[];
    similarIssues: Array<{ number: number; title: string }>;
  };

  // PR context (populated for PR events)
  pr?: {
    number: number;
    title: string;
    body: string;
    author: string;
    headSha: string;
    changedFiles: Array<{ filename: string; status: string; patch?: string }>;
    ciStatus?: string;
  };

  // slash command context
  slashCommand?: {
    command: string;
    commenter: string;
    issueOrPrNumber: number;
    targetType: "issue" | "pr";
  };

  // workflow run context
  workflowRun?: {
    conclusion: string;
    name: string;
    failedJobs: string[];
    prNumber?: number;
  };

  // outputs populated as agents run
  triageOutput?: TriageOutput;
  communityOutput?: CommunityOutput;
  prReviewOutput?: PrReviewOutput;
  docsOutput?: DocsOutput;
  releaseOutput?: ReleaseOutput;
}

// ── Cabinet Config ────────────────────────────────────────────────────────────

export interface CabinetConfig {
  version: number;
  cabinet: {
    mode: string;
    default_branch: string;
  };
  autonomy: {
    add_labels: boolean;
    post_comments: boolean;
    close_issues: boolean;
    request_pr_changes: boolean;
    approve_prs: boolean;
    open_pull_requests: boolean;
    create_draft_releases: boolean;
  };
  triage: {
    duplicate_threshold: number;
    required_bug_fields: string[];
  };
  review: {
    require_tests_for: string[];
    docs_paths: string[];
    risky_paths: string[];
  };
  release: {
    changelog_path: string;
    versioning: string;
  };
  community: {
    tone: string;
    forbidden_phrases: string[];
  };
}

export const DEFAULT_CONFIG: CabinetConfig = {
  version: 1,
  cabinet: { mode: "l3_assist", default_branch: "main" },
  autonomy: {
    add_labels: true,
    post_comments: true,
    close_issues: false,
    request_pr_changes: false,
    approve_prs: false,
    open_pull_requests: false,
    create_draft_releases: false,
  },
  triage: {
    duplicate_threshold: 0.82,
    required_bug_fields: [
      "version",
      "environment",
      "reproduction_steps",
      "expected_behavior",
      "actual_behavior",
    ],
  },
  review: {
    require_tests_for: ["src/**"],
    docs_paths: ["docs/**", "README.md"],
    risky_paths: ["src/parser/**", "src/auth/**", "src/config/**"],
  },
  release: { changelog_path: "CHANGELOG.md", versioning: "semver" },
  community: {
    tone: "gentle_firm",
    forbidden_phrases: ["just", "obviously", "works for me"],
  },
};
