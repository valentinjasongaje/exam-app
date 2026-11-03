"use client";

import { useActionState } from "react";
import { updateWeeklyTargetsAction, type SettingsState } from "./actions";
import { Button } from "@/components/ui";
import { subjectBg } from "@/lib/study-balance";

const initialState: SettingsState = { error: null };

/** Hours per week for each subject; blank or 0 = no target (still shows when you study it). */
export default function TargetsForm({ subjects }: { subjects: { slug: string; name: string; minutes: number }[] }) {
  const [state, formAction, pending] = useActionState(updateWeeklyTargetsAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {subjects.map((s) => (
          <label key={s.slug} className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <span className={`h-2.5 w-2.5 rounded-full ${subjectBg(s.slug)}`} /> {s.name}
            </span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                name={s.slug}
                min={0}
                max={80}
                step={0.5}
                inputMode="decimal"
                defaultValue={s.minutes ? s.minutes / 60 : ""}
                placeholder="0"
                className="w-full rounded-lg border border-border-strong bg-bg px-2.5 py-1.5 tabular-nums"
              />
              <span className="text-xs text-ink-muted">h</span>
            </span>
          </label>
        ))}
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Saved.</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save targets"}
        </Button>
      </div>
    </form>
  );
}
