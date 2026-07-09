// Bibu Service Worker — ermöglicht PWA-Installation
const CACHE = 'bibu-v5';
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
  // Nur GET cachen. API-Calls (ElevenLabs) und Fonts immer live durchreichen.
  const url = e.request.url;
  if (
    e.request.method !== 'GET' ||
    url.includes('elevenlabs.io') ||
    url.includes('fonts.googleapis') ||
    url.includes('fonts.gstatic')
  ) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
