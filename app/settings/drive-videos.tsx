"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Cloud, Loader2, Trash2 } from "lucide-react";
import { removeFromDriveAction, removeWatchedFromDriveAction } from "../tracker/drive-actions";

type Video = { id: string; title: string; watched: boolean };

/**
 * Videos uploaded to Google Drive, with a remove button each (and one for
 * all watched ones) to free Drive space. The file on G: and progress stay.
 */
export default function DriveVideos({ videos }: { videos: Video[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [, start] = useTransition();
  const watched = videos.filter((v) => v.watched).length;

  function run(key: string, fn: () => Promise<{ error: string | null; message?: string }>) {
    setBusy(key);
    setConfirming(null);
    start(async () => {
      const r = await fn().catch(() => ({ error: "Couldn't reach the server.", message: undefined }));
      setBusy(null);
      setMsg(r.error ? { error: true, text: r.error } : r.message ? { error: false, text: r.message } : null);
      router.refresh();
    });
  }

  if (videos.length === 0) {
    return <p className="text-sm text-ink-muted">No videos on Google Drive yet. Upload them from Lessons → Videos.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-ink-muted">
          {videos.length} on Drive · {watched} watched
        </span>
        {watched > 0 &&
          (confirming === "watched" ? (
            <span className="flex items-center gap-2 text-xs">
              Remove {watched} watched?
              <button type="button" onClick={() => run("watched", removeWatchedFromDriveAction)} className="font-medium text-danger hover:underline">
                Remove
              </button>
              <button type="button" onClick={() => setConfirming(null)} className="text-ink-muted hover:underline">
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setConfirming("watched")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs font-medium hover:bg-bg-muted disabled:opacity-50"
            >
              {busy === "watched" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Remove all watched
            </button>
          ))}
      </div>
      {msg && <p className={msg.error ? "text-xs text-danger" : "text-xs text-success"}>{msg.text}</p>}
      <ul className="max-h-96 overflow-y-auto rounded-lg border border-border">
        {videos.map((v) => (
          <li key={v.id} className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0">
            {v.watched ? <CheckCircle2 size={15} className="shrink-0 text-success" /> : <Cloud size={15} className="shrink-0 text-accent" />}
            <span className="min-w-0 flex-1 truncate">{v.title}</span>
            {confirming === v.id ? (
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <button type="button" onClick={() => run(v.id, () => removeFromDriveAction(v.id))} className="font-medium text-danger hover:underline">
                  Remove
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="text-ink-muted hover:underline">
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setConfirming(v.id)}
                aria-label={`Remove ${v.title} from Google Drive`}
                className="shrink-0 rounded p-1 text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-50"
              >
                {busy === v.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-faint">Removing deletes the Drive copy only. The file on G: and your progress stay, and you can upload it again.</p>
    </div>
  );
}
