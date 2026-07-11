import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import QuestionForm from "@/components/question-form";
import { createQuestionAction } from "./actions";
import { PageHeader } from "@/components/ui";

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
      <PageHeader eyebrow={exam.title} title="Add question" />
      <QuestionForm action={createQuestionAction.bind(null, examId)} submitLabel="Add question" />
    </div>
  );
}
