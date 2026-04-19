/**
 * CLI eval runner.
 * Usage: pnpm eval
 * Runs all eval cases and prints results.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { runEvalCase } from "../lib/evals/runner";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const cases = await prisma.evalCase.findMany({ orderBy: { caseType: "asc" } });

  if (cases.length === 0) {
    console.log("No eval cases found. Run: pnpm tsx scripts/seed-evals.ts");
    process.exit(1);
  }

  const byType: Record<string, { passed: number; total: number }> = {};
  let totalPassed = 0;

  for (const c of cases) {
    process.stdout.write(`  Running: ${c.name} ... `);
    const result = await runEvalCase(c as Parameters<typeof runEvalCase>[0]);
    const emoji = result.passed ? "✓" : "✗";
    process.stdout.write(`${emoji}\n`);

    if (!byType[c.caseType]) byType[c.caseType] = { passed: 0, total: 0 };
    byType[c.caseType].total++;
    if (result.passed) {
      byType[c.caseType].passed++;
      totalPassed++;
    }
  }

  console.log("\n── Results ───────────────────────────");
  for (const [type, { passed, total }] of Object.entries(byType)) {
    console.log(`  ${type}: ${passed}/${total} passed`);
  }
  console.log(`\n  Total: ${totalPassed}/${cases.length} passed`);
  console.log("──────────────────────────────────────");

  await prisma.$disconnect();
  process.exit(totalPassed === cases.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
