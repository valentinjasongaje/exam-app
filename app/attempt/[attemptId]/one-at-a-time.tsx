"use client";

import { useEffect, useState, useTransition } from "react";
import { clsx } from "clsx";
import { saveAnswerAction, finishAttemptAction } from "./actions";
import { Button, Card } from "@/components/ui";
import { useCountdown } from "@/lib/use-countdown";
import { ExamTimer } from "@/components/exam-timer";

type Question = {
  id: string;
  text: string;
  imageUrl: string | null;
  choices: { id: string; text: string }[];
  correctChoiceId: string | null; // only set when instant feedback is on
  explanation: string | null; // only set when instant feedback is on
};

const CHOICE_KEYS = ["a", "b", "c", "d"];

function firstUnanswered(questions: Question[], answers: Record<string, string>) {
  const index = questions.findIndex((q) => !answers[q.id]);
  return index === -1 ? questions.length - 1 : index;
}

export default function OneAtATime({
  attemptId,
  questions,
  initialAnswers,
  deadline,
  withFeedback,
}: {
  attemptId: string;
  questions: Question[];
  initialAnswers: Record<string, string>;
  deadline: string | null;
  withFeedback: boolean;
}) {
  const [index, setIndex] = useState(() => firstUnanswered(questions, initialAnswers));
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [, startSaveTransition] = useTransition();
  const [finishPending, startFinishTransition] = useTransition();
  const { ready, expired, label } = useCountdown(deadline);

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / questions.length) * 100;
  const currentAnswer = answers[question.id];
  const currentLocked = expired || (withFeedback && !!currentAnswer);

  function selectChoice(choiceId: string) {
    if (expired) return;
    // With instant feedback, the first pick is final — otherwise revealing
    // the answer and then "fixing" your pick would make scores meaningless.
    if (withFeedback && answers[question.id]) return;
    setAnswers((prev) => ({ ...prev, [question.id]: choiceId }));
    startSaveTransition(async () => {
      await saveAnswerAction(attemptId, question.id, choiceId);
    });
  }

  function handleFinish() {
    const unanswered = questions.length - answeredCount;
    if (unanswered > 0 && !expired) {
      const noun = unanswered === 1 ? "question" : "questions";
      if (!window.confirm(`You have ${unanswered} unanswered ${noun}. Finish anyway?`)) return;
    }
    startFinishTransition(async () => {
      await finishAttemptAction(attemptId);
    });
  }

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "ArrowLeft") {
        setIndex((i) => Math.max(0, i - 1));
      } else if (ev.key === "ArrowRight") {
        setIndex((i) => Math.min(questions.length - 1, i + 1));
      } else {
        const choiceIndex = CHOICE_KEYS.indexOf(ev.key.toLowerCase());
        if (choiceIndex === -1) return;
        const choice = questions[index].choices[choiceIndex];
        if (choice) selectChoice(choice.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, questions, expired, withFeedback, answers]);

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
          Question {index + 1} of {questions.length} · {answeredCount} answered
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Go to question ${i + 1}`}
            className={clsx(
              "flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-colors",
              i === index
                ? "bg-accent text-accent-ink"
                : answers[q.id]
                  ? "border border-accent bg-accent-soft text-accent"
                  : "border border-transparent bg-bg-muted text-ink-muted hover:text-ink"
            )}
          >
            {i + 1}
          </button>
        ))}
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
          {question.choices.map((c) => {
            const picked = currentAnswer === c.id;
            const revealed = withFeedback && !!currentAnswer;
            const isCorrectChoice = revealed && c.id === question.correctChoiceId;
            const isWrongPick = revealed && picked && c.id !== question.correctChoiceId;
            return (
              <label
                key={c.id}
                className={clsx(
                  "choice-row",
                  isCorrectChoice && "is-correct",
                  isWrongPick && "is-incorrect",
                  currentLocked && !revealed && "cursor-not-allowed opacity-60"
                )}
              >
                <input
                  type="radio"
                  name="choice"
                  checked={picked}
                  disabled={currentLocked}
                  onChange={() => selectChoice(c.id)}
                />
                {c.text}
                {isCorrectChoice && (
                  <span className="ml-auto text-xs font-medium text-success">correct</span>
                )}
                {isWrongPick && (
                  <span className="ml-auto text-xs font-medium text-danger">your answer</span>
                )}
              </label>
            );
          })}
        </div>
        {withFeedback && currentAnswer && question.explanation && (
          <p className="mt-3 whitespace-pre-line rounded-lg bg-bg-muted p-3 text-sm text-ink-muted">
            {question.explanation}
          </p>
        )}
      </Card>

      <p className="text-xs text-ink-faint">
        Keyboard: A–D to answer · ←/→ to move between questions
      </p>

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
