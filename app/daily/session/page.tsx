import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { questionIdsOf } from "@/lib/composed-attempt";
import { DAILY_MINUTES, dueRecallItems } from "@/lib/daily";
import DailySession from "./daily-session";

export const dynamic = "force-dynamic";

export default async function DailySessionPage({
  searchParams,
}: {
  searchParams: Promise<{ attempt?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const { attempt: attemptId } = await searchParams;

  const attempt = attemptId
    ? await prisma.attempt.findFirst({
        where: { id: attemptId, userId, label: "daily" },
        include: { answers: true },
      })
    : null;
  if (attemptId && !attempt) redirect("/daily");
  // A finished session stays on its results (finishing refreshes this page; a redirect would hide them).

  const ids = attempt ? (questionIdsOf(attempt) ?? []) : [];
  const [rows, mistakeIds, recall] = await Promise.all([
    prisma.question.findMany({
      where: { id: { in: ids } },
      include: { choices: { orderBy: { label: "asc" } } },
    }),
    prisma.mistakeCard.findMany({
      where: { userId, questionId: { in: ids }, masteredAt: null },
      select: { questionId: true },
    }),
    dueRecallItems(userId),
  ]);
  const byId = new Map(rows.map((q) => [q.id, q]));
  const fromMistakes = new Set(mistakeIds.map((m) => m.questionId));
  // Real countdown from when today's session started (older sessions without a stored limit get the standard 15 min).
  const deadline = attempt
    ? new Date(attempt.startedAt.getTime() + (attempt.timeLimitMinutes ?? DAILY_MINUTES) * 60_000).toISOString()
    : null;
  const answered = new Map(
    attempt?.answers.map((a) => [a.questionId, a.choiceId]) ?? [],
  );

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <DailySession
        attemptId={attempt?.id ?? null}
        alreadyFinished={!!attempt?.finishedAt}
        deadline={deadline}
        minutes={DAILY_MINUTES}
        showFeedback={attempt?.showFeedback ?? true}
        formulas={recall.formulas.map((c) => ({
          id: c.id,
          name: c.name,
          formula: c.formula,
          hint: c.hint,
          topic: c.note.topic,
        }))}
        questions={ids
          .map((id) => byId.get(id))
          .filter((q) => q !== undefined)
          .map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            explanation: q.explanation,
            explanationImageUrl: q.explanationImageUrl,
            choices: q.choices.map((c) => ({
              id: c.id,
              label: c.label,
              text: c.text,
              isCorrect: c.isCorrect,
            })),
            fromMistakes: fromMistakes.has(q.id),
            answeredChoiceId: answered.get(q.id) ?? null,
          }))}
        problems={recall.problems.map((p) => ({
          id: p.id,
          text: p.text,
          imageUrl: p.imageUrl,
          answer: p.answer!,
          solutionImageUrl: p.solutionImageUrl,
          explanation: p.explanation,
          topic: p.topic,
          videoId: p.videoId,
          seconds: p.seconds,
        }))}
      />
    </main>
  );
}
