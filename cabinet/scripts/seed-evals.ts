/**
 * Seeds eval cases from evals/cases.json into the database.
 * Usage: pnpm tsx scripts/seed-evals.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "fs";
import { join } from "path";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const raw = readFileSync(join(process.cwd(), "evals/cases.json"), "utf-8");
  const cases = JSON.parse(raw) as Array<{
    name: string;
    caseType: string;
    input: object;
    expected: object;
  }>;

  let created = 0;
  let updated = 0;

  for (const c of cases) {
    const existing = await prisma.evalCase.findUnique({ where: { name: c.name } });
    if (existing) {
      await prisma.evalCase.update({
        where: { name: c.name },
        data: { caseType: c.caseType, inputJson: c.input, expectedJson: c.expected },
      });
      updated++;
    } else {
      await prisma.evalCase.create({
        data: { name: c.name, caseType: c.caseType, inputJson: c.input, expectedJson: c.expected },
      });
      created++;
    }
  }

  console.log(`Seeded eval cases: ${created} created, ${updated} updated.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
