"use client";

import { useOptimistic, useRef, useTransition } from "react";
import { Check } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import { setWatchedAction } from "../actions";

/**
 * "Watched" box for a video. Ticking or unticking asks for confirmation first
 * (a small in-app dialog), so a stray tap while scrolling doesn't change
 * progress; then it updates optimistically.
 */
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
  const dialog = useRef<HTMLDialogElement>(null);

  function confirm() {
    dialog.current?.close();
    startTransition(async () => {
      setChecked(!checked);
      await setWatchedAction({ localPath, id, watched: !checked });
    });
  }

  return (
    <>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Watched: ${label}`}
        disabled={pending}
        onClick={() => dialog.current?.showModal()}
        className={clsx(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
          checked ? "border-success bg-success text-bg" : "border-border-strong bg-bg-elevated hover:border-accent"
        )}
      >
        {checked && <Check size={15} strokeWidth={3} />}
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close(); // click outside closes
        }}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-bg-elevated p-0 text-ink shadow-xl backdrop:bg-black/50"
      >
        <div className="p-5">
          <p className="font-semibold">{checked ? "Mark as not watched?" : "Mark as watched?"}</p>
          <p className="mt-1.5 text-sm text-ink-muted">{label}</p>
          {checked && <p className="mt-2 text-xs text-ink-faint">Its watched time goes back to 0:00.</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => dialog.current?.close()} autoFocus>
              Cancel
            </Button>
            <Button type="button" variant={checked ? "danger" : "primary"} size="sm" onClick={confirm}>
              {checked ? "Mark not watched" : "Mark watched"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
