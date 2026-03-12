/**
 * MenuPage - Grid of all navigation items not in the bottom bar
 * Displayed on mobile when user taps the "Menu" tab
 */
const MenuPage = {
  render() {
    const container = document.getElementById('page-content');

    // All pages NOT present in bottom nav tabs (Dashboard, Chauffeurs, Planning, Vehicules)
    const menuItems = [
      { route: '/yango', icon: 'solar:bus-bold-duotone', label: 'Yango Fleet', color: '#facc15' },
      { route: '/motivation', icon: 'solar:fire-bold-duotone', label: 'Engagement', color: '#f97316' },
      { route: '/garage', icon: 'solar:garage-bold-duotone', label: 'Garage', color: '#06b6d4' },
      { route: '/versements', icon: 'solar:transfer-horizontal-bold-duotone', label: 'Versements', color: '#22c55e' },
      { route: '/recouvrement', icon: 'solar:phone-calling-bold-duotone', label: 'Recouvrement', color: '#f43f5e' },
      { route: '/contraventions', icon: 'solar:document-text-bold-duotone', label: 'Contraventions', color: '#ef4444' },
      { route: '/rentabilite', icon: 'solar:pie-chart-2-bold-duotone', label: 'Rentabilité', color: '#8b5cf6' },
      { route: '/comptabilite', icon: 'solar:calculator-bold-duotone', label: 'Comptabilité', color: '#3b82f6' },
      { route: '/messagerie', icon: 'solar:chat-round-dots-bold-duotone', label: 'Messagerie', color: '#06b6d4' },
      { route: '/gps-conduite', icon: 'solar:map-arrow-right-bold-duotone', label: 'GPS & Conduite', color: '#14b8a6' },
      { route: '/alertes', icon: 'solar:bell-bing-bold-duotone', label: 'Alertes', color: '#eab308' },
      { route: '/rapports', icon: 'solar:file-download-bold-duotone', label: 'Rapports', color: '#6366f1' },
      { route: '/parametres', icon: 'solar:settings-bold-duotone', label: 'Paramètres', color: '#94a3b8' }
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
          <h1><iconify-icon icon="solar:widget-bold-duotone"></iconify-icon> Menu</h1>
        </div>
        <div class="menu-grid">
          ${visibleItems.map(item => `
            <a href="#${item.route}" class="menu-grid-item">
              <div class="menu-grid-icon" style="color:${item.color};background:${item.color}15;">
                <iconify-icon icon="${item.icon}"></iconify-icon>
              </div>
              <span class="menu-grid-label">${item.label}</span>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  },

  destroy() {}
};
