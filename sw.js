// Ganaderia Offline SW (v2026-02-20f)
const CACHE_PREFIX = 'ganaderia-offline-';
const CACHE = `${CACHE_PREFIX}2026-02-20f`;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './sw.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => {
        if (k.startsWith(CACHE_PREFIX) && k !== CACHE) return caches.delete(k);
      }));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Solo GET
  if (req.method !== 'GET') return;

  e.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached);

      // cache-first para navegación, stale-while-revalidate para el resto
      if (req.mode === 'navigate') return cached || fetchPromise;
      return cached || fetchPromise;
    })
  );
});
