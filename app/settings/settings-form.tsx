"use client";

import { useActionState } from "react";
import { updateSettingsAction, type SettingsState } from "./actions";
import { Button } from "@/components/ui";

const initialState: SettingsState = { error: null };

export default function SettingsForm({
  initialLayout,
  initialShuffle,
  initialInstantFeedback,
}: {
  initialLayout: "ALL_AT_ONCE" | "ONE_AT_A_TIME";
  initialShuffle: boolean;
  initialInstantFeedback: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Question layout</legend>
        <label className="choice-row">
          <input type="radio" name="preferredLayout" value="ONE_AT_A_TIME" defaultChecked={initialLayout === "ONE_AT_A_TIME"} />
          One question at a time
        </label>
        <label className="choice-row">
          <input type="radio" name="preferredLayout" value="ALL_AT_ONCE" defaultChecked={initialLayout === "ALL_AT_ONCE"} />
          All questions on one page
        </label>
      </fieldset>

      <label className="choice-row">
        <input type="checkbox" name="shuffleEnabled" defaultChecked={initialShuffle} />
        Shuffle questions and choices
      </label>

      <label className="choice-row">
        <input type="checkbox" name="instantFeedback" defaultChecked={initialInstantFeedback} />
        <span>
          Show the answer right after each question
          <span className="mt-0.5 block text-xs text-ink-muted">
            Practice mode with one-question-at-a-time layout only — never during board exams.
          </span>
        </span>
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Saved.</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
