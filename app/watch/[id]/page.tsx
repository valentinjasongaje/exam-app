import Link from "next/link";
import { notFound } from "next/navigation";
import { SkipForward } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMinutes, subjectName } from "@/lib/study-plan";
import { sectionLabel } from "@/lib/video-library";
import WatchCheckbox from "../../lessons/watch-checkbox";
import WatchNotes from "./watch-notes";
import WatchPlayer from "./watch-player";
import SpeedControl from "./speed-control";
import WatchStatus from "./watch-status";
import { bucketCount, countSet, decode } from "@/lib/watch-coverage";
import VideoQuestions from "./video-questions";
import { toClient } from "./question-types";
import { aiConfigured } from "@/lib/ai-explain";

/**
 * Plays a plan video from the user's Google Drive (Drive's own player, so it
 * works on any device signed in to that Google account) with the topic's
 * note open beside it. Phone: player sticks to the top, notes scroll below.
 */
export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const t = Number((await searchParams).t);
  const startAt = Number.isFinite(t) && t > 0 ? t : null;
  const session = await auth();
  const userId = session!.user.id;
  const video = await prisma.studyVideo.findFirst({ where: { id, userId } });
  if (!video) notFound();

  const topic = video.title.replace(/^\S+ \d+ · /, "");
  const [next, note, questions, markers] = await Promise.all([
    prisma.studyVideo.findFirst({
      where: { userId, section: video.section, driveFileId: { not: null }, order: { gt: video.order }, id: { not: video.id } },
      orderBy: { order: "asc" },
    }),
    prisma.studyNote.findFirst({
      where: { userId, subject: video.subject, topic: { equals: topic, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      include: { cards: { orderBy: { order: "asc" } } },
    }),
    prisma.videoQuestion.findMany({ where: { userId, videoId: video.id }, orderBy: [{ seconds: "asc" }, { createdAt: "asc" }] }),
    prisma.videoMarker.findMany({ where: { userId, videoId: video.id }, orderBy: { seconds: "asc" }, select: { id: true, seconds: true, label: true } }),
  ]);
  const done = video.watchedMinutes >= video.durationMinutes;
  const n = bucketCount(video.durationMinutes);
  const playedShare = video.watchedBuckets
    ? (countSet(decode(video.watchedBuckets, n), n) / n) * 100
    : (video.watchedMinutes / Math.max(1, video.durationMinutes)) * 100;

  // One grid holds title, player, controls and notes so the player can stay
  // pinned at the top on phones while you scroll down to type notes (a sticky
  // element only sticks within its parent). On large screens: player and
  // controls on the left, notes on the right.
  return (
    <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="mb-3 min-w-0 lg:col-start-1 lg:row-start-1">
        <Link href="/lessons" className="text-sm text-ink-muted hover:text-ink">← Video checklist</Link>
        <p className="mt-2 text-xs font-medium tracking-wide text-accent uppercase">
          {subjectName(video.subject)} · {sectionLabel(video.section)}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold">{video.title}</h1>
        <p className="text-sm text-ink-muted">{formatMinutes(video.durationMinutes)}</p>
      </div>

      <div className="sticky top-16 z-20 -mx-4 min-w-0 bg-black sm:mx-0 sm:rounded-xl lg:static lg:col-start-1 lg:row-start-2 lg:self-start lg:overflow-hidden">
        {video.driveFileId ? (
          <WatchPlayer
            videoId={video.id}
            fileId={video.driveFileId}
            title={video.title}
            startAt={startAt}
            initialShare={Math.min(100, playedShare)}
            initialCompleted={done}
          />
        ) : (
          <div className="bg-bg-muted p-8 text-center text-sm text-ink-muted">
            This video isn&rsquo;t on Google Drive. Upload it from the video checklist.
          </div>
        )}
      </div>

      <div className="mb-6 min-w-0 lg:col-start-1 lg:row-start-3">
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <WatchCheckbox key={`${video.id}-${done}`} id={video.id} watched={done} label={video.title} />
            {done ? "Watched" : "Mark as watched"}
          </div>
          <WatchStatus />
          <SpeedControl />
          {next && (
            <Link href={`/watch/${next.id}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
              <SkipForward size={14} /> Next: {next.title}
            </Link>
          )}
        </div>
      </div>

      <aside className="rounded-xl border border-border bg-bg-elevated p-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
        <WatchNotes
          key={video.id}
          videoId={video.id}
          initialMarkers={markers}
          subject={video.subject}
          topic={topic}
          note={note ? { id: note.id, body: note.body, cards: note.cards } : null}
        />
        <div className="mt-5">
          <VideoQuestions key={`q-${video.id}`} videoId={video.id} initial={questions.map(toClient)} aiEnabled={aiConfigured()} />
        </div>
      </aside>
    </div>
  );
}
