"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { logSessionAction, type FormState } from "./actions";
import { Button } from "@/components/ui";

const initialState: FormState = { error: null };

type VideoOption = { id: string; title: string; subject: string; remaining: number };

export default function LogSessionForm({
  today,
  defaultDate = today,
  subjects,
  videos,
  compact = false,
}: {
  today: string;
  defaultDate?: string;
  subjects: readonly { slug: string; name: string }[];
  videos: VideoOption[];
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(logSessionAction, initialState);
  const [activity, setActivity] = useState("VIDEO");
  const [subject, setSubject] = useState(subjects[0]?.slug ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the duration/note fields after a successful save, keep subject/activity.
  useEffect(() => {
    if (!state.success || !formRef.current) return;
    for (const name of ["duration", "note", "score", "total"]) {
      const el = formRef.current.elements.namedItem(name);
      if (el instanceof HTMLInputElement) el.value = "";
    }
  }, [state]);

  const subjectVideos = videos.filter((v) => v.subject === subject && v.remaining > 0);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 sm:grid-cols-4"}>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Date</span>
          <input type="date" name="date" defaultValue={defaultDate} max={today} className="field" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Subject</span>
          <select
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="field"
          >
            {subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Activity</span>
          <select
            name="activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            className="field"
          >
            <option value="VIDEO">Video</option>
            <option value="PROBLEMS">Problems</option>
            <option value="QUIZ">Timed quiz / mock</option>
            <option value="REVIEW">Formula review</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Time spent</span>
          <input
            name="duration"
            placeholder="90 or 1:30"
            inputMode="numeric"
            required
            className="field"
          />
        </label>
      </div>

      {activity === "VIDEO" && subjectVideos.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Video watched (adds to its progress)</span>
          <select name="videoId" defaultValue="" className="field">
            <option value="">— none —</option>
            {subjectVideos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} ({v.remaining} min left)
              </option>
            ))}
          </select>
        </label>
      )}

      {activity === "QUIZ" && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-muted">Score</span>
            <input name="score" inputMode="numeric" placeholder="34" className="field" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-muted">Items</span>
            <input name="total" inputMode="numeric" placeholder="50" className="field" />
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Note (optional)</span>
        <input name="note" placeholder="e.g. BJT biasing, stuck on Q12" className="field" />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Log session"}
        </Button>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        {state.success && !pending && <p className="text-sm text-success">Logged.</p>}
      </div>
    </form>
  );
}
