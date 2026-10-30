/*
 * Streams the user's Drive videos into a normal <video> element.
 * The page asks for /drive-media/<fileId>; this worker forwards the request
 * (including the Range header, so seeking works) to the Drive API with the
 * Authorization header the <video> tag can't add itself. Only /drive-media/
 * is touched; every other request goes to the network as usual.
 */
// v4: writes its own range headers (Safari/iPhone needs them)
// v3: claim on request (pages opened before the worker was active)
const PREFIX = "/drive-media/";
let token = null;
let expires = 0;
let pending = null;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// A page that was already open when this worker became active (another tab
// installed it, or the site was opened before it existed) isn't controlled
// yet; the player asks the worker to take it over.
self.addEventListener("message", (e) => {
  if (e.data === "claim") e.waitUntil(self.clients.claim());
});

function getToken(force) {
  if (!force && token && Date.now() < expires) return Promise.resolve(token);
  if (!pending) {
    pending = fetch("/api/drive/token", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (r.ok) return r.json();
        const d = await r.json().catch(() => ({}));
        const err = new Error(d.error || "Couldn't get Drive access (" + r.status + ").");
        err.status = r.status;
        throw err;
      })
      .then((d) => {
        token = d.token;
        expires = Date.now() + Math.max(60, (d.expiresIn || 3600) - 300) * 1000;
        return token;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

const API = "https://www.googleapis.com/drive/v3/files/";
const meta = new Map(); // fileId -> Promise<{ size, mimeType }>

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authed(url, extra, force) {
  return fetch(url, { headers: Object.assign({ Authorization: "Bearer " + (await getToken(force)) }, extra || {}) });
}

async function authedRetry(url, extra) {
  let res = await authed(url, extra, false);
  if (res.status === 401) res = await authed(url, extra, true);
  return res;
}

// File size and type, so the worker can write the range headers itself.
// Google's cross-origin response hides Content-Range from scripts, and
// Safari won't play a 206 without it (Chrome is lenient).
function fileMeta(id) {
  if (!meta.has(id)) {
    const p = authedRetry(API + encodeURIComponent(id) + "?fields=size,mimeType&supportsAllDrives=true").then(async (r) => {
      if (!r.ok) {
        meta.delete(id);
        const d = await r.json().catch(() => ({}));
        const err = new Error((d.error && d.error.message) || "Google Drive error " + r.status);
        err.status = r.status;
        throw err;
      }
      const d = await r.json();
      return { size: Number(d.size), mimeType: d.mimeType || "video/mp4" };
    });
    meta.set(id, p);
  }
  return meta.get(id);
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") {
    // suffix range: last N bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return { start, end };
}

async function stream(id, request) {
  try {
    const { size, mimeType } = await fileMeta(id);
    const url = API + encodeURIComponent(id) + "?alt=media&supportsAllDrives=true";
    const range = request.headers.get("range");
    const r = range ? parseRange(range, size) : null;

    if (r && (r.start >= size || r.start > r.end)) {
      return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
    }

    const res = await authedRetry(url, r ? { Range: "bytes=" + r.start + "-" + r.end } : null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return errorResponse(res.status, (d.error && d.error.message) || "Google Drive error " + res.status);
    }

    const headers = new Headers({ "Content-Type": mimeType, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
    if (r && res.status === 206) {
      headers.set("Content-Range", "bytes " + r.start + "-" + r.end + "/" + size);
      headers.set("Content-Length", String(r.end - r.start + 1));
      return new Response(res.body, { status: 206, headers });
    }
    headers.set("Content-Length", String(size));
    return new Response(res.body, { status: 200, headers });
  } catch (err) {
    // Readable reason for the page's "couldn't start" message.
    return errorResponse((err && err.status) || 502, (err && err.message) || "Network error reaching Google Drive.");
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  e.respondWith(stream(url.pathname.slice(PREFIX.length), e.request));
});
