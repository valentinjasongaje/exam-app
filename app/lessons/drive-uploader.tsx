"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CloudUpload, FolderOpen, Loader2, XCircle } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import { uploadToDrive } from "@/lib/drive-upload-client";

export type UploadCandidate = {
  localPath: string;
  file: string; // file name on G:
  title: string;
  bytes: number;
  onDrive: boolean;
  watched: boolean;
};

type Item = {
  c: UploadCandidate;
  f: File;
  selected: boolean;
  status: "ready" | "uploading" | "done" | "error";
  sent: number;
  error?: string;
};

const GB = 1024 ** 3;
const SAFETY = 0.5 * GB; // leave a little room on Drive

function gb(n: number) {
  return `${(n / GB).toFixed(n < 10 * GB ? 1 : 0)} GB`;
}

export default function DriveUploader({ candidates, freeBytes }: { candidates: UploadCandidate[]; freeBytes: number | null }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [unmatched, setUnmatched] = useState(0);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  function pick(files: FileList | null) {
    if (!files) return;
    const byName = new Map(candidates.map((c) => [c.file.toLowerCase(), c]));
    const found: Item[] = [];
    let misses = 0;
    for (const f of Array.from(files)) {
      if (!f.name.toLowerCase().endsWith(".mp4")) continue;
      const c = byName.get(f.name.toLowerCase());
      if (!c || f.size !== c.bytes) {
        misses++;
        continue;
      }
      if (c.onDrive || found.some((x) => x.c.localPath === c.localPath)) continue;
      found.push({ c, f, selected: false, status: "ready", sent: 0 });
    }
    // Keep plan order, then pre-select unwatched videos that fit in the free space.
    found.sort((a, b) => candidates.indexOf(a.c) - candidates.indexOf(b.c));
    let budget = freeBytes === null ? Infinity : freeBytes - SAFETY;
    for (const it of found) {
      if (!it.c.watched && it.f.size <= budget) {
        it.selected = true;
        budget -= it.f.size;
      }
    }
    setItems(found);
    setUnmatched(misses);
    setMessage(
      found.length === 0
        ? misses
          ? "None of those files are in your watch plan (or they're already on Drive)."
          : "No videos found there."
        : null
    );
  }

  const chosen = items.filter((i) => i.selected && i.status !== "done");
  const chosenBytes = chosen.reduce((s, i) => s + i.f.size, 0);
  const overBudget = freeBytes !== null && chosenBytes > freeBytes - SAFETY;
  const doneCount = items.filter((i) => i.status === "done").length;

  async function start() {
    setRunning(true);
    setMessage(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    for (const it of items) {
      if (!it.selected || it.status === "done") continue;
      if (ctrl.signal.aborted) break;
      setItems((xs) => xs.map((x) => (x.c.localPath === it.c.localPath ? { ...x, status: "uploading", sent: 0, error: undefined } : x)));
      try {
        await uploadToDrive(
          it.c,
          it.f,
          (sent) => setItems((xs) => xs.map((x) => (x.c.localPath === it.c.localPath ? { ...x, sent } : x))),
          ctrl.signal
        );
        setItems((xs) => xs.map((x) => (x.c.localPath === it.c.localPath ? { ...x, status: "done", sent: x.f.size } : x)));
        router.refresh();
      } catch (e) {
        const msg = ctrl.signal.aborted ? "Stopped." : e instanceof Error ? e.message : "Upload failed.";
        setItems((xs) => xs.map((x) => (x.c.localPath === it.c.localPath ? { ...x, status: "error", error: msg } : x)));
        if (ctrl.signal.aborted) break;
      }
    }
    setRunning(false);
    abort.current = null;
    router.refresh();
  }

  const totalSent = items.filter((i) => i.selected).reduce((s, i) => s + i.sent, 0);
  const totalSel = items.filter((i) => i.selected).reduce((s, i) => s + i.f.size, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <label className={clsx("inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-bg-elevated px-3 py-1.5 text-sm hover:border-accent hover:text-accent", running && "pointer-events-none opacity-50")}>
          <FolderOpen size={15} /> Choose a folder
          <input ref={folderInput} type="file" multiple className="sr-only" onChange={(e) => pick(e.target.files)} disabled={running} />
        </label>
        <label className={clsx("inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-bg-elevated px-3 py-1.5 text-sm hover:border-accent hover:text-accent", running && "pointer-events-none opacity-50")}>
          <CloudUpload size={15} /> Choose videos
          <input type="file" accept="video/mp4,.mp4" multiple className="sr-only" onChange={(e) => pick(e.target.files)} disabled={running} />
        </label>
      </div>
      <p className="text-xs text-ink-muted">
        Easiest: choose <span className="font-mono text-ink">G:\Excel Review Center\OCTOBER 2024\1ST SEM</span>. The app
        picks out your plan videos by name and size, skips ones already on Drive, and pre-selects unwatched videos that fit
        in your free space. Keep this tab open while it uploads.
      </p>

      {message && <p className="text-sm text-ink-muted">{message}</p>}

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {chosen.length} selected · {gb(chosenBytes)}
              {freeBytes !== null && <span className="text-ink-muted"> of {gb(Math.max(0, freeBytes - SAFETY))} free</span>}
              {unmatched > 0 && <span className="text-ink-faint"> · {unmatched} other files ignored</span>}
            </span>
            {!running && (
              <span className="flex gap-3 text-xs">
                <button type="button" className="text-ink-muted hover:text-accent" onClick={() => setItems((xs) => xs.map((x) => (x.status === "done" ? x : { ...x, selected: true })))}>
                  Select all
                </button>
                <button type="button" className="text-ink-muted hover:text-accent" onClick={() => setItems((xs) => xs.map((x) => (x.status === "done" ? x : { ...x, selected: false })))}>
                  None
                </button>
              </span>
            )}
          </div>

          <ul className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {items.map((it) => (
              <li key={it.c.localPath} className="flex items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                {it.status === "done" ? (
                  <CheckCircle2 size={16} className="shrink-0 text-success" />
                ) : it.status === "uploading" ? (
                  <Loader2 size={16} className="shrink-0 animate-spin text-accent" />
                ) : it.status === "error" ? (
                  <XCircle size={16} className="shrink-0 text-danger" />
                ) : (
                  <input
                    type="checkbox"
                    checked={it.selected}
                    disabled={running}
                    onChange={(e) => setItems((xs) => xs.map((x) => (x.c.localPath === it.c.localPath ? { ...x, selected: e.target.checked } : x)))}
                    aria-label={`Upload ${it.c.title}`}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className={clsx("block truncate", it.c.watched && "text-ink-muted")}>
                    {it.c.title}
                    {it.c.watched && <span className="text-xs text-ink-faint"> · watched</span>}
                  </span>
                  {it.status === "uploading" && (
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-bg-muted">
                      <span className="block h-full bg-accent transition-all" style={{ width: `${(it.sent / it.f.size) * 100}%` }} />
                    </span>
                  )}
                  {it.error && <span className="block text-xs text-danger">{it.error}</span>}
                </span>
                <span className="shrink-0 text-xs text-ink-muted tabular-nums">{gb(it.f.size)}</span>
              </li>
            ))}
          </ul>

          {overBudget && <p className="text-sm text-danger">That&rsquo;s more than your free Drive space. Untick a few, or remove watched videos from Drive first.</p>}

          <div className="flex flex-wrap items-center gap-3">
            {!running ? (
              <Button onClick={start} disabled={chosen.length === 0 || overBudget}>
                <CloudUpload size={15} /> Upload {chosen.length} to Drive
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => abort.current?.abort()}>
                Stop uploading
              </Button>
            )}
            {(running || doneCount > 0) && (
              <span className="text-sm text-ink-muted tabular-nums">
                {doneCount} done · {gb(totalSent)} of {gb(totalSel)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
