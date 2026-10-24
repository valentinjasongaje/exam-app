"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { disableFeedAction, enableFeedAction } from "./actions";

export default function FeedCard({ feedUrl }: { feedUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!feedUrl) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          Get a private link that shows this calendar (plan blocks, moved/skipped changes, topic
          reviews and your events) in Google Calendar. It updates on its own.
        </p>
        <form action={enableFeedAction}>
          <Button type="submit" size="sm">Create subscribe link</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex gap-2">
        <input readOnly value={feedUrl} aria-label="Calendar subscribe link" className="field min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(feedUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* clipboard blocked — the field is selectable */
            }
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-ink-muted">
        <li>Open Google Calendar on a computer.</li>
        <li>Next to &ldquo;Other calendars&rdquo;, click <span className="text-ink">+</span> → <span className="text-ink">From URL</span>.</li>
        <li>Paste the link and click <span className="text-ink">Add calendar</span>.</li>
      </ol>
      <p className="text-xs text-ink-faint">
        Google refreshes subscribed calendars every few hours, so changes show up with a delay.
        Anyone with the link can see your schedule — reset it if you shared it by mistake.
      </p>
      <div className="flex gap-3">
        <form action={enableFeedAction}>
          <button type="submit" className="text-xs text-ink-muted hover:text-accent">Reset link</button>
        </form>
        <form action={disableFeedAction}>
          <button type="submit" className="text-xs text-ink-muted hover:text-danger">Turn off</button>
        </form>
      </div>
    </div>
  );
}
