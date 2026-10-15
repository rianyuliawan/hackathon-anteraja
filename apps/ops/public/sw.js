const SHELL_CACHE = 'anteraja-portal-v8';
const OPTIONAL_SHELL = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/anteraja-logo.png', '/favicon.svg', '/auth-courier.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then(async (cache) => {
    await cache.addAll(['/', '/index.html']);
    await Promise.allSettled(OPTIONAL_SHELL.map((url) => cache.add(url)));
    const response = await fetch('/index.html');
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((match) => match[1]);
    await Promise.allSettled(assets.map((url) => cache.add(url)));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(api|sanctum|login|logout|register)(\/|$)/.test(url.pathname)) return;
  if (/^\/(src|@vite|@id|@fs|node_modules)(\/|$)/.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  if (/\.(js|css|svg|png|jpg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })));
  }
});
