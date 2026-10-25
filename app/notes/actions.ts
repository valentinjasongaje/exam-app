"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isTrackerSubject, toDbDate, todayLocal } from "@/lib/study-plan";
import { nextRecall } from "@/lib/recall";

export type NoteFormState = { error: string | null };

type CardInput = { id?: string; name: string; formula: string; hint?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

function refresh() {
  revalidatePath("/notes", "layout");
  revalidatePath("/tracker");
}

/**
 * Create or update a note and its formula list in one go. Cards are matched
 * by id so recall history survives edits; cards removed in the editor are
 * deleted; a card whose formula text changed starts over in box 0.
 */
export async function saveNoteAction(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };

  const noteId = String(formData.get("noteId") ?? "") || null;
  const subject = String(formData.get("subject") ?? "");
  const topic = String(formData.get("topic") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  let cards: CardInput[];
  try {
    cards = JSON.parse(String(formData.get("cards") ?? "[]"));
  } catch {
    return { error: "Couldn't read the formulas. Try again." };
  }

  if (!isTrackerSubject(subject)) return { error: "Pick a subject." };
  if (!topic) return { error: "Give the note a topic." };
  if (topic.length > 200) return { error: "Keep the topic under 200 characters." };
  if (body.length > 20_000) return { error: "The note is too long (20,000 characters max)." };

  cards = cards
    .map((c) => ({ id: c.id, name: String(c.name ?? "").trim(), formula: String(c.formula ?? "").trim(), hint: String(c.hint ?? "").trim() }))
    .filter((c) => c.name || c.formula);
  const incomplete = cards.findIndex((c) => !c.name || !c.formula);
  if (incomplete >= 0) return { error: `Formula ${incomplete + 1} needs both a name and the formula.` };
  if (cards.length > 200) return { error: "That's a lot of formulas for one topic. Split it into two notes." };

  let id = noteId;
  if (id) {
    const existing = await prisma.studyNote.findFirst({ where: { id, userId }, include: { cards: true } });
    if (!existing) return { error: "Note not found." };
    const keep = new Map(existing.cards.map((c) => [c.id, c]));
    await prisma.$transaction([
      prisma.studyNote.update({ where: { id }, data: { subject, topic, body } }),
      prisma.formulaCard.deleteMany({
        where: { noteId: id, id: { notIn: cards.map((c) => c.id).filter((x): x is string => !!x && keep.has(x)) } },
      }),
      ...cards.map((c, order) => {
        const prev = c.id ? keep.get(c.id) : undefined;
        if (!prev) {
          return prisma.formulaCard.create({
            data: { noteId: id!, userId, name: c.name, formula: c.formula, hint: c.hint || null, order },
          });
        }
        const changed = prev.formula !== c.formula;
        return prisma.formulaCard.update({
          where: { id: prev.id },
          data: {
            name: c.name,
            formula: c.formula,
            hint: c.hint || null,
            order,
            ...(changed ? { box: 0, dueDate: null } : {}),
          },
        });
      }),
    ]);
  } else {
    const created = await prisma.studyNote.create({
      data: {
        userId,
        subject,
        topic,
        body,
        cards: { create: cards.map((c, order) => ({ userId, name: c.name, formula: c.formula, hint: c.hint || null, order })) },
      },
    });
    id = created.id;
  }

  refresh();
  redirect(`/notes/${id}`);
}

export async function deleteNoteAction(formData: FormData) {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.studyNote.deleteMany({ where: { id: String(formData.get("id") ?? ""), userId } });
  refresh();
  redirect("/notes");
}

/** Records one recall attempt and reschedules the card. */
export async function recordRecallAction(cardId: string, correct: boolean) {
  const userId = await requireUserId();
  if (!userId) return;
  const card = await prisma.formulaCard.findFirst({ where: { id: cardId, userId } });
  if (!card) return;
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
