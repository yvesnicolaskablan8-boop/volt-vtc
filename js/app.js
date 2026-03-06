/**
 * ThemeManager - Dark/Light theme toggle with persistence
 */
const ThemeManager = {
  _current: 'dark',

  init() {
    // Read saved theme or detect system preference
    const saved = localStorage.getItem('volt_theme');
    if (saved) {
      this._current = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      this._current = 'light';
    }
    this._applyTheme(this._current, false);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('volt_theme')) {
        this._applyTheme(e.matches ? 'dark' : 'light', false);
      }
    });
  },

  toggle() {
    const next = this._current === 'dark' ? 'light' : 'dark';
    this._applyTheme(next, true);
    localStorage.setItem('volt_theme', next);

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
        tag: options.tag || 'volt-notification',
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
      const lastReminder = localStorage.getItem('volt_last_reminder');
      if (lastReminder === today) return; // Already reminded today

      this.send(
        `${unpaidToday.length} recette${unpaidToday.length > 1 ? 's' : ''} en attente`,
        `${unpaidToday.map(c => c.prenom).join(', ')} — Versements du ${Utils.formatDate(today)} non reçus`,
        { tag: 'volt-unpaid-reminder' }
      );

      localStorage.setItem('volt_last_reminder', today);
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
            const tag = `volt-doc-${ch.id}-${field}`;
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
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered, scope:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
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
      if (typeof Toast !== 'undefined') Toast.success('Volt VTC installé !');
    });

    // Check authentication — token in localStorage persists across tabs/refresh
    const token = Auth.getToken();
    if (token) {
      try {
        const apiBase = Store._apiBase || '/api';
        const res = await fetch(apiBase + '/auth/me', {
          headers: { 'Authorization': 'Bearer ' + token }
        });

        if (res.ok) {
          const userData = await res.json();
          // Recreate session from /auth/me response (handles new tabs & refreshes)
          if (userData && userData.id && userData.statut === 'actif') {
            Auth.createSession(userData);
            await Store.initialize();
            this._showApp();
          } else {
            Auth.destroySession();
            this._showLogin();
          }
        } else if (res.status === 401 || res.status === 403) {
          // Token expired or invalid — force logout
          console.warn('Token invalide ou expiré — déconnexion');
          Auth.destroySession();
          this._showLogin();
        } else {
          // Server error (500, 503...) — keep session with cached data
          console.warn('Erreur serveur', res.status, '— session locale conservée');
          await Store.initialize();
          this._showApp();
        }
      } catch (err) {
        // API unreachable — keep session if it exists (cold start / network issue)
        if (Auth.getSession()) {
          console.warn('API injoignable — session locale conservée');
          await Store.initialize();
          this._showApp();
        } else {
          console.warn('API injoignable et pas de session — connexion requise');
          this._showLogin();
        }
      }
    } else {
      this._showLogin();
    }

    // Detect native WebView app and force mobile mode
    this._applyMobileMode();

    // Initialize browser notifications
    NotificationManager.init();

    console.log('Volt VTC Management v2.0.0 initialized (API mode)');
    console.log(`Data size: ${Store.getStorageSize().kb} Ko`);
    console.log(`Theme: ${ThemeManager._current}`);
    console.log(`Viewport: ${window.innerWidth}x${window.innerHeight}, Native: ${!!(window.VoltNative)}`);
  },

  _showApp() {
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
  },

  _showLogin() {
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

    // Show login section, hide set-password section
    const loginSection = document.getElementById('login-form-section');
    const setPasswordSection = document.getElementById('set-password-section');
    if (loginSection) loginSection.style.display = '';
    if (setPasswordSection) setPasswordSection.style.display = 'none';
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

    if (loginSection) loginSection.style.display = 'none';
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

  _applyMobileMode() {
    // Detect native app WebView or narrow viewport
    const isNative = !!(window.VoltNative) || navigator.userAgent.includes('VoltAdminApp');
    const vw = window.innerWidth || document.documentElement.clientWidth;

    if (isNative || vw <= 1024) {
      // Add classes on body
      if (isNative) document.body.classList.add('volt-native-app');
      document.body.classList.add('volt-mobile');

      // Inject a <style> tag that forces mobile layout — more reliable than CSS files
      if (!document.getElementById('volt-mobile-override')) {
        const style = document.createElement('style');
        style.id = 'volt-mobile-override';
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
    btn.title = 'Installer Volt VTC';
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
