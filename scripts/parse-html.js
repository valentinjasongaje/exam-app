#!/usr/bin/env node
/**
 * Parses scraped exam HTML files (see data/raw/*.html) into clean JSON
 * ready to be seeded into the database (see scripts/seed.js).
 *
 * For each exam file it produces:
 *   data/parsed/<exam-slug>.json
 * and re-hosts any embedded base64 images to:
 *   data/parsed/images/<hash>.<ext>
 *
 * A manifest (data/parsed/manifest.json) lists every parsed exam plus
 * any issues found (e.g. an answer key entry that didn't match any of
 * the four choices) so they can be reviewed before seeding.
 *
 * The actual HTML parsing lives in lib/exam-parser.js, shared with the
 * admin web-upload import flow. This script's only job is CLI-specific:
 * reading files from data/raw/ and persisting images to local disk.
 */

const fs = require("fs");
const path = require("path");
const { parseExamHtml } = require("../lib/exam-parser");

const RAW_DIR = path.join(__dirname, "..", "data", "raw");
const OUT_DIR = path.join(__dirname, "..", "data", "parsed");
const IMAGES_DIR = path.join(OUT_DIR, "images");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

/** Persist a decoded image to local disk (deduped by content hash), returning a relative path. */
function saveImageToDisk(image) {
  if (!image) return null;
  const filename = `${image.hash}.${image.ext}`;
  const filepath = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(filepath)) fs.writeFileSync(filepath, image.buffer);
  return `images/${filename}`;
}

function parseExamFile(filename) {
  const filePath = path.join(RAW_DIR, filename);
  const html = fs.readFileSync(filePath, "utf-8");
  const parsed = parseExamHtml(html, filename);

  parsed.questions = parsed.questions.map((q) => ({
    order: q.order,
    sourceItemId: q.sourceItemId,
    text: q.text,
    imageUrl: saveImageToDisk(q.image),
    choices: q.choices,
    explanation: q.explanation,
    explanationImageUrl: saveImageToDisk(q.explanationImage),
  }));

  return parsed;
}

function main() {
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.toLowerCase().endsWith(".html"));
  if (!files.length) {
    console.error(`No .html files found in ${RAW_DIR}`);
    process.exit(1);
  }

  const manifest = [];

  for (const filename of files) {
    const parsed = parseExamFile(filename);
    const outPath = path.join(OUT_DIR, `${parsed.exam.slug}.json`);
    fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));

    console.log(
      `Parsed ${filename} -> ${parsed.exam.slug}.json ` +
        `(${parsed.questions.length} questions, ${parsed.issues.length} issue(s))`
    );
    if (parsed.issues.length) {
      parsed.issues.forEach((issue) => console.log("   issue:", JSON.stringify(issue)));
    }

    manifest.push({
      file: `${parsed.exam.slug}.json`,
      subject: parsed.subject.name,
      exam: parsed.exam.title,
      questionCount: parsed.questions.length,
      issueCount: parsed.issues.length,
    });
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`\nWrote manifest with ${manifest.length} exam(s) to data/parsed/manifest.json`);
}

main();
