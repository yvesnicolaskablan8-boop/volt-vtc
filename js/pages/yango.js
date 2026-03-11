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
        <h1><iconify-icon icon="solar:bus-bold-duotone" style="color:#FC4C02"></iconify-icon> Yango Fleet</h1>
        <div class="page-actions">
          <div class="yango-filter-group">
            <select id="yp-work-rule-select" class="yango-filter-select" onchange="YangoPage._onWorkRuleChange()" title="Filtrer par categorie">
              <option value="">Toutes categories</option>
            </select>
          </div>
          <button class="btn btn-secondary" onclick="YangoPage._loadData()" id="yp-refresh-btn">
            <iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Actualiser
          </button>
        </div>
      </div>

      <!-- Date Picker Bar -->
      <div class="yango-date-bar">
        <div class="yango-date-presets">
          <button class="yango-date-preset active" data-preset="today" onclick="YangoPage._setDatePreset('today')">
            <iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> Aujourd'hui
          </button>
          <button class="yango-date-preset" data-preset="yesterday" onclick="YangoPage._setDatePreset('yesterday')">
            <iconify-icon icon="solar:calendar-minimalistic-bold-duotone"></iconify-icon> Hier
          </button>
          <button class="yango-date-preset" data-preset="week" onclick="YangoPage._setDatePreset('week')">
            <iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Cette semaine
          </button>
          <button class="yango-date-preset" data-preset="month" onclick="YangoPage._setDatePreset('month')">
            <iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Ce mois
          </button>
          <button class="yango-date-preset" data-preset="custom" onclick="YangoPage._toggleCustomDates()">
            <iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Personnalise
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
              <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Appliquer
            </button>
          </div>
        </div>
        <div class="yango-date-label" id="yp-date-label">
          <iconify-icon icon="solar:calendar-mark-bold-duotone"></iconify-icon>
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
          <div class="kpi-icon yango-icon-green"><iconify-icon icon="solar:user-check-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="yp-drivers-total"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">Chauffeurs en service</div>
          <div class="kpi-trend neutral" id="yp-drivers-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
        <div class="kpi-card yango-kpi">
          <div class="kpi-icon yango-icon-orange"><iconify-icon icon="solar:wallet-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="yp-ca-today"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-ca-label">CA du jour</div>
          <div class="kpi-trend neutral" id="yp-ca-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
        <div class="kpi-card yango-kpi">
          <div class="kpi-icon yango-icon-blue"><iconify-icon icon="solar:bus-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="yp-courses-today"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-courses-label">Courses aujourd'hui</div>
          <div class="kpi-trend neutral" id="yp-courses-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
        <div class="kpi-card yango-kpi" style="border-top-color:rgba(34,197,94,0.5) !important;">
          <div class="kpi-icon yango-icon-green"><iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="yp-commission" style="color:var(--success)"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-commission-label">Commission partenaire</div>
          <div class="kpi-trend neutral" id="yp-commission-detail"><div class="yango-skeleton-sm"></div></div>
        </div>
      </div>

      <!-- KPIs Row 2: Period totals + Activity -->
      <div class="grid-4" style="margin-top:var(--space-sm);">
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="yp-ca-month"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-ca-month-label">CA du mois</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-icon"><iconify-icon icon="solar:sale-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="yp-commission-month" style="color:var(--danger)"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-commission-month-label">Frais Yango (prélevés)</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><iconify-icon icon="solar:route-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="yp-courses-month"><div class="yango-skeleton"></div></div>
          <div class="kpi-label" id="yp-courses-month-label">Courses du mois</div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-icon"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="yp-activity-time"><div class="yango-skeleton"></div></div>
          <div class="kpi-label">Temps d'activite moyen</div>
        </div>
      </div>

      <!-- Content: Drivers + Courses side by side -->
      <div class="yango-content-grid" style="margin-top:var(--space-lg);">
        <!-- Drivers list -->
        <div class="card yango-drivers-card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon> Chauffeurs en service</span>
            <span class="badge badge-info" id="yp-drivers-count">--</span>
          </div>
          <div id="yp-drivers-table">
            <div class="yango-loading"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement...</div>
          </div>
        </div>

        <!-- Recent courses -->
        <div class="card yango-courses-card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:route-bold-duotone"></iconify-icon> Courses recentes</span>
            <span class="badge badge-info" id="yp-courses-count">--</span>
          </div>
          <div id="yp-courses-list">
            <div class="yango-loading"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement...</div>
          </div>
        </div>
      </div>

      <!-- Top drivers -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title" id="yp-top-title"><iconify-icon icon="solar:cup-bold-duotone"></iconify-icon> Top chauffeurs du jour</span>
        </div>
        <div id="yp-top-drivers">
          <div class="yango-loading"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement...</div>
        </div>
      </div>

      <!-- Courses terminées -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:check-circle-bold-duotone" style="color:#22c55e"></iconify-icon> Courses terminées</span>
          <span class="badge badge-success" id="yp-completed-count">--</span>
        </div>
        <div id="yp-completed-courses">
          <div class="yango-loading"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement...</div>
        </div>
      </div>

      <!-- Chauffeurs programmés — Planning du jour -->
      <div class="card" style="margin-top:var(--space-lg);border-top:3px solid #FC4C02;">
        <div class="card-header">
          <span class="card-title" style="display:flex;align-items:center;gap:8px;">
            <iconify-icon icon="solar:calendar-bold-duotone" style="color:#FC4C02;"></iconify-icon> Chauffeurs programmés — Aujourd'hui
            <span style="width:6px;height:6px;border-radius:50%;background:#FC4C02;animation:pulse-dot 2s infinite;"></span>
          </span>
        </div>
        <div id="yp-volt-activity">
          <div style="text-align:center;padding:var(--space-lg);color:var(--text-muted);font-size:var(--font-size-sm);">
            <iconify-icon icon="solar:refresh-bold" class="spin-icon" style="font-size:20px;"></iconify-icon>
            <div style="margin-top:8px;">Chargement...</div>
          </div>
        </div>
      </div>
      <style>@keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }</style>

      <!-- Synchronisation Yango → Volt -->
      <div class="card" style="margin-top:var(--space-lg);border-top:3px solid #FC4C02;">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:refresh-bold-duotone" style="color:#FC4C02"></iconify-icon> Synchronisation Yango → Volt</span>
          <span class="badge" id="yp-sync-status-badge">--</span>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:var(--space-md);">
          Recupere automatiquement les courses et l'activite de chaque chauffeur depuis Yango, puis met a jour les scores de conduite et le temps d'activite dans Volt. La sync automatique s'execute chaque nuit a 2h.
        </div>
        <div style="display:flex;gap:var(--space-sm);align-items:center;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="YangoPage._triggerSync()" id="yp-sync-btn">
            <iconify-icon icon="solar:play-bold"></iconify-icon> Lancer la sync maintenant
          </button>
          <button class="btn btn-secondary" onclick="YangoPage._triggerSync('yesterday')" id="yp-sync-btn-hier">
            <iconify-icon icon="solar:calendar-minimalistic-bold-duotone"></iconify-icon> Sync hier
          </button>
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:var(--font-size-xs);color:var(--text-muted);">Date :</label>
            <input type="date" class="form-control" id="yp-sync-date" style="width:auto;font-size:var(--font-size-xs);padding:4px 8px;" max="${new Date().toISOString().split('T')[0]}">
            <button class="btn btn-sm btn-outline" onclick="YangoPage._triggerSyncDate()">
              <iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon>
            </button>
          </div>
        </div>
        <div id="yp-sync-result" style="margin-top:var(--space-md);display:none;"></div>
      </div>

      <!-- Commission info -->
      <div style="margin-top:var(--space-md);padding:10px 14px;border-radius:var(--radius-sm);background:var(--bg-tertiary);font-size:var(--font-size-xs);color:var(--text-muted);display:flex;align-items:center;gap:8px;">
        <iconify-icon icon="solar:info-circle-bold-duotone" style="color:#FC4C02"></iconify-icon>
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
      this._renderCompletedCourses(stats.courses?.recentes || []);
      this._loadVoltActivity();

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
    setLabel('yp-commission-label', `Commission partenaire`);

    // Row 2 labels
    if (isToday) {
      setLabel('yp-ca-month-label', 'CA du mois');
      setLabel('yp-commission-month-label', 'Frais Yango du mois');
      setLabel('yp-courses-month-label', 'Courses du mois');
    } else {
      setLabel('yp-ca-month-label', `CA total (${label})`);
      setLabel('yp-commission-month-label', `Frais Yango (prelevés)`);
      setLabel('yp-courses-month-label', `Total courses`);
    }

    // Top chauffeurs title
    const topTitle = document.getElementById('yp-top-title');
    if (topTitle) {
      topTitle.innerHTML = isToday
        ? '<iconify-icon icon="solar:cup-bold-duotone"></iconify-icon> Top chauffeurs du jour'
        : `<iconify-icon icon="solar:cup-bold-duotone"></iconify-icon> Top chauffeurs (${label})`;
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
      <iconify-icon icon="solar:money-bag-bold-duotone" style="color:#22c55e;font-size:9px"></iconify-icon> ${Utils.formatCurrency(cashToday)}
      <span style="margin:0 3px">&bull;</span>
      <iconify-icon icon="solar:card-bold-duotone" style="color:#3b82f6;font-size:9px"></iconify-icon> ${Utils.formatCurrency(cardToday)}
    `);

    setVal('yp-courses-today', coursesToday);
    const courseParts = [];
    if (enCours > 0) courseParts.push(`<span class="yango-dot yango-dot-green"></span> ${enCours} en cours`);
    if (terminees > 0) courseParts.push(`<iconify-icon icon="solar:check-circle-bold-duotone" style="color:#22c55e;font-size:9px"></iconify-icon> ${terminees} ok`);
    if (annulees > 0) courseParts.push(`<iconify-icon icon="solar:close-circle-bold" style="color:#ef4444;font-size:9px"></iconify-icon> ${annulees} ann.`);
    if (courseParts.length === 0) courseParts.push(`<iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> ${coursesMonth} ce mois`);
    setHtml('yp-courses-detail', courseParts.join(' <span style="margin:0 3px">&bull;</span> '));

    // Commission partenaire (partner_ride_fee)
    setVal('yp-commission', Utils.formatCurrency(commPartToday));
    setHtml('yp-commission-detail', `<iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> ${Utils.formatCurrency(commPartMonth)} ce mois`);

    // Row 2
    setVal('yp-ca-month', Utils.formatCurrency(caMonth));
    setVal('yp-commission-month', Utils.formatCurrency(commYangoMonth));
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
      container.innerHTML = '<div class="yango-empty"><iconify-icon icon="solar:user-cross-bold-duotone"></iconify-icon><span>Aucun chauffeur en service</span></div>';
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
                  <iconify-icon icon="solar:record-circle-bold-duotone"></iconify-icon> ${status.label}
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
      container.innerHTML = `<div class="yango-empty"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon><span>${emptyMsg}</span></div>`;
      return;
    }

    const statusIcons = {
      en_route: { icon: 'solar:wheel-bold-duotone', color: '#3b82f6' },
      en_attente: { icon: 'solar:hourglass-bold-duotone', color: '#f59e0b' },
      en_course: { icon: 'solar:bus-bold-duotone', color: '#22c55e' },
      terminee: { icon: 'solar:check-circle-bold-duotone', color: '#22c55e' },
      annulee: { icon: 'solar:close-circle-bold', color: '#ef4444' },
      recherche: { icon: 'solar:magnifer-bold-duotone', color: '#8b5cf6' },
      assignee: { icon: 'solar:user-check-bold-duotone', color: '#06b6d4' }
    };

    container.innerHTML = `
      <div class="yango-courses-list-inner">
        ${courses.map(c => {
          const st = statusIcons[c.statut] || { icon: 'solar:record-circle-bold-duotone', color: '#6b7280' };
          const heure = c.heure ? new Date(c.heure).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--';
          const montant = c.montant > 0 ? Utils.formatCurrency(c.montant) : '--';

          return `
            <div class="yango-course-item">
              <div class="yango-course-icon" style="color:${st.color}">
                <iconify-icon icon="${st.icon}"></iconify-icon>
              </div>
              <div class="yango-course-info">
                <div class="yango-course-driver">${c.chauffeur || '--'}</div>
                <div class="yango-course-route">
                  ${c.depart ? `<span><iconify-icon icon="solar:map-point-bold-duotone" style="color:#22c55e;font-size:9px"></iconify-icon> ${c.depart.substring(0, 40)}${c.depart.length > 40 ? '...' : ''}</span>` : ''}
                  ${c.arrivee ? `<span><iconify-icon icon="solar:flag-bold-duotone" style="color:#ef4444;font-size:9px"></iconify-icon> ${c.arrivee.substring(0, 40)}${c.arrivee.length > 40 ? '...' : ''}</span>` : ''}
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
      container.innerHTML = '<div class="yango-empty"><iconify-icon icon="solar:cup-bold-duotone"></iconify-icon><span>Aucune donnee disponible</span></div>';
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
          if (cashVal > 0) detailParts.push(`<iconify-icon icon="solar:money-bag-bold-duotone" style="color:#22c55e;font-size:9px"></iconify-icon> ${Utils.formatCurrency(cashVal)}`);
          if (cardVal > 0) detailParts.push(`<iconify-icon icon="solar:card-bold-duotone" style="color:#3b82f6;font-size:9px"></iconify-icon> ${Utils.formatCurrency(cardVal)}`);
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

  // =================== RENDER COMPLETED COURSES ===================

  _renderCompletedCourses(courses) {
    const container = document.getElementById('yp-completed-courses');
    const countBadge = document.getElementById('yp-completed-count');
    if (!container) return;

    // Filtrer uniquement les courses terminées
    const completed = (courses || []).filter(c => c.statut === 'terminee');

    if (countBadge) countBadge.textContent = completed.length;

    if (completed.length === 0) {
      const emptyMsg = this._datePreset === 'today' ? "Aucune course terminee aujourd'hui" : 'Aucune course terminee pour cette periode';
      container.innerHTML = `<div class="yango-empty"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon><span>${emptyMsg}</span></div>`;
      return;
    }

    // Calculer stats
    const totalCA = completed.reduce((sum, c) => sum + (c.montant || 0), 0);
    const totalCash = completed.filter(c => c.paiement === 'cash').reduce((sum, c) => sum + (c.montant || 0), 0);
    const totalCard = totalCA - totalCash;

    container.innerHTML = `
      <!-- Stats résumé -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-sm);margin-bottom:var(--space-md);padding:var(--space-sm) 0;">
        <div style="text-align:center;padding:var(--space-sm);background:var(--bg-tertiary);border-radius:var(--radius-md);">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Total</div>
          <div style="font-size:var(--font-size-md);font-weight:700;color:var(--text-primary);">${Utils.formatCurrency(totalCA)}</div>
        </div>
        <div style="text-align:center;padding:var(--space-sm);background:var(--bg-tertiary);border-radius:var(--radius-md);">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:money-bag-bold-duotone" style="color:#22c55e;font-size:10px"></iconify-icon> Cash</div>
          <div style="font-size:var(--font-size-md);font-weight:700;color:#22c55e;">${Utils.formatCurrency(totalCash)}</div>
        </div>
        <div style="text-align:center;padding:var(--space-sm);background:var(--bg-tertiary);border-radius:var(--radius-md);">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:card-bold-duotone" style="color:#3b82f6;font-size:10px"></iconify-icon> Carte</div>
          <div style="font-size:var(--font-size-md);font-weight:700;color:#3b82f6;">${Utils.formatCurrency(totalCard)}</div>
        </div>
      </div>

      <!-- Liste des courses terminées -->
      <div class="yango-courses-list-inner" style="max-height:400px;overflow-y:auto;">
        ${completed.map(c => {
          const heure = c.heure ? new Date(c.heure).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--';
          const montant = c.montant > 0 ? Utils.formatCurrency(c.montant) : '--';
          const paiementIcon = c.paiement === 'cash'
            ? '<iconify-icon icon="solar:money-bag-bold-duotone" style="color:#22c55e;font-size:11px" title="Cash"></iconify-icon>'
            : '<iconify-icon icon="solar:card-bold-duotone" style="color:#3b82f6;font-size:11px" title="Carte"></iconify-icon>';

          return `
            <div class="yango-course-item">
              <div class="yango-course-icon" style="color:#22c55e">
                <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon>
              </div>
              <div class="yango-course-info">
                <div class="yango-course-driver">${c.chauffeur || '--'}</div>
                <div class="yango-course-route">
                  ${c.depart ? `<span><iconify-icon icon="solar:map-point-bold-duotone" style="color:#22c55e;font-size:9px"></iconify-icon> ${c.depart.substring(0, 40)}${c.depart.length > 40 ? '...' : ''}</span>` : ''}
                  ${c.arrivee ? `<span><iconify-icon icon="solar:flag-bold-duotone" style="color:#ef4444;font-size:9px"></iconify-icon> ${c.arrivee.substring(0, 40)}${c.arrivee.length > 40 ? '...' : ''}</span>` : ''}
                </div>
              </div>
              <div class="yango-course-right">
                <div class="yango-course-amount">${paiementIcon} ${montant}</div>
                <div class="yango-course-time">${heure}</div>
              </div>
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
    if (syncBtn) { syncBtn.disabled = true; syncBtn.innerHTML = '<iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Synchronisation...'; }
    if (resultDiv) { resultDiv.style.display = 'block'; resultDiv.innerHTML = '<div class="yango-loading"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Recuperation des donnees Yango en cours...</div>'; }

    let syncDate = null;
    if (datePreset === 'yesterday') {
      const d = new Date(); d.setDate(d.getDate() - 1);
      syncDate = d.toISOString().split('T')[0];
    }

    const result = await Store.triggerYangoSync(syncDate);
    this._renderSyncResult(result);

    if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = '<iconify-icon icon="solar:play-bold"></iconify-icon> Lancer la sync maintenant'; }
  },

  async _triggerSyncDate() {
    const dateInput = document.getElementById('yp-sync-date');
    if (!dateInput || !dateInput.value) { Toast.warning('Selectionnez une date'); return; }

    const syncBtn = document.getElementById('yp-sync-btn');
    const resultDiv = document.getElementById('yp-sync-result');
    if (syncBtn) syncBtn.disabled = true;
    if (resultDiv) { resultDiv.style.display = 'block'; resultDiv.innerHTML = '<div class="yango-loading"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Synchronisation du ' + dateInput.value + '...</div>'; }

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
          <iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Erreur: ${result.error}${result.details ? ' — ' + result.details : ''}
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
          <iconify-icon icon="solar:check-circle-bold-duotone" style="color:#22c55e;font-size:1rem;"></iconify-icon>
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

        ${result.matchMethods ? `
          <div style="margin-top:10px;font-size:var(--font-size-xs);color:var(--text-muted);">
            <strong>Methodes de matching :</strong> ${Object.entries(result.matchMethods).map(([k,v]) => `${k}: ${v}`).join(', ')}
          </div>
        ` : ''}

        ${(result.unmatchedVolt && result.unmatchedVolt.length > 0) ? `
          <div style="margin-top:10px;padding:8px 10px;border-radius:var(--radius-sm);background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);font-size:var(--font-size-xs);color:#dc2626;">
            <iconify-icon icon="solar:user-cross-bold-duotone"></iconify-icon> <strong>${result.unmatchedVolt.length} chauffeur(s) Volt non retrouvé(s) dans Yango :</strong>
            <div style="margin-top:6px;">
              ${result.unmatchedVolt.map(c => `
                <div style="padding:4px 0;border-bottom:1px solid rgba(239,68,68,0.1);">
                  <strong>${c.nom}</strong>
                  <span style="color:var(--text-muted);font-size:10px;"> tel: ${c.telephone || 'aucun'} | nom normalisé: "${c.normalizedName}" | tel normalisé: "${c.normalizedPhone}"</span>
                  ${c.yangoDriverId ? '<span class="badge badge-success" style="font-size:9px;">yangoId défini</span>' : '<span class="badge badge-danger" style="font-size:9px;">Pas de yangoId</span>'}
                </div>
              `).join('')}
            </div>
            <div style="margin-top:8px;font-size:10px;color:var(--text-muted);">
              <iconify-icon icon="solar:lightbulb-bold-duotone" style="color:#f59e0b;"></iconify-icon> <strong>Solutions :</strong> Verifiez l'orthographe du nom/prenom, ou allez dans la fiche du chauffeur pour le lier manuellement a un profil Yango.
            </div>
          </div>
        ` : ''}

        ${result.unmatched > 0 ? `
          <div style="margin-top:10px;padding:8px 10px;border-radius:var(--radius-sm);background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);font-size:var(--font-size-xs);color:#b45309;">
            <iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> <strong>${result.unmatched} chauffeur(s) Yango non matché(s)</strong> sur ${result.totalYangoDrivers || '?'}
            <div style="margin-top:4px;max-height:100px;overflow-y:auto;font-size:10px;color:var(--text-muted);">
              ${(result.unmatchedDrivers || []).join(' &bull; ')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  // =================== CHAUFFEURS PROGRAMMÉS (planning-based activity) ===================

  _getShiftDurationMinutes(shift) {
    let startStr = shift.heureDebut;
    let endStr = shift.heureFin;
    // Fallback presets
    if (!startStr || !endStr) {
      const presets = { matin: ['06:00', '14:00'], apres_midi: ['14:00', '22:00'], journee: ['08:00', '20:00'], nuit: ['22:00', '06:00'] };
      const preset = presets[shift.typeCreneaux];
      if (preset) { startStr = startStr || preset[0]; endStr = endStr || preset[1]; }
    }
    if (!startStr || !endStr) return 480; // 8h default
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    let startMin = sh * 60 + (sm || 0);
    let endMin = eh * 60 + (em || 0);
    if (endMin <= startMin) endMin += 24 * 60; // overnight
    return endMin - startMin;
  },

  async _loadVoltActivity() {
    const container = document.getElementById('yp-volt-activity');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const planning = Store.get('planning') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const todayShifts = planning.filter(p => p.date === today);

    // Grouper par chauffeurId
    const scheduledMap = new Map();
    todayShifts.forEach(shift => {
      const ch = chauffeurs.find(c => c.id === shift.chauffeurId);
      if (ch && ch.statut === 'actif') {
        if (!scheduledMap.has(ch.id)) scheduledMap.set(ch.id, { chauffeur: ch, shifts: [] });
        scheduledMap.get(ch.id).shifts.push(shift);
      }
    });
    const scheduled = Array.from(scheduledMap.values());

    if (scheduled.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-lg);color:var(--text-muted);font-size:var(--font-size-sm);">
        <iconify-icon icon="solar:calendar-minimalistic-bold-duotone" style="font-size:32px;color:var(--text-muted);opacity:0.4;"></iconify-icon>
        <div style="margin-top:8px;">Aucun chauffeur programmé aujourd'hui</div>
        <a href="#/planning" style="color:#FC4C02;font-size:var(--font-size-xs);margin-top:4px;display:inline-block;">Aller au Planning →</a>
      </div>`;
      return;
    }

    const linked = scheduled.filter(s => s.chauffeur.yangoDriverId);
    const unlinked = scheduled.filter(s => !s.chauffeur.yangoDriverId);

    // Banner non liés
    let bannerHtml = '';
    if (unlinked.length > 0) {
      bannerHtml = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;margin-bottom:var(--space-md);background:rgba(252,76,2,0.1);border:1px solid rgba(252,76,2,0.3);border-radius:var(--radius-md);font-size:var(--font-size-xs);">
        <div style="display:flex;align-items:center;gap:8px;">
          <iconify-icon icon="solar:link-broken-bold-duotone" style="color:#FC4C02;font-size:16px;"></iconify-icon>
          <span><strong>${unlinked.length} chauffeur${unlinked.length > 1 ? 's' : ''} programmé${unlinked.length > 1 ? 's' : ''}</strong> non lié${unlinked.length > 1 ? 's' : ''} à Yango : ${unlinked.map(s => s.chauffeur.prenom).join(', ')}</span>
        </div>
        <button class="btn btn-sm" style="background:#FC4C02;color:#fff;border-color:#FC4C02;" onclick="YangoPage._syncVoltYango()"><iconify-icon icon="solar:link-bold-duotone"></iconify-icon> Lier</button>
      </div>`;
    }

    // Fetch stats pour les liés
    const results = await Promise.allSettled(
      linked.map(async (entry) => {
        const stats = await Store.getYangoDriverStats(entry.chauffeur.yangoDriverId, null);
        return { ...entry, stats, isLinked: true };
      })
    );

    // Construire les rows
    const rows = [];
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.stats && !r.value.stats.error) {
        rows.push(r.value);
      } else {
        const entry = r.status === 'fulfilled' ? r.value : linked[rows.length];
        if (entry) rows.push({ ...entry, stats: null, isLinked: true, statsError: true });
      }
    });
    unlinked.forEach(entry => rows.push({ ...entry, stats: null, isLinked: false }));

    // Tri : liés avec CA desc, puis liés erreur, puis non liés
    rows.sort((a, b) => {
      if (a.isLinked && !b.isLinked) return -1;
      if (!a.isLinked && b.isLinked) return 1;
      return (b.stats?.totalCA || 0) - (a.stats?.totalCA || 0);
    });

    const totalCA = rows.reduce((s, r) => s + (r.stats?.totalCA || 0), 0);
    const totalCourses = rows.reduce((s, r) => s + (r.stats?.nbCourses || 0), 0);
    const errCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.stats?.error)).length;

    // Shift helpers
    const shiftColors = { matin: '#22c55e', apres_midi: '#3b82f6', journee: '#f59e0b', nuit: '#8b5cf6', custom: '#6366f1' };
    const shiftLabels = { matin: 'M', apres_midi: 'AM', journee: 'J', nuit: 'N', custom: 'P' };
    const getShiftBadge = (shift) => {
      const type = shift.typeCreneaux || 'custom';
      const color = shiftColors[type] || '#64748b';
      const hd = shift.heureDebut ? parseInt(shift.heureDebut) : null;
      const hf = shift.heureFin ? parseInt(shift.heureFin) : null;
      const label = (hd !== null && hf !== null) ? `${hd}h-${hf}h` : (shiftLabels[type] || '?');
      return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:${color}20;color:${color};font-size:10px;font-weight:600;white-space:nowrap;">${label}</span>`;
    };

    container.innerHTML = `
      ${bannerHtml}
      <div style="display:flex;gap:var(--space-lg);margin-bottom:var(--space-md);padding:0 var(--space-sm);flex-wrap:wrap;">
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);">
          Programmés : <strong style="color:var(--text-primary);font-size:var(--font-size-sm);">${scheduled.length}</strong>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);">
          Liés Yango : <strong style="color:#22c55e;font-size:var(--font-size-sm);">${linked.length}</strong>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);">
          CA total : <strong style="color:#FC4C02;font-size:var(--font-size-sm);">${Utils.formatCurrency(totalCA)}</strong>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);">
          Courses : <strong style="color:var(--text-primary);font-size:var(--font-size-sm);">${totalCourses}</strong>
        </div>
        ${errCount > 0 ? `<div style="font-size:var(--font-size-xs);color:var(--warning);">${errCount} non chargé(s)</div>` : ''}
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table" style="margin:0;">
          <thead>
            <tr>
              <th>Chauffeur</th>
              <th style="text-align:center;">Créneau</th>
              <th style="text-align:center;">Activité</th>
              <th style="text-align:right;">CA</th>
              <th style="text-align:center;">Objectif CA</th>
              <th style="text-align:right;">Courses</th>
              <th style="text-align:right;">Espèces</th>
              <th style="text-align:right;">Carte</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const c = r.chauffeur;
              const s = r.stats;
              const ca = s?.totalCA || 0;
              // Objectif CA
              const objectif = c.objectifCA || 0;
              const caPct = objectif > 0 ? Math.min(100, Math.round(ca / objectif * 100)) : null;
              const caPctColor = caPct !== null ? (caPct >= 100 ? '#22c55e' : caPct >= 60 ? '#f59e0b' : '#ef4444') : null;
              // Activité
              const totalShiftMin = r.shifts.reduce((sum, sh) => sum + this._getShiftDurationMinutes(sh), 0);
              const actMin = s?.tempsActiviteMinutes || 0;
              const actPct = totalShiftMin > 0 ? Math.min(100, Math.round(actMin / totalShiftMin * 100)) : 0;
              const actColor = actPct >= 80 ? '#22c55e' : actPct >= 40 ? '#f59e0b' : '#ef4444';
              const actH = Math.floor(actMin / 60);
              const actM = actMin % 60;
              const actLabel = actMin > 0 ? `${actH}h${String(Math.round(actM)).padStart(2, '0')}` : '--';
              const shiftH = Math.floor(totalShiftMin / 60);
              const shiftM = totalShiftMin % 60;
              const shiftLabel = `${shiftH}h${shiftM > 0 ? String(shiftM).padStart(2, '0') : ''}`;
              return `
                <tr style="cursor:pointer;" onclick="Router.navigate('/chauffeurs/${c.id}')">
                  <td style="display:flex;align-items:center;gap:8px;">
                    ${typeof Utils !== 'undefined' && Utils.getAvatarHtml ? Utils.getAvatarHtml(c, '', 'width:28px;height:28px;font-size:10px;flex-shrink:0;') : `<div class="avatar-sm">${(c.prenom[0] + c.nom[0]).toUpperCase()}</div>`}
                    <div>
                      <span style="font-weight:500;">${c.prenom} ${c.nom}</span>
                      ${!r.isLinked ? '<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.15);color:#ef4444;font-size:9px;font-weight:600;margin-left:4px;">Non lié</span>' : ''}
                    </div>
                  </td>
                  <td style="text-align:center;">${r.shifts.map(sh => getShiftBadge(sh)).join(' ')}</td>
                  <td style="text-align:center;min-width:130px;">
                    ${r.isLinked && !r.statsError ? `
                      <div style="display:flex;align-items:center;gap:4px;justify-content:center;">
                        <div style="flex:1;max-width:70px;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
                          <div style="width:${actPct}%;height:100%;background:${actColor};border-radius:3px;transition:width 0.3s;"></div>
                        </div>
                        <span style="font-size:10px;font-weight:600;color:${actColor};">${actLabel}</span>
                      </div>
                      <div style="font-size:9px;color:var(--text-muted);">/ ${shiftLabel}</div>
                    ` : '<span style="color:var(--text-muted);font-size:10px;">—</span>'}
                  </td>
                  <td style="text-align:right;font-weight:700;color:#FC4C02;">${r.isLinked && s ? Utils.formatCurrency(ca) : '—'}</td>
                  <td style="text-align:center;min-width:100px;">${caPct !== null && r.isLinked && s ? `
                    <div style="display:flex;align-items:center;gap:4px;justify-content:center;">
                      <div style="flex:1;max-width:60px;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
                        <div style="width:${caPct}%;height:100%;background:${caPctColor};border-radius:3px;transition:width 0.3s;"></div>
                      </div>
                      <span style="font-size:10px;font-weight:600;color:${caPctColor};">${caPct}%</span>
                    </div>` : '<span style="color:var(--text-muted);font-size:10px;">—</span>'}</td>
                  <td style="text-align:right;font-weight:600;">${s ? (s.nbCourses || 0) : '—'}</td>
                  <td style="text-align:right;color:#22c55e;">${s ? Utils.formatCurrency(s.totalCash || 0) : '—'}</td>
                  <td style="text-align:right;color:#3b82f6;">${s ? Utils.formatCurrency(s.totalCard || 0) : '—'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  async _syncVoltYango() {
    Toast.info('Synchronisation Yango en cours...');
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await Store.triggerYangoSync(today);
      if (result && !result.error) {
        const matched = result.matched || result.matchedCount || 0;
        Toast.success(`Sync terminée — ${matched} chauffeur(s) liés`);
        await Store.initialize();
        this._loadVoltActivity();
      } else {
        Toast.error(result?.details || result?.error || 'Erreur de synchronisation');
      }
    } catch (e) {
      Toast.error('Impossible de contacter l\'API Yango');
    }
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
          <iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon>
          <span>${message}</span>
          <button class="btn btn-sm btn-secondary" onclick="YangoPage._loadData()" style="margin-top:8px;">
            <iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Reessayer
          </button>
        </div>
      `;
    }
  }
};
