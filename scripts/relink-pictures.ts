/**
 * One-off: re-uploads question/solution pictures from the original exam files
 * to the current picture storage (R2, see lib/blob.ts) and points the database
 * rows at the new addresses. Only touches rows whose picture still lives on the
 * old Vercel Blob store (address contains "vercel-storage.com"). Rows are
 * matched to the files by their item id (sourceItemId).
 *
 *   npx tsx scripts/relink-pictures.ts [--dry-run] [--max N] <folder> [folder…]
 *
 * Needs DATABASE_URL and the R2_* variables in .env.local / .env. Safe to re-run.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
if (dryRun) args.splice(args.indexOf("--dry-run"), 1);
const maxIdx = args.indexOf("--max");
const max = maxIdx >= 0 ? Number(args.splice(maxIdx, 2)[1]) || Infinity : Infinity;
const folders = args;
if (folders.length === 0) {
  console.error("Usage: npx tsx scripts/relink-pictures.ts [--dry-run] [--max N] <folder> [folder…]");
  process.exit(1);
}

const OLD_HOST = "vercel-storage.com";
const AT_ONCE = 8;

function bytesOf(file: string): ArrayBuffer {
  const b = fs.readFileSync(file);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/bootstrap/i.test(e.name)) out.push(...walk(p));
    } else if (/\.(html?|mhtml?|mht)$/i.test(e.name)) out.push(p);
  }
  return out;
}
function fromDataUrl(dataUrl: string | null | undefined) {
  if (!dataUrl) return null;
  const m = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], ext: m[1].split("/")[1].replace("jpeg", "jpg"), buffer: Buffer.from(m[2], "base64") };
}

async function main() {
  const jsdomName = "jsdom";
  const { JSDOM } = (await import(jsdomName)) as { JSDOM: new (html: string) => { window: { DOMParser: unknown; NodeFilter: unknown } } };
  const win = new JSDOM("").window;
  Object.assign(globalThis, { DOMParser: win.DOMParser, NodeFilter: win.NodeFilter });

  const { htmlFromMhtml, parseExamPage, parseReviewPage } = await import("../lib/review-page");
  const { uploadImage, usesR2 } = await import("../lib/blob");
  const { prisma } = await import("../lib/prisma");

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  if (!dryRun && !usesR2()) throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL must all be set.");

  // 1. the rows that still point at the old store
  const broken = await prisma.question.findMany({
    where: { OR: [{ imageUrl: { contains: OLD_HOST } }, { explanationImageUrl: { contains: OLD_HOST } }] },
    select: { id: true, sourceItemId: true, imageUrl: true, explanationImageUrl: true },
  });
  console.log(`${broken.length} questions still point at the old picture store.`);
  if (broken.length === 0) return void (await prisma.$disconnect());
  const wanted = new Set(broken.map((b) => b.sourceItemId));

  // 2. find their pictures in the files
  const files = folders.flatMap((f) => walk(f));
  console.log(`Reading ${files.length} files…`);
  const pics = new Map<string, { image: string | null; solution: string | null }>();
  for (const f of files) {
    const name = path.basename(f);
    try {
      const exam = /\.mht(ml)?$/i.test(name) ? parseReviewPage(htmlFromMhtml(bytesOf(f)), name) : parseExamPage(fs.readFileSync(f, "utf8"), name);
      for (const q of exam.questions) {
        if (!wanted.has(q.sourceItemId)) continue;
        const cur = pics.get(q.sourceItemId) ?? { image: null, solution: null };
        pics.set(q.sourceItemId, { image: cur.image ?? q.image, solution: cur.solution ?? q.solutionImages[0] ?? null });
      }
    } catch (e) {
      console.warn(`  ! ${name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const todo = broken.filter((b) => pics.has(b.sourceItemId)).slice(0, max);
  const noSource = broken.filter((b) => !pics.has(b.sourceItemId));
  const needImg = (b: (typeof broken)[number]) => !!b.imageUrl?.includes(OLD_HOST);
  const needSol = (b: (typeof broken)[number]) => !!b.explanationImageUrl?.includes(OLD_HOST);
  console.log(`${todo.length} found in the files · ${noSource.length} not found (their pictures can't be restored from these folders)`);
  if (dryRun) {
    console.log("Dry run: nothing was written.");
    await prisma.$disconnect();
    return;
  }

  // 3. upload + relink
  let done = 0;
  let pictures = 0;
  const failures: string[] = [];
  const queue = [...todo];
  const worker = async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      try {
        const src = pics.get(b.sourceItemId)!;
        const data: { imageUrl?: string; explanationImageUrl?: string } = {};
        const img = needImg(b) ? fromDataUrl(src.image) : null;
        const sol = needSol(b) ? fromDataUrl(src.solution) : null;
        if (img) data.imageUrl = await uploadImage(img.buffer, `${b.sourceItemId}-${crypto.randomUUID()}.${img.ext}`, img.mime);
        if (sol) data.explanationImageUrl = await uploadImage(sol.buffer, `${b.sourceItemId}-explanation-${crypto.randomUUID()}.${sol.ext}`, sol.mime);
        if (Object.keys(data).length === 0) throw new Error("file has no picture for it");
        await prisma.question.update({ where: { id: b.id }, data });
        pictures += Object.keys(data).length;
      } catch (e) {
        failures.push(`item ${b.sourceItemId}: ${e instanceof Error ? e.message : e}`);
      }
      if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));

  console.log(`\nRelinked ${todo.length - failures.length} questions (${pictures} pictures).`);
  if (failures.length) {
    console.log(`${failures.length} failed (run again to retry):`);
    for (const f of failures.slice(0, 30)) console.log(`  - ${f}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
