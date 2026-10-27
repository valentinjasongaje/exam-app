"use client";

import { useEffect, useSyncExternalStore } from "react";
import { notesTab, type NotesTabId } from "@/lib/notes-tab";

/**
 * One tab's content in the watch-page notes panel. Only the active tab is
 * shown; the others stay mounted (hidden) so half-typed forms survive
 * switching tabs.
 */
export default function NotesTabPanel({
  id,
  title,
  icon: Icon,
  count,
  action,
  children,
}: {
  id: NotesTabId;
  title: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const active = useSyncExternalStore(notesTab.subscribe, () => notesTab.get() === id, () => id === "formulas");

  useEffect(() => {
    notesTab.setCount(id, count ?? 0);
  }, [id, count]);

  return (
    <section id={`notes-tab-${id}`} role="tabpanel" aria-labelledby={`notes-tabbtn-${id}`} hidden={!active} className={active ? "animate-enter" : undefined}>
      <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {Icon && <Icon size={14} className="text-accent" />}
          {title}
        </h3>
        {action}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
