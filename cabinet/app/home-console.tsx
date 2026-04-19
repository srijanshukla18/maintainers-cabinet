"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HomeConsole() {
  const router = useRouter();
  const [repoInput, setRepoInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/briefs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repoInput, forceRefresh: false }),
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
    <div className="rounded-2xl border border-cyan-900/40 bg-slate-950/80 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_0_80px_rgba(14,165,233,0.08)]">
      <div className="border-b border-cyan-950/60 px-5 py-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-400 font-mono">Mission Console</div>
          <div className="text-sm text-slate-400">Paste any public GitHub repo to generate a brief.</div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-mono block mb-2">
            Target Repo
          </label>
          <div className="flex gap-3">
            <input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="hashicorp/vault-csi-provider"
              className="flex-1 bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
              disabled={loading}
              onKeyDown={(e) => { if (e.key === "Enter" && repoInput.trim()) generate(); }}
            />
            <button
              onClick={generate}
              disabled={loading || !repoInput.trim()}
              className="bg-cyan-500/90 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold px-5 py-3 rounded-xl transition-colors"
            >
              {loading ? "Running..." : "Run Agents"}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-300 bg-red-950/30 border border-red-900 rounded-xl p-3">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-cyan-950/60 bg-slate-900/40 p-4 text-sm text-slate-300 flex items-center gap-4">
            <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
            <div className="font-mono text-xs text-cyan-300 animate-pulse">Orchestrating agents across queue...</div>
          </div>
        )}
      </div>
    </div>
  );
}
