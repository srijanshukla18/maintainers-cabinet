"use client";

import { useState } from "react";
import Link from "next/link";

type EvalResult = {
  evalCaseId: string;
  name: string;
  caseType: string;
  passed: boolean;
  score: Record<string, unknown>;
  actual: unknown;
};

type RunResponse = {
  results: EvalResult[];
  passed: number;
  total: number;
};

const TYPE_COLOR: Record<string, string> = {
  issue_triage: "bg-blue-900 text-blue-300",
  pr_review: "bg-purple-900 text-purple-300",
  release: "bg-yellow-900 text-yellow-300",
  community: "bg-pink-900 text-pink-300",
};

export default function EvalsPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runEvals() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/evals/run", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
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
            <p className="text-gray-400 text-sm mt-1">Runs all 20 eval cases against live agents.</p>
          </div>
          <button
            onClick={runEvals}
            disabled={running}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {running ? "Running..." : "Run Evals"}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-6 text-red-300 text-sm">
            {error}
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
            <h2 className="text-base font-semibold text-gray-200 mb-3">Case Results</h2>
            <div className="space-y-2">
              {result.results.map((r) => (
                <div
                  key={r.evalCaseId}
                  className={`rounded-lg border p-3 ${r.passed ? "border-green-900 bg-green-950/30" : "border-red-900 bg-red-950/30"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm text-white">{r.name}</span>
                    <span className={`text-xs font-medium ${r.passed ? "text-green-400" : "text-red-400"}`}>
                      {r.passed ? "PASS" : "FAIL"}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(r.score).map(([k, v]) => (
                      <span key={k} className="text-xs text-gray-400 font-mono">
                        {k}: {typeof v === "boolean" ? (v ? "✓" : "✗") : typeof v === "number" ? v.toFixed(2) : String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!result && !running && (
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-gray-400">Click "Run Evals" to execute all eval cases.</p>
            <p className="text-gray-500 text-sm mt-1">
              Requires OPENAI_API_KEY and seeded eval cases (pnpm tsx scripts/seed-evals.ts).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
