/*
 * Streams the user's Drive videos into a normal <video> element.
 * The page asks for /drive-media/<fileId>; this worker forwards the request
 * (including the Range header, so seeking works) to the Drive API with the
 * Authorization header the <video> tag can't add itself. Only /drive-media/
 * is touched; every other request goes to the network as usual.
 */
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

async function stream(id, request) {
  const range = request.headers.get("range");
  const go = async (force) =>
    fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "?alt=media", {
      headers: Object.assign({ Authorization: "Bearer " + (await getToken(force)) }, range ? { Range: range } : {}),
    });
  try {
    let res = await go(false);
    if (res.status === 401) res = await go(true);
    return res;
  } catch (err) {
    // Readable reason for the page's "couldn't start" message.
    return new Response(JSON.stringify({ error: { message: (err && err.message) || "Network error reaching Google Drive." } }), {
      status: (err && err.status) || 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  e.respondWith(stream(url.pathname.slice(PREFIX.length), e.request));
});
