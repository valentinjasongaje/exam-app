"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { clsx } from "clsx";
import { setWatchedAction } from "../actions";

/** One-tap "watched" box for a checklist row, updated optimistically. */
export default function WatchCheckbox({
  localPath,
  id,
  watched,
  label,
}: {
  localPath?: string;
  id?: string;
  watched: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useOptimistic(watched);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Watched: ${label}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setChecked(!checked);
          await setWatchedAction({ localPath, id, watched: !checked });
        })
      }
      className={clsx(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
        checked ? "border-success bg-success text-bg" : "border-border-strong bg-bg-elevated hover:border-accent"
      )}
    >
      {checked && <Check size={15} strokeWidth={3} />}
    </button>
  );
}
