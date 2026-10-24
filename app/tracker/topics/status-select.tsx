"use client";

import { useTransition } from "react";
import { clsx } from "clsx";
import { setTopicStatusAction } from "../actions";

const OPTIONS = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
  { value: "NEEDS_REVIEW", label: "Needs review" },
];

const TONE: Record<string, string> = {
  NOT_STARTED: "text-ink-muted",
  IN_PROGRESS: "text-accent",
  DONE: "text-success",
  NEEDS_REVIEW: "text-danger",
};

export default function StatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Topic status"
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("status", e.target.value);
        startTransition(() => setTopicStatusAction(fd));
      }}
      className={clsx("field py-1 text-xs", TONE[status], pending && "opacity-60")}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
