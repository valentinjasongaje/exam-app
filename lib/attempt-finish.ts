import { prisma } from "@/lib/prisma";
import { applyAttemptToMistakes } from "@/lib/mistakes";

/** Scores and closes an attempt, then updates the mistake bank. The one place attempts get finished. */
export async function finishAttempt(attemptId: string) {
  const correctCount = await prisma.attemptAnswer.count({ where: { attemptId, isCorrect: true } });
  await prisma.attempt.update({
    where: { id: attemptId },
    data: { score: correctCount, finishedAt: new Date() },
  });
  // Wrong answers go into the mistake bank; due ones answered right move toward mastered.
  await applyAttemptToMistakes(attemptId).catch((e) => console.error("mistake bank update failed", e));
}
