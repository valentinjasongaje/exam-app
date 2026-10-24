/**
 * Calendar engine: turns the weekly review plan into concrete day-by-day
 * blocks, applies the user's skip/move overrides, and works out planned vs.
 * done, catch-up gaps and spaced-review dates. Pure functions only (no
 * Prisma), so the calendar page and the ICS feed build the same schedule.
 *
 * The weekly template mirrors the spreadsheet plan:
 *   Mon (free)   08:00–11:00, 13:00–16:00, 19:00–20:00  Elex
 *   Tue–Fri      office 08:00–18:00, 20 min formulas at lunch
 *   Tue          PTK online class 19:00–21:30 (no review)
 *   Wed/Thu/Fri  20:30–21:30 drills: Math / GEAS / EST
 *   Sat          07:00–10:30 weakest subject, PTK 13:00–16:00, 19:30–20:30 light review
 *   Sun          08:00–11:30 Math & Elex problems, 13:30–16:30 timed quiz
 * Office weeks (containing the month's last Friday) turn Monday into a work
 * day with a 1-hour evening Elex session. Holiday and exam weeks are lighter.
 */

import {
  EXAM_DATE,
  PHASES,
  addDays,
  currentPhase,
  daysBetween,
  toDbDate,
  weekStart,
  weekType,
  type TrackerSubjectSlug,
  type WeekType,
} from "./study-plan";

/** First day the plan generates blocks for. */
export const PLAN_START = "2026-10-25";

export type BlockKind = "review" | "work" | "class";

export type PlanBlock = {
  key: string; // stable per weekday template slot, e.g. "mon-am"
  date: string; // YYYY-MM-DD the block is shown on
  originalDate: string; // the day the template put it on (differs when moved)
  title: string;
  kind: BlockKind;
  subject: TrackerSubjectSlug | null; // null = mixed / weakest subject / not review
  start: string; // HH:MM
  end: string;
  minutes: number; // review minutes it counts toward the plan (0 for work/class)
  moved: boolean;
  skipped: boolean;
};

export type OverrideInput = {
  date: string;
  blockKey: string;
  action: "SKIP" | "MOVE";
  newDate: string | null;
  newStart: string | null;
  newEnd: string | null;
};

