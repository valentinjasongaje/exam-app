"use client";

import { useState, useTransition } from "react";
import { Cloud, RefreshCw, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui";
import { disconnectDriveAction, removeWatchedFromDriveAction, syncDriveAction, type DriveActionResult } from "../tracker/drive-actions";
import DriveUploader, { type UploadCandidate } from "./drive-uploader";

const GB = 1024 ** 3;
const gb = (n: number) => `${(n / GB).toFixed(n < 10 * GB ? 1 : 0)} GB`;

export default function DrivePanel({
  connected,
  email,
  quota,
  quotaError,
  onDriveCount,
  onDriveBytes,
  watchedOnDrive,
  candidates,
  status,
}: {
  connected: boolean;
  email: string | null;
  quota: { limit: number | null; usage: number; free: number | null } | null;
  quotaError: string | null;
  onDriveCount: number;
  onDriveBytes: number;
  watchedOnDrive: number;
  candidates: UploadCandidate[];
  status: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<DriveActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<DriveActionResult>) => start(async () => setResult(await fn()));

  const statusMsg: Record<string, string> = {
    connected: "Google Drive connected.",
    denied: "Drive access wasn't allowed. Try again when you're ready.",
    noscope: "Google didn't grant Drive access. Tick the Drive permission on the consent screen.",
    error: "Couldn't connect Google Drive. Try again.",
  };

  if (!connected) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium">Watch from anywhere with Google Drive</p>
          <p className="text-ink-muted">
            Upload plan videos to your Drive, watch them here on your phone or any computer, and remove them when you&rsquo;re
            done. The app can only see the videos it uploads.
          </p>
          {status && statusMsg[status] && <p className="mt-1 text-danger">{statusMsg[status]}</p>}
        </div>
        <a href="/api/drive/connect" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover">
          <Cloud size={15} /> Connect Google Drive
        </a>
      </div>
    );
  }

  const usedPct = quota?.limit ? Math.min(100, (quota.usage / quota.limit) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Cloud size={15} className="text-accent" /> Google Drive{email ? ` · ${email}` : ""}
          </p>
          <p className="text-ink-muted">
            {onDriveCount} plan video{onDriveCount === 1 ? "" : "s"} on Drive ({gb(onDriveBytes)})
            {quota?.free != null && ` · ${gb(quota.free)} free`}
          </p>
          {quota?.limit ? (
            <div className="mt-1.5 h-1.5 w-56 max-w-full overflow-hidden rounded-full bg-bg-muted">
              <div className="h-full bg-accent" style={{ width: `${usedPct}%` }} />
            </div>
          ) : null}
          {quotaError && <p className="text-xs text-danger">{quotaError}</p>}
          {status === "connected" && <p className="text-xs text-success">{statusMsg.connected}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "Close uploader" : "Upload videos"}
          </Button>
          {watchedOnDrive > 0 && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                if (confirm(`Delete ${watchedOnDrive} watched video${watchedOnDrive > 1 ? "s" : ""} from Google Drive? The files on G: and your progress stay.`))
                  run(removeWatchedFromDriveAction);
              }}
            >
              <Trash2 size={14} /> Free space ({watchedOnDrive} watched)
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(syncDriveAction)} title="Re-check what's on Drive">
            <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> Check Drive
          </Button>
        </div>
      </div>
      {result && <p className={result.error ? "text-sm text-danger" : "text-sm text-success"}>{result.error ?? result.message}</p>}
      {open && <DriveUploader candidates={candidates} freeBytes={quota?.free ?? null} />}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm("Disconnect Google Drive? Videos already uploaded stay in your Drive and can still be watched here.")) run(disconnectDriveAction);
        }}
        className="inline-flex items-center gap-1.5 self-start text-xs text-ink-faint hover:text-danger"
      >
        <Unplug size={12} /> Disconnect Drive
      </button>
    </div>
  );
}
