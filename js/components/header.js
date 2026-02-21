/**
 * Header - Top bar management
 */
const Header = {
  init() {
    this._initThemeToggle();
    this._initNotifications();
    this._initSearch();
    this._renderUserInfo();
    this._initLogout();
  },

  setBreadcrumb(title) {
    const breadcrumb = document.getElementById('header-breadcrumb');
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

    const avatarEl = document.querySelector('.header-user-avatar');
    const nameEl = document.querySelector('.header-user-name');

    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = fullName;
  },

  _initLogout() {
    // Add logout button if not already present
    const userDiv = document.querySelector('.header-user');
    if (!userDiv) return;

    // Remove existing logout button
    const existing = userDiv.querySelector('.btn-logout');
    if (existing) existing.remove();

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn-logout';
    logoutBtn.title = 'Déconnexion';
    logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
    logoutBtn.addEventListener('click', () => {
      App.logout();
    });
    userDiv.appendChild(logoutBtn);
  },

  _initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      // Clone to remove old listeners
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', () => ThemeManager.toggle());
    }
  },

  _initNotifications() {
    const toggle = document.getElementById('notifications-toggle');
    const dropdown = document.getElementById('notif-dropdown');

    // Clone to remove old listeners
    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);

    const newDropdown = newToggle.querySelector('#notif-dropdown') || document.getElementById('notif-dropdown');

    newToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      newDropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!newToggle.contains(e.target)) {
        newDropdown.classList.remove('active');
      }
    });

    const clearBtn = newToggle.querySelector('#notif-clear') || document.getElementById('notif-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
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
      });
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

    // Clone to remove old listeners
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', Utils.debounce((e) => {
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
        newInput.value = '';
      } else if (vehicules.length === 1) {
        Router.navigate(`/vehicules/${vehicules[0].id}`);
        newInput.value = '';
      } else if (chauffeurs.length > 0) {
        Router.navigate('/chauffeurs');
        newInput.value = '';
      } else if (vehicules.length > 0) {
        Router.navigate('/vehicules');
        newInput.value = '';
      }
    }, 500));

    newInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        newInput.dispatchEvent(new Event('input'));
      }
    });
  },

  refreshNotifications() {
    this._loadNotifications();
  }
};
