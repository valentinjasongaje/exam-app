"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTopicAction, addVideoAction, type FormState } from "./actions";
import { Button } from "@/components/ui";

const initialState: FormState = { error: null };

type Subject = { slug: string; name: string };

function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.success || !ref.current) return;
    for (const el of Array.from(ref.current.elements)) {
      if (el instanceof HTMLInputElement && el.type !== "hidden") el.value = "";
    }
    ref.current.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus();
  }, [state]);
  return ref;
}

export function AddTopicForm({ subject }: { subject: Subject }) {
  const [state, formAction, pending] = useActionState(addTopicAction, initialState);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="subject" value={subject.slug} />
      <input
        name="name"
        placeholder={`Add a ${subject.name} topic`}
        aria-label={`New ${subject.name} topic`}
        className="field min-w-0 flex-1 py-1.5"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Add
      </Button>
      {state.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function AddVideoForm({ subjects }: { subjects: readonly Subject[] }) {
  const [state, formAction, pending] = useActionState(addVideoAction, initialState);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr_7rem]">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Subject</span>
          <select name="subject" className="field">
            {subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Title</span>
          <input name="title" required placeholder="e.g. Elex 03 — BJT Biasing" className="field" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Length</span>
          <input name="duration" required placeholder="1:45" className="field" />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Link (optional)</span>
        <input name="url" type="url" placeholder="https://…" className="field" />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add video"}
        </Button>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        {state.success && !pending && <p className="text-sm text-success">Added.</p>}
      </div>
    </form>
  );
}
