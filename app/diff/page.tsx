"use client";

import { useState } from "react";
import Link from "next/link";

type PriorityItem = {
  reference: string;
  title: string;
  priority: string;
  score: number;
  reason: string;
  action: string;
  url: string;
};

type QueueHealth = {
  open_issues: number;
  open_prs: number;
  stale_prs: number;
  ready_to_merge: number;
  needs_triage: number;
  security_flags: number;
};

type Brief = {
  id: string;
  subject: string;
  generatedAt: string;
  latencyMs: number | null;
  repo: { owner: string; name: string };
  prioritiesJson: { summary_line: string; items: PriorityItem[]; queue_health: QueueHealth };
  contextJson: { issuesCount: number; prsCount: number; triagedCount: number; reviewedCount: number };
  traceSteps: Array<{ stepType: string; tokensIn: number | null; tokensOut: number | null; costUsd: number | null }>;
};

const PRIORITY_STYLE: Record<string, string> = {
  do_today: "bg-red-100 text-red-700 border-red-200",
  this_week: "bg-amber-100 text-amber-700 border-amber-200",
  watch: "bg-gray-100 text-gray-500 border-gray-200",
};

function totalCost(brief: Brief) {
  return brief.traceSteps.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
}

function totalTokens(brief: Brief) {
  return brief.traceSteps.reduce((sum, s) => sum + (s.tokensIn ?? 0) + (s.tokensOut ?? 0), 0);
}

function formatDate(s: string) {
  return new Date(s).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function DiffCell({ a, b, label }: { a: number | string; b: number | string; label: string }) {
  const numA = typeof a === "number" ? a : parseFloat(String(a));
  const numB = typeof b === "number" ? b : parseFloat(String(b));
  const diff = numB - numA;
  const color = diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : "text-gray-400";
  const sign = diff > 0 ? "+" : "";

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
      <div className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-1">{label}</div>
      <div className="text-sm font-mono text-gray-900">{typeof a === "number" ? a.toFixed(typeof a === "number" && a < 10 ? 2 : 0) : a}</div>
      <div className="text-sm font-mono text-gray-900">{typeof b === "number" ? b.toFixed(typeof b === "number" && b < 10 ? 2 : 0) : b}</div>
      {!isNaN(diff) && diff !== 0 && (
        <div className={`text-xs font-mono font-bold mt-1 ${color}`}>{sign}{diff.toFixed(diff < 1 && diff > -1 ? 4 : 1)}</div>
      )}
    </div>
  );
}

