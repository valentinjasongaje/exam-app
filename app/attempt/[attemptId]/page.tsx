import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { seededShuffle, choiceSeedFor } from "@/lib/shuffle";
import { submitAllAction } from "./actions";
import OneAtATime from "./one-at-a-time";

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

  if (attempt.layout === "ONE_AT_A_TIME") {
    const initialAnswers: Record<string, string> = {};
    for (const [questionId, choiceId] of answersByQuestion) {
      if (choiceId) initialAnswers[questionId] = choiceId;
    }

    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="mb-6 text-xl font-semibold">{attempt.exam.title}</h1>
        <OneAtATime
          attemptId={attemptId}
          questions={questions.map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
          }))}
          initialAnswers={initialAnswers}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">{attempt.exam.title}</h1>
      <form action={submitAllAction.bind(null, attemptId)} className="flex flex-col gap-8">
        {questions.map((q, i) => (
          <div key={q.id} className="border-b border-neutral-100 pb-6">
            <p className="mb-2 text-sm text-neutral-500">Question {i + 1}</p>
            <p className="mb-3 whitespace-pre-line">{q.text}</p>
            {q.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.imageUrl} alt="" className="mb-3 max-w-xs rounded border" />
            )}
            <div className="flex flex-col gap-2">
              {q.choices.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`answer-${q.id}`}
                    value={c.id}
                    defaultChecked={answersByQuestion.get(q.id) === c.id}
                  />
                  {c.text}
                </label>
              ))}
            </div>
          </div>
        ))}
        <button
          type="submit"
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white"
        >
          Submit
        </button>
      </form>
    </main>
  );
}
