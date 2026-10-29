import Link from "next/link";
import { Cloud, Play, PlayCircle, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TRACKER_SUBJECTS, subjectName } from "@/lib/study-plan";
import { SECTIONS, WATCH_PLAN, type PlanSection } from "@/lib/video-library";
import { PageHeader, Card, Button } from "@/components/ui";
import ProgressBar from "../tracker/progress-bar";
import { AddVideoForm } from "../tracker/add-item-form";
import { deleteVideoAction, syncWatchPlanAction } from "../tracker/actions";
import CopyPath from "./copy-path";
import WatchCheckbox from "./watch-checkbox";
import OpenVideo from "./open-video";
import DrivePanel from "./drive-panel";
import {
  UploadErrors,
  UploadQueueProvider,
  UploadRowButton,
  VideoFolderBar,
} from "./upload-queue";
import { DriveError, accessTokenFor, storageQuota } from "@/lib/google-drive";
import { ensurePlanVideos, sharedDriveFiles } from "@/lib/shared-videos";

/**
 * Video checklist, modelled on the Watch Plan sheet of ECE_Review_Videos.xlsx:
 * one row per plan video with a watched box, length, 1.5x length and a
 * running total, plus watched/left totals per section. Rows come from the
 * plan (lib/video-library.ts) merged with the user's StudyVideo rows by
 * localPath, so ticking works before anything is imported. ▶ opens the file
 * through the ecevideo: handler (lib/video-opener.ts).
 */

function hm(min: number) {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "Asia/Manila",
});

