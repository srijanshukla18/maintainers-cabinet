"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InboxAction, InboxState } from "@/lib/inbox/types";

function scoreTone(score: number | null) {
  if (score == null) return "text-gray-400";
  if (score >= 80) return "text-red-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-slate-700";
  return "text-emerald-600";
}

function actionClass(tone: InboxAction["tone"], pending: boolean) {
  if (tone === "danger") {
    return `border-red-200 bg-red-600 text-white hover:bg-red-700 ${pending ? "opacity-60" : ""}`;
  }
  if (tone === "primary") {
    return `border-slate-900 bg-slate-900 text-white hover:bg-slate-800 ${pending ? "opacity-60" : ""}`;
  }
  return `border-gray-200 bg-white text-gray-700 hover:bg-gray-50 ${pending ? "opacity-60" : ""}`;
}

export function InboxClient({ initialState }: { initialState: InboxState }) {
  const router = useRouter();
  const [items] = useState(initialState.items);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<InboxAction | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => !hiddenIds.includes(item.id)),
    [hiddenIds, items]
  );

  const activeIndex = Math.min(selectedIndex, Math.max(visibleItems.length - 1, 0));
  const activeItem = visibleItems[activeIndex] ?? null;

  const dismissItem = useCallback((itemId: string) => {
    setHiddenIds((current) => [...current, itemId]);
    setMessage("Dismissed from this session. The queue will repopulate on refresh.");
    setError(null);
  }, []);

  const handleAction = useCallback(async (action: InboxAction, itemId?: string) => {
    setError(null);
    setMessage(null);

    if (action.href) {
      if (action.href.startsWith("/")) {
        router.push(action.href);
      } else {
        window.open(action.href, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setPendingActionId(action.id);
    try {
      const response = await fetch("/api/work-items/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItemId: itemId, actionId: action.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);

      if (data.undoAction) setUndoAction(data.undoAction as InboxAction);
      if (data.resolveItem && itemId) dismissItem(itemId);
      if (data.message) setMessage(String(data.message));
      if (data.redirectTo) router.push(String(data.redirectTo));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setPendingActionId(null);
    }
  }, [dismissItem, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, Math.max(visibleItems.length - 1, 0)));
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
      }
      if (event.key === "x" && activeItem) {
        event.preventDefault();
        dismissItem(activeItem.id);
      }
      if ((event.key === "Enter" || event.key === "a") && activeItem?.actions[0]) {
        event.preventDefault();
        void handleAction(activeItem.actions[0], activeItem.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem, dismissItem, handleAction, visibleItems.length]);

  if (visibleItems.length === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-gray-300 bg-white/80 p-10 text-center shadow-sm">
        <div className="text-xs font-bold uppercase tracking-[0.28em] text-gray-400">Action Inbox</div>
        <h2 className="mt-3 text-2xl font-semibold text-gray-900">Queue cleared for now</h2>
        <p className="mt-2 text-sm text-gray-500">
          Refresh the queue or generate a new digest to repopulate actionable work.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[2rem] border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.28em] text-gray-400">Active Card</div>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                {activeItem?.title}
              </h2>
            </div>
            <div className="rounded-full border border-gray-200 px-3 py-1 text-xs font-mono text-gray-500">
              {activeIndex + 1}/{visibleItems.length}
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">{activeItem?.summary}</p>
        </div>

        <div className="grid gap-6 px-6 py-6 xl:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <ScoreBadge label="Priority" value={activeItem?.scores.priority ?? null} />
              <ScoreBadge label="Urgency" value={activeItem?.scores.urgency ?? null} />
              <ScoreBadge label="Impact" value={activeItem?.scores.impact ?? null} />
              <ScoreBadge label="Slop" value={activeItem?.scores.slop ?? null} />
            </div>

            {activeItem?.autoReason ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Auto path available: {activeItem.autoReason}
              </div>
            ) : null}

            <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Evidence</div>
                <div className="text-xs text-gray-400">
                  {activeItem?.repo ? `${activeItem.repo.owner}/${activeItem.repo.name}` : "Global control-plane item"}
                </div>
              </div>
              <div className="space-y-3">
                {activeItem?.evidence.map((evidence) => (
                  <div
                    key={`${evidence.label}:${evidence.detail}`}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3"
                  >
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-gray-400">
                      {evidence.label}
                    </div>
                    <div className="mt-1 text-sm text-gray-700">{evidence.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Actions</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {activeItem?.actions.map((action) => {
                  const pending = pendingActionId === action.id;
                  return (
                    <button
                      key={action.id}
                      onClick={() => void handleAction(action, activeItem.id)}
                      disabled={pending}
                      className={`rounded-2xl border px-4 py-4 text-left transition-colors ${actionClass(action.tone, pending)}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-base font-semibold">{action.label}</span>
                        {action.approvalRequired ? (
                          <span className="rounded-full border border-white/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]">
                            Approve
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm opacity-90">{action.description}</div>
                      <div className="mt-3 text-xs opacity-80">
                        Downstream: {action.downstream.join(", ")}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => activeItem && dismissItem(activeItem.id)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Dismiss for now
                </button>
                <div className="text-xs text-gray-400">Keyboard: `j`/`k` move, `a` or `enter` runs the primary action, `x` dismisses.</div>
              </div>
            </div>

            {message ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {undoAction ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-gray-700">Undo is available for the last irreversible action.</div>
                  <button
                    onClick={() => void handleAction(undoAction)}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    {undoAction.label}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Queue</div>
                <div className="mt-1 text-sm text-gray-500">
                  Sequential clearing only. No dashboards, no tab-hopping.
                </div>
              </div>
              <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                {visibleItems.length} items
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {visibleItems.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedIndex(index)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                    item.id === activeItem?.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{item.targetRef ?? item.kind.replace(/_/g, " ")}</span>
                    <span className={`text-xs font-mono ${item.id === activeItem?.id ? "text-white/70" : scoreTone(item.scores.priority)}`}>
                      {item.scores.priority}
                    </span>
                  </div>
                  <div className={`mt-1 text-sm ${item.id === activeItem?.id ? "text-white/80" : "text-gray-600"}`}>
                    {item.title}
                  </div>
                  <div className={`mt-2 text-xs ${item.id === activeItem?.id ? "text-white/60" : "text-gray-400"}`}>
                    {item.surface} · {item.pillar.replace(/-/g, " ")}
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="rounded-[2rem] border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Queue Summary</div>
          <h3 className="mt-1 text-xl font-semibold text-gray-900">What matters right now</h3>
        </div>
        <div className="grid gap-3 p-5">
          <SummaryStat label="Urgent" value={initialState.summary.urgent} />
          <SummaryStat label="Approval steps" value={initialState.summary.approvalRequired} />
          <SummaryStat label="Auto paths" value={initialState.summary.autoExecutable} />
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-gray-400">Surfaces</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(initialState.summary.bySurface).map(([surface, count]) => (
                <span
                  key={surface}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600"
                >
                  {surface}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className={`text-3xl font-semibold ${scoreTone(value)}`}>{value ?? "--"}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-gray-400">{label}</div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-3xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-gray-400">{label}</div>
    </div>
  );
}
