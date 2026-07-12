"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { uploadImage } from "@/lib/blob";
import type { QuestionFormState } from "@/components/question-form";

const LABELS = ["A", "B", "C", "D"] as const;

/** Returns the new URL, or undefined to leave the existing image untouched. */
async function uploadIfPresent(file: File | null, prefix: string) {
  if (!file || file.size === 0) return undefined;
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1] || "bin";
  return uploadImage(buffer, `${prefix}-${crypto.randomUUID()}.${ext}`, file.type);
}

/** Same, for a data: URL produced by the in-browser watermark editor. */
async function uploadIfEdited(dataUrl: FormDataEntryValue | null, prefix: string) {
  if (typeof dataUrl !== "string" || !dataUrl) return undefined;
  const match = /^data:(.+?);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return undefined;
  const [, mime, base64] = match;
  const ext = mime.split("/")[1] || "png";
  return uploadImage(
    Buffer.from(base64, "base64"),
    `${prefix}-${crypto.randomUUID()}.${ext}`,
    mime
  );
}

export async function updateQuestionAction(
  examId: string,
  questionId: string,
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

  // A freshly uploaded replacement file wins over an in-browser edit of the
  // old image (editing the outgoing image would be pointless anyway).
  const [uploadedImage, uploadedExplanation, editedImage, editedExplanation] = await Promise.all([
    uploadIfPresent(formData.get("questionImage") as File | null, "question"),
    uploadIfPresent(formData.get("explanationImage") as File | null, "explanation"),
    uploadIfEdited(formData.get("editedQuestionImage"), "question"),
    uploadIfEdited(formData.get("editedExplanationImage"), "explanation"),
  ]);
  const imageUrl = uploadedImage ?? editedImage;
  const explanationImageUrl = uploadedExplanation ?? editedExplanation;

  await prisma.question.update({
    where: { id: questionId },
    data: {
      text,
      explanation,
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(explanationImageUrl !== undefined ? { explanationImageUrl } : {}),
    },
  });

  await Promise.all(
    choices.map((c) =>
      prisma.choice.update({
        where: { questionId_label: { questionId, label: c.label } },
        data: { text: c.text, isCorrect: c.isCorrect },
      })
    )
  );

  redirect(`/admin/content/exams/${examId}`);
}
