"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { sectionState } from "@/lib/section-state";

/**
 * A notes-panel section that folds away: tap the title to open or close it.
 * When closed it shows a one-line `summary`; using its action button (Add…,
 * Mark this moment) opens it first. The state is remembered per section.
 */
export default function CollapsibleSection({
  id,
  title,
  icon: Icon,
  count,
  summary,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  count?: number;
  summary?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const open = useSyncExternalStore(sectionState.subscribe, () => sectionState.isOpen(id), () => true);

  return (
    <section
      id={`sec-${id}`}
      className={clsx("scroll-mt-[calc(4.5rem+56.25vw)] sm:scroll-mt-20 lg:scroll-mt-2", className)}
    >
      <div className="flex min-h-8 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => sectionState.set(id, !open)}
          aria-expanded={open}
          aria-controls={`sec-body-${id}`}
          className="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-bg-muted/60"
        >
          <ChevronDown size={15} className={clsx("shrink-0 text-ink-faint transition-transform duration-200", !open && "-rotate-90")} />
          {Icon && <Icon size={14} className="shrink-0 text-accent" />}
          <h3 className="truncate text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
          {!!count && (
            <span className="rounded-full bg-bg-muted px-1.5 text-[11px] font-medium text-ink-muted tabular-nums">{count}</span>
          )}
        </button>
        {action && (
          // Using the section's action (Add…) opens it first.
          <div className="shrink-0" onClickCapture={() => !open && sectionState.set(id, true)}>
            {action}
          </div>
        )}
      </div>
      {!open && summary && (
        <button type="button" onClick={() => sectionState.set(id, true)} className="mt-0.5 block w-full truncate pl-6 text-left text-xs text-ink-faint hover:text-ink-muted">
          {summary}
        </button>
      )}
      <div
        id={`sec-body-${id}`}
        className={clsx("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className={clsx("min-h-0 overflow-hidden", !open && "invisible")}>
          <div className="flex flex-col gap-2 pt-2">{children}</div>
        </div>
      </div>
    </section>
  );
}
