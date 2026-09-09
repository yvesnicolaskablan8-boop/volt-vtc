/**
 * MenuPage - Grid of all navigation items not in the bottom bar
 * Displayed on mobile when user taps the "Menu" tab
 */
const MenuPage = {
  render() {
    const container = document.getElementById('page-content');

    // All pages NOT present in bottom nav tabs (Dashboard, Chauffeurs, Planning, Vehicules)
    const menuItems = [
      { route: '/yango', icon: 'arcticons:yango', label: 'Yango Fleet', color: '#FC4C02' },
      { route: '/taches', icon: 'solar:checklist-bold-duotone', label: 'Taches', color: '#F5512E' },
      { route: '/versements', icon: 'solar:wallet-money-bold-duotone', label: 'Caisse', color: '#13deb9' },
      { route: '/bonus', icon: 'solar:gift-bold-duotone', label: 'Bonus', color: '#635bff' },
      { route: '/simulateur', icon: 'solar:calculator-minimalistic-bold-duotone', label: 'Simulateur', color: '#0891b2' },
      { route: '/rentabilite', icon: 'solar:pie-chart-2-bold-duotone', label: 'Rentabilité', color: '#635bff' },
      { route: '/comptabilite', icon: 'solar:calculator-bold-duotone', label: 'Comptabilité', color: '#635bff' },
      { route: '/messagerie', icon: 'solar:chat-round-dots-bold-duotone', label: 'Messagerie', color: '#0891b2' },
      { route: '/suivi-vehicules', icon: 'solar:map-point-wave-bold-duotone', label: 'Suivi véhicules', color: '#635bff' },
      { route: '/controle-conduite', icon: 'solar:shield-check-bold-duotone', label: 'Contr\u00f4le conduite', color: '#F5512E' },
      { route: '/classement', icon: 'solar:cup-star-bold-duotone', label: 'Classement', color: '#ffae1f' },

      { route: '/alertes', icon: 'solar:bell-bing-bold-duotone', label: 'Alertes', color: '#e8930c' },
      { route: '/rapports', icon: 'solar:file-download-bold-duotone', label: 'Rapports', color: '#F5512E' },
      { route: '/mon-compte', icon: 'solar:user-circle-bold-duotone', label: 'Mon compte', color: '#F5512E' },
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
