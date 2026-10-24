import type { DayStatus } from "@/lib/schedule";

export const STATUS_BAR: Record<DayStatus, string> = {
  none: "bg-transparent",
  future: "bg-border-strong",
  done: "bg-success",
  partial: "bg-accent",
  missed: "bg-danger",
};

export const STATUS_LABEL: Record<DayStatus, string> = {
  none: "Nothing planned",
  future: "Planned",
  done: "Plan met",
  partial: "Partly done",
  missed: "Missed",
};

export const PHASE_TINT = [
  "border-t-accent", // Content pass
  "border-t-ink-faint", // Holiday buffer
  "border-t-success", // Problem sets
  "border-t-danger", // Mock exams
];

export type View = "month" | "week";

export function calendarHref(view: View, date: string, day?: string) {
  const p = new URLSearchParams({ view, date });
  if (day) p.set("day", day);
  return `/calendar?${p.toString()}`;
}
