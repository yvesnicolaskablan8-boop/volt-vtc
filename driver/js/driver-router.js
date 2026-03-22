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
      messagerie: 'Messages',
      maintenance: 'Entretien vehicule',
      profil: 'Mon Profil',
      notifications: 'Notifications',
      'etat-lieux': 'Etat des Lieux',
      documents: 'Documents & Alertes',
      support: 'Signaler un problème',
      classement: 'Classement',
      contraventions: 'Mes Contraventions',
      contrat: 'Mon Contrat'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[route] || 'Pilote Chauffeur';

    // Show/hide back button (hidden on main tab pages)
    const mainTabs = ['accueil', 'versements', 'classement', 'profil'];
    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
      backBtn.style.display = mainTabs.includes(route) ? 'none' : 'flex';
    }

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
