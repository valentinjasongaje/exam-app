import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, Card, Badge, LinkButton, Button } from "@/components/ui";
import { startMockBoardExamAction } from "./actions";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [subject, questionCount, inProgressMock] = await Promise.all([
    prisma.subject.findUnique({
      where: { id: subjectId },
      include: {
        exams: {
          orderBy: { title: "asc" },
          include: {
            _count: { select: { questions: true } },
            attempts: {
              where: { userId: session.user.id },
              orderBy: { startedAt: "desc" },
            },
          },
        },
      },
    }),
    prisma.question.count({ where: { exam: { subjectId } } }),
    prisma.attempt.findFirst({
      where: {
        userId: session.user.id,
        subjectId,
        examId: null,
        mode: "BOARD_EXAM",
        finishedAt: null,
      },
    }),
  ]);
  if (!subject) notFound();

  const mockItems = Math.min(100, questionCount);
  const hasFullPool = questionCount >= 100;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link href="/dashboard" className="mb-6 inline-block text-sm text-accent hover:underline">
        ← All subjects
      </Link>
      <PageHeader title={subject.name} subtitle={`${subject.exams.length} exams`} />

      {questionCount > 0 && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">Mock board exam</p>
              {!hasFullPool && <Badge tone="accent">{mockItems}/100 available</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {hasFullPool
                ? `100 questions sampled across all ${subject.name} exams · 4-hour timer`
                : `Only ${mockItems} question${mockItems === 1 ? "" : "s"} imported so far — import more ${subject.name} exams for a full 100-item mock · 4-hour timer`}
            </p>
          </div>
          {inProgressMock ? (
            <LinkButton href={`/attempt/${inProgressMock.id}`} variant="secondary" size="sm">
              Resume mock exam
            </LinkButton>
          ) : (
            <form action={startMockBoardExamAction.bind(null, subjectId)}>
              <Button type="submit" size="sm">
                <Clock size={15} />
                Start mock exam
              </Button>
            </form>
          )}
        </Card>
      )}

      {subject.exams.length === 0 ? (
        <EmptyState>No exams in this subject yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {subject.exams.map((e) => {
            const inProgress = e.attempts.find((a) => !a.finishedAt);
            const finished = e.attempts.filter((a) => a.finishedAt);
            const bestAttempt = finished.length
              ? finished.reduce((best, a) => ((a.score ?? 0) > (best.score ?? 0) ? a : best))
              : null;

            return (
              <Card key={e.id} className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{e.title}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-muted">
                    <span>{e._count.questions} questions</span>
                    {finished.length > 0 && (
                      <span>
                        · {finished.length} attempt{finished.length > 1 ? "s" : ""}
                      </span>
                    )}
                    {bestAttempt && (
                      <Badge tone="accent">
                        best {bestAttempt.score}/{bestAttempt.totalQuestions}
                      </Badge>
                    )}
                  </div>
                </div>
                <LinkButton
                  href={`/exam/${e.id}`}
                  variant={inProgress ? "secondary" : "primary"}
                  size="sm"
                >
                  {inProgress ? "Resume" : finished.length ? "Retake" : "Start"}
                </LinkButton>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
