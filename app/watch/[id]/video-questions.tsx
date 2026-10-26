"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Camera, Check, Clock, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import { playerBridge } from "@/lib/player-bridge";
import { formatTime } from "@/lib/timestamps";
import { shrinkImage } from "@/lib/shrink-image";
import { deleteVideoQuestionAction, saveVideoQuestionAction, setVideoQuestionAnswerAction } from "./question-actions";
import type { VQ } from "./question-types";

const LABELS = ["A", "B", "C", "D"] as const;
type Label = (typeof LABELS)[number];

type Draft = {
  id: string | null;
  seconds: number | null;
  text: string;
  choices: Record<Label, string>;
  correct: Label | null;
  explanation: string;
  imageUrl: string | null; // saved picture
  newImage: Blob | null; // picked / captured, not uploaded yet
  removeImage: boolean;
};

const emptyDraft = (seconds: number | null): Draft => ({
  id: null,
  seconds,
  text: "",
  choices: { A: "", B: "", C: "", D: "" },
  correct: null,
  explanation: "",
  imageUrl: null,
  newImage: null,
  removeImage: false,
});

const fromItem = (q: VQ): Draft => ({
  id: q.id,
  seconds: q.seconds,
  text: q.text === "(see picture)" ? "" : q.text,
  choices: { ...q.choices },
  correct: (q.correct as Label) ?? null,
  explanation: q.explanation,
  imageUrl: q.imageUrl,
  newImage: null,
  removeImage: false,
});

const hasAllChoices = (q: { choices: Record<Label, string> }) => LABELS.every((l) => q.choices[l].trim());

/**
 * Questions the instructor asks in the video, written down without leaving
 * it. The answer can be added later (when it's solved on screen); complete
 * questions go into the subject's "Video questions" exam automatically.
 */
