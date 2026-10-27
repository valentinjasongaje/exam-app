"use client";

import { useState } from "react";
import { Check, FolderOpen } from "lucide-react";

/** Copies a local file path (G:\...) so it can be pasted into File Explorer or a video player. */
export default function CopyPath({ path, label = "Copy path" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={path}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(path);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt("Copy this path:", path);
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-muted transition-colors hover:bg-bg-muted hover:text-accent"
    >
      {copied ? <Check size={13} className="text-success" /> : <FolderOpen size={13} />}
      {copied ? "Copied" : label}
    </button>
  );
}
