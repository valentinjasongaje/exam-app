import { prisma } from "@/lib/prisma";
import { toDbDate, todayLocal } from "@/lib/study-plan";
import { dueMistakes } from "@/lib/mistakes";

/**
 * The daily 15-minute session for office days: a quick warm-up of formulas,
 * a handful of multiple-choice questions (due mistakes first, then fresh ones
 * from the weakest subjects) and a couple of solved problems from the videos.
 */
export const DAILY = { formulas: 6, questions: 8, problems: 2 };
/** Rough minutes per item, for the time estimate. */
export const MINUTES = { formula: 0.5, question: 1.2, problem: 2 };
/** The session's real countdown, from when it starts (survives reloads). */
export const DAILY_MINUTES = 15;

function shuffle<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Subjects ordered weakest first by the user's accuracy (subjects with too few answers go last). */
async function subjectsWeakestFirst(userId: string) {
  const answers = await prisma.attemptAnswer.findMany({
    where: { attempt: { userId, finishedAt: { not: null } }, choiceId: { not: null } },
    select: { isCorrect: true, answeredAt: true, questionId: true, question: { select: { exam: { select: { subjectId: true } } } } },
  });
  const stats = new Map<string, { right: number; total: number }>();
  for (const a of answers) {
    const s = stats.get(a.question.exam.subjectId) ?? { right: 0, total: 0 };
    s.total++;
    if (a.isCorrect) s.right++;
    stats.set(a.question.exam.subjectId, s);
  }
  const subjects = await prisma.subject.findMany({ select: { id: true } });
  const ranked = shuffle(subjects.map((s) => s.id)).sort((a, b) => {
    const sa = stats.get(a);
    const sb = stats.get(b);
    const ra = sa && sa.total >= 10 ? sa.right / sa.total : 2;
    const rb = sb && sb.total >= 10 ? sb.right / sb.total : 2;
    return ra - rb;
  });
  // Answered right in the last 2 weeks: skip those as "fresh" questions.
  const since = new Date(Date.now() - 14 * 86_400_000);
  const recentRight = new Set(answers.filter((a) => a.isCorrect && a.answeredAt > since).map((a) => a.questionId));
  return { ranked, recentRight };
}

/** Question ids for today's multiple-choice part. */
export async function pickDailyQuestions(userId: string) {
  const mistakes = (await dueMistakes(userId, DAILY.questions)).map((m) => m.questionId);
  const need = DAILY.questions - mistakes.length;
  if (need <= 0) return shuffle(mistakes);

  const { ranked, recentRight } = await subjectsWeakestFirst(userId);
  const active = new Set(
    (await prisma.mistakeCard.findMany({ where: { userId, masteredAt: null }, select: { questionId: true } })).map((m) => m.questionId)
  );
  const fresh: string[] = [];
  // Two thirds from the weakest subject, the rest from the next one(s).
  const quotas = [Math.ceil(need * 0.67), need];
  for (const [i, subjectId] of ranked.entries()) {
    if (fresh.length >= need) break;
    const pool = await prisma.question.findMany({ where: { exam: { subjectId } }, select: { id: true } });
    const ok = shuffle(pool.map((q) => q.id).filter((id) => !active.has(id) && !recentRight.has(id) && !fresh.includes(id)));
    const limit = quotas[Math.min(i, 1)];
    fresh.push(...ok.slice(0, Math.min(limit, need - fresh.length)));
  }
  return shuffle([...mistakes, ...fresh]);
}

/** Formula cards and solved problems due today (live, not stored on the attempt). */
export async function dueRecallItems(userId: string) {
  const today = toDbDate(todayLocal());
  const [formulas, problems] = await Promise.all([
    prisma.formulaCard.findMany({
      where: { userId, OR: [{ dueDate: null }, { dueDate: { lte: today } }] },
      include: { note: { select: { topic: true, subject: true } } },
      orderBy: [{ dueDate: "asc" }, { box: "asc" }],
      take: DAILY.formulas,
    }),
    prisma.videoQuestion.findMany({
      where: { userId, kind: "solve", answer: { not: null }, OR: [{ dueDate: null }, { dueDate: { lte: today } }] },
      orderBy: [{ dueDate: "asc" }, { timesWrong: "desc" }],
      take: DAILY.problems,
    }),
  ]);
  return { formulas, problems };
}

/** The instant today began in Manila (the plan's time zone, UTC+8, no DST). */
export const startOfToday = () => new Date(`${todayLocal()}T00:00:00+08:00`);
