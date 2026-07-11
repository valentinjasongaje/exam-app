"use client";

import { clsx } from "clsx";
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
  action,
  questions,
  answersByQuestion,
  deadline,
}: {
  action: (formData: FormData) => void | Promise<void>;
  questions: Question[];
  answersByQuestion: Record<string, string | undefined>;
  deadline: string | null;
}) {
  const { ready, expired, label } = useCountdown(deadline);

  function guard(e: React.SyntheticEvent) {
    if (expired) e.preventDefault();
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {deadline && ready && <ExamTimer label={label!} expired={expired} />}
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
                  defaultChecked={answersByQuestion[q.id] === c.id}
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
