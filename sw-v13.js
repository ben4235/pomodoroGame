// Focus Forge SW – v13 cache (new filename => fresh scope)
const CACHE = 'focus-forge-v13';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game_v10.js?v=12',
  './boot_v13.js?v=13',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : undefined)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request))
    );
  }
});
