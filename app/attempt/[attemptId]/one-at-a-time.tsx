"use client";

import { useState, useTransition } from "react";
import { saveAnswerAction, finishAttemptAction } from "./actions";
import { Button, Card } from "@/components/ui";
import { useCountdown } from "@/lib/use-countdown";
import { ExamTimer } from "@/components/exam-timer";

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
  deadline,
}: {
  attemptId: string;
  questions: Question[];
  initialAnswers: Record<string, string>;
  deadline: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [, startSaveTransition] = useTransition();
  const [finishPending, startFinishTransition] = useTransition();
  const { ready, expired, label } = useCountdown(deadline);

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const progress = ((index + 1) / questions.length) * 100;

  function selectChoice(choiceId: string) {
    if (expired) return;
    setAnswers((prev) => ({ ...prev, [question.id]: choiceId }));
    startSaveTransition(async () => {
      await saveAnswerAction(attemptId, question.id, choiceId);
    });
  }

  function handleFinish() {
    startFinishTransition(async () => {
      await finishAttemptAction(attemptId);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {deadline && ready && <ExamTimer label={label!} expired={expired} />}

      <div>
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-ink-muted">
          Question {index + 1} of {questions.length}
        </p>
      </div>

      <Card>
        <p className="whitespace-pre-line">{question.text}</p>
        {question.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={question.imageUrl}
            alt=""
            className="mt-3 max-w-xs rounded-lg border border-border"
          />
        )}
        <div className="mt-4 flex flex-col gap-2">
          {question.choices.map((c) => (
            <label
              key={c.id}
              className={`choice-row ${expired ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="choice"
                checked={answers[question.id] === c.id}
                disabled={expired}
                onChange={() => selectChoice(c.id)}
              />
              {c.text}
            </label>
          ))}
        </div>
      </Card>

      <div className="flex justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          Previous
        </Button>
        {isLast || expired ? (
          <Button type="button" onClick={handleFinish} disabled={finishPending}>
            {finishPending ? "Finishing…" : "Finish"}
          </Button>
        ) : (
          <Button type="button" onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
