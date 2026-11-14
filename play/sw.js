// Keeps a copy of the game on the device so it plays with no signal. Each file is fetched fresh
// when there is a connection (so updates arrive) and saved; with no connection the saved copy is
// used. Only the game's own files are handled. Registered by main.ts in the finished game only.
const CACHE = 'powder-line-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest', './icon-192.png', './apple-touch-icon.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))),
  );
  self.clients.claim();
});

// On the first visit the game loaded before this helper started, so the game sends the list of
// files it loaded, and they are saved now: one visit is enough to play offline.
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.type === 'save' ? event.data.urls : [];
  const own = urls.filter((url) => new URL(url).origin === self.location.origin);
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(own.map((url) => cache.add(url).catch(() => {}))).then(() => clearOldCode(cache, own))),
  );
});

// Every update of the game gives its code files new names (assets/index-<letters>.js and so on), so
// without this the copies of every old version would pile up on the device for ever. After each
// visit, a saved file in assets/ is kept only if this visit loaded it, or if this version's own
// page or code names it (the small parts it loads later, such as the share menu's). Everything
// else in assets/ belongs to an older version and is removed. Nothing outside assets/ is touched.
async function clearOldCode(cache, loaded) {
  const inAssets = (url) => new URL(url).pathname.includes('/assets/');
  const current = loaded.filter(inAssets);
  // No code in this visit's list means something is odd (a page that isn't the game): remove nothing.
  if (!current.some((url) => new URL(url).pathname.endsWith('.js'))) return;
  let names = '';
  for (const url of [...current.filter((u) => /\.(js|css)$/.test(new URL(u).pathname)), './index.html']) {
    const saved = await cache.match(url, { ignoreVary: true });
    // A current file that isn't saved yet: its part-names can't be read, so remove nothing this time.
    if (!saved) return;
    names += await saved.text();
  }
  const keep = new Set(current.map((url) => new URL(url).pathname));
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (!inAssets(request.url) || keep.has(path)) continue;
    if (!names.includes(path.slice(path.lastIndexOf('/') + 1))) await cache.delete(request);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      // Match saved files by address only: the game's code is requested with extra headers
      // that would otherwise stop the saved copy from matching.
      .catch(() =>
        caches
          .match(request, { ignoreVary: true })
          .then((saved) => saved || (request.mode === 'navigate' ? caches.match('./index.html', { ignoreVary: true }) : Response.error())),
      ),
  );
});
