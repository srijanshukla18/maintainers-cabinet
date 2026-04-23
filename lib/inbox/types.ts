export type InboxSurface =
  | "github"
  | "security"
  | "support"
  | "money"
  | "operations";

export type InboxKind =
  | "repo_coverage"
  | "priority"
  | "issue_triage"
  | "pr_review"
  | "run_failure"
  | "support_resolution"
  | "money_thread"
  | "security_verdict";

export type InboxActionKind =
  | "open_target"
  | "open_brief"
  | "run_brief"
  | "send_digest"
  | "view_run"
  | "close_verified_slop"
  | "mark_low_signal"
  | "reopen_issue"
  | "reply_support"
  | "open_docs_patch"
  | "open_money_thread"
  | "draft_money_reply"
  | "reindex_repo_graph";

export interface InboxEvidenceItem {
  label: string;
  detail: string;
  tone?: "neutral" | "good" | "warn" | "danger";
}

export interface InboxAction {
  id: string;
  kind: InboxActionKind;
  label: string;
  description: string;
  approvalRequired: boolean;
  reversible: boolean;
  downstream: string[];
  href?: string;
  payload?: Record<string, unknown>;
  tone?: "primary" | "secondary" | "danger";
}

export interface InboxWorkItem {
  id: string;
  kind: InboxKind;
  surface: InboxSurface;
  pillar:
    | "defensive-triage"
    | "deep-review"
    | "security"
    | "docs-support"
    | "integration-money";
  title: string;
  summary: string;
  repo: {
    owner: string;
    name: string;
    installationId: string | null;
  } | null;
  targetRef: string | null;
  targetUrl: string | null;
  traceUrl: string | null;
  createdAt: string;
  scores: {
    priority: number;
    urgency: number;
    impact: number;
    trust: number | null;
    slop: number | null;
  };
  autoReason: string | null;
  evidence: InboxEvidenceItem[];
  actions: InboxAction[];
}

export interface InboxState {
  items: InboxWorkItem[];
  summary: {
    total: number;
    urgent: number;
    autoExecutable: number;
    approvalRequired: number;
    bySurface: Record<string, number>;
  };
}
