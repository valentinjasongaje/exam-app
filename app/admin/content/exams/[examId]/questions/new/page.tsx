import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import QuestionForm from "@/components/question-form";
import { createQuestionAction } from "./actions";

export default async function NewQuestionPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Add question — {exam.title}</h1>
      <QuestionForm
        action={createQuestionAction.bind(null, examId)}
        submitLabel="Add question"
      />
    </div>
  );
}
