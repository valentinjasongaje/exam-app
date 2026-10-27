/**
 * Which tab of the watch-page notes panel is showing (Formulas, Timeline,
 * Key points, Questions), plus each tab's item count. Shared between the tab
 * bar and the panels (which live in different components) and remembered in
 * this browser, so the next video opens on the tab you used last.
 */
export type NotesTabId = "formulas" | "timeline" | "keypoints" | "questions";
const KEY = "notes-tab";
const listeners = new Set<() => void>();
let active: NotesTabId | null = null;
let counts: Partial<Record<NotesTabId, number>> = {};

function current(): NotesTabId {
  if (active) return active;
  try {
    const v = localStorage.getItem(KEY);
    active = v === "timeline" || v === "keypoints" || v === "questions" ? v : "formulas";
  } catch {
    active = "formulas";
  }
  return active;
}

const emit = () => listeners.forEach((f) => f());

export const notesTab = {
  get: current,
  set(id: NotesTabId) {
    active = id;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private mode */
    }
    emit();
  },
  count: (id: NotesTabId) => counts[id],
  setCount(id: NotesTabId, n: number) {
    if (counts[id] === n) return;
    counts = { ...counts, [id]: n };
    emit();
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
