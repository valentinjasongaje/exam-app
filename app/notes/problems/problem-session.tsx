"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Eye, PlayCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui";
import FormulaMath from "@/components/formula-math";
import { formatTime } from "@/lib/timestamps";
import { recordProblemAction } from "../../watch/[id]/question-actions";

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

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const watchHref = (p: Problem) => `/watch/${p.videoId}${p.seconds ? `?t=${p.seconds}` : ""}`;

/** Problem → solve on paper → reveal answer + solution → Got it / Missed. */
export default function ProblemSession({ problems, backHref }: { problems: Problem[]; backHref: string }) {
  const [order, setOrder] = useState(problems);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const p = order[i];
  const missed = order.filter((x) => results[x.id] === false);
  const got = order.filter((x) => results[x.id] === true).length;

  function grade(ok: boolean) {
    const cur = p;
    setResults((r) => ({ ...r, [cur.id]: ok }));
    const secs = (Date.now() - shownAt.current) / 1000;
    shownAt.current = Date.now();
    startTransition(() => recordProblemAction(cur.id, ok, secs));
    setRevealed(false);
    setI((n) => n + 1);
    window.scrollTo({ top: 0 });
  }

  if (i >= order.length) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm text-ink-muted">Done</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">
          {got}/{order.length}
        </p>
        <p className="mt-1 text-sm text-ink-muted">problems solved</p>
        {missed.length > 0 && (
          <div className="mt-6 text-left">
            <p className="mb-2 text-sm font-medium">Missed this round</p>
            <ul className="flex flex-col gap-2">
              {missed.map((x) => (
                <li key={x.id} className="rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2 text-sm">
                  <span className="line-clamp-2 text-ink-muted">{x.text}</span>
                  <span className="mt-1 block text-base text-ink">
                    <FormulaMath formula={x.answer} fit />
                  </span>
                  <Link href={watchHref(x)} className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    <PlayCircle size={12} /> Rewatch the solution{x.seconds ? ` (${formatTime(x.seconds)})` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {missed.length > 0 && (
            <Button
              onClick={() => {
                setOrder(shuffle(missed));
                setResults({});
                setI(0);
              }}
            >
              <RotateCcw size={15} /> Retry the {missed.length} missed
            </Button>
          )}
          <Link href={backHref} className="inline-flex items-center rounded-lg px-4 py-2 text-sm text-ink-muted hover:bg-bg-muted hover:text-ink">
            Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between text-xs text-ink-muted tabular-nums">
        <span>
          {i + 1} of {order.length}
        </span>
        <span>
          {got} got · {missed.length} missed
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-bg-muted">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(i / order.length) * 100}%` }} />
      </div>

      <div className="flex flex-col rounded-2xl border border-border bg-bg-elevated px-4 py-6 shadow-sm sm:px-6 sm:py-8">
        <p className="text-center text-xs text-ink-faint">{p.topic}</p>
        {p.text !== "(see picture)" && <p className="mt-4 text-lg leading-relaxed whitespace-pre-wrap">{p.text}</p>}
        {p.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="The problem" className="mt-4 w-full rounded-lg border border-border" />
        )}

        {!revealed ? (
          <p className="mt-6 text-center text-sm text-ink-muted">Solve it on paper or with your calculator, then reveal.</p>
        ) : (
          <div className="mt-6 border-t border-border pt-6 text-center">
            <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">Answer</p>
            <div className="mt-2 text-xl text-accent sm:text-3xl">
              <FormulaMath formula={p.answer} display fit />
            </div>
            {p.explanation && <p className="mt-4 text-left text-sm whitespace-pre-wrap text-ink-muted">{p.explanation}</p>}
            {p.solutionImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.solutionImageUrl} alt="The worked solution" className="mt-4 w-full rounded-lg border border-border" />
            )}
            <Link href={watchHref(p)} className="mt-4 inline-flex items-center gap-1 text-sm text-accent hover:underline">
              <PlayCircle size={14} /> Watch the solution{p.seconds ? ` (${formatTime(p.seconds)})` : ""}
            </Link>
          </div>
        )}
      </div>

      <div className="mt-4">
        {!revealed ? (
          <Button className="w-full py-3" onClick={() => setRevealed(true)}>
            <Eye size={16} /> Reveal answer
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => grade(false)}
              className="flex items-center justify-center gap-2 rounded-lg border border-danger/40 py-3 text-sm font-medium text-danger hover:bg-danger-soft"
            >
              <X size={16} /> Missed
            </button>
            <button
              type="button"
              onClick={() => grade(true)}
              className="flex items-center justify-center gap-2 rounded-lg bg-success py-3 text-sm font-medium text-bg hover:opacity-90"
            >
              <Check size={16} /> Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
