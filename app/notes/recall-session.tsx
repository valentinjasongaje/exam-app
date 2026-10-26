"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Eye, RotateCcw, X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import { recordRecallAction } from "./actions";
import FormulaMath from "@/components/formula-math";

type Card = { id: string; name: string; formula: string; hint: string | null; topic: string; subject: string };

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Flashcard loop: show the formula's name, try to recall it (out loud or on
 * paper), reveal, then mark Got it / Missed. Each answer is saved right away
 * so closing the tab mid-session loses nothing.
 */
export default function RecallSession({ cards, backHref }: { cards: Card[]; backHref: string }) {
  // Cards arrive already shuffled from the server (so server and browser
  // render the same order); later rounds are reshuffled on click.
  const [order, setOrder] = useState<Card[]>(cards);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();
  // Time on each card, for the automatic study log.
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const card = order[i];
  const finished = i >= order.length;
  const missed = order.filter((c) => results[c.id] === false);
  const got = order.filter((c) => results[c.id] === true).length;

  function grade(ok: boolean) {
    const c = card;
    setResults((r) => ({ ...r, [c.id]: ok }));
    const secs = (Date.now() - shownAt.current) / 1000;
    shownAt.current = Date.now();
    startTransition(() => recordRecallAction(c.id, ok, secs));
    setRevealed(false);
    setI((n) => n + 1);
  }

  if (order.length === 0) {
    return <p className="text-sm text-ink-muted">Nothing to recall here.</p>;
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm text-ink-muted">Done</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">
          {got}/{order.length}
        </p>
        <p className="mt-1 text-sm text-ink-muted">formulas recalled</p>
        {missed.length > 0 && (
          <div className="mt-6 text-left">
            <p className="mb-2 text-sm font-medium">Missed this round</p>
            <ul className="flex flex-col gap-2">
              {missed.map((c) => (
                <li key={c.id} className="rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2 text-sm">
                  <span className="text-ink-muted">{c.name}</span>
                  <span className="mt-1 block text-base text-ink">
                    <FormulaMath formula={c.formula} fit />
                  </span>
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
              <RotateCcw size={15} /> Drill the {missed.length} missed
            </Button>
          )}
          <Link href={backHref} className="inline-flex items-center rounded-lg px-4 py-2 text-sm text-ink-muted hover:bg-bg-muted hover:text-ink">
            Back to notes
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

      <div className="flex min-h-80 flex-col rounded-2xl border border-border bg-bg-elevated px-3 py-6 text-center shadow-sm sm:min-h-96 sm:px-6 sm:py-8">
        <p className="text-xs text-ink-faint">{card.topic}</p>
        <p className="mt-6 text-xl font-semibold">{card.name}</p>
        {!revealed ? (
          <p className="mt-4 text-sm text-ink-muted">Write it down or say it, then reveal.</p>
        ) : (
          <>
            <div className="my-auto py-6 text-xl text-accent sm:text-3xl">
              <FormulaMath formula={card.formula} display fit />
            </div>
            {card.hint && <p className="mt-3 text-sm text-ink-muted">{card.hint}</p>}
          </>
        )}
      </div>

      <div className="mt-4">
        {!revealed ? (
          <Button className="w-full py-3" onClick={() => setRevealed(true)}>
            <Eye size={16} /> Reveal formula
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => grade(false)}
              className={clsx("flex items-center justify-center gap-2 rounded-lg border border-danger/40 py-3 text-sm font-medium text-danger hover:bg-danger-soft")}
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
