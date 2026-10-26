// Keeps a copy of the game on the device so it plays with no signal. Each file is fetched fresh
// when there is a connection (so updates arrive) and saved; with no connection the saved copy is
// used. Only the game's own files are handled. Registered by main.ts in the finished game only.
const CACHE = 'powder-line-v2';

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
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(own.map((url) => cache.add(url).catch(() => {})))));
});

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
