/**
 * DriverApp — Bootstrap de l'application chauffeur PWA
 */
const DriverApp = {
  _deferredPrompt: null,

  init() {
    // Restore saved theme
    const savedTheme = localStorage.getItem('pilote_theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/driver/sw.js', { updateViaCache: 'none' })
        .then(reg => {
          console.log('SW registered');
          setInterval(() => reg.update(), 60000);
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (newSW) {
              newSW.addEventListener('statechange', () => {
                if (newSW.state === 'activated') {
                  window.location.reload();
                }
              });
            }
          });
        })
        .catch(err => console.warn('SW registration failed:', err));
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!this._swReloading) {
          this._swReloading = true;
          window.location.reload();
        }
      });
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

    // PWA Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._deferredPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
      this._deferredPrompt = null;
      this._hideInstallButton();
      if (typeof DriverToast !== 'undefined') DriverToast.show('Pilote Chauffeur installé !', 'success');
    });

    // Setup install button
    this._setupInstallButton();

    // Setup login form
    this._setupLoginForm();

    // Setup refresh button
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        const route = DriverRouter.getCurrentRoute();
        if (!route) return;
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

    // Setup back button
    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.history.back();
      });
    }

    // Register pages
    DriverRouter.register('accueil', AccueilPage);
    DriverRouter.register('planning', PlanningPage);
    DriverRouter.register('versements', VersementsPage);
    DriverRouter.register('dettes', DettesPage);
    DriverRouter.register('signalements', SignalementsPage);
    DriverRouter.register('profil', ProfilPage);
    DriverRouter.register('notifications', NotificationsPage);
    DriverRouter.register('messagerie', MessageriePage);
    DriverRouter.register('maintenance', MaintenancePage);
    if (typeof EtatLieuxPage !== 'undefined') DriverRouter.register('etat-lieux', EtatLieuxPage);
    if (typeof DocumentsPage !== 'undefined') DriverRouter.register('documents', DocumentsPage);
    if (typeof SupportPage !== 'undefined') DriverRouter.register('support', SupportPage);
    if (typeof TrajetsPage !== 'undefined') DriverRouter.register('trajets', TrajetsPage);
    if (typeof ChecklistPage !== 'undefined') DriverRouter.register('checklist', ChecklistPage);
    if (typeof ClassementPage !== 'undefined') DriverRouter.register('classement', ClassementPage);
    if (typeof ContraventionsDriverPage !== 'undefined') DriverRouter.register('contraventions', ContraventionsDriverPage);
    if (typeof ContratPage !== 'undefined') DriverRouter.register('contrat', ContratPage);

    // Ecouter les evenements online/offline
    this._setupOfflineDetection();

    // Check auth
    if (DriverAuth.isLoggedIn()) {
      this.showApp();
    } else {
      this.showLogin();
    }
  },

  // =================== OFFLINE DETECTION ===================

  _setupOfflineDetection() {
    // Creer la banniere (cachee par defaut)
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.className = 'offline-banner';
    const icon = document.createElement('iconify-icon');
    icon.setAttribute('icon', 'solar:cloud-cross-bold');
    icon.style.fontSize = '1rem';
    banner.appendChild(icon);
    banner.appendChild(document.createTextNode(' Mode hors-ligne \u2014 Donn\u00e9es en cache'));
    banner.style.display = 'none';
    document.body.prepend(banner);

    // Etat initial
    if (!navigator.onLine) {
      this._showOfflineBanner();
    }

    window.addEventListener('offline', () => {
      this._showOfflineBanner();
    });

    window.addEventListener('online', () => {
      this._hideOfflineBanner();
      if (typeof DriverToast !== 'undefined') {
        DriverToast.show('Connexion r\u00e9tablie', 'success');
      }
    });
  },

  _showOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = 'flex';
    document.body.classList.add('has-offline-banner');
  },

  _hideOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = 'none';
    document.body.classList.remove('has-offline-banner');
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
    this._loadMessagesBadge();

    // Demarrer le tracking GPS
    this._startLocationTracking();
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

  // =================== MESSAGES BADGE ===================

  async _loadMessagesBadge() {
    try {
      const data = await DriverStore.pollMessages();
      if (data && typeof MessageriePage !== 'undefined') {
        MessageriePage.updateBadge(data.nonLus || 0);
      }
    } catch (e) {
      // Silently fail
    }
  },

  // =================== DEADLINE SOUND ===================

  async _checkDeadlineSound() {
    try {
      const deadline = await DriverStore.getDeadline();
      if (!deadline || !deadline.configured || deadline.alreadyPaid) return;
      if (typeof DriverCountdown === 'undefined') return;

      const ms = deadline.remainingMs;

      // Cas 1 : Deadline depassee ou < 1h → alarme agressive
      if (ms <= 0 || (ms > 0 && ms <= 3600 * 1000)) {
        if (sessionStorage.getItem('pilote_alarm_dismissed')) return;
        DriverCountdown.init(deadline);
        DriverCountdown.startAlarm();
        return;
      }

      // Cas 2 : < 24h → son simple (1 seule fois par session)
      if (ms <= 24 * 3600 * 1000) {
        if (sessionStorage.getItem('pilote_deadline_sound_played')) return;
        DriverCountdown.playAlertSound();
        sessionStorage.setItem('pilote_deadline_sound_played', '1');
      }
    } catch (e) {
      console.warn('Deadline sound check failed:', e);
    }
  },

  // =================== LOCATION TRACKING (ADAPTATIF) ===================

  _watchId: null,
  _lastSendTime: 0,
  _lastLat: null,
  _lastLng: null,
  _lastSpeed: 0,
  _immobileSince: 0,
  _heartbeatTimer: null,
  _GPS_BUFFER_KEY: 'pilote_gps_buffer',
  _GPS_BUFFER_MAX: 200,

  // Frequence adaptative selon la vitesse (km/h)
  _getSendInterval(speedKmh) {
    if (speedKmh == null || speedKmh < 3) return 120000;   // Immobile: 2min
    if (speedKmh < 30) return 15000;                        // Lent: 15s
    if (speedKmh <= 80) return 10000;                       // Normal: 10s
    return 5000;                                             // Rapide: 5s
  },

  // Distance Haversine en metres
  _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  async _startLocationTracking() {
    if (!('geolocation' in navigator)) {
      console.log('[Geo] Geolocation non supportee');
      return;
    }

    // Verifier si la permission est deja accordee (silencieux)
    let permissionState = 'prompt';
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        permissionState = perm.state;
        perm.addEventListener('change', () => {
          if (perm.state === 'granted' && !this._watchId) {
            this._startWatch();
          } else if (perm.state === 'denied' && this._watchId) {
            this._stopLocationTracking();
          }
        });
      } catch (e) { /* certains navigateurs ne supportent pas */ }
    }

    if (permissionState === 'granted') {
      console.log('[Geo] Permission deja accordee, tracking adaptatif demarre');
      this._startWatch();
    } else if (permissionState === 'prompt') {
      console.log('[Geo] Demande de permission geolocation...');
      navigator.geolocation.getCurrentPosition(
        () => {
          console.log('[Geo] Permission accordee, tracking adaptatif demarre');
          this._startWatch();
        },
        (err) => console.warn('[Geo] Permission refusee ou erreur:', err.message),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      console.log('[Geo] Permission refusee, tracking desactive');
    }

    // Gestion visibilite — envoyer position quand l'app perd le focus
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this._lastLat != null) {
        this._sendNow(this._lastLat, this._lastLng, this._lastSpeed, null, null);
      }
    });

    // Flush buffer GPS au beforeunload
    window.addEventListener('beforeunload', () => {
      if (this._lastLat != null) {
        this._bufferPoint(this._lastLat, this._lastLng, this._lastSpeed, null, null);
      }
    });
  },

  _startWatch() {
    if (this._watchId) return;

    this._watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speed = pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : null;
        const heading = pos.coords.heading;
        const accuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;

        // Alimenter le module d'analyse de conduite (temps reel)
        if (typeof DriverBehavior !== 'undefined' && DriverBehavior._active) {
          DriverBehavior.updatePosition(lat, lng, speed, heading);
        }

        // Notifier le trip tracker s'il est actif
        if (typeof DriverTripTracker !== 'undefined') {
          DriverTripTracker.onPosition(lat, lng, speed, heading, accuracy);
        }

        // Detection deplacement > 50m → envoi immediat
        const movedFar = this._lastLat != null && this._haversine(this._lastLat, this._lastLng, lat, lng) > 50;

        // Frequence adaptative
        const now = Date.now();
        const interval = this._getSendInterval(speed);

        if (movedFar || (now - this._lastSendTime >= interval)) {
          this._lastSendTime = now;
          this._sendNow(lat, lng, speed, heading, accuracy);
        }

        this._lastLat = lat;
        this._lastLng = lng;
        this._lastSpeed = speed || 0;

        // Baisser precision quand immobile
        if (speed != null && speed < 3) {
          if (!this._immobileSince) this._immobileSince = now;
        } else {
          this._immobileSince = 0;
        }
      },
      (err) => console.warn('[Geo] Erreur watchPosition:', err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    console.log('[Geo] watchPosition adaptatif actif (id:', this._watchId, ')');

    // Heartbeat fallback — getCurrentPosition toutes les 60s si watchPosition silencieux
    this._heartbeatTimer = setInterval(() => {
      const silentFor = Date.now() - this._lastSendTime;
      if (silentFor > 60000 && this._watchId) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const speed = pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : null;
            this._sendNow(lat, lng, speed, pos.coords.heading, null);
            this._lastLat = lat;
            this._lastLng = lng;
          },
          () => {},
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
        );
      }
    }, 60000);

    // Drain du buffer offline au demarrage
    this._drainOfflineBuffer();
  },

  async _sendNow(lat, lng, speed, heading, accuracy) {
    try {
      await DriverStore.sendLocation(lat, lng, speed, heading, accuracy);
      // Succes — drainer le buffer offline aussi
      this._drainOfflineBuffer();
    } catch (e) {
      // Echec reseau — stocker en buffer offline
      this._bufferPoint(lat, lng, speed, heading, accuracy);
    }
  },

  _bufferPoint(lat, lng, speed, heading, accuracy) {
    try {
      const raw = localStorage.getItem(this._GPS_BUFFER_KEY);
      const buffer = raw ? JSON.parse(raw) : [];
      buffer.push({ lat, lng, speed, heading, accuracy, t: Date.now() });
      // Limiter a 200 points
      if (buffer.length > this._GPS_BUFFER_MAX) buffer.splice(0, buffer.length - this._GPS_BUFFER_MAX);
      localStorage.setItem(this._GPS_BUFFER_KEY, JSON.stringify(buffer));
    } catch (e) { /* localStorage plein ou indisponible */ }
  },

  async _drainOfflineBuffer() {
    try {
      const raw = localStorage.getItem(this._GPS_BUFFER_KEY);
      if (!raw) return;
      const buffer = JSON.parse(raw);
      if (!buffer.length) return;
      // Envoyer en batch
      await DriverStore.sendLocationBatch(buffer);
      localStorage.removeItem(this._GPS_BUFFER_KEY);
      console.log('[Geo] Buffer offline draine:', buffer.length, 'points');
    } catch (e) {
      // Le batch endpoint n'existe peut-etre pas encore ou reseau ko
    }
  },

  _stopLocationTracking() {
    if (this._watchId) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
      this._lastSendTime = 0;
    }
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  },

  // =================== PWA INSTALL ===================

  _setupInstallButton() {
    const btn = document.getElementById('btn-install-pwa');
    if (!btn) return;
    btn.addEventListener('click', () => this._installPWA());

    // Masquer si déjà installé (mode standalone)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      btn.style.display = 'none';
    }
  },

  _hideInstallButton() {
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = 'none';
  },

  async _installPWA() {
    if (this._deferredPrompt) {
      this._deferredPrompt.prompt();
      const { outcome } = await this._deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        this._hideInstallButton();
      }
      this._deferredPrompt = null;
    } else {
      // Pas de prompt natif — afficher les instructions manuelles
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const msg = isIOS
        ? 'Pour installer : appuyez sur le bouton <strong>Partager</strong> (↑) puis <strong>Sur l\'écran d\'accueil</strong>'
        : 'Pour installer : ouvrez le menu du navigateur (⋮) puis <strong>Installer l\'application</strong> ou <strong>Ajouter à l\'écran d\'accueil</strong>';
      DriverToast.show(msg, 'info');
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
      } else if (result.needsPin) {
        // PIN non defini — afficher le formulaire de creation
        this._showCreatePinForm(tel, result.userId);
      } else {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
      }

      // Reset button
      btn.disabled = false;
      btn.querySelector('.btn-text').style.display = 'inline';
      btn.querySelector('.btn-loading').style.display = 'none';
    });
  },

  _showCreatePinForm(telephone, userId) {
    const container = document.querySelector('.login-container');
    if (!container) return;

    container.innerHTML = `
      <div class="login-logo">
        <div class="login-logo-icon" style="background:linear-gradient(135deg,#f59e0b,#f97316)">
          <iconify-icon icon="solar:lock-password-bold" style="font-size:2.8rem;color:white"></iconify-icon>
        </div>
        <h1>Cr\u00e9er votre PIN</h1>
        <p class="login-subtitle">Bienvenue ! Choisissez un code PIN de 4 \u00e0 6 chiffres pour s\u00e9curiser votre compte.</p>
      </div>

      <form id="create-pin-form" class="login-form" autocomplete="off">
        <div class="form-group">
          <label>Nouveau code PIN</label>
          <div class="input-icon">
            <iconify-icon icon="solar:lock-password-bold-duotone" style="font-size:1.2rem"></iconify-icon>
            <input type="password" id="new-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="****" required autocomplete="new-password">
          </div>
        </div>
        <div class="form-group">
          <label>Confirmer le code PIN</label>
          <div class="input-icon">
            <iconify-icon icon="solar:lock-password-bold-duotone" style="font-size:1.2rem"></iconify-icon>
            <input type="password" id="confirm-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="****" required autocomplete="new-password">
          </div>
        </div>

        <button type="submit" class="btn-login" id="btn-create-pin" style="background:linear-gradient(135deg,#f59e0b,#f97316)">
          <span class="btn-text">Valider mon PIN</span>
          <span class="btn-loading" style="display:none"><i class="fas fa-spinner fa-spin"></i> Cr\u00e9ation...</span>
        </button>
      </form>

      <div id="login-error" class="login-error" style="display:none"></div>
      <p class="login-version">Pilote v1.2.0 &bull; Propuls\u00e9 par Yango</p>
    `;

    const form = document.getElementById('create-pin-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newPin = document.getElementById('new-pin').value.trim();
      const confirmPin = document.getElementById('confirm-pin').value.trim();
      const errorEl = document.getElementById('login-error');
      const btn = document.getElementById('btn-create-pin');

      if (!newPin || newPin.length < 4) {
        errorEl.textContent = 'Le PIN doit contenir 4 \u00e0 6 chiffres';
        errorEl.style.display = 'block';
        return;
      }

      if (!/^\d{4,6}$/.test(newPin)) {
        errorEl.textContent = 'Le PIN ne doit contenir que des chiffres';
        errorEl.style.display = 'block';
        return;
      }

      if (newPin !== confirmPin) {
        errorEl.textContent = 'Les deux codes PIN ne correspondent pas';
        errorEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.querySelector('.btn-text').style.display = 'none';
      btn.querySelector('.btn-loading').style.display = 'inline';
      errorEl.style.display = 'none';

      try {
        const apiBase = DriverAuth._apiBase;
        const res = await fetch(apiBase + '/set-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, pin: newPin })
        });
        const data = await res.json();

        if (data.success) {
          DriverToast.show('PIN cr\u00e9\u00e9 avec succ\u00e8s ! Connexion...', 'success');
          // Auto-login avec le nouveau PIN
          const loginResult = await DriverAuth.login(telephone, newPin);
          if (loginResult.success) {
            this.showApp();
          } else {
            errorEl.textContent = 'PIN cr\u00e9\u00e9 mais erreur de connexion. Reconnectez-vous.';
            errorEl.style.display = 'block';
            setTimeout(() => location.reload(), 2000);
          }
        } else {
          errorEl.textContent = data.error || 'Erreur lors de la cr\u00e9ation du PIN';
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = 'Erreur de connexion au serveur';
        errorEl.style.display = 'block';
      }

      btn.disabled = false;
      btn.querySelector('.btn-text').style.display = 'inline';
      btn.querySelector('.btn-loading').style.display = 'none';
    });
  }
};

// Launch app
document.addEventListener('DOMContentLoaded', () => DriverApp.init());
