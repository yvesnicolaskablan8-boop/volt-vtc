/**
 * MenuPage - Grid of all navigation items not in the bottom bar
 * Displayed on mobile when user taps the "Menu" tab
 */
const MenuPage = {
  render() {
    const container = document.getElementById('page-content');

    // All pages NOT present in bottom nav tabs (Dashboard, Chauffeurs, Planning, Vehicules)
    const menuItems = [
      { route: '/yango', icon: 'fa-taxi', label: 'Yango Fleet', color: '#facc15' },
      { route: '/motivation', icon: 'fa-fire', label: 'Engagement', color: '#f97316' },
      { route: '/maintenances', icon: 'fa-tools', label: 'Maintenances', color: '#06b6d4' },
      { route: '/versements', icon: 'fa-money-bill-transfer', label: 'Versements', color: '#22c55e' },
      { route: '/rentabilite', icon: 'fa-chart-pie', label: 'Rentabilité', color: '#8b5cf6' },
      { route: '/comptabilite', icon: 'fa-calculator', label: 'Comptabilité', color: '#3b82f6' },
      { route: '/messagerie', icon: 'fa-comments', label: 'Messagerie', color: '#06b6d4' },
      { route: '/gps-conduite', icon: 'fa-satellite-dish', label: 'GPS & Conduite', color: '#14b8a6' },
      { route: '/alertes', icon: 'fa-bell', label: 'Alertes', color: '#eab308' },
      { route: '/rapports', icon: 'fa-file-export', label: 'Rapports', color: '#6366f1' },
      { route: '/parametres', icon: 'fa-cog', label: 'Paramètres', color: '#94a3b8' }
    ];

    // Filter by permissions
    const visibleItems = menuItems.filter(item => {
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
        return Auth.canAccessRoute(item.route);
      }
      return true;
    });

    container.innerHTML = `
      <div class="menu-page">
        <div class="menu-page-header">
          <h1><i class="fas fa-grip"></i> Menu</h1>
        </div>
        <div class="menu-grid">
          ${visibleItems.map(item => `
            <div class="menu-grid-item" data-route="${item.route}">
              <div class="menu-grid-icon" style="color:${item.color};background:${item.color}15;">
                <i class="fas ${item.icon}"></i>
              </div>
              <span class="menu-grid-label">${item.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Bind click handlers explicitly for reliable navigation
    container.querySelectorAll('.menu-grid-item[data-route]').forEach(item => {
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const route = item.getAttribute('data-route');
        if (route) Router.navigate(route);
      };
      item.addEventListener('click', handler);
      item.addEventListener('touchend', handler);
    });
  },

  destroy() {
    // No intervals or charts to clean up
  }
};
