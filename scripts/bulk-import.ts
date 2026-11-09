/**
 * Bulk-imports exam files from folders on this computer straight into the
 * database: the same parsing (lib/review-page.ts) and saving
 * (lib/bulk-import.ts) as Admin → Bulk import, without a browser tab.
 *
 *   npm i --no-save jsdom tsx
 *   npx tsx scripts/bulk-import.ts --dry-run "G:\REVIEW TUTORIAL\Excel Exams" "G:\REVIEW TUTORIAL\Exams"
 *   npx tsx scripts/bulk-import.ts "G:\REVIEW TUTORIAL\Excel Exams" "G:\REVIEW TUTORIAL\Exams"
 *
 * Options: --dry-run (report only), --only "<text>" (files whose name contains it),
 * --max-files N (first N files that have something to import).
 *
 * Needs DATABASE_URL and BLOB_READ_WRITE_TOKEN (and ANTHROPIC_API_KEY for
 * .mhtml review pages, whose A–D are rebuilt with AI) in .env.local / .env;
 * `npx vercel env pull .env.local` fetches them. Safe to re-run: questions
 * already in the bank are skipped.
 */
import fs from "fs";
import path from "path";

// ---------- env ----------
for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v ?? "";
};
const dryRun = args.includes("--dry-run");
if (dryRun) args.splice(args.indexOf("--dry-run"), 1);
const only = flag("--only");
const maxFiles = Number(flag("--max-files")) || Infinity;
const folders = args;
if (folders.length === 0) {
  console.error('Usage: npx tsx scripts/bulk-import.ts [--dry-run] [--only "<text>"] [--max-files N] <folder> [folder…]');
  process.exit(1);
}

const QUESTIONS_AT_ONCE = 5;
const EXAMS_AT_ONCE = 2;

/** A file's bytes as their own ArrayBuffer (a Buffer can be a view into a larger shared one). */
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

