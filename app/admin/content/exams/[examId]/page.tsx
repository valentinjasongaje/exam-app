import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deleteQuestionAction } from "./actions";

export default async function AdminExamPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      subject: true,
      questions: { orderBy: { order: "asc" } },
    },
  });

  if (!exam) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{exam.title}</h1>
        <p className="text-sm text-neutral-500">{exam.subject.name}</p>
      </div>

      <Link
        href={`/admin/content/exams/${examId}/questions/new`}
        className="self-start rounded-md bg-neutral-900 px-3 py-2 text-sm text-white"
      >
        Add question
      </Link>

      <ul className="flex flex-col gap-3">
        {exam.questions.map((q) => (
          <li
            key={q.id}
            className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-3 text-sm"
          >
            <div>
              <p className="text-neutral-500">Q{q.order}</p>
              <p>{q.text}</p>
            </div>
            <div className="flex shrink-0 gap-3">
              <Link
                href={`/admin/content/exams/${examId}/questions/${q.id}/edit`}
                className="underline"
              >
                Edit
              </Link>
              <form action={deleteQuestionAction.bind(null, examId, q.id)}>
                <button type="submit" className="text-red-600 underline">
                  Delete
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
