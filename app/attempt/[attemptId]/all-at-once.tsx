"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { saveAnswerAction } from "./actions";
import { useCountdown } from "@/lib/use-countdown";
import { ExamTimer } from "@/components/exam-timer";
import { Card, Button } from "@/components/ui";

type Question = {
  id: string;
  text: string;
  imageUrl: string | null;
  choices: { id: string; text: string }[];
};

export default function AllAtOnce({
  attemptId,
  action,
  questions,
  answersByQuestion,
  deadline,
}: {
  attemptId: string;
  action: (formData: FormData) => void | Promise<void>;
  questions: Question[];
  answersByQuestion: Record<string, string | undefined>;
  deadline: string | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string | undefined>>(answersByQuestion);
  const [savePending, startSaveTransition] = useTransition();
  const { ready, expired, label } = useCountdown(deadline);

  const answeredCount = questions.filter((q) => answers[q.id]).length;

  function selectChoice(questionId: string, choiceId: string) {
    if (expired) return;
    setAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
    // Autosave each pick so a closed tab or crash doesn't lose a long exam.
    startSaveTransition(async () => {
      await saveAnswerAction(attemptId, questionId, choiceId);
    });
  }

  function guard(e: React.SyntheticEvent) {
    if (expired) e.preventDefault();
  }

  function confirmSubmit(e: React.FormEvent) {
    const unanswered = questions.length - answeredCount;
    if (unanswered > 0 && !expired) {
      const noun = unanswered === 1 ? "question" : "questions";
      if (!window.confirm(`You have ${unanswered} unanswered ${noun}. Submit anyway?`)) {
        e.preventDefault();
      }
    }
  }

  return (
    <form action={action} onSubmit={confirmSubmit} className="flex flex-col gap-5">
      {deadline && ready && <ExamTimer label={label!} expired={expired} />}

      <div className="sticky top-16 z-10 flex items-center justify-between rounded-lg border border-border bg-bg-elevated/90 px-4 py-2 text-sm backdrop-blur-sm">
        <span className="text-ink-muted">
          {answeredCount}/{questions.length} answered
        </span>
        <span className={clsx("text-xs", savePending ? "text-ink-faint" : "text-success")}>
          {savePending ? "Saving…" : "Saved"}
        </span>
      </div>

      {questions.map((q, i) => (
        <Card key={q.id}>
          <div className="mb-3 flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent">
              {i + 1}
            </span>
            <p className="whitespace-pre-line">{q.text}</p>
          </div>
          {q.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={q.imageUrl}
              alt=""
              className="mb-3 ml-9 max-w-xs rounded-lg border border-border"
            />
          )}
          <div className="ml-9 flex flex-col gap-2">
            {q.choices.map((c) => (
              <label
                key={c.id}
                className={clsx("choice-row", expired && "cursor-not-allowed opacity-60")}
                aria-disabled={expired}
                onClick={guard}
                onKeyDown={guard}
              >
                <input
                  type="radio"
                  name={`answer-${q.id}`}
                  value={c.id}
                  checked={answers[q.id] === c.id}
                  onChange={() => selectChoice(q.id, c.id)}
                />
                {c.text}
              </label>
            ))}
          </div>
        </Card>
      ))}
      <Button type="submit" className="self-start">
        Submit
      </Button>
    </form>
  );
}
