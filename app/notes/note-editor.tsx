"use client";

import { useActionState, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { saveNoteAction, type NoteFormState } from "./actions";
import { Button } from "@/components/ui";
import { FORMULA_SYMBOLS } from "@/lib/recall";
import { FormulaPreview } from "@/components/formula-math";

type Card = { key: string; id?: string; name: string; formula: string; hint: string };

const initialState: NoteFormState = { error: null };
let nextKey = 0;
const blank = (): Card => ({ key: `new-${nextKey++}`, name: "", formula: "", hint: "" });

export default function NoteEditor({
  note,
  subjects,
  topicSuggestions,
}: {
  note?: {
    id: string;
    subject: string;
    topic: string;
    body: string;
    cards: { id: string; name: string; formula: string; hint: string | null }[];
  };
  subjects: readonly { slug: string; name: string }[];
  topicSuggestions: Record<string, string[]>;
}) {
  const [state, formAction, pending] = useActionState(saveNoteAction, initialState);
  const [subject, setSubject] = useState(note?.subject ?? subjects[0].slug);
  const [cards, setCards] = useState<Card[]>(
    note?.cards.length
      ? note.cards.map((c) => ({ key: c.id, id: c.id, name: c.name, formula: c.formula, hint: c.hint ?? "" }))
      : [blank(), blank()]
  );
  // Last focused text field, so the symbol bar inserts where you're typing.
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const update = (key: string, field: "name" | "formula" | "hint", value: string) =>
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, [field]: value } : c)));

  function insertSymbol(sym: string) {
    const el = lastField.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const value = el.value.slice(0, start) + sym + el.value.slice(end);
    // Push the change through React state for controlled card fields.
    const key = el.dataset.card;
    const field = el.dataset.field as "name" | "formula" | "hint" | undefined;
    if (key && field) update(key, field, value);
    else el.value = value;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + sym.length, start + sym.length);
    });
  }

  const track = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    lastField.current = e.currentTarget;
  };

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {note?.id && <input type="hidden" name="noteId" value={note.id} />}
      <input type="hidden" name="cards" value={JSON.stringify(cards.map(({ id, name, formula, hint }) => ({ id, name, formula, hint })))} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Subject</span>
          <select name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="field">
            {subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Topic</span>
          <input
            name="topic"
            required
            defaultValue={note?.topic}
            list={`topics-${subject}`}
            placeholder="e.g. AC Circuits — reactance & impedance"
            className="field"
          />
          <datalist id={`topics-${subject}`}>
            {(topicSuggestions[subject] ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="sticky top-16 z-[5] -mx-1 flex flex-wrap gap-1 rounded-lg border border-border bg-bg/95 p-1.5 backdrop-blur-sm">
        {FORMULA_SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSymbol(s)}
            className="min-w-8 rounded-md px-1.5 py-1 font-mono text-sm text-ink-muted hover:bg-bg-muted hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-1 text-sm font-medium text-ink-muted">Formulas to memorize</h2>
        <p className="mb-3 text-xs text-ink-faint">
          The name is what you&rsquo;ll be asked in recall mode; the formula is the answer.
        </p>
        <ul className="flex flex-col gap-2">
          {cards.map((c, i) => (
            <li key={c.key} className="rounded-xl border border-border bg-bg-elevated p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-xs text-ink-faint tabular-nums">{i + 1}</span>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <input
                    value={c.name}
                    onChange={(e) => update(c.key, "name", e.target.value)}
                    onFocus={track}
                    data-card={c.key}
                    data-field="name"
                    placeholder="Name, e.g. Capacitive reactance"
                    aria-label={`Formula ${i + 1} name`}
                    className="field min-w-0"
                  />
                  <input
                    value={c.formula}
                    onChange={(e) => update(c.key, "formula", e.target.value)}
                    onFocus={track}
                    data-card={c.key}
                    data-field="formula"
                    placeholder="Formula, e.g. Xc = 1 / (2πfC)"
                    aria-label={`Formula ${i + 1}`}
                    className="field min-w-0 font-mono"
                  />
                  {c.formula.trim() && (
                    <div className="min-w-0 sm:col-span-2">
                      <FormulaPreview formula={c.formula} />
                    </div>
                  )}
                  <input
                    value={c.hint}
                    onChange={(e) => update(c.key, "hint", e.target.value)}
                    onFocus={track}
                    data-card={c.key}
                    data-field="hint"
                    placeholder="Optional: units or when to use it"
                    aria-label={`Formula ${i + 1} hint`}
                    className="field min-w-0 text-xs sm:col-span-2"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCards((cs) => (cs.length > 1 ? cs.filter((x) => x.key !== c.key) : [blank()]))}
                  aria-label={`Remove formula ${i + 1}`}
                  className="rounded-md p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
                >
                  <X size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setCards((cs) => [...cs, blank()])}>
          <Plus size={14} /> Add formula
        </Button>
      </section>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Notes</span>
        <textarea
          name="body"
          defaultValue={note?.body}
          onFocus={track}
          rows={8}
          placeholder="Key ideas, steps, things the instructor stressed…"
          className="field font-[inherit] leading-relaxed"
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </Button>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
