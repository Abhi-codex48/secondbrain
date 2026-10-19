// Keeps the app usable even when the network or GitHub Pages is down:
// the page and its files are served from this device's cache when needed.
const CACHE = "secondbrain-v3";
const SHELL = ["./", "./index.html", "./icon.svg", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("./index.html")) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // Firebase and Google requests go straight to the network
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/news.json")) {
    e.respondWith(networkFirst(req));
  } else if (url.pathname.includes("/assets/")) {
    e.respondWith(cacheFirst(req)); // file names change with every build, so cached copies never go stale
  } else {
    e.respondWith(networkFirst(req));
  }
});
