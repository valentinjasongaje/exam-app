/*
 * Streams the user's Drive videos into a normal <video> element.
 * The page asks for /drive-media/<fileId>; this worker forwards the request
 * (including the Range header, so seeking works) to the Drive API with the
 * Authorization header the <video> tag can't add itself. Only /drive-media/
 * is touched; every other request goes to the network as usual.
 */
const PREFIX = "/drive-media/";
let token = null;
let expires = 0;
let pending = null;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function getToken(force) {
  if (!force && token && Date.now() < expires) return Promise.resolve(token);
  if (!pending) {
    pending = fetch("/api/drive/token", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("token " + r.status))))
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
  } catch {
    return new Response("", { status: 502 });
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  e.respondWith(stream(url.pathname.slice(PREFIX.length), e.request));
});
