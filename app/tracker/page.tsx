import Link from "next/link";
import { Timer, Trash2 } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTopics } from "@/lib/study-topics";
import { loadOverrides } from "@/lib/calendar-data";
import { weekPlannedMinutes } from "@/lib/schedule";
import {
  EXAM_DATE,
  TRACKER_SUBJECTS,
  WEEK_TYPE_LABEL,
  addDays,
  currentPhase,
  daysBetween,
  formatDay,
  formatMinutes,
  fromDbDate,
  subjectName,
  toDbDate,
  todayLocal,
  weekStart,
  weekType,
} from "@/lib/study-plan";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import ProgressBar from "./progress-bar";
import LogSessionForm from "./log-session-form";
import { deleteSessionAction } from "./actions";

const HISTORY_WEEKS = 8;

const ACTIVITY_LABEL = {
  VIDEO: "Video",
  PROBLEMS: "Problems",
  QUIZ: "Quiz",
  REVIEW: "Formula review",
} as const;

export default async function TrackerPage() {
  const session = await auth();
  const userId = session!.user.id; // layout already redirects when logged out
  await ensureDefaultTopics(userId);

  const today = todayLocal();
  const monday = weekStart(today);
  const historyStart = addDays(monday, -7 * (HISTORY_WEEKS - 1));

  const [sessions, recent, topics, videos, overrides] = await Promise.all([
    prisma.studySession.findMany({
      where: { userId, date: { gte: toDbDate(historyStart) } },
      select: { date: true, subject: true, minutes: true, activity: true, score: true, total: true },
    }),
    prisma.studySession.findMany({
      where: { userId, minutes: { gt: 0 } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 12,
    }),
    prisma.studyTopic.findMany({ where: { userId }, select: { subject: true, status: true } }),
    prisma.studyVideo.findMany({
      where: { userId },
      orderBy: [{ subject: "asc" }, { order: "asc" }],
      select: { id: true, title: true, subject: true, section: true, durationMinutes: true, watchedMinutes: true },
    }),
    loadOverrides(userId),
  ]);

  // ---- this week ----
  const thisWeek = sessions.filter((s) => fromDbDate(s.date) >= monday);
  const thisType = weekType(monday);
  const target = weekPlannedMinutes(monday, overrides);
  const weekMinutes = thisWeek.reduce((sum, s) => sum + s.minutes, 0);
  const bySubject = TRACKER_SUBJECTS.map((s) => ({
    ...s,
    minutes: thisWeek.filter((x) => x.subject === s.slug).reduce((sum, x) => sum + x.minutes, 0),
  }));
  const maxSubject = Math.max(1, ...bySubject.map((s) => s.minutes));

  // ---- history ----
  const weeks = Array.from({ length: HISTORY_WEEKS }, (_, i) => {
    const start = addDays(monday, -7 * i);
    const end = addDays(start, 6);
    const inWeek = sessions.filter((s) => {
      const d = fromDbDate(s.date);
      return d >= start && d <= end;
    });
    const minutes = inWeek.reduce((sum, s) => sum + s.minutes, 0);
    const quizzes = inWeek.filter((s) => s.score !== null && s.total);
    const quizPct =
      quizzes.length > 0
        ? Math.round(
            (quizzes.reduce((sum, q) => sum + q.score!, 0) /
              quizzes.reduce((sum, q) => sum + q.total!, 0)) *
              100
          )
        : null;
    const type = weekType(start);
    return { start, type, minutes, target: weekPlannedMinutes(start, overrides), quizPct };
  });

  // ---- topics & videos ----
  const topicRows = TRACKER_SUBJECTS.map((s) => {
    const mine = topics.filter((t) => t.subject === s.slug);
    return { ...s, total: mine.length, done: mine.filter((t) => t.status === "DONE").length };
  });
  const videoRows = TRACKER_SUBJECTS.map((s) => {
    const mine = videos.filter((v) => v.subject === s.slug);
    return {
      ...s,
      count: mine.length,
      duration: mine.reduce((sum, v) => sum + v.durationMinutes, 0),
      watched: mine.reduce((sum, v) => sum + v.watchedMinutes, 0),
    };
  });

  const phase = currentPhase(today);
  const daysLeft = daysBetween(today, EXAM_DATE);

  return (
    <>
      <PageHeader
        icon={Timer}
        eyebrow="Study log"
        title={phase ? (phase.upcoming ? `${phase.name} starts ${formatDay(phase.start)}` : phase.name) : "Exam done"}
        subtitle={
          daysLeft >= 0
            ? `${daysLeft} days until the exam (${formatDay(EXAM_DATE, { month: "long", day: "numeric", year: "numeric" })} — placeholder until PRC confirms).`
            : undefined
        }
      />
      {phase && <p className="-mt-5 mb-8 text-sm text-ink-muted">{phase.goal}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-ink-muted">This week</h2>
            <Badge tone={thisType === "normal" ? "muted" : "accent"}>{WEEK_TYPE_LABEL[thisType]}</Badge>
          </div>
          <p className="mb-1 text-xs text-ink-faint">
            {formatDay(monday)} – {formatDay(addDays(monday, 6))}
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {formatMinutes(weekMinutes)}
            <span className="ml-1.5 text-base font-normal text-ink-muted">/ {formatMinutes(target)}</span>
          </p>
          <ProgressBar
            value={weekMinutes}
            max={Math.max(target, 1)}
            tone={weekMinutes >= target * 0.9 ? "success" : "accent"}
            className="mt-3"
          />
          <ul className="mt-5 flex flex-col gap-2.5">
            {bySubject.map((s) => (
              <li key={s.slug} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-sm">
                <span className="text-ink-muted">{s.name}</span>
                <ProgressBar value={s.minutes} max={maxSubject} />
                <span className="text-right tabular-nums">{s.minutes ? formatMinutes(s.minutes) : "–"}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="md:col-span-3">
          <h2 className="text-sm font-medium text-ink-muted">Log a study session</h2>
          <p className="mt-1 mb-4 text-xs text-ink-faint">
            Videos in the site&rsquo;s player, exams, the daily session and recall are logged on their own. Use this for
            everything else: problem sets on paper, books, PTK class.
          </p>
          <LogSessionForm
            today={today}
            subjects={TRACKER_SUBJECTS}
            videos={videos.map((v) => ({
              id: v.id,
              title: v.title,
              subject: v.subject,
              remaining: v.durationMinutes - v.watchedMinutes,
            }))}
          />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-muted">Topics done</h2>
            <Link href="/lessons/topics" className="text-sm text-accent hover:underline">
              Open checklist
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {topicRows.map((t) => (
              <li key={t.slug} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-sm">
                <span className="text-ink-muted">{t.name}</span>
                <ProgressBar value={t.done} max={t.total} tone="success" />
                <span className="text-right tabular-nums">
                  {t.done}/{t.total}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-muted">Videos watched</h2>
            <Link href="/lessons" className="text-sm text-accent hover:underline">
              Manage videos
            </Link>
          </div>
          {videos.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No videos yet.{" "}
              <Link href="/lessons" className="text-accent hover:underline">
                Add your review videos
              </Link>{" "}
              to track how much is left.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {videoRows.map((v) => (
                <li key={v.slug} className="grid grid-cols-[3.5rem_1fr_5.5rem] items-center gap-2 text-sm">
                  <span className="text-ink-muted">{v.name}</span>
                  <ProgressBar value={v.watched} max={v.duration} tone="success" />
                  <span className="text-right text-xs tabular-nums text-ink-muted">
                    {v.count ? `${formatMinutes(v.watched)} / ${formatMinutes(v.duration)}` : "–"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mt-10 mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">
        Last {HISTORY_WEEKS} weeks
      </h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm sm:min-w-[520px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-ink-muted">
              <th className="px-4 py-2.5 font-medium">Week of</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Type</th>
              <th className="px-4 py-2.5 text-right font-medium">Hours</th>
              <th className="px-4 py-2.5 text-right font-medium">Plan</th>
              <th className="px-4 py-2.5 text-right font-medium">% of plan</th>
              <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Quiz avg</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => {
              const pct = w.target > 0 ? Math.round((w.minutes / w.target) * 100) : 0;
              return (
                <tr key={w.start} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">{formatDay(w.start)}</td>
                  <td className="hidden px-4 py-2.5 text-ink-muted sm:table-cell">{WEEK_TYPE_LABEL[w.type]}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{w.minutes ? formatMinutes(w.minutes) : "–"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{formatMinutes(w.target)}</td>
                  <td
                    className={
                      "px-4 py-2.5 text-right tabular-nums " +
                      (w.minutes === 0 ? "text-ink-faint" : pct >= 90 ? "text-success" : pct < 70 ? "text-danger" : "")
                    }
                  >
                    {w.minutes ? `${pct}%` : "–"}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">{w.quizPct !== null ? `${w.quizPct}%` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <h2 className="mt-10 mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">
        Recent sessions
      </h2>
      {recent.length === 0 ? (
        <EmptyState>Nothing logged yet. Watch a video in the site&rsquo;s player or take an exam and it shows up here.</EmptyState>
      ) : (
        <Card className="p-0">
          <ul>
            {recent.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0"
              >
                <span className="w-14 shrink-0 text-ink-muted">{formatDay(fromDbDate(s.date))}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{subjectName(s.subject)}</span>
                  {s.autoKey && (
                    <span className="ml-1.5 rounded bg-bg-muted px-1 py-0.5 align-middle text-[10px] font-medium tracking-wide text-ink-faint uppercase">
                      auto
                    </span>
                  )}
                  <span className="text-ink-muted"> · {ACTIVITY_LABEL[s.activity]}</span>
                  {s.score !== null && s.total ? (
                    <span className="text-ink-muted">
                      {" "}
                      · {s.score}/{s.total} ({Math.round((s.score / s.total) * 100)}%)
                    </span>
                  ) : null}
                  {s.note && <span className="block truncate text-xs text-ink-faint">{s.note}</span>}
                </span>
                <span className="tabular-nums">{formatMinutes(s.minutes)}</span>
                <form action={deleteSessionAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    aria-label="Delete session"
                    className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
