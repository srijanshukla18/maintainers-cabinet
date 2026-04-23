import type { InboxEvidenceItem } from "./types";

export function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function priorityFromBands(input: {
  urgency: number;
  impact: number;
  trust?: number | null;
  slop?: number | null;
}) {
  const trustPenalty = input.trust == null ? 0 : Math.max(0, 50 - input.trust) * 0.15;
  const slopBoost = input.slop == null ? 0 : input.slop * 0.2;
  return clampScore(input.urgency * 0.5 + input.impact * 0.35 + slopBoost - trustPenalty);
}

export function slopFromClassification(classification?: string | null) {
  switch (classification) {
    case "invalid_unclear":
      return 97;
    case "possible_duplicate":
      return 92;
    case "support_question":
      return 86;
    case "needs_info":
      return 72;
    case "feature_request":
      return 30;
    case "bug_likely":
      return 18;
    default:
      return null;
  }
}

export function trustFromClassification(classification?: string | null) {
  switch (classification) {
    case "invalid_unclear":
      return 14;
    case "possible_duplicate":
      return 24;
    case "support_question":
      return 36;
    case "needs_info":
      return 44;
    case "feature_request":
      return 55;
    case "bug_likely":
      return 67;
    default:
      return null;
  }
}

export function urgencyFromPriority(priority?: string | null) {
  switch (priority) {
    case "do_today":
      return 92;
    case "this_week":
      return 68;
    case "watch":
      return 42;
    default:
      return 50;
  }
}

export function impactFromRisk(risk?: string | null) {
  switch (risk) {
    case "high":
      return 88;
    case "medium":
      return 65;
    case "low":
      return 32;
    default:
      return 48;
  }
}

export function impactFromQueue(alerts: number, stalePrs: number, openIssues: number) {
  return clampScore(alerts * 12 + stalePrs * 5 + Math.min(openIssues, 10) * 2);
}

export function isVerifiedSlop(input: {
  classification?: string | null;
  confidence?: number | null;
  missingFields?: unknown[];
}) {
  const slopScore = slopFromClassification(input.classification);
  const confidence = input.confidence ?? 0;
  const missingFields = Array.isArray(input.missingFields) ? input.missingFields.length : 0;

  return Boolean(
    slopScore != null &&
      slopScore >= 86 &&
      confidence >= 0.78 &&
      (input.classification === "possible_duplicate" ||
        input.classification === "invalid_unclear" ||
        (input.classification === "needs_info" && missingFields >= 3))
  );
}

export function summarizeEvidence(evidence: InboxEvidenceItem[]) {
  return evidence
    .slice(0, 3)
    .map((item) => `${item.label}: ${item.detail}`)
    .join(" | ");
}
