import data from "./video-library.json";
import type { TrackerSubjectSlug } from "./study-plan";

/**
 * The user's review-video library on their G:\ drive, measured on
 * 2026-10-25 (lengths read from every .mp4). Generated from that catalog —
 * see CONTEXT.md "Video library". Nothing here is read from the drive at
 * runtime; the app only knows file paths and lengths.
 *
 * Scope is only the Review lectures, Refreshers and Calculator techniques —
 * pre-season basics, short clips and consultations are deliberately left out.
 *
 * - `plan`: one recording per topic (Oct 2024 batch, Version 1), the videos
 *   that get imported into the Videos tab.
 * - `library`: every batch/version of those videos, grouped by folder, for
 *   the Library page ("where else is this topic explained").
 */

export type PlanSection = "core" | "calculator" | "refresher";

export type PlanVideo = {
  section: PlanSection;
  subject: TrackerSubjectSlug;
  topicNo: number;
  title: string;
  file: string;
  localPath: string;
  minutes: number;
};

export type LibraryGroup = {
  subject: TrackerSubjectSlug;
  category: string;
  batch: string;
  topicNo: number;
  version: string;
  topic: string;
  folder: string;
  minutes: number;
  videos: number;
};

/** Review lectures, refreshers and calculator techniques only (exact copies removed). */
export const LIBRARY_STATS = data.stats as {
  files: number;
  totalMinutes: number;
  byCategory: Record<"Main lecture" | "Refresher" | "Calculator technique", number>;
  measuredOn: string;
};

export const WATCH_PLAN = data.plan as PlanVideo[];
export const LIBRARY = data.library as LibraryGroup[];

export const SECTIONS: { key: PlanSection; label: string; hint: string }[] = [
  { key: "core", label: "Review lectures", hint: "Content pass, Oct 26 – early January. Oct 2024 review season, Version 1." },
  { key: "calculator", label: "Calculator techniques", hint: "Canon F-789SGA lecture, then the three calculator-technique refreshers." },
  { key: "refresher", label: "Refreshers", hint: "Phase 2 (January–February): Oct 2024 refresher season, Version 1." },
];

export const BATCH_ORDER = [
  "Oct 2024 batch",
  "Excel Review Center set",
  "2023 batch",
  "Video Tutorial batch",
];

export function sectionLabel(key: string | null) {
  return SECTIONS.find((s) => s.key === key)?.label ?? "Added by you";
}
