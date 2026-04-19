"use client";

import { useState } from "react";

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

const STAGE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  fetch_repo:    { label: "Repo",      color: "text-cyan-300",    bg: "bg-cyan-950/40",    border: "border-cyan-800/50" },
  fetch_issues:  { label: "Issues",    color: "text-cyan-300",    bg: "bg-cyan-950/40",    border: "border-cyan-800/50" },
  fetch_prs:     { label: "PRs",       color: "text-cyan-300",    bg: "bg-cyan-950/40",    border: "border-cyan-800/50" },
  fetch_commits: { label: "Commits",   color: "text-cyan-300",    bg: "bg-cyan-950/40",    border: "border-cyan-800/50" },
  triage_issue:  { label: "Triage",    color: "text-violet-300",  bg: "bg-violet-950/40",  border: "border-violet-800/50" },
  review_pr:     { label: "Review",    color: "text-amber-300",   bg: "bg-amber-950/40",   border: "border-amber-800/50" },
  priority:      { label: "Priority",  color: "text-fuchsia-300", bg: "bg-fuchsia-950/40", border: "border-fuchsia-800/50" },
  briefing:      { label: "Briefing",  color: "text-emerald-300", bg: "bg-emerald-950/40", border: "border-emerald-800/50" },
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

  return (
    <div>
      {/* Pipeline */}
      <div className="flex flex-col">
        {groups.map((group, gi) => (
          <div key={gi}>
            {/* Connector line */}
            {gi > 0 && (
              <div className="flex justify-center">
                <div className="w-px h-4 bg-gradient-to-b from-slate-700 to-slate-800"></div>
              </div>
            )}

            {/* Stage row */}
            <div className="flex items-start gap-4">
              {/* Stage label */}
              <div className="w-[120px] shrink-0 pt-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500 font-mono leading-tight">
                  {group.stage}
                </div>
                {group.parallel && group.steps.length > 1 && (
                  <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                    {group.steps.length}x parallel
                  </div>
                )}
              </div>

              {/* Nodes */}
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
                          ? `${meta.bg} ${meta.border} ring-1 ring-offset-1 ring-offset-slate-950 ring-cyan-500/30`
                          : `bg-slate-900/60 border-slate-800 hover:${meta.border} hover:${meta.bg}`
                        }
                      `}
                      style={{ minWidth: group.parallel && group.steps.length > 4 ? "140px" : "180px" }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${step.status === "error" ? "bg-red-500" : step.status === "done" ? "bg-emerald-500" : "bg-slate-600"}`}></div>
                        <span className={`text-[10px] uppercase tracking-[0.2em] font-mono ${meta.color}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="text-xs text-white line-clamp-1 leading-snug">
                        {step.targetRef ?? step.stepName.replace(/^(Triage issue |Review PR |Fetched \d+ |Repo metadata for )/, "")}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-2">
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

      {/* Detail panel */}
      {selectedStep && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${selectedStep.status === "error" ? "bg-red-500" : "bg-emerald-500"}`}></div>
              <span className={`text-[10px] uppercase tracking-[0.22em] font-mono ${STAGE_META[selectedStep.stepType]?.color ?? "text-slate-400"}`}>
                {selectedStep.stepType}
              </span>
              <span className="text-sm text-white font-medium">{selectedStep.stepName}</span>
            </div>
            <div className="flex items-center gap-4">
              {selectedStep.latencyMs && (
                <span className="text-xs text-slate-500 font-mono">{(selectedStep.latencyMs / 1000).toFixed(1)}s</span>
              )}
              {selectedStep.tokensIn != null && (
                <span className="text-xs text-slate-500 font-mono">{selectedStep.tokensIn}in / {selectedStep.tokensOut ?? 0}out</span>
              )}
              {selectedStep.costUsd != null && selectedStep.costUsd > 0 && (
                <span className="text-xs text-emerald-400 font-mono">${selectedStep.costUsd.toFixed(4)}</span>
              )}
              <button onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:text-white font-mono">close</button>
            </div>
          </div>

          {selectedStep.error && (
            <div className="border-b border-red-900/50 bg-red-950/20 px-5 py-2 text-sm text-red-300 font-mono">
              {selectedStep.error}
            </div>
          )}

          <div className="p-5 grid lg:grid-cols-3 gap-4">
            <DetailBlock title="Input" data={selectedStep.inputJson} />
            <DetailBlock title="Output" data={selectedStep.outputJson} />
            <DetailBlock title="Agent Conversation" data={selectedStep.traceJson} />
          </div>
        </div>
      )}
    </div>
  );
}

function DetailBlock({ title, data }: { title: string; data: unknown }) {
  if (!data) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-mono mb-2 flex items-center gap-2">
        <div className="w-1 h-1 rounded-full bg-slate-700"></div>
        {title}
      </div>
      <div className="rounded-xl border border-slate-800/60 bg-[#0a0a0a] p-3">
        <pre className="text-[11px] leading-relaxed text-slate-400 font-mono overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words max-h-[300px]">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
