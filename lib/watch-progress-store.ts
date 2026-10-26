/** Latest auto-tracked progress of the video on the watch page (player → status line). */
export type WatchProgress = { share: number; completed: boolean; justCompleted: boolean; tracking: boolean; mode: "loading" | "native" | "drive" };

let state: WatchProgress = { share: 0, completed: false, justCompleted: false, tracking: false, mode: "loading" };
const listeners = new Set<() => void>();

export const watchProgress = {
  get: () => state,
  set(p: Partial<WatchProgress>) {
    state = { ...state, ...p };
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
