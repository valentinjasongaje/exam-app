import Link from "next/link";
import { clsx } from "clsx";
import { Flag, RotateCcw } from "lucide-react";
import { formatDay, formatMinutes } from "@/lib/study-plan";
import { formatTime, toMinutes } from "@/lib/schedule";
import type { CalendarDay } from "./build-days";
import { STATUS_BAR, calendarHref } from "./ui";

const START_HOUR = 5;
const END_HOUR = 22;
const HOUR_PX = 44;

function top(hhmm: string) {
  return ((toMinutes(hhmm) - START_HOUR * 60) / 60) * HOUR_PX;
}
function height(start: string, end: string) {
  return Math.max(18, ((toMinutes(end) - toMinutes(start)) / 60) * HOUR_PX - 2);
}

const KIND_STYLE = {
  review: "bg-accent-soft text-ink border-accent/40",
  work: "bg-bg-muted text-ink-muted border-border-strong",
  class: "bg-success-soft text-ink border-success/40",
} as const;

export default function WeekView({
  days,
  today,
  selected,
  anchor,
}: {
  days: CalendarDay[];
  today: string;
  selected: string;
  anchor: string;
}) {
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {/* Day headers + all-day row */}
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border">
          <div />
          {days.map((day) => {
            const isSelected = day.date === selected;
            return (
              <Link
                key={day.date}
                href={calendarHref("week", anchor, day.date)}
                scroll={false}
                className={clsx(
                  "flex flex-col gap-1 border-l border-border px-1.5 pt-1 pb-2 text-xs transition-colors",
                  isSelected ? "bg-accent-soft/60" : "hover:bg-bg-muted"
                )}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="text-ink-muted">{formatDay(day.date, { weekday: "short" })}</span>
                  <span
                    className={clsx(
                      "flex h-6 w-6 items-center justify-center rounded-full tabular-nums",
                      day.date === today ? "bg-accent font-semibold text-accent-ink" : "font-medium"
                    )}
                  >
                    {Number(day.date.slice(8))}
                  </span>
                </span>
                <span className={clsx("h-1 rounded-full", STATUS_BAR[day.status])} />
                <span className="text-[11px] text-ink-muted tabular-nums">
                  {day.planned || day.logged
                    ? `${formatMinutes(day.logged)} / ${formatMinutes(day.planned)}`
                    : " "}
                </span>
                {day.milestones.map((m) => (
                  <span key={m.title} className={clsx("flex items-center gap-1 truncate text-[11px] font-medium", m.tone === "danger" ? "text-danger" : "text-accent")}>
                    <Flag size={10} className="shrink-0" /> <span className="truncate">{m.title}</span>
                  </span>
                ))}
                {day.reminders.length > 0 && (
                  <span className={clsx("flex items-center gap-1 text-[11px]", day.reminders.some((r) => r.overdue) ? "text-danger" : "text-ink-muted")}>
                    <RotateCcw size={10} /> {day.reminders.length} review{day.reminders.length > 1 ? "s" : ""}
                  </span>
                )}
                {day.events
                  .filter((e) => !e.start)
                  .map((e) => (
                    <span key={e.id} className="truncate rounded bg-bg-muted px-1 text-[11px]">
                      {e.title}
                    </span>
                  ))}
              </Link>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="grid grid-cols-[3rem_repeat(7,1fr)]">
          <div className="relative" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
            {hours.slice(0, -1).map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-ink-faint tabular-nums"
                style={{ top: (h - START_HOUR) * HOUR_PX }}
              >
                {h === START_HOUR ? "" : formatTime(`${String(h).padStart(2, "0")}:00`)}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day.date}
              className={clsx("relative border-l border-border", day.date === today && "bg-accent-soft/20")}
              style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}
            >
              {hours.slice(1, -1).map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-border/60"
                  style={{ top: (h - START_HOUR) * HOUR_PX }}
                />
              ))}
              {day.blocks.map((b) => (
                <Link
                  key={`${b.originalDate}-${b.key}`}
                  href={calendarHref("week", anchor, day.date)}
                  scroll={false}
                  title={`${b.title} · ${formatTime(b.start)}–${formatTime(b.end)}${b.skipped ? " (skipped)" : b.moved ? " (moved)" : ""}`}
                  className={clsx(
                    "absolute inset-x-0.5 overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight",
                    KIND_STYLE[b.kind],
                    b.moved && "border-dashed",
                    b.skipped && "opacity-45 line-through"
                  )}
                  style={{ top: top(b.start), height: height(b.start, b.end) }}
                >
                  <span className="block truncate font-medium">{b.title}</span>
                  {toMinutes(b.end) - toMinutes(b.start) >= 50 && (
                    <span className="block truncate text-ink-muted">
                      {formatTime(b.start)}–{formatTime(b.end)}
                    </span>
                  )}
                </Link>
              ))}
              {day.events
                .filter((e) => e.start)
                .map((e) => (
                  <div
                    key={e.id}
                    title={e.title}
                    className={clsx(
                      "absolute right-0.5 left-1/3 overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight shadow-sm",
                      e.kind === "DEADLINE"
                        ? "border-danger/50 bg-danger-soft"
                        : "border-border-strong bg-bg-elevated"
                    )}
                    style={{ top: top(e.start!), height: height(e.start!, e.end ?? addHour(e.start!)) }}
                  >
                    <span className="block truncate font-medium">{e.title}</span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function addHour(hhmm: string) {
  const m = Math.min(toMinutes(hhmm) + 60, 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
