"use client";

import { Play } from "lucide-react";
import { clsx } from "clsx";
import { openVideoHref } from "@/lib/video-opener";
import { rememberLocalOpen } from "@/lib/local-watch";

/**
 * ▶ link that opens the file in the laptop's video player via the ecevideo:
 * handler. Remembers what was opened and when, so the site can offer to log
 * it afterwards (a desktop player can't report back).
 */
export default function OpenVideo({
  localPath,
  className,
  children,
}: {
  localPath: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={openVideoHref(localPath)}
      onClick={() => rememberLocalOpen(localPath)}
      title="Open in your video player"
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md text-accent transition-colors hover:text-accent-hover",
        className
      )}
    >
      <Play size={14} className="shrink-0 fill-current" />
      {children}
    </a>
  );
}
