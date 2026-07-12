import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { seededShuffle, choiceSeedFor } from "@/lib/shuffle";
import { questionIdsOf, attemptTitle } from "@/lib/composed-attempt";
import { submitAllAction, discardAttemptAction } from "./actions";
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
      subject: true,
      answers: true,
    },
  });

  if (!attempt || attempt.userId !== session.user.id) notFound();
  if (attempt.finishedAt) redirect(`/attempt/${attemptId}/review`);

  const composedIds = questionIdsOf(attempt);
  let questions;
  if (composedIds) {
    const rows = await prisma.question.findMany({
      where: { id: { in: composedIds } },
      include: { choices: { orderBy: { label: "asc" } } },
    });
    const byId = new Map(rows.map((q) => [q.id, q]));
    // The stored array is already in sampled (random) order.
    questions = composedIds.map((id) => byId.get(id)).filter((q) => q !== undefined);
  } else {
    questions = attempt.exam!.questions;
    if (attempt.shuffleSeed != null) {
      const seed = attempt.shuffleSeed;
      questions = seededShuffle(questions, seed).map((q) => ({
        ...q,
        choices: seededShuffle(q.choices, choiceSeedFor(seed, q.order)),
      }));
    }
  }

  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a.choiceId]));
  const deadline =
    attempt.mode === "BOARD_EXAM" && attempt.timeLimitMinutes
      ? new Date(attempt.startedAt.getTime() + attempt.timeLimitMinutes * 60_000).toISOString()
      : null;
  const title = attemptTitle(attempt);
  const withFeedback = attempt.showFeedback && attempt.mode === "PRACTICE";

  const header = (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="font-serif text-xl font-semibold">{title}</h1>
      <form action={discardAttemptAction.bind(null, attemptId)}>
        <button
          type="submit"
          className="text-sm text-ink-faint transition-colors hover:text-danger"
        >
          Discard attempt
        </button>
      </form>
    </div>
  );

  if (attempt.layout === "ONE_AT_A_TIME") {
    const initialAnswers: Record<string, string> = {};
    for (const [questionId, choiceId] of answersByQuestion) {
      if (choiceId) initialAnswers[questionId] = choiceId;
    }

    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        {header}
        <OneAtATime
          attemptId={attemptId}
          questions={questions.map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
            // Only shipped to the client when instant feedback is on —
            // never leak answers during board-exam attempts.
            correctChoiceId: withFeedback
              ? (q.choices.find((c) => c.isCorrect)?.id ?? null)
              : null,
            explanation: withFeedback ? q.explanation : null,
          }))}
          initialAnswers={initialAnswers}
          deadline={deadline}
          withFeedback={withFeedback}
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
      {header}
      <AllAtOnce
        attemptId={attemptId}
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
