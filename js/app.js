/**
 * ThemeManager - Dark/Light theme toggle with persistence
 */
const ThemeManager = {
  _current: 'dark',

  init() {
    // Read saved theme or detect system preference
    const saved = localStorage.getItem('pilote_theme');
    if (saved) {
      this._current = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      this._current = 'light';
    }
    this._applyTheme(this._current, false);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('pilote_theme')) {
        this._applyTheme(e.matches ? 'dark' : 'light', false);
      }
    });
  },

  toggle() {
    const next = this._current === 'dark' ? 'light' : 'dark';
    this._applyTheme(next, true);
    localStorage.setItem('pilote_theme', next);

    // Animate the toggle button
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.classList.add('rotating');
      setTimeout(() => btn.classList.remove('rotating'), 500);
    }
  },

  _applyTheme(theme, updateCharts) {
    this._current = theme;
    document.documentElement.setAttribute('data-theme', theme);

    // Update icon
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.setAttribute('icon', theme === 'dark' ? 'solar:moon-bold' : 'solar:sun-bold-duotone');
    }

    // Reconfigure Chart.js colors for the theme
    if (updateCharts) {
      Utils.configureChartDefaults();
      // Re-render current page to update charts
      if (typeof Router !== 'undefined' && Router._currentPage && Router._currentPage.destroy) {
        Router._currentPage.destroy();
        Router._currentPage.render();
        if (Router._refreshIcons) Router._refreshIcons();
      }
    }
  },

  isDark() {
    return this._current === 'dark';
  }
};

/**
 * NotificationManager - Browser push notifications for reminders
 */
const NotificationManager = {
  _permission: 'default',

  async init() {
    if (!('Notification' in window)) return;
    this._permission = Notification.permission;

    // Check for unpaid reminders every hour
    setInterval(() => this._checkReminders(), 3600000);
    // Initial check after 5 seconds
    setTimeout(() => this._checkReminders(), 5000);
  },

  async requestPermission() {
    if (!('Notification' in window)) {
      Toast.warning('Les notifications ne sont pas supportées par ce navigateur');
      return false;
    }
    const result = await Notification.requestPermission();
    this._permission = result;
    return result === 'granted';
  },

  send(title, body, options = {}) {
    if (this._permission !== 'granted') return;
    try {
      const notif = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: options.tag || 'pilote-notification',
        ...options
      });
      if (options.onclick) {
        notif.onclick = options.onclick;
      }
      // Auto close after 10 seconds
      setTimeout(() => notif.close(), 10000);
    } catch (e) { console.warn('Notification error:', e); }
  },

  _checkReminders() {
    if (this._permission !== 'granted') return;

    const settings = Store.get('settings') || {};
    if (settings.preferences && settings.preferences.notifications && !settings.preferences.notifications.versements) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const planning = Store.get('planning') || [];
    const versements = Store.get('versements') || [];
    const chauffeurs = Store.get('chauffeurs') || [];

    // Check if there are unpaid receipts for today
    const todayShifts = planning.filter(p => p.date === today);
    const unpaidToday = [];

    todayShifts.forEach(p => {
      const ch = chauffeurs.find(c => c.id === p.chauffeurId);
      if (!ch || ch.statut !== 'actif') return;
      const hasPayment = versements.some(v => v.chauffeurId === p.chauffeurId && v.date === today && v.statut === 'valide');
      if (!hasPayment && (ch.redevanceQuotidienne || 0) > 0) {
        unpaidToday.push(ch);
      }
    });

    if (unpaidToday.length > 0 && now.getHours() >= 18) {
      // Only remind in the evening
      const lastReminder = localStorage.getItem('pilote_last_reminder');
      if (lastReminder === today) return; // Already reminded today

      this.send(
        `${unpaidToday.length} recette${unpaidToday.length > 1 ? 's' : ''} en attente`,
        `${unpaidToday.map(c => c.prenom).join(', ')} — Versements du ${Utils.formatDate(today)} non reçus`,
        { tag: 'pilote-unpaid-reminder' }
      );

      localStorage.setItem('pilote_last_reminder', today);
    }

    // Check document expiry
    chauffeurs.forEach(ch => {
      const dates = [
        { field: 'dateExpirationPermis', label: 'Permis' },
        { field: 'dateExpirationVTC', label: 'Carte VTC' },
        { field: 'dateExpirationVisite', label: 'Visite médicale' }
      ];
      dates.forEach(({ field, label }) => {
        if (ch[field]) {
          const diff = Math.ceil((new Date(ch[field]) - now) / 86400000);
          if (diff >= 0 && diff <= 7) {
            const tag = `pilote-doc-${ch.id}-${field}`;
            const lastNotif = localStorage.getItem(tag);
            if (lastNotif === today) return;
            this.send(
              `${label} expire bientôt`,
              `Le ${label.toLowerCase()} de ${ch.prenom} ${ch.nom} expire dans ${diff} jour${diff > 1 ? 's' : ''}`,
              { tag }
            );
            localStorage.setItem(tag, today);
          }
        }
      });
    });
  }
};

