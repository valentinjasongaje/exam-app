import crypto from "crypto";
import type { VideoQuestion } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CANONICAL_SUBJECTS } from "@/lib/subjects";

/** The topic part of a plan video title ("ELEX 03 · Diodes" → "Diodes"). */
export function videoTopic(title: string) {
  return title.replace(/^\S+ \d+ · /, "");
}

export const LABELS = ["A", "B", "C", "D"] as const;
export type Label = (typeof LABELS)[number];

export function choicesOf(q: Pick<VideoQuestion, "choiceA" | "choiceB" | "choiceC" | "choiceD">) {
  return { A: q.choiceA, B: q.choiceB, C: q.choiceC, D: q.choiceD } as Record<Label, string>;
}

/** Ready for the exam bank: question, all four choices and the answer. */
export function isComplete(q: Pick<VideoQuestion, "text" | "choiceA" | "choiceB" | "choiceC" | "choiceD" | "correct">) {
  return !!q.text.trim() && LABELS.every((l) => choicesOf(q)[l].trim()) && LABELS.includes(q.correct as Label);
}

/** The subject's "Video questions" exam, created on first use. */
export async function ensureVideoExam(subjectSlug: string) {
  const canon = CANONICAL_SUBJECTS.find((s) => s.slug === subjectSlug) ?? { name: subjectSlug.toUpperCase(), slug: subjectSlug };
  const subject = await prisma.subject.upsert({
    where: { slug: canon.slug },
    update: {},
    create: { name: canon.name, slug: canon.slug },
  });
  const slug = `video-questions-${canon.slug}`;
  return prisma.exam.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      title: `${canon.name} · Video questions`,
      subjectId: subject.id,
      sourceFile: "video-notes",
    },
  });
}

/**
 * Copies a complete video question into the exam bank, or updates the copy
 * it already has. Returns the Question id.
 */
export async function syncToBank(q: VideoQuestion) {
  const choices = choicesOf(q);
  if (q.questionId) {
    await prisma.$transaction([
      prisma.question.update({
        where: { id: q.questionId },
        data: { text: q.text.trim(), imageUrl: q.imageUrl, explanation: q.explanation },
      }),
      ...LABELS.map((label) =>
        prisma.choice.upsert({
          where: { questionId_label: { questionId: q.questionId!, label } },
          update: { text: choices[label].trim(), isCorrect: q.correct === label },
          create: { questionId: q.questionId!, label, text: choices[label].trim(), isCorrect: q.correct === label },
        })
      ),
    ]);
    return q.questionId;
  }
  const exam = await ensureVideoExam(q.subject);
  const max = await prisma.question.aggregate({ where: { examId: exam.id }, _max: { order: true } });
  const created = await prisma.question.create({
    data: {
      examId: exam.id,
      order: (max._max.order ?? 0) + 1,
      text: q.text.trim(),
      imageUrl: q.imageUrl,
      explanation: q.explanation,
      sourceItemId: `video-${q.id || crypto.randomUUID()}`,
      choices: { create: LABELS.map((label) => ({ label, text: choices[label].trim(), isCorrect: q.correct === label })) },
    },
  });
  return created.id;
}

/** Removes a bank copy, including any answers given to it (no FK cascade on those). */
export async function removeFromBank(questionId: string) {
  await prisma.$transaction([
    prisma.attemptAnswer.deleteMany({ where: { questionId } }),
    prisma.questionExplanation.deleteMany({ where: { questionId } }),
    prisma.choice.deleteMany({ where: { questionId } }),
    prisma.question.delete({ where: { id: questionId } }),
  ]);
}
