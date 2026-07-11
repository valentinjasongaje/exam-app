"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { CANONICAL_SUBJECTS } from "@/lib/subjects";

export async function deleteQuestionAction(examId: string, questionId: string) {
  await prisma.$transaction([
    prisma.choice.deleteMany({ where: { questionId } }),
    prisma.question.delete({ where: { id: questionId } }),
  ]);
  revalidatePath(`/admin/content/exams/${examId}`);
}

/**
 * Moves an exam to one of the 4 canonical subjects, creating that subject
 * row if it doesn't exist yet, and deleting the exam's previous subject if
 * it's left with no exams — cleans up stray subjects from older imports
 * that didn't go through the fixed subject picker.
 */
export async function reassignSubjectAction(examId: string, formData: FormData) {
  const subjectSlug = formData.get("subjectSlug");
  const target = CANONICAL_SUBJECTS.find((s) => s.slug === subjectSlug);
  if (!target) throw new Error("Invalid subject");

  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
  const previousSubjectId = exam.subjectId;

  const subject = await prisma.subject.upsert({
    where: { slug: target.slug },
    update: { name: target.name },
    create: { name: target.name, slug: target.slug },
  });

  await prisma.exam.update({ where: { id: examId }, data: { subjectId: subject.id } });

  if (previousSubjectId !== subject.id) {
    const remaining = await prisma.exam.count({ where: { subjectId: previousSubjectId } });
    if (remaining === 0) {
      await prisma.subject.delete({ where: { id: previousSubjectId } });
    }
  }

  revalidatePath(`/admin/content/exams/${examId}`);
  revalidatePath("/admin/content");
  revalidatePath("/dashboard");
}
