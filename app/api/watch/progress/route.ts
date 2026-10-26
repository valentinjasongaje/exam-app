import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addAutoTime } from "@/lib/auto-log";
import { todayLocal } from "@/lib/study-plan";
import { AUTO_COMPLETE_SHARE, bucketCount, countSet, decode, encode, setBuckets } from "@/lib/watch-coverage";

/**
 * Heartbeat from the built-in player (every ~30 s while playing, and on
 * pause or leaving the page). Body: { videoId, buckets: number[] (10-second
 * stretches played since the last beat), played: seconds of real time spent
 * playing }. Updates the video's progress (auto-marks it watched at 90%)
 * and today's study log.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const userId = session.user.id;

  const body = (await req.json().catch(() => ({}))) as { videoId?: string; buckets?: unknown; played?: unknown };
  const video = await prisma.studyVideo.findFirst({ where: { id: String(body.videoId ?? ""), userId } });
  if (!video) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  const n = bucketCount(video.durationMinutes);
  const bits = decode(video.watchedBuckets, n);
  const indices = Array.isArray(body.buckets) ? body.buckets.slice(0, 2000).map(Number) : [];
  setBuckets(bits, indices, n);
  const share = countSet(bits, n) / n;
  const coveredMinutes = Math.round((share * n * 10) / 60);
  const complete = share >= AUTO_COMPLETE_SHARE;
  const justCompleted = complete && !video.completedAt;

  await prisma.studyVideo.update({
    where: { id: video.id },
    data: {
      watchedBuckets: encode(bits),
      // Never lowers progress you set by hand; completes at 90% played.
      watchedMinutes: complete ? video.durationMinutes : Math.max(video.watchedMinutes, Math.min(video.durationMinutes, coveredMinutes)),
      completedAt: complete ? (video.completedAt ?? new Date()) : video.completedAt,
    },
  });

  // At most 2 minutes of real time per beat (beats come every ~30 s).
  const played = Math.min(120, Math.max(0, Number(body.played) || 0));
  if (played >= 1) {
    await addAutoTime({
      userId,
      key: `${todayLocal()}:video:${video.id}`,
      subject: video.subject,
      activity: "VIDEO",
      seconds: played,
      note: video.title,
    });
  }

  return NextResponse.json(
    { share: Math.round(share * 1000) / 10, completed: complete || !!video.completedAt, justCompleted },
    { headers: { "Cache-Control": "no-store" } }
  );
}
