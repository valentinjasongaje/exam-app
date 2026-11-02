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
import SpeedControl, { SkipButtons } from "./speed-control";
import WatchStatus from "./watch-status";
import { bucketCount, countSet, decode } from "@/lib/watch-coverage";
import VideoQuestions from "./video-questions";
import { toClient } from "./question-types";
import { aiConfigured } from "@/lib/ai-explain";
import { sharedDriveFiles } from "@/lib/shared-videos";
import { partLabel, sameLecture, videoTopic } from "@/lib/video-parts";
import { clsx } from "clsx";

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
  // Admin plays their own uploads; everyone else plays the admin's (shared library).
  const isAdmin = session!.user.role === "ADMIN";
  const shared = await sharedDriveFiles();
  const fileFor = (v: { localPath: string | null; driveFileId: string | null }) =>
    (isAdmin ? v.driveFileId : null) ?? (v.localPath ? (shared.get(v.localPath) ?? null) : null);
  const fileId = fileFor(video);

  // A lecture is several videos (parts, versions). Notes, formulas, questions and markers belong to the lecture.
  const topic = videoTopic(video.title);
  const parts = await prisma.studyVideo.findMany({
    where: { userId, subject: video.subject, ...sameLecture(video.title) },
    orderBy: { order: "asc" },
    select: { id: true, title: true, order: true, localPath: true, driveFileId: true, watchedMinutes: true, durationMinutes: true },
  });
  const partInfo = new Map(parts.map((p, i) => [p.id, { label: partLabel(p.title), order: i }]));
  const here = partInfo.get(video.id) ?? { label: partLabel(video.title), order: 0 };
  const partIds = parts.length > 0 ? parts.map((p) => p.id) : [video.id];
  const [next, note, questions, allMarkers] = await Promise.all([
    // Next video in the same section that can be played.
    prisma.studyVideo
      .findMany({
        where: { userId, section: video.section, order: { gt: video.order }, id: { not: video.id } },
        orderBy: { order: "asc" },
        select: { id: true, title: true, localPath: true, driveFileId: true },
      })
      .then((rows) => rows.find((r) => fileFor(r)) ?? null),
    prisma.studyNote.findFirst({
      where: { userId, subject: video.subject, topic: { equals: topic, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      include: { cards: { orderBy: { order: "asc" } } },
    }),
    prisma.videoQuestion.findMany({ where: { userId, videoId: { in: partIds } }, orderBy: [{ seconds: "asc" }, { createdAt: "asc" }] }),
    prisma.videoMarker.findMany({ where: { userId, videoId: { in: partIds } }, orderBy: { seconds: "asc" }, select: { id: true, videoId: true, seconds: true, label: true } }),
  ]);
  const markers = allMarkers.filter((m) => m.videoId === video.id).map(({ id, seconds, label }) => ({ id, seconds, label }));
  const otherMarkers = allMarkers
    .filter((m) => m.videoId !== video.id)
    .map((m) => ({ ...m, part: partInfo.get(m.videoId)?.label ?? "Other part", order: partInfo.get(m.videoId)?.order ?? 0 }))
    .sort((a, b) => a.order - b.order || a.seconds - b.seconds);
  const sharedQuestions = questions
    .map((q) => ({ ...toClient(q), partLabel: partInfo.get(q.videoId)?.label ?? null, partOrder: partInfo.get(q.videoId)?.order ?? 0 }))
    .sort((a, b) => a.partOrder - b.partOrder || (a.seconds ?? 1e9) - (b.seconds ?? 1e9));
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
    <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="mb-3 min-w-0 lg:col-start-1 lg:row-start-1">
        <Link href="/lessons" className="text-sm text-ink-muted hover:text-ink">← Video checklist</Link>
        <p className="mt-2 text-xs font-medium tracking-wide text-accent uppercase">
          {subjectName(video.subject)} · {sectionLabel(video.section)}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold">{video.title}</h1>
        <p className="text-sm text-ink-muted">{formatMinutes(video.durationMinutes)}</p>
      </div>

      <div className="sticky top-16 z-20 -mx-4 min-w-0 bg-black max-lg:[@media(max-height:600px)]:static sm:mx-0 sm:rounded-xl lg:static lg:col-start-1 lg:row-start-2 lg:self-start lg:overflow-hidden">
        {fileId ? (
          <WatchPlayer
            videoId={video.id}
            fileId={fileId}
            title={video.title}
            startAt={startAt}
            initialShare={Math.min(100, playedShare)}
            initialCompleted={done}
          />
        ) : (
          <div className="bg-bg-muted p-8 text-center text-sm text-ink-muted">
            This video isn&rsquo;t available yet.
          </div>
        )}
      </div>

      <div className="mb-6 min-w-0 lg:col-start-1 lg:row-start-3">
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <WatchCheckbox key={`${video.id}-${done}`} id={video.id} watched={done} label={video.title} />
            {done ? "Watched" : "Mark as watched"}
          </div>
          <SkipButtons />
          <SpeedControl />
          <WatchStatus />
          {next && (
            <Link href={`/watch/${next.id}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
              <SkipForward size={14} /> Next: {next.title}
            </Link>
          )}
        </div>

        {parts.length > 1 && (
          <nav aria-label="Parts of this lecture" className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-ink-muted">All parts of this lecture</p>
            <div className="flex flex-wrap gap-1.5">
              {parts.map((p) => {
                const current = p.id === video.id;
                const watched = p.watchedMinutes >= p.durationMinutes;
                const playable = !!fileFor(p);
                return (
                  <Link
                    key={p.id}
                    href={`/watch/${p.id}`}
                    aria-current={current ? "page" : undefined}
                    title={playable ? undefined : "Not uploaded yet"}
                    className={clsx(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      current
                        ? "border-accent bg-accent text-accent-ink"
                        : watched
                          ? "border-success/40 bg-success-soft/50 text-ink-muted hover:border-accent"
                          : "border-border-strong text-ink hover:border-accent",
                      !playable && !current && "opacity-50"
                    )}
                  >
                    {partLabel(p.title) ?? p.title}
                    {watched && !current ? " ✓" : ""}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>

      <aside className="rounded-xl border border-border bg-bg-elevated p-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
        <WatchNotes
          key={video.id}
          videoId={video.id}
          initialMarkers={markers}
          otherMarkers={otherMarkers}
          subject={video.subject}
          topic={topic}
          note={note ? { id: note.id, body: note.body, cards: note.cards } : null}
        />
        <div className="mt-5">
          <VideoQuestions key={`q-${video.id}`} videoId={video.id} part={here} initial={sharedQuestions} aiEnabled={aiConfigured()} />
        </div>
      </aside>
    </div>
  );
}
