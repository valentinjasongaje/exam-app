import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import QuestionForm from "@/components/question-form";
import { updateQuestionAction } from "./actions";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ examId: string; questionId: string }>;
}) {
  const { examId, questionId } = await params;
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { choices: true, exam: true },
  });
  if (!question || question.examId !== examId) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Edit question — {question.exam.title}</h1>
      <QuestionForm
        action={updateQuestionAction.bind(null, examId, questionId)}
        submitLabel="Save changes"
        initial={{
          text: question.text,
          choices: question.choices,
          explanation: question.explanation ?? "",
          imageUrl: question.imageUrl,
          explanationImageUrl: question.explanationImageUrl,
        }}
      />
    </div>
  );
}
