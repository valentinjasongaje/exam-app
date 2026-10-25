"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
        "py-2.5 transition-colors sm:py-0",
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = (
    <>
      <NavLink href="/dashboard" onNavigate={close}>
        Dashboard
      </NavLink>
      <NavLink href="/stats" onNavigate={close}>
        Progress
      </NavLink>
      <NavLink href="/tracker" onNavigate={close}>
        Tracker
      </NavLink>
      <NavLink href="/calendar" onNavigate={close}>
        Calendar
      </NavLink>
      <NavLink href="/notes" onNavigate={close}>
        Notes
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

      {/* Rendered into <body> so no page element (pinned video, exam timer bar,
          the header's own blur) can sit on top of the menu or clip it. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 sm:hidden">
            <button
              type="button"
              aria-label="Close menu"
              tabIndex={-1}
              onClick={close}
              className="absolute inset-0 bg-black/30"
            />
            <div className="absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto border-b border-border bg-bg px-4 pt-4 pb-6 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-serif text-lg font-semibold">
                  Menu<span className="text-accent">.</span>
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close menu"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-bg-muted hover:text-ink"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-col gap-1 text-base">
                {links}
                <form action={signOutAction}>
                  <button type="submit" className="w-full py-2.5 text-left text-ink-muted transition-colors hover:text-ink">
                    Log out
                  </button>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
