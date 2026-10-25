import { prisma } from "@/lib/prisma";
import { isTrackerSubject } from "@/lib/study-plan";

/**
 * Shared note saving for the note editor (/notes) and the notes panel on the
 * video player. Cards are matched by id so recall history survives edits;
 * cards removed by the user are deleted; a card whose formula text changed
 * starts over in box 0.
 */

export type CardInput = { key?: string; id?: string; name: string; formula: string; hint?: string };
export type NoteInput = { noteId: string | null; subject: string; topic: string; body: string; cards: CardInput[] };

/**
 * `draft` mode (autosave while typing): half-filled formula rows are skipped
 * instead of rejected, and an existing card that is half-edited right now is
 * left as it was rather than deleted.
 */
export async function persistNote(userId: string, input: NoteInput, opts: { draft?: boolean } = {}) {
  const subject = input.subject;
  const topic = input.topic.trim();
  const body = input.body ?? "";
  if (!isTrackerSubject(subject)) return { error: "Pick a subject." } as const;
  if (!topic) return { error: "Give the note a topic." } as const;
  if (topic.length > 200) return { error: "Keep the topic under 200 characters." } as const;
  if (body.length > 20_000) return { error: "The note is too long (20,000 characters max)." } as const;

  const all = (input.cards ?? []).map((c) => ({
    key: c.key,
    id: c.id,
    name: String(c.name ?? "").trim(),
    formula: String(c.formula ?? "").trim(),
    hint: String(c.hint ?? "").trim(),
  }));
  const nonEmpty = all.filter((c) => c.name || c.formula);
  const incomplete = nonEmpty.filter((c) => !c.name || !c.formula);
  if (!opts.draft && incomplete.length) {
    return { error: `Formula ${nonEmpty.indexOf(incomplete[0]) + 1} needs both a name and the formula.` } as const;
  }
  const complete = nonEmpty.filter((c) => c.name && c.formula);
  if (complete.length > 200) return { error: "That's a lot of formulas for one topic. Split it into two notes." } as const;

  const ids: Record<string, string> = {};
  let noteId = input.noteId;

  if (noteId) {
    const existing = await prisma.studyNote.findFirst({ where: { id: noteId, userId }, include: { cards: true } });
    if (!existing) return { error: "Note not found." } as const;
    const prevById = new Map(existing.cards.map((c) => [c.id, c]));
    // In draft mode, keep cards that are mid-edit (half-empty) untouched.
    const keepIds = new Set(
      [...complete, ...(opts.draft ? incomplete : [])].map((c) => c.id).filter((x): x is string => !!x && prevById.has(x))
    );
    await prisma.$transaction(async (tx) => {
      await tx.studyNote.update({ where: { id: noteId! }, data: { subject, topic, body } });
      await tx.formulaCard.deleteMany({ where: { noteId: noteId!, id: { notIn: [...keepIds] } } });
      for (const [order, c] of complete.entries()) {
        const prev = c.id ? prevById.get(c.id) : undefined;
        if (prev) {
          await tx.formulaCard.update({
            where: { id: prev.id },
            data: {
              name: c.name,
              formula: c.formula,
              hint: c.hint || null,
              order,
              ...(prev.formula !== c.formula ? { box: 0, dueDate: null } : {}),
            },
          });
          if (c.key) ids[c.key] = prev.id;
        } else {
          const created = await tx.formulaCard.create({
            data: { noteId: noteId!, userId, name: c.name, formula: c.formula, hint: c.hint || null, order },
          });
          if (c.key) ids[c.key] = created.id;
        }
      }
    });
  } else {
    const created = await prisma.studyNote.create({ data: { userId, subject, topic, body } });
    noteId = created.id;
    for (const [order, c] of complete.entries()) {
      const card = await prisma.formulaCard.create({
        data: { noteId, userId, name: c.name, formula: c.formula, hint: c.hint || null, order },
      });
      if (c.key) ids[c.key] = card.id;
    }
  }
  return { noteId: noteId!, ids } as const;
}
