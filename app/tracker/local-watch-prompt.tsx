"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Laptop, X } from "lucide-react";
import { forgetLocalOpen, readLocalOpens, type LocalOpen } from "@/lib/local-watch";
import { formatMinutes } from "@/lib/study-plan";
import { logLocalWatchAction } from "./local-watch-actions";

type Plan = { localPath: string; title: string; minutes: number; watchedMinutes: number; done: boolean };

/**
 * A video opened in the laptop's player can't report back, so the next time
 * you're on the site this asks once: "You opened X 52 min ago — log it?"
 * The time defaults to how long ago it was opened, capped at what's left.
 */
export default function LocalWatchPrompt({ plan }: { plan: Plan[] }) {
  const [opens, setOpens] = useState<LocalOpen[]>([]);
  const [now, setNow] = useState(0);
  const [mins, setMins] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const load = () => {
      setOpens(readLocalOpens());
      setNow(Date.now());
    };
    load();
    window.addEventListener("local-video-opens", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("local-video-opens", load);
      window.removeEventListener("focus", load);
    };
  }, []);

  // Ask once at least 5 minutes have passed since opening.
  const due = opens
    .map((o) => ({ o, p: plan.find((p) => p.localPath === o.localPath) }))
    .filter((x): x is { o: LocalOpen; p: Plan } => !!x.p && now - x.o.openedAt > 5 * 60_000);
  if (due.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {due.map(({ o, p }) => {
        const ago = Math.round((now - o.openedAt) / 60_000);
        const left = Math.max(1, p.minutes - (p.done ? 0 : p.watchedMinutes));
        const suggested = String(Math.min(ago, p.done ? p.minutes : left, 240));
        const value = mins[o.localPath] ?? suggested;
        const submit = (markWatched: boolean) =>
          start(async () => {
            const res = await logLocalWatchAction(o.localPath, Number(value), markWatched);
            if (!("error" in res)) {
              forgetLocalOpen(o.localPath);
              router.refresh();
            }
          });
        return (
          <div key={o.localPath} className="rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3 text-sm">
            <p className="flex items-start gap-2">
              <Laptop size={16} className="mt-0.5 shrink-0 text-accent" />
              <span>
                You opened <span className="font-medium">{p.title}</span> on your laptop {ago < 90 ? `${ago} min` : formatMinutes(ago)} ago. Log it?
              </span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
              <label className="flex items-center gap-1.5 text-ink-muted">
                Watched
                <input
                  value={value}
                  onChange={(e) => setMins((m) => ({ ...m, [o.localPath]: e.target.value.replace(/\D/g, "") }))}
                  inputMode="numeric"
                  aria-label="Minutes watched"
                  className="field w-16 px-2 py-1 text-center tabular-nums"
                />
                min
              </label>
              <button
                type="button"
                disabled={pending || !Number(value)}
                onClick={() => submit(false)}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink disabled:opacity-50"
              >
                Log time
              </button>
              {!p.done && (
                <button
                  type="button"
                  disabled={pending || !Number(value)}
                  onClick={() => submit(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  <Check size={12} /> Log + finished it
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  forgetLocalOpen(o.localPath);
                  setOpens(readLocalOpens());
                }}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-ink-muted hover:text-ink"
              >
                <X size={12} /> Didn&rsquo;t watch
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
