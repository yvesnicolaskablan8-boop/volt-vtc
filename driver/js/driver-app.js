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

    // Register pages
    DriverRouter.register('accueil', AccueilPage);
    DriverRouter.register('planning', PlanningPage);
    DriverRouter.register('versements', VersementsPage);
    DriverRouter.register('signalements', SignalementsPage);
    DriverRouter.register('profil', ProfilPage);

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
