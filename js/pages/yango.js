/**
 * YangoPage - Dedicated Yango Fleet dashboard
 * Real-time monitoring of drivers, courses, revenue, and commission
 */
const YangoPage = {
  _data: null,
  _workRules: [],
  _selectedWorkRules: [],
  _refreshInterval: null,
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._loadData();
    // Auto-refresh every 2 minutes
    this._refreshInterval = setInterval(() => this._loadData(), 120000);
  },

  destroy() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _template() {
    return `
      <div class="page-header">
        <h1><i class="fas fa-taxi" style="color:#FC4C02"></i> Yango Fleet</h1>
        <div class="page-actions">
          <div class="yango-filter-group">
            <select id="yp-work-rule-select" class="yango-filter-select" onchange="YangoPage._onWorkRuleChange()" title="Filtrer par categorie">
              <option value="">Toutes categories</option>
            </select>
          </div>
          <button class="btn btn-secondary" onclick="YangoPage._loadData()" id="yp-refresh-btn">
            <i class="fas fa-sync-alt"></i> Actualiser
          </button>
        </div>
      </div>

      <!-- Live indicator -->
      <div class="yango-section" style="padding:0;">
        <div class="yango-section-header" style="border-bottom:none;padding:12px var(--space-lg);">
          <div class="yango-section-title">
            <img src="https://avatars.githubusercontent.com/u/36020155?s=20" alt="" class="yango-logo-icon" onerror="this.style.display='none'">
            <span>Donnees en temps reel</span>
            <span class="yango-badge-live">EN DIRECT</span>
          </div>
          <span class="yango-last-update" id="yp-last-update"></span>
        </div>
      </div>

      <!-- KPIs Row 1: Main metrics -->
      <div class="grid-4" style="margin-top:var(--space-md);">
        <div class="kpi-card yango-kpi">
          <div class="kpi-icon yango-icon-green"><i class="fas fa-user-check"></i></div>
          <div class="kpi-value" id="yp-drivers-total"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">Chauffeurs en service</div>
          <div class="kpi-trend neutral" id="yp-drivers-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
        <div class="kpi-card yango-kpi">
          <div class="kpi-icon yango-icon-orange"><i class="fas fa-wallet"></i></div>
          <div class="kpi-value" id="yp-ca-today"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">CA du jour</div>
          <div class="kpi-trend neutral" id="yp-ca-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
        <div class="kpi-card yango-kpi">
          <div class="kpi-icon yango-icon-blue"><i class="fas fa-taxi"></i></div>
          <div class="kpi-value" id="yp-courses-today"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">Courses aujourd'hui</div>
          <div class="kpi-trend neutral" id="yp-courses-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
        <div class="kpi-card yango-kpi">
          <div class="kpi-icon yango-icon-purple"><i class="fas fa-hand-holding-dollar"></i></div>
          <div class="kpi-value" id="yp-commission"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">Commission Yango (3%)</div>
          <div class="kpi-trend neutral" id="yp-commission-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
      </div>

      <!-- KPIs Row 2: Monthly + Activity -->
      <div class="grid-4" style="margin-top:var(--space-sm);">
        <div class="kpi-card">
          <div class="kpi-icon"><i class="fas fa-calendar-alt"></i></div>
          <div class="kpi-value" id="yp-ca-month"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">CA du mois</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><i class="fas fa-coins"></i></div>
          <div class="kpi-value" id="yp-commission-month"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">Commission du mois</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><i class="fas fa-road"></i></div>
          <div class="kpi-value" id="yp-courses-month"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">Courses du mois</div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-icon"><i class="fas fa-clock"></i></div>
          <div class="kpi-value" id="yp-activity-time"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">Temps d'activite moyen</div>
        </div>
      </div>

      <!-- Content: Drivers + Courses side by side -->
      <div class="yango-content-grid" style="margin-top:var(--space-lg);">
        <!-- Drivers list -->
        <div class="card yango-drivers-card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-users"></i> Chauffeurs en service</span>
            <span class="badge badge-info" id="yp-drivers-count">--</span>
          </div>
          <div id="yp-drivers-table">
            <div class="yango-loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
          </div>
        </div>

        <!-- Recent courses -->
        <div class="card yango-courses-card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-road"></i> Courses recentes</span>
            <span class="badge badge-info" id="yp-courses-count">--</span>
          </div>
          <div id="yp-courses-list">
            <div class="yango-loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
          </div>
        </div>
      </div>

      <!-- Top drivers -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-trophy"></i> Top chauffeurs du jour</span>
        </div>
        <div id="yp-top-drivers">
          <div class="yango-loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
        </div>
      </div>

      <!-- Commission info -->
      <div style="margin-top:var(--space-md);padding:10px 14px;border-radius:var(--radius-sm);background:var(--bg-tertiary);font-size:var(--font-size-xs);color:var(--text-muted);display:flex;align-items:center;gap:8px;">
        <i class="fas fa-info-circle" style="color:#FC4C02"></i>
        Yango vous reverse 3% du chiffre d'affaires global genere par votre flotte. Les donnees se rafraichissent automatiquement toutes les 2 minutes.
      </div>
    `;
  },

  // =================== DATA LOADING ===================

  async _loadData() {
    const refreshBtn = document.getElementById('yp-refresh-btn');
    if (refreshBtn) { refreshBtn.classList.add('spinning'); refreshBtn.disabled = true; }

    try {
      // Load work rules on first call
      if (this._workRules.length === 0) {
        await this._loadWorkRules();
      }

      const stats = await Store.getYangoStats(this._selectedWorkRules);

      if (!stats || stats.error) {
        this._showError(stats?.details || stats?.error || 'Erreur de connexion');
        return;
      }

      this._data = stats;
      this._renderKPIs(stats);
      this._renderDriversTable(stats.chauffeurs?.liste || []);
      this._renderRecentCourses(stats.courses?.recentes || []);
      this._renderTopDrivers(stats.topChauffeurs || []);

      // Update timestamp
      const updateEl = document.getElementById('yp-last-update');
      if (updateEl) {
        const now = new Date();
        updateEl.textContent = `Derniere mise a jour: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      }
    } catch (err) {
      console.error('YangoPage load error:', err);
      this._showError('Impossible de charger les donnees Yango');
    } finally {
      if (refreshBtn) { refreshBtn.classList.remove('spinning'); refreshBtn.disabled = false; }
    }
  },

  // =================== WORK RULES ===================

  async _loadWorkRules() {
    try {
      const data = await Store.getYangoWorkRules();
      if (data && data.work_rules) {
        this._workRules = data.work_rules;
        this._populateWorkRuleSelect();
      }
    } catch (e) {
      console.warn('YangoPage: Failed to load work rules:', e);
    }
  },

  _populateWorkRuleSelect() {
    const select = document.getElementById('yp-work-rule-select');
    if (!select) return;

    select.innerHTML = '<option value="">Toutes categories</option>';
    this._workRules.forEach(rule => {
      const option = document.createElement('option');
      option.value = rule.id;
      option.textContent = rule.name;
      if (this._selectedWorkRules.includes(rule.id)) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  },

  _onWorkRuleChange() {
    const select = document.getElementById('yp-work-rule-select');
    if (!select) return;
    const value = select.value;
    this._selectedWorkRules = value ? [value] : [];
    this._loadData();
  },

  // =================== RENDER KPIs ===================

  _renderKPIs(stats) {
    const online = stats.chauffeurs?.enLigne || 0;
    const total = stats.chauffeurs?.total || 0;
    const busy = stats.chauffeurs?.occupes || 0;
    const offline = total - online - busy;
    const caToday = stats.chiffreAffaires?.aujourd_hui || 0;
    const caMonth = stats.chiffreAffaires?.mois || 0;
    const coursesToday = stats.courses?.aujourd_hui || 0;
    const coursesMonth = stats.courses?.mois || 0;
    const enCours = stats.courses?.enCours || 0;
    const terminees = stats.courses?.terminees || 0;
    const annulees = stats.courses?.annulees || 0;
    const commToday = stats.commissionYango?.aujourd_hui || 0;
    const commMonth = stats.commissionYango?.mois || 0;
    const tempsActivite = stats.tempsActiviteMoyen || 0;

    // Row 1
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    setVal('yp-drivers-total', total);
    setHtml('yp-drivers-detail', `
      <span class="yango-dot yango-dot-green"></span> ${online} dispo
      <span style="margin:0 4px">&bull;</span>
      <span class="yango-dot yango-dot-yellow"></span> ${busy} occup.
      <span style="margin:0 4px">&bull;</span>
      <span class="yango-dot yango-dot-red"></span> ${offline} hors ligne
    `);

    setVal('yp-ca-today', Utils.formatCurrency(caToday));
    setHtml('yp-ca-detail', `<i class="fas fa-calendar"></i> ${Utils.formatCurrency(caMonth)} ce mois`);

    setVal('yp-courses-today', coursesToday);
    const courseParts = [];
    if (enCours > 0) courseParts.push(`<span class="yango-dot yango-dot-green"></span> ${enCours} en cours`);
    if (terminees > 0) courseParts.push(`<i class="fas fa-check" style="color:#22c55e;font-size:9px"></i> ${terminees} ok`);
    if (annulees > 0) courseParts.push(`<i class="fas fa-times" style="color:#ef4444;font-size:9px"></i> ${annulees} ann.`);
    if (courseParts.length === 0) courseParts.push(`<i class="fas fa-chart-line"></i> ${coursesMonth} ce mois`);
    setHtml('yp-courses-detail', courseParts.join(' <span style="margin:0 3px">&bull;</span> '));

    setVal('yp-commission', Utils.formatCurrency(commMonth));
    setHtml('yp-commission-detail', `<i class="fas fa-calendar-day"></i> ${Utils.formatCurrency(commToday)} aujourd'hui`);

    // Row 2
    setVal('yp-ca-month', Utils.formatCurrency(caMonth));
    setVal('yp-commission-month', Utils.formatCurrency(commMonth));
    setVal('yp-courses-month', coursesMonth);
    setVal('yp-activity-time', tempsActivite > 0 ? `${tempsActivite} min` : '--');
  },

  // =================== RENDER DRIVERS TABLE ===================

  _renderDriversTable(drivers) {
    const container = document.getElementById('yp-drivers-table');
    const countBadge = document.getElementById('yp-drivers-count');
    if (!container) return;

    if (countBadge) countBadge.textContent = drivers.length;

    if (!drivers || drivers.length === 0) {
      container.innerHTML = '<div class="yango-empty"><i class="fas fa-user-slash"></i><span>Aucun chauffeur en service</span></div>';
      return;
    }

    const statusOrder = { en_ligne: 0, occupe: 1, hors_ligne: 2 };
    const sorted = [...drivers].sort((a, b) => (statusOrder[a.statut] || 2) - (statusOrder[b.statut] || 2));

    container.innerHTML = `
      <div class="yango-drivers-list">
        ${sorted.slice(0, 20).map(d => {
          const statusConfig = {
            en_ligne: { label: 'En ligne', class: 'yango-status-online' },
            occupe: { label: 'Occupe', class: 'yango-status-busy' },
            hors_ligne: { label: 'Hors ligne', class: 'yango-status-offline' }
          };
          const status = statusConfig[d.statut] || statusConfig.hors_ligne;
          const lastUpdate = d.derniereMaj
            ? new Date(d.derniereMaj).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
            : '--';
          const balanceVal = parseFloat(d.balance || 0);
          const balanceClass = balanceVal >= 0 ? 'yango-balance-positive' : 'yango-balance-negative';

          return `
            <div class="yango-driver-row">
              <div class="yango-driver-info">
                <div class="avatar-sm">${(d.nom?.[0] || '?').toUpperCase()}</div>
                <div>
                  <div class="yango-driver-name">${d.nom || 'Inconnu'}</div>
                  <div class="yango-driver-meta">${lastUpdate}</div>
                </div>
              </div>
              <div class="yango-driver-right">
                <span class="yango-status ${status.class}">
                  <i class="fas fa-circle"></i> ${status.label}
                </span>
                <span class="yango-driver-balance ${balanceClass}">${balanceVal.toLocaleString('fr-FR')} F</span>
              </div>
            </div>
          `;
        }).join('')}
        ${sorted.length > 20 ? `<div class="yango-more-link">+ ${sorted.length - 20} autres chauffeurs</div>` : ''}
      </div>
    `;
  },

  // =================== RENDER RECENT COURSES ===================

  _renderRecentCourses(courses) {
    const container = document.getElementById('yp-courses-list');
    const countBadge = document.getElementById('yp-courses-count');
    if (!container) return;

    if (countBadge) countBadge.textContent = courses.length;

    if (!courses || courses.length === 0) {
      container.innerHTML = '<div class="yango-empty"><i class="fas fa-car-side"></i><span>Aucune course aujourd\'hui</span></div>';
      return;
    }

    const statusIcons = {
      en_route: { icon: 'fa-car', color: '#3b82f6' },
      en_attente: { icon: 'fa-hourglass-half', color: '#f59e0b' },
      en_course: { icon: 'fa-taxi', color: '#22c55e' },
      terminee: { icon: 'fa-check-circle', color: '#22c55e' },
      annulee: { icon: 'fa-times-circle', color: '#ef4444' },
      recherche: { icon: 'fa-search', color: '#8b5cf6' },
      assignee: { icon: 'fa-user-check', color: '#06b6d4' }
    };

    container.innerHTML = `
      <div class="yango-courses-list-inner">
        ${courses.map(c => {
          const st = statusIcons[c.statut] || { icon: 'fa-circle', color: '#6b7280' };
          const heure = c.heure ? new Date(c.heure).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--';
          const montant = c.montant > 0 ? Utils.formatCurrency(c.montant) : '--';

          return `
            <div class="yango-course-item">
              <div class="yango-course-icon" style="color:${st.color}">
                <i class="fas ${st.icon}"></i>
              </div>
              <div class="yango-course-info">
                <div class="yango-course-driver">${c.chauffeur || '--'}</div>
                <div class="yango-course-route">
                  ${c.depart ? `<span><i class="fas fa-map-pin" style="color:#22c55e;font-size:9px"></i> ${c.depart.substring(0, 40)}${c.depart.length > 40 ? '...' : ''}</span>` : ''}
                  ${c.arrivee ? `<span><i class="fas fa-flag-checkered" style="color:#ef4444;font-size:9px"></i> ${c.arrivee.substring(0, 40)}${c.arrivee.length > 40 ? '...' : ''}</span>` : ''}
                </div>
              </div>
              <div class="yango-course-right">
                <div class="yango-course-amount">${montant}</div>
                <div class="yango-course-time">${heure}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  // =================== RENDER TOP DRIVERS ===================

  _renderTopDrivers(topDrivers) {
    const container = document.getElementById('yp-top-drivers');
    if (!container) return;

    if (!topDrivers || topDrivers.length === 0) {
      container.innerHTML = '<div class="yango-empty"><i class="fas fa-trophy"></i><span>Aucune donnee disponible</span></div>';
      return;
    }

    container.innerHTML = `
      <div class="yango-top-list">
        ${topDrivers.map((d, i) => {
          const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
          const medal = i < 3 ? medals[i] : `${i + 1}.`;
          return `
            <div class="yango-top-item">
              <span class="yango-top-rank">${medal}</span>
              <div class="avatar-sm">${(d.nom?.[0] || '?').toUpperCase()}</div>
              <div class="yango-top-info">
                <div class="yango-top-name">${d.nom || 'Inconnu'}</div>
                <div class="yango-top-meta">${d.courses} course${d.courses > 1 ? 's' : ''}</div>
              </div>
              <div class="yango-top-amount">${Utils.formatCurrency(d.ca)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  // =================== ERROR ===================

  _showError(message) {
    // Clear KPIs
    ['yp-drivers-total', 'yp-ca-today', 'yp-courses-today', 'yp-commission',
     'yp-ca-month', 'yp-commission-month', 'yp-courses-month', 'yp-activity-time'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '--';
    });
    ['yp-drivers-detail', 'yp-ca-detail', 'yp-courses-detail', 'yp-commission-detail'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });

    const driversContainer = document.getElementById('yp-drivers-table');
    if (driversContainer) {
      driversContainer.innerHTML = `
        <div class="yango-error">
          <i class="fas fa-exclamation-triangle"></i>
          <span>${message}</span>
          <button class="btn btn-sm btn-secondary" onclick="YangoPage._loadData()" style="margin-top:8px;">
            <i class="fas fa-redo"></i> Reessayer
          </button>
        </div>
      `;
    }
  }
};
