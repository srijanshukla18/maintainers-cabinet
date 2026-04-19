# Honest Rubric Assessment
*Maintainer's Cabinet — assessed against MaaS rubric (164 base + overflow)*

---

## Working product shipping real output — **L4** → 60 pts

**What we have:**
- Real GitHub labels and comments posted on real issues/PRs via installed GitHub App
- Real check runs created on real pull requests
- Real email delivered to a real Gmail inbox via AgentMail
- Autonomous cron scheduler fires `generateBrief + sendBrief` daily with zero human input
- Public live URL: cabinet.autoprio.dev

**Why not L5:**
L5 requires "autonomously completes a real task end-to-end, production quality." We get close — the cron fires, the email lands, the labels appear. But Cabinet never closes an issue, merges a PR, or takes a consequential irreversible action. Every output is advisory or additive (label, comment, email). A judge testing it live during judging would see autonomous output land, but would need to decide whether "email + label" counts as a completed task in the same way "contract redlined in Notion" does. Honest call: high L4.

**Overflow potential:** Every additional repo scanned live during judging = +1 pt × 20x. Three repos = +60 pts on top of base.

---

## Agent org structure — **L3-L4** → 12 pts

**What we have:**
- 8 named specialists: Planner, Triage, Community, PR Review, Docs, Release, Priority, Briefing
- Planning Agent reads each GitHub event and reasons which specialists to invoke
- Planner returns `{ agents: [...], reasoning, priority_hint }` — not a hardcoded switch
- Security reports get `escalate_security` path — Triage skipped entirely, different output
- Brief orchestrator fans out triage × N + review × N in parallel, then synthesizes

**Why not L4 cleanly:**
L4 requires "manager agent plans subtasks based on the specific request, delegates, reviews outputs." The Planner does plan and delegate. But it does not *review* specialist outputs and decide whether to retry or escalate. If Triage returns `needs_info` on what looks like a security report, the Planner does not catch that and override. No feedback loop between manager and specialists.

**Why not L5:**
L5 requires emergent org — manager spawns sub-specialists on the fly, agents escalate when stuck, roles self-adjust. None of that exists. The org is fixed.

**Honest call:** Strong L3, touching L4. Score mid-range.

---

## Observability — **L4** → 21 pts

**What we have:**
- Full trace stored in Postgres: every agent step, input, output, agent conversation history, tokens in/out, cost per step, latency per step
- Clickable pipeline flowchart in the UI — each node shows tokens, cost, latency; click opens modal with raw input/output/history
- Named OpenAI platform traces (`morning_brief:{owner}/{repo}`) at platform.openai.com/traces
- `BriefTraceStep` table queryable — a developer can write SQL to debug any run

**Why not L5:**
L5 requires: diff two runs side by side, alerts on failure or cost spike, search across runs. We have none of these. There is no alert if a brief costs 3× the average. There is no "compare brief from Monday vs Tuesday." There is no full-text search across agent reasoning. A senior engineer debugging a production incident would find our trace UI useful but would want those three things.

---

## Evaluation and iteration — **L4** → 15 pts

**What we have:**
- 20 named eval cases (10 triage, 5 PR review, 3 release, 2 community) in `evals/cases.json`
- `pnpm eval` runs all 20 against live agents, exits code 1 on regression
- GitHub Action (`.github/workflows/eval.yml`) runs eval on every push and blocks merge on failure

**Why not L5:**
L5 requires closed-loop: failed production runs feed a growing eval set, version-controlled prompts, measurable gains across versions. We have none of that. A real production failure doesn't automatically create a new eval case. Prompts live in `.ts` files but aren't versioned independently. We have no before/after comparison showing prompt improvement over time.

---

## Agent handoffs and memory — **L3-L4** → 5 pts

**What we have:**
- Within a brief: triage outputs → priority agent → briefing agent. Context flows forward.
- `RepoMemory` persists across briefs: recurring themes, top contributors, previous recommendations, known issue type distribution
- Priority agent receives memory before ranking — avoids repeating the same recommendations

**Why not L4 cleanly:**
L4 requires "persistent memory across tasks (agent remembers past customers, past projects)." We have this for repos but not for individual contributors. Cabinet does not remember "user X is a known good-faith contributor who filed 3 accurate bugs last month" — it treats every issue author the same.

**Why not L5:**
L5 requires hierarchical memory: working (current task) + episodic (past tasks) + semantic (domain facts, team norms). We have episodic at the repo level. No semantic layer (e.g. "this repo ships every 2 weeks, so patch-level items can wait"). No working memory that survives a crash mid-run.

---

## Cost and latency per task — **L4** → 3 pts

**What we have:**
- Full brief for hashicorp/vault-csi-provider (22 issues + 13 PRs): ~26 seconds, ~$0.12
- Per-step cost tracked in DB and visible in UI

**Why not L5:**
L5 requires under 1 min AND under $0.10. We're over on cost. $0.12 vs $0.10 — close but honest. Running fewer parallel triage calls or using gpt-4o-mini for triage (vs gpt-4o) would push this to L5 cost-wise.

---

## Management UI — **L3** → 2 pts

**What we have:**
- Homepage shows full 8-agent roster with descriptions — anyone can read what each agent does
- "Watched Repos" panel: add a repo, set email, set schedule hour, trigger now
- Recent briefs grid with priority items visible at a glance
- "Run now" button — no code required to trigger a brief
- Password-protected

**Why not L4:**
L4 requires "clean UI, non-eng operates with one walkthrough." A PM with a 2-minute walkthrough could use this. But "one walkthrough" implies the UI itself is self-explaining. Ours is close but the agent config is invisible — you can't see what each agent's instructions are, can't change the triage thresholds, can't toggle which agents fire for which events. That all lives in `.github/cabinet.yml` or code.

**Why not L5:**
L5 requires a non-engineer to onboard a new agent role unassisted — define its job, tools, guardrails — in under 10 minutes. There is no such UI. Adding a new agent requires writing TypeScript.

---

## Total

| Parameter | Weight | Level | Pts |
|---|---|---|---|
| Real output | 20x | L4 | 60 |
| Agent org | 5x | L3-L4 | 12 |
| Observability | 7x | L4 | 21 |
| Eval | 5x | L4 | 15 |
| Memory | 2x | L3-L4 | 5 |
| Cost/latency | 1x | L4 | 3 |
| Mgmt UI | 1x | L3 | 2 |
| **Base total** | | | **~118 / 164** |
| **+ overflow (3 live scans)** | | | **+60** |
| **Realistic total** | | | **~178** |

---

## Biggest remaining gaps (honest)

**To push Real output toward L5 (+20 pts):**
Cabinet needs to take a consequential irreversible action autonomously — close a stale issue, post a release, open a follow-up PR to add missing docs. Currently it only adds labels and posts comments. High risk to build carelessly; high reward if done safely.

**To push Agent org to L4 cleanly (+3 pts):**
Add a review loop: after specialist outputs are collected, the Planner reads them and decides whether to escalate, retry with a different prompt, or flag for human. One more agent call per run.

**To push Observability to L5 (+7 pts):**
Add: (1) run-diff view — pick two brief IDs, see what changed. (2) cost spike alert — if a brief costs 2× the 7-day average, Slack/email the maintainer. (3) full-text search across agent reasoning in the UI.

**To push Mgmt UI to L4 (+1 pt):**
Let a non-engineer change triage thresholds, autonomy flags, and email recipient from the UI — without touching `.github/cabinet.yml` or `.env`.
