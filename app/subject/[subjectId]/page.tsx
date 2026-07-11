import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, Card, Badge, LinkButton } from "@/components/ui";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: {
      exams: {
        include: {
          _count: { select: { questions: true } },
          attempts: {
            where: { userId: session.user.id },
            orderBy: { startedAt: "desc" },
          },
        },
      },
    },
  });
  if (!subject) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link href="/dashboard" className="mb-6 inline-block text-sm text-accent hover:underline">
        ← All subjects
      </Link>
      <PageHeader title={subject.name} subtitle={`${subject.exams.length} exams`} />

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
