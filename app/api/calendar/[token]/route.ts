import { prisma } from "@/lib/prisma";
import { loadEvents, loadOverrides, loadReminders } from "@/lib/calendar-data";
import { PLAN_START, blocksForDay, milestones } from "@/lib/schedule";
import { EXAM_DATE, PLAN_TIMEZONE, addDays, daysBetween, subjectName, todayLocal } from "@/lib/study-plan";

/**
 * Read-only ICS feed for Google Calendar ("Other calendars → From URL").
 * Auth is the unguessable token in the path (User.calendarToken), since
 * calendar clients can't sign in. The feed regenerates on every fetch, so
 * moves, skips, events and topic reviews show up on Google's next refresh.
 * Office blocks are left out — they're already on a work calendar and would
 * only add noise.
 */

export const dynamic = "force-dynamic";

function esc(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding at 75 octets. */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, "utf8") > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function plusHour(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

const compactDate = (ymd: string) => ymd.replace(/-/g, "");
const compactTime = (hhmm: string) => hhmm.replace(":", "") + "00";

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function timed(uid: string, date: string, start: string, end: string, summary: string, description?: string) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;TZID=${PLAN_TIMEZONE}:${compactDate(date)}T${compactTime(start)}`,
    `DTEND;TZID=${PLAN_TIMEZONE}:${compactDate(date)}T${compactTime(end)}`,
    `SUMMARY:${esc(summary)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    "END:VEVENT",
  ];
}

function allDay(uid: string, date: string, summary: string, description?: string) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${compactDate(date)}`,
    `DTEND;VALUE=DATE:${compactDate(addDays(date, 1))}`,
    `SUMMARY:${esc(summary)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 20) return new Response("Not found", { status: 404 });

  const user = await prisma.user.findUnique({ where: { calendarToken: token }, select: { id: true } });
  if (!user) return new Response("Not found", { status: 404 });

  const today = todayLocal();
  const from = addDays(today, -14) > PLAN_START ? addDays(today, -14) : PLAN_START;
  const to = EXAM_DATE;

  const [overrides, events, reminders] = await Promise.all([
    loadOverrides(user.id),
    loadEvents(user.id, from, to),
    loadReminders(user.id, to),
  ]);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Exam App//Review Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ECE Review",
    `X-WR-TIMEZONE:${PLAN_TIMEZONE}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
    "BEGIN:VTIMEZONE",
    `TZID:${PLAN_TIMEZONE}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:PHT",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (let i = 0, n = daysBetween(from, to); i <= n; i++) {
    const date = addDays(from, i);
    for (const b of blocksForDay(date, overrides)) {
      if (b.skipped || b.kind === "work") continue;
      const prefix = b.kind === "review" ? "ECE: " : "";
      lines.push(
        ...timed(
          `${b.originalDate}-${b.key}@exam-app`,
          b.date,
          b.start,
          b.end,
          `${prefix}${b.title}`,
          b.moved ? `Moved from ${b.originalDate}` : undefined
        )
      );
    }
  }

  for (const e of events) {
    const summary = e.kind === "DEADLINE" ? `Deadline: ${e.title}` : e.title;
    lines.push(
      ...(e.start
        ? timed(`event-${e.id}@exam-app`, e.date, e.start, e.end ?? plusHour(e.start), summary, e.note ?? undefined)
        : allDay(`event-${e.id}@exam-app`, e.date, summary, e.note ?? undefined))
    );
  }

  for (const r of reminders) {
    const date = r.dueDate < today ? today : r.dueDate;
    lines.push(
      ...allDay(
        `review-${r.id}@exam-app`,
        date,
        `Review: ${r.topicName} (${subjectName(r.subject)})`,
        "10–15 minutes: redo a few problems from this topic without notes. Mark it done in the app."
      )
    );
  }

  for (const m of milestones()) {
    lines.push(...allDay(`milestone-${m.date}-${m.title.replace(/\W+/g, "-")}@exam-app`, m.date, m.title));
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ece-review.ics"',
      "Cache-Control": "no-store",
    },
  });
}
