const CACHE = 'ys-0'

self.addEventListener('install', event => {
  event.waitUntil(precache())
})

self.addEventListener('fetch', event => {
  event.respondWith(fromCacheOrFetch(event.request))
})

const precache = () =>
  caches.open(CACHE).then(cache =>
    cache.addAll([
      'https://fonts.googleapis.com/icon?family=Material+Icons',
      'galaxy.jpg',
    ]))

const updateCache = request =>
  caches.open(CACHE).then(cache =>
    fetch(request).then(response =>
      cache.put(request, response.clone()).then(() =>
        response)))

const fromCacheOrFetch = request =>
  caches.open(CACHE).then(cache =>
    cache.match(request).then(response =>
      response || updateCache(request)))
