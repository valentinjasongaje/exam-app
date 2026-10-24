import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadEvents, loadOverrides, loadReminders, loadSessions } from "@/lib/calendar-data";
import { weekCatchUp, weekdayIndex } from "@/lib/schedule";
import {
  EXAM_DATE,
  PHASES,
  addDays,
  currentPhase,
  daysBetween,
  formatDay,
  isValidYmd,
  todayLocal,
  weekStart,
} from "@/lib/study-plan";
import { PageHeader, Card } from "@/components/ui";
import { buildDays } from "./build-days";
import MonthView from "./month-view";
import WeekView from "./week-view";
import DayPanel from "./day-panel";
import FeedCard from "./feed-card";
import { PHASE_TINT, calendarHref, type View } from "./ui";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; day?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const params = await searchParams;
  const today = todayLocal();
  const view: View = params.view === "week" ? "week" : "month";
  const anchor = isValidYmd(params.date) ? params.date : today;
  const selected = isValidYmd(params.day) ? params.day : anchor;

  // Visible range
  let from: string;
  let to: string;
  let prev: string;
  let next: string;
  let title: string;
  const month = anchor.slice(0, 7);
  if (view === "month") {
    const first = `${month}-01`;
    from = weekStart(first);
    to = addDays(from, 41);
    prev = addDays(first, -1).slice(0, 7) + "-01";
    next = addDays(first, 32).slice(0, 7) + "-01";
    title = formatDay(first, { month: "long", year: "numeric" });
  } else {
    from = weekStart(anchor);
    to = addDays(from, 6);
    prev = addDays(from, -7);
    next = addDays(from, 7);
    title = `${formatDay(from)} – ${formatDay(to, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  // The selected day may sit outside the grid (e.g. a link from elsewhere).
  const loadFrom = selected < from ? selected : from;
  const loadTo = selected > to ? selected : to;
  const catchUpFrom = weekStart(selected) < loadFrom ? weekStart(selected) : loadFrom;

  const [overrides, sessions, events, reminders, user, videos] = await Promise.all([
    loadOverrides(userId),
    loadSessions(userId, catchUpFrom, loadTo),
    loadEvents(userId, loadFrom, loadTo),
    loadReminders(userId, loadTo),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { calendarToken: true } }),
    prisma.studyVideo.findMany({
      where: { userId },
      orderBy: [{ subject: "asc" }, { order: "asc" }],
      select: { id: true, title: true, subject: true, durationMinutes: true, watchedMinutes: true },
    }),
  ]);

  const data = { overrides, sessions, events, reminders };
  const days = buildDays(from, to, today, data);
  const selectedDay =
    days.find((d) => d.date === selected) ?? buildDays(selected, selected, today, data)[0];

  // Catch-up shows from today through Sunday of the current week.
  const showCatchUp = selected >= today && weekStart(selected) === weekStart(today);
  const catchUp = showCatchUp ? weekCatchUp(selected, today, overrides, sessions) : null;

  const ptkMoved =
    weekdayIndex(selected) === 1 &&
    overrides.some(
      (o) => o.date === selected && o.blockKey === "tue-ptk" && o.action === "MOVE" && o.newDate === addDays(selected, 3)
    );

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const feedUrl = user.calendarToken && host ? `${proto}://${host}/api/calendar/${user.calendarToken}` : null;

  const phase = currentPhase(today);
  const daysLeft = daysBetween(today, EXAM_DATE);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <PageHeader
        eyebrow="Review calendar"
        title={title}
        subtitle={
          daysLeft >= 0
            ? `${phase ? `${phase.upcoming ? "Up next" : "Now"}: ${phase.name} · ` : ""}${daysLeft} days to the exam`
            : undefined
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border-strong p-0.5 text-sm">
              {(["month", "week"] as const).map((v) => (
                <Link
                  key={v}
                  href={calendarHref(v, selected, selected)}
                  className={clsx(
                    "rounded-md px-3 py-1 capitalize transition-colors",
                    view === v ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink"
                  )}
                >
                  {v}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Link href={calendarHref(view, prev, view === "week" ? prev : undefined)} aria-label="Previous" className="rounded-lg p-1.5 text-ink-muted hover:bg-bg-muted hover:text-ink">
                <ChevronLeft size={18} />
              </Link>
              <Link href={calendarHref(view, today, today)} className="rounded-lg px-2.5 py-1 text-sm text-ink-muted hover:bg-bg-muted hover:text-ink">
                Today
              </Link>
              <Link href={calendarHref(view, next, view === "week" ? next : undefined)} aria-label="Next" className="rounded-lg p-1.5 text-ink-muted hover:bg-bg-muted hover:text-ink">
                <ChevronRight size={18} />
              </Link>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Card className="p-3 sm:p-4">
            {view === "month" ? (
              <MonthView days={days} month={month} today={today} selected={selected} anchor={anchor} />
            ) : (
              <WeekView days={days} today={today} selected={selected} anchor={anchor} />
            )}
          </Card>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-success" /> Plan met</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-accent" /> Partly done</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-danger" /> Missed</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-border-strong" /> Planned</span>
            {view === "month" &&
              PHASES.map((p, i) => (
                <span key={p.name} className="flex items-center gap-1.5">
                  <span className={clsx("h-0 w-4 border-t-2", PHASE_TINT[i])} /> {p.name}
                </span>
              ))}
          </div>

          <Card className="mt-6">
            <h2 className="mb-3 text-sm font-medium text-ink-muted">Show in Google Calendar</h2>
            <FeedCard feedUrl={feedUrl} />
          </Card>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <DayPanel
            day={selectedDay}
            today={today}
            catchUp={catchUp}
            ptkMoved={ptkMoved}
            videos={videos.map((v) => ({
              id: v.id,
              title: v.title,
              subject: v.subject,
              remaining: v.durationMinutes - v.watchedMinutes,
            }))}
          />
        </div>
      </div>
    </main>
  );
}