async function main() {
  // A DOM for the shared parsers (they normally run in the browser).
  // jsdom isn't an app dependency (installed with --no-save just for this script), so it's
  // imported by a computed name the app's type check and build don't try to resolve.
  const jsdomName = "jsdom";
  const { JSDOM } = (await import(jsdomName)) as { JSDOM: new (html: string) => { window: { DOMParser: unknown; NodeFilter: unknown } } };
  const win = new JSDOM("").window;
  Object.assign(globalThis, { DOMParser: win.DOMParser, NodeFilter: win.NodeFilter });

  const { htmlFromMhtml, parseExamPage, parseReviewPage } = await import("../lib/review-page");
  type Exam = ReturnType<typeof parseExamPage>;

  const missing = ["DATABASE_URL", ...(dryRun ? [] : ["BLOB_READ_WRITE_TOKEN"])].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}. Run \`npx vercel env pull .env.local\` in the project folder first.`);
    process.exit(1);
  }

  // ---------- read ----------
  const files = folders.flatMap((f) => walk(f)).filter((f) => !only || path.basename(f).toLowerCase().includes(only.toLowerCase()));
  console.log(`Reading ${files.length} files…`);
  const parsed: Exam[] = [];
  for (const f of files) {
    const name = path.basename(f);
    try {
      parsed.push(
        /\.mht(ml)?$/i.test(name)
          ? parseReviewPage(htmlFromMhtml(bytesOf(f)), name)
          : parseExamPage(fs.readFileSync(f, "utf8"), name)
      );
    } catch (e) {
      console.warn(`  ! ${name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Identical files (same item ids): keep the one with the longer name.
  const key = (e: Exam) => [...e.questions, ...e.unusable].map((q) => q.sourceItemId).sort().join(",");
  const keeper = new Map<string, Exam>();
  for (const e of parsed) {
    const cur = keeper.get(key(e));
    if (!cur || e.fileName.length > cur.fileName.length) keeper.set(key(e), e);
  }

  const { existingItemIds, examFor, importQuestion, subjectNameOf } = await import("../lib/bulk-import");
  const { prisma } = await import("../lib/prisma");
  const inBank = new Set(await existingItemIds([...new Set(parsed.flatMap((e) => e.questions.map((q) => q.sourceItemId)))]));

  const seen = new Set<string>();
  const plan: { exam: Exam; todo: Exam["questions"] }[] = [];
  let skipped = 0;
  let unusable = 0;
  let noSubject = 0;
  for (const e of parsed) {
    if (keeper.get(key(e)) !== e) {
      skipped += e.questions.length;
      continue;
    }
    unusable += e.unusable.length;
    const todo = e.questions.filter((q) => {
      if (inBank.has(q.sourceItemId) || seen.has(q.sourceItemId)) {
        skipped++;
        return false;
      }
      seen.add(q.sourceItemId);
      return true;
    });
    if (todo.length === 0) continue;
    if (!e.subject) {
      noSubject++;
      console.warn(`  ! ${e.fileName}: couldn't tell the subject; skipped (rename the file to include Math/GEAS/Elec/EST/ECT).`);
      continue;
    }
    plan.push({ exam: e, todo });
  }
  const chosen = plan.slice(0, maxFiles);
  const total = chosen.reduce((n, p) => n + p.todo.length, 0);
  const needAi = chosen.reduce((n, p) => n + p.todo.filter((q) => !q.choices).length, 0);

  console.log(`\n${parsed.length} files read · ${skipped} questions already in the bank or repeated · ${unusable} without a usable answer`);
  console.log(`To import: ${total} questions from ${chosen.length} files (${needAi} need AI-written choices)${noSubject ? ` · ${noSubject} files skipped (no subject)` : ""}\n`);
  for (const p of chosen) {
    console.log(`  ${p.exam.title.padEnd(42)} ${p.exam.subject.padEnd(5)} ${String(p.todo.length).padStart(4)} new${p.exam.isBoardExam ? "  (board exam)" : ""}${p.exam.unusable.length ? `  · ${p.exam.unusable.length} unusable` : ""}`);
  }
  for (const p of parsed) for (const u of p.unusable) if (keeper.get(key(p)) === p) console.log(`  - skipped ${p.fileName} #${u.order}: ${u.reason} (answer "${u.correct}")`);

  if (dryRun || total === 0) {
    console.log(dryRun ? "\nDry run: nothing was written." : "\nNothing to import.");
    await prisma.$disconnect();
    return;
  }
  if (needAi > 0 && !process.env.ANTHROPIC_API_KEY) {
    console.error("\nANTHROPIC_API_KEY is missing: needed to write choices for the .mhtml review pages.");
    process.exit(1);
  }

  // ---------- import ----------
  let done = 0;
  const failures: string[] = [];
  const started = Date.now();
  const queue = [...chosen];
  const busy = new Set<string>();
  const take = () => {
    const i = queue.findIndex((p) => !busy.has(p.exam.title.trim().toLowerCase()));
    return i < 0 ? null : queue.splice(i, 1)[0];
  };
  const worker = async () => {
    while (queue.length) {
      const p = take();
      if (!p) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      const titleKey = p.exam.title.trim().toLowerCase();
      busy.add(titleKey);
      try {
        const exam = await examFor({ title: p.exam.title, subject: p.exam.subject, isBoardExam: p.exam.isBoardExam, fileName: p.exam.fileName });
        const subjectName = subjectNameOf(p.exam.subject);
        let ok = 0;
        for (let i = 0; i < p.todo.length; i += QUESTIONS_AT_ONCE) {
          const batch = p.todo.slice(i, i + QUESTIONS_AT_ONCE);
          const results = await Promise.all(
            batch.map((q) =>
              importQuestion(exam.id, subjectName, {
                order: q.order,
                sourceItemId: q.sourceItemId,
                text: q.text,
                image: q.image,
                correct: q.correct,
                wrongPick: q.wrongPick,
                explanation: q.explanation,
                // The app keeps one solution picture; the browser page stacks several, here the first is kept.
                solutionImage: q.solutionImages[0] ?? null,
                choices: q.choices,
              })
            )
          );
          for (const r of results) {
            done++;
            if (r.ok) ok++;
            else failures.push(`${p.exam.fileName} item ${r.sourceItemId}: ${r.error}`);
          }
        }
        const mins = (Date.now() - started) / 60000;
        console.log(`  ✓ ${p.exam.title}: ${ok}/${p.todo.length}   [${done}/${total}, ${Math.round((done / total) * 100)}%, ${mins.toFixed(1)} min]`);
      } catch (e) {
        failures.push(`${p.exam.fileName}: ${e instanceof Error ? e.message : e}`);
        done += p.todo.length;
      } finally {
        busy.delete(titleKey);
      }
    }
  };
  await Promise.all(Array.from({ length: EXAMS_AT_ONCE }, worker));

  console.log(`\nDone: ${total - failures.length} of ${total} imported in ${((Date.now() - started) / 60000).toFixed(1)} min.`);
  if (failures.length) {
    console.log(`${failures.length} failed (run the same command again to retry them):`);
    for (const f of failures.slice(0, 50)) console.log(`  - ${f}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
