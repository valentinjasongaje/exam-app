"use client";

import { useActionState, useRef, useState } from "react";
import { Pencil, Upload, FileText } from "lucide-react";
import { clsx } from "clsx";
import {
  previewImportAction,
  commitImportAction,
  type PreviewState,
  type PreviewedExam,
  type CommitResult,
} from "./actions";
import { PageHeader, Card, Button, Badge } from "@/components/ui";
import { CANONICAL_SUBJECTS } from "@/lib/subjects";
import { ImageEditor } from "@/components/image-editor";

type ImageField = "image" | "explanationImage";
type EditingTarget = { examIndex: number; questionIndex: number; field: ImageField };

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
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeExams = edited ?? (state.exams.length > 0 ? state.exams : null);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    setFileNames(Array.from(files).map((f) => f.name));
  }

  function handleDrop(ev: React.DragEvent<HTMLLabelElement>) {
    ev.preventDefault();
    setDragActive(false);
    const files = ev.dataTransfer.files;
    if (fileInputRef.current && files.length > 0) {
      fileInputRef.current.files = files;
    }
    handleFiles(files);
  }

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

  function updateBoardExamFlag(index: number, isBoardExam: boolean) {
    const base = edited ?? state.exams;
    setEdited(
      base.map((e, i) => (i === index ? { ...e, exam: { ...e.exam, isBoardExam } } : e))
    );
  }

  function updateQuestionImage(
    examIndex: number,
    questionIndex: number,
    field: ImageField,
    dataUrl: string
  ) {
    const base = edited ?? state.exams;
    setEdited(
      base.map((e, i) =>
        i !== examIndex
          ? e
          : {
              ...e,
              questions: e.questions.map((q, qi) =>
                qi !== questionIndex ? q : { ...q, [field]: { mime: "image/png", dataUrl } }
              ),
            }
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
            <label
              htmlFor="import-files"
              onDragOver={(ev) => {
                ev.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={clsx(
                "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragActive ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent"
              )}
            >
              <Upload size={22} className="text-ink-faint" />
              <p className="text-sm font-medium">
                {fileNames.length > 0
                  ? `${fileNames.length} file${fileNames.length > 1 ? "s" : ""} selected`
                  : "Click to browse or drag files here"}
              </p>
              <p className="text-xs text-ink-muted">.html or .htm files, multiple allowed</p>
              <input
                ref={fileInputRef}
                id="import-files"
                type="file"
                name="files"
                accept=".html,.htm"
                multiple
                required
                onChange={(ev) => handleFiles(ev.target.files)}
                className="sr-only"
              />
            </label>

            {fileNames.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-ink-muted">
                {fileNames.map((name) => (
                  <li key={name} className="flex items-center gap-2">
                    <FileText size={14} className="shrink-0" />
                    {name}
                  </li>
                ))}
              </ul>
            )}

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
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={e.exam.isBoardExam}
                onChange={(ev) => updateBoardExamFlag(i, ev.target.checked)}
              />
              This is a full board/preboard exam (enables the 4-hour timed mode)
            </label>
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
            <div className="mt-3 flex flex-wrap gap-3">
              {e.questions.flatMap((q, qi) => {
                const thumbs: { field: ImageField; label: string; dataUrl: string }[] = [];
                if (q.image) thumbs.push({ field: "image", label: `Q${q.order}`, dataUrl: q.image.dataUrl });
                if (q.explanationImage)
                  thumbs.push({
                    field: "explanationImage",
                    label: `Q${q.order} sol.`,
                    dataUrl: q.explanationImage.dataUrl,
                  });
                return thumbs.map((t) => (
                  <div key={`${qi}-${t.field}`} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.dataUrl}
                      alt=""
                      className="h-20 w-20 rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setEditing({ examIndex: i, questionIndex: qi, field: t.field })}
                      className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 text-transparent transition-colors group-hover:bg-black/40 group-hover:text-white"
                      aria-label={`Edit image for ${t.label}`}
                    >
                      <Pencil size={18} />
                    </button>
                    <p className="mt-1 text-center text-xs text-ink-muted">{t.label}</p>
                  </div>
                ));
              })}
            </div>
          </Card>
        ))}
      </div>

      {editing &&
        activeExams[editing.examIndex]?.questions[editing.questionIndex]?.[editing.field] && (
          <ImageEditor
            src={activeExams[editing.examIndex].questions[editing.questionIndex][editing.field]!.dataUrl}
            onSave={(dataUrl) => {
              updateQuestionImage(editing.examIndex, editing.questionIndex, editing.field, dataUrl);
              setEditing(null);
            }}
            onClose={() => setEditing(null)}
          />
        )}
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
