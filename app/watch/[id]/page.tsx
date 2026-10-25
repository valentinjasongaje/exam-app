import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, SkipForward } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMinutes, subjectName } from "@/lib/study-plan";
import { sectionLabel } from "@/lib/video-library";
import WatchCheckbox from "../../tracker/videos/watch-checkbox";
import RemoveFromDrive from "./remove-button";
import WatchNotes from "./watch-notes";

/**
 * Plays a plan video from the user's Google Drive (Drive's own player, so it
 * works on any device signed in to that Google account) with the topic's
 * note open beside it. Phone: player sticks to the top, notes scroll below.
 */
export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;
  const video = await prisma.studyVideo.findFirst({ where: { id, userId } });
  if (!video) notFound();

  const topic = video.title.replace(/^\S+ \d+ · /, "");
  const [next, note] = await Promise.all([
    prisma.studyVideo.findFirst({
      where: { userId, section: video.section, driveFileId: { not: null }, order: { gt: video.order }, id: { not: video.id } },
      orderBy: { order: "asc" },
    }),
    prisma.studyNote.findFirst({
      where: { userId, subject: video.subject, topic: { equals: topic, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      include: { cards: { orderBy: { order: "asc" } } },
    }),
  ]);
  const done = video.watchedMinutes >= video.durationMinutes;

  // One grid holds title, player, controls and notes so the player can stay
  // pinned at the top on phones while you scroll down to type notes (a sticky
  // element only sticks within its parent). On large screens: player and
  // controls on the left, notes on the right.
  return (
    <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="mb-3 min-w-0 lg:col-start-1 lg:row-start-1">
        <Link href="/tracker/videos" className="text-sm text-ink-muted hover:text-ink">← Video checklist</Link>
        <p className="mt-2 text-xs font-medium tracking-wide text-accent uppercase">
          {subjectName(video.subject)} · {sectionLabel(video.section)}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold">{video.title}</h1>
        <p className="text-sm text-ink-muted">{formatMinutes(video.durationMinutes)}</p>
      </div>

      <div className="sticky top-16 z-20 -mx-4 min-w-0 bg-black sm:mx-0 sm:rounded-xl lg:static lg:col-start-1 lg:row-start-2 lg:self-start lg:overflow-hidden">
        {video.driveFileId ? (
          <div className="relative aspect-video w-full">
            <iframe
              src={`https://drive.google.com/file/d/${video.driveFileId}/preview`}
              title={video.title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        ) : (
          <div className="bg-bg-muted p-8 text-center text-sm text-ink-muted">
            This video isn&rsquo;t on Google Drive. Upload it from the video checklist.
          </div>
        )}
      </div>

      <div className="mb-6 min-w-0 lg:col-start-1 lg:row-start-3">
        <p className="mt-2 text-xs text-ink-faint">
          Speed is in the player&rsquo;s ⚙ menu. Just uploaded? Drive may need a few minutes to process it. Not playing? Sign this
          browser in to the Google account the video was uploaded to.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <WatchCheckbox key={`${video.id}-${done}`} id={video.id} watched={done} label={video.title} />
            {done ? "Watched" : "Mark as watched"}
          </div>
          {next && (
            <Link href={`/watch/${next.id}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
              <SkipForward size={14} /> Next: {next.title}
            </Link>
          )}
          {video.driveFileId && (
            <a
              href={`https://drive.google.com/file/d/${video.driveFileId}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
            >
              <ExternalLink size={14} /> Open in Drive
            </a>
          )}
          {video.driveFileId && <RemoveFromDrive videoId={video.id} title={video.title} />}
        </div>
      </div>

      <aside className="rounded-xl border border-border bg-bg-elevated p-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
        <WatchNotes
          key={video.id}
          subject={video.subject}
          topic={topic}
          note={note ? { id: note.id, body: note.body, cards: note.cards } : null}
        />
      </aside>
    </div>
  );
}
