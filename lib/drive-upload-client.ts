/**
 * Browser-side Drive upload (client components only).
 *
 * Sends file bytes straight from the browser to Google Drive over a
 * resumable session the server opened (/api/drive/session), in 32 MB chunks
 * with retries and resume, so big lecture files survive flaky Wi-Fi without
 * going through the website. Then /api/drive/complete links the file.
 */

export type UploadTarget = { localPath: string; file: string; bytes: number };

const CHUNK = 32 * 1024 * 1024; // multiple of 256 KiB, as Drive requires

async function openSession(t: UploadTarget, size: number) {
  const res = await fetch("/api/drive/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ localPath: t.localPath, size }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't reach Google Drive.");
  return data.sessionUrl as string;
}

async function sendBytes(session: string, f: Blob, onProgress: (sent: number) => void, signal: AbortSignal) {
  const total = f.size;
  let offset = 0;
  let tries = 0;
  for (;;) {
    const end = Math.min(offset + CHUNK, total);
    try {
      const res = await fetch(session, {
        method: "PUT",
        signal,
        headers: { "Content-Range": `bytes ${offset}-${end - 1}/${total}` },
        body: f.slice(offset, end),
      });
      if (res.status === 200 || res.status === 201) {
        onProgress(total);
        return (await res.json()) as { id: string; size: string };
      }
      if (res.status === 308) {
        const range = res.headers.get("Range"); // "bytes=0-12345" when readable
        offset = range ? Number(range.split("-")[1]) + 1 : end;
        onProgress(offset);
        tries = 0;
        continue;
      }
      if (res.status === 404 || res.status === 410) throw new Error("The upload expired. Start this video again.");
      throw new Error(`Upload failed (${res.status}).`);
    } catch (e) {
      if (signal.aborted) throw e;
      if (++tries > 6) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** tries));
      // Ask Drive how much it actually received, then continue from there.
      try {
        const q = await fetch(session, { method: "PUT", signal, headers: { "Content-Range": `bytes */${total}` } });
        if (q.status === 200 || q.status === 201) return (await q.json()) as { id: string; size: string };
        const range = q.headers.get("Range");
        offset = range ? Number(range.split("-")[1]) + 1 : offset;
      } catch {
        /* retry the same chunk */
      }
    }
  }
}

/** Uploads one plan video file and links it to the plan. Throws with a readable message on failure. */
export async function uploadToDrive(t: UploadTarget, f: File, onProgress: (sent: number) => void, signal: AbortSignal) {
  if (f.size !== t.bytes) throw new Error("That file's size doesn't match the plan video.");
  const session = await openSession(t, f.size);
  const file = await sendBytes(session, f, onProgress, signal);
  const res = await fetch("/api/drive/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ localPath: t.localPath, fileId: file.id }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save the upload.");
  return file.id;
}
