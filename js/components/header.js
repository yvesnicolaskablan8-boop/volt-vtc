/**
 * Header - Top bar management
 */
const Header = {
  _handlers: {},
  _prevTaskCount: null,

  init() {
    this._cleanup();
    this._initRefreshButton();
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

  setBreadcrumb(title, backRoute) {
    const breadcrumb = document.getElementById('header-breadcrumb');
    if (!breadcrumb) return;

    const backBtn = backRoute
      ? `<a href="#${backRoute}" class="breadcrumb-back"><iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon></a>`
      : '';

    breadcrumb.innerHTML = `
      ${backBtn}
      <span class="text-muted">Pilote</span>
      <iconify-icon icon="solar:alt-arrow-right-bold" class="text-muted" style="font-size: 12px;"></iconify-icon>
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

  _initRefreshButton() {
    const btn = document.getElementById('btn-refresh-page');
    if (!btn) return;
    const handler = async () => {
      const icon = document.getElementById('refresh-icon');
      if (icon) icon.style.animation = 'spin 0.8s linear infinite';
      btn.disabled = true;
      try {
        await Store.initialize();
        Router._handleRoute();
        if (typeof Toast !== 'undefined') Toast.success('Données actualisées');
      } catch (e) {
        console.warn('Refresh failed:', e);
        if (typeof Toast !== 'undefined') Toast.error('Erreur lors de l\'actualisation');
      }
      btn.disabled = false;
      if (icon) icon.style.animation = '';
    };
    this._on('refreshClick', btn, 'click', handler);
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
              <iconify-icon icon="solar:bell-off-bold-duotone"></iconify-icon>
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

    // Rafraichir les notifications toutes les 60s pour detecter les nouvelles taches
    if (!this._notifInterval) {
      this._notifInterval = setInterval(() => {
        this._loadNotifications();
      }, 60000);
    }
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
        icon: 'solar:danger-triangle-bold-duotone',
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
        icon: 'solar:clock-circle-bold-duotone',
        iconBg: 'rgba(245, 158, 11, 0.15)',
        iconColor: '#f59e0b',
        text: `<strong>${attenteCount} versement${attenteCount > 1 ? 's' : ''}</strong> en attente de validation`,
        time: "Aujourd'hui"
      });
    }

    // Documents expirés
    docsExpires.slice(0, 3).forEach(({ chauffeur, doc }) => {
      notifications.push({
        icon: doc.statut === 'expire' ? 'solar:file-remove-bold-duotone' : 'solar:file-corrupted-bold-duotone',
        iconBg: doc.statut === 'expire' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
        iconColor: doc.statut === 'expire' ? '#ef4444' : '#f59e0b',
        text: `<strong>${doc.nom}</strong> de ${chauffeur.prenom} ${chauffeur.nom} ${doc.statut === 'expire' ? 'expiré' : 'à renouveler'}`,
        time: Utils.formatDate(doc.dateExpiration)
      });
    });

    // Notifications taches (pour l'admin: taches prises en charge ou terminees)
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isAdmin = session && session.role === 'Administrateur';
    if (isAdmin) {
      const taches = Store.get('taches') || [];
      const userId = session.userId;
      // Taches creees par l'admin qui sont "en_cours" (prise en charge recente)
      const enCours = taches.filter(t => t.creePar === userId && t.statut === 'en_cours' && t.assigneANom);
      const termineesRecentes = taches.filter(t => {
        if (t.creePar !== userId || t.statut !== 'terminee' || !t.dateTerminaison) return false;
        const termDate = new Date(t.dateTerminaison);
        const now = new Date();
        return (now - termDate) < 24 * 60 * 60 * 1000; // dernières 24h
      });
      enCours.slice(0, 3).forEach(t => {
        notifications.push({
          icon: 'solar:hand-shake-bold-duotone',
          iconBg: 'rgba(59,130,246,0.15)',
          iconColor: '#3b82f6',
          text: `<strong>${t.assigneANom}</strong> s'occupe de "${t.titre}"`,
          time: 'En cours'
        });
      });
      termineesRecentes.slice(0, 3).forEach(t => {
        notifications.push({
          icon: 'solar:check-circle-bold-duotone',
          iconBg: 'rgba(34,197,94,0.15)',
          iconColor: '#22c55e',
          text: `<strong>${t.assigneANom}</strong> a terminé "${t.titre}"`,
          time: t.dateTerminaison ? Utils.formatDate(t.dateTerminaison.split('T')[0]) : ''
        });
      });
    } else if (session && session.role !== 'chauffeur') {
      // Pour les utilisateurs non-admin
      const taches = Store.get('taches') || [];
      const userId = session.userId;
      // Taches assignées à moi
      const nouvelles = taches.filter(t => t.assigneA === userId && t.statut === 'a_faire');
      if (nouvelles.length > 0) {
        notifications.push({
          icon: 'solar:checklist-bold-duotone',
          iconBg: 'rgba(99,102,241,0.15)',
          iconColor: '#6366f1',
          text: `<strong>${nouvelles.length} tache${nouvelles.length > 1 ? 's' : ''}</strong> à effectuer`,
          time: "Aujourd'hui"
        });
      }
      // Taches que j'ai créées et qui sont prises en charge ou terminées
      const enCoursCrees = taches.filter(t => t.creePar === userId && t.assigneA !== userId && t.statut === 'en_cours' && t.assigneANom);
      enCoursCrees.slice(0, 3).forEach(t => {
        notifications.push({
          icon: 'solar:hand-shake-bold-duotone',
          iconBg: 'rgba(59,130,246,0.15)',
          iconColor: '#3b82f6',
          text: `<strong>${t.assigneANom}</strong> s'occupe de "${t.titre}"`,
          time: 'En cours'
        });
      });
      const termCrees = taches.filter(t => {
        if (t.creePar !== userId || t.assigneA === userId || t.statut !== 'terminee' || !t.dateTerminaison) return false;
        return (new Date() - new Date(t.dateTerminaison)) < 24 * 60 * 60 * 1000;
      });
      termCrees.slice(0, 3).forEach(t => {
        notifications.push({
          icon: 'solar:check-circle-bold-duotone',
          iconBg: 'rgba(34,197,94,0.15)',
          iconColor: '#22c55e',
          text: `<strong>${t.assigneANom}</strong> a terminé "${t.titre}"`,
          time: t.dateTerminaison ? Utils.formatDate(t.dateTerminaison.split('T')[0]) : ''
        });
      });
    }

    // Detecter les nouvelles taches pour jouer un son
    const session2 = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (session2 && session2.role !== 'chauffeur') {
      const allT = Store.get('taches') || [];
      const uid = session2.userId;
      const currentTaskCount = allT.filter(t => t.assigneA === uid && t.statut === 'a_faire').length;
      if (this._prevTaskCount !== null && currentTaskCount > this._prevTaskCount) {
        this._playNotifSound();
      }
      this._prevTaskCount = currentTaskCount;
    }

    const count = notifications.length;
    const countEl = document.getElementById('notif-count');
    if (countEl) {
      countEl.textContent = count;
      countEl.style.display = count > 0 ? 'flex' : 'none';
    }

    if (notifications.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding: 24px;">
          <iconify-icon icon="solar:bell-off-bold-duotone"></iconify-icon>
          <p style="font-size: 12px;">Aucune notification</p>
        </div>
      `;
      return;
    }

    list.innerHTML = notifications.map(n => `
      <div class="notif-item">
        <div class="notif-icon" style="background:${n.iconBg}; color:${n.iconColor}">
          <iconify-icon icon="${n.icon}"></iconify-icon>
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
    if (input._piloteSearchInit) return;
    input._piloteSearchInit = true;

    // Create dropdown container
    let dropdown = document.getElementById('global-search-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'global-search-dropdown';
      dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);max-height:380px;overflow-y:auto;z-index:1000;display:none;margin-top:4px;';
      input.parentElement.style.position = 'relative';
      input.parentElement.appendChild(dropdown);
    }

    const showResults = (query) => {
      if (query.length < 1) {
        dropdown.style.display = 'none';
        return;
      }

      const chauffeurs = Store.query('chauffeurs', c =>
        `${c.prenom} ${c.nom}`.toLowerCase().includes(query) ||
        (c.telephone && c.telephone.includes(query)) ||
        (c.email && c.email.toLowerCase().includes(query))
      ).slice(0, 5);

      const vehicules = Store.query('vehicules', v =>
        `${v.marque} ${v.modele}`.toLowerCase().includes(query) ||
        (v.immatriculation && v.immatriculation.toLowerCase().includes(query))
      ).slice(0, 5);

      // Pages de navigation
      const pages = [
        { label: 'Tableau de bord', route: '/dashboard', icon: 'solar:spedometer-max-bold-duotone' },
        { label: 'Chauffeurs', route: '/chauffeurs', icon: 'solar:users-group-rounded-bold-duotone' },
        { label: 'Véhicules', route: '/vehicules', icon: 'solar:wheel-bold-duotone' },
        { label: 'Versements', route: '/versements', icon: 'solar:transfer-horizontal-bold-duotone' },
        { label: 'Planning', route: '/planning', icon: 'solar:calendar-bold-duotone' },
        { label: 'Messagerie', route: '/messagerie', icon: 'solar:chat-round-dots-bold-duotone' },
        { label: 'GPS & Conduite', route: '/gps-conduite', icon: 'solar:map-arrow-right-bold-duotone' },
        { label: 'Alertes', route: '/alertes', icon: 'solar:bell-bing-bold-duotone' },
        { label: 'Rapports', route: '/rapports', icon: 'solar:chart-bold-duotone' },
        { label: 'Garage', route: '/garage', icon: 'solar:garage-bold-duotone' },
        { label: 'Rentabilité', route: '/rentabilite', icon: 'solar:graph-up-bold-duotone' },
        { label: 'Comptabilité', route: '/comptabilite', icon: 'solar:calculator-bold-duotone' },
        { label: 'Paramètres', route: '/parametres', icon: 'solar:settings-minimalistic-bold-duotone' }
      ].filter(p => p.label.toLowerCase().includes(query));

      if (chauffeurs.length === 0 && vehicules.length === 0 && pages.length === 0) {
        dropdown.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:var(--font-size-sm);">Aucun résultat pour « ' + query + ' »</div>';
        dropdown.style.display = 'block';
        return;
      }

      let html = '';

      if (chauffeurs.length > 0) {
        html += '<div style="padding:8px 14px 4px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;">Chauffeurs</div>';
        chauffeurs.forEach(c => {
          const initials = ((c.prenom?.[0] || '') + (c.nom?.[0] || '')).toUpperCase();
          html += `<a href="#/chauffeurs/${c.id}" class="search-result-item" style="display:flex;align-items:center;gap:10px;padding:10px 14px;text-decoration:none;color:var(--text-primary);cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='var(--bg-tertiary)'" onmouseleave="this.style.background=''">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--pilote-blue);color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${initials}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:var(--font-size-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.prenom} ${c.nom}</div>
              <div style="font-size:10px;color:var(--text-muted);">${c.telephone || ''} · ${c.statut}</div>
            </div>
            <iconify-icon icon="solar:alt-arrow-right-bold" style="color:var(--text-muted);font-size:14px;"></iconify-icon>
          </a>`;
        });
      }

      if (vehicules.length > 0) {
        html += '<div style="padding:8px 14px 4px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;border-top:1px solid var(--border-color);">Véhicules</div>';
        vehicules.forEach(v => {
          html += `<a href="#/vehicules/${v.id}" class="search-result-item" style="display:flex;align-items:center;gap:10px;padding:10px 14px;text-decoration:none;color:var(--text-primary);cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='var(--bg-tertiary)'" onmouseleave="this.style.background=''">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(34,197,94,0.1);color:#22c55e;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <iconify-icon icon="solar:wheel-bold-duotone" style="font-size:16px;"></iconify-icon>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:var(--font-size-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v.marque} ${v.modele}</div>
              <div style="font-size:10px;color:var(--text-muted);">${v.immatriculation} · ${v.statut}</div>
            </div>
            <iconify-icon icon="solar:alt-arrow-right-bold" style="color:var(--text-muted);font-size:14px;"></iconify-icon>
          </a>`;
        });
      }

      if (pages.length > 0) {
        html += '<div style="padding:8px 14px 4px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.5px;border-top:1px solid var(--border-color);">Pages</div>';
        pages.forEach(p => {
          html += `<a href="#${p.route}" class="search-result-item" style="display:flex;align-items:center;gap:10px;padding:10px 14px;text-decoration:none;color:var(--text-primary);cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='var(--bg-tertiary)'" onmouseleave="this.style.background=''">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <iconify-icon icon="${p.icon}" style="font-size:16px;color:var(--text-muted);"></iconify-icon>
            </div>
            <div style="font-weight:600;font-size:var(--font-size-sm);">${p.label}</div>
            <iconify-icon icon="solar:alt-arrow-right-bold" style="color:var(--text-muted);font-size:14px;margin-left:auto;"></iconify-icon>
          </a>`;
        });
      }

      dropdown.innerHTML = html;
      dropdown.style.display = 'block';

      // Close dropdown + clear input when clicking a result
      dropdown.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          dropdown.style.display = 'none';
          input.value = '';
        });
      });
    };

    this._on('searchInput', input, 'input', Utils.debounce((e) => {
      showResults(e.target.value.trim().toLowerCase());
    }, 200));

    this._on('searchKeydown', input, 'keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        input.value = '';
        input.blur();
      }
      if (e.key === 'Enter') {
        const firstLink = dropdown.querySelector('a');
        if (firstLink) {
          firstLink.click();
        }
      }
    });

    // Focus → show results if query exists
    this._on('searchFocus', input, 'focus', () => {
      const q = input.value.trim().toLowerCase();
      if (q.length >= 1) showResults(q);
    });

    // Close dropdown on outside click
    this._on('searchOutside', document, 'click', (e) => {
      if (!input.parentElement.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  },

  _playNotifSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Double-tone notification: pleasant and brief
      const playTone = (freq, start, duration, gain) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playTone(880, 0, 0.15, 0.12);
      playTone(1175, 0.12, 0.2, 0.1);
      setTimeout(() => ctx.close(), 500);
    } catch (e) { /* Audio not supported */ }
  },

  refreshNotifications() {
    this._loadNotifications();
  }
};
