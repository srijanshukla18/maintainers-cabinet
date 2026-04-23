import { prisma } from "@/lib/db/client";
import { summarizePrImpact } from "@/lib/repo-graph";
import { syncInboxState } from "./persistence";
import { clampScore, impactFromQueue, impactFromRisk, isVerifiedSlop, priorityFromBands, slopFromClassification, trustFromClassification, urgencyFromPriority } from "./scoring";
import type { InboxAction, InboxState, InboxWorkItem } from "./types";

type BriefRecord = Awaited<ReturnType<typeof loadBriefs>>[number];
type RunRecord = Awaited<ReturnType<typeof loadRuns>>[number];
type PersistedRecord = Awaited<ReturnType<typeof loadPersistedItems>>[number];

export async function getInboxState(options?: { compile?: boolean }): Promise<InboxState> {
  if (!options?.compile) {
    const persistedItems = await loadPersistedItems();
    if (persistedItems.length > 0 || process.env.CABINET_AUTO_COMPILE_INBOX === "false") {
      return summarizeState(persistedItems.map(mapPersistedWorkItem));
    }

    const compiledState = await compileInboxState();
    await syncInboxState(compiledState);
    const syncedItems = await loadPersistedItems();
    return summarizeState(syncedItems.map(mapPersistedWorkItem));
  }

  return compileInboxState();
}

