# Maintainer's Cabinet

A team of AI agents that replaces the morning triage shift for an open source maintainer.

Every morning: scan the full issue queue, triage every issue, review every PR, rank what matters today, write the brief, email it. Full trace of every agent decision visible in the UI.

**Live:** [cabinet.autoprio.dev](https://cabinet.autoprio.dev)

---

## What it does

Open source maintainers wake up to 40+ GitHub notifications. Issues with no context. PRs nobody reviewed. A security report buried in the noise. Cabinet handles the queue.

Point it at any public GitHub repo. Seven specialist agents run in parallel, argue about what matters, and deliver a prioritized morning brief — as a web dashboard and an email in your inbox.

---

## Agent org

Cabinet is a managed team, not a bot.

```
Cabinet Manager (orchestrator)
├── Triage Agent         — classifies every issue (bug, feature, security, duplicate, needs-info)
├── Community Agent      — rewrites bot comments for tone and safety
├── PR Review Agent      — risk-ranks every PR, flags missing tests and security paths
├── Docs Agent           — detects docs impact from PR diffs
├── Release Agent        — detects release note need, drafts changelog bullet
├── Priority Agent       — synthesizes all outputs, ranks top 3-7 items for today
└── Briefing Agent       — writes the maintainer email from the ranked list
```

**Two orchestration modes:**

1. **Webhook mode (reactive):** GitHub fires a webhook → Manager routes to the right specialist → labels applied, comment posted, check run created on GitHub.

2. **Morning Brief mode (proactive):** Paste any public repo → 35 agents run in parallel (triage × N issues + review × N PRs) → Priority agent synthesizes → Briefing agent writes the email → delivered via AgentMail.

All agents use `@openai/agents` SDK (`Agent` + `run()` + `outputType` for structured output via Zod schemas).

---

## Real output, real surfaces

- **Labels and comments** posted on real GitHub issues and PRs (via installed GitHub App)
- **Check runs** created on real pull requests
- **Email** delivered to a real Gmail inbox via AgentMail
- **Full trace** stored in Postgres — every agent step, input, output, token count, cost, latency — queryable and visualized in the dashboard

---

## Observability

Every brief generates a full trace stored in `BriefTraceStep` rows:

| Step type | What's stored |
|---|---|
| `fetch_repo`, `fetch_issues`, `fetch_prs` | Raw GitHub data |
| `triage_issue` × N | Input issue, triage output, agent conversation history, tokens in/out, cost, latency |
| `review_pr` × N | Input PR, review output, agent conversation history, tokens in/out, cost, latency |
| `priority` | Full ranked list, agent conversation, tokens, cost |
| `briefing` | Email content, agent conversation, tokens, cost |

The dashboard renders this as a **clickable pipeline flowchart** — each node shows tokens, cost, and latency. Click any node to inspect the raw input, structured output, and full agent conversation history.

OpenAI platform traces at [platform.openai.com/traces](https://platform.openai.com/traces) — every run is named `morning_brief:{owner}/{repo}`.

---

## Memory

After each brief, Cabinet persists a `RepoMemory` record per repo:

- Recurring issue themes
- Top contributors by activity
- Known issue type distribution
- What the priority agent recommended last time

The next brief's priority agent receives this memory and avoids repeating the same recommendations.

---

## Evaluation

20 eval cases across 4 agent types (issue triage, PR review, release, community). Run manually with `pnpm eval` or triggered automatically by the CI pipeline.

**CI gate:** `.github/workflows/eval.yml` runs the full eval set on every push. Quality regression blocks merge.

```bash
pnpm eval
# → 18/20 passed
# → triage: 8/10  pr_review: 5/5  release: 3/3  community: 2/2
```

---

## Cost and latency

Full brief for `hashicorp/vault-csi-provider` (22 issues + 13 PRs):
- **Latency:** ~26 seconds end-to-end
- **Cost:** ~$0.12 per brief (tracked per step, visible in UI)

---

## Stack

- **Next.js** (App Router, Server Components)
- **TypeScript**
- **PostgreSQL** + Prisma 7 + `@prisma/adapter-pg`
- **OpenAI Agents SDK** (`@openai/agents`) — all 7 agents
- **Octokit** — GitHub API (issues, PRs, labels, check runs, webhooks)
- **AgentMail** — email delivery
- **Tailwind CSS**
- **Cloudflare Tunnel** — persistent public URL

---

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Environment

Copy `.env.example` to `.env`:

```bash
DATABASE_URL="postgresql://localhost:5432/cabinet"
OPENAI_API_KEY=""
GITHUB_APP_ID=""
GITHUB_APP_PRIVATE_KEY=""
GITHUB_WEBHOOK_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
AGENTMAIL_API_KEY=""
MAINTAINER_EMAIL=""
CABINET_PASSWORD=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Database

```bash
pnpm db:push      # sync schema
pnpm seed:evals   # seed 20 eval cases
```

### 4. Run

```bash
pnpm dev
```

### 5. Evals

```bash
pnpm eval
```

### 6. GitHub App

Create at `github.com/settings/apps/new`. Required permissions: Issues (R/W), Pull requests (R/W), Contents (R), Checks (R/W), Actions (R). Subscribe to: `issues`, `issue_comment`, `pull_request`, `workflow_run`, `installation`.

---

## Safety

Cabinet will never merge PRs, approve PRs, close issues, publish releases, push commits, or obey instructions injected into issue/PR bodies.

All GitHub writes are gated by `autonomy` flags in `.github/cabinet.yml`. Default: labels and comments only.

---

## Slash commands

Post in any issue or PR comment:

```
/cabinet triage        — re-triage the issue
/cabinet review        — re-run PR review
/cabinet docs-impact   — check docs impact on PR
/cabinet release-plan  — draft release notes from merged PRs
```
