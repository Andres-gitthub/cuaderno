'use strict';
// Sube la versión cada vez que publiques cambios para que el iPad descargue la nueva app.
const VERSION = 'v2';
const APP_CACHE = 'cuaderno-app-' + VERSION;
const FONT_CACHE = 'cuaderno-fonts-' + VERSION;
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon-180.png',
  'vendor/jspdf.umd.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  const keep = new Set([APP_CACHE, FONT_CACHE]);
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('cuaderno-') && !keep.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(req){
  return caches.open(FONT_CACHE).then(cache => cache.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if(res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  if(url.origin !== self.location.origin) return;

  if(req.mode === 'navigate'){
    // La app es una sola página: cualquier navegación dentro del scope abre index.html.
    e.respondWith(
      caches.match('index.html', { cacheName: APP_CACHE })
        .then(hit => hit || fetch(req))
        .catch(() => caches.match('index.html'))
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
