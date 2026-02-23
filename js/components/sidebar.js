/**
 * Sidebar - Navigation management with permission filtering
 */
const Sidebar = {
  _toggleHandler: null,
  _overlayHandler: null,
  _navHandlers: [],

  init() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!toggle || !sidebar || !overlay) return;

    // Remove old listeners if any (safe re-init)
    if (this._toggleHandler) {
      toggle.removeEventListener('click', this._toggleHandler);
      toggle.removeEventListener('touchend', this._toggleHandler);
    }
    if (this._overlayHandler) {
      overlay.removeEventListener('click', this._overlayHandler);
      overlay.removeEventListener('touchend', this._overlayHandler);
    }
    this._navHandlers.forEach(({ el, handler }) => {
      el.removeEventListener('click', handler);
    });
    this._navHandlers = [];

    // Helper to open sidebar
    const openSidebar = () => {
      sidebar.classList.add('open');
      sidebar.style.pointerEvents = '';
      sidebar.style.visibility = '';
      sidebar.style.transform = '';
      overlay.classList.add('active');
    };

    // Helper to close sidebar
    const closeSidebar = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
      // On mobile, re-apply pointer-events block after transition
      if (window.innerWidth <= 1024) {
        setTimeout(() => {
          if (!sidebar.classList.contains('open')) {
            sidebar.style.pointerEvents = 'none';
            sidebar.style.visibility = 'hidden';
          }
        }, 350);
      }
    };

    // Toggle handler — opens/closes sidebar
    this._toggleHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    };

    // Overlay handler — closes sidebar when tapping the dark overlay
    this._overlayHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSidebar();
    };

    // Attach with both click and touchend for WebView compatibility
    toggle.addEventListener('click', this._toggleHandler);
    toggle.addEventListener('touchend', this._toggleHandler);
    overlay.addEventListener('click', this._overlayHandler);
    overlay.addEventListener('touchend', this._overlayHandler);

    // Nav item clicks close mobile sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
      const handler = () => {
        if (window.innerWidth <= 1024) {
          closeSidebar();
        }
      };
      item.addEventListener('click', handler);
      this._navHandlers.push({ el: item, handler });
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
