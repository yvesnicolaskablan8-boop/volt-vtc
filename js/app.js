/**
 * ThemeManager - Dark/Light theme toggle with persistence
 */
const ThemeManager = {
  _current: 'dark',

  init() {
    // Read saved theme or detect system preference
    const saved = localStorage.getItem('volt_theme');
    if (saved) {
      this._current = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      this._current = 'light';
    }
    this._applyTheme(this._current, false);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('volt_theme')) {
        this._applyTheme(e.matches ? 'dark' : 'light', false);
      }
    });
  },

  toggle() {
    const next = this._current === 'dark' ? 'light' : 'dark';
    this._applyTheme(next, true);
    localStorage.setItem('volt_theme', next);

    // Animate the toggle button
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.classList.add('rotating');
      setTimeout(() => btn.classList.remove('rotating'), 500);
    }
  },

  _applyTheme(theme, updateCharts) {
    this._current = theme;
    document.documentElement.setAttribute('data-theme', theme);

    // Update icon
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }

    // Reconfigure Chart.js colors for the theme
    if (updateCharts) {
      Utils.configureChartDefaults();
      // Re-render current page to update charts
      if (typeof Router !== 'undefined' && Router._currentPage && Router._currentPage.destroy) {
        Router._currentPage.destroy();
        Router._currentPage.render();
      }
    }
  },

  isDark() {
    return this._current === 'dark';
  }
};

/**
 * App - Bootstrap and initialization
 */
const App = {
  init() {
    // Initialize theme first (before Chart.js defaults)
    ThemeManager.init();

    // Configure Chart.js defaults
    Utils.configureChartDefaults();

    // Initialize demo data if needed
    if (!Store.isInitialized()) {
      DemoData.generate();
      console.log('Volt: Demo data generated');
    }

    // Initialize components
    Modal.init();
    Sidebar.init();
    Header.init();

    // Initialize router (this triggers the first page render)
    Router.init();

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Volt: Service Worker registered'))
        .catch(err => console.log('Volt: SW registration failed', err));
    }

    console.log('Volt VTC Management v1.1.0 initialized');
    console.log(`Data size: ${Store.getStorageSize().kb} Ko`);
    console.log(`Theme: ${ThemeManager._current}`);
  }
};

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