// ---------- time helpers ----------

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function isValidTime(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export function formatTime(hhmm: string) {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(ymd: string) {
  return (toDbDate(ymd).getUTCDay() + 6) % 7;
}

// ---------- template ----------

type Slot = Omit<PlanBlock, "date" | "originalDate" | "minutes" | "moved" | "skipped">;

function slot(
  key: string,
  title: string,
  kind: BlockKind,
  start: string,
  end: string,
  subject: TrackerSubjectSlug | null = null
): Slot {
  return { key, title, kind, start, end, subject };
}

const WORK = (d: string) => slot(`${d}-work`, "Office", "work", "08:00", "18:00");
const FORMULAS = (d: string) => slot(`${d}-formulas`, "Formula review (20 min)", "review", "12:00", "12:20");

/** Phase-aware Sunday blocks: weekly quiz → half mocks every 2 weeks → full mocks. */
function sundaySlots(ymd: string): Slot[] {
  const phase = currentPhase(ymd)?.name;
  if (phase === "Mock exams") {
    return [
      slot("sun-am", "Full mock exam — part 1", "review", "08:00", "11:30"),
      slot("sun-pm", "Full mock exam — part 2", "review", "13:30", "16:30"),
    ];
  }
  const halfMockWeek =
    phase === "Problem sets" && Math.floor(daysBetween(PHASES[2].start, ymd) / 7) % 2 === 1;
  return [
    slot("sun-am", "Math & Elex problems", "review", "08:00", "11:30"),
    slot("sun-pm", halfMockWeek ? "Half-length mock exam" : "Timed quiz", "review", "13:30", "16:30"),
  ];
}

function templateSlots(ymd: string, type: WeekType): Slot[] {
  const wd = weekdayIndex(ymd);
  const light = type === "holiday" || type === "exam";

  switch (wd) {
    case 0: // Monday
      if (type === "office")
        return [WORK("mon"), slot("mon-eve", "Elex (1 hr)", "review", "20:30", "21:30", "elex")];
      return [
        slot("mon-am", "Elex — new topics", "review", "08:00", "11:00", "elex"),
        ...(light
          ? []
          : [
              slot("mon-pm", "Elex — problems", "review", "13:00", "16:00", "elex"),
              slot("mon-eve", "Elex — light review", "review", "19:00", "20:00", "elex"),
            ]),
      ];
    case 1: // Tuesday
      return [WORK("tue"), ...(light ? [] : [FORMULAS("tue")]), slot("tue-ptk", "PTK online class", "class", "19:00", "21:30")];
    case 2:
    case 3:
    case 4: {
      const d = ["wed", "thu", "fri"][wd - 2];
      const drill = (
        [
          ["Math problems", "math"],
          ["GEAS problems", "geas"],
          ["EST problems", "est"],
        ] as const
      )[wd - 2];
      const keepDrill = type !== "holiday"; // exam week keeps short evening drills
      return [
        WORK(d),
        ...(light ? [] : [FORMULAS(d)]),
        ...(keepDrill ? [slot(`${d}-eve`, drill[0], "review", "20:30", "21:30", drill[1])] : []),
      ];
    }
    case 5: // Saturday
      return [
        slot("sat-am", "Weakest subject / catch-up", "review", "07:00", "10:30"),
        slot("sat-ptk", "PTK face-to-face", "class", "13:00", "16:00"),
        ...(light ? [] : [slot("sat-eve", "Light review", "review", "19:30", "20:30")]),
      ];
    default: // Sunday
      return type === "exam" ? [] : sundaySlots(ymd);
  }
}

function toBlock(s: Slot, date: string, originalDate = date, moved = false): PlanBlock {
  return {
    ...s,
    date,
    originalDate,
    minutes: s.kind === "review" ? toMinutes(s.end) - toMinutes(s.start) : 0,
    moved,
    skipped: false,
  };
}

/** The unmodified plan for one day. Empty outside the plan window and on exam day. */
export function templateBlocks(ymd: string): PlanBlock[] {
  if (ymd < PLAN_START || ymd >= EXAM_DATE) return [];
  return templateSlots(ymd, weekType(weekStart(ymd))).map((s) => toBlock(s, ymd));
}

/**
 * Blocks shown on `ymd` after overrides: template blocks minus moved-away
 * ones (skipped ones stay, flagged, so they can be restored), plus blocks
 * moved in from other days.
 */
export function blocksForDay(ymd: string, overrides: OverrideInput[]): PlanBlock[] {
  const own = templateBlocks(ymd).flatMap((b) => {
    const o = overrides.find((x) => x.date === ymd && x.blockKey === b.key);
    if (!o) return [b];
    if (o.action === "SKIP") return [{ ...b, skipped: true, minutes: 0 }];
    if (o.newDate === ymd) {
      return [movedBlock(b, o)];
    }
    return []; // moved to another day
  });

  const movedIn = overrides
    .filter((o) => o.action === "MOVE" && o.newDate === ymd && o.date !== ymd)
    .flatMap((o) => {
      const original = templateBlocks(o.date).find((b) => b.key === o.blockKey);
      return original ? [movedBlock(original, o)] : [];
    });

  return [...own, ...movedIn].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

function movedBlock(b: PlanBlock, o: OverrideInput): PlanBlock {
  const start = o.newStart ?? b.start;
  const end = o.newEnd ?? b.end;
  return {
    ...b,
    date: o.newDate ?? b.date,
    originalDate: b.date,
    start,
    end,
    minutes: b.kind === "review" ? Math.max(0, toMinutes(end) - toMinutes(start)) : 0,
    moved: true,
  };
}

export function plannedMinutes(blocks: PlanBlock[]) {
  return blocks.reduce((sum, b) => sum + (b.skipped ? 0 : b.minutes), 0);
}

/** Planned review minutes for the Mon–Sun week starting `monday`, overrides applied. */
export function weekPlannedMinutes(monday: string, overrides: OverrideInput[]) {
  let total = 0;
  for (let i = 0; i < 7; i++) total += plannedMinutes(blocksForDay(addDays(monday, i), overrides));
  return total;
}

// ---------- quick adjustments ----------

/**
 * "PTK moved to Friday this week": the Tuesday class moves to Friday 7–9:30pm
 * and Friday's EST drill moves to Tuesday evening (the spreadsheet rule).
 * Returns the two overrides to upsert, keyed by the Tuesday of that week.
 */
export function ptkToFridayOverrides(tuesday: string): OverrideInput[] {
  const friday = addDays(tuesday, 3);
  return [
    { date: tuesday, blockKey: "tue-ptk", action: "MOVE", newDate: friday, newStart: "19:00", newEnd: "21:30" },
    { date: friday, blockKey: "fri-eve", action: "MOVE", newDate: tuesday, newStart: "20:30", newEnd: "21:30" },
  ];
}

// ---------- day status ----------

export type DayStatus = "none" | "future" | "done" | "partial" | "missed";

export function dayStatus(ymd: string, today: string, planned: number, logged: number): DayStatus {
  if (ymd > today) return planned > 0 ? "future" : "none";
  if (planned === 0) return logged > 0 ? "done" : "none";
  const ratio = logged / planned;
  if (ratio >= 0.9) return "done";
  if (ymd === today) return logged > 0 ? "partial" : "future";
  return ratio >= 0.5 ? "partial" : "missed";
}

// ---------- catch-up ----------

export type SessionInput = { date: string; subject: string; minutes: number };

/**
 * Per-subject shortfall for the week containing `ymd`, counting only days
 * before `today`: planned subject minutes minus logged subject minutes.
 * Mixed blocks (formulas, weakest subject, light review) only count toward
 * the overall total, not a subject.
 */
export function weekCatchUp(
  ymd: string,
  today: string,
  overrides: OverrideInput[],
  sessions: SessionInput[]
) {
  const monday = weekStart(ymd);
  const planned = new Map<string, number>();
  let plannedTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    if (d >= today) break;
    for (const b of blocksForDay(d, overrides)) {
      if (b.skipped || b.minutes === 0) continue;
      plannedTotal += b.minutes;
      if (b.subject) planned.set(b.subject, (planned.get(b.subject) ?? 0) + b.minutes);
    }
  }
  const end = addDays(monday, 6);
  const logged = new Map<string, number>();
  let loggedTotal = 0;
  for (const s of sessions) {
    if (s.date < monday || s.date > end || s.date >= today) continue;
    loggedTotal += s.minutes;
    logged.set(s.subject, (logged.get(s.subject) ?? 0) + s.minutes);
  }
  const bySubject = [...planned.entries()]
    .map(([subject, mins]) => ({ subject, minutes: mins - (logged.get(subject) ?? 0) }))
    .filter((x) => x.minutes >= 30);
  return { bySubject, totalGap: Math.max(0, plannedTotal - loggedTotal) };
}

// ---------- spaced review ----------

/** Days after today for each re-review, by the status that triggered them. */
export const REVIEW_INTERVALS = {
  DONE: [3, 7, 21],
  NEEDS_REVIEW: [1, 3, 7],
} as const;

export function reviewDates(fromYmd: string, status: keyof typeof REVIEW_INTERVALS) {
  return REVIEW_INTERVALS[status]
    .map((days, i) => ({ step: i + 1, dueDate: addDays(fromYmd, days) }))
    .filter((r) => r.dueDate < EXAM_DATE);
}

// ---------- milestones ----------

export type Milestone = { date: string; title: string; tone: "accent" | "danger" };

export function milestones(): Milestone[] {
  return [
    ...PHASES.slice(0, 4).map((p) => ({ date: p.start, title: `${p.name} starts`, tone: "accent" as const })),
    { date: EXAM_DATE, title: "ECE board exam", tone: "danger" as const },
  ];
}

export function phaseIndex(ymd: string) {
  return PHASES.findIndex((p) => ymd >= p.start && ymd <= p.end);
}
