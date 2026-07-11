import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { seededShuffle, choiceSeedFor } from "@/lib/shuffle";
import { submitAllAction } from "./actions";
import OneAtATime from "./one-at-a-time";
import AllAtOnce from "./all-at-once";

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { choices: { orderBy: { label: "asc" } } },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt || attempt.userId !== session.user.id) notFound();
  if (attempt.finishedAt) redirect(`/attempt/${attemptId}/review`);

  let questions = attempt.exam.questions;
  if (attempt.shuffleSeed != null) {
    const seed = attempt.shuffleSeed;
    questions = seededShuffle(questions, seed).map((q) => ({
      ...q,
      choices: seededShuffle(q.choices, choiceSeedFor(seed, q.order)),
    }));
  }

  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a.choiceId]));
  const deadline =
    attempt.mode === "BOARD_EXAM" && attempt.timeLimitMinutes
      ? new Date(attempt.startedAt.getTime() + attempt.timeLimitMinutes * 60_000).toISOString()
      : null;

  if (attempt.layout === "ONE_AT_A_TIME") {
    const initialAnswers: Record<string, string> = {};
    for (const [questionId, choiceId] of answersByQuestion) {
      if (choiceId) initialAnswers[questionId] = choiceId;
    }

    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="mb-6 font-serif text-xl font-semibold">{attempt.exam.title}</h1>
        <OneAtATime
          attemptId={attemptId}
          questions={questions.map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
          }))}
          initialAnswers={initialAnswers}
          deadline={deadline}
        />
      </main>
    );
  }

  const answersRecord: Record<string, string | undefined> = {};
  for (const [questionId, choiceId] of answersByQuestion) {
    answersRecord[questionId] = choiceId ?? undefined;
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-6 font-serif text-xl font-semibold">{attempt.exam.title}</h1>
      <AllAtOnce
        action={submitAllAction.bind(null, attemptId)}
        questions={questions.map((q) => ({
          id: q.id,
          text: q.text,
          imageUrl: q.imageUrl,
          choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
        }))}
        answersByQuestion={answersRecord}
        deadline={deadline}
      />
    </main>
  );
}
