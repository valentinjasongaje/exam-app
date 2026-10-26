/** Videos opened in the laptop's own player (ecevideo:), remembered in this browser until logged or dismissed. */
export type LocalOpen = { localPath: string; openedAt: number };
const KEY = "local-video-opens";

export function readLocalOpens(): LocalOpen[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(list: LocalOpen[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("local-video-opens"));
  } catch {
    /* private mode */
  }
}

export function rememberLocalOpen(localPath: string) {
  const day = 24 * 3600_000;
  const list = readLocalOpens().filter((o) => o.localPath !== localPath && Date.now() - o.openedAt < day);
  write([...list, { localPath, openedAt: Date.now() }].slice(-5));
}

export function forgetLocalOpen(localPath: string) {
  write(readLocalOpens().filter((o) => o.localPath !== localPath));
}
