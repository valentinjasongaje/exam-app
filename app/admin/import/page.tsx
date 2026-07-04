"use client";

import { useActionState, useState } from "react";
import {
  previewImportAction,
  commitImportAction,
  type PreviewState,
  type PreviewedExam,
  type CommitResult,
} from "./actions";

const initialState: PreviewState = { exams: [], error: null };

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

  function updateSubject(index: number, name: string) {
    const base = edited ?? state.exams;
    setEdited(
      base.map((e, i) =>
        i === index ? { ...e, subject: { ...e.subject, name, slug: slugify(name) } } : e
      )
    );
  }

  async function handleCommit() {
    if (!activeExams) return;
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
        <h1 className="mb-4 text-xl font-semibold">Import complete</h1>
        <ul className="flex flex-col gap-1 text-sm">
          {results.map((r, i) => (
            <li key={i}>
              {r.exam} ({r.subject}) — {r.questionCount} questions
            </li>
          ))}
        </ul>
        <a href="/admin/import" className="mt-4 inline-block underline">
          Import more
        </a>
      </div>
    );
  }

  if (!activeExams) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-semibold">Import exams</h1>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="file" name="files" accept=".html,.htm" multiple required />
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={previewPending}
            className="self-start rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {previewPending ? "Parsing…" : "Preview"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Review before importing</h1>
      {activeExams.map((e, i) => (
        <div key={i} className="rounded-md border border-neutral-200 p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Subject
              <input
                value={e.subject.name}
                onChange={(ev) => updateSubject(i, ev.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Exam title
              <input
                value={e.exam.title}
                onChange={(ev) => updateTitle(i, ev.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
          </div>
          <p className="text-sm text-neutral-500">
            {e.questions.length} questions · {e.issues.length} issue(s)
          </p>
          {e.issues.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-red-600">
              {e.issues.map((issue, j) => (
                <li key={j}>{JSON.stringify(issue)}</li>
              ))}
            </ul>
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
                  className="h-16 w-16 rounded border object-cover"
                />
              ))}
          </div>
        </div>
      ))}
      <button
        onClick={handleCommit}
        disabled={committing}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {committing ? "Importing…" : "Confirm import"}
      </button>
    </div>
  );
}