export default function VideoQuestions({ videoId, initial }: { videoId: string; initial: VQ[] }) {
  const [items, setItems] = useState<VQ[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const playerReady = useSyncExternalStore(playerBridge.subscribe, () => playerBridge.get() !== null, () => false);
  const fileInput = useRef<HTMLInputElement>(null);
  const formTop = useRef<HTMLDivElement>(null);

  // Preview URL for a picked/captured picture.
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!draft?.newImage) return;
    const url = URL.createObjectURL(draft.newImage);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors an object URL that must be revoked
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draft?.newImage]);

  const now = () => {
    const p = playerBridge.get();
    return p ? Math.floor(p.getTime()) : null;
  };

  function open(d: Draft) {
    setError(null);
    setPreview(null);
    setDraft(d);
    requestAnimationFrame(() => formTop.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  async function capture() {
    const blob = await playerBridge.get()?.captureFrame();
    if (blob) patch({ newImage: blob, removeImage: false });
    else setError("Couldn't grab the frame. Let the video play for a moment first.");
  }

  function save() {
    if (!draft) return;
    const d = draft;
    startSaving(async () => {
      const fd = new FormData();
      if (d.id) fd.set("id", d.id);
      fd.set("videoId", videoId);
      if (d.seconds !== null) fd.set("seconds", String(d.seconds));
      fd.set("text", d.text);
      for (const l of LABELS) fd.set(`choice${l}`, d.choices[l]);
      fd.set("correct", d.correct ?? "");
      fd.set("explanation", d.explanation);
      if (d.removeImage) fd.set("removeImage", "1");
      if (d.newImage) fd.set("image", new File([d.newImage], "question.jpg", { type: d.newImage.type || "image/jpeg" }));
      const res = await saveVideoQuestionAction(fd).catch(() => ({ error: "Couldn't save. Check your connection." }));
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setItems((xs) => {
        const next = xs.some((x) => x.id === res.item.id) ? xs.map((x) => (x.id === res.item.id ? res.item : x)) : [...xs, res.item];
        return next.sort((a, b) => (a.seconds ?? 1e9) - (b.seconds ?? 1e9));
      });
      setDraft(null);
      setError(null);
    });
  }

  async function quickAnswer(q: VQ, label: Label) {
    setBusyId(q.id);
    const res = await setVideoQuestionAnswerAction(q.id, label).catch(() => ({ error: "Couldn't save." }));
    setBusyId(null);
    if ("error" in res) setError(res.error);
    else setItems((xs) => xs.map((x) => (x.id === q.id ? res.item : x)));
  }

  async function remove(q: VQ) {
    setBusyId(q.id);
    await deleteVideoQuestionAction(q.id).catch(() => null);
    setBusyId(null);
    setConfirmDelete(null);
    setItems((xs) => xs.filter((x) => x.id !== q.id));
  }

  const pendingCount = items.filter((q) => !q.inBank).length;
  const shownImage = draft && !draft.removeImage ? (draft.newImage ? preview : draft.imageUrl) : null;

  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Questions from this video
          {items.length > 0 && (
            <span className="ml-1.5 font-normal text-ink-muted">
              {items.length}
              {pendingCount > 0 && ` · ${pendingCount} pending`}
            </span>
          )}
        </h2>
        {!draft && (
          <button
            type="button"
            onClick={() => open(emptyDraft(now()))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
          >
            <Plus size={12} /> Add question
          </button>
        )}
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((q) => {
            const pending = !q.correct;
            const needsChoices = !hasAllChoices(q);
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
                  {q.inBank ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <Check size={12} /> In exam bank · answer {q.correct}
                    </span>
                  ) : needsChoices ? (
                    <span className="text-xs text-accent">Draft · add the choices</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-accent">
                      Answer pending:
                      {LABELS.map((l) => (
                        <button
                          key={l}
                          type="button"
                          disabled={busyId === q.id}
                          onClick={() => quickAnswer(q, l)}
                          title={`${l}. ${q.choices[l]}`}
                          className="h-6 w-6 rounded-full border border-border-strong text-xs font-medium text-ink hover:border-accent hover:text-accent"
                        >
                          {l}
                        </button>
                      ))}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {busyId === q.id && <Loader2 size={13} className="animate-spin text-ink-faint" />}
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
                {pending && !needsChoices && !q.inBank && q.seconds !== null && (
                  <p className="mt-1 text-[11px] text-ink-faint">Tap the answer once it&rsquo;s solved in the video.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <div ref={formTop} className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-bg p-2.5">
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

          <textarea
            value={draft.text}
            onChange={(e) => patch({ text: e.target.value })}
            rows={3}
            autoFocus
            placeholder="The question, as asked in the video (or just add a picture of it)"
            aria-label="Question"
            className="field text-sm"
          />

          <div className="flex flex-wrap items-center gap-2">
            {playerReady && (
              <button
                type="button"
                onClick={capture}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-muted hover:text-ink"
              >
                <Camera size={13} /> Capture video frame
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-muted hover:text-ink"
            >
              <ImagePlus size={13} /> {shownImage ? "Replace picture" : "Add picture"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) patch({ newImage: await shrinkImage(f), removeImage: false });
              }}
            />
          </div>
          {shownImage && (
            <div className="relative self-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shownImage} alt="Question picture" className="max-h-40 rounded-md border border-border" />
              <button
                type="button"
                onClick={() => patch({ newImage: null, removeImage: true })}
                aria-label="Remove picture"
                className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X size={12} />
              </button>
            </div>
          )}

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

          <details className="text-xs" open={!!draft.explanation}>
            <summary className="cursor-pointer text-ink-muted">Solution notes (optional)</summary>
            <textarea
              value={draft.explanation}
              onChange={(e) => patch({ explanation: e.target.value })}
              rows={3}
              placeholder="How it was solved, shown after you answer it in an exam"
              className="field mt-1.5 w-full text-sm"
            />
          </details>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-faint">
              {draft.correct && hasAllChoices(draft) ? "Goes into the Video questions exam." : "Saved as pending until it has 4 choices and an answer."}
            </span>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </Button>
          </div>
        </div>
      )}

      {!draft && error && <p className="text-xs text-danger">{error}</p>}
      {items.length === 0 && !draft && (
        <p className="text-xs text-ink-faint">Instructor asks a question? Add it here. It joins your exam bank once it has an answer.</p>
      )}
    </section>
  );
}
