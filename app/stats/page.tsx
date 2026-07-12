import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { attemptTitle } from "@/lib/composed-attempt";
import { PageHeader, Card, EmptyState, LinkButton, Button } from "@/components/ui";
import { startWeakDrillAction } from "./actions";

const PASS_PCT = 70;

function formatDuration(start: Date, end: Date) {
  const totalMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const attempts = await prisma.attempt.findMany({
    where: { userId, finishedAt: { not: null } },
    orderBy: { finishedAt: "asc" },
    include: { exam: true, subject: true },
  });

  const wrongAnswers = await prisma.attemptAnswer.findMany({
    where: { attempt: { userId }, isCorrect: false },
    include: { question: { include: { exam: true } } },
  });

  const totalCorrect = attempts.reduce((sum, a) => sum + (a.score ?? 0), 0);
  const totalQuestions = attempts.reduce((sum, a) => sum + a.totalQuestions, 0);
  const overallAccuracy =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;
  const uniqueExams = new Set(attempts.filter((a) => a.examId).map((a) => a.examId)).size;

  const bySubject = new Map<
    string,
    { name: string; attempts: number; correct: number; total: number }
  >();
  for (const a of attempts) {
    if (!a.subject) continue; // cross-subject drills don't belong to one subject
    const existing = bySubject.get(a.subject.id) ?? {
      name: a.subject.name,
      attempts: 0,
      correct: 0,
      total: 0,
    };
    existing.attempts += 1;
    existing.correct += a.score ?? 0;
    existing.total += a.totalQuestions;
    bySubject.set(a.subject.id, existing);
  }
  const subjectRows = [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name));

  const missCounts = new Map<string, { text: string; examTitle: string; count: number }>();
  for (const a of wrongAnswers) {
    const existing = missCounts.get(a.questionId);
    if (existing) existing.count += 1;
    else
      missCounts.set(a.questionId, {
        text: a.question.text,
        examTitle: a.question.exam.title,
        count: 1,
      });
  }
  const weakest = [...missCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <PageHeader eyebrow="Track your growth" title="Your progress" />

      {attempts.length === 0 ? (
        <EmptyState>
          <p className="mb-4">No completed exams yet.</p>
          <LinkButton href="/dashboard" size="sm">
            Take an exam
          </LinkButton>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-10">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-2xl font-semibold">{attempts.length}</p>
              <p className="text-sm text-ink-muted">Exams completed ({uniqueExams} unique)</p>
            </Card>
            <Card>
              <p className="text-2xl font-semibold">
                {overallAccuracy !== null ? `${overallAccuracy}%` : "—"}
              </p>
              <p className="text-sm text-ink-muted">
                Overall accuracy · pass line is {PASS_PCT}%
              </p>
            </Card>
            <Card>
              <p className="text-2xl font-semibold">{totalQuestions}</p>
              <p className="text-sm text-ink-muted">Questions answered</p>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">
              Accuracy by subject
            </h2>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="px-5 py-3 font-normal">Subject</th>
                    <th className="px-5 py-3 font-normal">Attempts</th>
                    <th className="px-5 py-3 font-normal">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectRows.map((s) => (
                    <tr key={s.name} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">{s.name}</td>
                      <td className="px-5 py-3">{s.attempts}</td>
                      <td className="px-5 py-3">
                        {s.total > 0 ? `${Math.round((s.correct / s.total) * 100)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">
              Score trend
            </h2>
            <Card className="flex flex-col gap-4 sm:gap-3">
              {/* Mobile: stacked per-attempt block */}
              <div className="flex flex-col gap-4 sm:hidden">
                {attempts.map((a) => {
                  const pct =
                    a.totalQuestions > 0
                      ? Math.round(((a.score ?? 0) / a.totalQuestions) * 100)
                      : 0;
                  return (
                    <div
                      key={a.id}
                      className="flex flex-col gap-2 border-b border-border pb-4 text-sm last:border-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{attemptTitle(a)}</p>
                          <p className="text-xs text-ink-muted">
                            {a.finishedAt!.toLocaleDateString()} ·{" "}
                            {formatDuration(a.startedAt, a.finishedAt!)}
                          </p>
                        </div>
                        <span className="shrink-0 font-medium">
                          {a.score}/{a.totalQuestions}
                        </span>
                      </div>
                      <span className="relative h-2 w-full rounded-full bg-bg-muted">
                        <span
                          className="block h-2 rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                        <span
                          className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-ink-faint"
                          style={{ left: `${PASS_PCT}%` }}
                          title={`${PASS_PCT}% pass line`}
                        />
                      </span>
                      <Link
                        href={`/attempt/${a.id}/review`}
                        className="self-start text-xs text-accent hover:underline"
                      >
                        Review
                      </Link>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: single-line row */}
              <div className="hidden flex-col gap-3 sm:flex">
                {attempts.map((a) => {
                  const pct =
                    a.totalQuestions > 0
                      ? Math.round(((a.score ?? 0) / a.totalQuestions) * 100)
                      : 0;
                  return (
                    <div key={a.id} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0 text-ink-muted">
                        {a.finishedAt!.toLocaleDateString()}
                      </span>
                      <span className="w-48 shrink-0 truncate">{attemptTitle(a)}</span>
                      <span className="relative h-2 flex-1 rounded-full bg-bg-muted">
                        <span
                          className="block h-2 rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                        <span
                          className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-ink-faint"
                          style={{ left: `${PASS_PCT}%` }}
                          title={`${PASS_PCT}% pass line`}
                        />
                      </span>
                      <span className="w-16 shrink-0 text-right">
                        {a.score}/{a.totalQuestions}
                      </span>
                      <span className="w-14 shrink-0 text-right text-ink-faint">
                        {formatDuration(a.startedAt, a.finishedAt!)}
                      </span>
                      <Link href={`/attempt/${a.id}/review`} className="shrink-0 text-accent hover:underline">
                        Review
                      </Link>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-ink-faint">
                The tick on each bar marks the {PASS_PCT}% pass line.
              </p>
            </Card>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium tracking-wide text-ink-muted uppercase">
                Weakest questions
              </h2>
              {weakest.length > 0 && (
                <form action={startWeakDrillAction}>
                  <Button type="submit" size="sm" variant="secondary">
                    Drill weakest questions
                  </Button>
                </form>
              )}
            </div>
            {weakest.length === 0 ? (
              <EmptyState>No incorrect answers yet.</EmptyState>
            ) : (
              <div className="flex flex-col gap-3">
                {weakest.map((q, i) => (
                  <Card key={i}>
                    <p className="mb-1 text-xs text-ink-muted">
                      {q.examTitle} · missed {q.count}×
                    </p>
                    <p className="text-sm">{q.text}</p>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
