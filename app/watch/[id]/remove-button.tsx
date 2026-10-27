"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { removeFromDriveAction } from "../../tracker/drive-actions";

/** Deletes this video's copy from Google Drive to free space (G: file and progress stay). */
export default function RemoveFromDrive({ videoId, title }: { videoId: string; title: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete "${title}" from Google Drive? The file on G: and your progress stay.`)) return;
          start(async () => {
            const r = await removeFromDriveAction(videoId);
            if (r.error) setError(r.error);
            else router.push("/lessons");
          });
        }}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-danger disabled:opacity-50"
      >
        <Trash2 size={14} /> {pending ? "Removing…" : "Remove from Drive"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
