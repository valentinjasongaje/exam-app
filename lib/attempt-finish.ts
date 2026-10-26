import { prisma } from "@/lib/prisma";
import { applyAttemptToMistakes } from "@/lib/mistakes";
import { logAttempt } from "@/lib/auto-log";

/** Scores and closes an attempt, then updates the mistake bank and the study log. The one place attempts get finished. */
export async function finishAttempt(attemptId: string) {
  const correctCount = await prisma.attemptAnswer.count({ where: { attemptId, isCorrect: true } });
  await prisma.attempt.update({
    where: { id: attemptId },
    data: { score: correctCount, finishedAt: new Date() },
  });
  // Wrong answers go into the mistake bank; due ones answered right move toward mastered.
  await applyAttemptToMistakes(attemptId).catch((e) => console.error("mistake bank update failed", e));
  // And it shows up in the study tracker as a Quiz session, no typing needed.
  await logAttempt(attemptId).catch((e) => console.error("auto log failed", e));
}
