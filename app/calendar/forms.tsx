"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addEventAction, moveBlockAction, type FormState } from "./actions";
import { Button } from "@/components/ui";

const initialState: FormState = { error: null };

export function MoveBlockForm({
  date,
  blockKey,
  defaultDate,
  defaultStart,
  defaultEnd,
}: {
  date: string;
  blockKey: string;
  defaultDate: string;
  defaultStart: string;
  defaultEnd: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(moveBlockAction, initialState);

  // After a successful move the parent re-keys this component (new day/time),
  // which remounts it closed — no effect needed.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-muted transition-colors hover:text-accent"
      >
        Move
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex w-full flex-wrap items-end gap-2 rounded-lg bg-bg-muted p-2.5">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="blockKey" value={blockKey} />
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        Day
        <input type="date" name="newDate" defaultValue={defaultDate} className="field py-1 text-xs" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        From
        <input type="time" name="newStart" defaultValue={defaultStart} className="field py-1 text-xs" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        To
        <input type="time" name="newEnd" defaultValue={defaultEnd} className="field py-1 text-xs" />
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Moving…" : "Move"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function AddEventForm({ date }: { date: string }) {
  const [state, formAction, pending] = useActionState(addEventAction, initialState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success || !ref.current) return;
    for (const name of ["title", "start", "end", "note"]) {
      const el = ref.current.elements.namedItem(name);
      if (el instanceof HTMLInputElement) el.value = "";
    }
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
        <input name="title" required placeholder="e.g. Overtime, PRC filing deadline" aria-label="Event title" className="field min-w-0" />
        <select name="kind" aria-label="Event type" defaultValue="EVENT" className="field min-w-0">
          <option value="EVENT">Event</option>
          <option value="BUSY">Busy</option>
          <option value="DEADLINE">Deadline</option>
        </select>
      </div>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <input type="date" name="date" defaultValue={date} aria-label="Date" className="field min-w-0 text-xs" />
        <input type="time" name="start" aria-label="Start time (optional)" className="field min-w-0 text-xs" />
        <input type="time" name="end" aria-label="End time (optional)" className="field min-w-0 text-xs" />
      </div>
      <p className="text-xs text-ink-faint">Leave the times empty for an all-day event.</p>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add event"}
        </Button>
        {state.error && <p className="text-xs text-danger">{state.error}</p>}
        {state.success && !pending && <p className="text-xs text-success">Added.</p>}
      </div>
    </form>
  );
}
