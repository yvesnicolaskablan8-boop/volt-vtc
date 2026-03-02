/**
 * DriverNav — Gestion de la barre de navigation bottom (4 onglets)
 */
const DriverNav = {
  _tabRoutes: ['accueil', 'versements', 'messagerie', 'profil'],

  setActive(route) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    const isTabRoute = this._tabRoutes.includes(route);

    nav.querySelectorAll('.nav-item').forEach(item => {
      const itemRoute = item.getAttribute('data-route');
      const isActive = isTabRoute
        ? itemRoute === route
        : itemRoute === 'accueil';
      item.classList.toggle('active', isActive);
    });
  }
};
