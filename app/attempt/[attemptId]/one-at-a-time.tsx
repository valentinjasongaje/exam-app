"use client";

import { useState, useTransition } from "react";
import { saveAnswerAction, finishAttemptAction } from "./actions";

type Question = {
  id: string;
  text: string;
  imageUrl: string | null;
  choices: { id: string; text: string }[];
};

export default function OneAtATime({
  attemptId,
  questions,
  initialAnswers,
}: {
  attemptId: string;
  questions: Question[];
  initialAnswers: Record<string, string>;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [pending, startTransition] = useTransition();

  const question = questions[index];
  const isLast = index === questions.length - 1;

  function selectChoice(choiceId: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: choiceId }));
    startTransition(async () => {
      await saveAnswerAction(attemptId, question.id, choiceId);
    });
  }

  function handleFinish() {
    startTransition(async () => {
      await finishAttemptAction(attemptId);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-neutral-500">
        Question {index + 1} of {questions.length}
      </p>
      <p className="whitespace-pre-line">{question.text}</p>
      {question.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={question.imageUrl} alt="" className="max-w-xs rounded border" />
      )}
      <div className="flex flex-col gap-2">
        {question.choices.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="choice"
              checked={answers[question.id] === c.id}
              onChange={() => selectChoice(c.id)}
            />
            {c.text}
          </label>
        ))}
      </div>
      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
        >
          Previous
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={handleFinish}
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {pending ? "Finishing…" : "Finish"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
