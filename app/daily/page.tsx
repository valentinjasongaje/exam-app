import Link from "next/link";
import { CheckCircle2, Play, RotateCcw } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toDbDate, todayLocal } from "@/lib/study-plan";
import { DAILY, MINUTES, startOfToday } from "@/lib/daily";
import { mistakeCounts } from "@/lib/mistakes";
import { Card, PageHeader } from "@/components/ui";
import { startDailyAction, startMistakeReviewAction } from "./actions";

export const dynamic = "force-dynamic";

/** "Today": the daily 15-minute session and the mistake bank at a glance. */
export default async function DailyPage() {
  const session = await auth();
  const userId = session!.user.id;
  const today = toDbDate(todayLocal());
  const dueWhere = { OR: [{ dueDate: null }, { dueDate: { lte: today } }] };

  const [formulasDue, problemsDue, mistakes, questionCount, todays] = await Promise.all([
    prisma.formulaCard.count({ where: { userId, ...dueWhere } }),
    prisma.videoQuestion.count({ where: { userId, kind: "solve", answer: { not: null }, ...dueWhere } }),
    mistakeCounts(userId),
    prisma.question.count(),
    prisma.attempt.findMany({
      where: { userId, label: "daily", startedAt: { gte: startOfToday() } },
      orderBy: { startedAt: "desc" },
      select: { id: true, finishedAt: true, score: true, totalQuestions: true },
    }),
  ]);

  const f = Math.min(formulasDue, DAILY.formulas);
  const q = Math.min(questionCount, DAILY.questions);
  const p = Math.min(problemsDue, DAILY.problems);
  const minutes = Math.max(1, Math.round(f * MINUTES.formula + q * MINUTES.question + p * MINUTES.problem));
  const open = todays.find((a) => !a.finishedAt);
  const done = todays.filter((a) => a.finishedAt);

  return (
    <>
      <PageHeader eyebrow="Today" title="Daily session" subtitle="About 15 minutes: lunch break, the jeepney ride, or before bed. Do it every office day." />

      <Card className="mb-6 border-accent/40 bg-accent-soft/40">
        {done.length > 0 && !open ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-success" size={28} />
              <div>
                <p className="text-lg font-semibold">Done for today</p>
                <p className="text-sm text-ink-muted">
                  Questions: {done[0].score}/{done[0].totalQuestions}
                  {done.length > 1 && ` · ${done.length} rounds`} ·{" "}
                  <Link href={`/attempt/${done[0].id}/review`} className="text-accent hover:underline">
                    review answers
                  </Link>
                </p>
              </div>
            </div>
            <form action={startDailyAction}>
              <input type="hidden" name="again" value="1" />
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-accent hover:bg-accent-soft">
                <RotateCcw size={14} /> Another round
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ul className="grid grid-cols-3 gap-2 text-center">
              {[
                { n: f, label: f === 1 ? "formula" : "formulas", sub: `${formulasDue} due` },
                { n: q, label: "questions", sub: `${Math.min(mistakes.due, q)} from mistakes` },
                { n: p, label: p === 1 ? "solved problem" : "solved problems", sub: `${problemsDue} due` },
              ].map((x) => (
                <li key={x.label} className="rounded-lg bg-bg-elevated px-2 py-3">
                  <p className="text-2xl font-semibold tabular-nums">{x.n}</p>
                  <p className="text-xs text-ink-muted">{x.label}</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{x.sub}</p>
                </li>
              ))}
            </ul>
            <form action={startDailyAction}>
              <button
                type="submit"
                disabled={f + q + p === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-base font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-50"
              >
                <Play size={16} className="fill-current" /> {open ? "Continue today's session" : `Start · about ${minutes} min`}
              </button>
            </form>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-ink-muted">Mistake bank</h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {mistakes.due} <span className="text-base font-normal text-ink-muted">due · {mistakes.active} to master</span>
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              Every wrong answer comes back the next day, again 3 days later, and leaves once you get it right twice in a row.
              {mistakes.mastered > 0 && ` ${mistakes.mastered} mastered so far.`}
            </p>
          </div>
          {mistakes.due > 0 && (
            <form action={startMistakeReviewAction}>
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium hover:bg-bg-muted">
                Review {Math.min(mistakes.due, 20)} due mistakes
              </button>
            </form>
          )}
        </div>
      </Card>
    </>
  );
}
