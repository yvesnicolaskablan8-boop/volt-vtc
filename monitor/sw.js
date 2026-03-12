const CACHE_NAME = 'volt-monitor-v9';

const STATIC_ASSETS = [
  '/monitor/',
  '/monitor/index.html',
  '/monitor/manifest.json',
  '/monitor/favicon.svg',
  '/monitor/css/monitor.css',
  '/monitor/js/monitor.js',
  '/monitor/assets/icon-192.png',
  '/monitor/assets/icon-512.png'
];

// Install — pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('volt-monitor-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — network-only for API, network-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // API calls: toujours reseau
  if (request.url.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Static: network-first, fallback cache
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
