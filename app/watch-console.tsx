"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type WatchedRepo = {
  id: string;
  owner: string;
  name: string;
  emailRecipient: string;
  scheduleHour: number;
  active: boolean;
  lastRunAt: string | null;
  lastBriefId: string | null;
};

function formatRelative(d: string | null) {
  if (!d) return "never";
  const diffMs = Date.now() - new Date(d).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function WatchConsole({ initial }: { initial: WatchedRepo[] }) {
  const router = useRouter();
  const [repos, setRepos] = useState<WatchedRepo[]>(initial);
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hour, setHour] = useState("8");
  const [adding, setAdding] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addRepo() {
    if (!owner || !name || !email) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, name, emailRecipient: email, scheduleHour: parseInt(hour) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRepos((prev) => [data, ...prev.filter((r) => `${r.owner}/${r.name}` !== `${owner}/${name}`)]);
      setOwner(""); setName(""); setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function triggerNow(repo: WatchedRepo) {
    setTriggering(repo.id);
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: repo.owner, name: repo.name, emailRecipient: repo.emailRecipient }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/briefs/${data.briefId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTriggering(null);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-indigo-600 font-bold">Watched Repos</div>
          <div className="text-sm text-gray-500">Cabinet runs every morning automatically. Trigger anytime.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-mono text-emerald-600 font-semibold">scheduler active</span>
        </div>
      </div>

      {/* Watched repos list */}
      {repos.length > 0 && (
        <div className="divide-y divide-gray-50">
          {repos.map((repo) => (
            <div key={repo.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-mono font-semibold text-gray-900">{repo.owner}/{repo.name}</div>
                <div className="text-xs text-gray-400 font-mono">
                  daily at {repo.scheduleHour}:00 UTC · {repo.emailRecipient} · last run {formatRelative(repo.lastRunAt)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {repo.lastBriefId && (
                  <a href={`/briefs/${repo.lastBriefId}`} className="text-xs text-indigo-600 font-semibold hover:underline">
                    last brief
                  </a>
                )}
                <button
                  onClick={() => triggerNow(repo)}
                  disabled={triggering === repo.id}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {triggering === repo.id ? "Running..." : "Run now"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
        <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">Watch a new repo</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="owner" className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="repo" className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" />
        </div>
        <div className="grid grid-cols-[1fr_80px_auto] gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email to receive brief" className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <select value={hour} onChange={(e) => setHour(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{i}:00 UTC</option>
            ))}
          </select>
          <button
            onClick={addRepo}
            disabled={adding || !owner || !name || !email}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {adding ? "..." : "Watch"}
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-red-600 font-medium">{error}</div>}
      </div>
    </div>
  );
}
