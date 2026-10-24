"use client";

import { useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

type State = "idle" | "loading" | "streaming" | "done" | "error";

export default function ExplainButton({
  attemptId,
  questionId,
  wrong,
}: {
  attemptId: string;
  questionId: string;
  wrong: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const [text, setText] = useState("");
  const busy = useRef(false);

  async function run(regenerate = false) {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    setText("");
    try {
      if (regenerate) {
        await fetch("/api/explain", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId, questionId }),
        });
      }
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, questionId }),
      });
      if (!res.ok || !res.body) {
        setText((await res.text()) || "Couldn't get an explanation right now.");
        setState("error");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setState("streaming");
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setText((t) => t + chunk);
      }
      setState("done");
    } catch {
      setText("Network error — check your connection and try again.");
      setState("error");
    } finally {
      busy.current = false;
    }
  }

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => run()}
        className="mt-3 ml-9 inline-flex items-center gap-1.5 text-sm text-accent transition-colors hover:text-accent-hover"
      >
        <Sparkles size={14} />
        {wrong ? "Explain my mistake" : "Explain this"}
      </button>
    );
  }

  return (
    <div className="mt-3 ml-9 rounded-lg border border-accent/30 bg-accent-soft/40 p-3 text-sm">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-accent">
        <Sparkles size={12} /> Claude&rsquo;s explanation
      </p>
      {state === "loading" ? (
        <p className="animate-pulse text-ink-muted">Thinking it through…</p>
      ) : (
        <p className={state === "error" ? "text-danger" : "whitespace-pre-line text-ink"}>{text}</p>
      )}
      {(state === "done" || state === "error") && (
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">AI can make mistakes — trust the answer key and solution above.</p>
          <button
            type="button"
            onClick={() => run(state === "done")}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted hover:text-accent"
          >
            <RefreshCw size={11} /> {state === "done" ? "Regenerate" : "Try again"}
          </button>
        </div>
      )}
    </div>
  );
}
