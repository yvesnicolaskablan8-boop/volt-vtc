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
  _datePreset: 'today', // 'today', 'yesterday', 'week', 'month', 'custom'
  _dateFrom: null,
  _dateTo: null,

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
    const today = new Date().toISOString().split('T')[0];
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

      <!-- Date Picker Bar -->
      <div class="yango-date-bar">
        <div class="yango-date-presets">
          <button class="yango-date-preset active" data-preset="today" onclick="YangoPage._setDatePreset('today')">
            <i class="fas fa-clock"></i> Aujourd'hui
          </button>
          <button class="yango-date-preset" data-preset="yesterday" onclick="YangoPage._setDatePreset('yesterday')">
            <i class="fas fa-calendar-minus"></i> Hier
          </button>
          <button class="yango-date-preset" data-preset="week" onclick="YangoPage._setDatePreset('week')">
            <i class="fas fa-calendar-week"></i> Cette semaine
          </button>
          <button class="yango-date-preset" data-preset="month" onclick="YangoPage._setDatePreset('month')">
            <i class="fas fa-calendar-alt"></i> Ce mois
          </button>
          <button class="yango-date-preset" data-preset="custom" onclick="YangoPage._toggleCustomDates()">
            <i class="fas fa-calendar-days"></i> Personnalise
          </button>
        </div>
        <div class="yango-date-custom" id="yp-date-custom" style="display:none;">
          <div class="yango-date-inputs">
            <label>
              <span>Du</span>
              <input type="date" id="yp-date-from" class="yango-date-input" value="${today}" max="${today}">
            </label>
            <label>
              <span>Au</span>
              <input type="date" id="yp-date-to" class="yango-date-input" value="${today}" max="${today}">
            </label>
            <button class="btn btn-sm yango-date-apply" onclick="YangoPage._applyCustomDates()">
              <i class="fas fa-check"></i> Appliquer
            </button>
          </div>
        </div>
        <div class="yango-date-label" id="yp-date-label">
          <i class="fas fa-calendar-check"></i>
          <span id="yp-date-label-text">Aujourd'hui</span>
        </div>
      </div>

      <!-- Live indicator -->
      <div class="yango-section" style="padding:0;">
        <div class="yango-section-header" style="border-bottom:none;padding:12px var(--space-lg);">
          <div class="yango-section-title">
            <img src="https://avatars.githubusercontent.com/u/36020155?s=20" alt="" class="yango-logo-icon" onerror="this.style.display='none'">
            <span id="yp-period-label">Donnees en temps reel</span>
            <span class="yango-badge-live" id="yp-live-badge">EN DIRECT</span>
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
          <div class="kpi-label" id="yp-ca-label">CA du jour</div>
          <div class="kpi-trend neutral" id="yp-ca-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
        <div class="kpi-card yango-kpi">
          <div class="kpi-icon yango-icon-blue"><i class="fas fa-taxi"></i></div>
          <div class="kpi-value" id="yp-courses-today"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-courses-label">Courses aujourd'hui</div>
          <div class="kpi-trend neutral" id="yp-courses-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
        <div class="kpi-card yango-kpi">
          <div class="kpi-icon yango-icon-purple"><i class="fas fa-percentage"></i></div>
          <div class="kpi-value" id="yp-commission"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-commission-label">Commission Yango</div>
          <div class="kpi-trend neutral" id="yp-commission-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
      </div>

      <!-- KPIs Row 2: Period totals + Activity -->
      <div class="grid-4" style="margin-top:var(--space-sm);">
        <div class="kpi-card">
          <div class="kpi-icon"><i class="fas fa-calendar-alt"></i></div>
          <div class="kpi-value" id="yp-ca-month"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-ca-month-label">CA du mois</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><i class="fas fa-hand-holding-dollar"></i></div>
          <div class="kpi-value" id="yp-commission-month"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-commission-month-label">Commission partenaire</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><i class="fas fa-road"></i></div>
          <div class="kpi-value" id="yp-courses-month"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-courses-month-label">Courses du mois</div>
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
          <span class="card-title" id="yp-top-title"><i class="fas fa-trophy"></i> Top chauffeurs du jour</span>
        </div>
        <div id="yp-top-drivers">
          <div class="yango-loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
        </div>
      </div>

      <!-- Synchronisation Yango → Volt -->
      <div class="card" style="margin-top:var(--space-lg);border-top:3px solid #FC4C02;">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-sync-alt" style="color:#FC4C02"></i> Synchronisation Yango → Volt</span>
          <span class="badge" id="yp-sync-status-badge">--</span>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:var(--space-md);">
          Recupere automatiquement les courses et l'activite de chaque chauffeur depuis Yango, puis met a jour les scores de conduite et le temps d'activite dans Volt. La sync automatique s'execute chaque nuit a 2h.
        </div>
        <div style="display:flex;gap:var(--space-sm);align-items:center;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="YangoPage._triggerSync()" id="yp-sync-btn">
            <i class="fas fa-play"></i> Lancer la sync maintenant
          </button>
          <button class="btn btn-secondary" onclick="YangoPage._triggerSync('yesterday')" id="yp-sync-btn-hier">
            <i class="fas fa-calendar-minus"></i> Sync hier
          </button>
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:var(--font-size-xs);color:var(--text-muted);">Date :</label>
            <input type="date" class="form-control" id="yp-sync-date" style="width:auto;font-size:var(--font-size-xs);padding:4px 8px;" max="${new Date().toISOString().split('T')[0]}">
            <button class="btn btn-sm btn-outline" onclick="YangoPage._triggerSyncDate()">
              <i class="fas fa-sync"></i>
            </button>
          </div>
        </div>
        <div id="yp-sync-result" style="margin-top:var(--space-md);display:none;"></div>
      </div>

      <!-- Commission info -->
      <div style="margin-top:var(--space-md);padding:10px 14px;border-radius:var(--radius-sm);background:var(--bg-tertiary);font-size:var(--font-size-xs);color:var(--text-muted);display:flex;align-items:center;gap:8px;">
        <i class="fas fa-info-circle" style="color:#FC4C02"></i>
        Le chiffre d'affaires est calcule a partir des transactions reelles (especes + carte). La commission Yango et la commission partenaire sont issues des donnees financieres de la plateforme. Rafraichissement automatique toutes les 2 minutes.
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

      // Build date range from current selection
      const dateRange = this._getDateRange();

      const stats = await Store.getYangoStats(this._selectedWorkRules, dateRange);

      if (!stats || stats.error) {
        this._showError(stats?.details || stats?.error || 'Erreur de connexion');
        return;
      }

      this._data = stats;
      this._updatePeriodLabels();
      this._renderKPIs(stats);
      this._renderDriversTable(stats.chauffeurs?.liste || []);
      this._renderRecentCourses(stats.courses?.recentes || []);
      this._renderTopDrivers(stats.topChauffeurs || []);

      // Update sync status badge
      try {
        const syncStatus = await Store.getYangoSyncStatus();
        const badge = document.getElementById('yp-sync-status-badge');
        if (badge && syncStatus) {
          if (syncStatus.running && syncStatus.enabled) {
            badge.textContent = 'CRON actif';
            badge.className = 'badge badge-success';
          } else {
            badge.textContent = 'CRON inactif';
            badge.className = 'badge badge-warning';
          }
          if (syncStatus.lastSyncDate) {
            badge.textContent += ` (${syncStatus.lastSyncDate})`;
          }
        }
      } catch (e) { /* ignore */ }

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

  // =================== DATE PICKER ===================

  _getDateRange() {
    if (this._datePreset === 'today') return null; // default behavior
    if (this._datePreset === 'custom' && this._dateFrom && this._dateTo) {
      return { from: this._dateFrom, to: this._dateTo };
    }

    const now = new Date();
    let from, to;

    switch (this._datePreset) {
      case 'yesterday': {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        from = new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString();
        to = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59).toISOString();
        break;
      }
      case 'week': {
        const day = now.getDay() || 7; // Monday = 1
        const monday = new Date(now);
        monday.setDate(now.getDate() - day + 1);
        from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).toISOString();
        to = now.toISOString();
        break;
      }
      case 'month': {
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        to = now.toISOString();
        break;
      }
      default:
        return null;
    }

    return { from, to };
  },

  _setDatePreset(preset) {
    this._datePreset = preset;

    // Update active button
    document.querySelectorAll('.yango-date-preset').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === preset);
    });

    // Hide custom date inputs unless "custom"
    const customPanel = document.getElementById('yp-date-custom');
    if (customPanel) {
      customPanel.style.display = preset === 'custom' ? 'flex' : 'none';
    }

    // If not custom, reload immediately
    if (preset !== 'custom') {
      this._dateFrom = null;
      this._dateTo = null;
      this._loadData();
    }
  },

  _toggleCustomDates() {
    const customPanel = document.getElementById('yp-date-custom');
    const isCustom = this._datePreset === 'custom';

    if (isCustom) {
      // Toggle off — go back to today
      this._setDatePreset('today');
    } else {
      this._datePreset = 'custom';
      // Update active button
      document.querySelectorAll('.yango-date-preset').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === 'custom');
      });
      if (customPanel) customPanel.style.display = 'flex';
    }
  },

  _applyCustomDates() {
    const fromInput = document.getElementById('yp-date-from');
    const toInput = document.getElementById('yp-date-to');
    if (!fromInput || !toInput) return;

    const fromDate = new Date(fromInput.value);
    const toDate = new Date(toInput.value);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      Toast.warning('Veuillez selectionner des dates valides');
      return;
    }

    if (fromDate > toDate) {
      Toast.warning('La date de debut doit etre anterieure a la date de fin');
      return;
    }

    // Set from = start of day, to = end of day
    this._dateFrom = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).toISOString();
    this._dateTo = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59).toISOString();

    this._loadData();
  },

  _getDateLabel() {
    const opts = { day: '2-digit', month: 'short', year: 'numeric' };
    switch (this._datePreset) {
      case 'today': return "Aujourd'hui";
      case 'yesterday': return 'Hier';
      case 'week': return 'Cette semaine';
      case 'month': return 'Ce mois';
      case 'custom': {
        if (this._dateFrom && this._dateTo) {
          const from = new Date(this._dateFrom).toLocaleDateString('fr-FR', opts);
          const to = new Date(this._dateTo).toLocaleDateString('fr-FR', opts);
          return from === to ? from : `${from} — ${to}`;
        }
        return 'Personnalise';
      }
      default: return "Aujourd'hui";
    }
  },

  _updatePeriodLabels() {
    const isToday = this._datePreset === 'today';
    const label = this._getDateLabel();
    const periodSuffix = isToday ? 'du jour' : `(${label})`;
    const coursesSuffix = isToday ? "aujourd'hui" : `(${label})`;

    // Update date label bar
    const labelText = document.getElementById('yp-date-label-text');
    if (labelText) labelText.textContent = label;

    // Update live badge visibility
    const liveBadge = document.getElementById('yp-live-badge');
    if (liveBadge) {
      liveBadge.style.display = isToday ? '' : 'none';
    }

    // Update period label
    const periodLabel = document.getElementById('yp-period-label');
    if (periodLabel) {
      periodLabel.textContent = isToday ? 'Donnees en temps reel' : `Donnees du ${label}`;
    }

    // Update KPI labels
    const setLabel = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setLabel('yp-ca-label', `CA ${periodSuffix}`);
    setLabel('yp-courses-label', `Courses ${coursesSuffix}`);
    setLabel('yp-commission-label', `Commission Yango`);

    // Row 2 labels
    if (isToday) {
      setLabel('yp-ca-month-label', 'CA du mois');
      setLabel('yp-commission-month-label', 'Commission partenaire du mois');
      setLabel('yp-courses-month-label', 'Courses du mois');
    } else {
      setLabel('yp-ca-month-label', `CA total (${label})`);
      setLabel('yp-commission-month-label', `Commission partenaire`);
      setLabel('yp-courses-month-label', `Total courses`);
    }

    // Top chauffeurs title
    const topTitle = document.getElementById('yp-top-title');
    if (topTitle) {
      topTitle.innerHTML = isToday
        ? '<i class="fas fa-trophy"></i> Top chauffeurs du jour'
        : `<i class="fas fa-trophy"></i> Top chauffeurs (${label})`;
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

    // Revenue from real transactions (cash + card)
    const caToday = stats.chiffreAffaires?.aujourd_hui || 0;
    const caMonth = stats.chiffreAffaires?.mois || 0;
    const cashToday = stats.chiffreAffaires?.cash?.aujourd_hui || 0;
    const cardToday = stats.chiffreAffaires?.card?.aujourd_hui || 0;
    const cashMonth = stats.chiffreAffaires?.cash?.mois || 0;
    const cardMonth = stats.chiffreAffaires?.card?.mois || 0;

    const coursesToday = stats.courses?.aujourd_hui || 0;
    const coursesMonth = stats.courses?.mois || 0;
    const enCours = stats.courses?.enCours || 0;
    const terminees = stats.courses?.terminees || 0;
    const annulees = stats.courses?.annulees || 0;

    // Real commissions from Yango transactions
    const commYangoToday = stats.commissionYango?.aujourd_hui || 0;
    const commYangoMonth = stats.commissionYango?.mois || 0;
    const commPartToday = stats.commissionPartenaire?.aujourd_hui || 0;
    const commPartMonth = stats.commissionPartenaire?.mois || 0;

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

    // CA with cash/card breakdown
    setVal('yp-ca-today', Utils.formatCurrency(caToday));
    setHtml('yp-ca-detail', `
      <i class="fas fa-money-bill-wave" style="color:#22c55e;font-size:9px"></i> ${Utils.formatCurrency(cashToday)}
      <span style="margin:0 3px">&bull;</span>
      <i class="fas fa-credit-card" style="color:#3b82f6;font-size:9px"></i> ${Utils.formatCurrency(cardToday)}
    `);

    setVal('yp-courses-today', coursesToday);
    const courseParts = [];
    if (enCours > 0) courseParts.push(`<span class="yango-dot yango-dot-green"></span> ${enCours} en cours`);
    if (terminees > 0) courseParts.push(`<i class="fas fa-check" style="color:#22c55e;font-size:9px"></i> ${terminees} ok`);
    if (annulees > 0) courseParts.push(`<i class="fas fa-times" style="color:#ef4444;font-size:9px"></i> ${annulees} ann.`);
    if (courseParts.length === 0) courseParts.push(`<i class="fas fa-chart-line"></i> ${coursesMonth} ce mois`);
    setHtml('yp-courses-detail', courseParts.join(' <span style="margin:0 3px">&bull;</span> '));

    // Commission Yango (real from transactions)
    setVal('yp-commission', Utils.formatCurrency(commYangoToday));
    setHtml('yp-commission-detail', `<i class="fas fa-calendar"></i> ${Utils.formatCurrency(commYangoMonth)} ce mois`);

    // Row 2
    setVal('yp-ca-month', Utils.formatCurrency(caMonth));
    setVal('yp-commission-month', Utils.formatCurrency(commPartMonth));
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
      const emptyMsg = this._datePreset === 'today' ? "Aucune course aujourd'hui" : `Aucune course pour cette periode`;
      container.innerHTML = `<div class="yango-empty"><i class="fas fa-car-side"></i><span>${emptyMsg}</span></div>`;
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
          const cashVal = d.cash || 0;
          const cardVal = d.card || 0;
          const detailParts = [];
          if (cashVal > 0) detailParts.push(`<i class="fas fa-money-bill-wave" style="color:#22c55e;font-size:9px"></i> ${Utils.formatCurrency(cashVal)}`);
          if (cardVal > 0) detailParts.push(`<i class="fas fa-credit-card" style="color:#3b82f6;font-size:9px"></i> ${Utils.formatCurrency(cardVal)}`);
          if (d.courses > 0) detailParts.push(`${d.courses} course${d.courses > 1 ? 's' : ''}`);
          return `
            <div class="yango-top-item">
              <span class="yango-top-rank">${medal}</span>
              <div class="avatar-sm">${(d.nom?.[0] || '?').toUpperCase()}</div>
              <div class="yango-top-info">
                <div class="yango-top-name">${d.nom || 'Inconnu'}</div>
                <div class="yango-top-meta">${detailParts.join(' &bull; ') || '--'}</div>
              </div>
              <div class="yango-top-amount">${Utils.formatCurrency(d.ca)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  // =================== YANGO SYNC ===================

  async _triggerSync(datePreset = null) {
    const syncBtn = document.getElementById('yp-sync-btn');
    const resultDiv = document.getElementById('yp-sync-result');
    if (syncBtn) { syncBtn.disabled = true; syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Synchronisation...'; }
    if (resultDiv) { resultDiv.style.display = 'block'; resultDiv.innerHTML = '<div class="yango-loading"><i class="fas fa-spinner fa-spin"></i> Recuperation des donnees Yango en cours...</div>'; }

    let syncDate = null;
    if (datePreset === 'yesterday') {
      const d = new Date(); d.setDate(d.getDate() - 1);
      syncDate = d.toISOString().split('T')[0];
    }

    const result = await Store.triggerYangoSync(syncDate);
    this._renderSyncResult(result);

    if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = '<i class="fas fa-play"></i> Lancer la sync maintenant'; }
  },

  async _triggerSyncDate() {
    const dateInput = document.getElementById('yp-sync-date');
    if (!dateInput || !dateInput.value) { Toast.warning('Selectionnez une date'); return; }

    const syncBtn = document.getElementById('yp-sync-btn');
    const resultDiv = document.getElementById('yp-sync-result');
    if (syncBtn) syncBtn.disabled = true;
    if (resultDiv) { resultDiv.style.display = 'block'; resultDiv.innerHTML = '<div class="yango-loading"><i class="fas fa-spinner fa-spin"></i> Synchronisation du ' + dateInput.value + '...</div>'; }

    const result = await Store.triggerYangoSync(dateInput.value);
    this._renderSyncResult(result);

    if (syncBtn) syncBtn.disabled = false;
  },

  _renderSyncResult(result) {
    const resultDiv = document.getElementById('yp-sync-result');
    if (!resultDiv) return;

    if (result.error) {
      resultDiv.innerHTML = `
        <div style="padding:12px;border-radius:var(--radius-sm);background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#ef4444;font-size:var(--font-size-xs);">
          <i class="fas fa-exclamation-triangle"></i> Erreur: ${result.error}${result.details ? ' — ' + result.details : ''}
        </div>
      `;
      return;
    }

    const details = result.details || [];
    const okCount = details.filter(d => d.status === 'ok').length;
    const skipCount = details.filter(d => d.status === 'skip').length;
    const errCount = details.filter(d => d.status === 'error').length;

    resultDiv.innerHTML = `
      <div style="padding:14px;border-radius:var(--radius-sm);background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <i class="fas fa-check-circle" style="color:#22c55e;font-size:1rem;"></i>
          <span style="font-weight:600;font-size:var(--font-size-sm);">Synchronisation terminée — ${result.date}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px;">
          <div style="text-align:center;padding:8px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
            <div style="font-size:1.1rem;font-weight:700;">${result.matched || 0}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Chauffeurs matches</div>
          </div>
          <div style="text-align:center;padding:8px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
            <div style="font-size:1.1rem;font-weight:700;">${result.totalOrders || 0}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Courses Yango</div>
          </div>
          <div style="text-align:center;padding:8px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
            <div style="font-size:1.1rem;font-weight:700;color:#22c55e;">${okCount}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Mis a jour</div>
          </div>
          <div style="text-align:center;padding:8px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
            <div style="font-size:1.1rem;font-weight:700;color:${errCount > 0 ? '#ef4444' : 'var(--text-primary)'};">${errCount}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Erreurs</div>
          </div>
        </div>

        ${details.filter(d => d.status === 'ok').length > 0 ? `
          <div style="font-size:var(--font-size-xs);font-weight:600;margin-bottom:6px;color:var(--text-secondary);">Detail par chauffeur :</div>
          <div style="max-height:200px;overflow-y:auto;">
            <table style="width:100%;font-size:var(--font-size-xs);border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-color);text-align:left;">
                  <th style="padding:4px 8px;">Chauffeur</th>
                  <th style="padding:4px 8px;">Courses</th>
                  <th style="padding:4px 8px;">Activite</th>
                  <th style="padding:4px 8px;">Score</th>
                  <th style="padding:4px 8px;">Revenu</th>
                </tr>
              </thead>
              <tbody>
                ${details.filter(d => d.status === 'ok').map(d => `
                  <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:4px 8px;font-weight:500;">${d.chauffeur}</td>
                    <td style="padding:4px 8px;">${d.courses || 0}</td>
                    <td style="padding:4px 8px;">${d.tempsActivite ? Math.floor(d.tempsActivite/60) + 'h' + String(d.tempsActivite%60).padStart(2,'0') : '--'}</td>
                    <td style="padding:4px 8px;font-weight:600;color:${d.scoreActivite >= 70 ? '#22c55e' : d.scoreActivite >= 50 ? '#f59e0b' : '#ef4444'};">${d.scoreActivite}/100</td>
                    <td style="padding:4px 8px;">${(d.revenu || 0).toLocaleString('fr-FR')} F</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        ${result.unmatched > 0 ? `
          <div style="margin-top:10px;padding:8px 10px;border-radius:var(--radius-sm);background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);font-size:var(--font-size-xs);color:#b45309;">
            <i class="fas fa-exclamation-triangle"></i> <strong>${result.unmatched} chauffeur(s) Yango non matché(s)</strong> : ${(result.unmatchedDrivers || []).join(', ')}
            <br><span style="font-size:10px;color:var(--text-muted);">Verifiez que les noms/prenoms correspondent ou ajoutez manuellement le yangoDriverId dans la fiche chauffeur.</span>
          </div>
        ` : ''}
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
