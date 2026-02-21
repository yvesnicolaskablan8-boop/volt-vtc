/**
 * Router - Hash-based SPA routing
 */
const Router = {
  _routes: {},
  _currentPage: null,
  _currentRoute: '',

  init() {
    // Register routes
    this._routes = {
      '/dashboard': { page: DashboardPage, title: 'Tableau de bord' },
      '/chauffeurs': { page: ChauffeursPage, title: 'Chauffeurs' },
      '/chauffeurs/:id': { page: ChauffeursPage, title: 'Détail chauffeur', action: 'detail' },
      '/vehicules': { page: VehiculesPage, title: 'Véhicules' },
      '/vehicules/:id': { page: VehiculesPage, title: 'Détail véhicule', action: 'detail' },
      '/versements': { page: VersementsPage, title: 'Versements' },
      '/rentabilite': { page: RentabilitePage, title: 'Rentabilité' },
      '/gps-conduite': { page: GpsConduitePage, title: 'GPS & Conduite' },
      '/rapports': { page: RapportsPage, title: 'Rapports' },
      '/comptabilite': { page: ComptabilitePage, title: 'Comptabilité' },
      '/planning': { page: PlanningPage, title: 'Planning' },
      '/alertes': { page: AlertesPage, title: 'Alertes' },
      '/parametres': { page: ParametresPage, title: 'Paramètres' }
    };

    // Listen for hash changes
    window.addEventListener('hashchange', () => this._handleRoute());

    // Initial route
    if (!window.location.hash) {
      window.location.hash = '#/dashboard';
    } else {
      this._handleRoute();
    }
  },

  _handleRoute() {
    const hash = window.location.hash.slice(1) || '/dashboard'; // Remove #

    // Destroy current page
    if (this._currentPage && typeof this._currentPage.destroy === 'function') {
      this._currentPage.destroy();
    }

    // Match route
    const match = this._matchRoute(hash);

    if (!match) {
      this._navigate('/dashboard');
      return;
    }

    const { route, params } = match;
    const config = this._routes[route];

    // Auth guard: check if user is logged in
    if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
      return;
    }

    // Auth guard: check route permission
    if (typeof Auth !== 'undefined' && !Auth.canAccessRoute(hash)) {
      this._currentRoute = hash;
      Sidebar.setActive(hash);
      Header.setBreadcrumb('Accès restreint');
      const container = document.getElementById('page-content');
      container.innerHTML = `
        <div class="access-restricted">
          <i class="fas fa-lock"></i>
          <h2>Accès restreint</h2>
          <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page. Contactez votre administrateur.</p>
          <button class="btn btn-primary" style="margin-top: var(--space-lg);" onclick="Router.navigate('/dashboard')">
            <i class="fas fa-home"></i> Retour au tableau de bord
          </button>
        </div>
      `;
      return;
    }

    // Update current
    this._currentPage = config.page;
    this._currentRoute = hash;

    // Update sidebar active state
    Sidebar.setActive(hash);

    // Update breadcrumb
    Header.setBreadcrumb(config.title);

    // Render page
    const container = document.getElementById('page-content');
    container.innerHTML = '';

    if (config.action === 'detail' && typeof config.page.renderDetail === 'function') {
      config.page.renderDetail(params.id);
    } else {
      config.page.render();
    }
  },

  _matchRoute(hash) {
    // Try exact match first
    if (this._routes[hash]) {
      return { route: hash, params: {} };
    }

    // Try parameterized routes
    const parts = hash.split('/').filter(Boolean);

    for (const route of Object.keys(this._routes)) {
      const routeParts = route.split('/').filter(Boolean);

      if (routeParts.length !== parts.length) continue;

      const params = {};
      let matched = true;

      for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(':')) {
          params[routeParts[i].slice(1)] = parts[i];
        } else if (routeParts[i] !== parts[i]) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return { route, params };
      }
    }

    return null;
  },

  navigate(path) {
    window.location.hash = `#${path}`;
  },

  _navigate(path) {
    window.location.hash = `#${path}`;
  },

  getCurrentRoute() {
    return this._currentRoute;
  }
};
