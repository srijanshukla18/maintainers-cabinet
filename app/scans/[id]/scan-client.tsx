"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AttentionPacket, PacketItem } from "@/lib/scans/types";

type SerializedScan = {
  id: string;
  status: string;
  stage: string;
  summary: string | null;
  issueCount: number;
  prCount: number;
  costUsd: number | null;
  latencyMs: number | null;
  packetJson: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  repo: {
    owner: string;
    name: string;
    fullName: string;
    description: string | null;
    stars: number;
    language: string | null;
    url: string;
  };
  traceSteps: Array<{
    id: string;
    stepType: string;
    stepName: string;
    status: string;
    latencyMs: number | null;
    costUsd: number | null;
    error: string | null;
  }>;
};

function packetFromScan(scan: SerializedScan) {
  return scan.packetJson as AttentionPacket;
}

function statusText(scan: SerializedScan) {
  if (scan.status === "ready") return "Initial packet ready. Deep analysis is running.";
  if (scan.status === "deepening") return "Deepening with PR file context.";
  if (scan.status === "complete") return "Deep packet complete.";
  if (scan.status === "error") return scan.error ?? "Scan failed.";
  return "Scan running.";
}

export function ScanClient({ initialScan }: { initialScan: SerializedScan }) {
  const [scan, setScan] = useState(initialScan);
  const [error, setError] = useState<string | null>(null);
  const startedDeepening = useRef(false);
  const packet = useMemo(() => packetFromScan(scan), [scan]);

  useEffect(() => {
    async function refresh() {
      const response = await fetch(`/api/scans/${scan.id}`);
      if (!response.ok) return;
      setScan((await response.json()) as SerializedScan);
    }

    if (scan.status === "deepening" || scan.status === "pending") {
      const timer = window.setInterval(() => void refresh(), 2500);
      return () => window.clearInterval(timer);
    }
  }, [scan.id, scan.status]);

  useEffect(() => {
    if (startedDeepening.current || !["ready", "pending"].includes(scan.status)) return;
    startedDeepening.current = true;

    async function deepen() {
      try {
        const response = await fetch(`/api/scans/${scan.id}/deepen`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setScan(data as SerializedScan);
      } catch (deepError) {
        setError(deepError instanceof Error ? deepError.message : String(deepError));
      }
    }

    void deepen();
  }, [scan.id, scan.status]);

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-gray-950">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-5 border-b border-gray-200 pb-6">
          <div>
            <Link href="/" className="text-sm font-semibold text-gray-400 transition hover:text-gray-900">
              Back to scanner
            </Link>
            <div className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Maintainer Attention Packet</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">{scan.repo.owner}/{scan.repo.name}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-gray-600">
              {packet.summary || scan.summary || "Cabinet found maintainer attention candidates from public GitHub data."}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-sm">
            <div className="font-semibold">{statusText(scan)}</div>
            <div className="mt-1 text-xs text-gray-400">
              {scan.latencyMs ? `${(scan.latencyMs / 1000).toFixed(1)}s` : "running"} · {scan.costUsd ? `$${scan.costUsd.toFixed(4)}` : "no model cost yet"}
            </div>
          </div>
        </header>

        {error || scan.status === "error" ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error ?? scan.error}
          </div>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-5">
          <Metric label="Open issues" value={packet.queueHealth.openIssues} />
          <Metric label="Open PRs" value={packet.queueHealth.openPrs} />
          <Metric label="Stale PRs" value={packet.queueHealth.stalePrs} />
          <Metric label="AI slop" value={packet.queueHealth.likelyAiSlop} />
          <Metric label="Security-looking" value={packet.queueHealth.securityLooking} />
        </section>

        {packet.deepNotes.length > 0 ? (
          <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Deep maintainer notes</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {packet.deepNotes.map((note) => (
                <div key={note} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">
                  {note}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <PacketSection title="Top maintainer actions" items={packet.topActions} empty="No urgent action candidates found in the fetched window." />
        <PacketSection title="Likely AI slop / disclosure needed" items={packet.aiSlop} empty="No strong AI slop signals found in the fetched window." />
        <PacketSection title="Risky PRs" items={packet.riskyPrs} empty="No high-risk PR signals found yet." />
        <PacketSection title="Issue triage" items={packet.issueTriage} empty="No missing-repro or support-disguised-as-bug issues found yet." />
        <PacketSection title="Duplicate candidates" items={packet.duplicateCandidates} empty="No duplicate clusters found in the fetched window." />
        <PacketSection title="Docs / release impact" items={packet.docsReleaseImpact} empty="No docs or release impact candidates found yet." />
        <PacketSection title="Security-looking threads" items={packet.securityThreads} empty="No security-looking public threads found in the fetched window." />

        <details className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
            Trace
          </summary>
          <div className="mt-4 space-y-2">
            {scan.traceSteps.map((step) => (
              <div key={step.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{step.stepName}</div>
                    <div className="mt-1 text-xs text-gray-400">{step.stepType} · {step.status}</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {step.latencyMs ? `${step.latencyMs}ms` : ""}
                    {step.costUsd ? ` · $${step.costUsd.toFixed(4)}` : ""}
                  </div>
                </div>
                {step.error ? <div className="mt-2 text-sm text-red-600">{step.error}</div> : null}
              </div>
            ))}
          </div>
        </details>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </div>
  );
}

function PacketSection({ title, items, empty }: { title: string; items: PacketItem[]; empty: string }) {
  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-500">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
          {empty}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:bg-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{item.reference} · {item.label}</div>
                  <div className="mt-2 text-base font-semibold leading-6">{item.title}</div>
                </div>
                <span className="rounded-full bg-gray-950 px-2.5 py-1 text-xs font-semibold text-white">{item.score}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600">{item.why}</p>
              <div className="mt-3 space-y-1">
                {item.evidence.slice(0, 3).map((evidence) => (
                  <div key={evidence} className="text-xs text-gray-500">- {evidence}</div>
                ))}
              </div>
              <div className="mt-3 text-sm font-semibold text-gray-900">{item.nextStep}</div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
