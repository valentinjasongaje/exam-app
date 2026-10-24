import { prisma } from "@/lib/prisma";
import { fromDbDate, toDbDate } from "@/lib/study-plan";
import type { OverrideInput, SessionInput } from "@/lib/schedule";

/**
 * Server-side loaders that turn Prisma rows into the plain inputs the
 * schedule engine (lib/schedule.ts) works with. Overrides are few (one row
 * per changed block), so they're always loaded in full.
 */

export async function loadOverrides(userId: string): Promise<OverrideInput[]> {
  const rows = await prisma.scheduleOverride.findMany({ where: { userId } });
  return rows.map((o) => ({
    date: fromDbDate(o.date),
    blockKey: o.blockKey,
    action: o.action,
    newDate: o.newDate ? fromDbDate(o.newDate) : null,
    newStart: o.newStart,
    newEnd: o.newEnd,
  }));
}

export async function loadSessions(userId: string, from: string, to: string): Promise<(SessionInput & {
  id: string;
  activity: string;
  score: number | null;
  total: number | null;
  note: string | null;
})[]> {
  const rows = await prisma.studySession.findMany({
    where: { userId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id,
    date: fromDbDate(s.date),
    subject: s.subject,
    minutes: s.minutes,
    activity: s.activity,
    score: s.score,
    total: s.total,
    note: s.note,
  }));
}

export async function loadEvents(userId: string, from: string, to: string) {
  const rows = await prisma.calendarEvent.findMany({
    where: { userId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    orderBy: [{ date: "asc" }, { start: "asc" }],
  });
  return rows.map((e) => ({
    id: e.id,
    date: fromDbDate(e.date),
    start: e.start,
    end: e.end,
    title: e.title,
    kind: e.kind,
    note: e.note,
  }));
}

export type CalendarEventRow = Awaited<ReturnType<typeof loadEvents>>[number];

/** Pending reminders due on or before `to`, including overdue ones (the caller shows those on today). */
export async function loadReminders(userId: string, to: string) {
  const rows = await prisma.reviewReminder.findMany({
    where: { userId, doneAt: null, dueDate: { lte: toDbDate(to) } },
    include: { topic: { select: { name: true, subject: true } } },
    orderBy: { dueDate: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    dueDate: fromDbDate(r.dueDate),
    step: r.step,
    topicName: r.topic.name,
    subject: r.topic.subject,
  }));
}

export type ReminderRow = Awaited<ReturnType<typeof loadReminders>>[number];
