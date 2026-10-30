"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  Check,
  Eye,
  PlayCircle,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import FormulaMath from "@/components/formula-math";
import { ExamTimer } from "@/components/exam-timer";
import { useCountdown } from "@/lib/use-countdown";
import { formatTime } from "@/lib/timestamps";
import { recordRecallAction } from "../../notes/actions";
import { recordProblemAction } from "../../watch/[id]/question-actions";
import {
  finishInPlaceAction,
  saveAnswerAction,
} from "../../attempt/[attemptId]/actions";

type Formula = {
  id: string;
  name: string;
  formula: string;
  hint: string | null;
  topic: string;
};
type Question = {
  id: string;
  text: string;
  imageUrl: string | null;
  explanation: string | null;
  explanationImageUrl: string | null;
  choices: { id: string; label: string; text: string; isCorrect: boolean }[];
  fromMistakes: boolean;
  answeredChoiceId: string | null;
};
type Problem = {
  id: string;
  text: string;
  imageUrl: string | null;
  answer: string;
  solutionImageUrl: string | null;
  explanation: string | null;
  topic: string;
  videoId: string;
  seconds: number | null;
};

type Step =
  | { type: "formula"; item: Formula }
  | { type: "question"; item: Question }
  | { type: "problem"; item: Problem };

const SECTION = {
  formula: "Formula warm-up",
  question: "Questions",
  problem: "Solved problems",
} as const;

/**
 * One flow for the daily session: formulas (recall), multiple-choice
 * questions (answers saved to the day's attempt; right/wrong shown at once
 * only if Settings → "Show the answer right after each question" is on),
 * then solved problems from the videos. Each item is saved as you go.
 * A real countdown runs from when the session started; at zero it ends.
 */
