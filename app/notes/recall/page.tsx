import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isTrackerSubject, subjectName, toDbDate, todayLocal } from "@/lib/study-plan";
import { PageHeader, EmptyState } from "@/components/ui";
import RecallSession from "../recall-session";
import { shuffleCards } from "@/lib/shuffle-cards";

/**
 * /notes/recall?note=<id>        every formula in one note
 * /notes/recall?subject=elex     due formulas in a subject (add &all=1 for all)
 * /notes/recall                  everything due
 */
export default async function RecallPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string; subject?: string; all?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const p = await searchParams;
  const subject = isTrackerSubject(p.subject) ? p.subject : null;
  const dueOnly = !p.note && p.all !== "1";
  const today = toDbDate(todayLocal());

  const cards = await prisma.formulaCard.findMany({
    where: {
      userId,
      ...(p.note ? { noteId: p.note } : {}),
      ...(subject ? { note: { subject } } : {}),
      ...(dueOnly ? { OR: [{ dueDate: null }, { dueDate: { lte: today } }] } : {}),
    },
    include: { note: { select: { topic: true, subject: true } } },
    orderBy: [{ dueDate: "asc" }, { order: "asc" }],
  });

  const scope = p.note
    ? cards[0]?.note.topic ?? "This topic"
    : `${subject ? subjectName(subject) : "All subjects"} · ${dueOnly ? "due today" : "all formulas"}`;
  const backHref = p.note ? `/notes/${p.note}` : `/notes${subject ? `?subject=${subject}` : ""}`;

  return (
    <>
      <Link href={backHref} className="text-sm text-ink-muted hover:text-ink">← Notes</Link>
      <PageHeader eyebrow="Formula recall" title={scope} subtitle="Look at the name, recall the formula, then reveal and be honest." />
      {cards.length === 0 ? (
        <EmptyState>
          {dueOnly ? (
            <>
              Nothing due. Nice. <Link href={`/notes/recall?${subject ? `subject=${subject}&` : ""}all=1`} className="text-accent hover:underline">Drill everything anyway</Link>
            </>
          ) : (
            "No formulas here yet. Add some to a note first."
          )}
        </EmptyState>
      ) : (
        <RecallSession
          backHref={backHref}
          cards={shuffleCards(cards).map((c) => ({ id: c.id, name: c.name, formula: c.formula, hint: c.hint, topic: c.note.topic, subject: c.note.subject }))}
        />
      )}
    </>
  );
}