type Row = {
  key: string;
  localPath?: string;
  id?: string;
  videoId?: string;
  driveFileId?: string | null;
  file?: string;
  bytes?: number;
  subject: string;
  title: string;
  minutes: number;
  watchedMinutes: number;
  completedAt: Date | null;
};

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; subject?: string; drive?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  const section: PlanSection = SECTIONS.some((s) => s.key === params.section)
    ? (params.section as PlanSection)
    : "core";
  const subject = TRACKER_SUBJECTS.some((s) => s.slug === params.subject)
    ? params.subject!
    : "all";

  // Only the admin uploads (their Drive is the shared library); everyone else just watches.
  const isAdmin = session!.user.role === "ADMIN";
  if (!isAdmin) await ensurePlanVideos(userId);
  const shared = isAdmin ? null : await sharedDriveFiles();

  const videos = await prisma.studyVideo.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const byPath = new Map(
    videos.filter((v) => v.localPath).map((v) => [v.localPath!, v]),
  );

  // Google Drive status (quota is best effort: a slow or failing Drive call shouldn't break the checklist).
  const driveConn = isAdmin
    ? await prisma.driveConnection.findUnique({ where: { userId } })
    : null;
  let quota: Awaited<ReturnType<typeof storageQuota>> | null = null;
  let quotaError: string | null = null;
  let driveConnected = !!driveConn;
  if (driveConn) {
    try {
      quota = await storageQuota((await accessTokenFor(userId)).token);
    } catch (e) {
      if (e instanceof DriveError && e.status === 401) driveConnected = false;
      else quotaError = "Couldn't read your Drive storage right now.";
    }
  }
  const onDrive = videos.filter((v) => v.driveFileId);
  const planBytes = new Map(WATCH_PLAN.map((p) => [p.localPath, p.bytes]));
  const planByPath = new Map(WATCH_PLAN.map((p) => [p.localPath, p]));

  const planRows = (key: PlanSection): Row[] =>
    WATCH_PLAN.filter((p) => p.section === key).map((p) => {
      const v = byPath.get(p.localPath);
      return {
        key: p.localPath,
        localPath: p.localPath,
        videoId: v?.id,
        driveFileId: shared
          ? (shared.get(p.localPath) ?? null)
          : (v?.driveFileId ?? null),
        file: p.file,
        bytes: p.bytes,
        subject: p.subject,
        title: p.title,
        minutes: p.minutes,
        watchedMinutes: v?.watchedMinutes ?? 0,
        completedAt: v?.completedAt ?? null,
      };
    });

  const handAdded: Row[] = videos
    .filter((v) => !v.section && !(v.localPath && planByPath.has(v.localPath)))
    .map((v) => ({
      key: v.id,
      id: v.id,
      subject: v.subject,
      title: v.title,
      minutes: v.durationMinutes,
      watchedMinutes: v.watchedMinutes,
      completedAt: v.completedAt,
    }));

  // Rows imported under the earlier plan (pre-season basics, old sections).
  const outOfDate = videos.filter(
    (v) =>
      v.section &&
      (!v.localPath || planByPath.get(v.localPath)?.section !== v.section),
  );

  const isDone = (r: Row) => r.watchedMinutes >= r.minutes;
  const summary = SECTIONS.map((s) => {
    const rows = planRows(s.key);
    const total = rows.reduce((x, r) => x + r.minutes, 0);
    const watched = rows.filter(isDone).reduce((x, r) => x + r.minutes, 0);
    return {
      ...s,
      count: rows.length,
      done: rows.filter(isDone).length,
      total,
      watched,
    };
  });

  const allRows = planRows(section);
  const rows =
    subject === "all" ? allRows : allRows.filter((r) => r.subject === subject);
  const withRunning = rows.map((r, i) => ({
    ...r,
    running: rows.slice(0, i + 1).reduce((x, y) => x + y.minutes / 1.5, 0),
  }));
  const shownTotal = rows.reduce((x, r) => x + r.minutes, 0);
  const shownWatched = rows.filter(isDone).reduce((x, r) => x + r.minutes, 0);
  const upNext = TRACKER_SUBJECTS.filter(
    (s) => subject === "all" || s.slug === subject,
  )
    .map((s) => ({
      s,
      r: allRows.find((r) => r.subject === s.slug && !isDone(r)),
    }))
    .filter((x) => x.r);

  const checklistTable = (canUpload: boolean) => (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-muted/50 text-left text-xs text-ink-muted">
            <th className="w-11 px-3 py-2.5 font-medium">✓</th>
            <th className="hidden w-8 py-2.5 font-medium sm:table-cell">#</th>
            <th className="px-2 py-2.5 font-medium">Video</th>
            <th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">
              Length
            </th>
            <th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">
              At 1.5x
            </th>
            <th className="hidden px-2 py-2.5 text-right font-medium md:table-cell">
              Running (1.5x)
            </th>
            <th className="hidden px-2 py-2.5 font-medium md:table-cell">
              Watched
            </th>
            <th className="w-10 px-2 py-2.5 sm:w-20" />
          </tr>
        </thead>
        <tbody>
          {withRunning.map((r, i) => {
            const done = isDone(r);
            return (
              <tr
                key={r.key}
                className={clsx(
                  "border-b border-border last:border-0",
                  done && "bg-success-soft/40",
                )}
              >
                <td className="px-3 py-2.5 align-middle">
                  <WatchCheckbox
                    key={`${r.key}-${done}`}
                    localPath={r.localPath}
                    watched={done}
                    label={r.title}
                  />
                </td>
                <td className="hidden py-2.5 text-xs text-ink-faint tabular-nums sm:table-cell">
                  {i + 1}
                </td>
                <td className="px-2 py-2.5">
                  {r.driveFileId && r.videoId ? (
                    <Link
                      href={`/watch/${r.videoId}`}
                      className={clsx(
                        "group inline-flex items-center gap-1.5 hover:underline",
                        done ? "text-ink-muted" : "text-ink",
                      )}
                    >
                      <Play
                        size={13}
                        className="shrink-0 fill-current text-accent transition-transform group-hover:scale-110"
                      />
                      {r.title}
                      <Cloud
                        size={13}
                        className="shrink-0 text-ink-faint"
                        aria-label="On Google Drive"
                      />
                    </Link>
                  ) : !isAdmin ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-ink-faint"
                      title="Not uploaded yet"
                    >
                      <Play size={13} className="shrink-0" />
                      {r.title}
                      <span className="rounded bg-bg-muted px-1.5 text-[10px] font-medium tracking-wide uppercase">
                        soon
                      </span>
                    </span>
                  ) : (
                    <OpenVideo
                      localPath={r.localPath!}
                      className={clsx(
                        "text-left",
                        done ? "text-ink-muted" : "text-ink",
                      )}
                    >
                      <span className="hover:underline">{r.title}</span>
                    </OpenVideo>
                  )}
                  <span className="block pl-5 text-xs text-ink-faint">
                    {subject === "all" &&
                      section !== "calculator" &&
                      subjectName(r.subject)}
                    <span className="sm:hidden">
                      {subject === "all" && section !== "calculator" && " · "}
                      {hm(r.minutes)}
                    </span>
                  </span>
                  {!done && r.watchedMinutes > 0 && (
                    <span className="block pl-5 text-xs text-accent">
                      {hm(r.watchedMinutes)} of {hm(r.minutes)} so far
                    </span>
                  )}
                </td>
                <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">
                  {hm(r.minutes)}
                </td>
                <td className="hidden px-2 py-2.5 text-right text-ink-muted tabular-nums sm:table-cell">
                  {hm(r.minutes / 1.5)}
                </td>
                <td className="hidden px-2 py-2.5 text-right text-ink-muted tabular-nums md:table-cell">
                  {hm(r.running)}
                </td>
                <td className="hidden px-2 py-2.5 text-xs text-ink-muted md:table-cell">
                  {done && r.completedAt ? dateFmt.format(r.completedAt) : ""}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="inline-flex items-center justify-end gap-0.5">
                    {canUpload &&
                    !r.driveFileId &&
                    r.localPath &&
                    r.file &&
                    r.bytes ? (
                      <UploadRowButton
                        target={{
                          localPath: r.localPath,
                          file: r.file,
                          bytes: r.bytes,
                        }}
                        title={r.title}
                      />
                    ) : null}
                    {isAdmin && r.localPath && (
                      <span className="hidden sm:inline-flex">
                        <CopyPath path={r.localPath} label="" />
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border-strong bg-bg-muted/50 text-sm font-medium">
            <td className="px-3 py-2.5" />
            <td className="hidden sm:table-cell" />
            <td className="px-2 py-2.5">
              {rows.filter(isDone).length} of {rows.length} watched
              <span className="block text-xs font-normal text-ink-muted">
                {hm(shownTotal - shownWatched)} left ·{" "}
                {hm((shownTotal - shownWatched) / 1.5)} at 1.5x
              </span>
            </td>
            <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">
              {hm(shownTotal)}
            </td>
            <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">
              {hm(shownTotal / 1.5)}
            </td>
            <td className="hidden md:table-cell" colSpan={2} />
            <td />
          </tr>
        </tfoot>
      </table>
    </Card>
  );

  const href = (sec: string, subj: string) =>
    `/lessons?section=${sec}${subj !== "all" ? `&subject=${subj}` : ""}`;
  const current = summary.find((s) => s.key === section)!;

  return (
    <>
      <PageHeader
        icon={PlayCircle}
        eyebrow="Lessons"
        title="Review videos"
        subtitle={
          isAdmin
            ? "Tap a video to watch it here: progress is tracked automatically and it's marked watched at 90%. Videos marked ☁ are on your Google Drive."
            : "Tap a video to watch it: progress is tracked automatically and it's marked watched at 90%."
        }
      />

      {isAdmin && outOfDate.length > 0 && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-accent/40 bg-accent-soft/40">
          <p className="text-sm">
            Some saved videos are from the earlier plan. Update to keep only
            review lectures, refreshers and calculator techniques; your ticks on
            the rest are kept.
          </p>
          <form action={syncWatchPlanAction}>
            <Button type="submit" size="sm">
              Update plan
            </Button>
          </form>
        </Card>
      )}

      {isAdmin && (
        <details className="mb-6 rounded-xl border border-border bg-bg-elevated text-sm">
          <summary className="cursor-pointer px-4 py-3">
            <span className="font-medium">Video not opening?</span>{" "}
            <span className="text-ink-muted">
              One-time setup on your laptop
            </span>
          </summary>
          <ol className="list-decimal space-y-1.5 border-t border-border py-3 pr-4 pl-9 text-ink-muted">
            <li>
              Open{" "}
              <span className="font-mono text-ink">G:\ECE Video Opener</span> in
              File Explorer.
            </li>
            <li>
              Double-click{" "}
              <span className="text-ink">Install video opener.bat</span>. If
              Windows warns about it, click{" "}
              <span className="text-ink">More info → Run anyway</span>.
            </li>
            <li>
              Back here, press ▶. The browser asks to open &ldquo;ECE Video
              Opener&rdquo;: tick <span className="text-ink">Always allow</span>{" "}
              and click <span className="text-ink">Open</span>.
            </li>
            <li>
              On a phone or another computer, ▶ won&rsquo;t work; use the folder
              icon to copy the path instead.
            </li>
          </ol>
        </details>
      )}

      {isAdmin && (
        <Card className="mb-6">
          <DrivePanel
            connected={driveConnected}
            email={driveConn?.googleEmail ?? null}
            quota={quota}
            quotaError={quotaError}
            onDriveCount={onDrive.length}
            onDriveBytes={onDrive.reduce(
              (s, v) => s + (planBytes.get(v.localPath ?? "") ?? 0),
              0,
            )}
            watchedOnDrive={
              onDrive.filter((v) => v.watchedMinutes >= v.durationMinutes)
                .length
            }
            status={params.drive ?? null}
            candidates={WATCH_PLAN.map((p) => {
              const v = byPath.get(p.localPath);
              return {
                localPath: p.localPath,
                file: p.file,
                title: p.title,
                bytes: p.bytes,
                onDrive: !!v?.driveFileId,
                watched: !!v && v.watchedMinutes >= v.durationMinutes,
              };
            })}
          />
        </Card>
      )}

      {/* Section summary, tap to switch */}
      <div className="stagger mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map((s) => (
          <Link
            key={s.key}
            href={href(s.key, subject)}
            className={clsx(
              "lift rounded-xl border bg-bg-elevated p-4",
              s.key === section
                ? "border-accent ring-1 ring-accent"
                : "border-border hover:border-border-strong",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">{s.label}</p>
              <p className="text-sm text-ink-muted tabular-nums">
                {s.done}/{s.count}
              </p>
            </div>
            <ProgressBar
              value={s.watched}
              max={Math.max(s.total, 1)}
              tone="success"
              className="mt-2.5"
            />
            <p className="mt-2 text-xs text-ink-muted tabular-nums">
              {hm(s.watched)} watched · {hm(s.total - s.watched)} left (
              {hm((s.total - s.watched) / 1.5)} at 1.5x)
            </p>
          </Link>
        ))}
      </div>

      <p className="mb-3 text-sm text-ink-muted">{current.hint}</p>

      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        {[{ slug: "all", name: "All" }, ...TRACKER_SUBJECTS].map((s) => {
          const n =
            s.slug === "all"
              ? allRows.length
              : allRows.filter((r) => r.subject === s.slug).length;
          if (n === 0) return null;
          return (
            <Link
              key={s.slug}
              href={href(section, s.slug)}
              className={clsx(
                "rounded-full border px-3 py-1 transition-colors",
                subject === s.slug
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border-strong text-ink-muted hover:text-ink",
              )}
            >
              {s.name}
            </Link>
          );
        })}
      </div>

      {upNext.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {upNext.map((x) =>
            x.r!.driveFileId && x.r!.videoId ? (
              <Link
                key={x.s.slug}
                href={`/watch/${x.r!.videoId}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft/40 px-3 py-1.5 text-sm text-ink hover:border-accent"
              >
                <Play size={14} className="shrink-0 fill-current text-accent" />
                <span className="text-ink-muted">Next:</span> {x.r!.title}
              </Link>
            ) : !isAdmin ? null : (
              <OpenVideo
                key={x.s.slug}
                localPath={x.r!.localPath!}
                className="rounded-full border border-accent/40 bg-accent-soft/40 px-3 py-1.5 text-sm text-ink hover:border-accent"
              >
                <span className="text-ink-muted">Next:</span> {x.r!.title}
              </OpenVideo>
            ),
          )}
        </div>
      )}

      {driveConnected ? (
        <UploadQueueProvider freeBytes={quota?.free ?? null}>
          <VideoFolderBar
            pending={rows
              .filter((r) => !r.driveFileId && r.localPath && r.file && r.bytes)
              .map((r) => ({
                localPath: r.localPath!,
                file: r.file!,
                bytes: r.bytes!,
              }))}
          />
          {checklistTable(true)}
          <UploadErrors />
        </UploadQueueProvider>
      ) : (
        checklistTable(false)
      )}
      {isAdmin && (
        <p className="mt-2 text-xs text-ink-faint">
          The folder icon copies the video&rsquo;s location on your G: drive.
          Logging a &ldquo;Video&rdquo; session on the Overview tab also counts
          toward the video you pick.
        </p>
      )}

      {handAdded.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Added by you</h2>
          <Card className="p-0">
            <ul>
              {handAdded.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-0"
                >
                  <WatchCheckbox
                    key={`${r.key}-${isDone(r)}`}
                    id={r.id}
                    watched={isDone(r)}
                    label={r.title}
                  />
                  <span className="min-w-0 flex-1">
                    {r.title}{" "}
                    <span className="text-xs text-ink-faint">
                      · {subjectName(r.subject)}
                    </span>
                  </span>
                  <span className="tabular-nums text-ink-muted">
                    {hm(r.minutes)}
                  </span>
                  <form action={deleteVideoAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      aria-label={`Delete ${r.title}`}
                      className="rounded-md p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {isAdmin && (
        <details className="mt-8 rounded-xl border border-border bg-bg-elevated">
          <summary className="cursor-pointer px-4 py-3 text-sm text-ink-muted">
            Add a video that isn&rsquo;t on the list
          </summary>
          <div className="border-t border-border p-4">
            <AddVideoForm subjects={TRACKER_SUBJECTS} />
          </div>
        </details>
      )}
    </>
  );
}