/**
 * App - Bootstrap and initialization with authentication
 */
const App = {
  _initialized: false,

  async init() {
    // Initialize theme first (before Chart.js defaults)
    ThemeManager.init();

    // Configure Chart.js defaults
    Utils.configureChartDefaults();

    // Register Service Worker for PWA (offline support + installability)
    if ('serviceWorker' in navigator) {
      // Force update: unregister old SWs and clear caches if version mismatch
      const SW_VERSION = 386;
      const storedSW = parseInt(localStorage.getItem('pilote_sw_ver') || '0');
      if (storedSW < SW_VERSION) {
        localStorage.setItem('pilote_sw_ver', SW_VERSION);
        navigator.serviceWorker.getRegistrations().then(regs => {
          return Promise.all(regs.map(r => r.unregister()));
        }).then(() => caches.keys()).then(keys => {
          return Promise.all(keys.map(k => caches.delete(k)));
        }).then(() => {
          // Re-register fresh SW after purge
          navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
          window.location.reload(true);
        });
        return; // Stop init, page will reload
      }

      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(reg => {
          console.log('SW registered, scope:', reg.scope);
          // Force immediate update check
          reg.update();
          // Vérifier les mises à jour toutes les 60s
          setInterval(() => reg.update(), 60000);
          // Si un nouveau SW est en attente, l'activer
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (newSW) {
              newSW.addEventListener('statechange', () => {
                if (newSW.state === 'activated') {
                  console.log('New SW activated, reloading...');
                  window.location.reload();
                }
              });
            }
          });
          // Si un SW est déjà en attente (ex: update trouvée avant)
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        })
        .catch(err => console.warn('SW registration failed:', err));
      // Recharger si le controller change (nouveau SW prend le contrôle)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!this._swReloading) {
          this._swReloading = true;
          window.location.reload();
        }
      });
    }

    // PWA Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._deferredPrompt = e;
      this._showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
      this._deferredPrompt = null;
      this._hideInstallButton();
      if (typeof Toast !== 'undefined') Toast.success('Pilote installé !');
    });

    // Check authentication — token in localStorage persists across tabs/refresh
    const token = Auth.getToken();
    const existingSession = Auth.getSession();

    if (token && existingSession) {
      // FAST PATH: session already exists (refresh / returning user)
      // Show app immediately with cached data, verify token in background
      await Store.initialize();
      this._showApp();

      // Background verification — if token is invalid, logout silently
      this._verifyTokenBackground(token);
    } else if (token) {
      // Token exists but no session (new tab or cleared session)
      // Must verify token before showing app
      try {
        const apiBase = Store._apiBase || '/api';
        const res = await fetch(apiBase + '/auth/me', {
          headers: { 'Authorization': 'Bearer ' + token }
        });

        if (res.ok) {
          const userData = await res.json();
          if (userData && userData.id && userData.statut === 'actif') {
            Auth.createSession(userData);
            await Store.initialize();
            this._showApp();
          } else {
            Auth.destroySession();
            this._showLogin();
          }
        } else if (res.status === 401 || res.status === 403) {
          console.warn('Token invalide ou expiré — déconnexion');
          Auth.destroySession();
          this._showLogin();
        } else {
          console.warn('Erreur serveur', res.status, '— connexion requise');
          this._showLogin();
        }
      } catch (err) {
        console.warn('API injoignable — connexion requise');
        this._showLogin();
      }
    } else {
      this._showLogin();
    }

    // Detect native WebView app and force mobile mode
    this._applyMobileMode();

    // Initialize browser notifications
    NotificationManager.init();

    console.log('Pilote v2.0.0 initialized (API mode)');
    console.log(`Data size: ${Store.getStorageSize().kb} Ko`);
    console.log(`Theme: ${ThemeManager._current}`);
    console.log(`Viewport: ${window.innerWidth}x${window.innerHeight}, Native: ${!!(window.PiloteNative)}`);
  },

  _showApp() {
    // Dismiss splash screen
    if (typeof window._splashDismiss === 'function') {
      window._splashDismiss();
    }

    // Hide login overlay
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) {
      loginOverlay.classList.add('hidden');
    }

    // Show app container
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      appContainer.style.display = '';
    }

    // Initialize components only once
    if (!this._initialized) {
      Modal.init();
      Sidebar.init();
      Header.init();
      Router.init();
      BottomNav.init();
      this._initialized = true;

      // Écouter les mises à jour temps réel (SSE) pour re-render la page active
      document.addEventListener('pilote:remote-update', () => {
        if (this._sseDebounce) clearTimeout(this._sseDebounce);
        this._sseDebounce = setTimeout(() => {
          if (typeof Router !== 'undefined' && Router._currentPage) {
            if (typeof Router._currentPage.destroy === 'function') Router._currentPage.destroy();
            Router._currentPage.render();
            if (Router._refreshIcons) Router._refreshIcons();
          }
        }, 300); // Debounce 300ms pour éviter les renders multiples
      });
    } else {
      // Refresh sidebar permissions and header user info
      Sidebar.init();
      Header.init();
      BottomNav.init();
      // Re-navigate to current page
      Router._handleRoute();
    }

    // Ensure shell icons (sidebar, header, bottom-nav) render
    if (typeof Router !== 'undefined' && Router._refreshIcons) {
      Router._refreshIcons();
    }

    // Update sidebar with company name from settings
    try {
      const settings = Store.get('settings') || {};
      const ent = settings.entreprise || {};
      if (ent.nom) {
        const sidebarName = document.getElementById('sidebar-company-name');
        const sidebarSub = document.getElementById('sidebar-company-sub');
        if (sidebarName) sidebarName.textContent = ent.nom.toUpperCase();
        if (sidebarSub) sidebarSub.textContent = ent.activite || 'Gestion de flotte';
        // Cache for login page on next visit
        localStorage.setItem('pilote_company_name', ent.nom);
      }
    } catch (e) { /* silent */ }

    // Enregistrer le push pour les notifications taches (non-chauffeur)
    this._registerPushSubscription();
  },

  async _registerPushSubscription() {
    try {
      const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      if (!session || session.role === 'chauffeur') return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

      const reg = await navigator.serviceWorker.ready;

      // Verifier si deja abonne
      let sub = await reg.pushManager.getSubscription();
      if (sub) return; // Deja abonne

      // Ne re-souscrire que si la permission est deja accordee (activation via Parametres)
      if (Notification.permission !== 'granted') return;

      // Recuperer la cle VAPID
      const apiBase = Store._apiBase || '/api';
      const token = Auth.getToken();
      const vapidRes = await fetch(apiBase + '/notifications/push/vapid-key', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!vapidRes.ok) return;
      const { publicKey } = await vapidRes.json();
      if (!publicKey) return;

      // S'abonner au push
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this._urlBase64ToUint8Array(publicKey)
      });

      // Envoyer la subscription au serveur
      await fetch(apiBase + '/notifications/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });

      console.log('[Push] Subscription enregistree');
    } catch (e) {
      console.warn('[Push] Registration failed:', e.message);
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

  _showLogin() {
    // Dismiss splash screen
    if (typeof window._splashDismiss === 'function') {
      window._splashDismiss();
    }

    // Remove fast-hide class so login overlay becomes visible
    document.documentElement.classList.remove('pilote-has-token');

    // Show login overlay
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) {
      loginOverlay.classList.remove('hidden');
    }

    // Hide app container
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      appContainer.style.display = 'none';
    }

    // Setup login form events
    this._initLoginForm();
  },

  _initLoginForm() {
    const loginForm = document.getElementById('login-form');
    const setPasswordForm = document.getElementById('set-password-form');

    // Login form submit
    if (loginForm) {
      // Remove previous listeners by cloning
      const newForm = loginForm.cloneNode(true);
      loginForm.parentNode.replaceChild(newForm, loginForm);

      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this._handleLogin();
      });
    }

    // Set password form submit
    if (setPasswordForm) {
      const newForm = setPasswordForm.cloneNode(true);
      setPasswordForm.parentNode.replaceChild(newForm, setPasswordForm);

      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this._handleSetPassword();
      });
    }

    // Password toggle buttons
    this._initPasswordToggles();

    // Focus email field
    const emailInput = document.getElementById('login-email');
    if (emailInput) {
      emailInput.value = '';
      emailInput.focus();
    }

    // Clear password
    const pwdInput = document.getElementById('login-password');
    if (pwdInput) pwdInput.value = '';

    // Clear errors
    this._hideLoginError();
    this._hideSetPasswordError();
    this._hideRegisterError();

    // Show login section, hide set-password and register sections
    const loginSection = document.getElementById('login-form-section');
    const setPasswordSection = document.getElementById('set-password-section');
    const registerSection = document.getElementById('register-form-section');
    if (loginSection) loginSection.style.display = '';
    if (setPasswordSection) setPasswordSection.style.display = 'none';
    if (registerSection) registerSection.style.display = 'none';

    // Register form submit
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      const newRegForm = registerForm.cloneNode(true);
      registerForm.parentNode.replaceChild(newRegForm, registerForm);
      newRegForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this._handleRegister();
      });
    }

    // Toggle to register form
    const showRegisterBtn = document.getElementById('show-register-btn');
    if (showRegisterBtn) {
      const newBtn = showRegisterBtn.cloneNode(true);
      showRegisterBtn.parentNode.replaceChild(newBtn, showRegisterBtn);
      newBtn.addEventListener('click', () => {
        document.getElementById('login-form-section').style.display = 'none';
        document.getElementById('register-form-section').style.display = '';
        this._hideLoginError();
        const entrepriseInput = document.getElementById('register-entreprise');
        if (entrepriseInput) entrepriseInput.focus();
      });
    }

    // Toggle back to login form
    const showLoginBtn = document.getElementById('show-login-btn');
    if (showLoginBtn) {
      const newBtn = showLoginBtn.cloneNode(true);
      showLoginBtn.parentNode.replaceChild(newBtn, showLoginBtn);
      newBtn.addEventListener('click', () => {
        document.getElementById('register-form-section').style.display = 'none';
        document.getElementById('login-form-section').style.display = '';
        this._hideRegisterError();
        const emailInput = document.getElementById('login-email');
        if (emailInput) emailInput.focus();
      });
    }
  },

  _initPasswordToggles() {
    // Login password toggle
    const loginToggle = document.getElementById('login-toggle-pwd');
    if (loginToggle) {
      const newBtn = loginToggle.cloneNode(true);
      loginToggle.parentNode.replaceChild(newBtn, loginToggle);
      newBtn.addEventListener('click', () => {
        const input = document.getElementById('login-password');
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          const ico = newBtn.querySelector('iconify-icon');
          if (ico) ico.setAttribute('icon', input.type === 'password' ? 'solar:eye-bold' : 'solar:eye-closed-bold');
        }
      });
    }

    // New password toggle
    const newPwdToggle = document.getElementById('new-pwd-toggle');
    if (newPwdToggle) {
      const newBtn = newPwdToggle.cloneNode(true);
      newPwdToggle.parentNode.replaceChild(newBtn, newPwdToggle);
      newBtn.addEventListener('click', () => {
        const input = document.getElementById('new-password');
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          const ico = newBtn.querySelector('iconify-icon');
          if (ico) ico.setAttribute('icon', input.type === 'password' ? 'solar:eye-bold' : 'solar:eye-closed-bold');
        }
      });
    }

    // Confirm password toggle
    const confirmPwdToggle = document.getElementById('confirm-pwd-toggle');
    if (confirmPwdToggle) {
      const newBtn = confirmPwdToggle.cloneNode(true);
      confirmPwdToggle.parentNode.replaceChild(newBtn, confirmPwdToggle);
      newBtn.addEventListener('click', () => {
        const input = document.getElementById('confirm-password');
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          const ico = newBtn.querySelector('iconify-icon');
          if (ico) ico.setAttribute('icon', input.type === 'password' ? 'solar:eye-bold' : 'solar:eye-closed-bold');
        }
      });
    }

    // Register password toggle
    const registerPwdToggle = document.getElementById('register-pwd-toggle');
    if (registerPwdToggle) {
      const newBtn = registerPwdToggle.cloneNode(true);
      registerPwdToggle.parentNode.replaceChild(newBtn, registerPwdToggle);
      newBtn.addEventListener('click', () => {
        const input = document.getElementById('register-password');
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          const ico = newBtn.querySelector('iconify-icon');
          if (ico) ico.setAttribute('icon', input.type === 'password' ? 'solar:eye-bold' : 'solar:eye-closed-bold');
        }
      });
    }
  },

  async _handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const loginBtn = document.getElementById('login-btn');

    if (!email || !password) {
      this._showLoginError('Veuillez remplir tous les champs.');
      return;
    }

    // Disable button
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Connexion...';
    }

    try {
      const result = await Auth.login(email, password);

      if (result.success) {
        // Load data from API after successful login
        await Store.initialize();
        this._showApp();
        Toast.show('Bienvenue, ' + result.user.prenom + ' !', 'success');
      } else if (result.error === 'first_login') {
        // User has no password yet — show set password form
        this._showSetPasswordForm(result.user, 'Définir votre mot de passe', 'Bienvenue ! Créez votre mot de passe pour accéder à l\'application.');
      } else if (result.error === 'must_change_password') {
        // User must change temporary password
        Auth.createSession(result.user);
        this._showSetPasswordForm(result.user, 'Changer votre mot de passe', 'Votre administrateur vous a attribué un mot de passe temporaire. Veuillez le changer.');
      } else {
        // Show error
        const messages = {
          'user_not_found': 'Aucun compte trouvé avec cet email.',
          'account_disabled': 'Ce compte est désactivé. Contactez l\'administrateur.',
          'invalid_password': 'Mot de passe incorrect.',
          'network_error': 'Impossible de contacter le serveur. Vérifiez votre connexion.',
        };
        this._showLoginError(messages[result.error] || 'Erreur de connexion.');
      }
    } catch (err) {
      console.error('Login error:', err);
      this._showLoginError('Erreur technique. Réessayez.');
    } finally {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<iconify-icon icon="solar:login-2-bold-duotone"></iconify-icon> Se connecter';
      }
    }
  },

  _showSetPasswordForm(user, title, subtitle) {
    const loginSection = document.getElementById('login-form-section');
    const setPasswordSection = document.getElementById('set-password-section');
    const titleEl = document.getElementById('set-password-title');
    const subtitleEl = document.getElementById('set-password-subtitle');
    const userIdInput = document.getElementById('set-password-user-id');

    const registerSection = document.getElementById('register-form-section');
    if (loginSection) loginSection.style.display = 'none';
    if (registerSection) registerSection.style.display = 'none';
    if (setPasswordSection) setPasswordSection.style.display = '';
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    if (userIdInput) userIdInput.value = user.id;

    // Clear fields
    const newPwd = document.getElementById('new-password');
    const confirmPwd = document.getElementById('confirm-password');
    if (newPwd) newPwd.value = '';
    if (confirmPwd) confirmPwd.value = '';

    this._hideSetPasswordError();

    // Re-attach submit handler on set-password-form (clone to remove old listeners)
    const setPasswordForm = document.getElementById('set-password-form');
    if (setPasswordForm) {
      const newForm = setPasswordForm.cloneNode(true);
      setPasswordForm.parentNode.replaceChild(newForm, setPasswordForm);
      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this._handleSetPassword();
      });
    }

    // Re-init toggles since we cloned forms
    this._initPasswordToggles();

    // Focus
    if (newPwd) newPwd.focus();
  },

  async _handleSetPassword() {
    const userId = document.getElementById('set-password-user-id').value;
    const newPwd = document.getElementById('new-password').value;
    const confirmPwd = document.getElementById('confirm-password').value;
    const btn = document.getElementById('set-password-btn');

    if (!newPwd || !confirmPwd) {
      this._showSetPasswordError('Veuillez remplir tous les champs.');
      return;
    }

    if (newPwd.length < 6) {
      this._showSetPasswordError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    if (newPwd !== confirmPwd) {
      this._showSetPasswordError('Les mots de passe ne correspondent pas.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Enregistrement...';
    }

    try {
      const result = await Auth.setPassword(userId, newPwd);

      // Load data from API after password set (auto-login)
      await Store.initialize();

      // Create session for the user
      const user = Store.findById('users', userId);
      if (user) {
        Auth.createSession(user);
        this._showApp();
        Toast.show('Mot de passe défini avec succès !', 'success');
      }
    } catch (err) {
      console.error('Set password error:', err);
      this._showSetPasswordError('Erreur technique. Réessayez.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<iconify-icon icon="solar:lock-bold-duotone"></iconify-icon> Définir le mot de passe';
      }
    }
  },

  _showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (el) {
      el.innerHTML = `<iconify-icon icon="solar:close-circle-bold-duotone"></iconify-icon> ${msg}`;
      el.style.display = 'flex';
    }
  },

  _hideLoginError() {
    const el = document.getElementById('login-error');
    if (el) el.style.display = 'none';
  },

  _showSetPasswordError(msg) {
    const el = document.getElementById('set-password-error');
    if (el) {
      el.innerHTML = `<iconify-icon icon="solar:close-circle-bold-duotone"></iconify-icon> ${msg}`;
      el.style.display = 'flex';
    }
  },

  _hideSetPasswordError() {
    const el = document.getElementById('set-password-error');
    if (el) el.style.display = 'none';
  },

  _showRegisterError(msg) {
    const el = document.getElementById('register-error');
    if (el) {
      el.innerHTML = `<iconify-icon icon="solar:close-circle-bold-duotone"></iconify-icon> ${msg}`;
      el.style.display = 'flex';
    }
  },

  _hideRegisterError() {
    const el = document.getElementById('register-error');
    if (el) el.style.display = 'none';
  },

  async _handleRegister() {
    const entrepriseNom = document.getElementById('register-entreprise').value.trim();
    const prenom = document.getElementById('register-prenom').value.trim();
    const nom = document.getElementById('register-nom').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const telephone = document.getElementById('register-telephone').value.trim();
    const registerBtn = document.getElementById('register-btn');

    if (!entrepriseNom || !prenom || !nom || !email || !password) {
      this._showRegisterError('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    if (password.length < 6) {
      this._showRegisterError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    // Disable button
    if (registerBtn) {
      registerBtn.disabled = true;
      registerBtn.innerHTML = '<iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Création...';
    }

    try {
      const result = await Auth.register({ entrepriseNom, prenom, nom, email, password, telephone });

      if (result.success) {
        await Store.initialize();
        this._showApp();
        Toast.show('Bienvenue, ' + result.user.prenom + ' ! Votre compte a été créé.', 'success');
      } else {
        const messages = {
          'email_exists': 'Un compte existe déjà avec cet email.',
          'invalid_email': 'L\'adresse email n\'est pas valide.',
          'weak_password': 'Le mot de passe est trop faible.',
          'network_error': 'Impossible de contacter le serveur. Vérifiez votre connexion.',
        };
        this._showRegisterError(messages[result.error] || 'Erreur lors de la création du compte.');
      }
    } catch (err) {
      console.error('Register error:', err);
      this._showRegisterError('Erreur technique. Réessayez.');
    } finally {
      if (registerBtn) {
        registerBtn.disabled = false;
        registerBtn.innerHTML = '<iconify-icon icon="solar:user-plus-bold-duotone"></iconify-icon> Créer mon compte';
      }
    }
  },

  _applyMobileMode() {
    // Detect native app WebView or narrow viewport
    const isNative = !!(window.PiloteNative) || navigator.userAgent.includes('PiloteAdminApp');
    const vw = window.innerWidth || document.documentElement.clientWidth;

    if (isNative || vw <= 1024) {
      // Add classes on body
      if (isNative) document.body.classList.add('pilote-native-app');
      document.body.classList.add('pilote-mobile');

      // Inject a <style> tag that forces mobile layout — more reliable than CSS files
      if (!document.getElementById('pilote-mobile-override')) {
        const style = document.createElement('style');
        style.id = 'pilote-mobile-override';
        style.textContent = `
          /* Hide sidebar completely on mobile — bottom nav replaces it */
          .sidebar {
            transform: translateX(-100%) !important;
            pointer-events: none !important;
            visibility: hidden !important;
            position: fixed !important;
            width: 280px !important;
            z-index: 200 !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
          }
          /* Sidebar never opens on mobile */
          .sidebar.open {
            transform: translateX(-100%) !important;
            pointer-events: none !important;
            visibility: hidden !important;
          }
          .main-content {
            margin-left: 0 !important;
            width: 100% !important;
          }
          /* Hide hamburger toggle — bottom nav replaces it */
          .header-toggle {
            display: none !important;
          }
          .header-user-name,
          .header-user-chevron {
            display: none !important;
          }
          .header {
            overflow: visible !important;
          }
          /* Hide sidebar overlay entirely */
          .sidebar-overlay,
          .sidebar-overlay.active {
            display: none !important;
          }
        `;
        document.head.appendChild(style);
      }

      console.log(`Mobile mode applied: native=${isNative}, vw=${vw}`);
    }
  },

  async _verifyTokenBackground(token) {
    try {
      const apiBase = Store._apiBase || '/api';
      const res = await fetch(apiBase + '/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (res.ok) {
        const userData = await res.json();
        if (userData && userData.id && userData.statut === 'actif') {
          Auth.createSession(userData);
          Auth.refreshSession();
        } else {
          // Account disabled or deleted
          this.logout();
        }
      } else if (res.status === 401 || res.status === 403) {
        // Token expired or invalid
        console.warn('Token invalide (background) — déconnexion');
        this.logout();
      }
      // For other errors (500, 503, network), do nothing — keep session
    } catch (e) {
      // Network error — do nothing, keep session
      console.warn('Vérification token (background) échouée:', e.message);
    }
  },

  logout() {
    Auth.destroySession();
    // Destroy current page if exists
    if (typeof Router !== 'undefined' && Router._currentPage && Router._currentPage.destroy) {
      Router._currentPage.destroy();
      Router._currentPage = null;
    }
    this._showLogin();
    Toast.show('Déconnexion réussie.', 'info');
  },

  // PWA Install
  _deferredPrompt: null,

  _showInstallButton() {
    const headerRight = document.querySelector('.header-right');
    if (!headerRight || document.getElementById('btn-install-pwa')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-install-pwa';
    btn.className = 'btn btn-primary';
    btn.title = 'Installer Pilote';
    btn.style.cssText = 'font-size:12px;padding:6px 12px;gap:4px;animation:pulse-dot 2s infinite;';
    btn.innerHTML = '<iconify-icon icon="solar:download-minimalistic-bold-duotone"></iconify-icon> Installer';
    btn.addEventListener('click', () => this._installPWA());
    headerRight.insertBefore(btn, headerRight.firstChild);
  },

  _hideInstallButton() {
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.remove();
  },

  async _installPWA() {
    if (!this._deferredPrompt) return;
    this._deferredPrompt.prompt();
    const { outcome } = await this._deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      this._hideInstallButton();
    }
    this._deferredPrompt = null;
  }
};

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
