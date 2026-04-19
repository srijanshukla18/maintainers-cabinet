# Maintainer's Cabinet

A GitHub-native multi-agent maintainer assistant.

Triages issues, reviews PRs, detects docs impact, drafts release notes, and shows every agent step in a trace.

## Stack

- Next.js 16 (App Router)
- TypeScript
- PostgreSQL + Prisma 7 + `@prisma/adapter-pg`
- Octokit (GitHub API)
- OpenAI API (structured outputs via `zodTextFormat`)
- Tailwind CSS

## Agents

| Agent | Purpose |
|---|---|
| Cabinet Manager | Orchestrator — static routing, applies safe GitHub actions |
| Triage Agent | Classifies issues, detects duplicates, asks for missing info |
| Community Agent | Rewrites bot comments for tone and safety |
| PR Review Agent | Risk summary, findings, check run |
| Docs Agent | Detects docs impact from PR diff |
| Release Agent | Detects release note need, drafts bullet |

## Setup

### 1. Prerequisites

- Node 20+
- pnpm
- PostgreSQL running locally

### 2. Install

```bash
pnpm install
```

### 3. Environment

Copy `.env.example` to `.env` and fill in:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cabinet"

# GitHub App (create at github.com/settings/apps)
GITHUB_APP_ID=""
GITHUB_APP_PRIVATE_KEY=""        # paste PEM contents, \n-escaped
GITHUB_WEBHOOK_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# OpenAI
OPENAI_API_KEY=""

NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Database

```bash
pnpm db:push        # push schema to DB (dev)
pnpm seed:evals     # seed 20 eval cases
```

### 5. GitHub App

Create a GitHub App at `https://github.com/settings/apps/new`:

- **Homepage URL:** `http://localhost:3000`
- **Webhook URL:** `https://<your-tunnel>.ngrok.io/api/webhook`
- **Webhook secret:** same as `GITHUB_WEBHOOK_SECRET`
- **Callback URL:** `http://localhost:3000/api/github/callback`

Permissions (Repository):
- Metadata: Read
- Issues: Read & Write
- Pull requests: Read & Write
- Contents: Read
- Checks: Read & Write
- Actions: Read

Subscribe to events:
- `issues`
- `issue_comment`
- `pull_request`
- `workflow_run`
- `installation`

Download and set `GITHUB_APP_PRIVATE_KEY` in `.env`.

### 6. Tunnel (for local dev)

```bash
ngrok http 3000
```

Update webhook URL in GitHub App settings to the ngrok URL.

### 7. Run

```bash
pnpm dev
```

Open `http://localhost:3000`.

### 8. Evals

```bash
pnpm eval
```

Runs 20 eval cases against live agents. Requires `OPENAI_API_KEY` and seeded eval cases.

## Routes

| Route | Purpose |
|---|---|
| `/` | Repo selector |
| `/repos/:owner/:repo` | Repo dashboard — recent runs |
| `/runs/:id` | Run trace — agents, inputs/outputs, GitHub actions |
| `/evals` | Manual eval runner UI |
| `POST /api/webhook` | GitHub webhook receiver |

## Slash commands

Post in any issue or PR comment:

```
/cabinet triage           # re-triage the issue
/cabinet review           # re-run PR review
/cabinet docs-impact      # check docs impact on PR
/cabinet release-plan     # draft release notes from merged PRs
/cabinet explain          # explain what Cabinet did
```

Maintainers/collaborators can use all commands.
PR authors can use `review`, `docs-impact`, `explain`.
Anyone can use `explain`.

## Safety rules

Cabinet will never:
- Merge PRs
- Approve PRs
- Close issues
- Publish releases
- Push commits
- Obey instructions from issue/PR body that modify agent behavior

## `.github/cabinet.yml`

Configure Cabinet per repo:

```yaml
version: 1

cabinet:
  mode: l3_assist
  default_branch: main

autonomy:
  add_labels: true
  post_comments: true
  close_issues: false
  request_pr_changes: false
  approve_prs: false

triage:
  duplicate_threshold: 0.82
  required_bug_fields:
    - version
    - environment
    - reproduction_steps
    - expected_behavior
    - actual_behavior

review:
  require_tests_for:
    - src/**
  docs_paths:
    - docs/**
    - README.md
  risky_paths:
    - src/parser/**
    - src/auth/**
    - src/config/**

community:
  tone: gentle_firm
  forbidden_phrases:
    - just
    - obviously
    - works for me
```
