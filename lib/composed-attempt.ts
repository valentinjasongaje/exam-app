import type { Prisma } from "@prisma/client";

/**
 * A "composed" attempt has no exam — its question set is a stored, ordered
 * id array (mock board exams sampled across a subject, weak-question
 * drills). Returns that array, or null for a normal per-exam attempt.
 */
export function questionIdsOf(attempt: { questionIds: Prisma.JsonValue }): string[] | null {
  const value = attempt.questionIds;
  if (!Array.isArray(value)) return null;
  const ids = value.filter((v): v is string => typeof v === "string");
  return ids.length > 0 ? ids : null;
}

/** Display title for an attempt whose exam relation may be null. */
export function attemptTitle(attempt: {
  exam: { title: string } | null;
  subject: { name: string } | null;
  mode: string;
}): string {
  if (attempt.exam) return attempt.exam.title;
  if (attempt.mode === "BOARD_EXAM") {
    return `Mock Board Exam${attempt.subject ? ` — ${attempt.subject.name}` : ""}`;
  }
  return "Weakest questions drill";
}

/** Fisher-Yates on a copy, non-seeded (order is persisted on the attempt). */
export function sampleShuffled<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
