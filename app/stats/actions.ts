"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const DRILL_SIZE = 20;

/**
 * Starts an untimed practice drill built from the user's most-missed
 * questions (the same ranking the stats page shows).
 */
export async function startWeakDrillAction() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const existing = await prisma.attempt.findFirst({
    where: { userId, examId: null, mode: "PRACTICE", finishedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (existing) redirect(`/attempt/${existing.id}`);

  const wrongAnswers = await prisma.attemptAnswer.findMany({
    where: { attempt: { userId }, isCorrect: false },
    select: { questionId: true },
  });

  const missCounts = new Map<string, number>();
  for (const a of wrongAnswers) {
    missCounts.set(a.questionId, (missCounts.get(a.questionId) ?? 0) + 1);
  }
  const questionIds = [...missCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, DRILL_SIZE)
    .map(([id]) => id);

  if (questionIds.length === 0) redirect("/stats");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const attempt = await prisma.attempt.create({
    data: {
      userId,
      questionIds,
      totalQuestions: questionIds.length,
      layout: "ONE_AT_A_TIME", // drills are inherently question-by-question
      shuffleSeed: null,
      mode: "PRACTICE",
      showFeedback: user.instantFeedback,
    },
  });

  redirect(`/attempt/${attempt.id}`);
}
