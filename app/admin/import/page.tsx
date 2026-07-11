"use client";

import { useActionState, useState } from "react";
import {
  previewImportAction,
  commitImportAction,
  type PreviewState,
  type PreviewedExam,
  type CommitResult,
} from "./actions";
import { PageHeader, Card, Button, Badge } from "@/components/ui";
import { CANONICAL_SUBJECTS } from "@/lib/subjects";

const initialState: PreviewState = { exams: [], error: null };

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalSlugOf(slug: string) {
  return CANONICAL_SUBJECTS.some((s) => s.slug === slug) ? slug : "";
}

export default function ImportPage() {
  const [state, formAction, previewPending] = useActionState(previewImportAction, initialState);
  const [edited, setEdited] = useState<PreviewedExam[] | null>(null);
  const [committing, setCommitting] = useState(false);
  const [results, setResults] = useState<CommitResult[] | null>(null);

  const activeExams = edited ?? (state.exams.length > 0 ? state.exams : null);

  function updateTitle(index: number, title: string) {
    const base = edited ?? state.exams;
    setEdited(
      base.map((e, i) =>
        i === index ? { ...e, exam: { ...e.exam, title, slug: slugify(title) } } : e
      )
    );
  }

  function updateSubject(index: number, slug: string) {
    const canonical = CANONICAL_SUBJECTS.find((s) => s.slug === slug);
    if (!canonical) return;
    const base = edited ?? state.exams;
    setEdited(
      base.map((e, i) =>
        i === index ? { ...e, subject: { name: canonical.name, slug: canonical.slug } } : e
      )
    );
  }

  const hasUnassignedSubjects = (activeExams ?? []).some(
    (e) => !canonicalSlugOf(e.subject.slug)
  );

  async function handleCommit() {
    if (!activeExams || hasUnassignedSubjects) return;
    setCommitting(true);
    try {
      const res = await commitImportAction(activeExams);
      setResults(res);
    } finally {
      setCommitting(false);
    }
  }

  if (results) {
    return (
      <div>
        <PageHeader title="Import complete" />
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <Card key={i} className="flex items-center justify-between text-sm">
              <span>
                {r.exam} <span className="text-ink-muted">({r.subject})</span>
              </span>
              <Badge tone="success">{r.questionCount} questions</Badge>
            </Card>
          ))}
        </div>
        <a href="/admin/import" className="mt-6 inline-block text-sm text-accent hover:underline">
          Import more
        </a>
      </div>
    );
  }

  if (!activeExams) {
    return (
      <div>
        <PageHeader title="Import exams" subtitle="Upload scraped HTML files to preview before committing." />
        <Card>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="file" name="files" accept=".html,.htm" multiple required className="text-sm" />
            {state.error && <p className="text-sm text-danger">{state.error}</p>}
            <Button type="submit" disabled={previewPending} className="self-start">
              {previewPending ? "Parsing…" : "Preview"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Review before importing" />
      <div className="flex flex-col gap-4">
        {activeExams.map((e, i) => (
          <Card key={i}>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
                Subject
                <select
                  value={canonicalSlugOf(e.subject.slug)}
                  onChange={(ev) => updateSubject(i, ev.target.value)}
                  className="field font-normal"
                >
                  <option value="" disabled>
                    Choose subject…
                  </option>
                  {CANONICAL_SUBJECTS.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
                Exam title
                <input
                  value={e.exam.title}
                  onChange={(ev) => updateTitle(i, ev.target.value)}
                  className="field font-normal"
                />
              </label>
            </div>
            <p className="text-sm text-ink-muted">
              {e.questions.length} questions · {e.issues.length} issue(s)
            </p>
            {e.issues.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 rounded-lg bg-danger-soft p-3 text-sm text-danger">
                {e.issues.map((issue, j) => (
                  <p key={j}>{JSON.stringify(issue)}</p>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {e.questions
                .filter((q) => q.image)
                .slice(0, 6)
                .map((q, j) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={j}
                    src={q.image!.dataUrl}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-border object-cover"
                  />
                ))}
            </div>
          </Card>
        ))}
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button onClick={handleCommit} disabled={committing || hasUnassignedSubjects} className="self-start">
          {committing ? "Importing…" : "Confirm import"}
        </Button>
        {hasUnassignedSubjects && (
          <p className="text-sm text-danger">Choose a subject for every exam before importing.</p>
        )}
      </div>
    </div>
  );
}
