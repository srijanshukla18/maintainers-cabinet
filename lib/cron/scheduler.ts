/**
 * Autonomous scheduler — runs morning briefs on a daily cron.
 *
 * Registered once when the Next.js server starts via app/startup.ts.
 * Every hour: checks WatchedRepo for repos whose scheduleHour matches
 * current UTC hour and fires generateBrief + sendBrief automatically.
 *
 * No human trigger required.
 */

import cron from "node-cron";
import { prisma } from "../db/client";
import { generateBrief } from "../briefs/generate";
import { sendBrief } from "../email/client";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  // Check every hour on the :00 mark
  cron.schedule("0 * * * *", async () => {
    const utcHour = new Date().getUTCHours();
    console.log(`[cron] tick — UTC hour ${utcHour}`);

    const repos = await prisma.watchedRepo.findMany({
      where: { active: true, scheduleHour: utcHour },
    });

    if (repos.length === 0) return;
    console.log(`[cron] firing briefs for ${repos.length} repo(s)`);

    for (const repo of repos) {
      try {
        console.log(`[cron] generating brief for ${repo.owner}/${repo.name}`);
        const brief = await generateBrief({
          owner: repo.owner,
          name: repo.name,
          maxIssuesToTriage: 25,
          maxPrsToReview: 20,
        });

        await sendBrief({
          to: repo.emailRecipient,
          subject: brief.subject,
          text: brief.bodyMarkdown,
          html: brief.bodyHtml,
        });

        await prisma.watchedRepo.update({
          where: { id: repo.id },
          data: { lastRunAt: new Date(), lastBriefId: brief.id },
        });

        console.log(`[cron] brief sent for ${repo.owner}/${repo.name} → ${repo.emailRecipient}`);
      } catch (err) {
        console.error(`[cron] failed for ${repo.owner}/${repo.name}:`, err);
      }
    }
  });

  console.log("[cron] scheduler started — checking watched repos hourly");
}

export async function runNow(owner: string, name: string, emailRecipient: string): Promise<string> {
  const brief = await generateBrief({ owner, name });

  await sendBrief({
    to: emailRecipient,
    subject: brief.subject,
    text: brief.bodyMarkdown,
    html: brief.bodyHtml,
  });

  await prisma.watchedRepo.upsert({
    where: { owner_name: { owner, name } },
    create: { owner, name, emailRecipient, lastRunAt: new Date(), lastBriefId: brief.id },
    update: { lastRunAt: new Date(), lastBriefId: brief.id, emailRecipient },
  });

  return brief.id;
}
