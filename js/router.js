/**
 * Router - Hash-based SPA routing
 */
const Router = {
  _routes: {},
  _currentPage: null,
  _currentRoute: '',

  init() {
    // Register routes
    // Une page dont le fichier n'a pas pu se charger ne doit jamais vider
    // toute l'application : chaque route est resolue isolement, et seule
    // celle-la est ignoree.
    const routes = {};
    const add = (chemin, getter, title, action) => {
      let page = null;
      try { page = getter(); } catch (e) { page = null; }
      if (!page) { console.warn('[Router] Page non chargee, route ignoree :', chemin); return; }
      routes[chemin] = action ? { page, title, action } : { page, title };
    };

    add('/dashboard', () => DashboardPage, 'Tableau de bord');
    add('/yango', () => YangoPage, 'Yango Fleet');
    add('/chauffeurs', () => ChauffeursPage, 'Chauffeurs');
    add('/chauffeurs/:id', () => ChauffeursPage, 'Détail chauffeur', 'detail');
    add('/vehicules', () => VehiculesPage, 'Véhicules');
    add('/vehicules/:id', () => VehiculesPage, 'Détail véhicule', 'detail');
    add('/versements', () => VersementsPage, 'Versements');
    add('/bonus', () => BonusPage, 'Bonus');
    add('/simulateur', () => SimulateurPage, 'Simulateur');
    add('/rentabilite', () => RentabilitePage, 'Rentabilité');
    add('/gps-conduite', () => GpsConduitePage, 'GPS & Conduite');
    add('/controle-conduite', () => ControleConduitePage, 'Controle de conduite');
    add('/classement', () => ClassementPage, 'Classement');
    add('/rapports', () => RapportsPage, 'Rapports');
    add('/comptabilite', () => ComptabilitePage, 'Comptabilité');
    add('/planning', () => PlanningPage, 'Planning');
    add('/messagerie', () => MessageriePage, 'Messagerie');
    add('/alertes', () => AlertesPage, 'Alertes');
    add('/taches', () => TachesPage, 'Taches');
    add('/activite', () => ActivitePage, 'Journal d\'activite');
    add('/notifications-admin', () => NotificationsAdminPage, 'Notifications');
    add('/parametres', () => ParametresPage, 'Paramètres');
    add('/mon-compte', () => MonComptePage, 'Mon compte');
    add('/menu', () => MenuPage, 'Menu');

    routes['/contraventions'] = { redirect: '/controle-conduite' };
    routes['/depenses'] = { redirect: '/comptabilite' };
    routes['/garage'] = { redirect: '/vehicules' };
    routes['/incidents'] = { redirect: '/vehicules' };

    this._routes = routes;

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

    // Scroll to top on navigation
    window.scrollTo(0, 0);
    const pageContent = document.getElementById('page-content');
    if (pageContent) pageContent.scrollTop = 0;

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

    // Handle redirects
    if (config.redirect) {
      window.location.hash = '#' + config.redirect;
      return;
    }

    // Auth guard: check if user is logged in
    if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
      return;
    }

    // Auth guard: check route permission
    if (typeof Auth !== 'undefined' && !Auth.canAccessRoute(hash)) {
      this._currentRoute = hash;
      Sidebar.setActive(hash);
      if (typeof BottomNav !== 'undefined') BottomNav.setActive(hash);
      Header.setBreadcrumb('Accès restreint');
      const container = document.getElementById('page-content');
      container.innerHTML = `
        <div class="access-restricted">
          <iconify-icon icon="solar:lock-bold-duotone"></iconify-icon>
          <h2>Accès restreint</h2>
          <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page. Contactez votre administrateur.</p>
          <button class="btn btn-primary" style="margin-top: var(--space-lg);" onclick="Router.navigate('/dashboard')">
            <iconify-icon icon="solar:home-bold-duotone"></iconify-icon> Retour au tableau de bord
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

    // Update bottom nav active state (mobile)
    if (typeof BottomNav !== 'undefined') BottomNav.setActive(hash);

    // Determine if this is a "menu sub-page" (not a bottom nav tab) → show back button to /menu
    const bottomNavRoutes = ['/dashboard', '/chauffeurs', '/planning', '/vehicules', '/menu'];
    const baseRoute = '/' + hash.split('/').filter(Boolean)[0];
    const backRoute = bottomNavRoutes.includes(baseRoute) ? null : '/menu';

    // Update breadcrumb (with optional back button for menu sub-pages)
    Header.setBreadcrumb(config.title, backRoute);

    // Render page
    const container = document.getElementById('page-content');
    container.innerHTML = '';

    if (config.action === 'detail' && typeof config.page.renderDetail === 'function') {
      config.page.renderDetail(params.id);
    } else {
      config.page.render();
    }

    // Force dynamic iconify-icon elements to render
    this._refreshIcons();
  },

  /**
   * Ensure all dynamically-added <iconify-icon> elements render their SVG.
   * The web component can miss elements inserted via innerHTML in bulk,
   * so we reset the icon attribute on any that haven't rendered yet.
   */
  _refreshIcons() {
    const refresh = () => {
      document.querySelectorAll('iconify-icon').forEach(el => {
        if (!el.shadowRoot || !el.shadowRoot.querySelector('svg')) {
          const name = el.getAttribute('icon');
          if (name) {
            el.removeAttribute('icon');
            requestAnimationFrame(() => el.setAttribute('icon', name));
          }
        }
      });
    };
    // Multiple passes: icons may need time to fetch from CDN
    setTimeout(refresh, 100);
    setTimeout(refresh, 600);
    setTimeout(refresh, 1800);
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