export default function DailySession({
  attemptId,
  alreadyFinished,
  deadline: serverDeadline,
  minutes,
  showFeedback,
  formulas,
  questions,
  problems,
}: {
  attemptId: string | null;
  alreadyFinished: boolean;
  deadline: string | null;
  minutes: number;
  showFeedback: boolean;
  formulas: Formula[];
  questions: Question[];
  problems: Problem[];
}) {
  // Questions already answered (resuming later today) are skipped.
  const [steps] = useState<Step[]>(() => [
    ...formulas.map((item) => ({ type: "formula" as const, item })),
    ...questions
      .filter((q) => !q.answeredChoiceId)
      .map((item) => ({ type: "question" as const, item })),
    ...problems.map((item) => ({ type: "problem" as const, item })),
  ]);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({
    formula: [0, 0],
    question: [
      questions.filter(
        (q) => q.choices.find((c) => c.id === q.answeredChoiceId)?.isCorrect,
      ).length,
      questions.filter((q) => q.answeredChoiceId).length,
    ],
    problem: [0, 0],
  });
  const [finished, setFinished] = useState(alreadyFinished);
  // Your pick per question (incl. ones answered before a reload), for the results list.
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      questions
        .filter((q) => q.answeredChoiceId)
        .map((q) => [q.id, q.answeredChoiceId!]),
    ),
  );
  const [timeUp, setTimeUp] = useState(false);
  // Recall-only sessions (no question attempt) start their clock on open.
  const [deadline] = useState(
    () =>
      serverDeadline ?? new Date(Date.now() + minutes * 60_000).toISOString(),
  );
  const clock = useCountdown(deadline);
  const [, startTransition] = useTransition();
  const shownAt = useRef(0);

  const step = steps[i];
  // Time on each card, for the automatic study log.
  useEffect(() => {
    shownAt.current = Date.now();
  }, [i]);

  function tally(type: Step["type"], ok: boolean) {
    setScore((s) => ({
      ...s,
      [type]: [s[type][0] + (ok ? 1 : 0), s[type][1] + 1],
    }));
  }

  function next() {
    // Without instant feedback the pick can change until Next, so it's scored here.
    if (step?.type === "question" && !showFeedback && picked) {
      tally(
        "question",
        !!step.item.choices.find((c) => c.id === picked)?.isCorrect,
      );
    }
    setRevealed(false);
    setPicked(null);
    if (i + 1 >= steps.length) finish();
    setI((n) => n + 1);
    window.scrollTo({ top: 0 });
  }

  function finish() {
    setFinished(true);
    if (attemptId) startTransition(() => finishInPlaceAction(attemptId));
  }

  function grade(ok: boolean) {
    if (!step || step.type === "question") return;
    tally(step.type, ok);
    const id = step.item.id;
    const secs = (Date.now() - shownAt.current) / 1000;
    startTransition(() =>
      step.type === "formula"
        ? recordRecallAction(id, ok, secs)
        : recordProblemAction(id, ok, secs),
    );
    next();
  }

  function answer(q: Question, choiceId: string) {
    if (!attemptId || clock.expired) return;
    if (showFeedback) {
      if (picked) return; // locked once revealed
      tally("question", !!q.choices.find((c) => c.id === choiceId)?.isCorrect);
    } else if (picked === choiceId) return;
    setPicked(choiceId);
    setAnswers((a) => ({ ...a, [q.id]: choiceId }));
    startTransition(() => saveAnswerAction(attemptId, q.id, choiceId));
  }

  // Time's up: end the session (unanswered questions count as unanswered).
  const over = steps.length === 0 || finished || i >= steps.length;
  useEffect(() => {
    if (!clock.expired || over) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the clock reaching zero
    setTimeUp(true);
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.expired, over]);

  if (over) {
    const answeredQs = questions.filter((q) => answers[q.id]);
    const correctQs = answeredQs.filter(
      (q) => q.choices.find((c) => c.id === answers[q.id])?.isCorrect,
    ).length;
    const rows = [
      { label: "Formulas", s: score.formula },
      { label: "Questions", s: [correctQs, answeredQs.length] },
      { label: "Solved problems", s: score.problem },
    ].filter((r) => r.s[1] > 0);
    return (
      <div className="mx-auto max-w-3xl py-6">
        <div className="mx-auto max-w-lg text-center">
          {timeUp ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
              <AlarmClock size={16} /> Time&rsquo;s up
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              {steps.length === 0 && !attemptId
                ? "Nothing due right now"
                : "Done for today"}
            </p>
          )}
          {rows.length > 0 && (
            <ul className="mt-4 grid gap-2">
              {rows.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated px-4 py-3"
                >
                  <span className="text-sm text-ink-muted">{r.label}</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {r.s[0]}/{r.s[1]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-ink-muted">
            Wrong answers went into your mistake bank and come back tomorrow.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/daily"
              className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
            >
              Back to Today
            </Link>
          </div>
        </div>
        {questions.length > 0 && (
          <QuestionResults questions={questions} answers={answers} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {clock.ready && (
        <ExamTimer label={clock.label!} expired={clock.expired} />
      )}
      <div className="mb-2 flex items-center justify-between text-xs text-ink-muted tabular-nums">
        <span className="font-medium text-accent">{SECTION[step.type]}</span>
        <span>
          {i + 1} of {steps.length}
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${(i / steps.length) * 100}%` }}
        />
      </div>

      {step.type === "formula" && (
        <>
          <div className="flex min-h-72 flex-col rounded-2xl border border-border bg-bg-elevated px-3 py-6 text-center shadow-sm sm:px-6">
            <p className="text-xs text-ink-faint">{step.item.topic}</p>
            <p className="mt-6 text-xl font-semibold">{step.item.name}</p>
            {!revealed ? (
              <p className="mt-4 text-sm text-ink-muted">
                Write it down or say it, then reveal.
              </p>
            ) : (
              <>
                <div className="my-auto py-6 text-xl text-accent sm:text-3xl">
                  <FormulaMath formula={step.item.formula} display fit />
                </div>
                {step.item.hint && (
                  <p className="text-sm text-ink-muted">{step.item.hint}</p>
                )}
              </>
            )}
          </div>
          <GradeBar
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            onGrade={grade}
            revealLabel="Reveal formula"
          />
        </>
      )}

      {step.type === "problem" && (
        <>
          <div className="flex flex-col rounded-2xl border border-border bg-bg-elevated px-4 py-6 shadow-sm sm:px-6">
            <p className="text-center text-xs text-ink-faint">
              {step.item.topic}
            </p>
            {step.item.text !== "(see picture)" && (
              <p className="mt-4 text-lg leading-relaxed whitespace-pre-wrap">
                {step.item.text}
              </p>
            )}
            {step.item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={step.item.imageUrl}
                alt="The problem"
                className="mt-4 w-full rounded-lg border border-border"
              />
            )}
            {!revealed ? (
              <p className="mt-6 text-center text-sm text-ink-muted">
                Solve it on paper or with your calculator, then reveal.
              </p>
            ) : (
              <div className="mt-6 border-t border-border pt-6 text-center">
                <div className="text-xl text-accent sm:text-3xl">
                  <FormulaMath formula={step.item.answer} display fit />
                </div>
                {step.item.explanation && (
                  <p className="mt-4 text-left text-sm whitespace-pre-wrap text-ink-muted">
                    {step.item.explanation}
                  </p>
                )}
                {step.item.solutionImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={step.item.solutionImageUrl}
                    alt="The worked solution"
                    className="mt-4 w-full rounded-lg border border-border"
                  />
                )}
                <Link
                  href={`/watch/${step.item.videoId}${step.item.seconds ? `?t=${step.item.seconds}` : ""}`}
                  className="mt-4 inline-flex items-center gap-1 text-sm text-accent hover:underline"
                >
                  <PlayCircle size={14} /> Watch the solution
                  {step.item.seconds
                    ? ` (${formatTime(step.item.seconds)})`
                    : ""}
                </Link>
              </div>
            )}
          </div>
          <GradeBar
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            onGrade={grade}
            revealLabel="Reveal answer"
          />
        </>
      )}

      {step.type === "question" && (
        <>
          <div className="rounded-2xl border border-border bg-bg-elevated px-4 py-5 shadow-sm sm:px-6">
            {step.item.fromMistakes && (
              <p className="mb-2 inline-block rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                From your mistakes
              </p>
            )}
            <p className="text-base leading-relaxed whitespace-pre-wrap">
              {step.item.text}
            </p>
            {step.item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={step.item.imageUrl}
                alt=""
                className="mt-3 max-w-full rounded-lg border border-border"
              />
            )}
            <div className="mt-4 flex flex-col gap-2">
              {step.item.choices.map((c) => {
                const show = !!picked && showFeedback;
                const isPicked = picked === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={show}
                    aria-pressed={isPicked}
                    onClick={() => answer(step.item, c.id)}
                    className={clsx(
                      "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      !show && isPicked && "border-accent bg-accent-soft",
                      !show &&
                        !isPicked &&
                        "border-border hover:border-accent hover:bg-bg-muted",
                      show && c.isCorrect && "border-success bg-success-soft",
                      show &&
                        isPicked &&
                        !c.isCorrect &&
                        "border-danger bg-danger-soft",
                      show &&
                        !c.isCorrect &&
                        !isPicked &&
                        "border-border opacity-60",
                    )}
                  >
                    <span className="w-5 shrink-0 font-semibold text-ink-muted">
                      {c.label}
                    </span>
                    <span className="min-w-0 flex-1">{c.text}</span>
                    {show && c.isCorrect && (
                      <Check size={16} className="shrink-0 text-success" />
                    )}
                    {show && isPicked && !c.isCorrect && (
                      <X size={16} className="shrink-0 text-danger" />
                    )}
                  </button>
                );
              })}
            </div>
            {picked &&
              showFeedback &&
              (step.item.explanation || step.item.explanationImageUrl) && (
                <div className="mt-4 rounded-lg bg-bg-muted p-3 text-sm text-ink-muted">
                  {step.item.explanation && (
                    <p className="whitespace-pre-line">
                      {step.item.explanation}
                    </p>
                  )}
                  {step.item.explanationImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={step.item.explanationImageUrl}
                      alt=""
                      className="mt-2 max-w-full rounded-lg border border-border"
                    />
                  )}
                </div>
              )}
          </div>
          <div className="mt-4">
            <Button className="w-full py-3" disabled={!picked} onClick={next}>
              {picked ? (
                <>
                  Next <ArrowRight size={16} />
                </>
              ) : (
                "Pick an answer"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function GradeBar({
  revealed,
  onReveal,
  onGrade,
  revealLabel,
}: {
  revealed: boolean;
  onReveal: () => void;
  onGrade: (ok: boolean) => void;
  revealLabel: string;
}) {
  return (
    <div className="mt-4">
      {!revealed ? (
        <Button className="w-full py-3" onClick={onReveal}>
          <Eye size={16} /> {revealLabel}
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onGrade(false)}
            className="flex items-center justify-center gap-2 rounded-lg border border-danger/40 py-3 text-sm font-medium text-danger hover:bg-danger-soft"
          >
            <X size={16} /> Missed
          </button>
          <button
            type="button"
            onClick={() => onGrade(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-success py-3 text-sm font-medium text-bg hover:opacity-90"
          >
            <Check size={16} /> Got it
          </button>
        </div>
      )}
    </div>
  );
}

/** Every question of the session with your pick and the right answer; mistakes can be shown alone. */
function QuestionResults({
  questions,
  answers,
}: {
  questions: Question[];
  answers: Record<string, string>;
}) {
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const isWrong = (q: Question) =>
    !q.choices.find((c) => c.id === answers[q.id])?.isCorrect;
  const mistakes = questions.filter(isWrong).length;
  const shown = questions
    .map((q, n) => ({ q, n }))
    .filter(({ q }) => !onlyMistakes || isWrong(q));
  const tab = (active: boolean) =>
    clsx(
      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
      active
        ? "bg-bg-elevated text-ink shadow-sm"
        : "text-ink-muted hover:text-ink",
    );

  return (
    <section className="mt-10 text-left">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Results</h2>
        <div
          className="flex rounded-lg bg-bg-muted p-1"
          role="group"
          aria-label="Show"
        >
          <button
            type="button"
            onClick={() => setOnlyMistakes(false)}
            aria-pressed={!onlyMistakes}
            className={tab(!onlyMistakes)}
          >
            All {questions.length}
          </button>
          <button
            type="button"
            onClick={() => setOnlyMistakes(true)}
            aria-pressed={onlyMistakes}
            className={tab(onlyMistakes)}
          >
            Mistakes {mistakes}
          </button>
        </div>
      </div>
      {shown.length === 0 && (
        <p className="rounded-xl border border-border bg-bg-elevated px-4 py-6 text-center text-sm text-ink-muted">
          No mistakes. Nice!
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {shown.map(({ q, n }) => {
          const pick = answers[q.id];
          const right = !isWrong(q);
          return (
            <li
              key={q.id}
              className={clsx(
                "rounded-xl border bg-bg-elevated px-4 py-4 sm:px-5",
                right ? "border-border" : "border-danger/40",
              )}
            >
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="font-semibold text-ink-muted tabular-nums">
                  #{n + 1}
                </span>
                {right ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">
                    <Check size={12} /> Correct
                  </span>
                ) : pick ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger">
                    <X size={12} /> Wrong
                  </span>
                ) : (
                  <span className="rounded-full bg-bg-muted px-2 py-0.5 font-medium text-ink-muted">
                    Not answered
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {q.text}
              </p>
              {q.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={q.imageUrl}
                  alt=""
                  className="mt-3 max-w-full rounded-lg border border-border"
                />
              )}
              <ul className="mt-3 flex flex-col gap-1.5">
                {q.choices.map((c) => {
                  const mine = pick === c.id;
                  return (
                    <li
                      key={c.id}
                      className={clsx(
                        "flex items-start gap-3 rounded-lg border px-3 py-2 text-sm",
                        c.isCorrect
                          ? "border-success bg-success-soft"
                          : mine
                            ? "border-danger bg-danger-soft"
                            : "border-transparent text-ink-muted",
                      )}
                    >
                      <span className="w-5 shrink-0 font-semibold">
                        {c.label}
                      </span>
                      <span className="min-w-0 flex-1">{c.text}</span>
                      {mine && (
                        <span className="shrink-0 text-xs font-medium">
                          Your answer
                        </span>
                      )}
                      {c.isCorrect && (
                        <Check size={16} className="shrink-0 text-success" />
                      )}
                      {mine && !c.isCorrect && (
                        <X size={16} className="shrink-0 text-danger" />
                      )}
                    </li>
                  );
                })}
              </ul>
              {(q.explanation || q.explanationImageUrl) && (
                <div className="mt-3 rounded-lg bg-bg-muted p-3 text-sm text-ink-muted">
                  {q.explanation && (
                    <p className="whitespace-pre-line">{q.explanation}</p>
                  )}
                  {q.explanationImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={q.explanationImageUrl}
                      alt=""
                      className="mt-2 max-w-full rounded-lg border border-border"
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
