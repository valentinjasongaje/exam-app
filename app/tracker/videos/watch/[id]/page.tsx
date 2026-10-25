import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, NotebookPen, SkipForward } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMinutes, subjectName } from "@/lib/study-plan";
import { sectionLabel } from "@/lib/video-library";
import WatchCheckbox from "../../watch-checkbox";
import RemoveFromDrive from "./remove-button";

/**
 * Plays a plan video from the user's Google Drive using Drive's own player,
 * so it works on a phone or any computer. The file is private: it plays for
 * whoever is signed in to that Google account in this browser.
 */
export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;
  const video = await prisma.studyVideo.findFirst({ where: { id, userId } });
  if (!video) notFound();

  const done = video.watchedMinutes >= video.durationMinutes;
  const next = await prisma.studyVideo.findFirst({
    where: {
      userId,
      section: video.section,
      driveFileId: { not: null },
      order: { gt: video.order },
      id: { not: video.id },
    },
    orderBy: { order: "asc" },
  });
  const topic = video.title.replace(/^\S+ \d+ · /, "");

  return (
    <>
      <Link href="/tracker/videos" className="text-sm text-ink-muted hover:text-ink">← Video checklist</Link>
      <div className="mt-3 mb-4">
        <p className="text-xs font-medium tracking-wide text-accent uppercase">
          {subjectName(video.subject)} · {sectionLabel(video.section)}
        </p>
        <h1 className="mt-1 text-xl font-semibold">{video.title}</h1>
        <p className="text-sm text-ink-muted">{formatMinutes(video.durationMinutes)}</p>
      </div>

      {video.driveFileId ? (
        <div className="-mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-xl">
          <div className="relative aspect-video w-full">
            <iframe
              src={`https://drive.google.com/file/d/${video.driveFileId}/preview`}
              title={video.title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-ink-muted">
          This video isn&rsquo;t on Google Drive. Upload it from the video checklist.
        </div>
      )}

      <p className="mt-2 text-xs text-ink-faint">
        Speed is in the player&rsquo;s ⚙ menu. If it says it&rsquo;s still processing, Drive needs a few minutes after an upload.
        Not playing? Make sure this browser is signed in to the Google account the video was uploaded to.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <WatchCheckbox key={`${video.id}-${done}`} id={video.id} watched={done} label={video.title} />
          {done ? "Watched" : "Mark as watched"}
        </label>
        <Link href={`/notes/new?subject=${video.subject}&topic=${encodeURIComponent(topic)}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <NotebookPen size={14} /> Take notes on this topic
        </Link>
        {next && (
          <Link href={`/tracker/videos/watch/${next.id}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
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
    </>
  );
}
