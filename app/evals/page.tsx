"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type EvalResult = {
  evalCaseId: string;
  name: string;
  caseType: string;
  passed: boolean;
  score: Record<string, unknown>;
  actual: unknown;
  input: unknown;
  expected: unknown;
};

type RunResponse = {
  results: EvalResult[];
  passed: number;
  total: number;
  lastRunAt?: string;
};

type HistoryRun = { runAt: string; passed: number; total: number; rate: number };

const TYPE_COLOR: Record<string, string> = {
  issue_triage: "bg-blue-900 text-blue-300",
  pr_review: "bg-purple-900 text-purple-300",
  release: "bg-yellow-900 text-yellow-300",
  community: "bg-pink-900 text-pink-300",
};

function ScoreChart({ runs }: { runs: HistoryRun[] }) {
  if (runs.length < 2) {
    return (
      <div className="flex items-center justify-center h-24 text-gray-600 text-sm">
        Run evals at least twice to see trend
      </div>
    );
  }

  const W = 600, H = 120, PAD = 24;
  const maxRate = 100;
  const xs = runs.map((_, i) => PAD + (i / (runs.length - 1)) * (W - PAD * 2));
  const ys = runs.map((r) => PAD + (1 - r.rate / maxRate) * (H - PAD * 2));
  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
  const area = `${line} L${xs.at(-1)},${H - PAD} L${PAD},${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
      {/* Grid lines */}
      {[0, 50, 100].map((pct) => {
        const y = PAD + (1 - pct / 100) * (H - PAD * 2);
        return (
          <g key={pct}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#374151" strokeWidth="1" strokeDasharray="4 3" />
            <text x={PAD - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#6b7280">{pct}%</text>
          </g>
        );
      })}
      {/* Area fill */}
      <path d={area} fill="url(#grad)" opacity="0.3" />
      {/* Line */}
      <path d={line} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
      {/* Dots + tooltips */}
      {runs.map((r, i) => (
        <g key={i}>
          <circle cx={xs[i]} cy={ys[i]} r="4" fill={r.rate >= 80 ? "#34d399" : r.rate >= 60 ? "#fbbf24" : "#f87171"} />
          <title>{new Date(r.runAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — {r.rate}% ({r.passed}/{r.total})</title>
        </g>
      ))}
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function EvalCard({ r }: { r: EvalResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border ${r.passed ? "border-green-900 bg-green-950/30" : "border-red-900 bg-red-950/30"}`}>
      <button
        className="w-full text-left p-3 flex items-center justify-between gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm text-white">{r.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${TYPE_COLOR[r.caseType] ?? "bg-gray-700 text-gray-300"}`}>{r.caseType}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex gap-2 flex-wrap justify-end">
            {Object.entries(r.score).map(([k, v]) => (
              <span key={k} className="text-xs text-gray-400 font-mono">
                {k}: {typeof v === "boolean" ? (v ? "✓" : "✗") : typeof v === "number" ? v.toFixed(2) : String(v)}
              </span>
            ))}
          </div>
          <span className={`text-xs font-semibold w-8 text-right ${r.passed ? "text-green-400" : "text-red-400"}`}>
            {r.passed ? "PASS" : "FAIL"}
          </span>
          <span className="text-gray-500 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <DetailPane title="Input" data={r.input} />
          <DetailPane title="Expected" data={r.expected} accent="text-emerald-400" />
          <DetailPane title="Actual (agent output)" data={r.actual} accent={r.passed ? "text-emerald-400" : "text-red-400"} />
        </div>
      )}
    </div>
  );
}

function DetailPane({ title, data, accent = "text-gray-400" }: { title: string; data: unknown; accent?: string }) {
  const entries = typeof data === "object" && data !== null && !Array.isArray(data)
    ? Object.entries(data as Record<string, unknown>)
    : null;
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wider font-bold mb-2 ${accent}`}>{title}</div>
      <div className="bg-gray-950 rounded-lg p-3 space-y-2 max-h-72 overflow-y-auto">
        {entries ? entries.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">{k}</div>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words leading-relaxed font-mono">
              {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
            </pre>
          </div>
        )) : (
          <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono">{JSON.stringify(data, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}

export default function EvalsPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryRun[]>([]);

  useEffect(() => {
    fetch("/api/evals/history")
      .then((r) => r.json())
      .then((data: HistoryRun[]) => setHistory(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/evals")
      .then((r) => r.json())
      .then((cases: Array<{
        id: string; name: string; caseType: string;
        inputJson: unknown; expectedJson: unknown;
        evalResults: Array<{ actualJson: unknown; scoreJson: Record<string, unknown>; passed: boolean; createdAt: string }>;
      }>) => {
        const withResults = cases.filter((c) => c.evalResults.length > 0);
        if (withResults.length === 0) return;

        const results: EvalResult[] = withResults.map((c) => ({
          evalCaseId: c.id,
          name: c.name,
          caseType: c.caseType,
          passed: c.evalResults[0].passed ?? false,
          score: c.evalResults[0].scoreJson ?? {},
          actual: c.evalResults[0].actualJson,
          input: c.inputJson,
          expected: c.expectedJson,
        }));

        const lastRunAt = withResults
          .map((c) => c.evalResults[0].createdAt)
          .sort()
          .at(-1);

        setResult({
          results,
          passed: results.filter((r) => r.passed).length,
          total: results.length,
          lastRunAt,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function runEvals() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/evals/run", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const runAt = new Date().toISOString();
      setResult({ ...data, lastRunAt: runAt });
      setHistory((h) => [...h, { runAt, passed: data.passed, total: data.total, rate: Math.round((data.passed / data.total) * 100) }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const byType = result
    ? result.results.reduce<Record<string, { passed: number; total: number }>>((acc, r) => {
        if (!acc[r.caseType]) acc[r.caseType] = { passed: 0, total: 0 };
        acc[r.caseType].total++;
        if (r.passed) acc[r.caseType].passed++;
        return acc;
      }, {})
    : null;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-2">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">← Home</Link>
        </div>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Eval Runner</h1>
            <p className="text-gray-400 text-sm mt-1">20 eval cases · live agents</p>
            {result?.lastRunAt && (
              <p className="text-gray-500 text-xs mt-1 font-mono">
                Last run: {new Date(result.lastRunAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
          <button
            onClick={runEvals}
            disabled={running || loading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {running ? "Running..." : result ? "Re-run Evals" : "Run Evals"}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-6 text-red-300 text-sm">
            {error}
          </div>
        )}

        {history.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 mb-6">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-3">Pass rate over time</div>
            <ScoreChart runs={history} />
            <div className="flex justify-between text-[10px] text-gray-600 font-mono mt-1 px-1">
              <span>{new Date(history[0].runAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <span>{history.length} run{history.length !== 1 ? "s" : ""}</span>
              <span>{new Date(history.at(-1)!.runAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
          </div>
        )}

        {byType && result && (
          <>
            {/* Summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {result.passed}/{result.total} passed
                </h2>
                <span className={`text-sm font-medium ${result.passed === result.total ? "text-green-400" : result.passed >= result.total * 0.8 ? "text-yellow-400" : "text-red-400"}`}>
                  {Math.round((result.passed / result.total) * 100)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(byType).map(([type, { passed, total }]) => (
                  <div key={type} className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-mono ${TYPE_COLOR[type] ?? "bg-gray-700 text-gray-300"}`}>
                      {type}
                    </span>
                    <span className="text-sm text-gray-300">{passed}/{total}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Individual results */}
            <h2 className="text-base font-semibold text-gray-200 mb-3">Case Results <span className="text-gray-500 text-sm font-normal">— click any row to inspect</span></h2>
            <div className="space-y-2">
              {result.results.map((r) => (
                <EvalCard key={r.evalCaseId} r={r} />
              ))}
            </div>
          </>
        )}

        {!result && !running && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
            {loading
              ? <p className="text-gray-500">Loading last run...</p>
              : <>
                  <p className="text-gray-400">No eval results yet.</p>
                  <p className="text-gray-500 text-sm mt-1">Click "Run Evals" to execute all 20 cases against live agents.</p>
                </>
            }
          </div>
        )}
      </div>
    </main>
  );
}
