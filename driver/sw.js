const CACHE_NAME = 'volt-chauffeur-v1';

const STATIC_ASSETS = [
  '/driver/',
  '/driver/index.html',
  '/driver/css/driver.css',
  '/driver/js/driver-store.js',
  '/driver/js/driver-auth.js',
  '/driver/js/driver-router.js',
  '/driver/js/driver-app.js',
  '/driver/js/components/driver-toast.js',
  '/driver/js/components/driver-modal.js',
  '/driver/js/components/driver-nav.js',
  '/driver/js/pages/accueil.js',
  '/driver/js/pages/planning.js',
  '/driver/js/pages/versements.js',
  '/driver/js/pages/signalements.js',
  '/driver/js/pages/profil.js'
];

// Install — cache static assets
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
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // API calls: network only (no cache)
  if (request.url.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets: network-first with cache fallback
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
