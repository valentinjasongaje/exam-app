"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function deleteQuestionAction(examId: string, questionId: string) {
  await prisma.$transaction([
    prisma.choice.deleteMany({ where: { questionId } }),
    prisma.question.delete({ where: { id: questionId } }),
  ]);
  revalidatePath(`/admin/content/exams/${examId}`);
}
