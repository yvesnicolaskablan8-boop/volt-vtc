/**
 * DriverApp — Bootstrap de l'application chauffeur PWA
 */
const DriverApp = {
  init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/driver/sw.js')
        .then(() => console.log('SW registered'))
        .catch(err => console.warn('SW registration failed:', err));
    }

    // Ecouter les messages du Service Worker (notification click)
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
          const url = event.data.url;
          if (url && url.includes('#/')) {
            window.location.hash = url.split('#')[1];
          }
        }
      });
    }

    // Setup login form
    this._setupLoginForm();

    // Setup refresh button
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        const route = DriverRouter.getCurrentRoute();
        const page = DriverRouter._routes[route];
        if (page) {
          const content = document.getElementById('app-content');
          if (content) {
            content.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
            page.render(content);
          }
        }
      });
    }

    // Setup notification bell
    const notifBtn = document.getElementById('btn-notifications');
    if (notifBtn) {
      notifBtn.addEventListener('click', () => {
        window.location.hash = '#/notifications';
      });
    }

    // Register pages
    DriverRouter.register('accueil', AccueilPage);
    DriverRouter.register('planning', PlanningPage);
    DriverRouter.register('versements', VersementsPage);
    DriverRouter.register('signalements', SignalementsPage);
    DriverRouter.register('profil', ProfilPage);
    DriverRouter.register('notifications', NotificationsPage);

    // Check auth
    if (DriverAuth.isLoggedIn()) {
      this.showApp();
    } else {
      this.showLogin();
    }
  },

  showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
  },

  showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    DriverRouter.init();

    // Verifier deadline pour alerte sonore a l'ouverture
    this._checkDeadlineSound();

    // Demander la permission push + charger le badge notifications
    this._setupPushNotifications();
    this._loadNotificationBadge();
  },

  // =================== PUSH NOTIFICATIONS ===================

  async _setupPushNotifications() {
    // Verifier le support
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[Push] Notifications non supportees par ce navigateur');
      return;
    }

    // Si deja refuse, ne pas re-demander
    if (Notification.permission === 'denied') {
      console.log('[Push] Permission refusee');
      return;
    }

    // Recuperer la cle VAPID du serveur
    const vapid = await DriverStore.getVapidKey();
    if (!vapid || !vapid.configured || !vapid.publicKey) {
      console.log('[Push] VAPID non configure sur le serveur');
      return;
    }

    // Si pas encore de permission, demander (apres un delai pour ne pas etre intrusif)
    if (Notification.permission === 'default') {
      // Attendre 3 secondes apres le login pour demander
      setTimeout(async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          this._registerPushSubscription(vapid.publicKey);
        }
      }, 3000);
    } else if (Notification.permission === 'granted') {
      this._registerPushSubscription(vapid.publicKey);
    }
  },

  async _registerPushSubscription(vapidPublicKey) {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Verifier si on a deja une subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Creer une nouvelle subscription
        const applicationServerKey = this._urlBase64ToUint8Array(vapidPublicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
        console.log('[Push] Nouvelle subscription creee');
      }

      // Envoyer au serveur
      const result = await DriverStore.subscribePush(subscription.toJSON());
      if (result && !result.error) {
        console.log('[Push] Subscription enregistree sur le serveur');
      }
    } catch (err) {
      console.warn('[Push] Erreur inscription:', err.message);
    }
  },

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  // =================== NOTIFICATION BADGE ===================

  async _loadNotificationBadge() {
    try {
      const data = await DriverStore.getNotifications(1);
      if (data && typeof NotificationsPage !== 'undefined') {
        NotificationsPage.updateBadge(data.nonLues || 0);
      }
    } catch (e) {
      // Silently fail
    }
  },

  // =================== DEADLINE SOUND ===================

  async _checkDeadlineSound() {
    if (sessionStorage.getItem('volt_deadline_sound_played')) return;
    try {
      const deadline = await DriverStore.getDeadline();
      if (deadline && deadline.configured && !deadline.alreadyPaid && deadline.remainingMs <= 24 * 3600 * 1000 && deadline.remainingMs > 0) {
        // Jouer l'alerte sonore
        if (typeof DriverCountdown !== 'undefined') {
          DriverCountdown.playAlertSound();
        }
        sessionStorage.setItem('volt_deadline_sound_played', '1');
      }
    } catch (e) {
      console.warn('Deadline sound check failed:', e);
    }
  },

  _setupLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const tel = document.getElementById('login-tel').value.trim();
      const pin = document.getElementById('login-pin').value.trim();
      const btn = document.getElementById('btn-login');
      const errorEl = document.getElementById('login-error');

      if (!tel || !pin) {
        errorEl.textContent = 'Veuillez remplir tous les champs';
        errorEl.style.display = 'block';
        return;
      }

      // Show loading
      btn.disabled = true;
      btn.querySelector('.btn-text').style.display = 'none';
      btn.querySelector('.btn-loading').style.display = 'inline';
      errorEl.style.display = 'none';

      const result = await DriverAuth.login(tel, pin);

      if (result.success) {
        DriverToast.show('Bienvenue !', 'success');
        this.showApp();
      } else {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
      }

      // Reset button
      btn.disabled = false;
      btn.querySelector('.btn-text').style.display = 'inline';
      btn.querySelector('.btn-loading').style.display = 'none';
    });
  }
};

// Launch app
document.addEventListener('DOMContentLoaded', () => DriverApp.init());
