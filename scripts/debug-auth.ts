import { App } from '@octokit/app';
import 'dotenv/config';
import { prisma } from '../lib/db/client';

async function main() {
  const app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET! }
  });

  const repo = await prisma.repo.findFirst();
  console.log('installationId:', repo?.installationId?.toString());

  const octokit = await app.getInstallationOctokit(Number(repo!.installationId));
  const auth = await (octokit.auth as (options: { type: 'installation' }) => Promise<{ token?: string }>)({ type: 'installation' });
  console.log('auth keys:', Object.keys(auth));
  console.log('token prefix:', auth.token?.slice(0, 15));
  await prisma.$disconnect();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