async function compileInboxState(): Promise<InboxState> {
  const [briefs, watchedRepos, runs, graphSnapshots] = await Promise.all([
    loadBriefs(),
    prisma.watchedRepo.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    loadRuns(),
    prisma.repoGraphSnapshot.findMany({
      include: { repo: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const latestBriefByRepo = new Map<string, BriefRecord>();
  for (const brief of briefs) {
    const key = `${brief.repo.owner}/${brief.repo.name}`;
    if (!latestBriefByRepo.has(key)) latestBriefByRepo.set(key, brief);
  }

  const latestGraphByRepo = new Map<string, (typeof graphSnapshots)[number]>();
  for (const snapshot of graphSnapshots) {
    const key = `${snapshot.repo.owner}/${snapshot.repo.name}`;
    if (!latestGraphByRepo.has(key)) latestGraphByRepo.set(key, snapshot);
  }

  const items: InboxWorkItem[] = [];

  for (const watched of watchedRepos) {
    const key = `${watched.owner}/${watched.name}`;
    const latest = latestBriefByRepo.get(key);
    items.push(buildCoverageItem(watched, latest, latestGraphByRepo.get(key)));
  }

  for (const brief of latestBriefByRepo.values()) {
    const key = `${brief.repo.owner}/${brief.repo.name}`;
    items.push(...buildBriefItems(brief, latestGraphByRepo.get(key)));
  }

  for (const run of runs) {
    items.push(buildRunFailureItem(run));
  }

  const deduped = new Map<string, InboxWorkItem>();
  for (const item of items) {
    const key = [item.kind, item.repo?.owner, item.repo?.name, item.targetRef, item.title].join(":");
    if (!deduped.has(key)) deduped.set(key, item);
  }

  const sorted = [...deduped.values()]
    .sort((a, b) => b.scores.priority - a.scores.priority || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 24);

  return summarizeState(sorted);
}

async function loadBriefs() {
  return prisma.brief.findMany({
    orderBy: { generatedAt: "desc" },
    take: 12,
    include: {
      repo: true,
      traceSteps: {
        orderBy: { startedAt: "asc" },
        select: { costUsd: true, tokensIn: true, tokensOut: true },
      },
    },
  });
}

async function loadRuns() {
  return prisma.run.findMany({
    where: { status: { in: ["pending", "running", "error"] } },
    orderBy: { startedAt: "desc" },
    take: 8,
    include: {
      repo: true,
      agentSteps: {
        select: { agentName: true, status: true, error: true },
      },
    },
  });
}

async function loadPersistedItems() {
  return prisma.workItem.findMany({
    where: { status: "open" },
    include: {
      repo: true,
      actions: {
        where: { status: "proposed" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 32,
  });
}

function summarizeState(items: InboxWorkItem[]): InboxState {
  return {
    items,
    summary: {
      total: items.length,
      urgent: items.filter((item) => item.scores.urgency >= 75).length,
      autoExecutable: items.filter((item) => item.autoReason).length,
      approvalRequired: items.filter((item) => item.actions.some((action) => action.approvalRequired)).length,
      bySurface: items.reduce<Record<string, number>>((acc, item) => {
        acc[item.surface] = (acc[item.surface] ?? 0) + 1;
        return acc;
      }, {}),
    },
  } satisfies InboxState;
}

function buildCoverageItem(
  watched: {
    id: string;
    owner: string;
    name: string;
    emailRecipient: string;
    scheduleHour: number;
    lastRunAt: Date | null;
    lastBriefId: string | null;
  },
  latestBrief?: BriefRecord,
  latestGraph?: { revision: string; languageSummary: unknown; publicApisJson: unknown }
): InboxWorkItem {
  const ageHours = latestBrief ? (Date.now() - latestBrief.generatedAt.getTime()) / 36e5 : 999;
  const urgency = clampScore(ageHours > 24 ? 88 : ageHours > 12 ? 70 : 46);
  const queueHealth = asRecord(asRecord(latestBrief?.prioritiesJson).queue_health);
  const impact = impactFromQueue(
    asArray(asRecord(latestBrief?.prioritiesJson).items).length,
    asNumber(queueHealth.stale_prs),
    asNumber(queueHealth.open_issues)
  );

  const actions: InboxAction[] = [
    {
      id: `${watched.id}:run-brief`,
      kind: "run_brief",
      label: latestBrief ? "Refresh queue" : "Generate first digest",
      description: "Compile a fresh work packet for this repo.",
      approvalRequired: true,
      reversible: true,
      downstream: ["brief", "trace", "queue"],
      tone: "primary",
      payload: {
        owner: watched.owner,
        name: watched.name,
        emailRecipient: watched.emailRecipient,
      },
    },
  ];

  actions.push({
    id: `${watched.id}:reindex-graph`,
    kind: "reindex_repo_graph",
    label: "Refresh repo graph",
    description: "Rebuild the polyglot impact index for this repo.",
    approvalRequired: true,
    reversible: true,
    downstream: ["repo graph", "deep review"],
    tone: "secondary",
    payload: {
      owner: watched.owner,
      name: watched.name,
    },
  });

  if (latestBrief?.id) {
    actions.push({
      id: `${watched.id}:open-brief`,
      kind: "open_brief",
      label: "Open latest brief",
      description: "Inspect the current digest and trace.",
      approvalRequired: false,
      reversible: true,
      downstream: ["brief"],
      href: `/briefs/${latestBrief.id}`,
      tone: "secondary",
    });
  }

  return {
    id: `coverage:${watched.id}`,
    kind: "repo_coverage",
    surface: "operations",
    pillar: "integration-money",
    title: `${watched.owner}/${watched.name} needs a fresh queue sweep`,
    summary: latestBrief
      ? `Last digest is ${formatRelative(latestBrief.generatedAt)} old. Refresh the queue before you clear actionable items.`
      : "This watched repo has no digest yet, so nothing downstream can be ranked or actioned.",
    repo: {
      owner: watched.owner,
      name: watched.name,
      installationId: latestBrief?.repo.installationId?.toString() ?? null,
    },
    targetRef: null,
    targetUrl: null,
    traceUrl: latestBrief ? `/briefs/${latestBrief.id}` : null,
    createdAt: (latestBrief?.generatedAt ?? watched.lastRunAt ?? new Date()).toISOString(),
    scores: {
      priority: priorityFromBands({ urgency, impact, trust: 92, slop: 0 }),
      urgency,
      impact,
      trust: 92,
      slop: 0,
    },
    autoReason: null,
    evidence: [
      {
        label: "Digest freshness",
        detail: latestBrief ? `${formatRelative(latestBrief.generatedAt)} since last digest` : "No digest exists yet",
        tone: latestBrief ? "warn" : "danger",
      },
      {
        label: "Schedule",
        detail: `Runs at ${watched.scheduleHour}:00 UTC to ${watched.emailRecipient}`,
      },
      {
        label: "Queue pressure",
        detail: latestBrief
          ? `${asNumber(queueHealth.open_issues)} issues, ${asNumber(queueHealth.open_prs)} PRs, ${asNumber(queueHealth.stale_prs)} stale PRs`
          : "Queue pressure unknown until the first digest runs",
      },
      {
        label: "Repo graph",
        detail: latestGraph
          ? `${latestGraph.revision} indexed with ${Object.keys(asRecord(latestGraph.languageSummary)).length} language families and ${asArray(latestGraph.publicApisJson).length} public surfaces`
          : "No repo graph snapshot yet",
      },
    ],
    actions,
  };
}

function buildBriefItems(
  brief: BriefRecord,
  latestGraph?: { revision: string; languageSummary: unknown; publicApisJson: unknown }
) {
  const items: InboxWorkItem[] = [];
  const context = asRecord(brief.contextJson);
  const priorities = asRecord(brief.prioritiesJson);
  const priorityItems = asArray(priorities.items).slice(0, 3);
  const issues = asArray(context.issues);
  const prs = asArray(context.prs);

  for (const priority of priorityItems) {
    const item = buildPriorityItem(brief, asRecord(priority));
    if (item) items.push(item);
  }

  const slopCandidates = issues
    .map((issue) => asRecord(issue))
    .filter((issue) =>
      isVerifiedSlop({
        classification: asString(asRecord(issue.triage).classification),
        confidence: asNumber(asRecord(issue.triage).confidence),
        missingFields: asArray(asRecord(issue.triage).missing_fields),
      })
    )
    .slice(0, 2);

  for (const issue of slopCandidates) {
    items.push(buildIssueTriageItem(brief, issue));
  }

  const riskyPrs = prs
    .map((pr) => asRecord(pr))
    .filter((pr) => ["high", "medium"].includes(asString(asRecord(pr.review).risk)))
    .slice(0, 2);

  for (const pr of riskyPrs) {
    items.push(buildPrReviewItem(brief, pr, latestGraph));
  }

  return items;
}

function buildPriorityItem(brief: BriefRecord, item: Record<string, unknown>): InboxWorkItem | null {
  const priority = asString(item.priority);
  const urgency = urgencyFromPriority(priority);
  const impact = clampScore(asNumber(item.score));
  const title = asString(item.title);
  const ref = asString(item.reference);

  if (!title) return null;

  const actions: InboxAction[] = [
    {
      id: `${brief.id}:${ref}:open-target`,
      kind: "open_target",
      label: "Open source thread",
      description: "Jump directly to the GitHub surface that triggered this item.",
      approvalRequired: false,
      reversible: true,
      downstream: ["github"],
      href: asString(item.url),
      tone: "primary",
    },
    {
      id: `${brief.id}:${ref}:open-brief`,
      kind: "open_brief",
      label: "Open trace packet",
      description: "Inspect the full brief, trace, and evidence chain.",
      approvalRequired: false,
      reversible: true,
      downstream: ["brief", "trace"],
      href: `/briefs/${brief.id}`,
      tone: "secondary",
    },
  ];

  if (!brief.emailSentAt) {
    actions.push({
      id: `${brief.id}:${ref}:send-digest`,
      kind: "send_digest",
      label: "Send digest",
      description: "Ship this digest to the maintainer inbox.",
      approvalRequired: true,
      reversible: false,
      downstream: ["agentmail", "email"],
      payload: { briefId: brief.id },
      tone: "secondary",
    });
  }

  return {
    id: `priority:${brief.id}:${ref}`,
    kind: "priority",
    surface: "github",
    pillar: "deep-review",
    title: `${brief.repo.owner}/${brief.repo.name} ${ref} ${title}`,
    summary: `${asString(item.reason)} Next action: ${asString(item.action)}`,
    repo: {
      owner: brief.repo.owner,
      name: brief.repo.name,
      installationId: brief.repo.installationId?.toString() ?? null,
    },
    targetRef: ref || null,
    targetUrl: asString(item.url) || null,
    traceUrl: `/briefs/${brief.id}`,
    createdAt: brief.generatedAt.toISOString(),
    scores: {
      priority: priorityFromBands({ urgency, impact, trust: 76, slop: 8 }),
      urgency,
      impact,
      trust: 76,
      slop: 8,
    },
    autoReason: null,
    evidence: [
      { label: "Priority band", detail: priority.replace(/_/g, " "), tone: priority === "do_today" ? "danger" : "warn" },
      { label: "Reason", detail: asString(item.reason) },
      { label: "Digest", detail: `Generated ${formatRelative(brief.generatedAt)} ago` },
    ],
    actions,
  };
}

function buildIssueTriageItem(brief: BriefRecord, issue: Record<string, unknown>): InboxWorkItem {
  const triage = asRecord(issue.triage);
  const classification = asString(triage.classification);
  const trust = trustFromClassification(classification);
  const slop = slopFromClassification(classification);
  const urgency = clampScore((slop ?? 40) * 0.9);
  const impact = 58;
  const issueNumber = asNumber(issue.number);
  const actions: InboxAction[] = [];

  if (brief.repo.installationId && issueNumber) {
    actions.push({
      id: `${brief.id}:issue:${issueNumber}:close`,
      kind: "mark_low_signal",
      label: "Mark low-signal",
      description: "Label and comment with the missing reproduction details. The issue stays open.",
      approvalRequired: true,
      reversible: true,
      downstream: ["github issue", "labels", "comment"],
      payload: {
        owner: brief.repo.owner,
        name: brief.repo.name,
        issueNumber,
        issueTitle: asString(issue.title),
        issueUrl: asString(issue.url),
        classification,
      },
      tone: "danger",
    });
  }

  actions.push({
    id: `${brief.id}:issue:${issueNumber}:open`,
    kind: "open_target",
    label: "Open issue",
    description: "Inspect the underlying thread on GitHub.",
    approvalRequired: false,
    reversible: true,
    downstream: ["github"],
    href: asString(issue.url),
    tone: "secondary",
  });
  actions.push({
    id: `${brief.id}:issue:${issueNumber}:brief`,
    kind: "open_brief",
    label: "Open evidence packet",
    description: "Inspect the digest and trace for this issue.",
    approvalRequired: false,
    reversible: true,
    downstream: ["brief", "trace"],
    href: `/briefs/${brief.id}`,
    tone: "secondary",
  });

  return {
    id: `issue-triage:${brief.id}:${issueNumber}`,
    kind: "issue_triage",
    surface: "github",
    pillar: "defensive-triage",
    title: `${brief.repo.owner}/${brief.repo.name} #${issueNumber} looks like verified slop`,
    summary: `${classification.replace(/_/g, " ")} at ${Math.round(asNumber(triage.confidence) * 100)}% confidence. This is a low-trust interruption candidate.`,
    repo: {
      owner: brief.repo.owner,
      name: brief.repo.name,
      installationId: brief.repo.installationId?.toString() ?? null,
    },
    targetRef: `#${issueNumber}`,
    targetUrl: asString(issue.url) || null,
    traceUrl: `/briefs/${brief.id}`,
    createdAt: brief.generatedAt.toISOString(),
    scores: {
      priority: priorityFromBands({ urgency, impact, trust, slop }),
      urgency,
      impact,
      trust,
      slop,
    },
    autoReason: brief.repo.installationId ? "Low-signal policy allows a one-tap label and maintainer-style reply." : null,
    evidence: [
      { label: "Classification", detail: classification.replace(/_/g, " "), tone: "warn" },
      {
        label: "Missing fields",
        detail: `${asArray(triage.missing_fields).length} required bug fields are missing`,
        tone: "danger",
      },
      {
        label: "Confidence",
        detail: `${Math.round(asNumber(triage.confidence) * 100)}% classifier confidence`,
      },
    ],
    actions,
  };
}

function buildPrReviewItem(
  brief: BriefRecord,
  pr: Record<string, unknown>,
  latestGraph?: { revision: string; languageSummary: unknown; publicApisJson: unknown }
): InboxWorkItem {
  const review = asRecord(pr.review);
  const risk = asString(review.risk);
  const impact = impactFromRisk(risk);
  const urgency = clampScore(risk === "high" ? 82 : 62);
  const labels = asArray(review.labels).map((label) => String(label));
  const prNumber = asNumber(pr.number);
  const findings = asArray(review.findings).map((entry) => asRecord(entry));
  const inferredFiles = findings
    .map((entry) => asString(entry.file))
    .filter(Boolean)
    .map((filename) => ({ filename }));
  const impactSummary = summarizePrImpact({
    changedFiles: inferredFiles,
    snapshot: latestGraph,
  });

  return {
    id: `pr-review:${brief.id}:${prNumber}`,
    kind: "pr_review",
    surface: "github",
    pillar: "deep-review",
    title: `${brief.repo.owner}/${brief.repo.name} PR #${prNumber} needs deep review`,
    summary: `${risk} risk. ${asString(review.summary) || "The review packet found code-path risk and follow-up work."}`,
    repo: {
      owner: brief.repo.owner,
      name: brief.repo.name,
      installationId: brief.repo.installationId?.toString() ?? null,
    },
    targetRef: `PR #${prNumber}`,
    targetUrl: asString(pr.url) || null,
    traceUrl: `/briefs/${brief.id}`,
    createdAt: brief.generatedAt.toISOString(),
    scores: {
      priority: priorityFromBands({ urgency, impact, trust: 64, slop: 6 }),
      urgency,
      impact,
      trust: 64,
      slop: 6,
    },
    autoReason: null,
    evidence: [
      { label: "Risk", detail: risk, tone: risk === "high" ? "danger" : "warn" },
      { label: "Changed files", detail: `${asNumber(pr.changedFiles)} files changed` },
      {
        label: "Review labels",
        detail: labels.length > 0 ? labels.join(", ") : "No review labels were attached",
      },
      {
        label: "Downstream risk",
        detail: `${impactSummary.downstreamRisk} from ${impactSummary.publicSurfaceTouched.length} public-surface files and ${impactSummary.testsTouched.length} test files`,
      },
      {
        label: "Impacted modules",
        detail: impactSummary.impactedModules.length > 0 ? impactSummary.impactedModules.join(", ") : "No impacted modules inferred yet",
      },
      {
        label: "Docs drift",
        detail: impactSummary.docsDriftLikely
          ? "Likely: public/config surface changed without docs edits"
          : impactSummary.docsTouched.length > 0
          ? `${impactSummary.docsTouched.length} docs files changed`
          : "No docs drift signal",
        tone: impactSummary.docsDriftLikely ? "warn" : "neutral",
      },
      {
        label: "Release impact",
        detail: `${impactSummary.releaseImpact} release impact across ${impactSummary.languagesInScope.length || 1} language surfaces`,
        tone: impactSummary.releaseImpact === "high" ? "danger" : impactSummary.releaseImpact === "medium" ? "warn" : "neutral",
      },
      {
        label: "Repo graph",
        detail: latestGraph
          ? `${latestGraph.revision} indexed across ${Object.keys(asRecord(latestGraph.languageSummary)).join(", ")}`
          : "No repo graph snapshot yet",
      },
    ],
    actions: [
      {
        id: `${brief.id}:pr:${prNumber}:open`,
        kind: "open_target",
        label: "Open PR",
        description: "Jump into the pull request thread.",
        approvalRequired: false,
        reversible: true,
        downstream: ["github pr"],
        href: asString(pr.url),
        tone: "primary",
      },
      {
        id: `${brief.id}:pr:${prNumber}:brief`,
        kind: "open_brief",
        label: "Open review packet",
        description: "Inspect the supporting digest and trace.",
        approvalRequired: false,
        reversible: true,
        downstream: ["brief", "trace"],
        href: `/briefs/${brief.id}`,
        tone: "secondary",
      },
    ],
  };
}

function buildRunFailureItem(run: RunRecord): InboxWorkItem {
  const failedSteps = run.agentSteps.filter((step) => step.status === "error");
  const summary = failedSteps[0]?.error ?? run.summary ?? "The control plane needs operator attention.";

  return {
    id: `run-failure:${run.id}`,
    kind: "run_failure",
    surface: "operations",
    pillar: "integration-money",
    title: `${run.repo.owner}/${run.repo.name} has a stuck ${run.runType} run`,
    summary,
    repo: {
      owner: run.repo.owner,
      name: run.repo.name,
      installationId: run.repo.installationId?.toString() ?? null,
    },
    targetRef: run.githubTargetNumber ? `#${run.githubTargetNumber}` : null,
    targetUrl: null,
    traceUrl: `/runs/${run.id}`,
    createdAt: run.startedAt.toISOString(),
    scores: {
      priority: priorityFromBands({ urgency: run.status === "error" ? 80 : 64, impact: 52, trust: 90, slop: 0 }),
      urgency: run.status === "error" ? 80 : 64,
      impact: 52,
      trust: 90,
      slop: 0,
    },
    autoReason: null,
    evidence: [
      { label: "Run status", detail: run.status, tone: run.status === "error" ? "danger" : "warn" },
      { label: "Trigger", detail: run.triggerSource },
      { label: "Failed steps", detail: failedSteps.length > 0 ? failedSteps.map((step) => step.agentName).join(", ") : "No agent step failures recorded" },
    ],
    actions: [
      {
        id: `${run.id}:view-run`,
        kind: "view_run",
        label: "Open run trace",
        description: "Inspect the failed agent steps and payloads.",
        approvalRequired: false,
        reversible: true,
        downstream: ["run trace"],
        href: `/runs/${run.id}`,
        tone: "primary",
      },
      {
        id: `${run.id}:repo-runs`,
        kind: "open_target",
        label: "Open repo timeline",
        description: "Inspect the recent run history for this repo.",
        approvalRequired: false,
        reversible: true,
        downstream: ["repo history"],
        href: `/repos/${run.repo.owner}/${run.repo.name}`,
        tone: "secondary",
      },
    ],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function formatRelative(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function mapPersistedWorkItem(item: PersistedRecord): InboxWorkItem {
  const payload = asRecord(item.payloadJson);
  const scores = asRecord(payload.scores);
  const evidence = asArray(item.evidenceJson).map((entry) => asRecord(entry));

  return {
    id: item.id,
    kind: item.kind as InboxWorkItem["kind"],
    surface: inferSurface(item.kind),
    pillar: inferPillar(item.kind),
    title: item.title,
    summary: item.summary,
    repo: item.repo
      ? {
          owner: item.repo.owner,
          name: item.repo.name,
          installationId: item.repo.installationId?.toString() ?? null,
        }
      : null,
    targetRef: item.sourceRef,
    targetUrl: item.sourceUrl,
    traceUrl: asString(payload.traceUrl) || null,
    createdAt: item.createdAt.toISOString(),
    scores: {
      priority: priorityFromBands({
        urgency: asNumber(scores.urgency ?? item.urgencyScore),
        impact: asNumber(scores.impact ?? item.impactScore),
        trust: item.trustScore,
        slop: item.slopScore,
      }),
      urgency: asNumber(scores.urgency ?? item.urgencyScore),
      impact: asNumber(scores.impact ?? item.impactScore),
      trust: item.trustScore,
      slop: item.slopScore,
    },
    autoReason: item.autoExecutable ? asString(payload.autoReason) || "This item can execute without leaving the inbox." : null,
    evidence: evidence.map((entry) => ({
      label: asString(entry.label) || "Evidence",
      detail: asString(entry.detail),
      tone: asString(entry.tone) as "neutral" | "good" | "warn" | "danger" | undefined,
    })),
    actions: item.actions.map((action) => {
      const actionPayload = asRecord(action.payloadJson);
      return {
        id: action.id,
        kind: action.kind as InboxAction["kind"],
        label: action.label,
        description: asString(actionPayload.description),
        approvalRequired: Boolean(actionPayload.approvalRequired ?? action.status === "proposed"),
        reversible: action.reversible,
        downstream: asArray(action.downstreamJson).map((entry) => String(entry)),
        href: asString(actionPayload.href) || undefined,
        payload: asRecord(actionPayload.payload),
        tone: (asString(actionPayload.tone) as InboxAction["tone"]) || "secondary",
      };
    }),
  };
}

function inferSurface(kind: string): InboxWorkItem["surface"] {
  if (kind.includes("security")) return "security";
  if (kind.includes("money")) return "money";
  if (kind.includes("support")) return "support";
  if (kind.includes("run") || kind.includes("coverage")) return "operations";
  return "github";
}

function inferPillar(kind: string): InboxWorkItem["pillar"] {
  if (kind === "issue_triage") return "defensive-triage";
  if (kind === "pr_review" || kind === "priority") return "deep-review";
  if (kind === "security_verdict") return "security";
  if (kind === "money_thread") return "integration-money";
  return "docs-support";
}
