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

    this._setupTirerPourActualiser();

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
    if (typeof PlusPage !== 'undefined') DriverRouter.register('plus', PlusPage);
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

    // Le suivi de position se fait desormais par boitier GPS sur le vehicule.
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

  // =================== SUIVI DE POSITION — RETIRE ===================
  //
  // Le suivi par telephone a ete supprime le 2026-08-10. Il ne fonctionnait
  // pas : le navigateur suspend la geolocalisation des que l'application
  // passe en arriere-plan, et le plugin natif qui devait y remedier faisait
  // se fermer l'application des la connexion.
  //
  // Les vehicules sont desormais suivis par un boitier GPS pose sur la
  // voiture (WhatsGPS). C'est une meilleure source : elle ne depend ni du
  // telephone du chauffeur, ni de sa batterie, ni d'une autorisation, et
  // elle repond a la vraie question — ou est la VOITURE.
  //
  // Voir api/gps.js et l'ecran « Suivi vehicules » cote administration.
  // =================== PWA INSTALL ===================

  // Bouton « Installer » retire de l'en-tete a la demande de l'utilisateur.
  // L'invite du navigateur reste captee ailleurs (preventDefault) pour
  // qu'aucune banniere ne s'affiche a sa place. _installPWA() est conservee :
  // le retablissement tiendrait a remettre le bouton dans index.html.
  _setupInstallButton() {
    this._hideInstallButton();
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

  /** Recharge la page courante, comme le bouton d'actualisation. */
  _rechargerPageCourante() {
    const route = DriverRouter.getCurrentRoute();
    if (!route) return;
    const page = DriverRouter._routes[route];
    const content = document.getElementById('app-content');
    if (page && content) page.render(content);
  },

  /**
   * Tirer vers le bas pour actualiser.
   * Ne se declenche QUE si la page est deja tout en haut, sinon le geste
   * entrerait en conflit avec le defilement normal.
   */
  _setupTirerPourActualiser() {
    const zone = document.getElementById('app-content');
    if (!zone || zone._ptrPose) return;
    zone._ptrPose = true;

    const SEUIL = 70;      // distance a parcourir avant declenchement
    const MAX = 110;       // au-dela, l'indicateur ne descend plus
    let depart = null, tire = 0, enCours = false;

    const ind = document.createElement('div');
    ind.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:center;height:0;overflow:hidden;color:var(--text-muted);font-size:.85rem;font-weight:700;pointer-events:none;transition:height .18s;z-index:5';
    ind.innerHTML = '<span data-ptr-texte>Tirez pour actualiser</span>';
    if (getComputedStyle(zone).position === 'static') zone.style.position = 'relative';
    zone.insertBefore(ind, zone.firstChild);
    const texte = () => ind.querySelector('[data-ptr-texte]');

    zone.addEventListener('touchstart', (e) => {
      if (enCours || zone.scrollTop > 0 || e.touches.length !== 1) { depart = null; return; }
      depart = e.touches[0].clientY;
      tire = 0;
      ind.style.transition = 'none';
    }, { passive: true });

    zone.addEventListener('touchmove', (e) => {
      if (depart === null || enCours) return;
      const delta = e.touches[0].clientY - depart;
      if (delta <= 0) { tire = 0; ind.style.height = '0px'; return; }
      // resistance : le geste ralentit a mesure qu'on tire
      tire = Math.min(MAX, delta * 0.5);
      ind.style.height = tire + 'px';
      texte().textContent = tire >= SEUIL ? 'Relachez pour actualiser' : 'Tirez pour actualiser';
    }, { passive: true });

    const relacher = async () => {
      if (depart === null || enCours) { depart = null; return; }
      depart = null;
      ind.style.transition = 'height .18s';
      if (tire < SEUIL) { ind.style.height = '0px'; return; }
      enCours = true;
      ind.style.height = '46px';
      texte().textContent = 'Actualisation...';
      try { this._rechargerPageCourante(); } catch (err) { console.warn('[PTR]', err); }
      setTimeout(() => {
        ind.style.height = '0px';
        texte().textContent = 'Tirez pour actualiser';
        enCours = false;
      }, 700);
    };
    zone.addEventListener('touchend', relacher, { passive: true });
    zone.addEventListener('touchcancel', () => { depart = null; ind.style.height = '0px'; }, { passive: true });
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
      <p class="login-version">Pilote v1.2.0</p>
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
