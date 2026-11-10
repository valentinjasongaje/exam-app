import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { attemptTitle } from "@/lib/composed-attempt";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import WeekBalance from "@/components/week-balance";
import { userProgressDetail, usersProgress } from "@/lib/admin-progress";
import { formatDay, formatMinutes, subjectName } from "@/lib/study-plan";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      attempts: {
        orderBy: { startedAt: "desc" },
        include: { exam: true, subject: true },
      },
    },
  });

  if (!user) notFound();

  const [detail, row] = await Promise.all([
    userProgressDetail(user.id, user.role, user.weeklyTargets),
    usersProgress().then((rows) => rows.find((r) => r.id === user.id)!),
  ]);
  const maxWeek = Math.max(1, ...detail.weeks.map((w) => w.minutes));

  const wrongAnswers = await prisma.attemptAnswer.findMany({
    where: { attempt: { userId: id }, isCorrect: false },
    include: { question: { include: { exam: true } } },
  });

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
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={user.role}
        title={user.name || user.email}
        subtitle={user.email}
      />

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Videos watched", value: `${row.videosWatched}/${row.videosTotal}` },
          { label: "Questions answered", value: row.answered.toLocaleString(), sub: row.accuracy !== null ? `${row.accuracy}% correct` : "No exams yet" },
          { label: "Daily sessions", value: `${row.dailyDaysThisWeek}/7`, sub: "days this week" },
          { label: "Mistakes due", value: String(row.mistakesDue) },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-ink-muted">{s.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{s.value}</p>
            {s.sub && <p className="text-xs text-ink-faint">{s.sub}</p>}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">This week</h2>
          <WeekBalance rows={detail.thisWeek} pace={detail.pace} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Last 4 weeks</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {detail.weeks.map((w, i) => (
              <li key={w.start} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-ink-muted">
                  {i === detail.weeks.length - 1 ? "This week" : `Week of ${formatDay(w.start, { month: "short", day: "numeric" })}`}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-muted">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(w.minutes / maxWeek) * 100}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums">{formatMinutes(w.minutes)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Videos by subject</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {detail.videos.map((v) => (
              <li key={v.subject} className="flex items-center gap-3">
                <span className="w-16 shrink-0">{subjectName(v.subject)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-muted">
                  <span className="block h-full rounded-full bg-success" style={{ width: `${(v.done / Math.max(1, v.total)) * 100}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums text-ink-muted">
                  {v.done}/{v.total}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Practice by subject</h2>
          {detail.accuracy.length === 0 ? (
            <p className="text-sm text-ink-muted">No finished exams yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {detail.accuracy.map((a) => {
                const pct = a.total ? Math.round((a.correct / a.total) * 100) : 0;
                return (
                  <li key={a.subject} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate" title={a.subject}>{a.subject}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-muted">
                      <span className={`block h-full rounded-full ${pct >= 70 ? "bg-success" : "bg-danger"}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-28 shrink-0 text-right tabular-nums text-ink-muted">
                      {pct}% · {a.total} items
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-faint">Green at 70% and above (passing).</p>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">
          Attempt history
        </h2>
        {user.attempts.length === 0 ? (
          <EmptyState>No attempts yet.</EmptyState>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="flex flex-col gap-3 sm:hidden">
              {user.attempts.map((a) => (
                <Card key={a.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{attemptTitle(a)}</p>
                      <p className="text-xs text-ink-muted">{a.subject?.name ?? "—"}</p>
                    </div>
                    {a.finishedAt ? (
                      <span className="shrink-0 text-sm">
                        {a.score ?? 0}/{a.totalQuestions}
                      </span>
                    ) : (
                      <Badge tone="accent">In progress</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">
                    {a.startedAt.toLocaleDateString()}
                  </p>
                </Card>
              ))}
            </div>

            {/* Desktop: table */}
            <Card className="hidden overflow-x-auto p-0 sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th className="px-5 py-3 font-normal">Exam</th>
                    <th className="px-5 py-3 font-normal">Subject</th>
                    <th className="px-5 py-3 font-normal">Score</th>
                    <th className="px-5 py-3 font-normal">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {user.attempts.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">{attemptTitle(a)}</td>
                      <td className="px-5 py-3">{a.subject?.name ?? "—"}</td>
                      <td className="px-5 py-3">
                        {a.finishedAt ? (
                          `${a.score ?? 0}/${a.totalQuestions}`
                        ) : (
                          <Badge tone="accent">In progress</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-ink-muted">
                        {a.startedAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">
          Weakest questions
        </h2>
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
  );
}
