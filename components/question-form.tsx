"use client";

import { useActionState } from "react";

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
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Question text
        <textarea
          name="text"
          required
          defaultValue={initial?.text}
          rows={4}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      {initial?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={initial.imageUrl} alt="" className="max-w-xs rounded border" />
      )}
      <label className="flex flex-col gap-1 text-sm">
        {initial?.imageUrl ? "Replace question image" : "Question image (optional)"}
        <input type="file" name="questionImage" accept="image/*" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Choices (select the correct one)
        </legend>
        {LABELS.map((label) => (
          <div key={label} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              value={label}
              required
              defaultChecked={choiceFor(label)?.isCorrect}
            />
            <span className="w-4">{label}</span>
            <input
              type="text"
              name={`choice${label}`}
              required
              defaultValue={choiceFor(label)?.text}
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        Explanation (optional)
        <textarea
          name="explanation"
          defaultValue={initial?.explanation}
          rows={3}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      {initial?.explanationImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={initial.explanationImageUrl} alt="" className="max-w-xs rounded border" />
      )}
      <label className="flex flex-col gap-1 text-sm">
        {initial?.explanationImageUrl
          ? "Replace explanation image"
          : "Explanation image (optional)"}
        <input type="file" name="explanationImage" accept="image/*" />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
