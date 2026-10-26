"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2 } from "lucide-react";
import { watchProgress, type WatchProgress } from "@/lib/watch-progress-store";

const initial: WatchProgress = { share: 0, completed: false, justCompleted: false, tracking: false };

/** "Auto-tracking · 34% watched" next to the player controls. */
export default function WatchStatus() {
  const p = useSyncExternalStore(watchProgress.subscribe, watchProgress.get, () => initial);
  if (p.justCompleted) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
        <CheckCircle2 size={13} /> Marked as watched automatically
      </span>
    );
  }
  if (!p.tracking) {
    return <span className="text-xs text-ink-faint">Not auto-tracked in Drive&rsquo;s player</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted" title="Time watched is logged to the tracker on its own. Done at 90% played.">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      Auto-tracking · {p.completed ? "watched" : `${Math.floor(p.share)}% played`}
    </span>
  );
}
