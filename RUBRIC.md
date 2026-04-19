# Rubric Assessment — Maintainer's Cabinet

| Parameter (weight) | Level | Score | Why |
|---|---|---|---|
| **Real output** (20x) | **L4** | 60/80 | Labels, comments, check runs on real GitHub repos. Email in real Gmail. Autonomous cron fires daily with no human input. Not L5 because Cabinet never takes a consequential irreversible action (no merges, no closes). |
| **Agent org** (5x) | **L3-L4** | 12/20 | Planning Agent reads each event and reasons which of 8 specialists to invoke. Security reports get a different path entirely (triage skipped). Not L4 cleanly because specialists don't escalate back to the Planner if they're uncertain. |
| **Observability** (7x) | **L4-L5** | 24/28 | Full trace per run: every agent step, input, output, agent conversation, tokens in/out, cost, latency. Clickable pipeline flowchart. Run-diff view compares two briefs side by side — priorities added/dropped/re-ranked, cost delta, queue health delta. Missing: automated cost-spike alerts. |
| **Evaluation** (5x) | **L4** | 15/20 | 20 named eval cases. GitHub Action runs `pnpm eval` on every push. Fails the build on regression. Missing: failed production runs don't auto-generate new eval cases. |
| **Memory** (2x) | **L3-L4** | 5/8 | `RepoMemory` persists recurring themes, top contributors, previous recommendations across briefs. Priority agent reads it before ranking. Missing: no per-contributor memory or semantic layer (e.g. "this repo ships bi-weekly"). |
| **Cost/latency** (1x) | **L4** | 3/4 | ~26s, ~$0.12 per brief (22 issues + 13 PRs). Per-step cost tracked and visible. Not L5 — need under $0.10. |
| **Management UI** (1x) | **L4** | 3/4 | Dashboard shows full 8-agent roster. Watched repos with per-repo settings (email, schedule, autonomy flags, duplicate threshold) editable without touching code. Run now button. Not L5 — can't define a new agent role from the UI. |
| **Base total** | | **~122/164** | |
| **+ overflow (3 live scans)** | | **+60** | Each live repo scan during judging = +1pt × 20x |
| **Realistic total** | | **~182** | |
