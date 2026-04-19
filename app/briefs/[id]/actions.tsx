"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BriefActions({ briefId, alreadySent }: { briefId: string; alreadySent: boolean }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/briefs/${briefId}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={send}
        disabled={sending || sent}
        className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
          sent
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
            : "bg-indigo-600 hover:bg-indigo-700 text-white"
        } ${sending ? "opacity-50" : ""}`}
      >
        {sent ? "Sent to inbox" : sending ? "Sending..." : "Send to my inbox"}
      </button>
      {error && <span className="text-sm text-red-600 font-medium">{error}</span>}
    </div>
  );
}
