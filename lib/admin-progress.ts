/**
 * Everyone's progress, for the admin (Admin → Users): study time against
 * their weekly targets, videos watched, practice accuracy, daily sessions
 * and mistakes waiting. A handful of grouped queries for all users at once.
 */
import { prisma } from "@/lib/prisma";
import { WATCH_PLAN } from "@/lib/video-library";
import { addDays, fromDbDate, toDbDate, todayLocal, weekStart } from "@/lib/study-plan";
import { parseTargets, weekBalance } from "@/lib/study-balance";

export type UserProgressRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  lastActive: Date | null;
  /** Did anything (study log or exam) in the last 7 days. */
  activeRecently: boolean;
  weekMinutes: number;
  weekTarget: number;
  /** Subject most behind pace this week, if any (≥30 min). */
  behind: { subject: string; minutes: number } | null;
  videosWatched: number;
  videosTotal: number;
  answered: number;
  accuracy: number | null;
  examsFinished: number;
  dailyDaysThisWeek: number;
  mistakesDue: number;
};

const planPaths = new Set(WATCH_PLAN.map((p) => p.localPath));

export async function usersProgress(): Promise<UserProgressRow[]> {
  const today = todayLocal();
  const ws = weekStart(today);
  const [users, sessions, lastStudy, lastAttempt, videos, scores, daily, mistakes] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, weeklyTargets: true } }),
    prisma.studySession.findMany({
      where: { date: { gte: toDbDate(ws), lte: toDbDate(addDays(ws, 6)) } },
      select: { userId: true, date: true, subject: true, minutes: true },
    }),
    prisma.studySession.groupBy({ by: ["userId"], _max: { createdAt: true } }),
    prisma.attempt.groupBy({ by: ["userId"], _max: { startedAt: true } }),
    prisma.studyVideo.findMany({
      where: { localPath: { not: null } },
      select: { userId: true, localPath: true, watchedMinutes: true, durationMinutes: true },
    }),
    prisma.attempt.groupBy({
      by: ["userId"],
      where: { finishedAt: { not: null } },
      _sum: { score: true, totalQuestions: true },
      _count: { _all: true },
    }),
    prisma.attempt.findMany({
      where: { label: "daily", finishedAt: { not: null }, startedAt: { gte: toDbDate(ws) } },
      select: { userId: true, startedAt: true },
    }),
    prisma.mistakeCard.groupBy({
      by: ["userId"],
      where: { masteredAt: null, OR: [{ dueDate: null }, { dueDate: { lte: toDbDate(today) } }] },
      _count: { _all: true },
    }),
  ]);

  const by = <T extends { userId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.userId, [...(m.get(r.userId) ?? []), r]);
    return m;
  };
  const sessionsBy = by(sessions);
  const videosBy = by(videos);
  const dailyBy = by(daily);
  const one = <T extends { userId: string }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r]));
  const lastStudyBy = one(lastStudy);
  const lastAttemptBy = one(lastAttempt);
  const scoresBy = one(scores);
  const mistakesBy = one(mistakes);

  return users.map((u) => {
    const rows = weekBalance(
      (sessionsBy.get(u.id) ?? []).map((s) => ({ date: fromDbDate(s.date), subject: s.subject, minutes: s.minutes })),
      ws,
      today,
      parseTargets(u.weeklyTargets, u.role === "ADMIN" ? undefined : {})
    );
    const behind = [...rows].filter((r) => r.behindBy >= 30).sort((a, b) => b.behindBy - a.behindBy)[0];
    const vids = (videosBy.get(u.id) ?? []).filter((v) => planPaths.has(v.localPath!));
    const sc = scoresBy.get(u.id);
    const answered = sc?._sum.totalQuestions ?? 0;
    const last = [lastStudyBy.get(u.id)?._max.createdAt, lastAttemptBy.get(u.id)?._max.startedAt]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      lastActive: last ?? null,
      activeRecently: !!last && Date.now() - last.getTime() < 7 * 86_400_000,
      weekMinutes: rows.reduce((n, r) => n + r.minutes, 0),
      weekTarget: rows.reduce((n, r) => n + r.target, 0),
      behind: behind ? { subject: behind.subject, minutes: behind.behindBy } : null,
      videosWatched: vids.filter((v) => v.watchedMinutes >= v.durationMinutes).length,
      videosTotal: WATCH_PLAN.length,
      answered,
      accuracy: answered > 0 ? Math.round(((sc?._sum.score ?? 0) / answered) * 100) : null,
      examsFinished: sc?._count._all ?? 0,
      dailyDaysThisWeek: new Set((dailyBy.get(u.id) ?? []).map((d) => d.startedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }))).size,
      mistakesDue: mistakesBy.get(u.id)?._count._all ?? 0,
    };
  });
}

/** One user's study and practice in more detail (Admin → Users → name). */
export async function userProgressDetail(userId: string, role: string, weeklyTargets: unknown) {
  const today = todayLocal();
  const ws = weekStart(today);
  const from = addDays(ws, -21); // this week + the 3 before
  const [sessions, videos, attempts] = await Promise.all([
    prisma.studySession.findMany({
      where: { userId, date: { gte: toDbDate(from), lte: toDbDate(addDays(ws, 6)) } },
      select: { date: true, subject: true, minutes: true },
    }),
    prisma.studyVideo.findMany({
      where: { userId, localPath: { not: null } },
      select: { localPath: true, subject: true, watchedMinutes: true, durationMinutes: true },
    }),
    prisma.attempt.findMany({
      where: { userId, finishedAt: { not: null } },
      select: { score: true, totalQuestions: true, subject: { select: { name: true } } },
    }),
  ]);
  const days = sessions.map((s) => ({ date: fromDbDate(s.date), subject: s.subject, minutes: s.minutes }));
  const targets = parseTargets(weeklyTargets, role === "ADMIN" ? undefined : {});
  const thisWeek = weekBalance(days, ws, today, targets);
  const weeks = [3, 2, 1, 0].map((back) => {
    const start = addDays(ws, -7 * back);
    const minutes = days.filter((d) => d.date >= start && d.date <= addDays(start, 6)).reduce((n, d) => n + d.minutes, 0);
    return { start, minutes };
  });

  // Videos in the current plan, per subject.
  const watched = new Map(videos.filter((v) => v.localPath).map((v) => [v.localPath!, v.watchedMinutes >= v.durationMinutes]));
  const videoBySubject = new Map<string, { done: number; total: number }>();
  for (const p of WATCH_PLAN) {
    const cur = videoBySubject.get(p.subject) ?? { done: 0, total: 0 };
    cur.total++;
    if (watched.get(p.localPath)) cur.done++;
    videoBySubject.set(p.subject, cur);
  }

  const accBySubject = new Map<string, { correct: number; total: number; exams: number }>();
  for (const a of attempts) {
    const k = a.subject?.name ?? "Mixed (daily & reviews)";
    const cur = accBySubject.get(k) ?? { correct: 0, total: 0, exams: 0 };
    cur.correct += a.score ?? 0;
    cur.total += a.totalQuestions;
    cur.exams++;
    accBySubject.set(k, cur);
  }

  return {
    thisWeek,
    pace: (Math.min(6, Math.max(0, Math.round((toDbDate(today).getTime() - toDbDate(ws).getTime()) / 86_400_000))) + 1) / 7,
    weeks,
    videos: [...videoBySubject].map(([subject, v]) => ({ subject, ...v })),
    accuracy: [...accBySubject].map(([subject, v]) => ({ subject, ...v })).sort((a, b) => a.subject.localeCompare(b.subject)),
  };
}
