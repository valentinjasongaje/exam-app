import { CalendarDays, ClipboardCheck, NotebookPen, PlayCircle, Sun, TrendingUp, type LucideIcon } from "lucide-react";

/**
 * The main sections of the app, in order. `match` decides which item is
 * highlighted for a path (sub-pages count, e.g. /watch belongs to Lessons).
 */
export type NavItem = { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean; mobile?: boolean };

const under = (...prefixes: string[]) => (path: string) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export const NAV_ITEMS: NavItem[] = [
  { href: "/daily", label: "Today", icon: Sun, match: under("/daily"), mobile: true },
  { href: "/lessons", label: "Lessons", icon: PlayCircle, match: under("/lessons", "/watch"), mobile: true },
  { href: "/dashboard", label: "Practice", icon: ClipboardCheck, match: under("/dashboard", "/subject", "/exam", "/attempt"), mobile: true },
  { href: "/notes", label: "Notes", icon: NotebookPen, match: under("/notes"), mobile: true },
  { href: "/stats", label: "Progress", icon: TrendingUp, match: under("/stats", "/tracker"), mobile: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, match: under("/calendar") },
];

/** Full-screen study modes where the phone tab bar would only get in the way. */
export const FOCUS_ROUTES = [/^\/attempt\/[^/]+$/, /^\/daily\/session/, /^\/notes\/recall/, /^\/notes\/problems/];
