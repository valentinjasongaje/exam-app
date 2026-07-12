import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deleteQuestionAction, reassignSubjectAction, setBoardExamAction } from "./actions";
import { PageHeader, Card, LinkButton, Button } from "@/components/ui";
import { CANONICAL_SUBJECTS } from "@/lib/subjects";

export default async function AdminExamPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      subject: true,
      questions: { orderBy: { order: "asc" } },
    },
  });

  if (!exam) notFound();

  const currentCanonicalSlug = CANONICAL_SUBJECTS.find((s) => s.slug === exam.subject.slug)?.slug;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={exam.subject.name}
        title={exam.title}
        action={
          <LinkButton href={`/admin/content/exams/${examId}/questions/new`} size="sm">
            Add question
          </LinkButton>
        }
      />

      <form
        action={reassignSubjectAction.bind(null, examId)}
        className="flex items-center gap-2 text-sm"
      >
        <label htmlFor="subjectSlug" className="text-ink-muted">
          Subject
        </label>
        <select
          id="subjectSlug"
          name="subjectSlug"
          defaultValue={currentCanonicalSlug ?? ""}
          className="field"
        >
          {!currentCanonicalSlug && (
            <option value="" disabled>
              {exam.subject.name} (not a canonical subject)
            </option>
          )}
          {CANONICAL_SUBJECTS.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Move
        </Button>
      </form>

      <form
        action={setBoardExamAction.bind(null, examId)}
        className="flex items-center gap-2 text-sm"
      >
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isBoardExam" defaultChecked={exam.isBoardExam} />
          Full board/preboard exam (enables the 4-hour timed mode)
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Save
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        {exam.questions.map((q) => (
          <Card key={q.id} className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs text-ink-muted">Q{q.order}</p>
              <p className="text-sm">{q.text}</p>
            </div>
            {q.explanationImageUrl && (
              <Link
                href={`/admin/content/exams/${examId}/questions/${q.id}/edit`}
                className="shrink-0"
              >
                <p className="mb-1 text-xs text-ink-muted">Solution</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={q.explanationImageUrl}
                  alt="Solution"
                  className="h-16 w-16 rounded-lg border border-border object-cover transition-colors hover:border-accent"
                />
              </Link>
            )}
            <div className="flex shrink-0 gap-4 text-sm">
              <Link
                href={`/admin/content/exams/${examId}/questions/${q.id}/edit`}
                className="text-accent hover:underline"
              >
                Edit
              </Link>
              <form action={deleteQuestionAction.bind(null, examId, q.id)}>
                <button type="submit" className="text-danger hover:underline">
                  Delete
                </button>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
