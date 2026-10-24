import Link from "next/link";
import { clsx } from "clsx";
import { RotateCcw, Flag } from "lucide-react";
import { formatMinutes, subjectName } from "@/lib/study-plan";
import type { CalendarDay } from "./build-days";
import { PHASE_TINT, STATUS_BAR, STATUS_LABEL, calendarHref } from "./ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The main subject of a day's plan, for the cell label ("Elex 7h"). */
function planLabel(day: CalendarDay) {
  if (day.planned === 0) return null;
  const bySubject = new Map<string, number>();
  for (const b of day.blocks) {
    if (b.skipped || !b.minutes || !b.subject) continue;
    bySubject.set(b.subject, (bySubject.get(b.subject) ?? 0) + b.minutes);
  }
  const top = [...bySubject.entries()].sort((a, b) => b[1] - a[1])[0];
  const label = top && top[1] >= day.planned / 2 ? subjectName(top[0]) : "Review";
  return `${label} ${formatMinutes(day.planned)}`;
}

export default function MonthView({
  days,
  month,
  today,
  selected,
  anchor,
}: {
  days: CalendarDay[];
  month: string; // YYYY-MM
  today: string;
  selected: string;
  anchor: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border pb-2 text-center text-xs font-medium text-ink-muted">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-xl bg-border">
        {days.map((day) => {
          const inMonth = day.date.slice(0, 7) === month;
          const isToday = day.date === today;
          const isSelected = day.date === selected;
          const label = planLabel(day);
          const skipped = day.blocks.some((b) => b.skipped);
          const moved = day.blocks.some((b) => b.moved);
          return (
            <Link
              key={day.date}
              href={calendarHref("month", anchor, day.date)}
              scroll={false}
              aria-label={`${day.date}: ${STATUS_LABEL[day.status]}`}
              aria-current={isSelected ? "date" : undefined}
              className={clsx(
                "group relative flex min-h-[4.25rem] flex-col gap-0.5 border-t-2 bg-bg-elevated p-1.5 text-left transition-colors sm:min-h-[6.5rem] sm:p-2",
                day.phase >= 0 ? PHASE_TINT[day.phase] : "border-t-transparent",
                !inMonth && "bg-bg-muted/60 text-ink-faint",
                isSelected ? "ring-2 ring-accent ring-inset" : "hover:bg-bg-muted"
              )}
            >
              <span
                className={clsx(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                  isToday ? "bg-accent font-semibold text-accent-ink" : ""
                )}
              >
                {Number(day.date.slice(8))}
              </span>

              {/* Desktop details */}
              <div className="hidden min-w-0 flex-col gap-0.5 text-[11px] leading-tight sm:flex">
                {day.milestones.map((m) => (
                  <span
                    key={m.title}
                    className={clsx(
                      "flex items-center gap-1 truncate font-medium",
                      m.tone === "danger" ? "text-danger" : "text-accent"
                    )}
                  >
                    <Flag size={10} className="shrink-0" />
                    <span className="truncate">{m.title}</span>
                  </span>
                ))}
                {label && (
                  <span className={clsx("truncate", inMonth ? "text-ink" : "")}>
                    {label}
                    {(skipped || moved) && <span className="text-ink-faint"> · edited</span>}
                  </span>
                )}
                {day.logged > 0 && (
                  <span className="truncate text-success">Done {formatMinutes(day.logged)}</span>
                )}
                {day.reminders.length > 0 && (
                  <span className={clsx("flex items-center gap-1 truncate", day.reminders.some((r) => r.overdue) ? "text-danger" : "text-ink-muted")}>
                    <RotateCcw size={10} className="shrink-0" />
                    {day.reminders.length} topic review{day.reminders.length > 1 ? "s" : ""}
                  </span>
                )}
                {day.events.slice(0, 2).map((e) => (
                  <span key={e.id} className={clsx("truncate", e.kind === "DEADLINE" ? "text-danger" : "text-ink-muted")}>
                    • {e.title}
                  </span>
                ))}
                {day.events.length > 2 && <span className="text-ink-faint">+{day.events.length - 2} more</span>}
              </div>

              {/* Mobile: dots */}
              <div className="mt-auto mb-1.5 flex gap-0.5 sm:hidden">
                {day.reminders.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                {day.events.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" />}
                {day.milestones.map((m) => (
                  <span key={m.title} className={clsx("h-1.5 w-1.5 rounded-full", m.tone === "danger" ? "bg-danger" : "bg-accent")} />
                ))}
              </div>

              <span className={clsx("absolute inset-x-1.5 bottom-1 h-1 rounded-full", STATUS_BAR[day.status])} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
