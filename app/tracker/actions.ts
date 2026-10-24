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
  const subject = str(formData, "subject");
  const title = str(formData, "title");
  const url = str(formData, "url") || null;
  const duration = parseDuration(str(formData, "duration"));

  if (!isTrackerSubject(subject)) return { error: "Pick a subject." };
  if (!title) return { error: "Enter the video title." };
  if (!duration || duration <= 0) return { error: "Enter the video length, e.g. 45, 1:20 or 2h." };
  if (url && !/^https?:\/\//i.test(url)) return { error: "The link should start with http:// or https://." };

  const last = await prisma.studyVideo.aggregate({ where: { userId, subject }, _max: { order: true } });
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

export async function deleteVideoAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.studyVideo.deleteMany({ where: { id: str(formData, "id"), userId } });
  refresh();
}
