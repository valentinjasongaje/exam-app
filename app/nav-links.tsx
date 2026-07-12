"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { signOutAction } from "./sign-out-action";

function NavLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
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
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const links = (
    <>
      <NavLink href="/dashboard" onNavigate={close}>
        Dashboard
      </NavLink>
      <NavLink href="/stats" onNavigate={close}>
        Progress
      </NavLink>
      <NavLink href="/settings" onNavigate={close}>
        Settings
      </NavLink>
      {isAdmin && (
        <NavLink href="/admin" onNavigate={close}>
          Admin
        </NavLink>
      )}
    </>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden items-center gap-5 text-sm sm:flex">
        {links}
        <form action={signOutAction}>
          <button type="submit" className="text-ink-muted transition-colors hover:text-ink">
            Log out
          </button>
        </form>
      </div>

      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-bg-muted hover:text-ink sm:hidden"
      >
        {open ? <X size={19} /> : <Menu size={19} />}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 sm:hidden"
          />
          <div className="absolute inset-x-0 top-full border-b border-border bg-bg px-4 py-4 shadow-lg sm:hidden">
            <div className="flex flex-col gap-4 text-sm">
              {links}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-ink-muted transition-colors hover:text-ink"
                >
                  Log out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
