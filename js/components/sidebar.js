/**
 * Sidebar - Navigation management with permission filtering
 */
const Sidebar = {
  init() {
    // Mobile toggle
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    // Clone to remove old listeners
    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);

    newToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    });

    // Clone overlay too
    const newOverlay = overlay.cloneNode(true);
    overlay.parentNode.replaceChild(newOverlay, overlay);

    newOverlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      newOverlay.classList.remove('active');
    });

    // Nav item clicks close mobile sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
          newOverlay.classList.remove('active');
        }
      });
    });

    // Filter by permissions
    this._filterByPermissions();
  },

  _filterByPermissions() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return;

    const navItems = document.querySelectorAll('.nav-item[data-route]');

    navItems.forEach(item => {
      const route = item.getAttribute('data-route');
      if (!route) return;

      // Check if user can access this route
      const canAccess = Auth.canAccessRoute(route);
      item.style.display = canAccess ? '' : 'none';
    });
  },

  setActive(route) {
    document.querySelectorAll('.nav-item').forEach(item => {
      const itemRoute = item.getAttribute('data-route');
      // Match base route (e.g., /chauffeurs matches /chauffeurs/CHF-001)
      const isActive = route === itemRoute || route.startsWith(itemRoute + '/');
      item.classList.toggle('active', isActive);
    });
  }
};
