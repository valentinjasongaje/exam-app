import { prisma } from "@/lib/prisma";
import { addDays, toDbDate, todayLocal } from "@/lib/study-plan";
import { questionIdsOf } from "@/lib/composed-attempt";

/**
 * Mistake bank rules:
 *  - answered wrong → in the bank (or back in, streak reset), due tomorrow
 *  - answered right while due → streak + 1; first time due again in 3 days,
 *    second time in a row → mastered (leaves the queue)
 *  - right answers before a card is due don't count (e.g. redoing the same
 *    exam right after seeing the answers), and skipped questions are ignored.
 */
export const MISS_AGAIN_IN_DAYS = 1;
export const AFTER_FIRST_RIGHT_DAYS = 3;
export const RIGHTS_TO_MASTER = 2;

/** Applies a just-finished attempt's answers to the user's mistake bank. */
export async function applyAttemptToMistakes(attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, questionIds: true, answers: { select: { questionId: true, choiceId: true, isCorrect: true } } },
  });
  if (!attempt) return;
  const userId = attempt.userId;
  const today = todayLocal();
  const tomorrow = toDbDate(addDays(today, MISS_AGAIN_IN_DAYS));
  const now = new Date();

  // Composed attempts only count answers to their own question list.
  const allowed = questionIdsOf(attempt);
  const answers = attempt.answers.filter((a) => a.choiceId && (!allowed || allowed.includes(a.questionId)));
  const wrong = answers.filter((a) => !a.isCorrect).map((a) => a.questionId);
  const right = answers.filter((a) => a.isCorrect).map((a) => a.questionId);

  const ops = wrong.map((questionId) =>
    prisma.mistakeCard.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: { userId, questionId, dueDate: tomorrow, lastReviewedAt: now },
      update: { streak: 0, dueDate: tomorrow, masteredAt: null, lastReviewedAt: now, timesWrong: { increment: 1 } },
    })
  );

  if (right.length) {
    const due = await prisma.mistakeCard.findMany({
      where: {
        userId,
        questionId: { in: right },
        masteredAt: null,
        OR: [{ dueDate: null }, { dueDate: { lte: toDbDate(today) } }],
      },
    });
    for (const c of due) {
      const streak = c.streak + 1;
      const mastered = streak >= RIGHTS_TO_MASTER;
      ops.push(
        prisma.mistakeCard.update({
          where: { id: c.id },
          data: {
            streak,
            timesRight: { increment: 1 },
            lastReviewedAt: now,
            masteredAt: mastered ? now : null,
            dueDate: mastered ? null : toDbDate(addDays(today, AFTER_FIRST_RIGHT_DAYS)),
          },
        })
      );
    }
  }
  if (ops.length) await prisma.$transaction(ops);
}

/** Active (not mastered) mistakes due today or overdue, most-missed first. */
export function dueMistakes(userId: string, take: number) {
  return prisma.mistakeCard.findMany({
    where: { userId, masteredAt: null, OR: [{ dueDate: null }, { dueDate: { lte: toDbDate(todayLocal()) } }] },
    orderBy: [{ dueDate: "asc" }, { timesWrong: "desc" }],
    take,
    select: { questionId: true },
  });
}

export async function mistakeCounts(userId: string) {
  const today = toDbDate(todayLocal());
  const [active, due, mastered] = await Promise.all([
    prisma.mistakeCard.count({ where: { userId, masteredAt: null } }),
    prisma.mistakeCard.count({ where: { userId, masteredAt: null, OR: [{ dueDate: null }, { dueDate: { lte: today } }] } }),
    prisma.mistakeCard.count({ where: { userId, masteredAt: { not: null } } }),
  ]);
  return { active, due, mastered };
}
