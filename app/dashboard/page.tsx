import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardCheck, RotateCcw, Sun } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import { CANONICAL_SUBJECTS } from "@/lib/subjects";
import { mistakeCounts } from "@/lib/mistakes";
import { startMistakeReviewAction } from "../daily/actions";
import SubjectIcon from "@/components/subject-icon";
import { startOfToday } from "@/lib/daily";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: {
      exams: {
        include: {
          attempts: {
            where: { userId: session.user.id },
          },
        },
      },
    },
  });

  const [mistakes, doneToday] = await Promise.all([
    mistakeCounts(session.user.id),
    prisma.attempt.count({ where: { userId: session.user.id, label: "daily", finishedAt: { not: null }, startedAt: { gte: startOfToday() } } }),
  ]);

  const groupOrder = [...new Set(CANONICAL_SUBJECTS.map((s): string => s.group))];
  const slugOrder = CANONICAL_SUBJECTS.map((s): string => s.slug);
  const groupOf = (slug: string) =>
    CANONICAL_SUBJECTS.find((s) => s.slug === slug)?.group ?? "Other";

  const sections = [...groupOrder, "Other"]
    .map((group) => ({
      group,
      subjects: subjects
        .filter((s) => groupOf(s.slug) === group)
        .sort((a, b) => slugOrder.indexOf(a.slug) - slugOrder.indexOf(b.slug)),
    }))
    .filter((section) => section.subjects.length > 0);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <PageHeader
        icon={ClipboardCheck}
        eyebrow="Practice"
        title="Exams & drills"
        subtitle="Pick a subject: practice sets, timed mock board exams and your mistakes."
      />

      <div className="stagger mb-10 grid gap-3 sm:grid-cols-2">
        <Link
          href="/daily"
          className="lift flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink">
            {doneToday ? <CheckCircle2 size={20} /> : <Sun size={20} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{doneToday ? "Today's session: done" : "Today's 15-minute session"}</span>
            <span className="block text-sm text-ink-muted">Formulas, questions and solved problems that are due</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-accent" />
        </Link>
        <form action={startMistakeReviewAction} className="contents">
          <button
            type="submit"
            disabled={mistakes.due === 0}
            className="lift flex items-center gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3.5 text-left disabled:pointer-events-none disabled:opacity-70"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <RotateCcw size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Mistake bank</span>
              <span className="block text-sm text-ink-muted">
                {mistakes.due > 0
                  ? `${mistakes.due} due to retry · ${mistakes.active} to master`
                  : mistakes.active > 0
                    ? `Nothing due today · ${mistakes.active} to master`
                    : "Questions you miss come back here"}
              </span>
            </span>
            {mistakes.due > 0 && <ArrowRight size={18} className="shrink-0 text-ink-faint" />}
          </button>
        </form>
      </div>

      {subjects.length === 0 ? (
        <EmptyState>No exams available yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <div key={section.group}>
              <h2 className="mb-4 text-sm font-medium tracking-wide text-ink-muted uppercase">
                {section.group}
              </h2>
              <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.subjects.map((s) => {
                  const examCount = s.exams.length;
                  const completedCount = s.exams.filter((e) =>
                    e.attempts.some((a) => a.finishedAt)
                  ).length;
                  const finishedAttempts = s.exams.flatMap((e) =>
                    e.attempts.filter((a) => a.finishedAt)
                  );
                  const totalCorrect = finishedAttempts.reduce(
                    (sum, a) => sum + (a.score ?? 0),
                    0
                  );
                  const totalQuestions = finishedAttempts.reduce(
                    (sum, a) => sum + a.totalQuestions,
                    0
                  );
                  const accuracy =
                    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;
                  const progressPct = examCount > 0 ? (completedCount / examCount) * 100 : 0;

                  return (
                    <Link
                      key={s.id}
                      href={`/subject/${s.id}`}
                      className="lift group rounded-xl border border-border bg-bg-elevated p-5 hover:border-accent sm:p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <SubjectIcon slug={s.slug} />
                          <div>
                            <h3 className="font-serif text-xl font-semibold">{s.name}</h3>
                            <p className="mt-0.5 text-sm text-ink-muted">{examCount} exams</p>
                          </div>
                        </div>
                        <ArrowRight
                          size={18}
                          className="mt-1 shrink-0 text-ink-faint transition-colors group-hover:text-accent"
                        />
                      </div>

                      <div className="mt-6">
                        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-muted">
                          <span>
                            {completedCount}/{examCount} completed
                          </span>
                          {accuracy !== null && <span>{accuracy}% accuracy</span>}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
                          <div
                            className="bar-fill h-full rounded-full bg-accent"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
