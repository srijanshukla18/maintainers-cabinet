"use client";

import { useState, useEffect } from "react";

type TraceStep = {
  id: string;
  stepType: string;
  stepName: string;
  targetRef: string | null;
  status: string;
  inputJson: unknown;
  outputJson: unknown;
  traceJson: unknown;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  error: string | null;
};

const STAGE_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  fetch_repo:    { label: "Repo",     color: "text-sky-700",     bg: "bg-sky-50",     border: "border-sky-200",     dot: "bg-sky-500" },
  fetch_issues:  { label: "Issues",   color: "text-sky-700",     bg: "bg-sky-50",     border: "border-sky-200",     dot: "bg-sky-500" },
  fetch_prs:     { label: "PRs",      color: "text-sky-700",     bg: "bg-sky-50",     border: "border-sky-200",     dot: "bg-sky-500" },
  fetch_commits: { label: "Commits",  color: "text-sky-700",     bg: "bg-sky-50",     border: "border-sky-200",     dot: "bg-sky-500" },
  triage_issue:  { label: "Triage",   color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200",  dot: "bg-violet-500" },
  review_pr:     { label: "Review",   color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   dot: "bg-amber-500" },
  priority:      { label: "Priority", color: "text-fuchsia-700", bg: "bg-fuchsia-50", border: "border-fuchsia-200", dot: "bg-fuchsia-500" },
  briefing:      { label: "Briefing", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
};

function groupSteps(steps: TraceStep[]) {
  const fetches = steps.filter((s) => s.stepType.startsWith("fetch_"));
  const triages = steps.filter((s) => s.stepType === "triage_issue");
  const reviews = steps.filter((s) => s.stepType === "review_pr");
  const priority = steps.find((s) => s.stepType === "priority");
  const briefing = steps.find((s) => s.stepType === "briefing");

  return [
    { stage: "Data Collection", parallel: true, steps: fetches },
    { stage: "Issue Triage", parallel: true, steps: triages },
    { stage: "PR Review", parallel: true, steps: reviews },
    { stage: "Synthesis", parallel: false, steps: priority ? [priority] : [] },
    { stage: "Write Brief", parallel: false, steps: briefing ? [briefing] : [] },
  ].filter((g) => g.steps.length > 0);
}

export default function TraceFlow({ steps }: { steps: TraceStep[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const groups = groupSteps(steps);
  const selectedStep = steps.find((s) => s.id === selected);

  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  return (
    <div>
      {/* Pipeline */}
      <div className="flex flex-col">
        {groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && (
              <div className="flex justify-center">
                <div className="w-px h-4 bg-gray-300"></div>
              </div>
            )}

            <div className="flex items-start gap-4">
              <div className="w-[120px] shrink-0 pt-3">
                <div className="text-[11px] uppercase tracking-wider text-gray-400 font-bold leading-tight">
                  {group.stage}
                </div>
                {group.parallel && group.steps.length > 1 && (
                  <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                    {group.steps.length}x parallel
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-wrap gap-2">
                {group.steps.map((step) => {
                  const meta = STAGE_META[step.stepType] ?? STAGE_META.fetch_repo;
                  const isSelected = selected === step.id;

                  return (
                    <button
                      key={step.id}
                      onClick={() => setSelected(isSelected ? null : step.id)}
                      className={`
                        rounded-xl border px-3 py-2.5 text-left transition-all
                        ${isSelected
                          ? `${meta.bg} ${meta.border} ring-2 ring-indigo-400`
                          : `bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm`
                        }
                      `}
                      style={{ minWidth: group.parallel && group.steps.length > 4 ? "130px" : "170px" }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${step.status === "error" ? "bg-red-500" : meta.dot}`}></div>
                        <span className={`text-[11px] uppercase tracking-wider font-bold ${meta.color}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-800 font-medium line-clamp-1 leading-snug">
                        {step.targetRef ?? step.stepName.replace(/^(Triage issue |Review PR |Fetched \d+ |Repo metadata for )/, "")}
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono mt-1 flex items-center gap-2">
                        <span>{step.latencyMs ? `${(step.latencyMs / 1000).toFixed(1)}s` : "-"}</span>
                        {step.tokensIn != null && <span>{step.tokensIn + (step.tokensOut ?? 0)} tok</span>}
                        {step.costUsd != null && step.costUsd > 0 && <span>${step.costUsd.toFixed(4)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {selectedStep && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />
          <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex items-start justify-center pt-8 pointer-events-none">
            <div
              className="pointer-events-auto w-full max-w-5xl max-h-[85vh] rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0 bg-gray-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${selectedStep.status === "error" ? "bg-red-500" : STAGE_META[selectedStep.stepType]?.dot ?? "bg-gray-400"}`}></div>
                  <span className={`text-xs uppercase tracking-wider font-bold shrink-0 ${STAGE_META[selectedStep.stepType]?.color ?? "text-gray-500"}`}>
                    {selectedStep.stepType}
                  </span>
                  <span className="text-base text-gray-900 font-semibold truncate">{selectedStep.stepName}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {selectedStep.latencyMs && (
                    <span className="text-xs text-gray-500 font-mono font-semibold">{(selectedStep.latencyMs / 1000).toFixed(1)}s</span>
                  )}
                  {selectedStep.tokensIn != null && (
                    <span className="text-xs text-gray-500 font-mono">{selectedStep.tokensIn} in / {selectedStep.tokensOut ?? 0} out</span>
                  )}
                  {selectedStep.costUsd != null && selectedStep.costUsd > 0 && (
                    <span className="text-xs text-emerald-600 font-mono font-semibold">${selectedStep.costUsd.toFixed(4)}</span>
                  )}
                  <button
                    onClick={() => setSelected(null)}
                    className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors text-lg font-bold"
                  >
                    x
                  </button>
                </div>
              </div>

              {selectedStep.error && (
                <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700 font-mono font-semibold shrink-0">
                  {selectedStep.error}
                </div>
              )}

              <div className="p-6 overflow-y-auto flex-1 grid lg:grid-cols-3 gap-5 items-start">
                <KVBlock title="Input" data={selectedStep.inputJson} />
                <KVBlock title="Output" data={selectedStep.outputJson} />
                <ConversationBlock data={selectedStep.traceJson} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KVBlock({ title, data }: { title: string; data: unknown }) {
  if (!data) return null;
  const entries = typeof data === "object" && data !== null ? Object.entries(data as Record<string, unknown>) : null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">{title}</div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2 max-h-[60vh] overflow-y-auto">
        {entries ? entries.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-0.5">{k}</div>
            <div className="text-xs text-gray-800 leading-relaxed font-mono whitespace-pre-wrap break-words">
              {typeof v === "string"
                ? v
                : Array.isArray(v)
                ? v.map((item, i) => (
                    <span key={i} className="block">{typeof item === "string" ? item : JSON.stringify(item, null, 2)}</span>
                  ))
                : typeof v === "object" && v !== null
                ? Object.entries(v as Record<string, unknown>).map(([ik, iv]) => (
                    <span key={ik} className="block"><span className="text-gray-400">{ik}:</span> {typeof iv === "string" ? iv : JSON.stringify(iv)}</span>
                  ))
                : JSON.stringify(v)}
            </div>
          </div>
        )) : (
          <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}

type ConversationMessage = { role?: string; type?: string; content?: string | unknown[] };

function ConversationBlock({ data }: { data: unknown }) {
  if (!data) return null;

  const raw = data as Record<string, unknown>;
  const messages: ConversationMessage[] = Array.isArray(raw.history)
    ? (raw.history as ConversationMessage[])
    : Array.isArray(raw.input)
    ? (raw.input as ConversationMessage[])
    : [];

  if (messages.length === 0) {
    return (
      <div>
        <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">Agent Conversation</div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 max-h-[60vh] overflow-y-auto">
          <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">Agent Conversation</div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {messages.map((msg, i) => {
          const role = msg.role ?? msg.type ?? "unknown";
          const isUser = role === "user";
          const isAssistant = role === "assistant";
          const content = typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
            ? (msg.content as Array<{ text?: string; type?: string }>)
                .map((c) => c.text ?? JSON.stringify(c))
                .join("\n")
            : JSON.stringify(msg.content);

          return (
            <div key={i} className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
              isUser ? "bg-indigo-50 border border-indigo-100" :
              isAssistant ? "bg-white border border-gray-200" :
              "bg-gray-50 border border-gray-100"
            }`}>
              <div className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${
                isUser ? "text-indigo-500" : isAssistant ? "text-emerald-600" : "text-gray-400"
              }`}>{role}</div>
              <div className="text-gray-700 whitespace-pre-wrap break-words">{content}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
