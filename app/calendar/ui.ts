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

/** `plan` = show the old fixed schedule; the default is the study log. */
export function calendarHref(view: View, date: string, day?: string, plan = false) {
  const p = new URLSearchParams({ view, date });
  if (day) p.set("day", day);
  if (plan) p.set("plan", "1");
  return `/calendar?${p.toString()}`;
}
