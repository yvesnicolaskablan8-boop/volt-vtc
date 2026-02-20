/**
 * Header - Top bar management
 */
const Header = {
  init() {
    this._initThemeToggle();
    this._initNotifications();
    this._initSearch();
  },

  setBreadcrumb(title) {
    const breadcrumb = document.getElementById('header-breadcrumb');
    breadcrumb.innerHTML = `
      <span class="text-muted">Volt</span>
      <i class="fas fa-chevron-right text-muted" style="font-size: 10px;"></i>
      <span class="current">${title}</span>
    `;
  },

  _initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => ThemeManager.toggle());
    }
  },

  _initNotifications() {
    const toggle = document.getElementById('notifications-toggle');
    const dropdown = document.getElementById('notif-dropdown');

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!toggle.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });

    const clearBtn = document.getElementById('notif-clear');
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('notif-list').innerHTML = `
        <div class="empty-state" style="padding: 24px;">
          <i class="fas fa-bell-slash"></i>
          <p style="font-size: 12px;">Aucune notification</p>
        </div>
      `;
      document.getElementById('notif-count').style.display = 'none';
    });

    this._loadNotifications();
  },

  _loadNotifications() {
    const list = document.getElementById('notif-list');
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
    countEl.textContent = count;
    countEl.style.display = count > 0 ? 'flex' : 'none';

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
