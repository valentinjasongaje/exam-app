/**
 * The personal review plan behind /tracker: exam date, phases, weekly hour
 * targets and the default topic checklist. Mirrors the spreadsheet plan
 * (ECE_Review_Schedule.xlsx) so the app and the sheet agree.
 *
 * All calendar math works on "YYYY-MM-DD" strings in Asia/Manila time and
 * converts to UTC-midnight Dates only at the database edge (StudySession.date
 * is a @db.Date column).
 */

export const PLAN_TIMEZONE = "Asia/Manila";

/** Placeholder until PRC publishes the official March 2027 schedule. */
export const EXAM_DATE = "2027-03-07";

export const TRACKER_SUBJECTS = [
  { slug: "math", name: "Math" },
  { slug: "geas", name: "GEAS" },
  { slug: "elex", name: "Elex" },
  { slug: "est", name: "EST" },
] as const;

export type TrackerSubjectSlug = (typeof TRACKER_SUBJECTS)[number]["slug"];

export function isTrackerSubject(v: unknown): v is TrackerSubjectSlug {
  return TRACKER_SUBJECTS.some((s) => s.slug === v);
}

export function subjectName(slug: string) {
  return TRACKER_SUBJECTS.find((s) => s.slug === slug)?.name ?? slug;
}

export const PHASES = [
  {
    name: "Content pass",
    start: "2026-10-26",
    end: "2026-12-20",
    goal: "Watch the review videos topic by topic, weakest areas first. Timed quiz every Sunday.",
  },
  {
    name: "Holiday buffer",
    start: "2026-12-21",
    end: "2027-01-03",
    goal: "Lighter schedule — catch up on whatever fell behind.",
  },
  {
    name: "Problem sets",
    start: "2027-01-04",
    end: "2027-02-07",
    goal: "Mostly past board problems by subject. Half-length mock every 2 weeks.",
  },
  {
    name: "Mock exams",
    start: "2027-02-08",
    end: EXAM_DATE,
    goal: "Full timed mock every Sunday, formula review on weekdays, light final week.",
  },
] as const;

export type WeekType = "normal" | "office" | "holiday" | "exam";

/**
 * Planned review minutes per week type with no overrides — these equal the
 * sum of the template blocks in lib/schedule.ts (the tracker and calendar
 * compute live targets from those blocks; this is the reference value).
 */
export const WEEKLY_TARGET_MINUTES: Record<WeekType, number> = {
  normal: 1340, // ~22.3 h: Monday off
  office: 980, // ~16.3 h: last week of the month, office Mon–Fri
  holiday: 780, // 13 h
  exam: 570, // 9.5 h
};

export const WEEK_TYPE_LABEL: Record<WeekType, string> = {
  normal: "Normal week",
  office: "Office Mon–Fri",
  holiday: "Holiday buffer",
  exam: "Exam week",
};

// ---------- date helpers ----------

export function todayLocal(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLAN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function toDbDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const d = toDbDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / 86_400_000);
}

/** Monday of the week containing `ymd`. */
export function weekStart(ymd: string): string {
  const dow = toDbDate(ymd).getUTCDay(); // 0 = Sun
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

export function isValidYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(toDbDate(v).getTime());
}

export function formatDay(ymd: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(toDbDate(ymd));
}

// ---------- plan logic ----------

/** Office Mon–Fri weeks are the ones containing the month's last Friday. */
function containsLastFridayOfMonth(monday: string): boolean {
  const friday = addDays(monday, 4);
  return addDays(friday, 7).slice(0, 7) !== friday.slice(0, 7);
}

export function weekType(monday: string): WeekType {
  const sunday = addDays(monday, 6);
  if (sunday >= addDays(EXAM_DATE, -6)) return "exam";
  const holiday = PHASES[1];
  if (monday >= holiday.start && monday <= holiday.end) return "holiday";
  if (containsLastFridayOfMonth(monday)) return "office";
  return "normal";
}

export function currentPhase(ymd: string) {
  if (ymd < PHASES[0].start) return { ...PHASES[0], upcoming: true };
  const found = PHASES.find((p) => ymd >= p.start && ymd <= p.end);
  return found ? { ...found, upcoming: false } : null;
}

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Accepts "90", "1:30", "1h30", "1h 30m", "1.5h". Returns minutes or null. */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m?)?$/)))
    return Math.round(Number(m[1]) * 60) + Number(m[2] ?? 0);
  if ((m = s.match(/^(\d+)\s*m?$/))) return Number(m[1]);
  return null;
}

// ---------- default topic checklist ----------

export const DEFAULT_TOPICS: Record<TrackerSubjectSlug, string[]> = {
  math: [
    "Algebra",
    "Trigonometry",
    "Plane & Solid Geometry",
    "Analytic Geometry",
    "Differential Calculus",
    "Integral Calculus",
    "Differential Equations",
    "Complex Numbers",
    "Advanced Engineering Math (Laplace, Fourier, Matrices)",
    "Probability & Statistics",
    "Numerical Methods",
  ],
  geas: [
    "General Chemistry",
    "Physics",
    "Engineering Mechanics",
    "Thermodynamics",
    "Materials Science",
    "Computer Fundamentals & Programming",
    "Environmental Engineering",
    "Engineering Economics",
    "Engineering Management",
    "Laws, Contracts & Ethics",
  ],
  elex: [
    "DC Circuits",
    "AC Circuits",
    "Electronic Devices (diodes, BJT, FET)",
    "Electronic Circuit Analysis & Design (amplifiers, op-amps)",
    "Digital Electronics & Logic Circuits",
    "Microprocessors & Microcontrollers",
    "Industrial Electronics",
    "Feedback & Control Systems",
    "Power Supplies & Regulators",
  ],
  est: [
    "Signals, Spectra & Signal Processing",
    "Principles of Communication (AM/FM, noise)",
    "Digital Communications",
    "Electromagnetics",
    "Transmission Lines & Waveguides",
    "Antennas & Wave Propagation",
    "Microwave & Satellite Communications",
    "Fiber Optics",
    "Data Communications & Networks",
    "Broadcasting & Acoustics",
    "Navigational Aids",
  ],
};
