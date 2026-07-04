#!/usr/bin/env node
/**
 * Reads every exam JSON file listed in data/parsed/manifest.json
 * (produced by scripts/parse-html.js) and upserts it into the database
 * via Prisma. Safe to re-run: subjects/exams/questions/choices are
 * matched on their stable slugs / sourceItemId, so re-seeding updates
 * existing rows instead of duplicating them.
 *
 * Note: this script only loads content (subjects, exams, questions,
 * choices, explanations). It does not touch users or attempts.
 *
 * The actual upsert logic lives in lib/seed-exam.js, shared with the
 * admin web-upload import flow.
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { seedExam } = require("../lib/seed-exam");

const PARSED_DIR = path.join(__dirname, "..", "data", "parsed");
const prisma = new PrismaClient();

async function main() {
  const manifestPath = path.join(PARSED_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`No manifest found at ${manifestPath}. Run "npm run parse" first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  for (const entry of manifest) {
    const examData = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, entry.file), "utf-8"));
    const result = await seedExam(prisma, examData);
    console.log(`Seeded "${result.exam}" (${result.subject}) — ${result.questionCount} questions`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
