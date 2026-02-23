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
      icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }

    // Reconfigure Chart.js colors for the theme
    if (updateCharts) {
      Utils.configureChartDefaults();
      // Re-render current page to update charts
      if (typeof Router !== 'undefined' && Router._currentPage && Router._currentPage.destroy) {
        Router._currentPage.destroy();
        Router._currentPage.render();
      }
    }
  },

  isDark() {
    return this._current === 'dark';
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

    // Check authentication
    if (Auth.isLoggedIn()) {
      // Load data from API into cache
      await Store.initialize();

      // Verify user still exists and is active
      const user = Auth.getCurrentUser();
      if (user && user.statut === 'actif') {
        this._showApp();
      } else {
        Auth.destroySession();
        this._showLogin();
      }
    } else {
      this._showLogin();
    }

    // Detect native WebView app and force mobile mode
    this._applyMobileMode();

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
      this._initialized = true;
    } else {
      // Refresh sidebar permissions and header user info
      Sidebar.init();
      Header.init();
      // Re-navigate to current page
      Router._handleRoute();
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
          newBtn.querySelector('i').className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
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
          newBtn.querySelector('i').className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
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
          newBtn.querySelector('i').className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
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
      loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';
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
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Se connecter';
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
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
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
        btn.innerHTML = '<i class="fas fa-lock"></i> Définir le mot de passe';
      }
    }
  },

  _showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (el) {
      el.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
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
      el.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
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
          .sidebar.open {
            transform: translateX(0) !important;
            pointer-events: auto !important;
            visibility: visible !important;
          }
          .main-content {
            margin-left: 0 !important;
            width: 100% !important;
          }
          .header-toggle {
            display: flex !important;
          }
          .header-search {
            display: none !important;
          }
          .header-user-name,
          .header-user-chevron {
            display: none !important;
          }
          .header {
            overflow: visible !important;
          }
          .sidebar-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 199;
          }
          .sidebar-overlay.active {
            display: block !important;
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
  }
};

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
