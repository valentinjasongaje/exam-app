"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const BOARD_EXAM_MINUTES = 240;

export async function startAttemptAction(examId: string, mode: "PRACTICE" | "BOARD_EXAM") {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const existing = await prisma.attempt.findFirst({
    where: { userId: session.user.id, examId, finishedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (existing) redirect(`/attempt/${existing.id}`);

  const [user, exam, questionCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    prisma.exam.findUniqueOrThrow({ where: { id: examId } }),
    prisma.question.count({ where: { examId } }),
  ]);

  const attempt = await prisma.attempt.create({
    data: {
      userId: session.user.id,
      examId,
      subjectId: exam.subjectId,
      totalQuestions: questionCount,
      layout: user.preferredLayout,
      shuffleSeed: user.shuffleEnabled ? Math.floor(Math.random() * 2 ** 31) : null,
      mode,
      timeLimitMinutes: mode === "BOARD_EXAM" ? BOARD_EXAM_MINUTES : null,
      showFeedback: mode === "PRACTICE" && user.instantFeedback,
    },
  });

  redirect(`/attempt/${attempt.id}`);
}
