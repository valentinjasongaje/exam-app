"use client";

import { useState, useSyncExternalStore } from "react";
import { clsx } from "clsx";
import { playerBridge } from "@/lib/player-bridge";

const RATES = [1, 1.25, 1.5, 1.75, 2];

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
