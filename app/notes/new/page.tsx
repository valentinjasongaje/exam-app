import Link from "next/link";
import { auth } from "@/auth";
import { TRACKER_SUBJECTS, isTrackerSubject } from "@/lib/study-plan";
import { topicSuggestions } from "@/lib/note-topics";
import { PageHeader } from "@/components/ui";
import NoteEditor from "../note-editor";

export default async function NewNotePage({ searchParams }: { searchParams: Promise<{ subject?: string; topic?: string }> }) {
  const session = await auth();
  const params = await searchParams;
  const suggestions = await topicSuggestions(session!.user.id);
  const subject = isTrackerSubject(params.subject) ? params.subject : TRACKER_SUBJECTS[0].slug;
  return (
    <>
      <Link href="/notes" className="text-sm text-ink-muted hover:text-ink">← Notes</Link>
      <PageHeader eyebrow="Notes" title="New topic note" subtitle="Write down the formulas as you review. You'll recall them later." />
      <NoteEditor
        note={{ id: "", subject, topic: params.topic ?? "", body: "", cards: [] }}
        subjects={TRACKER_SUBJECTS}
        topicSuggestions={suggestions}
      />
    </>
  );
}
