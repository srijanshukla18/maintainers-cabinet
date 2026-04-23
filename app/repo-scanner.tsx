"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = ["kubernetes/kubernetes", "rust-lang/rust", "nodejs/node", "vercel/next.js"];

export function RepoScanner() {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(nextRepo = repo) {
    const value = nextRepo.trim();
    if (!value) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      router.push(`/scans/${data.scanId}`);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
      setLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Public GitHub repo</label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          value={repo}
          onChange={(event) => setRepo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder="kubernetes/kubernetes"
          className="min-h-12 flex-1 rounded-xl border border-gray-300 bg-gray-50 px-4 font-mono text-sm text-gray-950 outline-none transition focus:border-gray-900 focus:bg-white"
          disabled={loading}
        />
        <button
          onClick={() => void submit()}
          disabled={loading || !repo.trim()}
          className="min-h-12 rounded-xl bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500"
        >
          {loading ? "Scanning..." : "Scan repo"}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            onClick={() => {
              setRepo(example);
              void submit(example);
            }}
            disabled={loading}
            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-white disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>
      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </section>
  );
}