function PriorityDiff({ a, b }: { a: PriorityItem[]; b: PriorityItem[] }) {
  const aRefs = new Set(a.map((i) => i.reference));
  const bRefs = new Set(b.map((i) => i.reference));

  const added = b.filter((i) => !aRefs.has(i.reference));
  const removed = a.filter((i) => !bRefs.has(i.reference));
  const kept = b.filter((i) => aRefs.has(i.reference));

  return (
    <div className="space-y-2">
      {added.map((item) => (
        <div key={item.reference} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-emerald-600">+ NEW</span>
            <span className="text-xs font-mono text-gray-500">{item.reference}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full border font-bold ${PRIORITY_STYLE[item.priority]}`}>{item.priority.replace(/_/g, " ")}</span>
          </div>
          <div className="text-sm font-semibold text-gray-900">{item.title}</div>
          <div className="text-xs text-gray-500 mt-0.5">→ {item.action}</div>
        </div>
      ))}
      {removed.map((item) => (
        <div key={item.reference} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 opacity-75">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-red-600">- DROPPED</span>
            <span className="text-xs font-mono text-gray-500">{item.reference}</span>
          </div>
          <div className="text-sm font-semibold text-gray-700 line-through">{item.title}</div>
        </div>
      ))}
      {kept.map((item) => {
        const prev = a.find((i) => i.reference === item.reference);
        const priorityChanged = prev && prev.priority !== item.priority;
        return (
          <div key={item.reference} className={`rounded-xl border px-4 py-3 ${priorityChanged ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-gray-400">= KEPT</span>
              <span className="text-xs font-mono text-gray-500">{item.reference}</span>
              {priorityChanged && (
                <>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full border font-bold ${PRIORITY_STYLE[prev.priority]}`}>{prev.priority.replace(/_/g, " ")}</span>
                  <span className="text-xs text-gray-400">→</span>
                </>
              )}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full border font-bold ${PRIORITY_STYLE[item.priority]}`}>{item.priority.replace(/_/g, " ")}</span>
            </div>
            <div className="text-sm font-semibold text-gray-900">{item.title}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function DiffPage() {
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [data, setData] = useState<{ a: Brief; b: Brief } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compare() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/briefs/${idA.trim()}/diff?vs=${idB.trim()}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-2"><Link href="/" className="text-xs text-gray-400 hover:text-gray-600 font-semibold">← dashboard</Link></div>
        <div className="text-xs uppercase tracking-widest text-indigo-600 font-bold mb-1">Observability</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Run Diff</h1>

        {/* Input */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm mb-6">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400 font-bold block mb-1">Brief A (baseline)</label>
              <input value={idA} onChange={(e) => setIdA(e.target.value)} placeholder="brief id" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400 font-bold block mb-1">Brief B (compare)</label>
              <input value={idB} onChange={(e) => setIdB(e.target.value)} placeholder="brief id" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <button onClick={compare} disabled={loading || !idA || !idB} className="self-end bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold px-5 py-2 rounded-lg transition-colors">
              {loading ? "..." : "Compare"}
            </button>
          </div>
          {error && <div className="mt-2 text-sm text-red-600 font-medium">{error}</div>}
        </div>

        {data && (
          <>
            {/* Header row */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[data.a, data.b].map((brief, i) => (
                <div key={i} className={`rounded-2xl border p-4 ${i === 0 ? "border-gray-200 bg-white" : "border-indigo-200 bg-indigo-50"}`}>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${i === 0 ? "text-gray-400" : "text-indigo-600"}`}>{i === 0 ? "Baseline (A)" : "Compare (B)"}</div>
                  <div className="font-mono font-bold text-gray-900">{brief.repo.owner}/{brief.repo.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{formatDate(brief.generatedAt)}</div>
                  <div className="text-sm text-gray-600 mt-2">{brief.prioritiesJson.summary_line}</div>
                </div>
              ))}
            </div>

            {/* Stats diff */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm mb-6">
              <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">Metrics delta <span className="text-gray-300 font-normal">(A → B)</span></div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <DiffCell label="Latency (s)" a={(data.a.latencyMs ?? 0) / 1000} b={(data.b.latencyMs ?? 0) / 1000} />
                <DiffCell label="Cost ($)" a={totalCost(data.a)} b={totalCost(data.b)} />
                <DiffCell label="Tokens" a={totalTokens(data.a)} b={totalTokens(data.b)} />
                <DiffCell label="Issues" a={data.a.contextJson.issuesCount} b={data.b.contextJson.issuesCount} />
                <DiffCell label="PRs" a={data.a.contextJson.prsCount} b={data.b.contextJson.prsCount} />
                <DiffCell label="Alerts" a={data.a.prioritiesJson.items.length} b={data.b.prioritiesJson.items.length} />
              </div>
            </div>

            {/* Queue health diff */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm mb-6">
              <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">Queue health delta</div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <DiffCell label="Open issues" a={data.a.prioritiesJson.queue_health.open_issues} b={data.b.prioritiesJson.queue_health.open_issues} />
                <DiffCell label="Open PRs" a={data.a.prioritiesJson.queue_health.open_prs} b={data.b.prioritiesJson.queue_health.open_prs} />
                <DiffCell label="Stale PRs" a={data.a.prioritiesJson.queue_health.stale_prs} b={data.b.prioritiesJson.queue_health.stale_prs} />
                <DiffCell label="Ready merge" a={data.a.prioritiesJson.queue_health.ready_to_merge} b={data.b.prioritiesJson.queue_health.ready_to_merge} />
                <DiffCell label="Needs triage" a={data.a.prioritiesJson.queue_health.needs_triage} b={data.b.prioritiesJson.queue_health.needs_triage} />
                <DiffCell label="Security" a={data.a.prioritiesJson.queue_health.security_flags} b={data.b.prioritiesJson.queue_health.security_flags} />
              </div>
            </div>

            {/* Priority diff */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-1">Priority changes</div>
              <div className="text-sm text-gray-500 mb-4">What was added, dropped, or re-ranked between runs.</div>
              <PriorityDiff a={data.a.prioritiesJson.items} b={data.b.prioritiesJson.items} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
