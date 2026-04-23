import { prisma } from "@/lib/db/client";

export async function ingestSecurityAlert(input: {
  repoOwner: string;
  repoName: string;
  advisoryRef: string;
  packageName: string;
  severity: string;
  manifestPath?: string | null;
  reachableHint?: boolean | null;
  summary: string;
}) {
  const repo = await prisma.repo.findUnique({
    where: { owner_name: { owner: input.repoOwner, name: input.repoName } },
  });

  const verdict =
    input.reachableHint === true
      ? "likely_exploitable"
      : input.reachableHint === false
      ? "likely_irrelevant"
      : "needs_human";

  const workItemId = `security:${input.repoOwner}/${input.repoName}:${input.advisoryRef}:${input.packageName}`;

  await prisma.workItem.upsert({
    where: { id: workItemId },
    create: {
      id: workItemId,
      repoId: repo?.id ?? null,
      kind: "security_verdict",
      source: "security",
      status: "open",
      title: `${input.advisoryRef} on ${input.packageName}`,
      summary: input.summary,
      sourceRef: input.advisoryRef,
      urgencyScore: input.severity.toLowerCase() === "critical" ? 94 : input.severity.toLowerCase() === "high" ? 84 : 60,
      impactScore: verdict === "likely_exploitable" ? 90 : verdict === "needs_human" ? 68 : 35,
      requiresApproval: true,
      evidenceJson: [
        { label: "Package", detail: input.packageName },
        { label: "Severity", detail: input.severity },
        { label: "Reachability", detail: input.reachableHint == null ? "unknown" : input.reachableHint ? "reachable" : "not observed" },
      ] as unknown as object,
      payloadJson: {
        manifestPath: input.manifestPath ?? null,
        verdict,
      } as object,
    },
    update: {
      repoId: repo?.id ?? null,
      summary: input.summary,
      urgencyScore: input.severity.toLowerCase() === "critical" ? 94 : input.severity.toLowerCase() === "high" ? 84 : 60,
      impactScore: verdict === "likely_exploitable" ? 90 : verdict === "needs_human" ? 68 : 35,
      evidenceJson: [
        { label: "Package", detail: input.packageName },
        { label: "Severity", detail: input.severity },
        { label: "Reachability", detail: input.reachableHint == null ? "unknown" : input.reachableHint ? "reachable" : "not observed" },
      ] as unknown as object,
      payloadJson: {
        manifestPath: input.manifestPath ?? null,
        verdict,
      } as object,
    },
  });

  await prisma.securityVerdict.upsert({
    where: { id: `${workItemId}:verdict` },
    create: {
      id: `${workItemId}:verdict`,
      repoId: repo?.id ?? null,
      workItemId,
      advisoryRef: input.advisoryRef,
      packageName: input.packageName,
      severity: input.severity,
      verdict,
      evidenceJson: [
        { label: "Reachability", detail: input.reachableHint == null ? "unknown" : String(input.reachableHint) },
        { label: "Manifest", detail: input.manifestPath ?? "unknown" },
      ] as unknown as object,
      reachablePathsJson: input.manifestPath ? [input.manifestPath] : [],
    },
    update: {
      severity: input.severity,
      verdict,
      evidenceJson: [
        { label: "Reachability", detail: input.reachableHint == null ? "unknown" : String(input.reachableHint) },
        { label: "Manifest", detail: input.manifestPath ?? "unknown" },
      ] as unknown as object,
      reachablePathsJson: input.manifestPath ? [input.manifestPath] : [],
    },
  });

  return { workItemId, verdict };
}
