/**
 * Remembers the user's review-video folder in the browser (Chrome/Edge File
 * System Access API) so a plan video can be read and uploaded with one
 * click, without a file dialog each time. Client-only.
 *
 * The folder handle is stored in IndexedDB on this browser; reading from it
 * needs the user's permission, which Chrome asks for once per visit (or
 * never, with "Allow on every visit").
 */

type Perm = "granted" | "denied" | "prompt";
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: "read" }) => Promise<Perm>;
  requestPermission?: (o: { mode: "read" }) => Promise<Perm>;
};

const DB = "ece-video-folder";
const STORE = "handles";
const KEY = "root";

export function folderPickerSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredFolder(): Promise<DirHandle | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DirHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function storeFolder(h: DirHandle) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(h, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Must be called from a click. Opens the folder picker and remembers the choice. */
export async function pickFolder(): Promise<DirHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (o?: object) => Promise<DirHandle> }).showDirectoryPicker;
  const h = await picker({ id: "ece-review-videos", mode: "read" });
  await storeFolder(h);
  return h;
}

/** Must be called from a click when it may need to ask. */
export async function ensureReadPermission(h: DirHandle) {
  if (!h.queryPermission || !h.requestPermission) return true;
  if ((await h.queryPermission({ mode: "read" })) === "granted") return true;
  return (await h.requestPermission({ mode: "read" })) === "granted";
}

/**
 * Finds a plan video (absolute G:\ path) inside the remembered folder. Works
 * whichever level was picked — the drive, "Excel Review Center", "OCTOBER
 * 2024"… — by lining the folder's name up with the path.
 */
export async function resolveVideo(h: DirHandle, localPath: string): Promise<File> {
  const parts = localPath.replace(/^[A-Za-z]:\\/, "").split("\\").filter(Boolean);
  const isDriveRoot = h.name === "" || /^[A-Za-z]:\\?$/.test(h.name);
  const at = isDriveRoot ? -1 : parts.findIndex((p) => p.toLowerCase() === h.name.toLowerCase());
  if (!isDriveRoot && at < 0) {
    throw new Error(`This video isn't inside "${h.name}". Choose G:\\Excel Review Center as your video folder.`);
  }
  let dir: FileSystemDirectoryHandle = h;
  const rest = parts.slice(at + 1);
  try {
    for (const p of rest.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
    const fh = await dir.getFileHandle(rest[rest.length - 1]);
    return await fh.getFile();
  } catch {
    throw new Error("Couldn't find this file in your video folder. Is the G: drive plugged in?");
  }
}
