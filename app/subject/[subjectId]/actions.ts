"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sampleShuffled } from "@/lib/composed-attempt";

const MOCK_BOARD_ITEMS = 100;
const BOARD_EXAM_MINUTES = 240;

/**
 * Starts a mock board exam: up to 100 questions sampled at random across
 * every exam in the subject, taken under the 4-hour board-exam timer.
 */
export async function startMockBoardExamAction(subjectId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const existing = await prisma.attempt.findFirst({
    where: {
      userId: session.user.id,
      subjectId,
      examId: null,
      mode: "BOARD_EXAM",
      finishedAt: null,
    },
    orderBy: { startedAt: "desc" },
  });
  if (existing) redirect(`/attempt/${existing.id}`);

  const [user, questionRows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    prisma.question.findMany({
      where: { exam: { subjectId } },
      select: { id: true },
    }),
  ]);
  if (questionRows.length === 0) redirect(`/subject/${subjectId}`);

  const questionIds = sampleShuffled(
    questionRows.map((q) => q.id),
    MOCK_BOARD_ITEMS
  );

  const attempt = await prisma.attempt.create({
    data: {
      userId: session.user.id,
      subjectId,
      questionIds,
      totalQuestions: questionIds.length,
      layout: user.preferredLayout,
      // The stored sample order is already random, so no question shuffle
      // seed; choices render in A-D order like the source material.
      shuffleSeed: null,
      mode: "BOARD_EXAM",
      timeLimitMinutes: BOARD_EXAM_MINUTES,
    },
  });

  redirect(`/attempt/${attempt.id}`);
}
