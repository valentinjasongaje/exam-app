/**
 * Open/closed state of the collapsible sections in the watch-page notes panel,
 * remembered in this browser (so a section you closed stays closed on the
 * next video) and shared between components (the jump chips open sections
 * that live in other components).
 */
const KEY = "notes-sections";
const listeners = new Set<() => void>();
let cache: Record<string, boolean> | null = null;

function read(): Record<string, boolean> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    cache = {};
  }
  return cache!;
}

export const sectionState = {
  isOpen: (id: string) => read()[id] !== false,
  set(id: string, open: boolean) {
    cache = { ...read(), [id]: open };
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* private mode */
    }
    listeners.forEach((f) => f());
  },
  setAll(ids: string[], open: boolean) {
    cache = { ...read(), ...Object.fromEntries(ids.map((id) => [id, open])) };
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* private mode */
    }
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};

/** Opens a section and scrolls it into view (below the pinned player on phones). */
export function jumpToSection(id: string) {
  sectionState.set(id, true);
  requestAnimationFrame(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}
