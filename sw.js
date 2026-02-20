const CACHE_NAME = 'volt-vtc-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/charts.css',
  './css/animations.css',
  './css/responsive.css',
  './js/store.js',
  './js/utils.js',
  './js/demo-data.js',
  './js/components/toast.js',
  './js/components/modal.js',
  './js/components/sidebar.js',
  './js/components/header.js',
  './js/components/table.js',
  './js/components/form-builder.js',
  './js/pages/dashboard.js',
  './js/pages/chauffeurs.js',
  './js/pages/vehicules.js',
  './js/pages/versements.js',
  './js/pages/rentabilite.js',
  './js/pages/gps-conduite.js',
  './js/pages/rapports.js',
  './js/pages/comptabilite.js',
  './js/pages/planning.js',
  './js/pages/alertes.js',
  './js/pages/parametres.js',
  './js/router.js',
  './js/app.js',
  './assets/logo.svg',
  './assets/favicon.svg'
];

// Install — cache all assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache first, then network
self.addEventListener('fetch', (e) => {
  // Skip non-GET and external requests
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return response;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
