"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HomeConsole() {
  const router = useRouter();
  const [repoInput, setRepoInput] = useState("");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/briefs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repoInput, forceRefresh }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(`/briefs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <div className="text-xs uppercase tracking-widest text-indigo-600 font-semibold">Mission Console</div>
        <div className="text-sm text-gray-500">Paste any public GitHub repo to generate a brief.</div>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-gray-400 font-semibold block mb-2">
            Target Repo
          </label>
          <div className="flex gap-3">
            <input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="hashicorp/vault-csi-provider"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50"
              disabled={loading}
              onKeyDown={(e) => { if (e.key === "Enter" && repoInput.trim()) generate(); }}
            />
            <button
              onClick={generate}
              disabled={loading || !repoInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              {loading ? "Running..." : "Run Agents"}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={forceRefresh}
            onChange={(e) => setForceRefresh(e.target.checked)}
            disabled={loading}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Force refresh (ignore 6-hour cache)
        </label>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 flex items-center gap-4">
            <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
            <div className="font-mono text-sm text-indigo-700 font-medium">Orchestrating agents across queue...</div>
          </div>
        )}
      </div>
    </div>
  );
}