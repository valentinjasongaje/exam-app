"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toDbDate, todayLocal } from "@/lib/study-plan";
import { nextRecall } from "@/lib/recall";
import { persistNote, type CardInput, type NoteInput } from "@/lib/note-store";
import { addAutoTime, clampCardSeconds } from "@/lib/auto-log";

export type NoteFormState = { error: string | null };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

function refresh() {
  revalidatePath("/notes", "layout");
  revalidatePath("/tracker");
}

/** Note editor form: saves and opens the note. */
export async function saveNoteAction(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };
  let cards: CardInput[];
  try {
    cards = JSON.parse(String(formData.get("cards") ?? "[]"));
  } catch {
    return { error: "Couldn't read the formulas. Try again." };
  }
  const result = await persistNote(userId, {
    noteId: String(formData.get("noteId") ?? "") || null,
    subject: String(formData.get("subject") ?? ""),
    topic: String(formData.get("topic") ?? ""),
    body: String(formData.get("body") ?? ""),
    cards,
  });
  if ("error" in result) return { error: result.error ?? "Couldn't save." };
  refresh();
  redirect(`/notes/${result.noteId}`);
}

/**
 * Autosave from the notes panel next to the video player. Never redirects;
 * returns the note id and the ids given to new formula rows (by client key)
 * so later saves update instead of duplicating.
 */
export async function autosaveNoteAction(input: NoteInput) {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." } as const;
  const result = await persistNote(userId, input, { draft: true });
  if (!("error" in result)) revalidatePath("/notes", "layout");
  return result;
}

export async function deleteNoteAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.studyNote.deleteMany({ where: { id: String(formData.get("id") ?? ""), userId } });
  refresh();
  redirect("/notes");
}

/** Records one recall attempt and reschedules the card. */
export async function recordRecallAction(cardId: string, correct: boolean, seconds?: number) {
  const userId = await requireUserId();
  if (!userId) return;
  const card = await prisma.formulaCard.findFirst({ where: { id: cardId, userId }, include: { note: { select: { subject: true } } } });
  if (!card) return;
  // Recall time goes into today's study log on its own.
  await addAutoTime({
    userId,
    key: `${todayLocal()}:review:${card.note.subject}`,
    subject: card.note.subject,
    activity: "REVIEW",
    seconds: clampCardSeconds(seconds),
    note: "Formula recall & solved problems",
  });
  const next = nextRecall(card.box, correct, todayLocal());
  await prisma.formulaCard.update({
    where: { id: card.id },
    data: {
      box: next.box,
      dueDate: toDbDate(next.dueDate),
      lastReviewedAt: new Date(),
      ...(correct ? { correct: { increment: 1 } } : { wrong: { increment: 1 } }),
    },
  });
  revalidatePath("/notes", "layout");
  revalidatePath("/tracker");
}
