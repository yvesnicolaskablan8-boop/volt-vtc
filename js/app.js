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
      const SW_VERSION = 395;
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

    // Debug: check Supabase client is loaded
    if (typeof supabase === 'undefined') {
      console.error('FATAL: supabase client not defined — CDN or config failed');
    } else {
      console.log('Supabase client OK:', typeof supabase.auth);
    }

    // Check for password recovery flow
    // The flag is set in app.html BEFORE Supabase processes the hash
    if (sessionStorage.getItem('pilote_recovery')) {
      sessionStorage.removeItem('pilote_recovery');
      console.log('Recovery flow detected via sessionStorage flag');
      // By now Supabase has already processed the hash and created a session
      const { data } = await supabase.auth.getSession();
      if (data && data.session) {
        // Clear hash from URL
        history.replaceState(null, '', window.location.pathname);
        this._showLogin();
        this._showResetPasswordForm(data.session.user.email);
        return;
      } else {
        // Token expired or invalid
        this._showLogin();
        this._showLoginError('Le lien de réinitialisation a expiré. Cliquez sur "Mot de passe oublié" pour en recevoir un nouveau.');
        return;
      }
    }

    // Check authentication via Supabase
    try {
      const authResult = await Auth.checkAuth();
      if (authResult && authResult.authenticated && authResult.user) {
        Auth.createSession(authResult.user);
        await Store.initialize();
        this._showApp();
      } else if (Auth.getSession()) {
        // Supabase session expired but local session exists — try offline
        console.warn('Session Supabase expirée — mode local');
        await Store.initialize();
        this._showApp();
      } else {
        this._showLogin();
      }
    } catch (err) {
      if (Auth.getSession()) {
        console.warn('Supabase injoignable — session locale conservée');
        await Store.initialize();
        this._showApp();
      } else {
        this._showLogin();
      }
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
      try {
        const apiBase = Store._apiBase || '/api';
        const token = Auth.getToken();
        const vapidRes = await fetch(apiBase + '/notifications/push/vapid-key', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!vapidRes.ok) throw new Error('VAPID key unavailable');
        const { publicKey } = await vapidRes.json();
        if (!publicKey) throw new Error('VAPID key missing');

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
      } catch (pushErr) {
        console.warn('[Push] Push notifications not available:', pushErr.message);
      }
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

    // Show login or register section based on URL hash
    const loginSection = document.getElementById('login-form-section');
    const setPasswordSection = document.getElementById('set-password-section');
    const registerSection = document.getElementById('register-form-section');
    const forgotSection = document.getElementById('forgot-form-section');
    const showRegister = window.location.hash === '#register';
    if (loginSection) loginSection.style.display = showRegister ? 'none' : '';
    if (setPasswordSection) setPasswordSection.style.display = 'none';
    if (registerSection) registerSection.style.display = showRegister ? '' : 'none';
    if (forgotSection) forgotSection.style.display = 'none';

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

    // Forgot password — open dedicated section
    const forgotBtn = document.getElementById('forgot-password-btn');
    if (forgotBtn) {
      const newBtn = forgotBtn.cloneNode(true);
      forgotBtn.parentNode.replaceChild(newBtn, forgotBtn);
      newBtn.addEventListener('click', () => {
        document.getElementById('login-form-section').style.display = 'none';
        document.getElementById('forgot-form-section').style.display = '';
        this._hideLoginError();
        const forgotEmail = document.getElementById('forgot-email');
        const loginEmail = document.getElementById('login-email');
        if (forgotEmail && loginEmail && loginEmail.value) forgotEmail.value = loginEmail.value;
        if (forgotEmail) forgotEmail.focus();
      });
    }

    // Forgot form — back to login
    const forgotBackBtn = document.getElementById('forgot-back-btn');
    if (forgotBackBtn) {
      const newBtn = forgotBackBtn.cloneNode(true);
      forgotBackBtn.parentNode.replaceChild(newBtn, forgotBackBtn);
      newBtn.addEventListener('click', () => {
        document.getElementById('forgot-form-section').style.display = 'none';
        document.getElementById('login-form-section').style.display = '';
      });
    }

    // Forgot form submit
    const forgotForm = document.getElementById('forgot-form');
    if (forgotForm) {
      const newForm = forgotForm.cloneNode(true);
      forgotForm.parentNode.replaceChild(newForm, forgotForm);
      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this._handleForgotPassword();
      });
    }
  },

  async _handleForgotPassword() {
    const emailInput = document.getElementById('forgot-email');
    const email = emailInput ? emailInput.value.trim() : '';
    const btn = document.getElementById('forgot-submit-btn');
    const errEl = document.getElementById('forgot-error');

    if (!email) {
      if (errEl) { errEl.textContent = 'Veuillez entrer votre adresse email.'; errEl.style.display = 'flex'; }
      if (emailInput) emailInput.focus();
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours...'; }
    if (errEl) errEl.style.display = 'none';

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/app'
      });
      if (error) {
        const msg = error.message.includes('security purposes')
          ? 'Un email a déjà été envoyé. Vérifiez votre boîte mail (et les spams). Réessayez dans 60 secondes.'
          : 'Erreur : ' + error.message;
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'flex'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Envoyer le lien'; }
      } else {
        // Show success in the forgot section
        const forgotSection = document.getElementById('forgot-form-section');
        if (forgotSection) {
          forgotSection.textContent = '';

          const icon = document.createElement('iconify-icon');
          icon.setAttribute('icon', 'solar:letter-bold-duotone');
          icon.style.cssText = 'font-size:3rem;color:#3b82f6;display:block;text-align:center;margin-bottom:1rem;';
          forgotSection.appendChild(icon);

          const title = document.createElement('h2');
          title.className = 'login-title';
          title.textContent = 'Email envoyé !';
          forgotSection.appendChild(title);

          const desc = document.createElement('p');
          desc.className = 'login-subtitle';
          desc.style.lineHeight = '1.6';
          desc.textContent = 'Un lien de réinitialisation a été envoyé à ' + email + '. Vérifiez votre boîte de réception (et les spams) puis cliquez sur le lien.';
          forgotSection.appendChild(desc);

          const backBtn = document.createElement('button');
          backBtn.type = 'button';
          backBtn.className = 'btn btn-primary btn-block login-submit';
          backBtn.textContent = 'Retour à la connexion';
          backBtn.style.marginTop = '1.5rem';
          backBtn.addEventListener('click', function() { location.reload(); });
          forgotSection.appendChild(backBtn);
        }
      }
    } catch (e) {
      if (errEl) { errEl.textContent = 'Erreur réseau. Réessayez.'; errEl.style.display = 'flex'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Envoyer le lien'; }
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
          'invalid_credentials': 'Email ou mot de passe incorrect.',
          'Invalid login credentials': 'Email ou mot de passe incorrect.',
          'no_fleet_user': 'Aucun accès configuré pour ce compte. Contactez votre administrateur.',
          'network_error': 'Impossible de contacter le serveur. Vérifiez votre connexion.',
        };
        const msg = messages[result.error] || (result.error && result.error.includes('Invalid login') ? 'Email ou mot de passe incorrect.' : result.error) || 'Erreur de connexion.';
        this._showLoginError(result.detail ? msg + ' (' + result.detail + ')' : msg);
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

  _showResetPasswordForm(email) {
    // Dismiss splash
    if (typeof window._splashDismiss === 'function') window._splashDismiss();

    const loginSection = document.getElementById('login-form-section');
    const registerSection = document.getElementById('register-form-section');
    const setPasswordSection = document.getElementById('set-password-section');
    if (registerSection) registerSection.style.display = 'none';
    if (setPasswordSection) setPasswordSection.style.display = 'none';

    if (loginSection) {
      // Clear existing content and build reset form with DOM methods
      loginSection.textContent = '';

      const icon = document.createElement('iconify-icon');
      icon.setAttribute('icon', 'solar:lock-bold-duotone');
      icon.style.cssText = 'font-size:3rem;color:#3b82f6;display:block;text-align:center;margin-bottom:1rem;';
      loginSection.appendChild(icon);

      const title = document.createElement('h2');
      title.className = 'login-title';
      title.textContent = 'Nouveau mot de passe';
      loginSection.appendChild(title);

      const subtitle = document.createElement('p');
      subtitle.className = 'login-subtitle';
      subtitle.textContent = email ? 'Choisissez un nouveau mot de passe pour ' + email : 'Choisissez un nouveau mot de passe';
      loginSection.appendChild(subtitle);

      const errorDiv = document.createElement('div');
      errorDiv.className = 'login-error';
      errorDiv.id = 'reset-pwd-error';
      errorDiv.style.display = 'none';
      loginSection.appendChild(errorDiv);

      const form = document.createElement('form');
      form.id = 'reset-pwd-form';
      form.autocomplete = 'off';

      // New password field
      const group1 = document.createElement('div');
      group1.className = 'form-group';
      const label1 = document.createElement('label');
      label1.className = 'form-label';
      label1.textContent = 'Nouveau mot de passe';
      group1.appendChild(label1);
      const input1 = document.createElement('input');
      input1.type = 'password';
      input1.className = 'form-control login-input';
      input1.id = 'reset-new-password';
      input1.placeholder = 'Minimum 6 caractères';
      input1.required = true;
      input1.minLength = 6;
      input1.autocomplete = 'new-password';
      group1.appendChild(input1);
      form.appendChild(group1);

      // Confirm password field
      const group2 = document.createElement('div');
      group2.className = 'form-group';
      const label2 = document.createElement('label');
      label2.className = 'form-label';
      label2.textContent = 'Confirmer le mot de passe';
      group2.appendChild(label2);
      const input2 = document.createElement('input');
      input2.type = 'password';
      input2.className = 'form-control login-input';
      input2.id = 'reset-confirm-password';
      input2.placeholder = 'Confirmez votre mot de passe';
      input2.required = true;
      input2.autocomplete = 'new-password';
      group2.appendChild(input2);
      form.appendChild(group2);

      // Submit button
      const submitBtn = document.createElement('button');
      submitBtn.type = 'submit';
      submitBtn.className = 'btn btn-primary btn-block login-submit';
      submitBtn.id = 'reset-pwd-btn';
      submitBtn.textContent = 'Définir le mot de passe';
      form.appendChild(submitBtn);

      loginSection.appendChild(form);

      // Handle form submit
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPwd = document.getElementById('reset-new-password').value;
        const confirmPwd = document.getElementById('reset-confirm-password').value;
        const btn = document.getElementById('reset-pwd-btn');
        const errEl = document.getElementById('reset-pwd-error');

        if (newPwd.length < 6) {
          if (errEl) { errEl.textContent = 'Le mot de passe doit contenir au moins 6 caractères.'; errEl.style.display = 'flex'; }
          return;
        }
        if (newPwd !== confirmPwd) {
          if (errEl) { errEl.textContent = 'Les mots de passe ne correspondent pas.'; errEl.style.display = 'flex'; }
          return;
        }

        if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement...'; }
        if (errEl) errEl.style.display = 'none';

        try {
          const { error } = await supabase.auth.updateUser({ password: newPwd });
          if (error) {
            if (errEl) { errEl.textContent = 'Erreur : ' + error.message; errEl.style.display = 'flex'; }
            if (btn) { btn.disabled = false; btn.textContent = 'Définir le mot de passe'; }
          } else {
            Toast.show('Mot de passe mis à jour ! Connectez-vous.', 'success');
            await supabase.auth.signOut();
            location.reload();
          }
        } catch (err) {
          if (errEl) { errEl.textContent = 'Erreur réseau. Réessayez.'; errEl.style.display = 'flex'; }
          if (btn) { btn.disabled = false; btn.textContent = 'Définir le mot de passe'; }
        }
      });

      input1.focus();
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
        const msg = messages[result.error] || result.error || 'Erreur lors de la création du compte.';
        this._showRegisterError(result.detail ? msg + ' (' + result.detail + ')' : msg);
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

  // Token verification now handled by Supabase Auth session management

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
