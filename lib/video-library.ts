import data from "./video-library.json";
import type { TrackerSubjectSlug } from "./study-plan";

/**
 * The user's review-video library on their G:\ drive, measured on
 * 2026-10-25 (lengths read from every .mp4). Generated from that catalog —
 * see CONTEXT.md "Video library". Nothing here is read from the drive at
 * runtime; the app only knows file paths and lengths.
 *
 * - `plan`: one recording per topic (Oct 2024 batch, Version 1), the videos
 *   that get imported into the Videos tab.
 * - `library`: every batch/version of every topic, grouped by folder, for
 *   the Library page ("where else is this topic explained").
 */

export type PlanSection = "core" | "math-basics" | "refresher" | "optional-basics";

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

export const LIBRARY_STATS = data.stats as {
  files: number;
  totalMinutes: number;
  copyFiles: number;
  copyMinutes: number;
  measuredOn: string;
};

export const WATCH_PLAN = data.plan as PlanVideo[];
export const LIBRARY = data.library as LibraryGroup[];

export const SECTIONS: { key: PlanSection; label: string; hint: string; required: boolean }[] = [
  { key: "core", label: "Core lectures", hint: "Content pass, Oct 26 – early January. Oct 2024 batch, Version 1.", required: true },
  { key: "math-basics", label: "Math basics", hint: "The Oct 2024 Math lectures start at calculus; these cover the algebra and geometry side.", required: true },
  { key: "refresher", label: "Phase 2 refreshers", hint: "January–February: problem-solving refreshers and calculator techniques.", required: true },
  { key: "optional-basics", label: "Basics if weak", hint: "Pre-season Elex, EST and GEAS. Watch only the topics that feel rusty.", required: false },
];

export const BATCH_ORDER = [
  "Oct 2024 batch",
  "Excel Review Center set",
  "2023 batch",
  "Video Tutorial batch",
  "Short clips & consultations",
];

export function sectionLabel(key: string | null) {
  return SECTIONS.find((s) => s.key === key)?.label ?? "Added by you";
}
