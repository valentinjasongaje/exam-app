"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const tabs = [
  { href: "/tracker", label: "Overview" },
  { href: "/tracker/topics", label: "Topics" },
  { href: "/tracker/videos", label: "Videos" },
  { href: "/tracker/library", label: "Library" },
];

export default function TrackerNav() {
  const pathname = usePathname();
  return (
    <div className="mb-8 flex gap-1 border-b border-border text-sm">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "-mb-px border-b-2 px-3 py-2 transition-colors",
              active
                ? "border-accent text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
