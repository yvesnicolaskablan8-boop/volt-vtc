/**
 * Sidebar - Navigation management
 */
const Sidebar = {
  init() {
    // Mobile toggle
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });

    // Nav item clicks close mobile sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
          overlay.classList.remove('active');
        }
      });
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
