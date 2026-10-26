"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadImage } from "@/lib/blob";
import { LABELS, isComplete, removeFromBank, syncToBank, videoTopic } from "@/lib/video-questions";
import { toClient, type VQ } from "./question-types";

const MAX_IMAGE = 4 * 1024 * 1024;

function refresh(videoId: string) {
  revalidatePath(`/watch/${videoId}`);
  revalidatePath("/dashboard");
  revalidatePath("/subject", "layout");
}

/**
 * Saves a question written while watching. Drafts (no answer yet, or missing
 * choices) stay with the video; once complete, it is copied into the
 * subject's "Video questions" exam and later edits keep that copy in sync.
 */
export async function saveVideoQuestionAction(fd: FormData): Promise<{ error: string } | { item: VQ }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Not logged in." };

  const id = String(fd.get("id") ?? "") || null;
  const videoId = String(fd.get("videoId") ?? "");
  const video = await prisma.studyVideo.findFirst({ where: { id: videoId, userId } });
  if (!video) return { error: "Video not found." };
  const existing = id ? await prisma.videoQuestion.findFirst({ where: { id, userId, videoId } }) : null;
  if (id && !existing) return { error: "Question not found." };

  const text = String(fd.get("text") ?? "").trim();
  const image = fd.get("image");
  const hasNewImage = image instanceof File && image.size > 0;
  if (!text && !hasNewImage && !existing?.imageUrl) return { error: "Write the question or add a picture of it." };
  if (hasNewImage && image.size > MAX_IMAGE) return { error: "That picture is too big (max 4 MB)." };

  const correctRaw = String(fd.get("correct") ?? "");
  const secondsRaw = Number(fd.get("seconds"));
  const data = {
    text: text || "(see picture)",
    choiceA: String(fd.get("choiceA") ?? "").trim(),
    choiceB: String(fd.get("choiceB") ?? "").trim(),
    choiceC: String(fd.get("choiceC") ?? "").trim(),
    choiceD: String(fd.get("choiceD") ?? "").trim(),
    correct: (LABELS as readonly string[]).includes(correctRaw) ? correctRaw : null,
    explanation: String(fd.get("explanation") ?? "").trim() || null,
    seconds: Number.isFinite(secondsRaw) && secondsRaw >= 0 ? Math.floor(secondsRaw) : (existing?.seconds ?? null),
    imageUrl: existing?.imageUrl ?? null,
  };
  if (fd.get("removeImage") === "1") data.imageUrl = null;
  if (hasNewImage) {
    try {
      const ext = image.type.split("/")[1] || "jpg";
      data.imageUrl = await uploadImage(Buffer.from(await image.arrayBuffer()), `video-question-${crypto.randomUUID()}.${ext}`, image.type);
    } catch {
      return { error: "Couldn't upload the picture. Try again." };
    }
  }

  if (existing?.questionId && !isComplete(data)) {
    return { error: "This one is already in the exam bank, so it needs all four choices and the answer." };
  }

  let row = existing
    ? await prisma.videoQuestion.update({ where: { id: existing.id }, data })
    : await prisma.videoQuestion.create({
        data: { ...data, userId, videoId, subject: video.subject, topic: videoTopic(video.title) },
      });

  if (isComplete(row)) {
    const questionId = await syncToBank(row);
    if (questionId !== row.questionId) row = await prisma.videoQuestion.update({ where: { id: row.id }, data: { questionId } });
  }
  refresh(videoId);
  return { item: toClient(row) };
}

/** Sets just the answer of a saved question (the quick A–D buttons on a pending one). */
export async function setVideoQuestionAnswerAction(id: string, correct: string): Promise<{ error: string } | { item: VQ }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Not logged in." };
  if (!(LABELS as readonly string[]).includes(correct)) return { error: "Pick A, B, C or D." };
  const q = await prisma.videoQuestion.findFirst({ where: { id, userId } });
  if (!q) return { error: "Question not found." };
  let row = await prisma.videoQuestion.update({ where: { id }, data: { correct } });
  if (isComplete(row)) {
    const questionId = await syncToBank(row);
    if (questionId !== row.questionId) row = await prisma.videoQuestion.update({ where: { id }, data: { questionId } });
  }
  refresh(q.videoId);
  return { item: toClient(row) };
}

export async function deleteVideoQuestionAction(id: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Not logged in." };
  const q = await prisma.videoQuestion.findFirst({ where: { id, userId } });
  if (!q) return { ok: true };
  await prisma.videoQuestion.delete({ where: { id } });
  if (q.questionId) await removeFromBank(q.questionId);
  refresh(q.videoId);
  return { ok: true };
}
