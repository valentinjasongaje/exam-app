import { TRACKER_SUBJECTS, daysBetween, isTrackerSubject, type TrackerSubjectSlug } from "@/lib/study-plan";

/**
 * Log-first review: instead of a fixed day-by-day schedule, each subject has
 * a weekly target (minutes) and the week shows how far each one got,
 * whatever day it was studied on.
 */

/** The admin's starting targets (Math and Elex 6 h/week); editable in Settings. Members start with none. */
export const DEFAULT_WEEKLY_TARGETS: Partial<Record<TrackerSubjectSlug, number>> = { math: 360, elex: 360 };

/** Tailwind background class per subject (tokens in globals.css). */
export const SUBJECT_BG: Record<string, string> = {
  math: "bg-subj-math",
  elex: "bg-subj-elex",
  est: "bg-subj-est",
  geas: "bg-subj-geas",
};
export const subjectBg = (slug: string) => SUBJECT_BG[slug] ?? "bg-ink-faint";

/** Stored JSON → targets; nothing saved yet (or invalid) falls back to `fallback`. */
export function parseTargets(
  json: unknown,
  fallback: Partial<Record<TrackerSubjectSlug, number>> = DEFAULT_WEEKLY_TARGETS
): Partial<Record<TrackerSubjectSlug, number>> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ...fallback };
  const out: Partial<Record<TrackerSubjectSlug, number>> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (isTrackerSubject(k) && typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = Math.round(v);
  }
  return out;
}

export type BalanceRow = { subject: TrackerSubjectSlug; minutes: number; target: number; behindBy: number };

/**
 * Minutes per subject for the week starting `weekStart` (Monday), against
 * the targets. `behindBy` = how far under the pace you'd need by `today`
 * (target spread evenly over the 7 days), 0 when on pace or the week is over.
 */
export function weekBalance(
  sessions: { date: string; subject: string; minutes: number }[],
  weekStart: string,
  today: string,
  targets: Partial<Record<TrackerSubjectSlug, number>>
): BalanceRow[] {
  const byS = new Map<string, number>();
  for (const s of sessions) {
    const d = daysBetween(weekStart, s.date);
    if (d < 0 || d > 6) continue;
    byS.set(s.subject, (byS.get(s.subject) ?? 0) + s.minutes);
  }
  const dayIdx = daysBetween(weekStart, today); // 0 = Monday
  const elapsed = dayIdx < 0 ? 0 : Math.min(7, dayIdx + 1);
  return TRACKER_SUBJECTS.map(({ slug }) => {
    const minutes = byS.get(slug) ?? 0;
    const target = targets[slug] ?? 0;
    const pace = (target * elapsed) / 7;
    return { subject: slug, minutes, target, behindBy: target > 0 ? Math.max(0, Math.round(pace - minutes)) : 0 };
  }).filter((r) => r.target > 0 || r.minutes > 0);
}

/** The subject most behind pace (at least 30 min), for a gentle nudge. */
export function mostBehind(rows: BalanceRow[]) {
  return [...rows].filter((r) => r.behindBy >= 30).sort((a, b) => b.behindBy - a.behindBy)[0] ?? null;
}
