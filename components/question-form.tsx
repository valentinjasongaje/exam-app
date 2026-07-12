"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui";
import { ImageEditor } from "@/components/image-editor";

export type QuestionFormState = { error: string | null };

type Initial = {
  text: string;
  choices: { label: string; text: string; isCorrect: boolean }[];
  explanation: string;
  imageUrl: string | null;
  explanationImageUrl: string | null;
};

const LABELS = ["A", "B", "C", "D"] as const;

function EditableImage({
  src,
  fieldName,
  onEdited,
  edited,
}: {
  src: string;
  fieldName: string;
  onEdited: (dataUrl: string) => void;
  edited: string | null;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={edited ?? src} alt="" className="max-w-xs rounded-lg border border-border" />
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        className="flex items-center gap-1.5 text-sm text-accent hover:underline"
      >
        <Pencil size={13} />
        Edit image (remove watermark)
      </button>
      {edited && <input type="hidden" name={fieldName} value={edited} />}
      {editorOpen && (
        <ImageEditor
          src={edited ?? src}
          onSave={(dataUrl) => {
            onEdited(dataUrl);
            setEditorOpen(false);
          }}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}

export default function QuestionForm({
  action,
  initial,
  submitLabel,
}: {
  action: (prevState: QuestionFormState, formData: FormData) => Promise<QuestionFormState>;
  initial?: Initial;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [editedQuestionImage, setEditedQuestionImage] = useState<string | null>(null);
  const [editedExplanationImage, setEditedExplanationImage] = useState<string | null>(null);
  const choiceFor = (label: string) => initial?.choices.find((c) => c.label === label);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Question text
        <textarea name="text" required defaultValue={initial?.text} rows={4} className="field font-normal" />
      </label>

      {initial?.imageUrl && (
        <EditableImage
          src={initial.imageUrl}
          fieldName="editedQuestionImage"
          edited={editedQuestionImage}
          onEdited={setEditedQuestionImage}
        />
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {initial?.imageUrl ? "Replace question image" : "Question image (optional)"}
        <input type="file" name="questionImage" accept="image/*" className="text-sm font-normal text-ink-muted" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Choices (select the correct one)</legend>
        {LABELS.map((label) => (
          <div key={label} className="flex items-center gap-3">
            <input type="radio" name="correct" value={label} required defaultChecked={choiceFor(label)?.isCorrect} />
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-muted text-xs font-medium text-ink-muted">
              {label}
            </span>
            <input
              type="text"
              name={`choice${label}`}
              required
              defaultValue={choiceFor(label)?.text}
              className="field flex-1"
            />
          </div>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Explanation (optional)
        <textarea name="explanation" defaultValue={initial?.explanation} rows={3} className="field font-normal" />
      </label>

      {initial?.explanationImageUrl && (
        <EditableImage
          src={initial.explanationImageUrl}
          fieldName="editedExplanationImage"
          edited={editedExplanationImage}
          onEdited={setEditedExplanationImage}
        />
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {initial?.explanationImageUrl ? "Replace explanation image" : "Explanation image (optional)"}
        <input type="file" name="explanationImage" accept="image/*" className="text-sm font-normal text-ink-muted" />
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
