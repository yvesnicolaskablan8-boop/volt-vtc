const CACHE_NAME = 'volt-chauffeur-v3';

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
  '/driver/js/pages/profil.js',
  '/driver/js/pages/notifications.js',
  '/driver/js/pages/messagerie.js'
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

// =================== PUSH NOTIFICATIONS ===================

// Push event — afficher la notification systeme
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { titre: 'Volt VTC', message: event.data ? event.data.text() : 'Nouvelle notification' };
  }

  const options = {
    body: data.message || 'Vous avez une nouvelle notification',
    icon: '/driver/icons/icon-192.png',
    badge: '/driver/icons/icon-72.png',
    data: {
      url: data.url || '/driver/#/notifications',
      type: data.type || 'info'
    },
    vibrate: [200, 100, 200],
    tag: data.type || 'volt-notification', // Evite les doublons du meme type
    renotify: true,
    actions: [
      { action: 'open', title: 'Ouvrir' },
      { action: 'dismiss', title: 'Fermer' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.titre || 'Volt VTC', options)
  );
});

// Click sur notification — ouvrir/focus l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/driver/#/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Si l'app est deja ouverte, focus et naviguer
        for (const client of clientList) {
          if (client.url.includes('/driver/') && 'focus' in client) {
            client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              url: url
            });
            return;
          }
        }
        // Sinon ouvrir une nouvelle fenetre
        return self.clients.openWindow(url);
      })
  );
});

// Notification close event (optionnel — pour tracking)
self.addEventListener('notificationclose', (event) => {
  // On pourrait envoyer un event de "dismissed" au serveur
  console.log('[SW] Notification fermee:', event.notification.tag);
});
