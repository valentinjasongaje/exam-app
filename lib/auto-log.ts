import type { StudyActivity } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isTrackerSubject, toDbDate, todayLocal } from "@/lib/study-plan";

/**
 * Study time the app logs by itself, so the tracker fills in without typing:
 * one StudySession per `autoKey`, with seconds added on every update.
 * Minutes (what the tracker and calendar read) follow the seconds.
 */
export async function addAutoTime(input: {
  userId: string;
  key: string;
  subject: string;
  activity: StudyActivity;
  seconds: number;
  note?: string | null;
  date?: string; // YYYY-MM-DD (Manila); default today
  score?: number | null;
  total?: number | null;
}) {
  if (!isTrackerSubject(input.subject)) return;
  const secs = Math.max(0, Math.round(input.seconds));
  const where = { userId_autoKey: { userId: input.userId, autoKey: input.key } };
  const existing = await prisma.studySession.findUnique({ where });
  const seconds = (existing?.seconds ?? 0) + secs;
  const data = {
    seconds,
    minutes: Math.round(seconds / 60),
    ...(input.score !== undefined ? { score: input.score } : {}),
    ...(input.total !== undefined ? { total: input.total } : {}),
  };
  if (existing) {
    await prisma.studySession.update({ where: { id: existing.id }, data });
  } else {
    await prisma.studySession
      .create({
        data: {
          userId: input.userId,
          autoKey: input.key,
          date: toDbDate(input.date ?? todayLocal()),
          subject: input.subject,
          activity: input.activity,
          note: input.note ?? null,
          ...data,
        },
      })
      // Two updates racing for a new key: the loser adds to the winner's row.
      .catch(() => prisma.studySession.update({ where, data: { seconds: { increment: secs } } }));
  }
}

/** Time spent on one recall card / solved problem, clamped to something believable. */
export function clampCardSeconds(seconds: unknown) {
  const n = Number(seconds);
  return Number.isFinite(n) ? Math.min(300, Math.max(5, n)) : 30;
}

/** Logs a finished attempt as a Quiz session (time from first to last answer). */
export async function logAttempt(attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: {
      userId: true,
      label: true,
      score: true,
      mode: true,
      subject: { select: { slug: true } },
      exam: { select: { title: true } },
      answers: {
        where: { choiceId: { not: null } },
        select: { answeredAt: true, question: { select: { exam: { select: { subject: { select: { slug: true } } } } } } },
        orderBy: { answeredAt: "asc" },
      },
    },
  });
  if (!attempt || attempt.answers.length === 0) return;
  const first = attempt.answers[0].answeredAt.getTime();
  const last = attempt.answers[attempt.answers.length - 1].answeredAt.getTime();
  // Reading the first question takes time too: add about a minute per 10 items.
  const seconds = Math.min(4 * 3600, (last - first) / 1000 + 60 + attempt.answers.length * 6);

  // Mixed sets (daily session, mistake review) are logged under their most common subject.
  const counts = new Map<string, number>();
  for (const a of attempt.answers) {
    const slug = a.question.exam.subject.slug;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const subject = attempt.subject?.slug ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const title =
    attempt.exam?.title ??
    (attempt.label === "daily" ? "Daily session" : attempt.label === "mistakes" ? "Mistake review" : attempt.mode === "BOARD_EXAM" ? "Mock board exam" : "Drill");

  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(last)
  );
  await addAutoTime({
    userId: attempt.userId,
    key: `attempt:${attemptId}`,
    subject,
    activity: "QUIZ",
    seconds,
    note: title,
    date,
    score: attempt.score ?? 0,
    total: attempt.answers.length,
  });
}
