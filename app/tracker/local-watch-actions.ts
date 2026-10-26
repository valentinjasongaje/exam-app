"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addAutoTime } from "@/lib/auto-log";
import { todayLocal } from "@/lib/study-plan";
import { WATCH_PLAN } from "@/lib/video-library";

/**
 * Logs watching a plan video in the laptop's own player (one tap from the
 * "You opened…" prompt): adds the minutes to today's log and to the video's
 * progress, and optionally marks it watched.
 */
export async function logLocalWatchAction(localPath: string, minutes: number, markWatched: boolean) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Not logged in." };
  const plan = WATCH_PLAN.findIndex((v) => v.localPath === localPath);
  if (plan < 0) return { error: "That video isn't in the plan." };
  const p = WATCH_PLAN[plan];
  const mins = Math.min(8 * 60, Math.max(1, Math.round(Number(minutes) || 0)));

  const video =
    (await prisma.studyVideo.findFirst({ where: { userId, localPath } })) ??
    (await prisma.studyVideo.create({
      data: { userId, subject: p.subject, title: p.title, section: p.section, localPath, durationMinutes: p.minutes, order: plan },
    }));
  const watched = markWatched ? video.durationMinutes : Math.min(video.durationMinutes, video.watchedMinutes + mins);
  await prisma.studyVideo.update({
    where: { id: video.id },
    data: {
      watchedMinutes: watched,
      completedAt: watched >= video.durationMinutes ? (video.completedAt ?? new Date()) : video.completedAt,
    },
  });
  await addAutoTime({
    userId,
    key: `${todayLocal()}:video:${video.id}`,
    subject: video.subject,
    activity: "VIDEO",
    seconds: mins * 60,
    note: video.title,
  });
  revalidatePath("/tracker", "layout");
  revalidatePath("/calendar");
  return { ok: true };
}
