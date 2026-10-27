"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CloudUpload, FolderCheck, FolderOpen, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { uploadToDrive, type UploadTarget } from "@/lib/drive-upload-client";
import { ensureReadPermission, folderPickerSupported, getStoredFolder, pickFolder, resolveVideo } from "@/lib/video-folder";

/**
 * One-click "upload to Drive" for checklist rows. Rows add videos to a
 * shared queue that uploads one at a time from the remembered video folder
 * (or from a single-file picker in browsers without folder access).
 */

type Job = { t: UploadTarget; status: "queued" | "uploading" | "error"; sent: number; error?: string; file?: File };
type Ctx = {
  jobs: Record<string, Job>;
  enqueue: (targets: UploadTarget[]) => Promise<void>;
  enqueueFile: (t: UploadTarget, f: File) => void;
  folderName: string | null;
  supported: boolean;
  chooseFolder: () => Promise<void>;
  freeBytes: number | null;
};

const QueueContext = createContext<Ctx | null>(null);
const GB = 1024 ** 3;
const gb = (n: number) => `${(n / GB).toFixed(1)} GB`;

export function UploadQueueProvider({ freeBytes, children }: { freeBytes: number | null; children: React.ReactNode }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [folderName, setFolderName] = useState<string | null>(null);
  // false on the server, real value in the browser (no hydration mismatch).
  const supported = useSyncExternalStore(
    () => () => {},
    folderPickerSupported,
    () => false
  );
  const running = useRef(false);
  const order = useRef<string[]>([]);
  // Mirror of `jobs` for the async upload loop; always written together via commit().
  const jobsRef = useRef<Record<string, Job>>({});
  const commit = (next: Record<string, Job>) => {
    jobsRef.current = next;
    setJobs(next);
  };

  useEffect(() => {
    getStoredFolder().then((h) => setFolderName(h?.name || (h ? "G:" : null)));
  }, []);

  const busy = Object.values(jobs).some((j) => j.status !== "error");
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const update = (key: string, patch: Partial<Job> | null) => {
    const next = { ...jobsRef.current };
    if (patch === null) delete next[key];
    else next[key] = { ...next[key], ...patch };
    commit(next);
  };

  const run = async () => {
    if (running.current) return;
    running.current = true;
    while (order.current.length) {
      const key = order.current.shift()!;
      const job = jobsRef.current[key];
      if (!job || job.status !== "queued") continue;
      update(key, { status: "uploading", sent: 0 });
      try {
        let file = job.file;
        if (!file) {
          const h = await getStoredFolder();
          if (!h) throw new Error("Choose your video folder first.");
          file = await resolveVideo(h, job.t.localPath);
        }
        await uploadToDrive(job.t, file, (sent) => update(key, { sent }), new AbortController().signal);
        update(key, null);
        router.refresh();
      } catch (e) {
        update(key, { status: "error", error: e instanceof Error ? e.message : "Upload failed." });
      }
    }
    running.current = false;
  };

  const queuedBytes = () =>
    Object.values(jobsRef.current)
      .filter((j) => j.status !== "error")
      .reduce((s, j) => s + j.t.bytes, 0);

  const add = (targets: UploadTarget[], file?: File) => {
    const fresh = targets.filter((t) => !jobsRef.current[t.localPath] || jobsRef.current[t.localPath].status === "error");
    if (freeBytes !== null && queuedBytes() + fresh.reduce((s, t) => s + t.bytes, 0) > freeBytes - 0.5 * GB) {
      alert(`Not enough free space on Google Drive (${gb(Math.max(0, freeBytes))} free). Remove watched videos first.`);
      return;
    }
    const next = { ...jobsRef.current };
    for (const t of fresh) next[t.localPath] = { t, status: "queued", sent: 0, file };
    commit(next);
    order.current.push(...fresh.map((t) => t.localPath));
    run();
  };

  const chooseFolder = async () => {
    try {
      const h = await pickFolder();
      setFolderName(h.name || "G:");
    } catch {
      /* cancelled */
    }
  };

  // Called from a click, so it may show the folder picker or permission prompt.
  const enqueue = async (targets: UploadTarget[]) => {
    let h = await getStoredFolder();
    if (!h) {
      try {
        h = await pickFolder();
        setFolderName(h.name || "G:");
      } catch {
        return;
      }
    }
    if (!(await ensureReadPermission(h))) {
      alert("The site needs permission to read your video folder to upload from it.");
      return;
    }
    add(targets);
  };

  const enqueueFile = (t: UploadTarget, f: File) => {
    if (f.size !== t.bytes || f.name.toLowerCase() !== t.file.toLowerCase()) {
      alert(`That's not the right file. Pick ${t.file}.`);
      return;
    }
    add([t], f);
  };

  return (
    <QueueContext.Provider value={{ jobs, enqueue, enqueueFile, folderName, supported, chooseFolder, freeBytes }}>
      {children}
    </QueueContext.Provider>
  );
}

function useQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error("UploadQueueProvider missing");
  return ctx;
}

/** Folder status line above the table: which folder one-click uploads read from. */
export function VideoFolderBar({ pending }: { pending: UploadTarget[] }) {
  const q = useQueue();
  const active = Object.values(q.jobs);
  const uploading = active.find((j) => j.status === "uploading");
  const waiting = active.filter((j) => j.status === "queued").length;
  const pendingBytes = pending.reduce((s, t) => s + t.bytes, 0);

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-ink-muted">
        {q.supported ? (
          q.folderName ? (
            <>
              <FolderCheck size={15} className="shrink-0 text-success" />
              <span className="truncate">
                Uploading from <span className="text-ink">{q.folderName}</span>
              </span>
              <button type="button" onClick={q.chooseFolder} className="text-xs text-accent hover:underline">
                change
              </button>
            </>
          ) : (
            <button type="button" onClick={q.chooseFolder} className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <FolderOpen size={15} /> Choose your video folder (G:\Excel Review Center) for one-click uploads
            </button>
          )
        ) : (
          <span>☁↑ asks you to pick each file in this browser. Chrome or Edge on your laptop can upload in one click.</span>
        )}
      </span>
      <span className="flex items-center gap-3">
        {uploading && (
          <span className="text-xs text-ink-muted tabular-nums">
            Uploading {Math.round((uploading.sent / uploading.t.bytes) * 100)}%{waiting ? ` · ${waiting} waiting` : ""}
          </span>
        )}
        {q.supported && pending.length > 1 && (
          <button
            type="button"
            onClick={() => q.enqueue(pending)}
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <CloudUpload size={13} /> Upload all {pending.length} shown ({gb(pendingBytes)})
          </button>
        )}
      </span>
    </div>
  );
}

/** The ☁↑ button on one checklist row. */
export function UploadRowButton({ target, title }: { target: UploadTarget; title: string }) {
  const q = useQueue();
  const job = q.jobs[target.localPath];
  const fileInput = useRef<HTMLInputElement>(null);

  if (job?.status === "uploading") {
    const pct = Math.round((job.sent / target.bytes) * 100);
    return (
      <span className="inline-flex w-12 items-center justify-end gap-1 text-xs text-accent tabular-nums" title={`Uploading ${title}`}>
        <Loader2 size={13} className="animate-spin" />
        {pct}%
      </span>
    );
  }
  if (job?.status === "queued") {
    return <span className="inline-flex w-12 justify-end text-xs text-ink-faint">queued</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (q.supported ? q.enqueue([target]) : fileInput.current?.click())}
        title={job?.status === "error" ? `${job.error} Click to retry.` : `Upload to Google Drive (${gb(target.bytes)})`}
        aria-label={`Upload ${title} to Google Drive`}
        className={clsx(
          "inline-flex items-center justify-center rounded-md p-1.5 transition-colors",
          job?.status === "error" ? "text-danger hover:bg-danger-soft" : "text-ink-faint hover:bg-bg-muted hover:text-accent"
        )}
      >
        {job?.status === "error" ? <AlertCircle size={15} /> : <CloudUpload size={15} />}
      </button>
      {!q.supported && (
        <input
          ref={fileInput}
          type="file"
          accept="video/mp4,.mp4"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) q.enqueueFile(target, f);
            e.target.value = "";
          }}
        />
      )}
    </>
  );
}

/** Shows the latest upload error under the table so it isn't only in a tooltip. */
export function UploadErrors() {
  const q = useQueue();
  const errs = Object.values(q.jobs).filter((j) => j.status === "error");
  if (errs.length === 0) return null;
  return (
    <div className="mt-2 text-sm text-danger">
      {errs.map((j) => (
        <p key={j.t.localPath}>
          {j.t.file}: {j.error}
        </p>
      ))}
    </div>
  );
}
