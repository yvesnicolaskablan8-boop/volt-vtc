/**
 * DriverRouter — Routeur hash-based simple pour la PWA chauffeur
 */
const DriverRouter = {
  _routes: {},
  _currentPage: null,

  register(name, page) {
    this._routes[name] = page;
  },

  init() {
    window.addEventListener('hashchange', () => this._onHashChange());
    this._onHashChange();
  },

  navigate(route) {
    window.location.hash = '#/' + route;
  },

  _onHashChange() {
    const hash = window.location.hash || '#/accueil';
    const route = hash.replace('#/', '') || 'accueil';

    // Update nav
    DriverNav.setActive(route);

    // Update page title
    const titles = {
      accueil: 'Accueil',
      planning: 'Mon Planning',
      versements: 'Mes Versements',
      signalements: 'Signalements',
      profil: 'Mon Profil'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[route] || 'Volt Chauffeur';

    // Destroy current page
    if (this._currentPage && typeof this._currentPage.destroy === 'function') {
      this._currentPage.destroy();
    }

    // Render new page
    const page = this._routes[route];
    if (page) {
      this._currentPage = page;
      const content = document.getElementById('app-content');
      if (content) {
        content.innerHTML = '';
        content.scrollTop = 0;
        page.render(content);
      }
    }
  },

  getCurrentRoute() {
    const hash = window.location.hash || '#/accueil';
    return hash.replace('#/', '') || 'accueil';
  }
};
