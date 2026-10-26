"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Clock, Loader2, Play, Plus, X } from "lucide-react";
import { clsx } from "clsx";
import { autosaveNoteAction } from "../../notes/actions";
import { FORMULA_SYMBOLS } from "@/lib/recall";
import { FormulaPreview } from "@/components/formula-math";
import { playerBridge } from "@/lib/player-bridge";
import { formatTime, parseTimeline } from "@/lib/timestamps";

type Card = { key: string; id?: string; name: string; formula: string; hint: string };
type Status = "idle" | "dirty" | "saving" | "saved" | "error";

const blankWith = (key: string): Card => ({ key, name: "", formula: "", hint: "" });

/**
 * Note-taking beside the video: the topic's note (or a new one) with formula
 * rows, a symbol bar and free text. Saves on its own ~1 s after you stop
 * typing, so the video never has to stop.
 */
export default function WatchNotes({
  subject,
  topic,
  note,
}: {
  subject: string;
  topic: string;
  note: { id: string; body: string; cards: { id: string; name: string; formula: string; hint: string | null }[] } | null;
}) {
  const [noteId, setNoteId] = useState<string | null>(note?.id ?? null);
  const [body, setBody] = useState(note?.body ?? "");
  // Keys for new rows must match between the server render and the browser,
  // so they come from a per-component counter, not a module-level one.
  const nextKey = useRef(1);
  const blank = () => blankWith(`new-${nextKey.current++}`);
  const [cards, setCards] = useState<Card[]>(() => [
    ...(note?.cards ?? []).map((c) => ({ key: c.id, id: c.id, name: c.name, formula: c.formula, hint: c.hint ?? "" })),
    blankWith("new-0"),
  ]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // Latest values for the save loop, without re-creating timers.
  const latest = useRef({ noteId, body, cards });
  const saving = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    latest.current = { noteId, body, cards };
  }, [noteId, body, cards]);

  async function save() {
    if (saving.current) {
      again.current = true;
      return;
    }
    saving.current = true;
    setStatus("saving");
    const { noteId: id, body: b, cards: cs } = latest.current;
    const result = await autosaveNoteAction({
      noteId: id,
      subject,
      topic,
      body: b,
      cards: cs.map(({ key, id: cid, name, formula, hint }) => ({ key, id: cid, name, formula, hint })),
    }).catch(() => ({ error: "Couldn't save. Check your connection." }) as const);
    saving.current = false;
    if ("error" in result) {
      setStatus("error");
      setError(result.error ?? "Couldn't save.");
    } else {
      setError(null);
      setNoteId(result.noteId);
      setCards((xs) => xs.map((c) => (result.ids[c.key] ? { ...c, id: result.ids[c.key] } : c)));
      latest.current = {
        ...latest.current,
        noteId: result.noteId,
        cards: latest.current.cards.map((c) => (result.ids[c.key] ? { ...c, id: result.ids[c.key] } : c)),
      };
      setStatus(again.current ? "dirty" : "saved");
    }
    if (again.current) {
      again.current = false;
      save();
    }
  }

  function changed() {
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 1000);
  }

  // Save anything pending if the page is closed or the panel unmounts.
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        save();
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCard = (key: string, field: "name" | "formula" | "hint", value: string) => {
    setCards((xs) => {
      const next = xs.map((c) => (c.key === key ? { ...c, [field]: value } : c));
      // Always keep one empty row at the end to type the next formula into.
      const last = next[next.length - 1];
      return last.name || last.formula ? [...next, blank()] : next;
    });
    changed();
  };

  function insertSymbol(sym: string) {
    const el = lastField.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const value = el.value.slice(0, start) + sym + el.value.slice(end);
    const key = el.dataset.card;
    const field = el.dataset.field as "name" | "formula" | "hint" | undefined;
    if (key && field) setCard(key, field, value);
    else {
      setBody(value);
      changed();
    }
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + sym.length, start + sym.length);
    });
  }

  // Timestamps: "[12:34] " typed at the start of a line from the player's time.
  const playerReady = useSyncExternalStore(playerBridge.subscribe, () => playerBridge.get() !== null, () => false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const timeline = parseTimeline(body);

  function addTimestamp() {
    const player = playerBridge.get();
    const el = bodyRef.current;
    if (!player || !el) return;
    const stamp = `[${formatTime(player.getTime())}] `;
    const focused = document.activeElement === el;
    const start = focused ? el.selectionStart : body.length;
    const end = focused ? el.selectionEnd : body.length;
    const atLineStart = start === 0 || body[start - 1] === "\n";
    const insert = (atLineStart ? "" : "\n") + stamp;
    const next = body.slice(0, start) + insert + body.slice(end);
    setBody(next);
    changed();
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + insert.length, start + insert.length);
    });
  }

  const track = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    lastField.current = e.currentTarget;
  };
  const savedCount = cards.filter((c) => c.id).length;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Notes · {topic}</h2>
        <span className="flex items-center gap-1 text-xs text-ink-muted" aria-live="polite">
          {status === "saving" && (
            <>
              <Loader2 size={12} className="animate-spin" /> Saving
            </>
          )}
          {status === "saved" && (
            <>
              <Check size={12} className="text-success" /> Saved
            </>
          )}
          {status === "dirty" && "Editing…"}
          {status === "error" && <span className="text-danger">Not saved</span>}
        </span>
      </div>

      <div className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-bg p-1">
        {FORMULA_SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSymbol(s)}
            className="min-w-7 rounded px-1 py-0.5 font-mono text-xs text-ink-muted hover:bg-bg-muted hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-ink-muted">Formulas to memorize</p>
        <ul className="flex flex-col gap-1.5">
          {cards.map((c, i) => {
            const isLast = i === cards.length - 1;
            return (
              <li key={c.key} className={clsx("rounded-lg border p-2", isLast ? "border-dashed border-border-strong" : "border-border bg-bg-elevated")}>
                <div className="flex items-start gap-1.5">
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
                    <input
                      value={c.name}
                      onChange={(e) => setCard(c.key, "name", e.target.value)}
                      onFocus={track}
                      data-card={c.key}
                      data-field="name"
                      placeholder={isLast ? "New formula: name, e.g. Capacitive reactance" : "Name"}
                      aria-label={`Formula ${i + 1} name`}
                      className="field min-w-0 py-1.5 text-sm"
                    />
                    <input
                      value={c.formula}
                      onChange={(e) => setCard(c.key, "formula", e.target.value)}
                      onFocus={track}
                      data-card={c.key}
                      data-field="formula"
                      placeholder="Formula, e.g. Xc = 1 / (2πfC)"
                      aria-label={`Formula ${i + 1}`}
                      className="field min-w-0 py-1.5 font-mono text-sm"
                    />
                    <FormulaPreview formula={c.formula} />
                    {(c.name || c.formula) && (
                      <input
                        value={c.hint}
                        onChange={(e) => setCard(c.key, "hint", e.target.value)}
                        onFocus={track}
                        data-card={c.key}
                        data-field="hint"
                        placeholder="Optional: units or when to use it"
                        aria-label={`Formula ${i + 1} hint`}
                        className="field min-w-0 py-1 text-xs"
                      />
                    )}
                  </div>
                  {!isLast && (
                    <button
                      type="button"
                      onClick={() => {
                        setCards((xs) => xs.filter((x) => x.key !== c.key));
                        changed();
                      }}
                      aria-label={`Remove formula ${i + 1}`}
                      className="rounded p-1 text-ink-faint hover:bg-danger-soft hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {!isLast && (c.name || c.formula) && !(c.name && c.formula) && (
                  <p className="mt-1 text-xs text-ink-faint">Saved once it has both a name and a formula.</p>
                )}
              </li>
            );
          })}
        </ul>
        {cards.length === 1 && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-faint">
            <Plus size={12} /> A new row appears as soon as you start typing.
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="watch-notes-body" className="text-xs font-medium text-ink-muted">
            Notes
          </label>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addTimestamp}
            disabled={!playerReady}
            title={playerReady ? "Add the video's current time (Alt+T)" : "Timestamps need the built-in player"}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent"
          >
            <Clock size={12} /> Add timestamp
          </button>
        </div>
        <textarea
          id="watch-notes-body"
          ref={bodyRef}
          onKeyDown={(e) => {
            if (e.altKey && e.code === "KeyT") {
              e.preventDefault();
              addTimestamp();
            }
          }}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            changed();
          }}
          onFocus={track}
          rows={6}
          placeholder="Key ideas, steps, what the instructor stressed… Tap ⏱ Add timestamp to mark the video time."
          className="field min-h-32 flex-1 text-sm leading-relaxed"
        />
      </div>

      {timeline.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-muted">Timeline · tap to jump</p>
          <ul className="flex flex-col">
            {timeline.map((t, i) => (
              <li key={`${t.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => playerBridge.get()?.seek(t.seconds)}
                  disabled={!playerReady}
                  className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-bg-muted disabled:hover:bg-transparent"
                >
                  <span className="shrink-0 font-mono text-xs text-accent tabular-nums">{t.label}</span>
                  <span className="min-w-0 truncate text-ink-muted">{t.text || "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
      {noteId && savedCount > 0 && (
        <Link href={`/notes/recall?note=${noteId}`} className="inline-flex items-center gap-1.5 self-start text-sm text-accent hover:underline">
          <Play size={12} className="fill-current" /> {savedCount === 1 ? "Recall this formula" : `Recall these ${savedCount} formulas`}
        </Link>
      )}
    </div>
  );
}
