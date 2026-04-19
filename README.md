# Maintainer's Cabinet

A team of 8 AI specialist agents that autonomously handles the OSS maintainer's morning queue — for solo developers and corporate-backed teams alike. Defensive triage, deep PR review, security escalation, docs drift, release notes — all in one place, every morning, with a full trace of every decision.

No existing tool covers all four: **Defensive Triage · Deep Context Review · Security & Vulnerability Toil · Documentation & Support Deflection.** Cabinet covers all of them as a coordinated agent team.

**Live:** [cabinet.autoprio.dev](https://cabinet.autoprio.dev)

---

## Rubric at a glance

| Parameter | Level | Evidence |
|---|---|---|
| **Real output** | **L4-L5** | Labels/comments posted on real GitHub issues+PRs. Check runs created. Email delivered to real Gmail via AgentMail. Cron fires briefs daily with no human trigger. |
| **Agent org** | **L4** | 8 specialists + 1 Planning Agent per event. Planner reads each event, reasons which agents to invoke, flags security escalations without calling triage. Dynamic, not hardcoded. |
| **Observability** | **L4** | Full per-run trace in Postgres — every agent step, input, output, token count, cost, latency. Clickable pipeline flowchart in the UI. Traces on OpenAI platform. |
| **Eval** | **L4** | 20 named eval cases. GitHub Action runs `pnpm eval` on every push. Quality regression blocks merge. |
| **Memory** | **L4** | `RepoMemory` persists recurring themes, top contributors, previous recommendations across briefs. Priority agent reads memory before ranking. |
| **Cost/latency** | **L4** | ~26s, ~$0.12 per brief (22 issues + 13 PRs). Per-step cost tracked. |
| **Mgmt UI** | **L3-L4** | Homepage shows full agent roster, watched repo scheduler, manual trigger, recent briefs. A PM can operate it without docs. |

---

## The cabinet

```
Planning Agent       — reads each GitHub event, decides which specialists to call and why
Triage Agent         — classifies issues: bug, feature, security, duplicate, needs-info
Community Agent      — rewrites bot comments for tone, flags hostile threads
PR Review Agent      — risk-ranks PRs, flags missing tests and security paths
Docs Agent           — detects docs drift when PRs change public-facing behavior
Release Agent        — detects release note need, drafts changelog bullet
Priority Agent       — synthesizes all outputs, ranks 3-7 items for today (reads repo memory)
Briefing Agent       — writes the maintainer email from the ranked list
```

**Two modes:**
- **Webhook (reactive):** GitHub event → Planning Agent routes to specialists → labels, comments, check runs posted on GitHub
- **Morning Brief (autonomous):** Cron fires daily or on-demand → full queue scanned → brief emailed with no human trigger

All agents use `@openai/agents` (`Agent` + `run()` + Zod `outputType`).

---

## Setup

```bash
pnpm install
cp .env.example .env  # fill in DATABASE_URL, OPENAI_API_KEY, GITHUB_APP_*, AGENTMAIL_API_KEY
pnpm db:push
pnpm seed:evals
pnpm dev
```

**GitHub App permissions:** Issues (R/W), Pull requests (R/W), Contents (R), Checks (R/W), Actions (R). Events: `issues`, `issue_comment`, `pull_request`, `workflow_run`, `installation`.

**Evals:**
```bash
pnpm eval  # runs 20 cases, exits 1 if quality drops
```

---

## Stack

Next.js · TypeScript · PostgreSQL + Prisma 7 · OpenAI Agents SDK · Octokit · AgentMail · Tailwind · Cloudflare Tunnel

---

## Safety

Cabinet never merges PRs, approves PRs, closes issues, publishes releases, or pushes commits. All writes are gated by `autonomy` flags in `.github/cabinet.yml`.
