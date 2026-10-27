"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { HelpCircle, Camera, Check, Clock, ImagePlus, ListChecks, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import FormulaMath, { FormulaPreview } from "@/components/formula-math";
import SymbolBar from "@/components/symbol-bar";
import CollapsibleSection from "@/components/collapsible-section";
import { playerBridge } from "@/lib/player-bridge";
import { formatTime } from "@/lib/timestamps";
import { shrinkImage } from "@/lib/shrink-image";
import {
  deleteVideoQuestionAction,
  makeMultipleChoiceAction,
  saveVideoQuestionAction,
  setVideoQuestionAnswerAction,
} from "./question-actions";
import type { VQ } from "./question-types";

const LABELS = ["A", "B", "C", "D"] as const;
type Label = (typeof LABELS)[number];
type Kind = "solve" | "mcq";

/** A saved picture plus a not-yet-uploaded replacement (captured frame or photo). */
type Pic = { url: string | null; blob: Blob | null; removed: boolean };
const noPic = (url: string | null = null): Pic => ({ url, blob: null, removed: false });

type Draft = {
  id: string | null;
  kind: Kind;
  seconds: number | null;
  text: string;
  choices: Record<Label, string>;
  correct: Label | null;
  answer: string;
  explanation: string;
  image: Pic;
  solution: Pic;
};

const KIND_KEY = "video-question-kind";
function lastKind(): Kind {
  try {
    return localStorage.getItem(KIND_KEY) === "mcq" ? "mcq" : "solve";
  } catch {
    return "solve";
  }
}

const emptyDraft = (seconds: number | null): Draft => ({
  id: null,
  kind: lastKind(),
  seconds,
  text: "",
  choices: { A: "", B: "", C: "", D: "" },
  correct: null,
  answer: "",
  explanation: "",
  image: noPic(),
  solution: noPic(),
});

const fromItem = (q: VQ): Draft => ({
  id: q.id,
  kind: q.kind,
  seconds: q.seconds,
  text: q.text === "(see picture)" ? "" : q.text,
  choices: { ...q.choices },
  correct: (q.correct as Label) ?? null,
  answer: q.answer,
  explanation: q.explanation,
  image: noPic(q.imageUrl),
  solution: noPic(q.solutionImageUrl),
});

const hasAllChoices = (q: { choices: Record<Label, string> }) => LABELS.every((l) => q.choices[l].trim());

