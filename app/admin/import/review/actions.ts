"use server";

import crypto from "crypto";
import slugify from "slugify";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadImage } from "@/lib/blob";
import { makeDistractors } from "@/lib/ai-distractors";
import { aiConfigured } from "@/lib/ai-explain";
import { CANONICAL_SUBJECTS } from "@/lib/subjects";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("Admin only.");
}

/**
 * Which of these review-page item ids are already in the question bank with
 * all four choices (from an earlier import of the same page, or from the
 * HTML exports, which share the review center's item ids). Those are skipped.
 */
export async function existingItemIdsAction(ids: string[]): Promise<string[]> {
  await requireAdmin();
  if (ids.length === 0) return [];
  const rows = await prisma.question.findMany({
    where: { sourceItemId: { in: ids } },
    select: { sourceItemId: true, _count: { select: { choices: true } } },
  });
  return [...new Set(rows.filter((r) => r._count.choices >= 4).map((r) => r.sourceItemId))];
}

export type ReviewBatchQuestion = {
  order: number;
  sourceItemId: string;
  text: string;
  image: string | null; // data: URL
  correct: string;
  wrongPick: string | null;
  explanation: string | null;
  solutionImage: string | null; // data: URL
};

export type ReviewBatchResult = { sourceItemId: string; ok: boolean; error?: string };

function fromDataUrl(dataUrl: string | null) {
  if (!dataUrl) return null;
  const m = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return null;
  const ext = m[1].split("/")[1].replace("jpeg", "jpg");
  return { mime: m[1], ext, buffer: Buffer.from(m[2], "base64") };
}

async function upload(dataUrl: string | null, name: string) {
  const img = fromDataUrl(dataUrl);
  return img ? uploadImage(img.buffer, `${name}-${crypto.randomUUID()}.${img.ext}`, img.mime) : null;
}

function shuffle<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The exam a saved review page imports into. Its slug comes from the title;
 * if an exam with that slug already exists from a different source file
 * (e.g. the HTML export "Review Exam - GEAS 09.html" holds other questions),
 * a separate "(saved review)" exam is used instead of mixing the two.
 */
async function examFor(input: { title: string; subject: string; isBoardExam: boolean; fileName: string }) {
  const canonical = CANONICAL_SUBJECTS.find((s) => s.slug === input.subject);
  if (!canonical) throw new Error("Pick a subject for this exam first.");
  const subject = await prisma.subject.upsert({
    where: { slug: canonical.slug },
    update: {},
    create: { name: canonical.name, slug: canonical.slug },
  });
  let title = input.title.trim();
  let slug = slugify(title, { lower: true, strict: true });
  const clash = await prisma.exam.findUnique({ where: { slug }, select: { sourceFile: true } });
  if (clash && clash.sourceFile !== input.fileName) {
    title = `${title} (saved review)`;
    slug = `${slug}-saved-review`;
  }
  return prisma.exam.upsert({
    where: { slug },
    update: { title, subjectId: subject.id, isBoardExam: input.isBoardExam },
    create: { title, slug, subjectId: subject.id, sourceFile: input.fileName, sourceTag: null, isBoardExam: input.isBoardExam },
    select: { id: true },
  });
}

async function importOne(examId: string, subjectName: string, q: ReviewBatchQuestion): Promise<ReviewBatchResult> {
  try {
    const [imageUrl, explanationImageUrl] = await Promise.all([
      upload(q.image, q.sourceItemId),
      upload(q.solutionImage, `${q.sourceItemId}-explanation`),
    ]);
    const existing = q.wrongPick ? [q.wrongPick] : [];
    const ask = () =>
      makeDistractors({
        subject: subjectName,
        text: q.text || "(see the picture)",
        answer: q.correct,
        imageUrl,
        solution: q.explanation,
        solutionImageUrl: explanationImageUrl,
        existing,
        count: 3 - existing.length,
      });
    const made = await ask().catch(() => ask()); // one retry
    const choices = shuffle([
      { text: q.correct, isCorrect: true },
      ...[...existing, ...made].map((text) => ({ text, isCorrect: false })),
    ]).map((c, i) => ({ ...c, label: String.fromCharCode(65 + i) }));

    await prisma.$transaction(async (tx) => {
      const row = await tx.question.upsert({
        where: { examId_sourceItemId: { examId, sourceItemId: q.sourceItemId } },
        update: { order: q.order, text: q.text, imageUrl, explanation: q.explanation, explanationImageUrl },
        create: { examId, order: q.order, text: q.text, imageUrl, explanation: q.explanation, explanationImageUrl, sourceItemId: q.sourceItemId },
        select: { id: true },
      });
      for (const c of choices) {
        await tx.choice.upsert({
          where: { questionId_label: { questionId: row.id, label: c.label } },
          update: { text: c.text, isCorrect: c.isCorrect },
          create: { questionId: row.id, label: c.label, text: c.text, isCorrect: c.isCorrect },
        });
      }
    });
    return { sourceItemId: q.sourceItemId, ok: true };
  } catch (e) {
    return { sourceItemId: q.sourceItemId, ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

/**
 * Imports a few questions of one saved review page: uploads their pictures,
 * rebuilds A–D (correct answer + the reviewee's real wrong pick when there
 * is one + AI-written wrong choices, shuffled) and upserts them. Small
 * batches keep each request well under Vercel's body size and time limits;
 * the page calls this repeatedly and can resume (done items are skipped).
 */
export async function importReviewBatchAction(input: {
  exam: { title: string; subject: string; isBoardExam: boolean; fileName: string };
  questions: ReviewBatchQuestion[];
}): Promise<ReviewBatchResult[]> {
  await requireAdmin();
  if (!aiConfigured()) {
    return input.questions.map((q) => ({ sourceItemId: q.sourceItemId, ok: false, error: "AI isn't set up (ANTHROPIC_API_KEY)." }));
  }
  let exam: { id: string };
  try {
    exam = await examFor(input.exam);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Couldn't create the exam.";
    return input.questions.map((q) => ({ sourceItemId: q.sourceItemId, ok: false, error }));
  }
  const subjectName = CANONICAL_SUBJECTS.find((s) => s.slug === input.exam.subject)?.name ?? input.exam.subject;
  return Promise.all(input.questions.map((q) => importOne(exam.id, subjectName, q)));
}
