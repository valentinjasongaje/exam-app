"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRightLeft, Check, Clock, Loader2, Pencil, Play, Plus, Sigma, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { autosaveNoteAction } from "../../notes/actions";
import SymbolBar from "@/components/symbol-bar";
import FormulaMath, { FormulaPreview } from "@/components/formula-math";
import { playerBridge } from "@/lib/player-bridge";
import { formatTime, parseTime, parseTimeline } from "@/lib/timestamps";
import {
  addMarkerAction,
  deleteMarkerAction,
  moveTimestampsToTimelineAction,
  updateMarkerAction,
  type Marker,
} from "./marker-actions";

type Card = { key: string; id?: string; name: string; formula: string; hint: string };
type Status = "idle" | "dirty" | "saving" | "saved" | "error";
type Field = HTMLInputElement | HTMLTextAreaElement;

const Section = ({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <div className="flex min-h-7 items-center justify-between gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {title}
        {!!count && <span className="ml-1.5 font-normal normal-case">{count}</span>}
      </h3>
      {action}
    </div>
    {children}
  </section>
);

const smallBtn =
  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent";

/**
 * Note-taking beside the video, in three parts:
 *  - Formulas to memorize: a read-only list (math rendered) with edit per row
 *    and "Add formula"; feeds formula recall.
 *  - Timeline: "this part is about…" markers for this video; tap to jump.
 *  - Key points: free text for terms and ideas to remember (autosaves).
 */
export default function WatchNotes({
  videoId,
  subject,
  topic,
  note,
  initialMarkers,
}: {
  videoId: string;
  subject: string;
  topic: string;
  note: { id: string; body: string; cards: { id: string; name: string; formula: string; hint: string | null }[] } | null;
  initialMarkers: Marker[];
}) {
  const [noteId, setNoteId] = useState<string | null>(note?.id ?? null);
  const [body, setBody] = useState(note?.body ?? "");
  const [cards, setCards] = useState<Card[]>(() =>
    (note?.cards ?? []).map((c) => ({ key: c.id, id: c.id, name: c.name, formula: c.formula, hint: c.hint ?? "" }))
  );
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // ---- saving (note text + formulas go through one autosave) ----
  const latest = useRef({ noteId, body, cards });
  const saving = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const withIds = (xs: Card[]) => xs.map((c) => (result.ids[c.key] ? { ...c, id: result.ids[c.key] } : c));
      setCards(withIds);
      latest.current = { ...latest.current, noteId: result.noteId, cards: withIds(latest.current.cards) };
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

  // ---- formulas ----
  const nextKey = useRef(1);
  const [editing, setEditing] = useState<{ key: string | null; name: string; formula: string; hint: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const formulaInput = useRef<Field | null>(null);

  function commitCards(next: Card[]) {
    setCards(next);
    latest.current = { ...latest.current, cards: next };
    if (timer.current) clearTimeout(timer.current);
    save();
  }

  function saveFormula() {
    if (!editing) return;
    const name = editing.name.trim();
    const formula = editing.formula.trim();
    if (!name || !formula) {
      setFormError("It needs both a name and the formula.");
      return;
    }
    const row = { name, formula, hint: editing.hint.trim() };
    commitCards(
      editing.key
        ? cards.map((c) => (c.key === editing.key ? { ...c, ...row } : c))
        : [...cards, { key: `new-${nextKey.current++}`, ...row }]
    );
    setEditing(null);
    setFormError(null);
  }

  function removeFormula(key: string) {
    commitCards(cards.filter((c) => c.key !== key));
    setEditing(null);
  }

  const savedCount = cards.filter((c) => c.id).length;

  const formulaForm = editing && (
    <div className="flex flex-col gap-1.5 rounded-lg border border-accent/40 bg-bg p-2">
      <SymbolBar target={formulaInput} />
      <input
        value={editing.name}
        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && saveFormula()}
        autoFocus
        placeholder="Name, e.g. Capacitive reactance"
        aria-label="Formula name"
        className="field py-1.5 text-sm"
      />
      <input
        ref={(el) => {
          formulaInput.current = el;
        }}
        value={editing.formula}
        onChange={(e) => setEditing({ ...editing, formula: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && saveFormula()}
        placeholder="Formula, e.g. Xc = 1 / (2πfC)"
        aria-label="Formula"
        className="field py-1.5 font-mono text-sm"
      />
      <FormulaPreview formula={editing.formula} />
      <input
        value={editing.hint}
        onChange={(e) => setEditing({ ...editing, hint: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && saveFormula()}
        placeholder="Optional: units or when to use it"
        aria-label="Hint"
        className="field py-1 text-xs"
      />
      {formError && <p className="text-xs text-danger">{formError}</p>}
      <div className="flex items-center justify-between gap-2">
        {editing.key ? (
          <button
            type="button"
            onClick={() => removeFormula(editing.key!)}
            className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-danger"
          >
            <Trash2 size={12} /> Delete
          </button>
        ) : (
          <span />
        )}
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormError(null);
            }}
            className="rounded-md px-2.5 py-1 text-xs text-ink-muted hover:bg-bg-muted"
          >
            Cancel
          </button>
          <button type="button" onClick={saveFormula} className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink">
            <Check size={12} /> Save
          </button>
        </span>
      </div>
    </div>
  );

  // ---- timeline ----
  const playerReady = useSyncExternalStore(playerBridge.subscribe, () => playerBridge.get() !== null, () => false);
  const [markers, setMarkers] = useState<Marker[]>(() => [...initialMarkers].sort((a, b) => a.seconds - b.seconds));
  const [markerDraft, setMarkerDraft] = useState<{ id: string | null; time: string; label: string } | null>(null);
  const [markerBusy, setMarkerBusy] = useState(false);
  const [now, setNow] = useState(0);

  // Follow playback to highlight the part being watched.
  useEffect(() => {
    if (!playerReady) return;
    const t = setInterval(() => setNow(playerBridge.get()?.getTime() ?? 0), 1000);
    return () => clearInterval(t);
  }, [playerReady]);
  const activeId = [...markers].reverse().find((m) => m.seconds <= now + 0.5)?.id;

  function markNow() {
    const t = playerBridge.get()?.getTime() ?? 0;
    setMarkerDraft({ id: null, time: formatTime(t), label: "" });
  }

  async function saveMarker() {
    if (!markerDraft) return;
    if (!/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(markerDraft.time.trim())) {
      setError("Time should look like 4:30 or 1:02:30.");
      return;
    }
    setMarkerBusy(true);
    const secs = parseTime(markerDraft.time.trim());
    const res = await (markerDraft.id
      ? updateMarkerAction(markerDraft.id, secs, markerDraft.label)
      : addMarkerAction(videoId, secs, markerDraft.label)
    ).catch(() => ({ error: "Couldn't save. Check your connection." }));
    setMarkerBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setError(null);
    setMarkers((xs) => [...xs.filter((x) => x.id !== res.marker.id), res.marker].sort((a, b) => a.seconds - b.seconds));
    setMarkerDraft(null);
  }

  async function removeMarker(id: string) {
    setMarkers((xs) => xs.filter((x) => x.id !== id));
    setMarkerDraft(null);
    await deleteMarkerAction(id).catch(() => null);
  }

  // Notes from before the timeline existed may hold "[m:ss] …" lines.
  const legacyLines = parseTimeline(body).length;
  async function moveLegacy() {
    if (!noteId) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      await save();
    }
    setMarkerBusy(true);
    const res = await moveTimestampsToTimelineAction(videoId, noteId).catch(() => ({ error: "Couldn't move them." }) as const);
    setMarkerBusy(false);
    if ("error" in res) {
      setError(res.error ?? "Couldn't move them.");
      return;
    }
    setMarkers(res.markers);
    setBody(res.body);
    latest.current = { ...latest.current, body: res.body };
  }

  const markerForm = markerDraft && (
    <div className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-bg p-1.5">
      <input
        value={markerDraft.time}
        onChange={(e) => setMarkerDraft({ ...markerDraft, time: e.target.value })}
        aria-label="Time"
        inputMode="numeric"
        className="field w-16 shrink-0 px-1.5 py-1 text-center font-mono text-xs"
      />
      <input
        value={markerDraft.label}
        onChange={(e) => setMarkerDraft({ ...markerDraft, label: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveMarker();
          if (e.key === "Escape") setMarkerDraft(null);
        }}
        autoFocus
        placeholder="What this part is about"
        aria-label="Timeline label"
        className="field min-w-0 flex-1 py-1 text-sm"
      />
      <button type="button" onClick={saveMarker} disabled={markerBusy} aria-label="Save" className="rounded-md bg-accent p-1.5 text-accent-ink">
        {markerBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
      </button>
      <button type="button" onClick={() => setMarkerDraft(null)} aria-label="Cancel" className="rounded-md p-1.5 text-ink-muted hover:bg-bg-muted">
        <X size={13} />
      </button>
    </div>
  );

  // ---- key points ----
  const bodyRef = useRef<Field | null>(null);
  const [showSymbols, setShowSymbols] = useState(false);

  // Alt+T anywhere on the page marks the current moment.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyT" && playerBridge.get()) {
        e.preventDefault();
        markNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col gap-5">
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

      <Section
        title="Formulas to memorize"
        count={cards.length}
        action={
          !(editing && editing.key === null) && (
            <button type="button" onClick={() => setEditing({ key: null, name: "", formula: "", hint: "" })} className={smallBtn}>
              <Plus size={12} /> Add formula
            </button>
          )
        }
      >
        {cards.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {cards.map((c) =>
              editing?.key === c.key ? (
                <li key={c.key}>{formulaForm}</li>
              ) : (
                <li key={c.key} className="group flex items-start gap-2 rounded-lg border border-border bg-bg-elevated px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-muted">{c.name}</p>
                    <FormulaMath formula={c.formula} className="mt-0.5 text-base text-ink" fit />
                    {c.hint && <p className="mt-0.5 text-xs text-ink-faint">{c.hint}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setEditing({ key: c.key, name: c.name, formula: c.formula, hint: c.hint });
                    }}
                    aria-label={`Edit ${c.name}`}
                    className="shrink-0 rounded p-1 text-ink-faint hover:bg-bg-muted hover:text-ink"
                  >
                    <Pencil size={13} />
                  </button>
                </li>
              )
            )}
          </ul>
        )}
        {editing && editing.key === null && formulaForm}
        {cards.length === 0 && !editing && (
          <p className="text-xs text-ink-faint">Formulas you need to memorize from this video. You&rsquo;ll recall them later.</p>
        )}
        {noteId && savedCount > 0 && (
          <Link
            href={`/notes/recall?note=${noteId}`}
            className="inline-flex items-center gap-1.5 self-start rounded-md bg-accent-soft px-2.5 py-1.5 text-sm font-medium text-accent hover:underline"
          >
            <Play size={12} className="fill-current" /> {savedCount === 1 ? "Recall this formula" : `Recall these ${savedCount} formulas`}
          </Link>
        )}
      </Section>

      <Section
        title="Timeline"
        count={markers.length}
        action={
          <button
            type="button"
            onClick={markNow}
            disabled={!playerReady}
            title={playerReady ? "Mark where the video is now (Alt+T)" : "Needs the built-in player"}
            className={smallBtn}
          >
            <Clock size={12} /> Mark this moment
          </button>
        }
      >
        {legacyLines > 0 && noteId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-muted/50 px-2.5 py-2 text-xs text-ink-muted">
            <span>
              {legacyLines} timestamped line{legacyLines === 1 ? "" : "s"} in your key points.
            </span>
            <button type="button" onClick={moveLegacy} disabled={markerBusy} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              <ArrowRightLeft size={12} /> Move to timeline
            </button>
          </div>
        )}
        {markerDraft && !markerDraft.id && markerForm}
        {markers.length > 0 && (
          <ol className="flex flex-col">
            {markers.map((m) =>
              markerDraft?.id === m.id ? (
                <li key={m.id} className="py-0.5">
                  {markerForm}
                </li>
              ) : (
                <li key={m.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => playerBridge.get()?.seek(m.seconds)}
                    disabled={!playerReady}
                    className={clsx(
                      "flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-bg-muted disabled:hover:bg-transparent",
                      activeId === m.id && "bg-accent-soft/60"
                    )}
                  >
                    <span className="w-12 shrink-0 font-mono text-xs text-accent tabular-nums">{formatTime(m.seconds)}</span>
                    <span className={clsx("min-w-0", activeId === m.id ? "font-medium text-ink" : "text-ink-muted")}>{m.label}</span>
                  </button>
                  <span className="flex shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setMarkerDraft({ id: m.id, time: formatTime(m.seconds), label: m.label })}
                      aria-label="Edit"
                      className="rounded p-1 text-ink-faint hover:bg-bg-muted hover:text-ink"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMarker(m.id)}
                      aria-label="Delete"
                      className="rounded p-1 text-ink-faint hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </li>
              )
            )}
          </ol>
        )}
        {markers.length === 0 && !markerDraft && legacyLines === 0 && (
          <p className="text-xs text-ink-faint">When a new part starts, tap Mark this moment and name it. Tap a line later to jump back.</p>
        )}
      </Section>

      <Section
        title="Key points"
        action={
          <button
            type="button"
            onClick={() => setShowSymbols((v) => !v)}
            aria-pressed={showSymbols}
            className={clsx(smallBtn, showSymbols && "bg-accent-soft")}
          >
            <Sigma size={12} /> Symbols
          </button>
        }
      >
        {showSymbols && <SymbolBar target={bodyRef} />}
        <textarea
          ref={(el) => {
            bodyRef.current = el;
          }}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            changed();
          }}
          rows={7}
          placeholder={"Terms, definitions and rules to remember, e.g.\n• Abscissa = x-coordinate, ordinate = y-coordinate\n• René Descartes: founder of analytic geometry"}
          className="field min-h-36 text-sm leading-relaxed"
        />
      </Section>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
