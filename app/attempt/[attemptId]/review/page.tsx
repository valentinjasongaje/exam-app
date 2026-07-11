import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { seededShuffle, choiceSeedFor } from "@/lib/shuffle";
import { Card, Badge } from "@/components/ui";
import { clsx } from "clsx";

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
  const pct = Math.round(((attempt.score ?? 0) / attempt.totalQuestions) * 100);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="mb-4 flex items-center gap-2.5">
        <h1 className="font-serif text-xl font-semibold">{attempt.exam.title}</h1>
        {attempt.mode === "BOARD_EXAM" && <Badge tone="accent">Board exam</Badge>}
      </div>
      <Card className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            Final score
          </p>
          <p className="text-2xl font-semibold">
            {attempt.score} / {attempt.totalQuestions}
          </p>
        </div>
        <Badge tone={pct >= 70 ? "success" : pct >= 40 ? "accent" : "danger"}>{pct}%</Badge>
      </Card>

      <div className="flex flex-col gap-5">
        {questions.map((q, i) => {
          const pickedId = answersByQuestion.get(q.id);
          return (
            <Card key={q.id}>
              <div className="mb-3 flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-muted text-xs font-medium text-ink-muted">
                  {i + 1}
                </span>
                <p className="whitespace-pre-line">{q.text}</p>
              </div>
              {q.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={q.imageUrl}
                  alt=""
                  className="mb-3 ml-9 max-w-xs rounded-lg border border-border"
                />
              )}
              <div className="ml-9 flex flex-col gap-2">
                {q.choices.map((c) => {
                  const picked = c.id === pickedId;
                  return (
                    <p
                      key={c.id}
                      className={clsx(
                        "choice-row",
                        c.isCorrect && "is-correct",
                        !c.isCorrect && picked && "is-incorrect"
                      )}
                    >
                      {c.text}
                      {c.isCorrect && (
                        <span className="ml-auto text-xs font-medium text-success">correct</span>
                      )}
                      {!c.isCorrect && picked && (
                        <span className="ml-auto text-xs font-medium text-danger">your answer</span>
                      )}
                    </p>
                  );
                })}
              </div>
              {q.explanation && (
                <p className="mt-3 ml-9 whitespace-pre-line rounded-lg bg-bg-muted p-3 text-sm text-ink-muted">
                  {q.explanation}
                </p>
              )}
              {q.explanationImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={q.explanationImageUrl}
                  alt=""
                  className="mt-2 ml-9 max-w-xs rounded-lg border border-border"
                />
              )}
            </Card>
          );
        })}
      </div>

      <Link href="/dashboard" className="mt-8 inline-block text-sm text-accent hover:underline">
        Back to dashboard
      </Link>
    </main>
  );
}
