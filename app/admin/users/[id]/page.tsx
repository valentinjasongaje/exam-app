import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { attemptTitle } from "@/lib/composed-attempt";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";

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
                        {a.score}/{a.totalQuestions}
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
                          `${a.score}/${a.totalQuestions}`
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
