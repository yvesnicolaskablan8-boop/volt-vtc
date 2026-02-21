/**
 * DriverNav — Gestion de la barre de navigation bottom
 */
const DriverNav = {
  setActive(route) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    nav.querySelectorAll('.nav-item').forEach(item => {
      const itemRoute = item.getAttribute('data-route');
      if (itemRoute === route) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
};
