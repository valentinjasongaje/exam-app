"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";

export type QuestionFormState = { error: string | null };

type Initial = {
  text: string;
  choices: { label: string; text: string; isCorrect: boolean }[];
  explanation: string;
  imageUrl: string | null;
  explanationImageUrl: string | null;
};

const LABELS = ["A", "B", "C", "D"] as const;

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
  const choiceFor = (label: string) => initial?.choices.find((c) => c.label === label);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Question text
        <textarea name="text" required defaultValue={initial?.text} rows={4} className="field font-normal" />
      </label>

      {initial?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={initial.imageUrl} alt="" className="max-w-xs rounded-lg border border-border" />
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={initial.explanationImageUrl} alt="" className="max-w-xs rounded-lg border border-border" />
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
