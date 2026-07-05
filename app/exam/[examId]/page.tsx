import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startAttemptAction } from "./actions";

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
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{exam.title}</h1>
      <p className="text-neutral-600">
        {exam.subject.name} · {exam._count.questions} questions
      </p>
      <form action={startAttemptAction.bind(null, examId)}>
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-white">
          Start exam
        </button>
      </form>
    </main>
  );
}
