/**
 * Lets the notes panel talk to the video player on the watch page (they are
 * separate components): read the current time, jump to a time.
 */
export type PlayerControls = { getTime: () => number; seek: (seconds: number) => void; setRate: (rate: number) => void; getRate: () => number; captureFrame: () => Promise<Blob | null>; skip: (deltaSeconds: number) => void; fullscreen: () => void };

let current: PlayerControls | null = null;
const listeners = new Set<() => void>();

export const playerBridge = {
  get: () => current,
  set(p: PlayerControls | null) {
    current = p;
    listeners.forEach((f) => f());
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
