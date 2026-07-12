"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const links = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/import", label: "Import" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row gap-1 text-sm sm:flex-col">
      {links.map((l) => {
        const active = pathname.startsWith(l.href);
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
