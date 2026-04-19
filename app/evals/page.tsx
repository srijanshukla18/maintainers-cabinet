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
  issue_triage: "bg-violet-50 text-violet-700 border-violet-200",
  pr_review:    "bg-amber-50 text-amber-700 border-amber-200",
  release:      "bg-orange-50 text-orange-700 border-orange-200",
  community:    "bg-pink-50 text-pink-700 border-pink-200",
};

function ScoreChart({ runs }: { runs: HistoryRun[] }) {
  if (runs.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm font-medium bg-gray-50/50 rounded-xl border border-gray-100 border-dashed">
        Run evals at least twice to see trend
      </div>
    );
  }

  const W = 800, H = 200, PAD_X = 48, PAD_Y = 24;
  const xs = runs.map((_, i) => PAD_X + (i / (runs.length - 1)) * (W - PAD_X * 2));
  const ys = runs.map((r) => PAD_Y + (1 - r.rate / 100) * (H - PAD_Y * 2));
  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
  const area = `${line} L${xs.at(-1)},${H - PAD_Y} L${PAD_X},${H - PAD_Y} Z`;

  return (
    <div className="py-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible font-sans">
        <defs>
          <linearGradient id="eval-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 50, 100].map((pct) => {
          const y = PAD_Y + (1 - pct / 100) * (H - PAD_Y * 2);
          return (
            <g key={pct}>
              <line x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke="#f3f4f6" strokeWidth="1.5" strokeDasharray="4 4" />
              <text x={PAD_X - 12} y={y + 4} textAnchor="end" fontSize="11" fill="#9ca3af" fontWeight="500">{pct}%</text>
            </g>
          );
        })}
        <path d={area} fill="url(#eval-grad)" />
        <path d={line} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {runs.map((r, i) => (
          <g key={i}>
            <circle
              cx={xs[i]} cy={ys[i]} r="5"
              fill={r.rate >= 80 ? "#10b981" : r.rate >= 60 ? "#f59e0b" : "#ef4444"}
              stroke="white" strokeWidth="2.5"
            />
            <title>{r.rate}% ({r.passed}/{r.total})</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

function EvalCard({ r }: { r: EvalResult }) {
  const [open, setOpen] = useState(false);
  const passColor = r.passed
    ? "border-green-200 bg-green-50"
    : "border-red-200 bg-red-50";

  return (
    <div className={`rounded-xl border ${passColor}`}>
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm text-gray-900 truncate">{r.name}</span>
          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${TYPE_COLOR[r.caseType] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
            {r.caseType}
          </span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden sm:flex gap-3 flex-wrap justify-end">
            {Object.entries(r.score).map(([k, v]) => (
              <span key={k} className="text-xs text-gray-500 font-mono">
                {k}:{" "}
                <span className={typeof v === "boolean" ? (v ? "text-green-600" : "text-red-500") : "text-gray-700"}>
                  {typeof v === "boolean" ? (v ? "✓" : "✗") : typeof v === "number" ? v.toFixed(2) : String(v)}
                </span>
              </span>
            ))}
          </div>
          <span className={`text-xs font-bold w-8 text-right ${r.passed ? "text-green-600" : "text-red-500"}`}>
            {r.passed ? "PASS" : "FAIL"}
          </span>
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 bg-white rounded-b-xl">
          <DetailPane title="Input" data={r.input} />
          <DetailPane title="Expected" data={r.expected} accent="text-emerald-600" />
          <DetailPane title="Actual" data={r.actual} accent={r.passed ? "text-emerald-600" : "text-red-500"} />
        </div>
      )}
    </div>
  );
}

function DetailPane({ title, data, accent = "text-gray-500" }: { title: string; data: unknown; accent?: string }) {
  const entries = typeof data === "object" && data !== null && !Array.isArray(data)
    ? Object.entries(data as Record<string, unknown>)
    : null;
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wider font-bold mb-2 ${accent}`}>{title}</div>
      <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2 max-h-72 overflow-y-auto">
        {entries ? entries.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-0.5">{k}</div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words leading-relaxed font-mono">
              {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
            </pre>
          </div>
        )) : (
          <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words font-mono">{JSON.stringify(data, null, 2)}</pre>
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
  const [lastRunLabel, setLastRunLabel] = useState<string | null>(null);

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

        setResult({ results, passed: results.filter((r) => r.passed).length, total: results.length, lastRunAt });
        if (lastRunAt) {
          const d = new Date(lastRunAt);
          setLastRunLabel(`${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);
        }
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
      const d = new Date(runAt);
      setLastRunLabel(d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
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

  const passRate = result ? Math.round((result.passed / result.total) * 100) : null;
  const rateColor = passRate === null ? "" : passRate === 100 ? "text-green-600" : passRate >= 80 ? "text-amber-600" : "text-red-500";

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-2">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">← Home</Link>
        </div>
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-indigo-600 font-bold mb-1">Maintainer&apos;s Cabinet</div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-1">Eval Runner</h1>
            <p className="text-gray-500">20 eval cases · live agents · results stored in DB</p>
            {lastRunLabel && (
              <p className="text-gray-400 text-xs mt-1 font-mono">Last run: {lastRunLabel}</p>
            )}
          </div>
          <button
            onClick={runEvals}
            disabled={running || loading}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            {running ? "Running…" : result ? "Re-run Evals" : "Run Evals"}
          </button>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Pass rate chart */}
        {history.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm mb-6">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">Pass Rate Over Time</div>
            <ScoreChart runs={history} />
            <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-2 px-6 sm:px-10">
              <span suppressHydrationWarning>{new Date(history[0].runAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <span>{history.length} run{history.length !== 1 ? "s" : ""}</span>
              <span suppressHydrationWarning>{new Date(history.at(-1)!.runAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
          </div>
        )}

        {/* Summary breakdown */}
        {byType && result && (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">{result.passed}/{result.total} passed</h2>
                <span className={`text-xl font-bold ${rateColor}`}>{passRate}%</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(byType).map(([type, { passed, total }]) => (
                  <div key={type} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${TYPE_COLOR[type] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {type}
                    </span>
                    <span className={`text-sm font-semibold ${passed === total ? "text-green-600" : "text-red-500"}`}>
                      {passed}/{total}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Case list */}
            <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">
              Case Results <span className="normal-case font-normal text-gray-400">— click any row to inspect</span>
            </div>
            <div className="space-y-2">
              {result.results.map((r) => (
                <EvalCard key={r.evalCaseId} r={r} />
              ))}
            </div>
          </>
        )}

        {!result && !running && (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            {loading
              ? <p className="text-gray-400">Loading last run…</p>
              : <>
                  <p className="text-gray-600 font-medium">No eval results yet.</p>
                  <p className="text-gray-400 text-sm mt-1">Click &quot;Run Evals&quot; to execute all 20 cases against live agents.</p>
                </>
            }
          </div>
        )}

        <footer className="border-t border-gray-200 pt-5 mt-8 flex items-center justify-between text-xs text-gray-400 font-mono">
          <Link href="/" className="hover:text-gray-600">← home</Link>
          <div>8 agents · autonomous + on-demand · trace-first · agentmail</div>
        </footer>
      </div>
    </main>
  );
}
