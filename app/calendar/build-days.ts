import {
  blocksForDay,
  dayStatus,
  milestones,
  phaseIndex,
  plannedMinutes,
  type DayStatus,
  type Milestone,
  type OverrideInput,
  type PlanBlock,
} from "@/lib/schedule";
import { addDays, daysBetween } from "@/lib/study-plan";
import type { CalendarEventRow, ReminderRow } from "@/lib/calendar-data";

export type SessionRow = {
  id: string;
  date: string;
  subject: string;
  minutes: number;
  activity: string;
  score: number | null;
  total: number | null;
  note: string | null;
};

export type CalendarDay = {
  date: string;
  blocks: PlanBlock[];
  planned: number;
  logged: number;
  status: DayStatus;
  sessions: SessionRow[];
  events: CalendarEventRow[];
  reminders: (ReminderRow & { overdue: boolean })[];
  milestones: Milestone[];
  phase: number; // index into PHASES, -1 outside
};

export function buildDays(
  from: string,
  to: string,
  today: string,
  data: {
    overrides: OverrideInput[];
    sessions: SessionRow[];
    events: CalendarEventRow[];
    reminders: ReminderRow[];
  }
): CalendarDay[] {
  const all = milestones();
  const count = daysBetween(from, to) + 1;
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(from, i);
    const blocks = blocksForDay(date, data.overrides);
    const sessions = data.sessions.filter((s) => s.date === date);
    const planned = plannedMinutes(blocks);
    const logged = sessions.reduce((sum, s) => sum + s.minutes, 0);
    // Pending reviews sit on their due day; once that day passes they roll
    // forward onto today (flagged overdue) instead of staying in the past.
    const reminders = data.reminders
      .filter((r) => (r.dueDate === date && date >= today) || (date === today && r.dueDate < today))
      .map((r) => ({ ...r, overdue: r.dueDate < date }));
    return {
      date,
      blocks,
      planned,
      logged,
      status: dayStatus(date, today, planned, logged),
      sessions,
      events: data.events.filter((e) => e.date === date),
      reminders,
      milestones: all.filter((m) => m.date === date),
      phase: phaseIndex(date),
    };
  });
}