/** Picture field: capture the current video frame or pick a photo; shows a preview. */
function PictureField({
  label,
  captureLabel,
  pic,
  onChange,
  canCapture,
  onError,
}: {
  label: string;
  captureLabel: string;
  pic: Pic;
  onChange: (p: Pic) => void;
  canCapture: boolean;
  onError: (msg: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!pic.blob) return;
    const url = URL.createObjectURL(pic.blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors an object URL that must be revoked
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pic.blob]);
  const shown = pic.removed ? null : pic.blob ? preview : pic.url;

  async function capture() {
    const blob = await playerBridge.get()?.captureFrame();
    if (blob) onChange({ ...pic, blob, removed: false });
    else onError("Couldn't grab the frame. Let the video play for a moment first.");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-ink-faint">{label}</span>
        {canCapture && (
          <button
            type="button"
            onClick={capture}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-muted hover:text-ink"
          >
            <Camera size={13} /> {captureLabel}
          </button>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-muted hover:text-ink"
        >
          <ImagePlus size={13} /> {shown ? "Replace" : "Photo"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onChange({ ...pic, blob: await shrinkImage(f), removed: false });
          }}
        />
      </div>
      {shown && (
        <div className="relative self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt={label} className="max-h-40 rounded-md border border-border" />
          <button
            type="button"
            onClick={() => onChange({ url: pic.url, blob: null, removed: true })}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Questions from the video, written down without leaving it. Either a solved
 * problem (question + final answer + picture of the solution, practised in
 * /notes/problems) or a multiple-choice question that joins the subject's
 * "Video questions" exam once it has its answer.
 */
export default function VideoQuestions({ videoId, initial, aiEnabled }: { videoId: string; initial: VQ[]; aiEnabled: boolean }) {
  const [items, setItems] = useState<VQ[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const playerReady = useSyncExternalStore(playerBridge.subscribe, () => playerBridge.get() !== null, () => false);
  const formTop = useRef<HTMLDivElement>(null);
  // The symbol bar types into whichever field of the form was focused last.
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const now = () => {
    const p = playerBridge.get();
    return p ? Math.floor(p.getTime()) : null;
  };

  function open(d: Draft) {
    setError(null);
    setDraft(d);
    requestAnimationFrame(() => formTop.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  function setKind(kind: Kind) {
    patch({ kind });
    try {
      localStorage.setItem(KIND_KEY, kind);
    } catch {
      /* private mode */
    }
  }

  const upsert = (item: VQ) =>
    setItems((xs) => {
      const next = xs.some((x) => x.id === item.id) ? xs.map((x) => (x.id === item.id ? item : x)) : [...xs, item];
      return next.sort((a, b) => (a.seconds ?? 1e9) - (b.seconds ?? 1e9));
    });

  function save() {
    if (!draft) return;
    const d = draft;
    startSaving(async () => {
      const fd = new FormData();
      if (d.id) fd.set("id", d.id);
      fd.set("videoId", videoId);
      fd.set("kind", d.kind);
      if (d.seconds !== null) fd.set("seconds", String(d.seconds));
      fd.set("text", d.text);
      for (const l of LABELS) fd.set(`choice${l}`, d.choices[l]);
      fd.set("correct", d.correct ?? "");
      fd.set("answer", d.answer);
      fd.set("explanation", d.explanation);
      if (d.image.removed) fd.set("removeImage", "1");
      if (d.image.blob) fd.set("image", new File([d.image.blob], "question.jpg", { type: d.image.blob.type || "image/jpeg" }));
      if (d.solution.removed) fd.set("removeSolutionImage", "1");
      if (d.solution.blob) fd.set("solutionImage", new File([d.solution.blob], "solution.jpg", { type: d.solution.blob.type || "image/jpeg" }));
      const res = await saveVideoQuestionAction(fd).catch(() => ({ error: "Couldn't save. Check your connection." }));
      if ("error" in res) {
        setError(res.error);
        return;
      }
      upsert(res.item);
      setDraft(null);
      setError(null);
    });
  }

  async function run(q: VQ, fn: () => Promise<{ error: string } | { item: VQ }>) {
    setBusyId(q.id);
    setError(null);
    const res = await fn().catch(() => ({ error: "Couldn't save. Check your connection." }));
    setBusyId(null);
    if ("error" in res) setError(res.error);
    else upsert(res.item);
  }

  async function remove(q: VQ) {
    setBusyId(q.id);
    await deleteVideoQuestionAction(q.id).catch(() => null);
    setBusyId(null);
    setConfirmDelete(null);
    setItems((xs) => xs.filter((x) => x.id !== q.id));
  }

  const pendingCount = items.filter((q) => (q.kind === "solve" ? !q.answer : !q.inBank)).length;
  const solvedCount = items.filter((q) => q.kind === "solve" && q.answer).length;

  return (
    <CollapsibleSection
      id="questions"
      title="Questions"
      icon={HelpCircle}
      count={items.length}
      summary={
        items.length
          ? `${items.length} question${items.length === 1 ? "" : "s"}${pendingCount ? ` · ${pendingCount} pending` : ""}`
          : "Add the instructor's questions and solved problems"
      }
      action={
        !draft && (
          <button
            type="button"
            onClick={() => open(emptyDraft(now()))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
          >
            <Plus size={12} /> Add question
          </button>
        )
      }
    >
      {pendingCount > 0 && <p className="-mt-1 text-xs text-accent">{pendingCount} pending: add the answer when it&rsquo;s solved</p>}

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((q) => {
            const busy = busyId === q.id;
            return (
              <li key={q.id} className="rounded-lg border border-border bg-bg-elevated p-2 text-sm">
                <div className="flex items-start gap-2">
                  {q.seconds !== null ? (
                    <button
                      type="button"
                      onClick={() => playerBridge.get()?.seek(q.seconds!)}
                      disabled={!playerReady}
                      title="Jump to this point"
                      className="shrink-0 rounded bg-accent-soft px-1 font-mono text-xs text-accent tabular-nums hover:underline disabled:no-underline"
                    >
                      {formatTime(q.seconds)}
                    </button>
                  ) : null}
                  <p className="line-clamp-2 min-w-0 flex-1 text-ink">{q.text}</p>
                  {q.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.imageUrl} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {q.kind === "solve" ? (
                    q.answer ? (
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-success">
                        <Check size={12} className="shrink-0" /> Answer:
                        <FormulaMath formula={q.answer} className="min-w-0 text-sm text-ink" />
                      </span>
                    ) : (
                      <button type="button" onClick={() => open(fromItem(q))} className="text-xs text-accent hover:underline">
                        Answer pending · add it when it&rsquo;s solved
                      </button>
                    )
                  ) : q.inBank ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <Check size={12} /> In exam bank · answer {q.correct}
                    </span>
                  ) : !hasAllChoices(q) ? (
                    <span className="text-xs text-accent">Draft · add the choices</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-accent">
                      Answer pending:
                      {LABELS.map((l) => (
                        <button
                          key={l}
                          type="button"
                          disabled={busy}
                          onClick={() => run(q, () => setVideoQuestionAnswerAction(q.id, l))}
                          title={`${l}. ${q.choices[l]}`}
                          className="h-6 w-6 rounded-full border border-border-strong text-xs font-medium text-ink hover:border-accent hover:text-accent"
                        >
                          {l}
                        </button>
                      ))}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {busy && <Loader2 size={13} className="animate-spin text-ink-faint" />}
                    {confirmDelete === q.id ? (
                      <>
                        <span className="text-xs text-ink-muted">{q.inBank ? "Delete, also from the exam?" : "Delete?"}</span>
                        <button type="button" onClick={() => remove(q)} className="text-xs font-medium text-danger hover:underline">
                          Delete
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="text-xs text-ink-muted hover:underline">
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => open(fromItem(q))}
                          aria-label="Edit question"
                          className="rounded p-1 text-ink-faint hover:bg-bg-muted hover:text-ink"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(q.id)}
                          aria-label="Delete question"
                          className="rounded p-1 text-ink-faint hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </span>
                </div>

                {q.kind === "solve" && q.answer && aiEnabled && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(q, () => makeMultipleChoiceAction(q.id))}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-muted hover:text-accent disabled:opacity-60"
                  >
                    <Sparkles size={12} /> {busy ? "Writing choices…" : "Make it multiple choice for the exam bank"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {solvedCount > 0 && !draft && (
        <Link href={`/notes/problems?video=${videoId}`} className="inline-flex items-center gap-1.5 self-start text-sm text-accent hover:underline">
          <ListChecks size={14} /> Practise {solvedCount === 1 ? "this solved problem" : `these ${solvedCount} solved problems`}
        </Link>
      )}

      {draft && (
        <div
          ref={formTop}
          onFocusCapture={(e) => {
            const t = e.target;
            if ((t instanceof HTMLInputElement && t.type === "text") || t instanceof HTMLTextAreaElement) lastField.current = t;
          }}
          className="flex flex-col gap-2.5 rounded-lg border border-accent/40 bg-bg p-2.5"
        >
          <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {draft.seconds !== null ? `At ${formatTime(draft.seconds)}` : "No video time"}
              {playerReady && (
                <button type="button" onClick={() => patch({ seconds: now() })} className="ml-1 text-accent hover:underline">
                  use current time
                </button>
              )}
            </span>
            <button type="button" onClick={() => setDraft(null)} aria-label="Cancel" className="rounded p-0.5 hover:bg-bg-muted">
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 rounded-lg border border-border p-0.5 text-xs font-medium" role="radiogroup" aria-label="Question type">
            {(
              [
                ["solve", "Solved problem"],
                ["mcq", "Multiple choice"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={draft.kind === k}
                onClick={() => setKind(k)}
                className={clsx("rounded-md py-1.5", draft.kind === k ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>

          <SymbolBar target={lastField} hint="Goes into the box you were typing in." />

          <textarea
            value={draft.text}
            onChange={(e) => patch({ text: e.target.value })}
            rows={3}
            autoFocus
            placeholder={draft.kind === "solve" ? "The problem (or just capture it from the video)" : "The question, as asked in the video (or a picture of it)"}
            aria-label="Question"
            className="field text-sm"
          />
          <PictureField
            label="Question picture"
            captureLabel="Capture frame"
            pic={draft.image}
            onChange={(image) => patch({ image })}
            canCapture={playerReady}
            onError={setError}
          />

          {draft.kind === "solve" ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-faint">Final answer (add it later if it hasn&rsquo;t been shown yet)</span>
                <input
                  value={draft.answer}
                  onChange={(e) => patch({ answer: e.target.value })}
                  placeholder="e.g. 12.73 V or Vdc = 2Vp/π"
                  className="field py-1.5 text-sm"
                />
              </label>
              <FormulaPreview formula={draft.answer} />
            </>
          ) : (
            <>
              <p className="text-[11px] text-ink-faint">Tap a letter to mark the answer, or leave it for later.</p>
              {LABELS.map((l) => (
                <div key={l} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => patch({ correct: draft.correct === l ? null : l })}
                    aria-pressed={draft.correct === l}
                    aria-label={`Mark ${l} as the answer`}
                    className={clsx(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      draft.correct === l ? "border-success bg-success text-bg" : "border-border-strong text-ink-muted hover:border-accent"
                    )}
                  >
                    {draft.correct === l ? <Check size={13} strokeWidth={3} /> : l}
                  </button>
                  <input
                    value={draft.choices[l]}
                    onChange={(e) => patch({ choices: { ...draft.choices, [l]: e.target.value } })}
                    placeholder={`Choice ${l}`}
                    aria-label={`Choice ${l}`}
                    className="field min-w-0 flex-1 py-1 text-sm"
                  />
                </div>
              ))}
            </>
          )}

          <PictureField
            label="Solution picture"
            captureLabel="Capture the solved board"
            pic={draft.solution}
            onChange={(solution) => patch({ solution })}
            canCapture={playerReady}
            onError={setError}
          />
          <textarea
            value={draft.explanation}
            onChange={(e) => patch({ explanation: e.target.value })}
            rows={2}
            placeholder="Solution notes (optional): the formula or trick used"
            aria-label="Solution notes"
            className="field text-sm"
          />

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-faint">
              {draft.kind === "solve"
                ? draft.answer.trim()
                  ? "You'll practise it under Notes → Solved problems."
                  : "Saved as pending until it has the answer."
                : draft.correct && hasAllChoices(draft)
                  ? "Goes into the Video questions exam."
                  : "Saved as pending until it has 4 choices and an answer."}
            </span>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </Button>
          </div>
        </div>
      )}

      {!draft && error && <p className="text-xs text-danger">{error}</p>}
      {items.length === 0 && !draft && (
        <p className="text-xs text-ink-faint">
          Instructor solves a problem or asks a question? Add it here. Capture the board so you can practise it later.
        </p>
      )}
    </CollapsibleSection>
  );
}
