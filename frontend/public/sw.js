// Vinylarium service worker — deliberately MINIMAL.
//
// It caches ONLY same-origin media (covers/avatars) for speed + offline browsing.
// It never caches the HTML app shell or /assets/ bundles, so a freshly deployed
// build is always picked up from the network (nginx serves index.html no-cache,
// /assets immutable) — the SW must not regress that guarantee.
const MEDIA_CACHE = 'vinylarium-media-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop superseded media caches.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('vinylarium-media-') && k !== MEDIA_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Cache-first for covers/avatars only — everything else goes straight to the
  // network so HTML/JS/API stay fresh.
  if (url.origin === self.location.origin && url.pathname.startsWith('/media/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MEDIA_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
  }
});
