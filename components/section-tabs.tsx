"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

export type SectionTab = { href: string; label: string; icon: LucideIcon; exact?: boolean };

/** Sub-navigation inside a section (Lessons: Videos / Topics / Library; Progress: Scores / Study log). */
export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-8 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Section">
      <div className="flex min-w-max gap-1 border-b border-border text-sm">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors",
                active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
              )}
            >
              <Icon size={15} className={active ? "text-accent" : undefined} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
