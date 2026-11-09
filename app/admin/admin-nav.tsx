"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const links = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/import", label: "Import HTML" },
  { href: "/admin/import/review", label: "Import .mhtml" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row gap-1 text-sm sm:flex-col">
      {links.map((l) => {
        // Most specific match wins ("/admin/import/review" isn't also "Import HTML").
        const active =
          pathname.startsWith(l.href) && !links.some((o) => o.href.length > l.href.length && o.href.startsWith(l.href) && pathname.startsWith(o.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={clsx(
              "rounded-lg px-3 py-2 transition-colors",
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-ink-muted hover:bg-bg-muted hover:text-ink"
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
