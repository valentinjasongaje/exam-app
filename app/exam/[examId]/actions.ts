"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function startAttemptAction(examId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const existing = await prisma.attempt.findFirst({
    where: { userId: session.user.id, examId, finishedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (existing) redirect(`/attempt/${existing.id}`);

  const [user, questionCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    prisma.question.count({ where: { examId } }),
  ]);

  const attempt = await prisma.attempt.create({
    data: {
      userId: session.user.id,
      examId,
      totalQuestions: questionCount,
      layout: user.preferredLayout,
      shuffleSeed: user.shuffleEnabled ? Math.floor(Math.random() * 2 ** 31) : null,
    },
  });

  redirect(`/attempt/${attempt.id}`);
}
