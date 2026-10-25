import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Play, Trash2 } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fromDbDate, subjectName, todayLocal } from "@/lib/study-plan";
import { BOX_LABEL, isDue } from "@/lib/recall";
import { Badge, Card, LinkButton } from "@/components/ui";
import { deleteNoteAction } from "../actions";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const note = await prisma.studyNote.findFirst({
    where: { id, userId: session!.user.id },
    include: { cards: { orderBy: { order: "asc" } } },
  });
  if (!note) notFound();
  const today = todayLocal();
  const due = note.cards.filter((c) => isDue(c.dueDate ? fromDbDate(c.dueDate) : null, today)).length;

  return (
    <>
      <Link href={`/notes?subject=${note.subject}`} className="text-sm text-ink-muted hover:text-ink">← Notes</Link>
      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-accent uppercase">{subjectName(note.subject)}</p>
          <h1 className="text-2xl font-semibold">{note.topic}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {note.cards.length} formula{note.cards.length === 1 ? "" : "s"}
            {note.cards.length > 0 && ` · ${due} due for recall`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {note.cards.length > 0 && (
            <LinkButton href={`/notes/recall?note=${note.id}`}>
              <Play size={14} className="fill-current" /> Recall this topic
            </LinkButton>
          )}
          <LinkButton href={`/notes/${note.id}/edit`} variant="secondary">
            <Pencil size={14} /> Edit
          </LinkButton>
        </div>
      </div>

      {note.cards.length > 0 && (
        <Card className="mb-6 p-0">
          <ul>
            {note.cards.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="text-sm text-ink-muted sm:w-56 sm:shrink-0">{c.name}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono break-words">{c.formula}</span>
                  {c.hint && <span className="block text-xs text-ink-faint">{c.hint}</span>}
                </span>
                <Badge tone={c.box >= 5 ? "success" : c.box === 0 ? "muted" : "accent"} className="self-start">
                  {BOX_LABEL[c.box]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {note.body.trim() && (
        <Card>
          <h2 className="mb-2 text-sm font-medium text-ink-muted">Notes</h2>
          <p className="leading-relaxed whitespace-pre-wrap">{note.body}</p>
        </Card>
      )}

      <form action={deleteNoteAction} className="mt-10">
        <input type="hidden" name="id" value={note.id} />
        <button type="submit" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-danger">
          <Trash2 size={14} /> Delete this note
        </button>
      </form>
    </>
  );
}
