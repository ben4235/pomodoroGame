// Focus Forge SW – v12 cache
const CACHE = 'focus-forge-v12';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game_v10.js?v=12',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// install: cache fresh assets
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

// activate: clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : undefined)))
    )
  );
  self.clients.claim();
});

// fetch: cache-first for same-origin files
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request))
    );
  }
});
