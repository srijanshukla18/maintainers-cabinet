/**
 * RepoMemory — persistent context across briefs.
 *
 * After each brief, we update the repo's memory with:
 * - top recurring issue types
 * - top contributors (by issue + PR count)
 * - recurring themes (extracted from priority items across briefs)
 * - what priority recommended last time
 *
 * Before the next brief, the priority agent reads this memory
 * so it can say things like "this is the third brief in a row
 * flagging stale PRs" or "user X is a frequent contributor."
 */

import { prisma } from "../db/client";
import type { BriefContextJson, BriefPriorityJson } from "./generate";

export interface RepoMemorySnapshot {
  lastBriefSummary: string | null;
  lastBriefAt: string | null;
  topContributors: Array<{ login: string; count: number }>;
  recurringThemes: string[];
  previousActions: string[];
  knownIssueTypes: Record<string, number>;
}

export async function loadRepoMemory(repoId: string): Promise<RepoMemorySnapshot | null> {
  const mem = await prisma.repoMemory.findUnique({ where: { repoId } });
  if (!mem) return null;

  return {
    lastBriefSummary: (mem.summaryJson as { summary?: string })?.summary ?? null,
    lastBriefAt: mem.lastBriefAt?.toISOString() ?? null,
    topContributors: (mem.topContributors as Array<{ login: string; count: number }>) ?? [],
    recurringThemes: (mem.recurringThemes as string[]) ?? [],
    previousActions: (mem.previousActions as string[]) ?? [],
    knownIssueTypes: (mem.knownIssueTypes as Record<string, number>) ?? {},
  };
}

export async function updateRepoMemory(
  repoId: string,
  briefId: string,
  context: BriefContextJson,
  priority: BriefPriorityJson
): Promise<void> {
  // Compute contributor frequency
  const contributorMap = new Map<string, number>();
  for (const issue of context.issues ?? []) {
    contributorMap.set(issue.author, (contributorMap.get(issue.author) ?? 0) + 1);
  }
  for (const pr of context.prs ?? []) {
    contributorMap.set(pr.author, (contributorMap.get(pr.author) ?? 0) + 1);
  }
  const topContributors = [...contributorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([login, count]) => ({ login, count }));

  // Compute issue type frequency
  const typeMap: Record<string, number> = {};
  for (const issue of context.issues ?? []) {
    if (issue.triage?.classification) {
      typeMap[issue.triage.classification] = (typeMap[issue.triage.classification] ?? 0) + 1;
    }
  }

  // Extract themes from priority items
  const themes = priority.items.map((i) => i.title).slice(0, 5);

  // Previous actions
  const previousActions = priority.items.map((i) => i.action).slice(0, 5);

  // Summary line
  const summary = priority.summary_line;

  await prisma.repoMemory.upsert({
    where: { repoId },
    create: {
      repoId,
      lastBriefId: briefId,
      lastBriefAt: new Date(),
      summaryJson: { summary } as object,
      knownIssueTypes: typeMap as object,
      topContributors: topContributors as unknown as object,
      recurringThemes: themes,
      previousActions: previousActions,
    },
    update: {
      lastBriefId: briefId,
      lastBriefAt: new Date(),
      summaryJson: { summary } as object,
      knownIssueTypes: typeMap as object,
      topContributors: topContributors as unknown as object,
      recurringThemes: themes,
      previousActions: previousActions,
    },
  });
}
