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
 * - `plan`: every recording in the Oct 2025 folder, one plan video per FILE:
 *   lectures are recorded in parts (and some in several versions), so one
 *   lecture is several plan videos that share a topic (lib/video-parts.ts).
 *   All refreshers are one section. Regenerate with
 *   `node scripts/build-video-plan.mjs` rather than editing the JSON.
 * - `library`: every batch/version of the older recordings, grouped by
 *   folder, for the Library page ("where else is this topic explained").
 */

// "calculator" is kept so rows saved under the earlier plan still type-check; the Oct 2025 plan has none.
export type PlanSection = "core" | "calculator" | "refresher";

export type PlanVideo = {
  section: PlanSection;
  subject: TrackerSubjectSlug;
  topicNo: number;
  title: string; // "Math 01 · Differential Calculus 1 — Part 3" (see lib/video-parts.ts)
  file: string;
  localPath: string;
  minutes: number;
  bytes: number; // file size, used to match and verify Drive uploads
  part?: number; // which part of the lecture this file is
  variant?: string; // which recording of it, when there are several: "V1", "V2", "Set 1", "ECE Math"
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
  { key: "core", label: "Review lectures", hint: "Oct 2025 review season, in parts. Lectures with more than one recording (V1, V2, …) list every version; the notes, formulas and questions are shared across a lecture's parts." },
  { key: "refresher", label: "Refreshers", hint: "Every refresher for all four subjects in one list, in parts, every version." },
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

/**
 * Short, stable id for a plan video, stored on its Google Drive copy
 * (appProperties.planKey) so "Sync with Drive" can match files back to the
 * plan. Drive limits each property to 124 bytes (key + value), and some
 * G:\ paths are longer than that, so the path itself can't be stored.
 */
export function planKey(localPath: string) {
  // FNV-1a 64-bit, hex: 16 characters, no imports, same result on server and client.
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  let h = BigInt("0xcbf29ce484222325");
  for (const b of new TextEncoder().encode(localPath)) {
    h ^= BigInt(b);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}
