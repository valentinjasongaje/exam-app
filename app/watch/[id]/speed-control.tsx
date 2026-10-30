"use client";

import { useState, useSyncExternalStore } from "react";
import { clsx } from "clsx";
import { Maximize, RotateCcw, RotateCw } from "lucide-react";
import { playerBridge } from "@/lib/player-bridge";

const RATES = [1, 1.25, 1.5, 1.75, 2];

/** Back/forward 10 s buttons for the built-in player (also: ← → keys, double-tap the video). */
export function SkipButtons() {
  const ready = useSyncExternalStore(playerBridge.subscribe, () => playerBridge.get() !== null, () => false);
  if (!ready) return null;
  const btn =
    "inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent hover:text-ink active:scale-95";
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Skip">
      <button type="button" onClick={() => playerBridge.get()?.skip(-10)} className={btn} title="Back 10 s (← or J)">
        <RotateCcw size={14} /> 10s
      </button>
      <button type="button" onClick={() => playerBridge.get()?.skip(10)} className={btn} title="Forward 10 s (→ or L)">
        10s <RotateCw size={14} />
      </button>
      <button type="button" onClick={() => playerBridge.get()?.fullscreen()} className={btn} title="Fullscreen" aria-label="Fullscreen">
        <Maximize size={14} />
      </button>
    </div>
  );
}

/** Playback speed buttons for the built-in player (hidden with Drive's player). */
export default function SpeedControl() {
  const ready = useSyncExternalStore(playerBridge.subscribe, () => playerBridge.get() !== null, () => false);
  const [rate, setRate] = useState<number | null>(null);
  if (!ready) return null;
  const current = rate ?? playerBridge.get()?.getRate() ?? 1;
  return (
    <div className="flex items-center gap-1 text-sm" role="group" aria-label="Playback speed">
      <span className="mr-1 text-ink-muted">Speed</span>
      {RATES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => {
            playerBridge.get()?.setRate(r);
            setRate(r);
          }}
          aria-pressed={current === r}
          className={clsx(
            "rounded-md px-1.5 py-0.5 text-xs tabular-nums",
            current === r ? "bg-accent text-bg" : "text-ink-muted hover:bg-bg-muted hover:text-ink"
          )}
        >
          {r}×
        </button>
      ))}
    </div>
  );
}
