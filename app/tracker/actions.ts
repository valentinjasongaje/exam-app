"use server";

import { revalidatePath } from "next/cache";
import type { StudyActivity, TopicStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isTrackerSubject,
  isValidYmd,
  parseDuration,
  toDbDate,
  todayLocal,
} from "@/lib/study-plan";
import { reviewDates } from "@/lib/schedule";
import { WATCH_PLAN } from "@/lib/video-library";

export type FormState = { error: string | null; success?: boolean };

const ACTIVITIES: StudyActivity[] = ["VIDEO", "PROBLEMS", "QUIZ", "REVIEW"];
const STATUSES: TopicStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DONE", "NEEDS_REVIEW"];

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optInt(formData: FormData, key: string): number | null | "invalid" {
  const v = str(formData, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : "invalid";
}

function refresh() {
  revalidatePath("/tracker", "layout");
  revalidatePath("/lessons", "layout");
  revalidatePath("/calendar");
}

// ---------- study sessions ----------

export async function logSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };

  const date = str(formData, "date") || todayLocal();
  const subject = str(formData, "subject");
  const activity = str(formData, "activity") as StudyActivity;
  const minutes = parseDuration(str(formData, "duration"));
  const note = str(formData, "note") || null;
  const videoId = str(formData, "videoId") || null;

  if (!isValidYmd(date)) return { error: "Pick a valid date." };
  if (date > todayLocal()) return { error: "That date is in the future." };
  if (!isTrackerSubject(subject)) return { error: "Pick a subject." };
  if (!ACTIVITIES.includes(activity)) return { error: "Pick an activity." };
  if (!minutes || minutes <= 0 || minutes > 16 * 60)
    return { error: "Enter how long you studied, e.g. 90, 1:30 or 1h30." };

  let score: number | null = null;
  let total: number | null = null;
  if (activity === "QUIZ") {
    const s = optInt(formData, "score");
    const t = optInt(formData, "total");
    if (s === "invalid" || t === "invalid") return { error: "Score must be whole numbers." };
    if ((s === null) !== (t === null)) return { error: "Enter both the score and the number of items." };
    if (s !== null && t !== null && (t === 0 || s > t))
      return { error: "Score can't be more than the number of items." };
    score = s;
    total = t;
  }

  await prisma.$transaction(async (tx) => {
    await tx.studySession.create({
      data: { userId, date: toDbDate(date), subject, activity, minutes, score, total, note },
    });

    // Watching a saved video also advances that video's progress.
    if (activity === "VIDEO" && videoId) {
      const video = await tx.studyVideo.findFirst({ where: { id: videoId, userId } });
      if (video) {
        const watched = Math.min(video.durationMinutes, video.watchedMinutes + minutes);
        await tx.studyVideo.update({
          where: { id: video.id },
          data: {
            watchedMinutes: watched,
            completedAt:
              watched >= video.durationMinutes ? (video.completedAt ?? new Date()) : null,
          },
        });
      }
    }
  });

  refresh();
  return { error: null, success: true };
}

export async function deleteSessionAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.studySession.deleteMany({ where: { id: str(formData, "id"), userId } });
  refresh();
}

// ---------- topics ----------

export async function setTopicStatusAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  const status = str(formData, "status") as TopicStatus;
  if (!STATUSES.includes(status)) return;
  const id = str(formData, "id");
  const topic = await prisma.studyTopic.findFirst({ where: { id, userId } });
  if (!topic || topic.status === status) return;

  // Re-plan spaced reviews: any change replaces the pending ones; Done and
  // Needs review schedule a fresh sequence (see REVIEW_INTERVALS).
  const reviews =
    status === "DONE" || status === "NEEDS_REVIEW" ? reviewDates(todayLocal(), status) : [];

  await prisma.$transaction([
    prisma.studyTopic.update({
      where: { id },
      data: {
        status,
        completedAt: status === "DONE" ? (topic.completedAt ?? new Date()) : null,
      },
    }),
    prisma.reviewReminder.deleteMany({ where: { topicId: id, userId, doneAt: null } }),
    prisma.reviewReminder.createMany({
      data: reviews.map((r) => ({ userId, topicId: id, step: r.step, dueDate: toDbDate(r.dueDate) })),
    }),
  ]);
  refresh();
}

export async function addTopicAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };
  const subject = str(formData, "subject");
  const name = str(formData, "name");
  if (!isTrackerSubject(subject)) return { error: "Pick a subject." };
  if (!name) return { error: "Enter a topic name." };
  if (name.length > 200) return { error: "Keep the topic name under 200 characters." };

  const last = await prisma.studyTopic.aggregate({
    where: { userId, subject },
    _max: { order: true },
  });
  await prisma.studyTopic.create({
    data: { userId, subject, name, order: (last._max.order ?? -1) + 1 },
  });
  refresh();
  return { error: null, success: true };
}

export async function deleteTopicAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.studyTopic.deleteMany({ where: { id: str(formData, "id"), userId } });
  refresh();
}

// ---------- videos ----------

