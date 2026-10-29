import Link from "next/link";
import { clsx } from "clsx";
import {
  ArrowRight,
  Briefcase,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Play,
  PlayCircle,
  RotateCcw,
  Sigma,
  Sun,
  Timer,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  EXAM_DATE,
  daysBetween,
  formatDay,
  formatMinutes,
  subjectName,
  toDbDate,
  todayLocal,
} from "@/lib/study-plan";
import { blocksForDay, formatTime, plannedMinutes } from "@/lib/schedule";
import { loadOverrides } from "@/lib/calendar-data";
import { DAILY, MINUTES, startOfToday } from "@/lib/daily";
import { mistakeCounts } from "@/lib/mistakes";
import { ensurePlanVideos, sharedDriveFiles } from "@/lib/shared-videos";
import { Card, PageHeader } from "@/components/ui";
import ProgressBar from "../tracker/progress-bar";
import { startDailyAction, startMistakeReviewAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * "Today": the home page. The daily 15-minute session, what to watch next,
 * today's plan from the calendar, and the mistake bank.
 */
export default async function DailyPage() {
  const session = await auth();
  const userId = session!.user.id;
  const ymd = todayLocal();
  const today = toDbDate(ymd);
  const dueWhere = { OR: [{ dueDate: null }, { dueDate: { lte: today } }] };
  const isAdmin = session!.user.role === "ADMIN";
  if (!isAdmin) await ensurePlanVideos(userId);
  const shared = isAdmin ? null : await sharedDriveFiles();

  const [
    formulasDue,
    problemsDue,
    mistakes,
    questionCount,
    todays,
    videos,
    overrides,
    logged,
  ] = await Promise.all([
    prisma.formulaCard.count({ where: { userId, ...dueWhere } }),
    prisma.videoQuestion.count({
      where: { userId, kind: "solve", answer: { not: null }, ...dueWhere },
    }),
    mistakeCounts(userId),
    prisma.question.count(),
    prisma.attempt.findMany({
      where: { userId, label: "daily", startedAt: { gte: startOfToday() } },
      orderBy: { startedAt: "desc" },
      select: { id: true, finishedAt: true, score: true, totalQuestions: true },
    }),
    prisma.studyVideo.findMany({
      where: { userId, section: { not: null } },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        subject: true,
        watchedMinutes: true,
        durationMinutes: true,
        driveFileId: true,
        localPath: true,
      },
    }),
    loadOverrides(userId),
    prisma.studySession.aggregate({
      where: { userId, date: today },
      _sum: { minutes: true },
    }),
  ]);

  const f = Math.min(formulasDue, DAILY.formulas);
  const q = Math.min(questionCount, DAILY.questions);
  const p = Math.min(problemsDue, DAILY.problems);
  const minutes = Math.max(
    1,
    Math.round(
      f * MINUTES.formula + q * MINUTES.question + p * MINUTES.problem,
    ),
  );
  const open = todays.find((a) => !a.finishedAt);
  const done = todays.filter((a) => a.finishedAt);

  // What to watch next: one already started, else the first not yet watched.
  // Non-admins play the admin's uploads (shared library); only those count as available.
  const playable = (v: (typeof videos)[number]) =>
    shared
      ? v.localPath
        ? shared.get(v.localPath)
        : undefined
      : v.driveFileId;
  const unwatched = videos.filter(
    (v) => v.watchedMinutes < v.durationMinutes && (isAdmin || playable(v)),
  );
  const next =
    unwatched.find((v) => v.watchedMinutes > 0) ?? unwatched[0] ?? null;
  const watchedCount = videos.length - unwatched.length;

  const blocks = blocksForDay(ymd, overrides).filter((b) => !b.skipped);
  const planned = plannedMinutes(blocks);
  const loggedMin = logged._sum.minutes ?? 0;
  const daysLeft = daysBetween(ymd, EXAM_DATE);
  const dateLabel = formatDay(ymd, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">
      <PageHeader
        icon={Sun}
        eyebrow={dateLabel}
        title="Today"
        subtitle={
          daysLeft >= 0
            ? `${daysLeft} days to the board exam. One focused session a day adds up.`
            : undefined
        }
      />

      <div
        className={clsx(
          "grid gap-4",
          isAdmin && "lg:grid-cols-[minmax(0,1fr)_20rem]",
        )}
      >
        <div className="stagger flex min-w-0 flex-col gap-4">
          {/* Daily session */}
          <Card className="border-accent/40 bg-accent-soft/40">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <Timer size={18} className="text-accent" /> 15-minute session
              </h2>
              {!(done.length > 0 && !open) && (
                <span className="text-xs text-ink-muted">
                  about {minutes} min
                </span>
              )}
            </div>
            {done.length > 0 && !open ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2
                    className="animate-pop text-success"
                    size={30}
                  />
                  <div>
                    <p className="text-lg font-semibold">Done for today</p>
                    <p className="text-sm text-ink-muted">
                      Questions: {done[0].score}/{done[0].totalQuestions}
                      {done.length > 1 && ` · ${done.length} rounds`} ·{" "}
                      <Link
                        href={`/attempt/${done[0].id}/review`}
                        className="text-accent hover:underline"
                      >
                        review answers
                      </Link>
                    </p>
                  </div>
                </div>
                <form action={startDailyAction}>
                  <input type="hidden" name="again" value="1" />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-accent hover:bg-accent-soft"
                  >
                    <RotateCcw size={14} /> Another round
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <ul className="grid grid-cols-3 gap-2 text-center">
                  {[
                    {
                      n: f,
                      label: f === 1 ? "formula" : "formulas",
                      sub: `${formulasDue} due`,
                      icon: Sigma,
                    },
                    {
                      n: q,
                      label: "questions",
                      sub: `${Math.min(mistakes.due, q)} from mistakes`,
                      icon: ClipboardCheck,
                    },
                    {
                      n: p,
                      label: p === 1 ? "solved problem" : "problems",
                      sub: `${problemsDue} due`,
                      icon: Calculator,
                    },
                  ].map((x) => (
                    <li
                      key={x.label}
                      className="rounded-lg bg-bg-elevated px-2 py-3"
                    >
                      <x.icon size={16} className="mx-auto mb-1 text-accent" />
                      <p className="text-2xl font-semibold tabular-nums">
                        {x.n}
                      </p>
                      <p className="text-xs text-ink-muted">{x.label}</p>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {x.sub}
                      </p>
                    </li>
                  ))}
                </ul>
                <form action={startDailyAction}>
                  <button
                    type="submit"
                    disabled={f + q + p === 0}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-base font-medium text-accent-ink shadow-sm transition-transform hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50"
                  >
                    <Play size={16} className="fill-current" />{" "}
                    {open ? "Continue today's session" : "Start"}
                  </button>
                </form>
              </div>
            )}
          </Card>

          {/* Continue watching */}
          {next && (
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  <PlayCircle size={18} className="text-accent" />{" "}
                  {next.watchedMinutes > 0 ? "Continue watching" : "Up next"}
                </h2>
                <Link
                  href="/lessons"
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  {watchedCount}/{videos.length} watched
                </Link>
              </div>
              <Link
                href={playable(next) ? `/watch/${next.id}` : "/lessons"}
                className="lift group flex items-center gap-3 rounded-lg border border-border bg-bg p-3 hover:border-accent"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform group-hover:scale-105">
                  <Play size={18} className="ml-0.5 fill-current" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {next.title}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {subjectName(next.subject)} ·{" "}
                    {formatMinutes(next.durationMinutes - next.watchedMinutes)}{" "}
                    left
                    {!playable(next) && " · not on Drive yet"}
                  </span>
                  <ProgressBar
                    value={next.watchedMinutes}
                    max={next.durationMinutes}
                    className="mt-2 h-1.5"
                  />
                </span>
              </Link>
            </Card>
          )}

          {/* Mistake bank */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
                  <RotateCcw size={19} />
                </span>
                <div>
                  <h2 className="font-semibold">Mistake bank</h2>
                  <p className="text-sm text-ink-muted">
                    <span className="font-medium text-ink tabular-nums">
                      {mistakes.due}
                    </span>{" "}
                    due ·{" "}
                    <span className="tabular-nums">{mistakes.active}</span> to
                    master
                    {mistakes.mastered > 0 &&
                      ` · ${mistakes.mastered} mastered`}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    Wrong answers come back the next day, again 3 days later,
                    and leave after 2 right in a row.
                  </p>
                </div>
              </div>
              {mistakes.due > 0 && (
                <form action={startMistakeReviewAction}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium hover:bg-bg-muted"
                  >
                    Review {Math.min(mistakes.due, 20)} <ArrowRight size={14} />
                  </button>
                </form>
              )}
            </div>
          </Card>
        </div>

        {/* Today's plan (the admin's own schedule) */}
        {isAdmin && (
          <aside className="animate-enter flex flex-col gap-4">
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  <CalendarDays size={18} className="text-accent" />{" "}
                  Today&rsquo;s plan
                </h2>
                <Link
                  href="/calendar"
                  className="text-xs text-accent hover:underline"
                >
                  Calendar
                </Link>
              </div>
              {planned > 0 && (
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs text-ink-muted">
                    <span>Studied {formatMinutes(loggedMin)}</span>
                    <span>Plan {formatMinutes(planned)}</span>
                  </div>
                  <ProgressBar
                    value={loggedMin}
                    max={planned}
                    tone={loggedMin >= planned ? "success" : "accent"}
                    className="h-1.5"
                  />
                </div>
              )}
              {blocks.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing planned today.</p>
              ) : (
                <ol className="flex flex-col gap-1">
                  {blocks.map((b) => {
                    const Icon =
                      b.kind === "work"
                        ? Briefcase
                        : b.kind === "class"
                          ? GraduationCap
                          : Timer;
                    return (
                      <li
                        key={b.key + b.date}
                        className={clsx(
                          "flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm",
                          b.kind === "review"
                            ? "bg-accent-soft/50"
                            : "text-ink-muted",
                        )}
                      >
                        <Icon
                          size={15}
                          className={clsx(
                            "mt-0.5 shrink-0",
                            b.kind === "review" && "text-accent",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={clsx(
                              "block",
                              b.kind === "review" && "font-medium text-ink",
                            )}
                          >
                            {b.title}
                          </span>
                          <span className="text-xs text-ink-faint">
                            {formatTime(b.start)}–{formatTime(b.end)}
                            {b.moved && " · moved"}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </aside>
        )}
      </div>
    </main>
  );
}
