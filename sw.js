const CACHE = 'pt-shell-v2';
const SHELL = [
  './',
  './index.html',
  './css/style.css?v=2',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/marked.min.js?v=2',
  './js/util.js?v=2',
  './js/model.js?v=2',
  './js/crypto.js?v=2',
  './js/db.js?v=2',
  './js/calc.js?v=2',
  './js/issues.js?v=2',
  './js/reconcile.js?v=2',
  './js/prices.js?v=2',
  './js/github.js?v=2',
  './js/cache.js?v=2',
  './js/zip.js?v=2',
  './js/views.js?v=2',
  './js/app.js?v=2'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.indexOf('/data/') !== -1) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match(req); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    const net = fetch(req).then(function (res) {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
