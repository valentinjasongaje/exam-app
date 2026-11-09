/**
 * Saving imported exam questions (Admin → Bulk import and
 * scripts/bulk-import.ts share this). Questions come from
 * lib/review-page.ts: .html exam exports keep their own A–D; .mhtml review
 * pages are rebuilt (correct answer + the reviewee's real wrong pick + AI
 * wrong choices, shuffled). No auth here: callers check it.
 */
import crypto from "crypto";
import slugify from "slugify";
import { prisma } from "@/lib/prisma";
import { uploadImage } from "@/lib/blob";
import { makeDistractors } from "@/lib/ai-distractors";
import { CANONICAL_SUBJECTS } from "@/lib/subjects";

export type ImportQuestion = {
  order: number;
  sourceItemId: string;
  text: string;
  image: string | null; // data: URL
  correct: string;
  wrongPick: string | null;
  explanation: string | null;
  solutionImage: string | null; // data: URL
  /** The original choices (HTML exports), kept in order; null = rebuild them with AI (review pages). */
  choices: { text: string; isCorrect: boolean }[] | null;
};

export type ImportExamInfo = { title: string; subject: string; isBoardExam: boolean; fileName: string };
export type ImportResult = { sourceItemId: string; ok: boolean; error?: string };

/** Item ids already in the bank with all four choices (any exam): those are skipped. */
export async function existingItemIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 5000) {
    const rows = await prisma.question.findMany({
      where: { sourceItemId: { in: ids.slice(i, i + 5000) } },
      select: { sourceItemId: true, _count: { select: { choices: true } } },
    });
    for (const r of rows) if (r._count.choices >= 4) out.add(r.sourceItemId);
  }
  return [...out];
}

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
 * The exam a file imports into. Its slug comes from the title; if an exam
 * with that slug already exists from a different source file, a numbered
 * exam ("… (2)") is used instead of mixing two sets of questions. Callers
 * must not import two same-titled files at the same time.
 */
export async function examFor(input: ImportExamInfo) {
  const canonical = CANONICAL_SUBJECTS.find((s) => s.slug === input.subject);
  if (!canonical) throw new Error("Pick a subject for this exam first.");
  const subject = await prisma.subject.upsert({
    where: { slug: canonical.slug },
    update: {},
    create: { name: canonical.name, slug: canonical.slug },
  });
  const base = input.title.trim();
  const baseSlug = slugify(base, { lower: true, strict: true });
  let title = base;
  let slug = baseSlug;
  for (let n = 2; ; n++) {
    const clash = await prisma.exam.findUnique({ where: { slug }, select: { sourceFile: true } });
    if (!clash || clash.sourceFile === input.fileName) break;
    title = `${base} (${n})`;
    slug = `${baseSlug}-${n}`;
  }
  return prisma.exam.upsert({
    where: { slug },
    update: { title, subjectId: subject.id, isBoardExam: input.isBoardExam },
    create: { title, slug, subjectId: subject.id, sourceFile: input.fileName, sourceTag: null, isBoardExam: input.isBoardExam },
    select: { id: true },
  });
}

/** Uploads one question's pictures, builds its A–D and upserts it. Never throws. */
export async function importQuestion(examId: string, subjectName: string, q: ImportQuestion): Promise<ImportResult> {
  try {
    const [imageUrl, explanationImageUrl] = await Promise.all([
      upload(q.image, q.sourceItemId),
      upload(q.solutionImage, `${q.sourceItemId}-explanation`),
    ]);
    const original = q.choices && q.choices.length >= 2 && q.choices.filter((c) => c.isCorrect).length === 1 ? q.choices : null;
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
    const choices = (
      original ??
      shuffle([
        { text: q.correct, isCorrect: true },
        ...[...existing, ...(await ask().catch(() => ask()))].map((text) => ({ text, isCorrect: false })), // one retry
      ])
    ).map((c, i) => ({ ...c, label: String.fromCharCode(65 + i) }));

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

export const subjectNameOf = (slug: string) => CANONICAL_SUBJECTS.find((s) => s.slug === slug)?.name ?? slug;
