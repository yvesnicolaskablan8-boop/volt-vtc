/**
 * BottomNav - Mobile bottom navigation bar management
 * Only visible on mobile (≤768px) or native APK WebView
 */
const BottomNav = {
  _handlers: [],
  _visible: false,

  init() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    // Cleanup previous handlers
    this._handlers.forEach(({ el, event, handler }) => {
      el.removeEventListener(event, handler);
    });
    this._handlers = [];

    // Determine if we should show bottom nav
    this._checkVisibility();

    // Listen for resize to toggle visibility
    const resizeHandler = () => this._checkVisibility();
    window.addEventListener('resize', resizeHandler);
    this._handlers.push({ el: window, event: 'resize', handler: resizeHandler });

    // Filter items by permissions
    this._filterByPermissions();

    // Tap feedback on nav items
    nav.querySelectorAll('.bottom-nav-item').forEach(item => {
      const handler = () => {
        item.classList.add('bottom-nav-tap');
        setTimeout(() => item.classList.remove('bottom-nav-tap'), 150);
      };
      item.addEventListener('click', handler);
      this._handlers.push({ el: item, event: 'click', handler });
    });
  },

  _checkVisibility() {
    const isNative = !!(window.VoltNative) || navigator.userAgent.includes('VoltAdminApp');
    const isMobile = isNative || window.innerWidth <= 768;
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    if (isMobile) {
      nav.classList.add('bottom-nav-visible');
      document.body.classList.add('volt-has-bottomnav');
      this._visible = true;
    } else {
      nav.classList.remove('bottom-nav-visible');
      document.body.classList.remove('volt-has-bottomnav');
      this._visible = false;
    }
  },

  _filterByPermissions() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return;

    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    nav.querySelectorAll('.bottom-nav-item[data-route]').forEach(item => {
      const route = item.getAttribute('data-route');
      if (!route || route === '/menu') return; // Menu always visible
      const canAccess = Auth.canAccessRoute(route);
      item.style.display = canAccess ? '' : 'none';
    });
  },

  setActive(route) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    // Extract base route (e.g., /chauffeurs/CHF-001 → /chauffeurs)
    const baseRoute = '/' + route.split('/').filter(Boolean)[0];

    // Routes that have their own bottom nav tab
    const tabRoutes = ['/dashboard', '/chauffeurs', '/planning', '/vehicules', '/menu'];
    const isTabRoute = tabRoutes.includes(baseRoute);

    nav.querySelectorAll('.bottom-nav-item').forEach(item => {
      const itemRoute = item.getAttribute('data-route');
      let isActive = false;

      if (itemRoute === '/menu') {
        // Menu tab is active when on /menu OR on any route NOT in bottom bar tabs
        isActive = baseRoute === '/menu' || !isTabRoute;
      } else {
        // Regular tabs: match base route or sub-routes
        isActive = baseRoute === itemRoute || route.startsWith(itemRoute + '/');
      }

      item.classList.toggle('active', isActive);
    });
  },

  isVisible() {
    return this._visible;
  }
};
