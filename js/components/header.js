/**
 * Header - Top bar management
 */
const Header = {
  _handlers: {},

  init() {
    this._cleanup();
    this._initThemeToggle();
    this._initNotifications();
    this._initSearch();
    this._renderUserInfo();
    this._initUserDropdown();
  },

  // Remove all previously attached handlers
  _cleanup() {
    Object.values(this._handlers).forEach(({ el, event, fn }) => {
      if (el) el.removeEventListener(event, fn);
    });
    this._handlers = {};
  },

  _on(key, el, event, fn) {
    if (!el) return;
    el.addEventListener(event, fn);
    this._handlers[key] = { el, event, fn };
  },

  setBreadcrumb(title) {
    const breadcrumb = document.getElementById('header-breadcrumb');
    if (!breadcrumb) return;
    breadcrumb.innerHTML = `
      <span class="text-muted">Volt</span>
      <i class="fas fa-chevron-right text-muted" style="font-size: 10px;"></i>
      <span class="current">${title}</span>
    `;
  },

  _renderUserInfo() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return;

    const session = Auth.getSession();
    if (!session) return;

    const initials = (session.prenom[0] + session.nom[0]).toUpperCase();
    const fullName = `${session.prenom} ${session.nom}`;
    const role = session.role || 'Utilisateur';

    // Update header avatar & name
    const avatarEl = document.querySelector('.header-user-avatar');
    const nameEl = document.querySelector('.header-user-name');

    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = fullName;

    // Update dropdown avatar, name & role
    const dropdownAvatar = document.querySelector('.user-dropdown-avatar');
    const dropdownName = document.querySelector('.user-dropdown-name');
    const dropdownRole = document.querySelector('.user-dropdown-role');

    if (dropdownAvatar) dropdownAvatar.textContent = initials;
    if (dropdownName) dropdownName.textContent = fullName;
    if (dropdownRole) dropdownRole.textContent = role;
  },

  _initUserDropdown() {
    const userToggle = document.getElementById('header-user-toggle');
    const dropdown = document.getElementById('user-dropdown');
    if (!userToggle || !dropdown) return;

    // Toggle dropdown on click/touch
    const toggleHandler = (e) => {
      e.stopPropagation();
      e.preventDefault();

      // Close other dropdowns (notifications)
      const notifDropdown = document.getElementById('notif-dropdown');
      if (notifDropdown) notifDropdown.classList.remove('active');

      dropdown.classList.toggle('active');
      userToggle.classList.toggle('active');
    };

    this._on('userToggleClick', userToggle, 'click', toggleHandler);

    // Close when clicking outside
    const outsideHandler = (e) => {
      if (!userToggle.contains(e.target)) {
        dropdown.classList.remove('active');
        userToggle.classList.remove('active');
      }
    };
    this._on('userOutside', document, 'click', outsideHandler);

    // Mon compte → Navigate to Paramètres > Mon compte
    const profileBtn = document.getElementById('user-dropdown-profile');
    if (profileBtn) {
      const profileHandler = (e) => {
        e.stopPropagation();
        dropdown.classList.remove('active');
        userToggle.classList.remove('active');
        Router.navigate('/parametres');
        setTimeout(() => {
          if (typeof Parametres !== 'undefined' && Parametres._switchTab) {
            Parametres._switchTab('account');
          }
        }, 200);
      };
      this._on('profileClick', profileBtn, 'click', profileHandler);
    }

    // Paramètres → Navigate to Paramètres
    const settingsBtn = document.getElementById('user-dropdown-settings');
    if (settingsBtn) {
      const settingsHandler = (e) => {
        e.stopPropagation();
        dropdown.classList.remove('active');
        userToggle.classList.remove('active');
        Router.navigate('/parametres');
      };
      this._on('settingsClick', settingsBtn, 'click', settingsHandler);
    }

    // Déconnexion
    const logoutBtn = document.getElementById('user-dropdown-logout');
    if (logoutBtn) {
      const logoutHandler = (e) => {
        e.stopPropagation();
        dropdown.classList.remove('active');
        userToggle.classList.remove('active');
        App.logout();
      };
      this._on('logoutClick', logoutBtn, 'click', logoutHandler);
    }
  },

  _initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const handler = () => ThemeManager.toggle();
    this._on('themeClick', btn, 'click', handler);
  },

  _initNotifications() {
    const toggle = document.getElementById('notifications-toggle');
    const dropdown = document.getElementById('notif-dropdown');
    if (!toggle || !dropdown) return;

    const toggleHandler = (e) => {
      e.stopPropagation();

      // Close user dropdown
      const userDropdown = document.getElementById('user-dropdown');
      const userToggle = document.getElementById('header-user-toggle');
      if (userDropdown) userDropdown.classList.remove('active');
      if (userToggle) userToggle.classList.remove('active');

      dropdown.classList.toggle('active');
    };

    this._on('notifClick', toggle, 'click', toggleHandler);

    const outsideHandler = (e) => {
      if (!toggle.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    };
    this._on('notifOutside', document, 'click', outsideHandler);

    const clearBtn = document.getElementById('notif-clear');
    if (clearBtn) {
      const clearHandler = (e) => {
        e.stopPropagation();
        const notifList = document.getElementById('notif-list');
        if (notifList) {
          notifList.innerHTML = `
            <div class="empty-state" style="padding: 24px;">
              <i class="fas fa-bell-slash"></i>
              <p style="font-size: 12px;">Aucune notification</p>
            </div>
          `;
        }
        const countEl = document.getElementById('notif-count');
        if (countEl) countEl.style.display = 'none';
      };
      this._on('notifClear', clearBtn, 'click', clearHandler);
    }

    this._loadNotifications();
  },

  _loadNotifications() {
    const list = document.getElementById('notif-list');
    if (!list) return;

    const versementsRetard = Store.query('versements', v => v.statut === 'retard' || v.statut === 'en_attente');
    const docsExpires = [];

    Store.get('chauffeurs').forEach(c => {
      if (c.documents) {
        c.documents.forEach(doc => {
          if (doc.statut === 'expire' || doc.statut === 'a_renouveler') {
            docsExpires.push({ chauffeur: c, doc });
          }
        });
      }
    });

    const notifications = [];

    // Versements en retard
    const retardCount = versementsRetard.filter(v => v.statut === 'retard').length;
    if (retardCount > 0) {
      notifications.push({
        icon: 'fa-exclamation-triangle',
        iconBg: 'rgba(239, 68, 68, 0.15)',
        iconColor: '#ef4444',
        text: `<strong>${retardCount} versement${retardCount > 1 ? 's' : ''}</strong> en retard`,
        time: "Aujourd'hui"
      });
    }

    // Versements en attente
    const attenteCount = versementsRetard.filter(v => v.statut === 'en_attente').length;
    if (attenteCount > 0) {
      notifications.push({
        icon: 'fa-clock',
        iconBg: 'rgba(245, 158, 11, 0.15)',
        iconColor: '#f59e0b',
        text: `<strong>${attenteCount} versement${attenteCount > 1 ? 's' : ''}</strong> en attente de validation`,
        time: "Aujourd'hui"
      });
    }

    // Documents expirés
    docsExpires.slice(0, 3).forEach(({ chauffeur, doc }) => {
      notifications.push({
        icon: doc.statut === 'expire' ? 'fa-file-circle-xmark' : 'fa-file-circle-exclamation',
        iconBg: doc.statut === 'expire' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
        iconColor: doc.statut === 'expire' ? '#ef4444' : '#f59e0b',
        text: `<strong>${doc.nom}</strong> de ${chauffeur.prenom} ${chauffeur.nom} ${doc.statut === 'expire' ? 'expiré' : 'à renouveler'}`,
        time: Utils.formatDate(doc.dateExpiration)
      });
    });

    const count = notifications.length;
    const countEl = document.getElementById('notif-count');
    if (countEl) {
      countEl.textContent = count;
      countEl.style.display = count > 0 ? 'flex' : 'none';
    }

    if (notifications.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding: 24px;">
          <i class="fas fa-bell-slash"></i>
          <p style="font-size: 12px;">Aucune notification</p>
        </div>
      `;
      return;
    }

    list.innerHTML = notifications.map(n => `
      <div class="notif-item">
        <div class="notif-icon" style="background:${n.iconBg}; color:${n.iconColor}">
          <i class="fas ${n.icon}"></i>
        </div>
        <div class="notif-text">${n.text}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    `).join('');
  },

  _initSearch() {
    const input = document.getElementById('global-search');
    if (!input) return;

    // Use a flag to prevent duplicate init
    if (input._voltSearchInit) return;
    input._voltSearchInit = true;

    input.addEventListener('input', Utils.debounce((e) => {
      const query = e.target.value.trim().toLowerCase();
      if (query.length < 2) return;

      // Search across chauffeurs and véhicules
      const chauffeurs = Store.query('chauffeurs', c =>
        `${c.prenom} ${c.nom}`.toLowerCase().includes(query) ||
        c.telephone.includes(query) ||
        c.email.toLowerCase().includes(query)
      );

      const vehicules = Store.query('vehicules', v =>
        `${v.marque} ${v.modele}`.toLowerCase().includes(query) ||
        v.immatriculation.toLowerCase().includes(query)
      );

      if (chauffeurs.length === 1) {
        Router.navigate(`/chauffeurs/${chauffeurs[0].id}`);
        input.value = '';
      } else if (vehicules.length === 1) {
        Router.navigate(`/vehicules/${vehicules[0].id}`);
        input.value = '';
      } else if (chauffeurs.length > 0) {
        Router.navigate('/chauffeurs');
        input.value = '';
      } else if (vehicules.length > 0) {
        Router.navigate('/vehicules');
        input.value = '';
      }
    }, 500));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.dispatchEvent(new Event('input'));
      }
    });
  },

  refreshNotifications() {
    this._loadNotifications();
  }
};
