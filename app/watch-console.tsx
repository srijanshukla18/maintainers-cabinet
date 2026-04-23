"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type WatchedRepo = {
  id: string;
  owner: string;
  name: string;
  emailRecipient: string;
  scheduleHour: number;
  active: boolean;
  autoPostComments: boolean;
  autoAddLabels: boolean;
  duplicateThreshold: number;
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

function RepoCard({ repo, onUpdate, onDelete, onTrigger, triggering }: {
  repo: WatchedRepo;
  onUpdate: (id: string, data: Partial<WatchedRepo>) => void;
  onDelete: (id: string) => void;
  onTrigger: (repo: WatchedRepo) => void;
  triggering: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({
    emailRecipient: repo.emailRecipient,
    scheduleHour: String(repo.scheduleHour),
  });

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/watched/${repo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailRecipient: fields.emailRecipient,
          scheduleHour: parseInt(fields.scheduleHour),
        }),
      });
      const data = await res.json();
      if (res.ok) { onUpdate(repo.id, data); setExpanded(false); }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await fetch(`/api/watched/${repo.id}`, { method: "DELETE" });
    onDelete(repo.id);
  }

  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <div className="px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-mono font-bold text-gray-900">{repo.owner}/{repo.name}</div>
            <div className="text-xs text-gray-400 font-mono mt-0.5">
              {repo.scheduleHour}:00 UTC · {repo.emailRecipient} · last run {formatRelative(repo.lastRunAt)}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {repo.lastBriefId ? (
              <Link href={`/briefs/${repo.lastBriefId}`} className="text-xs text-indigo-600 font-semibold hover:underline">brief</Link>
            ) : null}
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-400 hover:text-gray-700 font-mono px-2 py-1 rounded-lg hover:bg-gray-100">
              {expanded ? "close" : "settings"}
            </button>
            <button
              onClick={() => onTrigger(repo)}
              disabled={triggering === repo.id}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {triggering === repo.id ? "Running..." : "Run now"}
            </button>
          </div>
        </div>

        {/* Inline settings panel */}
        {expanded && (
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">Agent Configuration</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500 font-semibold block mb-1">Email recipient</label>
                <input value={fields.emailRecipient} onChange={(e) => setFields((p) => ({ ...p, emailRecipient: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold block mb-1">Schedule (UTC hour)</label>
                <select value={fields.scheduleHour} onChange={(e) => setFields((p) => ({ ...p, scheduleHour: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i}:00 UTC</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 mt-1">Autonomy settings are inherited from the default config. No custom overrides yet.</p>

             <div className="flex items-center justify-between">
              <button onClick={remove} className="text-xs text-red-500 hover:text-red-700 font-semibold">Remove repo</button>
              <div className="flex gap-2">
                <button onClick={() => setExpanded(false)} className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold text-xs px-4 py-1.5 rounded-lg transition-colors">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
  const [schedulerOnline, setSchedulerOnline] = useState(false);

  useEffect(() => {
    fetch("/api/cron", { method: "GET" })
      .then((r) => r.json())
      .then((data: { scheduler?: { started?: boolean } }) => setSchedulerOnline(Boolean(data.scheduler?.started)))
      .catch(() => setSchedulerOnline(false));
  }, []);

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
          <div className="text-sm text-gray-500">Briefs run automatically on schedule. Configure each repo independently.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${schedulerOnline ? "bg-emerald-500" : "bg-gray-300"}`}></div>
          <span className={`text-xs font-mono font-semibold ${schedulerOnline ? "text-emerald-600" : "text-gray-400"}`}>
            {schedulerOnline ? "scheduler active" : "manual trigger only"}
          </span>
        </div>
      </div>

      {repos.length === 0 && (
        <div className="px-5 py-6 text-center text-sm text-gray-400">No repos watched yet. Add one below.</div>
      )}

      {repos.map((repo) => (
        <RepoCard
          key={repo.id}
          repo={repo}
          triggering={triggering}
          onTrigger={triggerNow}
          onUpdate={(id, data) => setRepos((prev) => prev.map((r) => r.id === id ? { ...r, ...data } : r))}
          onDelete={(id) => setRepos((prev) => prev.filter((r) => r.id !== id))}
        />
      ))}

      {error && <div className="px-5 py-2 text-xs text-red-600 font-medium border-t border-gray-100">{error}</div>}

      {/* Add form */}
      <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
        <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">Watch a new repo</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="owner" className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="repo" className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" />
        </div>
        <div className="grid grid-cols-[1fr_80px_auto] gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <select value={hour} onChange={(e) => setHour(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i}:00 UTC</option>)}
          </select>
          <button onClick={addRepo} disabled={adding || !owner || !name || !email}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
            {adding ? "..." : "Watch"}
          </button>
        </div>
      </div>
    </div>
  );
}
