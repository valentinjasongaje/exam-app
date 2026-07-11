"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { signOutAction } from "./sign-out-action";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={clsx(
        "transition-colors",
        active ? "text-ink" : "text-ink-muted hover:text-ink"
      )}
    >
      {children}
    </Link>
  );
}

export default function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex items-center gap-5 text-sm">
      <NavLink href="/dashboard">Dashboard</NavLink>
      <NavLink href="/stats">Progress</NavLink>
      <NavLink href="/settings">Settings</NavLink>
      {isAdmin && <NavLink href="/admin">Admin</NavLink>}
      <form action={signOutAction}>
        <button type="submit" className="text-ink-muted transition-colors hover:text-ink">
          Log out
        </button>
      </form>
    </div>
  );
}
