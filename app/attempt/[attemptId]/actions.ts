"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireOwnAttempt(attemptId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== session.user.id) redirect("/dashboard");
  return attempt;
}

async function scoreAttempt(attemptId: string) {
  const correctCount = await prisma.attemptAnswer.count({
    where: { attemptId, isCorrect: true },
  });
  await prisma.attempt.update({
    where: { id: attemptId },
    data: { score: correctCount, finishedAt: new Date() },
  });
}

export async function submitAllAction(attemptId: string, formData: FormData) {
  const attempt = await requireOwnAttempt(attemptId);
  if (attempt.finishedAt) redirect(`/attempt/${attemptId}/review`);

  const questions = await prisma.question.findMany({
    where: { examId: attempt.examId },
    include: { choices: true },
  });

  for (const q of questions) {
    const choiceId = formData.get(`answer-${q.id}`);
    if (typeof choiceId !== "string" || !choiceId) continue;
    const choice = q.choices.find((c) => c.id === choiceId);
    if (!choice) continue;

    await prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId: q.id } },
      update: { choiceId: choice.id, isCorrect: choice.isCorrect },
      create: { attemptId, questionId: q.id, choiceId: choice.id, isCorrect: choice.isCorrect },
    });
  }

  await scoreAttempt(attemptId);
  redirect(`/attempt/${attemptId}/review`);
}

export async function saveAnswerAction(attemptId: string, questionId: string, choiceId: string) {
  const attempt = await requireOwnAttempt(attemptId);
  if (attempt.finishedAt) return;

  const choice = await prisma.choice.findUnique({ where: { id: choiceId } });
  if (!choice || choice.questionId !== questionId) return;

  await prisma.attemptAnswer.upsert({
    where: { attemptId_questionId: { attemptId, questionId } },
    update: { choiceId: choice.id, isCorrect: choice.isCorrect },
    create: { attemptId, questionId, choiceId: choice.id, isCorrect: choice.isCorrect },
  });

  revalidatePath(`/attempt/${attemptId}`);
}

export async function finishAttemptAction(attemptId: string) {
  const attempt = await requireOwnAttempt(attemptId);
  if (!attempt.finishedAt) {
    await scoreAttempt(attemptId);
  }
  redirect(`/attempt/${attemptId}/review`);
}
