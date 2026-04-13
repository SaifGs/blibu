// Bibu Service Worker — ermöglicht PWA-Installation
const CACHE = 'bibu-v2';
const FILES = [
  './',
  './index.html',
  './main.js',
  './session.js',
  './config.js',
  './ui.js',
  './mouth.js',
  './log.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // API-Calls und Fonts immer live (nicht cachen)
  if (e.request.url.includes('openai.com') || e.request.url.includes('fonts.googleapis')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
