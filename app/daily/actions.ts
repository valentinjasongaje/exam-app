"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { finishAttempt } from "@/lib/attempt-finish";
import { DAILY_MINUTES, pickDailyQuestions, startOfToday } from "@/lib/daily";
import { dueMistakes } from "@/lib/mistakes";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user.id;
}

/**
 * Starts (or resumes) today's daily session. Its multiple-choice part is a
 * composed attempt labelled "daily", so answers count in Progress and feed
 * the mistake bank like any other attempt. Yesterday's unfinished one is
 * closed first.
 */
export async function startDailyAction(formData?: FormData) {
  const userId = await requireUser();
  const fresh = formData?.get("again") === "1";
  const today = startOfToday();

  const stale = await prisma.attempt.findMany({
    where: { userId, label: "daily", finishedAt: null, startedAt: { lt: today } },
    select: { id: true },
  });
  for (const a of stale) await finishAttempt(a.id);

  if (!fresh) {
    const open = await prisma.attempt.findFirst({
      where: { userId, label: "daily", finishedAt: null, startedAt: { gte: today } },
      orderBy: { startedAt: "desc" },
    });
    if (open) redirect(`/daily/session?attempt=${open.id}`);
  }

  const questionIds = await pickDailyQuestions(userId);
  if (questionIds.length === 0) redirect("/daily/session");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { instantFeedback: true } });
  const attempt = await prisma.attempt.create({
    data: {
      userId,
      label: "daily",
      questionIds,
      totalQuestions: questionIds.length,
      layout: "ONE_AT_A_TIME",
      shuffleSeed: null,
      mode: "PRACTICE",
      // Follows Settings → "Show the answer right after each question".
      showFeedback: user?.instantFeedback ?? false,
      timeLimitMinutes: DAILY_MINUTES,
    },
  });
  redirect(`/daily/session?attempt=${attempt.id}`);
}

const REVIEW_SIZE = 20;

/** Reviews the mistakes due today (up to 20), one at a time with instant feedback. */
export async function startMistakeReviewAction() {
  const userId = await requireUser();
  const open = await prisma.attempt.findFirst({
    where: { userId, label: "mistakes", finishedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (open) redirect(`/attempt/${open.id}`);

  const due = await dueMistakes(userId, REVIEW_SIZE);
  if (due.length === 0) redirect("/stats");
  const questionIds = due.map((m) => m.questionId).sort(() => Math.random() - 0.5);
  const attempt = await prisma.attempt.create({
    data: {
      userId,
      label: "mistakes",
      questionIds,
      totalQuestions: questionIds.length,
      layout: "ONE_AT_A_TIME",
      shuffleSeed: null,
      mode: "PRACTICE",
      showFeedback: true,
    },
  });
  redirect(`/attempt/${attempt.id}`);
}
