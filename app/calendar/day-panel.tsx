import { clsx } from "clsx";
import { Check, Clock, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { formatDay, formatMinutes, subjectName, TRACKER_SUBJECTS } from "@/lib/study-plan";
import { formatTime, weekdayIndex } from "@/lib/schedule";
import { Badge, Card } from "@/components/ui";
import LogSessionForm from "../tracker/log-session-form";
import type { CalendarDay } from "./build-days";
import { STATUS_LABEL } from "./ui";
import { AddEventForm, MoveBlockForm } from "./forms";
import {
  completeReminderAction,
  deleteEventAction,
  ptkToFridayAction,
  restoreBlockAction,
  skipBlockAction,
  snoozeReminderAction,
  undoPtkToFridayAction,
} from "./actions";

const ACTIVITY_LABEL: Record<string, string> = {
  VIDEO: "Video",
  PROBLEMS: "Problems",
  QUIZ: "Quiz",
  REVIEW: "Formula review",
};

const smallBtn =
  "text-xs text-ink-muted transition-colors hover:text-accent disabled:opacity-50";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-medium tracking-wide text-ink-muted uppercase">{children}</h3>;
}

export default function DayPanel({
  day,
  today,
  catchUp,
  ptkMoved,
  videos,
}: {
  day: CalendarDay;
  today: string;
  catchUp: { bySubject: { subject: string; minutes: number }[]; totalGap: number } | null;
  ptkMoved: boolean;
  videos: { id: string; title: string; subject: string; remaining: number }[];
}) {
  const isTuesday = weekdayIndex(day.date) === 1;
  const hasPtk = day.blocks.some((b) => b.key === "tue-ptk" && b.originalDate === day.date);
  const canLog = day.date <= today;

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-ink-muted">{STATUS_LABEL[day.status]}</p>
        <h2 className="text-lg font-semibold">
          {formatDay(day.date, { weekday: "long", month: "long", day: "numeric" })}
          {day.date === today && <span className="ml-2 align-middle text-xs font-normal text-accent">Today</span>}
        </h2>
        {(day.planned > 0 || day.logged > 0) && (
          <p className="mt-1 text-sm text-ink-muted">
            {day.date > today ? "Planned" : "Done"}{" "}
            {day.date > today ? (
              <span className="text-ink">{formatMinutes(day.planned)}</span>
            ) : (
              <>
                <span className="text-ink">{formatMinutes(day.logged)}</span> of {formatMinutes(day.planned)} planned
              </>
            )}
          </p>
        )}
        {day.milestones.map((m) => (
          <p key={m.title} className={clsx("mt-1 text-sm font-medium", m.tone === "danger" ? "text-danger" : "text-accent")}>
            {m.title}
          </p>
        ))}
      </div>

      {catchUp && (catchUp.bySubject.length > 0 || catchUp.totalGap >= 60) && (
        <div className="rounded-lg border border-accent/40 bg-accent-soft/50 p-3 text-sm">
          <p className="font-medium">Catch up this weekend</p>
          <p className="mt-0.5 text-ink-muted">
            {catchUp.bySubject.length > 0
              ? catchUp.bySubject.map((g) => `${subjectName(g.subject)} ${formatMinutes(g.minutes)}`).join(" · ")
              : `${formatMinutes(catchUp.totalGap)} behind plan`}
            {" "}— use the Saturday morning block.
          </p>
        </div>
      )}

      {day.reminders.length > 0 && (
        <section>
          <SectionTitle>Topic reviews</SectionTitle>
          <ul className="flex flex-col gap-1.5">
            {day.reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg bg-bg-muted px-3 py-2 text-sm">
                <RotateCcw size={14} className={r.overdue ? "text-danger" : "text-accent"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.topicName}</span>
                  <span className="text-xs text-ink-muted">
                    {subjectName(r.subject)} · review {r.step}
                    {r.overdue && <span className="text-danger"> · due {formatDay(r.dueDate)}</span>}
                  </span>
                </span>
                <form action={snoozeReminderAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className={smallBtn} title="Move to tomorrow">
                    <Clock size={15} />
                  </button>
                </form>
                <form action={completeReminderAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" aria-label="Mark reviewed" className="rounded-md p-1 text-success hover:bg-success-soft">
                    <Check size={16} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-faint">
            10–15 minutes each: redo a few problems from the topic without notes.
          </p>
        </section>
      )}

      <section>
        <SectionTitle>Plan</SectionTitle>
        {day.blocks.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing planned.</p>
        ) : (
          <ul className="flex flex-col">
            {day.blocks.map((b) => (
              <li key={`${b.originalDate}-${b.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 text-sm last:border-0">
                <span className="w-24 shrink-0 text-xs text-ink-muted tabular-nums">
                  {formatTime(b.start)}–{formatTime(b.end)}
                </span>
                <span className={clsx("min-w-0 flex-1", b.skipped && "text-ink-faint line-through")}>
                  {b.title}
                  {b.moved && (
                    <Badge className="ml-2" tone="accent">
                      {b.originalDate !== day.date ? `from ${formatDay(b.originalDate, { weekday: "short" })}` : "moved"}
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  {b.skipped || b.moved ? (
                    <form action={restoreBlockAction}>
                      <input type="hidden" name="date" value={b.originalDate} />
                      <input type="hidden" name="blockKey" value={b.key} />
                      <button type="submit" className={clsx(smallBtn, "flex items-center gap-1")}>
                        <Undo2 size={12} /> Restore
                      </button>
                    </form>
                  ) : (
                    <form action={skipBlockAction}>
                      <input type="hidden" name="date" value={b.originalDate} />
                      <input type="hidden" name="blockKey" value={b.key} />
                      <button type="submit" className={smallBtn}>
                        Skip
                      </button>
                    </form>
                  )}
                  {!b.skipped && (
                    <MoveBlockForm
                      key={`${b.originalDate}-${b.key}-${b.date}-${b.start}`}
                      date={b.originalDate}
                      blockKey={b.key}
                      defaultDate={b.date}
                      defaultStart={b.start}
                      defaultEnd={b.end}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {isTuesday && (hasPtk || ptkMoved) && (
          <form action={ptkMoved ? undoPtkToFridayAction : ptkToFridayAction} className="mt-3">
            <input type="hidden" name="tuesday" value={day.date} />
            <button type="submit" className="text-sm text-accent hover:underline">
              {ptkMoved ? "PTK is back on Tuesday (undo move)" : "PTK moved to Friday this week"}
            </button>
            {!ptkMoved && (
              <p className="text-xs text-ink-faint">Moves the class to Friday 7pm and Friday&rsquo;s EST drill to tonight.</p>
            )}
          </form>
        )}
      </section>

      <section>
        <SectionTitle>Logged</SectionTitle>
        {day.sessions.length === 0 ? (
          <p className="mb-3 text-sm text-ink-muted">{canLog ? "Nothing logged yet." : "You can log sessions once the day comes."}</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-1">
            {day.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {subjectName(s.subject)} <span className="text-ink-muted">· {ACTIVITY_LABEL[s.activity] ?? s.activity}</span>
                  {s.score !== null && s.total ? (
                    <span className="text-ink-muted"> · {Math.round((s.score / s.total) * 100)}%</span>
                  ) : null}
                </span>
                <span className="tabular-nums">{formatMinutes(s.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
        {canLog && (
          <details className="group">
            <summary className="cursor-pointer text-sm text-accent hover:underline">Log a session for this day</summary>
            <div className="mt-3">
              <LogSessionForm key={day.date} today={today} defaultDate={day.date} subjects={TRACKER_SUBJECTS} videos={videos} compact />
            </div>
          </details>
        )}
      </section>

      <section>
        <SectionTitle>Events</SectionTitle>
        {day.events.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1.5">
            {day.events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-xs text-ink-muted tabular-nums">
                  {e.start ? `${formatTime(e.start)}${e.end ? `–${formatTime(e.end)}` : ""}` : "All day"}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                {e.kind !== "EVENT" && <Badge tone={e.kind === "DEADLINE" ? "danger" : "muted"}>{e.kind === "DEADLINE" ? "Deadline" : "Busy"}</Badge>}
                <form action={deleteEventAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" aria-label={`Delete ${e.title}`} className="rounded-md p-1 text-ink-faint hover:bg-danger-soft hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddEventForm key={day.date} date={day.date} />
      </section>
    </Card>
  );
}
