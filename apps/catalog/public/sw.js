const CACHE = 'fashionaja-shell-v4'
const SHELL = ['/', '/index.html', '/icon-48.png', '/images/fashionaja-symbol.png', '/images/login.webp', '/images/register.webp', '/images/tee.webp', '/images/shirt.webp', '/images/hoodie.webp', '/images/jacket.webp', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    await cache.addAll(SHELL)
    const response = await fetch('/index.html')
    const html = await response.text()
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])
    if (assets.length) await cache.addAll(assets)
  }).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith('satria-catalog-') || key.startsWith('fashionaja-')) && key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || /^\/(api|sanctum|login|register|logout)(\/|$)/.test(url.pathname)) return
  if (/^\/(src|@vite|@id|@fs|node_modules)(\/|$)/.test(url.pathname)) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/index.html')) || Response.error()))
    return
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && (request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || request.destination === 'font')) {
      const copy = response.clone()
      void caches.open(CACHE).then((cache) => cache.put(request, copy))
    }
    return response
  })))
})
