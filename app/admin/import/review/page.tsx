"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileArchive, Loader2, Square, Upload } from "lucide-react";
import { clsx } from "clsx";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { CANONICAL_SUBJECTS } from "@/lib/subjects";
import { htmlFromMhtml, joinImages, parseExamPage, parseReviewPage, type ReviewExam } from "@/lib/review-page";
import { shrinkImage } from "@/lib/shrink-image";
import { existingItemIdsAction, importReviewBatchAction, type ReviewBatchQuestion } from "./actions";

type Row = ReviewExam & {
  include: boolean;
  /** Item ids skipped: already in the bank, or a repeat of an earlier file in this selection. */
  skip: Set<string>;
  sameAs: string | null;
  done: Set<string>;
  failed: Map<string, string>;
  status: "idle" | "running" | "done";
};

const EXAM_SUBJECTS = CANONICAL_SUBJECTS;
const BATCH = 4; // questions per request
const MAX_BYTES = 3_000_000; // keep each request well under Vercel's ~4.5 MB body limit
const PARALLEL_EXAMS = 2;

async function toDataUrl(blob: Blob) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/** Big pictures are scaled down (max 1600 px, JPEG) so a batch stays small. */
async function slim(dataUrl: string | null) {
  if (!dataUrl || dataUrl.length < 1_200_000) return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  return toDataUrl(await shrinkImage(blob));
}

/**
 * Import of review-center "Exam Review" pages saved as .mhtml. The pages
 * have the question, correct answer, your answer and a solution, but not
 * the A–D choices; those are rebuilt on import (see actions.ts).
 */