export async function addVideoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };
  if ((await auth())?.user?.role !== "ADMIN") return { error: "Only the admin adds videos." };
  const subject = str(formData, "subject");
  const title = str(formData, "title");
  const url = str(formData, "url") || null;
  const duration = parseDuration(str(formData, "duration"));

  if (!isTrackerSubject(subject)) return { error: "Pick a subject." };
  if (!title) return { error: "Enter the video title." };
  if (!duration || duration <= 0) return { error: "Enter the video length, e.g. 45, 1:20 or 2h." };
  if (url && !/^https?:\/\//i.test(url)) return { error: "The link should start with http:// or https://." };

  const last = await prisma.studyVideo.aggregate({ where: { userId }, _max: { order: true } });
  await prisma.studyVideo.create({
    data: { userId, subject, title, url, durationMinutes: duration, order: (last._max.order ?? -1) + 1 },
  });
  refresh();
  return { error: null, success: true };
}

export async function updateVideoProgressAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  const id = str(formData, "id");
  const video = await prisma.studyVideo.findFirst({ where: { id, userId } });
  if (!video) return;

  const intent = str(formData, "intent");
  let watched = video.watchedMinutes;
  if (intent === "done") watched = video.durationMinutes;
  else if (intent === "reset") watched = 0;
  else {
    const parsed = parseDuration(str(formData, "watched"));
    if (parsed === null) return;
    watched = Math.min(video.durationMinutes, Math.max(0, parsed));
  }

  await prisma.studyVideo.update({
    where: { id },
    data: {
      watchedMinutes: watched,
      completedAt: watched >= video.durationMinutes ? (video.completedAt ?? new Date()) : null,
    },
  });
  refresh();
}

/**
 * Brings the user's videos in line with the measured watch plan
 * (lib/video-library.ts): adds missing plan videos, updates the section of
 * ones already imported, and removes imported plan videos that are no longer
 * in the plan (e.g. the pre-season basics dropped on 2026-10-25). Videos the
 * user added by hand (section null) are never touched. Keyed by localPath,
 * so pressing it twice is harmless and watched progress is kept.
 */
export async function syncWatchPlanAction() {
  const userId = await requireUserId();
  if (!userId) return;
  const byPath = new Map(WATCH_PLAN.map((v, i) => [v.localPath, { ...v, order: i }]));

  const existing = await prisma.studyVideo.findMany({
    where: { userId, OR: [{ section: { not: null } }, { localPath: { not: null } }] },
    select: { id: true, localPath: true, section: true, order: true },
  });
  const have = new Set(existing.map((e) => e.localPath));

  await prisma.$transaction([
    prisma.studyVideo.deleteMany({
      where: {
        userId,
        id: { in: existing.filter((e) => e.section && (!e.localPath || !byPath.has(e.localPath))).map((e) => e.id) },
      },
    }),
    ...existing
      .filter((e) => e.localPath && byPath.has(e.localPath))
      .filter((e) => {
        const p = byPath.get(e.localPath!)!;
        return e.section !== p.section || e.order !== p.order;
      })
      .map((e) => {
        const p = byPath.get(e.localPath!)!;
        return prisma.studyVideo.update({ where: { id: e.id }, data: { section: p.section, order: p.order, title: p.title } });
      }),
    prisma.studyVideo.createMany({
      data: [...byPath.values()]
        .filter((v) => !have.has(v.localPath))
        .map((v) => ({
          userId,
          subject: v.subject,
          title: v.title,
          section: v.section,
          localPath: v.localPath,
          durationMinutes: v.minutes,
          order: v.order,
        })),
    }),
  ]);
  refresh();
}

/**
 * Checklist tick for one video. Plan videos are identified by `localPath`
 * and created on first tick, so the checklist works before the plan is
 * imported. Hand-added videos are identified by `id`.
 */
export async function setWatchedAction(input: { localPath?: string; id?: string; watched: boolean }) {
  const userId = await requireUserId();
  if (!userId) return;

  let video = input.id
    ? await prisma.studyVideo.findFirst({ where: { id: input.id, userId } })
    : input.localPath
      ? await prisma.studyVideo.findFirst({ where: { userId, localPath: input.localPath } })
      : null;

  if (!video && input.localPath) {
    const order = WATCH_PLAN.findIndex((v) => v.localPath === input.localPath);
    if (order < 0) return;
    const p = WATCH_PLAN[order];
    video = await prisma.studyVideo.create({
      data: {
        userId,
        subject: p.subject,
        title: p.title,
        section: p.section,
        localPath: p.localPath,
        durationMinutes: p.minutes,
        order,
      },
    });
  }
  if (!video) return;

  await prisma.studyVideo.update({
    where: { id: video.id },
    data: input.watched
      ? { watchedMinutes: video.durationMinutes, completedAt: video.completedAt ?? new Date() }
      : { watchedMinutes: 0, completedAt: null },
  });
  refresh();
}

export async function deleteVideoAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.studyVideo.deleteMany({ where: { id: str(formData, "id"), userId } });
  refresh();
}
