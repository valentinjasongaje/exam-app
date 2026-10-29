"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, Menu, Settings, Shield, X } from "lucide-react";
import { signOutAction } from "./sign-out-action";
import { FOCUS_ROUTES, NAV_ITEMS } from "@/lib/nav-items";

/** Main navigation: icon + label links on larger screens, a ☰ sheet and a bottom tab bar on phones. */
export default function NavLinks({ isAdmin, name }: { isAdmin: boolean; name: string | null }) {
  const pathname = usePathname();
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

  const focusMode = FOCUS_ROUTES.some((r) => r.test(pathname));
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <>
      {/* Tablet / desktop: icons always, labels from md up */}
      <div className="hidden items-center gap-0.5 text-sm sm:flex">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors",
                active ? "bg-accent-soft text-ink" : "text-ink-muted hover:bg-bg-muted hover:text-ink"
              )}
            >
              <Icon size={16} className={clsx("shrink-0", active && "text-accent")} />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
        <AccountMenu isAdmin={isAdmin} name={name} />
      </div>

      {/* Phone: ☰ opens everything (incl. Calendar, Settings, Admin, Log out) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-bg-muted hover:text-ink sm:hidden"
      >
        {open ? <X size={19} /> : <Menu size={19} />}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 sm:hidden">
            <button type="button" aria-label="Close menu" tabIndex={-1} onClick={close} className="animate-fade absolute inset-0 bg-black/40" />
            <div className="animate-sheet absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto rounded-b-2xl border-b border-border bg-bg px-4 pt-4 pb-6 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
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
              <div className="flex flex-col gap-0.5 text-base">
                {items.map((item) => {
                  const active = item.match(pathname);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      className={clsx(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                        active ? "bg-accent-soft text-ink" : "text-ink-muted hover:bg-bg-muted hover:text-ink"
                      )}
                    >
                      <Icon size={19} className={active ? "text-accent" : undefined} />
                      {item.label}
                    </Link>
                  );
                })}
                <div className="my-2 border-t border-border" />
                <Link href="/settings" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-ink-muted hover:bg-bg-muted hover:text-ink">
                  <Settings size={19} /> Settings
                </Link>
                {isAdmin && (
                  <Link href="/admin" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-ink-muted hover:bg-bg-muted hover:text-ink">
                    <Shield size={19} /> Admin
                  </Link>
                )}
                <form action={signOutAction}>
                  <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-ink-muted hover:bg-bg-muted hover:text-ink">
                    <LogOut size={19} /> Log out
                  </button>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Phone: bottom tab bar (hidden in full-screen study modes) */}
      {!focusMode &&
        createPortalSafe(
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
          >
            <div className="grid grid-cols-5">
              {items.filter((i) => i.mobile).map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "relative flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
                      active ? "text-accent" : "text-ink-muted"
                    )}
                  >
                    {active && <span className="animate-pop absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
                    <Icon size={21} strokeWidth={active ? 2.3 : 1.8} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
    </>
  );
}

/** Portals into <body> once mounted (avoids SSR/hydration differences). */
function createPortalSafe(node: React.ReactNode) {
  return <BodyPortal>{node}</BodyPortal>;
}

function BodyPortal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only portal target
    setEl(document.body);
  }, []);
  return el ? createPortal(children, el) : null;
}

/** Initial + menu: Settings, Admin, Log out. */
function AccountMenu({ isAdmin, name }: { isAdmin: boolean; name: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (name?.trim()[0] ?? "?").toUpperCase();
  const active = pathname.startsWith("/settings") || pathname.startsWith("/admin");

  return (
    <div ref={ref} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className={clsx(
          "flex items-center gap-1 rounded-full py-0.5 pr-1.5 pl-0.5 transition-colors hover:bg-bg-muted",
          active && "bg-accent-soft"
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">{initial}</span>
        <ChevronDown size={14} className={clsx("text-ink-faint transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="animate-pop-in absolute top-full right-0 z-50 mt-2 w-48 rounded-xl border border-border bg-bg-elevated p-1 text-sm shadow-lg">
          {name && <p className="truncate px-3 pt-2 pb-1.5 text-xs text-ink-faint">{name}</p>}
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-ink-muted hover:bg-bg-muted hover:text-ink">
            <Settings size={15} /> Settings
          </Link>
          {isAdmin && (
            <Link href="/admin" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-ink-muted hover:bg-bg-muted hover:text-ink">
              <Shield size={15} /> Admin
            </Link>
          )}
          <form action={signOutAction}>
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-ink-muted hover:bg-bg-muted hover:text-ink">
              <LogOut size={15} /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
