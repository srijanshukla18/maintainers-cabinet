# Cabinet

Attention triage for overloaded open-source maintainers.

Cabinet scans public GitHub repositories and turns large issue and PR queues into a private Maintainer Attention Packet: what to inspect first, why it matters, where AI slop or missing disclosure is likely, which PRs need senior review, and which issues are missing enough signal to be actionable.

## Product flow

1. Sign in with GitHub.
2. Paste a public repo such as `kubernetes/kubernetes`.
3. Get a fast initial packet.
4. Let Cabinet deepen the packet with PR file/diff context.

Cabinet does not install a GitHub App, post comments, add labels, close issues, create check runs, send email, or write to GitHub. Recommendations stay private in the UI.

## Setup

```bash
pnpm install
cp .env.example .env
pnpm db:push
pnpm dev
```

Required environment:

```bash
DATABASE_URL=
OPENAI_API_KEY=
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
SESSION_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Stack

Next.js · TypeScript · PostgreSQL + Prisma · Octokit · OpenAI
