import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      attempts: {
        orderBy: { startedAt: "desc" },
        include: { exam: { include: { subject: true } } },
      },
    },
  });

  if (!user) notFound();

  const wrongAnswers = await prisma.attemptAnswer.findMany({
    where: { attempt: { userId: id }, isCorrect: false },
    include: { question: { include: { exam: true } } },
  });

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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">{user.name || user.email}</h1>
        <p className="text-sm text-neutral-500">
          {user.email} · {user.role}
        </p>
      </div>

      <section>
        <h2 className="mb-2 font-medium">Attempt history</h2>
        {user.attempts.length === 0 ? (
          <p className="text-sm text-neutral-500">No attempts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4 font-normal">Exam</th>
                <th className="py-2 pr-4 font-normal">Subject</th>
                <th className="py-2 pr-4 font-normal">Score</th>
                <th className="py-2 pr-4 font-normal">Date</th>
              </tr>
            </thead>
            <tbody>
              {user.attempts.map((a) => (
                <tr key={a.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">{a.exam.title}</td>
                  <td className="py-2 pr-4">{a.exam.subject.name}</td>
                  <td className="py-2 pr-4">
                    {a.finishedAt ? `${a.score}/${a.totalQuestions}` : "In progress"}
                  </td>
                  <td className="py-2 pr-4">{a.startedAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
  );
}
