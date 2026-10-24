import { ExternalLink, Trash2 } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TRACKER_SUBJECTS, formatMinutes } from "@/lib/study-plan";
import { PageHeader, Card, Badge, EmptyState, Button } from "@/components/ui";
import ProgressBar from "../progress-bar";
import { AddVideoForm } from "../add-item-form";
import { deleteVideoAction, updateVideoProgressAction } from "../actions";

export default async function VideosPage() {
  const session = await auth();
  const userId = session!.user.id;

  const videos = await prisma.studyVideo.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const total = videos.reduce((sum, v) => sum + v.durationMinutes, 0);
  const watched = videos.reduce((sum, v) => sum + v.watchedMinutes, 0);

  return (
    <>
      <PageHeader
        eyebrow="Study tracker"
        title="Review videos"
        subtitle={
          videos.length
            ? `${formatMinutes(watched)} of ${formatMinutes(total)} watched · ${formatMinutes(total - watched)} left.`
            : "Add your saved review videos to see how much is left per subject."
        }
      />

      <Card className="mb-8">
        <h2 className="mb-4 text-sm font-medium text-ink-muted">Add a video</h2>
        <AddVideoForm subjects={TRACKER_SUBJECTS} />
      </Card>

      {videos.length === 0 ? (
        <EmptyState>
          No videos yet. Tip: logging a &ldquo;Video&rdquo; session on the Overview tab adds the time to
          the video you pick.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {TRACKER_SUBJECTS.map((s) => {
            const mine = videos.filter((v) => v.subject === s.slug);
            if (mine.length === 0) return null;
            const subTotal = mine.reduce((sum, v) => sum + v.durationMinutes, 0);
            const subWatched = mine.reduce((sum, v) => sum + v.watchedMinutes, 0);
            return (
              <section key={s.slug}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-sm font-medium tracking-wide text-ink-muted uppercase">{s.name}</h2>
                  <span className="text-sm tabular-nums text-ink-muted">
                    {formatMinutes(subWatched)} / {formatMinutes(subTotal)}
                  </span>
                </div>
                <Card className="p-0">
                  <ul>
                    {mine.map((v) => {
                      const done = v.watchedMinutes >= v.durationMinutes;
                      return (
                        <li key={v.id} className="border-b border-border px-4 py-3.5 last:border-0">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {v.url ? (
                                  <a
                                    href={v.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex min-w-0 items-center gap-1.5 font-medium hover:text-accent"
                                  >
                                    <span className="truncate">{v.title}</span>
                                    <ExternalLink size={13} className="shrink-0 text-ink-faint" />
                                  </a>
                                ) : (
                                  <span className="truncate font-medium">{v.title}</span>
                                )}
                                {done && <Badge tone="success">Watched</Badge>}
                              </div>
                              <div className="mt-2 flex items-center gap-3">
                                <ProgressBar
                                  value={v.watchedMinutes}
                                  max={v.durationMinutes}
                                  tone={done ? "success" : "accent"}
                                />
                                <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                                  {formatMinutes(v.watchedMinutes)} / {formatMinutes(v.durationMinutes)}
                                </span>
                              </div>
                            </div>
                            <form action={deleteVideoAction}>
                              <input type="hidden" name="id" value={v.id} />
                              <button
                                type="submit"
                                aria-label={`Delete ${v.title}`}
                                className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
                              >
                                <Trash2 size={15} />
                              </button>
                            </form>
                          </div>
                          <form
                            action={updateVideoProgressAction}
                            className="mt-2.5 flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="id" value={v.id} />
                            <label className="flex items-center gap-2 text-xs text-ink-muted">
                              Watched up to
                              <input
                                key={v.watchedMinutes}
                                name="watched"
                                defaultValue={
                                  v.watchedMinutes
                                    ? `${Math.floor(v.watchedMinutes / 60)}:${String(v.watchedMinutes % 60).padStart(2, "0")}`
                                    : ""
                                }
                                placeholder="0:45"
                                className="field w-20 py-1 text-xs"
                              />
                            </label>
                            <Button type="submit" name="intent" value="set" variant="ghost" size="sm">
                              Save
                            </Button>
                            {done ? (
                              <Button type="submit" name="intent" value="reset" variant="ghost" size="sm">
                                Reset
                              </Button>
                            ) : (
                              <Button type="submit" name="intent" value="done" variant="ghost" size="sm">
                                Mark watched
                              </Button>
                            )}
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
