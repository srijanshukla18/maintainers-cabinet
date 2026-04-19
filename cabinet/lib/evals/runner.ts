/**
 * Eval runner — executes a single eval case and scores it.
 */

import { prisma } from "../db/client";
import { DEFAULT_CONFIG, type WorkPacket } from "../agents/types";
import { runTriageAgent } from "../agents/triage";
import { runCommunityAgent } from "../agents/community";
import { runPrReviewAgent } from "../agents/pr-review";
import { runDocsAgent } from "../agents/docs";
import { runReleaseAgent } from "../agents/release";

type EvalCase = {
  id: string;
  name: string;
  caseType: string;
  inputJson: unknown;
  expectedJson: unknown;
};

type EvalResult = {
  evalCaseId: string;
  name: string;
  caseType: string;
  passed: boolean;
  score: Record<string, unknown>;
  actual: unknown;
};

export async function runEvalCase(evalCase: EvalCase): Promise<EvalResult> {
  const input = evalCase.inputJson as Record<string, unknown>;
  const expected = evalCase.expectedJson as Record<string, unknown>;

  const basePacket: WorkPacket = {
    runId: `eval_${evalCase.id}`,
    repoOwner: "eval",
    repoName: "eval",
    installationId: 0,
    config: DEFAULT_CONFIG,
    ...(input.issue ? { issue: input.issue as WorkPacket["issue"] } : {}),
    ...(input.pr ? { pr: input.pr as WorkPacket["pr"] } : {}),
  };

  let actual: unknown = null;
  let passed = false;
  const score: Record<string, unknown> = {};

  try {
    if (evalCase.caseType === "issue_triage") {
      const out = await runTriageAgent(basePacket);
      actual = out;
      score.classification = out.classification === expected.classification;
      score.labels = scoreLabels(out.labels, expected.labels as string[]);
      score.no_close = true; // structural check
      passed = Boolean(score.classification) && (score.labels as number) >= 0.5;
    } else if (evalCase.caseType === "community") {
      basePacket.triageOutput = input.triageOutput as WorkPacket["triageOutput"];
      const out = await runCommunityAgent(basePacket);
      actual = out;
      const forbidden = DEFAULT_CONFIG.community.forbidden_phrases;
      score.no_forbidden = !forbidden.some((p) =>
        out.final_comment.toLowerCase().includes(p)
      );
      score.no_sarcasm = out.tone_risk !== "high";
      passed = Boolean(score.no_forbidden) && Boolean(score.no_sarcasm);
    } else if (evalCase.caseType === "pr_review") {
      const out = await runPrReviewAgent(basePacket);
      actual = out;
      score.risk_match = out.risk === expected.risk;
      score.labels = scoreLabels(out.labels, expected.labels as string[]);
      passed = Boolean(score.risk_match);
    } else if (evalCase.caseType === "release") {
      const out = await runReleaseAgent(basePacket);
      actual = out;
      score.version_impact = out.version_impact === expected.version_impact;
      score.release_note_needed = out.release_note_needed === expected.release_note_needed;
      passed = Boolean(score.version_impact) && Boolean(score.release_note_needed);
    }
  } catch (err) {
    score.error = err instanceof Error ? err.message : String(err);
    passed = false;
  }

  // Persist result
  await prisma.evalResult.create({
    data: {
      evalCaseId: evalCase.id,
      actualJson: (actual ?? {}) as object,
      scoreJson: score as object,
      passed,
    },
  });

  return { evalCaseId: evalCase.id, name: evalCase.name, caseType: evalCase.caseType, passed, score, actual };
}

function scoreLabels(actual: string[], expected: string[]): number {
  if (!expected || expected.length === 0) return 1;
  const hits = expected.filter((e) => actual.includes(e)).length;
  return hits / expected.length;
}
