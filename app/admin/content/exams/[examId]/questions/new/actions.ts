"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { uploadImage } from "@/lib/blob";
import type { QuestionFormState } from "@/components/question-form";

const LABELS = ["A", "B", "C", "D"] as const;

async function uploadIfPresent(file: File | null, prefix: string) {
  if (!file || file.size === 0) return null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1] || "bin";
  return uploadImage(buffer, `${prefix}-${crypto.randomUUID()}.${ext}`, file.type);
}

export async function createQuestionAction(
  examId: string,
  _prevState: QuestionFormState,
  formData: FormData
): Promise<QuestionFormState> {
  const text = String(formData.get("text") || "").trim();
  const explanation = String(formData.get("explanation") || "").trim() || null;
  const correct = String(formData.get("correct") || "");
  const choices = LABELS.map((label) => ({
    label,
    text: String(formData.get(`choice${label}`) || "").trim(),
    isCorrect: label === correct,
  }));

  if (!text) return { error: "Question text is required." };
  if (choices.some((c) => !c.text)) return { error: "All four choices are required." };
  if (!LABELS.includes(correct as (typeof LABELS)[number])) {
    return { error: "Select the correct choice." };
  }

  const [imageUrl, explanationImageUrl] = await Promise.all([
    uploadIfPresent(formData.get("questionImage") as File | null, "question"),
    uploadIfPresent(formData.get("explanationImage") as File | null, "explanation"),
  ]);

  const maxOrder = await prisma.question.aggregate({
    where: { examId },
    _max: { order: true },
  });

  await prisma.question.create({
    data: {
      examId,
      order: (maxOrder._max.order ?? 0) + 1,
      text,
      imageUrl,
      explanation,
      explanationImageUrl,
      sourceItemId: `manual-${crypto.randomUUID()}`,
      choices: { create: choices },
    },
  });

  redirect(`/admin/content/exams/${examId}`);
}
