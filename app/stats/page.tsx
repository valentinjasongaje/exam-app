import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const attempts = await prisma.attempt.findMany({
    where: { userId, finishedAt: { not: null } },
    orderBy: { finishedAt: "asc" },
    include: { exam: { include: { subject: true } } },
  });

  const wrongAnswers = await prisma.attemptAnswer.findMany({
    where: { attempt: { userId }, isCorrect: false },
    include: { question: { include: { exam: true } } },
  });

  // Overall summary
  const totalCorrect = attempts.reduce((sum, a) => sum + (a.score ?? 0), 0);
  const totalQuestions = attempts.reduce((sum, a) => sum + a.totalQuestions, 0);
  const overallAccuracy =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;
  const uniqueExams = new Set(attempts.map((a) => a.examId)).size;

  // Accuracy by subject
  const bySubject = new Map<
    string,
    { name: string; attempts: number; correct: number; total: number }
  >();
  for (const a of attempts) {
    const key = a.exam.subjectId;
    const existing = bySubject.get(key) ?? {
      name: a.exam.subject.name,
      attempts: 0,
      correct: 0,
      total: 0,
    };
    existing.attempts += 1;
    existing.correct += a.score ?? 0;
    existing.total += a.totalQuestions;
    bySubject.set(key, existing);
  }
  const subjectRows = [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name));

  // Weakest questions (missed most often across all attempts)
  const missCounts = new Map<string, { text: string; examTitle: string; count: number }>();
  for (const a of wrongAnswers) {
    const existing = missCounts.get(a.questionId);
    if (existing) existing.count += 1;
    else
      missCounts.set(a.questionId, {
        text: a.question.text,
        examTitle: a.question.exam.title,
        count: 1,
      });
  }
  const weakest = [...missCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Your progress</h1>

      {attempts.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No completed exams yet.{" "}
          <Link href="/dashboard" className="underline">
            Take an exam
          </Link>{" "}
          to start tracking your progress.
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          <section className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-neutral-200 p-4">
              <p className="text-2xl font-semibold">{attempts.length}</p>
              <p className="text-sm text-neutral-500">
                Exams completed ({uniqueExams} unique)
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4">
              <p className="text-2xl font-semibold">
                {overallAccuracy !== null ? `${overallAccuracy}%` : "—"}
              </p>
              <p className="text-sm text-neutral-500">Overall accuracy</p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4">
              <p className="text-2xl font-semibold">{totalQuestions}</p>
              <p className="text-sm text-neutral-500">Questions answered</p>
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Accuracy by subject</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4 font-normal">Subject</th>
                  <th className="py-2 pr-4 font-normal">Attempts</th>
                  <th className="py-2 pr-4 font-normal">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {subjectRows.map((s) => (
                  <tr key={s.name} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">{s.name}</td>
                    <td className="py-2 pr-4">{s.attempts}</td>
                    <td className="py-2 pr-4">
                      {s.total > 0 ? `${Math.round((s.correct / s.total) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Score trend</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {attempts.map((a) => {
                const pct =
                  a.totalQuestions > 0
                    ? Math.round(((a.score ?? 0) / a.totalQuestions) * 100)
                    : 0;
                return (
                  <li key={a.id} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-neutral-500">
                      {a.finishedAt!.toLocaleDateString()}
                    </span>
                    <span className="w-56 shrink-0 truncate">{a.exam.title}</span>
                    <span className="h-2 flex-1 rounded-full bg-neutral-100">
                      <span
                        className="block h-2 rounded-full bg-neutral-900"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right">
                      {a.score}/{a.totalQuestions}
                    </span>
                    <Link
                      href={`/attempt/${a.id}/review`}
                      className="shrink-0 text-neutral-500 underline"
                    >
                      Review
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Weakest questions</h2>
            {weakest.length === 0 ? (
              <p className="text-sm text-neutral-500">No incorrect answers yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {weakest.map((q, i) => (
                  <li key={i} className="border-b border-neutral-100 pb-2">
                    <span className="text-neutral-500">
                      {q.examTitle} · missed {q.count}x
                    </span>
                    <p>{q.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
