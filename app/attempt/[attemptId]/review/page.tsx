import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { seededShuffle, choiceSeedFor } from "@/lib/shuffle";

export default async function AttemptReviewPage({
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
  if (!attempt.finishedAt) redirect(`/attempt/${attemptId}`);

  let questions = attempt.exam.questions;
  if (attempt.shuffleSeed != null) {
    const seed = attempt.shuffleSeed;
    questions = seededShuffle(questions, seed).map((q) => ({
      ...q,
      choices: seededShuffle(q.choices, choiceSeedFor(seed, q.order)),
    }));
  }

  const answersByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a.choiceId]));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-2 text-xl font-semibold">{attempt.exam.title}</h1>
      <p className="mb-8 text-lg">
        Score: {attempt.score} / {attempt.totalQuestions}
      </p>

      <div className="flex flex-col gap-8">
        {questions.map((q, i) => {
          const pickedId = answersByQuestion.get(q.id);
          return (
            <div key={q.id} className="border-b border-neutral-100 pb-6">
              <p className="mb-2 text-sm text-neutral-500">Question {i + 1}</p>
              <p className="mb-3 whitespace-pre-line">{q.text}</p>
              {q.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.imageUrl} alt="" className="mb-3 max-w-xs rounded border" />
              )}
              <div className="flex flex-col gap-1">
                {q.choices.map((c) => {
                  const picked = c.id === pickedId;
                  const colorClass = c.isCorrect
                    ? "text-green-700 font-medium"
                    : picked
                      ? "text-red-700"
                      : "";
                  return (
                    <p key={c.id} className={`text-sm ${colorClass}`}>
                      {picked ? "→ " : ""}
                      {c.text}
                      {c.isCorrect ? " (correct)" : ""}
                    </p>
                  );
                })}
              </div>
              {q.explanation && (
                <p className="mt-2 whitespace-pre-line text-sm text-neutral-600">
                  {q.explanation}
                </p>
              )}
              {q.explanationImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={q.explanationImageUrl}
                  alt=""
                  className="mt-2 max-w-xs rounded border"
                />
              )}
            </div>
          );
        })}
      </div>

      <Link href="/dashboard" className="mt-8 inline-block underline">
        Back to dashboard
      </Link>
    </main>
  );
}
