import { notFound, redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startAttemptAction } from "./actions";
import { Card, Button } from "@/components/ui";

export default async function ExamStartPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { subject: true, _count: { select: { questions: true } } },
  });
  if (!exam) notFound();

  const inProgress = await prisma.attempt.findFirst({
    where: { userId: session.user.id, examId, finishedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (inProgress) redirect(`/attempt/${inProgress.id}`);

  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <p className="mb-1.5 text-xs font-medium tracking-wide text-accent uppercase">
          {exam.subject.name}
        </p>
        <h1 className="mb-2 text-2xl font-semibold">{exam.title}</h1>
        <p className="mb-6 text-sm text-ink-muted">{exam._count.questions} questions</p>
        <div className="flex flex-col gap-2.5">
          <form action={startAttemptAction.bind(null, examId, "PRACTICE")}>
            <Button type="submit" variant="secondary" className="w-full">
              Practice (untimed)
            </Button>
          </form>
          <form action={startAttemptAction.bind(null, examId, "BOARD_EXAM")}>
            <Button type="submit" className="w-full">
              <Clock size={16} />
              Take as board exam · 4:00:00
            </Button>
          </form>
        </div>
      </Card>
    </main>
  );
}