export default function ReviewImportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const update = (fileName: string, fn: (r: Row) => Row) => setRows((rs) => rs.map((r) => (r.fileName === fileName ? fn(r) : r)));

  async function readFiles(files: FileList | null) {
    if (!files?.length) return;
    setReading(true);
    setErrors([]);
    const parsed: ReviewExam[] = [];
    const errs: string[] = [];
    for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        parsed.push(
          /\.mht(ml)?$/i.test(f.name)
            ? parseReviewPage(htmlFromMhtml(await f.arrayBuffer()), f.name)
            : parseExamPage(await f.text(), f.name)
        );
      } catch (e) {
        errs.push(`${f.name}: ${e instanceof Error ? e.message : "couldn't read it"}`);
      }
    }
    // Identical pages saved twice: keep the one with the more descriptive (longer) name.
    const key = (e: ReviewExam) => [...e.questions, ...e.unusable].map((q) => q.sourceItemId).sort().join(",");
    const keeper = new Map<string, ReviewExam>();
    for (const e of parsed) {
      const k = key(e);
      const cur = keeper.get(k);
      if (!cur || e.fileName.length > cur.fileName.length) keeper.set(k, e);
    }
    const ids = parsed.flatMap((e) => e.questions.map((q) => q.sourceItemId));
    let inBank = new Set<string>();
    try {
      inBank = new Set(await existingItemIdsAction([...new Set(ids)]));
    } catch {
      errs.push("Couldn't check which questions are already in the bank.");
    }
    const seen = new Set<string>();
    const out: Row[] = parsed.map((e) => {
      const kept = keeper.get(key(e))!;
      const sameAs = kept === e ? null : kept.fileName;
      const skip = new Set<string>();
      for (const q of e.questions) {
        if (sameAs || inBank.has(q.sourceItemId) || seen.has(q.sourceItemId)) skip.add(q.sourceItemId);
        else seen.add(q.sourceItemId);
      }
      return { ...e, include: !sameAs && skip.size < e.questions.length && !!e.subject, skip, sameAs, done: new Set(), failed: new Map(), status: "idle" };
    });
    setRows(out);
    setErrors(errs);
    setReading(false);
  }

  const todo = (r: Row) => r.questions.filter((q) => !r.skip.has(q.sourceItemId) && !r.done.has(q.sourceItemId));
  const totals = useMemo(() => {
    const inc = rows.filter((r) => r.include);
    return {
      files: inc.length,
      toImport: inc.reduce((n, r) => n + r.questions.filter((q) => !r.skip.has(q.sourceItemId)).length, 0),
      done: inc.reduce((n, r) => n + r.done.size, 0),
      failed: inc.reduce((n, r) => n + r.failed.size, 0),
      inBank: rows.reduce((n, r) => n + (r.sameAs ? 0 : r.skip.size), 0),
      unusable: rows.filter((r) => !r.sameAs).reduce((n, r) => n + r.unusable.length, 0),
      noSubject: inc.filter((r) => !r.subject).length,
      needAi: inc.reduce((n, r) => n + r.questions.filter((q) => !q.choices && !r.skip.has(q.sourceItemId) && !r.done.has(q.sourceItemId)).length, 0),
    };
  }, [rows]);

  async function importExam(r: Row) {
    update(r.fileName, (x) => ({ ...x, status: "running", failed: new Map() }));
    const queue = todo(r);
    let i = 0;
    while (i < queue.length && !stop.current) {
      // Fill a batch up to BATCH questions or MAX_BYTES of pictures.
      const batch: ReviewBatchQuestion[] = [];
      let bytes = 0;
      while (i < queue.length && batch.length < BATCH) {
        const q = queue[i];
        const image = await slim(q.image);
        const solutionImage = await slim(await joinImages(q.solutionImages));
        const size = (image?.length ?? 0) + (solutionImage?.length ?? 0) + q.text.length;
        if (batch.length > 0 && bytes + size > MAX_BYTES) break;
        batch.push({ order: q.order, sourceItemId: q.sourceItemId, text: q.text, image, correct: q.correct, wrongPick: q.wrongPick, explanation: q.explanation, solutionImage, choices: q.choices });
        bytes += size;
        i++;
      }
      let results: { sourceItemId: string; ok: boolean; error?: string }[];
      try {
        results = await importReviewBatchAction({
          exam: { title: r.title, subject: r.subject, isBoardExam: r.isBoardExam, fileName: r.fileName },
          questions: batch,
        });
      } catch (e) {
        const msg = e instanceof Error && e.message ? e.message : "The request failed.";
        results = batch.map((q) => ({ sourceItemId: q.sourceItemId, ok: false, error: msg }));
      }
      update(r.fileName, (x) => {
        const done = new Set(x.done);
        const failed = new Map(x.failed);
        for (const res of results) {
          if (res.ok) {
            done.add(res.sourceItemId);
            failed.delete(res.sourceItemId);
          } else failed.set(res.sourceItemId, res.error ?? "Failed.");
        }
        return { ...x, done, failed };
      });
    }
    update(r.fileName, (x) => ({ ...x, status: "done" }));
  }

  async function run() {
    stop.current = false;
    setRunning(true);
    const queue = rows.filter((r) => r.include && r.subject && todo(r).length > 0);
    // Two files with the same title (e.g. "RC Exam - EST 47" and "…47-A") must not run at once,
    // or both could claim the same exam; the second becomes "… (2)" when it runs after the first.
    const busy = new Set<string>();
    const take = () => {
      const i = queue.findIndex((r) => !busy.has(r.title.trim().toLowerCase()));
      return i < 0 ? null : queue.splice(i, 1)[0];
    };
    const worker = async () => {
      while (queue.length && !stop.current) {
        const r = take();
        if (!r) {
          await new Promise((res) => setTimeout(res, 300)); // wait for the same-titled one to finish
          continue;
        }
        const key = r.title.trim().toLowerCase();
        busy.add(key);
        try {
          await importExam(r);
        } finally {
          busy.delete(key);
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_EXAMS }, worker));
    setRunning(false);
  }

  const pct = totals.toImport ? Math.round((totals.done / totals.toImport) * 100) : 0;

  return (
    <div>
      <PageHeader
        icon={FileArchive}
        title="Import exams in bulk"
        subtitle="Exam pages saved from the review center: .html exam exports keep their own A–D choices; .mhtml Exam Review pages have no choices, so each question gets the correct answer, your old wrong answer when there is one, and AI-written wrong choices to make four. Questions already in your bank are skipped."
        action={
          <Link href="/admin/import" className="text-sm text-accent hover:underline">
            HTML exam import
          </Link>
        }
      />

      <Card className="mb-6">
        <input
          ref={input}
          type="file"
          accept=".mhtml,.mht,.html,.htm"
          multiple
          className="hidden"
          onChange={(e) => {
            void readFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => input.current?.click()} disabled={reading || running}>
            {reading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {reading ? "Reading files…" : rows.length ? "Choose other files" : "Choose exam files"}
          </Button>
          <span className="text-sm text-ink-muted">Select the whole folder&rsquo;s files at once; nothing is saved until you press Import.</span>
        </div>
        {errors.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-danger">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </Card>

      {rows.length > 0 && (
        <>
          <Card className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm">
                <p>
                  <span className="text-lg font-semibold tabular-nums">{totals.toImport.toLocaleString()}</span> questions to import from{" "}
                  {totals.files} file{totals.files === 1 ? "" : "s"}
                </p>
                <p className="text-ink-muted">
                  {totals.inBank} already in your bank or repeated · {totals.unusable} can&rsquo;t be used (no usable answer){" "}
                  · {totals.needAi.toLocaleString()} need AI choices{totals.noSubject > 0 && <span className="text-danger"> · {totals.noSubject} file(s) need a subject</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {running ? (
                  <Button type="button" variant="secondary" onClick={() => (stop.current = true)}>
                    <Square size={14} /> Stop after this batch
                  </Button>
                ) : (
                  <Button type="button" onClick={run} disabled={totals.toImport - totals.done === 0 || totals.noSubject > 0}>
                    {totals.done > 0 ? `Continue (${(totals.toImport - totals.done).toLocaleString()} left)` : `Import ${totals.toImport.toLocaleString()} questions`}
                  </Button>
                )}
              </div>
            </div>
            {(running || totals.done > 0) && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-ink-muted tabular-nums">
                  <span>
                    {totals.done.toLocaleString()} of {totals.toImport.toLocaleString()} imported
                    {totals.failed > 0 && <span className="text-danger"> · {totals.failed} failed (press Continue to retry)</span>}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg-muted">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
                {running && <p className="mt-2 text-xs text-ink-faint">Keep this tab open. Each question takes a few seconds (pictures + AI choices); if you stop or close it, choosing the files again picks up where it left off.</p>}
              </div>
            )}
          </Card>

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border text-left text-xs text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Import</th>
                  <th className="px-3 py-2 font-medium">Exam title</th>
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 text-right font-medium">New</th>
                  <th className="px-3 py-2 text-right font-medium">Skipped</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const fresh = r.questions.filter((q) => !r.skip.has(q.sourceItemId)).length;
                  return (
                    <tr key={r.fileName} className={clsx("border-b border-border last:border-0 align-top", !r.include && "text-ink-faint")}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={running || !!r.sameAs || fresh === 0}
                          onChange={(e) => update(r.fileName, (x) => ({ ...x, include: e.target.checked }))}
                          aria-label={`Import ${r.title}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.title}
                          disabled={running}
                          onChange={(e) => update(r.fileName, (x) => ({ ...x, title: e.target.value }))}
                          className="w-full min-w-48 rounded-md border border-border bg-bg px-2 py-1"
                        />
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {r.fileName} · page subject &ldquo;{r.sourceSubject || "?"}&rdquo;
                          {r.isBoardExam && " · full board exam"}
                        </span>
                        {r.unusable.length > 0 && !r.sameAs && (
                          <details className="mt-1 text-xs text-ink-muted">
                            <summary className="cursor-pointer">{r.unusable.length} can&rsquo;t be rebuilt</summary>
                            <ul className="mt-1 list-disc pl-4">
                              {r.unusable.map((u) => (
                                <li key={u.sourceItemId}>
                                  #{u.order}: answer &ldquo;{u.correct}&rdquo; ({u.reason.toLowerCase()})
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {r.failed.size > 0 && (
                          <details className="mt-1 text-xs text-danger">
                            <summary className="cursor-pointer">{r.failed.size} failed</summary>
                            <ul className="mt-1 list-disc pl-4">
                              {[...r.failed].map(([id, msg]) => (
                                <li key={id}>
                                  #{r.questions.find((q) => q.sourceItemId === id)?.order}: {msg}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.subject}
                          disabled={running}
                          onChange={(e) => update(r.fileName, (x) => ({ ...x, subject: e.target.value }))}
                          className={clsx("rounded-md border bg-bg px-2 py-1", r.subject ? "border-border" : "border-danger")}
                        >
                          <option value="">Pick…</option>
                          {EXAM_SUBJECTS.map((s) => (
                            <option key={s.slug} value={s.slug}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fresh}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{r.sameAs ? r.questions.length : r.skip.size}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.sameAs ? (
                          <Badge tone="muted">Same as {r.sameAs.replace(/\.mhtml$/i, "")}</Badge>
                        ) : fresh === 0 ? (
                          <Badge tone="muted">All in bank</Badge>
                        ) : r.done.size >= fresh ? (
                          <span className="inline-flex items-center gap-1 text-success">
                            <CheckCircle2 size={14} /> Imported
                          </span>
                        ) : r.status === "running" ? (
                          <span className="inline-flex items-center gap-1 text-accent tabular-nums">
                            <Loader2 size={13} className="animate-spin" /> {r.done.size}/{fresh}
                          </span>
                        ) : r.failed.size > 0 ? (
                          <span className="inline-flex items-center gap-1 text-danger">
                            <AlertTriangle size={13} /> {r.done.size}/{fresh}
                          </span>
                        ) : r.done.size > 0 ? (
                          <span className="tabular-nums text-ink-muted">
                            {r.done.size}/{fresh}
                          </span>
                        ) : (
                          <span className="text-ink-faint">Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
