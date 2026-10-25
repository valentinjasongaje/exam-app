import Link from "next/link";
import { Play, Plus } from "lucide-react";
import { clsx } from "clsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TRACKER_SUBJECTS, fromDbDate, isTrackerSubject, todayLocal } from "@/lib/study-plan";
import { MAX_BOX, isDue } from "@/lib/recall";
import { PageHeader, Card, EmptyState, LinkButton } from "@/components/ui";
import ProgressBar from "../tracker/progress-bar";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" });

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  const subject = isTrackerSubject(params.subject) ? params.subject : "all";
  const today = todayLocal();

  const notes = await prisma.studyNote.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }],
    include: { cards: { select: { box: true, dueDate: true } } },
  });

  const rows = notes.map((n) => ({
    ...n,
    total: n.cards.length,
    due: n.cards.filter((c) => isDue(c.dueDate ? fromDbDate(c.dueDate) : null, today)).length,
    known: n.cards.filter((c) => c.box >= MAX_BOX).length,
  }));
  const shown = subject === "all" ? rows : rows.filter((r) => r.subject === subject);
  const dueAll = shown.reduce((s, r) => s + r.due, 0);
  const totalAll = shown.reduce((s, r) => s + r.total, 0);
  const recallHref = `/notes/recall${subject !== "all" ? `?subject=${subject}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Notes"
        title="Topic notes & formulas"
        subtitle="Write formulas down as you review, then come back and recall them. Missed ones come back sooner."
        action={
          <LinkButton href={`/notes/new${subject !== "all" ? `?subject=${subject}` : ""}`}>
            <Plus size={15} /> New note
          </LinkButton>
        }
      />

      <div className="mb-6 flex flex-wrap gap-1.5 text-sm">
        {[{ slug: "all", name: "All" }, ...TRACKER_SUBJECTS].map((s) => (
          <Link
            key={s.slug}
            href={s.slug === "all" ? "/notes" : `/notes?subject=${s.slug}`}
            className={clsx(
              "rounded-full border px-3 py-1 transition-colors",
              subject === s.slug ? "border-accent bg-accent text-accent-ink" : "border-border-strong text-ink-muted hover:text-ink"
            )}
          >
            {s.name}
            <span className="ml-1.5 text-xs opacity-70">
              {s.slug === "all" ? rows.length : rows.filter((r) => r.subject === s.slug).length}
            </span>
          </Link>
        ))}
      </div>

      {totalAll > 0 && (
        <Card className="mb-8 flex flex-wrap items-center justify-between gap-4 border-accent/40 bg-accent-soft/40">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {dueAll} <span className="text-base font-normal text-ink-muted">of {totalAll} formulas due</span>
            </p>
            <p className="text-sm text-ink-muted">A few minutes a day: lunch break or the 20-minute formula review slot.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dueAll > 0 ? (
              <LinkButton href={recallHref}>
                <Play size={14} className="fill-current" /> Recall {dueAll} due
              </LinkButton>
            ) : (
              <span className="self-center text-sm text-success">All caught up</span>
            )}
            <LinkButton href={`${recallHref}${recallHref.includes("?") ? "&" : "?"}all=1`} variant="secondary">
              Drill all {totalAll}
            </LinkButton>
          </div>
        </Card>
      )}

      {shown.length === 0 ? (
        <EmptyState>
          No notes yet. While watching a lecture, press <span className="text-ink">New note</span>, pick the topic, and list
          the formulas you need to memorize.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {TRACKER_SUBJECTS.filter((s) => subject === "all" || s.slug === subject).map((s) => {
            const mine = shown.filter((r) => r.subject === s.slug).sort((a, b) => a.topic.localeCompare(b.topic, undefined, { numeric: true }));
            if (mine.length === 0) return null;
            return (
              <section key={s.slug}>
                <h2 className="mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">{s.name}</h2>
                <Card className="p-0">
                  <ul>
                    {mine.map((n) => (
                      <li key={n.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                        <Link href={`/notes/${n.id}`} className="min-w-0 flex-1 group">
                          <span className="block truncate font-medium group-hover:text-accent">{n.topic}</span>
                          <span className="mt-1 flex items-center gap-3">
                            <ProgressBar value={n.known} max={Math.max(n.total, 1)} tone="success" className="max-w-32" />
                            <span className="text-xs text-ink-muted tabular-nums">
                              {n.total} formula{n.total === 1 ? "" : "s"} · {n.known} known · edited {dateFmt.format(n.updatedAt)}
                            </span>
                          </span>
                        </Link>
                        {n.total > 0 && (
                          <Link
                            href={`/notes/recall?note=${n.id}`}
                            className={clsx(
                              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm",
                              n.due > 0 ? "bg-accent text-accent-ink hover:bg-accent-hover" : "text-ink-muted hover:bg-bg-muted hover:text-ink"
                            )}
                          >
                            <Play size={12} className="fill-current" />
                            {n.due > 0 ? `${n.due} due` : "Recall"}
                          </Link>
                        )}
                      </li>
                    ))}
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
