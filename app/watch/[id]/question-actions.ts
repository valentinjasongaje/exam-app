"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadImage } from "@/lib/blob";
import { aiConfigured } from "@/lib/ai-explain";
import { makeDistractors } from "@/lib/ai-distractors";
import { nextRecall } from "@/lib/recall";
import { toDbDate, todayLocal, subjectName } from "@/lib/study-plan";
import { LABELS, isComplete, removeFromBank, syncToBank, videoTopic } from "@/lib/video-questions";
import { toClient, type VQ } from "./question-types";

const MAX_IMAGE = 4 * 1024 * 1024;
type Result = { error: string } | { item: VQ };

function refresh(videoId: string) {
  revalidatePath(`/watch/${videoId}`);
  revalidatePath("/dashboard");
  revalidatePath("/subject", "layout");
  revalidatePath("/notes", "layout");
}

async function upload(file: FormDataEntryValue | null, prefix: string) {
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_IMAGE) throw new Error("That picture is too big (max 4 MB).");
  const ext = file.type.split("/")[1] || "jpg";
  try {
    return await uploadImage(Buffer.from(await file.arrayBuffer()), `${prefix}-${crypto.randomUUID()}.${ext}`, file.type);
  } catch {
    throw new Error("Couldn't upload the picture. Try again.");
  }
}

/** Copies a complete multiple-choice question into the exam bank and records the link. */
async function bankIfComplete<T extends Parameters<typeof syncToBank>[0]>(row: T) {
  if (!isComplete(row)) return row;
  const questionId = await syncToBank(row);
  return questionId === row.questionId ? row : prisma.videoQuestion.update({ where: { id: row.id }, data: { questionId } });
}

/**
 * Saves a question written while watching. Two kinds:
 *  - "mcq": choices A–D. Drafts stay with the video; once complete it is
 *    copied into the subject's "Video questions" exam and kept in sync.
 *  - "solve": a problem worked on screen, with just the final answer (and a
 *    picture of the solution). Practised in /notes/problems.
 */
export async function saveVideoQuestionAction(fd: FormData): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Not logged in." };

  const id = String(fd.get("id") ?? "") || null;
  const videoId = String(fd.get("videoId") ?? "");
  const video = await prisma.studyVideo.findFirst({ where: { id: videoId, userId } });
  if (!video) return { error: "Video not found." };
  const existing = id ? await prisma.videoQuestion.findFirst({ where: { id, userId, videoId } }) : null;
  if (id && !existing) return { error: "Question not found." };

  const kind = fd.get("kind") === "solve" ? "solve" : "mcq";
  const text = String(fd.get("text") ?? "").trim();
  let imageUrl: string | null | undefined;
  let solutionImageUrl: string | null | undefined;
  try {
    imageUrl = await upload(fd.get("image"), "video-question");
    solutionImageUrl = await upload(fd.get("solutionImage"), "video-solution");
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (imageUrl === undefined) imageUrl = fd.get("removeImage") === "1" ? null : (existing?.imageUrl ?? null);
  if (solutionImageUrl === undefined) solutionImageUrl = fd.get("removeSolutionImage") === "1" ? null : (existing?.solutionImageUrl ?? null);
  if (!text && !imageUrl) return { error: "Write the question or add a picture of it." };

  const correctRaw = String(fd.get("correct") ?? "");
  const secondsRaw = Number(fd.get("seconds"));
  const data = {
    kind,
    text: text || "(see picture)",
    choiceA: String(fd.get("choiceA") ?? "").trim(),
    choiceB: String(fd.get("choiceB") ?? "").trim(),
    choiceC: String(fd.get("choiceC") ?? "").trim(),
    choiceD: String(fd.get("choiceD") ?? "").trim(),
    correct: kind === "mcq" && (LABELS as readonly string[]).includes(correctRaw) ? correctRaw : null,
    answer: String(fd.get("answer") ?? "").trim() || null,
    explanation: String(fd.get("explanation") ?? "").trim() || null,
    seconds: Number.isFinite(secondsRaw) && secondsRaw >= 0 ? Math.floor(secondsRaw) : (existing?.seconds ?? null),
    imageUrl,
    solutionImageUrl,
  };

  if (existing?.questionId && !isComplete(data)) {
    return { error: "This one is already in the exam bank, so it needs to stay multiple choice with all four choices and the answer." };
  }

  let row = existing
    ? await prisma.videoQuestion.update({ where: { id: existing.id }, data })
    : await prisma.videoQuestion.create({
        data: { ...data, userId, videoId, subject: video.subject, topic: videoTopic(video.title) },
      });
  row = await bankIfComplete(row);
  refresh(videoId);
  return { item: toClient(row) };
}

/** Sets just the answer of a saved multiple-choice question (the quick A–D buttons). */
export async function setVideoQuestionAnswerAction(id: string, correct: string): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Not logged in." };
  if (!(LABELS as readonly string[]).includes(correct)) return { error: "Pick A, B, C or D." };
  const q = await prisma.videoQuestion.findFirst({ where: { id, userId, kind: "mcq" } });
  if (!q) return { error: "Question not found." };
  const row = await bankIfComplete(await prisma.videoQuestion.update({ where: { id }, data: { correct } }));
  refresh(q.videoId);
  return { item: toClient(row) };
}

/**
 * Turns a solved problem into a multiple-choice question for the exam bank:
 * Claude writes three plausible wrong answers, the real answer lands on a
 * random letter.
 */
export async function makeMultipleChoiceAction(id: string): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Not logged in." };
  if (!aiConfigured()) return { error: "AI isn't set up (missing ANTHROPIC_API_KEY). Switch it to multiple choice and type the choices instead." };
  const q = await prisma.videoQuestion.findFirst({ where: { id, userId, kind: "solve" } });
  if (!q) return { error: "Question not found." };
  if (!q.answer) return { error: "Add the final answer first." };

  let wrong: string[];
  try {
    wrong = await makeDistractors({
      subject: subjectName(q.subject),
      text: q.text,
      answer: q.answer,
      imageUrl: q.imageUrl,
      solution: q.explanation,
    });
  } catch (e) {
    return { error: e instanceof Error && e.message.startsWith("Couldn't") ? e.message : "The AI request failed. Try again in a bit." };
  }
  const slot = crypto.randomInt(4);
  const options = [...wrong];
  options.splice(slot, 0, q.answer);
  const row = await bankIfComplete(
    await prisma.videoQuestion.update({
      where: { id },
      data: {
        kind: "mcq",
        choiceA: options[0],
        choiceB: options[1],
        choiceC: options[2],
        choiceD: options[3],
        correct: LABELS[slot],
      },
    })
  );
  refresh(q.videoId);
  return { item: toClient(row) };
}

/** Records one practice attempt of a solved problem and reschedules it. */
export async function recordProblemAction(id: string, correct: boolean) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;
  const q = await prisma.videoQuestion.findFirst({ where: { id, userId, kind: "solve" } });
  if (!q) return;
  const next = nextRecall(q.box, correct, todayLocal());
  await prisma.videoQuestion.update({
    where: { id },
    data: {
      box: next.box,
      dueDate: toDbDate(next.dueDate),
      lastReviewedAt: new Date(),
      ...(correct ? { timesRight: { increment: 1 } } : { timesWrong: { increment: 1 } }),
    },
  });
  revalidatePath("/notes", "layout");
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
