import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TRACKER_SUBJECTS } from "@/lib/study-plan";
import { topicSuggestions } from "@/lib/note-topics";
import { PageHeader } from "@/components/ui";
import NoteEditor from "../../note-editor";

export default async function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;
  const note = await prisma.studyNote.findFirst({
    where: { id, userId },
    include: { cards: { orderBy: { order: "asc" } } },
  });
  if (!note) notFound();
  return (
    <>
      <Link href={`/notes/${note.id}`} className="text-sm text-ink-muted hover:text-ink">← {note.topic}</Link>
      <PageHeader icon={Pencil} eyebrow="Notes" title="Edit note" />
      <NoteEditor note={note} subjects={TRACKER_SUBJECTS} topicSuggestions={await topicSuggestions(userId)} />
    </>
  );
}
