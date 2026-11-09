"use server";

import { auth } from "@/auth";
import { aiConfigured } from "@/lib/ai-explain";
import {
  examFor,
  existingItemIds,
  importQuestion,
  subjectNameOf,
  type ImportExamInfo,
  type ImportQuestion,
  type ImportResult,
} from "@/lib/bulk-import";

export type ReviewBatchQuestion = ImportQuestion;
export type ReviewBatchResult = ImportResult;

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("Admin only.");
}

/**
 * Which of these item ids are already in the question bank with all four
 * choices (from an earlier import, or from the other export format, which
 * shares the review center's item ids). Those are skipped.
 */
export async function existingItemIdsAction(ids: string[]): Promise<string[]> {
  await requireAdmin();
  return existingItemIds(ids);
}

/**
 * Imports a few questions of one exam file (see lib/bulk-import.ts). Small
 * batches keep each request well under Vercel's body size and time limits;
 * the page calls this repeatedly and can resume (done items are skipped).
 */
export async function importReviewBatchAction(input: {
  exam: ImportExamInfo;
  questions: ImportQuestion[];
}): Promise<ImportResult[]> {
  await requireAdmin();
  if (!aiConfigured() && input.questions.some((q) => !q.choices)) {
    return input.questions.map((q) => ({ sourceItemId: q.sourceItemId, ok: false, error: "AI isn't set up (ANTHROPIC_API_KEY)." }));
  }
  let exam: { id: string };
  try {
    exam = await examFor(input.exam);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Couldn't create the exam.";
    return input.questions.map((q) => ({ sourceItemId: q.sourceItemId, ok: false, error }));
  }
  const subjectName = subjectNameOf(input.exam.subject);
  return Promise.all(input.questions.map((q) => importQuestion(exam.id, subjectName, q)));
}
