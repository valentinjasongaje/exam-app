import Link from "next/link";
import { ExternalLink, PlayCircle, Trash2 } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TRACKER_SUBJECTS, formatMinutes } from "@/lib/study-plan";
import { SECTIONS, WATCH_PLAN, sectionLabel } from "@/lib/video-library";
import { PageHeader, Card, Badge, Button } from "@/components/ui";
import ProgressBar from "../progress-bar";
import { AddVideoForm } from "../add-item-form";
import { deleteVideoAction, importWatchPlanAction, updateVideoProgressAction } from "../actions";
import CopyPath from "./copy-path";

const REQUIRED = SECTIONS.filter((s) => s.required).map((s) => s.key);

function hm(min: number) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export default async function VideosPage() {
  const session = await auth();
  const userId = session!.user.id;

  const videos = await prisma.studyVideo.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const imported = new Set(videos.map((v) => v.section).filter(Boolean));
  const missingRequired = REQUIRED.filter((s) => !imported.has(s));
  const planMinutes = (keys: string[]) =>
    WATCH_PLAN.filter((v) => keys.includes(v.section)).reduce((sum, v) => sum + v.minutes, 0);

  // Headline = the content pass (core + Math basics + anything added by hand).
  // Phase 2 refreshers and optional basics have their own section totals.
  const counted = videos.filter((v) => v.section !== "optional-basics" && v.section !== "refresher");
  const queue = videos.filter((v) => v.section !== "optional-basics");
  const total = counted.reduce((sum, v) => sum + v.durationMinutes, 0);
  const watched = counted.reduce((sum, v) => sum + v.watchedMinutes, 0);
  const left = total - watched;

  // Next unwatched video per subject, following the plan order.
  const upNext = TRACKER_SUBJECTS.map((s) => ({
    subject: s,
    video: queue.find((v) => v.subject === s.slug && v.watchedMinutes < v.durationMinutes),
  })).filter((x) => x.video);

  const groups = [
    ...SECTIONS.map((s) => ({ key: s.key as string | null, label: s.label, hint: s.hint })),
    { key: null, label: "Added by you", hint: "" },
  ]
    .map((g) => ({ ...g, items: videos.filter((v) => (v.section ?? null) === g.key) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Study tracker"
        title="Review videos"
        subtitle={
          counted.length
            ? `Content pass: ${formatMinutes(watched)} of ${formatMinutes(total)} watched · ${formatMinutes(left)} left (${formatMinutes(Math.round(left / 1.5))} at 1.5x).`
            : "Your review videos, measured from your drive: one recording per topic."
        }
        action={
          <Link href="/tracker/library" className="text-sm text-accent hover:underline">
            See every batch in the Library →
          </Link>
        }
      />

      {missingRequired.length > 0 && (
        <Card className="mb-8 border-accent/40 bg-accent-soft/40">
          <h2 className="font-semibold">Add your watch plan</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {WATCH_PLAN.filter((v) => missingRequired.includes(v.section)).length} videos,{" "}
            {formatMinutes(planMinutes(missingRequired))} ({formatMinutes(Math.round(planMinutes(missingRequired) / 1.5))} at 1.5x):
            the Oct 2024 core lectures, Math basics and Phase 2 refreshers. Picked from 2,006 files on your G: drive so
            each topic appears once.
          </p>
          <form action={importWatchPlanAction} className="mt-4">
            <input type="hidden" name="sections" value={missingRequired.join(",")} />
            <Button type="submit">Add watch plan</Button>
          </form>
        </Card>
      )}

      {upNext.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">Up next</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {upNext.map(({ subject, video }) => (
              <Card key={subject.slug} className="flex items-start gap-3 p-4">
                <PlayCircle size={20} className="mt-0.5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-muted">{subject.name}</p>
                  <p className="truncate font-medium">{video!.title}</p>
                  <p className="text-xs text-ink-muted tabular-nums">
                    {video!.watchedMinutes > 0 ? `${hm(video!.watchedMinutes)} of ` : ""}
                    {formatMinutes(video!.durationMinutes)}
                  </p>
                </div>
                {video!.localPath && <CopyPath path={video!.localPath} label="Path" />}
              </Card>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Paste the path into File Explorer&rsquo;s address bar or your video player. Logging a &ldquo;Video&rdquo; session on
            the Overview tab adds the time to the video you pick.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-10">
        {groups.map((g) => {
          const gTotal = g.items.reduce((s, v) => s + v.durationMinutes, 0);
          const gWatched = g.items.reduce((s, v) => s + v.watchedMinutes, 0);
          return (
            <section key={g.label}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{g.label}</h2>
                <span className="text-sm tabular-nums text-ink-muted">
                  {formatMinutes(gWatched)} / {formatMinutes(gTotal)}
                </span>
              </div>
              {g.hint && <p className="mb-3 text-sm text-ink-muted">{g.hint}</p>}
              <ProgressBar value={gWatched} max={Math.max(gTotal, 1)} tone="success" className="mb-4" />
              <div className="flex flex-col gap-4">
                {TRACKER_SUBJECTS.map((s) => {
                  const mine = g.items.filter((v) => v.subject === s.slug);
                  if (mine.length === 0) return null;
                  const done = mine.filter((v) => v.watchedMinutes >= v.durationMinutes).length;
                  return (
                    <details key={s.slug} className="group rounded-xl border border-border bg-bg-elevated" open={g.key === "core"}>
                      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-ink-muted tabular-nums">
                          {done}/{mine.length} watched · {formatMinutes(mine.reduce((x, v) => x + v.durationMinutes, 0))}
                        </span>
                      </summary>
                      <ul className="border-t border-border">
                        {mine.map((v) => (
                          <VideoRow key={v.id} v={v} />
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {imported.size > 0 && !imported.has("optional-basics") && (
        <Card className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">Basics if weak (optional)</p>
            <p className="text-ink-muted">
              30 pre-season Elex, EST and GEAS videos, {formatMinutes(planMinutes(["optional-basics"]))}. Not counted in your totals.
            </p>
          </div>
          <form action={importWatchPlanAction}>
            <input type="hidden" name="sections" value="optional-basics" />
            <Button type="submit" variant="secondary" size="sm">Add them</Button>
          </form>
        </Card>
      )}

      <Card className="mt-8">
        <h2 className="mb-4 text-sm font-medium text-ink-muted">Add another video</h2>
        <AddVideoForm subjects={TRACKER_SUBJECTS} />
      </Card>
    </>
  );
}

function VideoRow({
  v,
}: {
  v: {
    id: string;
    title: string;
    url: string | null;
    localPath: string | null;
    section: string | null;
    subject: string;
    durationMinutes: number;
    watchedMinutes: number;
  };
}) {
  const done = v.watchedMinutes >= v.durationMinutes;
  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {v.url ? (
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 text-sm font-medium hover:text-accent">
              <span className="truncate">{v.title}</span>
              <ExternalLink size={12} className="shrink-0 text-ink-faint" />
            </a>
          ) : (
            <span className={"truncate text-sm font-medium " + (done ? "text-ink-muted" : "")}>{v.title}</span>
          )}
          {done && <Badge tone="success">Watched</Badge>}
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <ProgressBar value={v.watchedMinutes} max={v.durationMinutes} tone={done ? "success" : "accent"} className="max-w-56" />
          <span className="shrink-0 text-xs tabular-nums text-ink-muted">
            {hm(v.watchedMinutes)} / {hm(v.durationMinutes)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {v.localPath && <CopyPath path={v.localPath} label="Path" />}
        <form action={updateVideoProgressAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={v.id} />
          <input
            key={v.watchedMinutes}
            name="watched"
            aria-label={`Watched up to, ${v.title}`}
            defaultValue={v.watchedMinutes && !done ? hm(v.watchedMinutes) : ""}
            placeholder="0:45"
            className="field w-16 px-2 py-1 text-xs"
          />
          <Button type="submit" name="intent" value="set" variant="ghost" size="sm" className="px-2">
            Save
          </Button>
          <Button type="submit" name="intent" value={done ? "reset" : "done"} variant="ghost" size="sm" className="px-2">
            {done ? "Reset" : "Done"}
          </Button>
        </form>
        <form action={deleteVideoAction}>
          <input type="hidden" name="id" value={v.id} />
          <button type="submit" title={`Remove from ${sectionLabel(v.section)}`} aria-label={`Remove ${v.title}`} className="rounded-md p-1.5 text-ink-faint opacity-60 hover:bg-danger-soft hover:text-danger hover:opacity-100">
            <Trash2 size={14} />
          </button>
        </form>
      </div>
    </li>
  );
}

