/**
 * DashboardPage - Main dashboard with KPIs, charts, and Yango real-time data
 */
const DashboardPage = {
  _charts: [],
  _yangoData: null,
  _yangoRefreshInterval: null,

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    container.innerHTML = this._template(data);
    this._loadCharts(data);
    // Load Yango data asynchronously
    this._loadYangoSection();
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
    if (this._yangoRefreshInterval) {
      clearInterval(this._yangoRefreshInterval);
      this._yangoRefreshInterval = null;
    }
  },

  _getData() {
    const chauffeurs = Store.get('chauffeurs');
    const vehicules = Store.get('vehicules');
    const versements = Store.get('versements');
    const courses = Store.get('courses');
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    // This month courses
    const monthCourses = courses.filter(c => {
      const d = new Date(c.dateHeure);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear && c.statut === 'terminee';
    });

    // Last month courses for comparison
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
    const lastMonthCourses = courses.filter(c => {
      const d = new Date(c.dateHeure);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear && c.statut === 'terminee';
    });

    // Revenue
    const caThisMonth = monthCourses.reduce((s, c) => s + c.montantTTC, 0);
    const caLastMonth = lastMonthCourses.reduce((s, c) => s + c.montantTTC, 0);
    const caTrend = caLastMonth > 0 ? ((caThisMonth - caLastMonth) / caLastMonth) * 100 : 0;

    // Versements this month
    const monthVersements = versements.filter(v => {
      const d = new Date(v.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const totalVerse = monthVersements.reduce((s, v) => s + v.montantVerse, 0);

    // Versements en retard
    const retardCount = versements.filter(v => v.statut === 'retard').length;

    // Active drivers
    const activeCount = chauffeurs.filter(c => c.statut === 'actif').length;

    // Vehicles in service
    const vehiclesActifs = vehicules.filter(v => v.statut === 'en_service').length;
    const vehiclesEV = vehicules.filter(v => v.typeEnergie === 'electrique').length;
    const vehiclesThermique = vehicules.filter(v => v.typeEnergie !== 'electrique').length;

    // Monthly revenue for last 12 months
    const monthlyRevenue = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(thisYear, thisMonth - i, 1);
      const monthNum = m.getMonth();
      const yearNum = m.getFullYear();
      const rev = courses
        .filter(c => {
          const d = new Date(c.dateHeure);
          return d.getMonth() === monthNum && d.getFullYear() === yearNum && c.statut === 'terminee';
        })
        .reduce((s, c) => s + c.montantTTC, 0);
      monthlyRevenue.push({ month: Utils.getMonthShort(monthNum), revenue: Math.round(rev) });
    }

    // Weekly payments (last 8 weeks)
    const weeklyPayments = [];
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (w * 7 + now.getDay()));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekVers = versements.filter(v => {
        const d = new Date(v.date);
        return d >= weekStart && d <= weekEnd;
      });

      weeklyPayments.push({
        label: `S${Utils.getWeekNumber(weekStart)}`,
        verse: weekVers.reduce((s, v) => s + v.montantVerse, 0),
        attendu: weekVers.reduce((s, v) => s + v.commission, 0)
      });
    }

    // Courses by type
    const coursesByType = {};
    const typeLabels = {
      aeroport: 'Aeroport', gare: 'Gare', urbain: 'Urbain',
      banlieue: 'Banlieue', longue_distance: 'Longue distance'
    };
    monthCourses.forEach(c => {
      coursesByType[c.typeTrajet] = (coursesByType[c.typeTrajet] || 0) + 1;
    });

    // Profitability per vehicle
    const vehicleProfit = vehicules.map(v => {
      const vCourses = monthCourses.filter(c => c.vehiculeId === v.id);
      const revenue = vCourses.reduce((s, c) => s + c.montantTTC, 0);
      const monthlyCost = v.typeAcquisition === 'leasing'
        ? v.mensualiteLeasing + (v.primeAnnuelle / 12)
        : (v.prixAchat / 60) + (v.primeAnnuelle / 12);
      const isEV = v.typeEnergie === 'electrique';
      return {
        label: `${v.marque} ${v.modele}${isEV ? ' ⚡' : ''}`,
        profit: Math.round(revenue * 0.20 - monthlyCost),
        isEV
      };
    });

    // Recent activities
    const recentVersements = versements
      .sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation))
      .slice(0, 5);

    return {
      caThisMonth, caTrend, totalVerse, retardCount,
      activeCount, vehiclesActifs, vehiclesEV, vehiclesThermique,
      monthCourses: monthCourses.length,
      monthlyRevenue, weeklyPayments,
      coursesByType, typeLabels, vehicleProfit,
      recentVersements, chauffeurs, vehiculesTotal: vehicules.length
    };
  },

  _template(d) {
    return `
      <div class="page-header">
        <h1><i class="fas fa-gauge-high"></i> Tableau de bord</h1>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="DashboardPage.refresh()"><i class="fas fa-sync-alt"></i> Actualiser</button>
        </div>
      </div>

      <!-- Yango Real-time Section -->
      <div class="yango-section" id="yango-section">
        <div class="yango-section-header">
          <div class="yango-section-title">
            <img src="https://avatars.githubusercontent.com/u/36020155?s=20" alt="" class="yango-logo-icon" onerror="this.style.display='none'">
            <span>Yango</span>
            <span class="yango-badge-live">EN DIRECT</span>
          </div>
          <div class="yango-section-actions">
            <span class="yango-last-update" id="yango-last-update"></span>
            <button class="btn btn-sm yango-refresh-btn" onclick="DashboardPage._loadYangoSection()" id="yango-refresh-btn">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>

        <!-- Yango KPIs -->
        <div class="grid-4" id="yango-kpis">
          <div class="kpi-card yango-kpi">
            <div class="kpi-icon yango-icon-green"><i class="fas fa-user-check"></i></div>
            <div class="kpi-value" id="yango-online">
              <div class="yango-skeleton"></div>
            </div>
            <div class="kpi-label">Chauffeurs actifs</div>
            <div class="kpi-trend neutral" id="yango-online-detail">
              <div class="yango-skeleton-sm"></div>
            </div>
          </div>
          <div class="kpi-card yango-kpi">
            <div class="kpi-icon yango-icon-orange"><i class="fas fa-wallet"></i></div>
            <div class="kpi-value" id="yango-ca">
              <div class="yango-skeleton"></div>
            </div>
            <div class="kpi-label">CA du jour (Yango)</div>
            <div class="kpi-trend neutral" id="yango-ca-detail">
              <div class="yango-skeleton-sm"></div>
            </div>
          </div>
          <div class="kpi-card yango-kpi">
            <div class="kpi-icon yango-icon-blue"><i class="fas fa-taxi"></i></div>
            <div class="kpi-value" id="yango-courses">
              <div class="yango-skeleton"></div>
            </div>
            <div class="kpi-label">Courses aujourd'hui</div>
            <div class="kpi-trend neutral" id="yango-courses-detail">
              <div class="yango-skeleton-sm"></div>
            </div>
          </div>
          <div class="kpi-card yango-kpi">
            <div class="kpi-icon yango-icon-purple"><i class="fas fa-hand-holding-dollar"></i></div>
            <div class="kpi-value" id="yango-commission">
              <div class="yango-skeleton"></div>
            </div>
            <div class="kpi-label">Commission Yango (3%)</div>
            <div class="kpi-trend neutral" id="yango-commission-detail">
              <div class="yango-skeleton-sm"></div>
            </div>
          </div>
        </div>

        <!-- Yango Content Grid: Drivers + Recent Courses -->
        <div class="yango-content-grid">
          <!-- Yango Drivers Table -->
          <div class="card yango-drivers-card" id="yango-drivers-card">
            <div class="card-header">
              <span class="card-title"><i class="fas fa-users"></i> Chauffeurs en service</span>
              <span class="badge badge-info" id="yango-drivers-count">--</span>
            </div>
            <div id="yango-drivers-table">
              <div class="yango-loading">
                <i class="fas fa-spinner fa-spin"></i> Chargement...
              </div>
            </div>
          </div>

          <!-- Recent Courses -->
          <div class="card yango-courses-card" id="yango-courses-card">
            <div class="card-header">
              <span class="card-title"><i class="fas fa-road"></i> Courses recentes</span>
              <span class="badge badge-info" id="yango-courses-count">--</span>
            </div>
            <div id="yango-courses-list">
              <div class="yango-loading">
                <i class="fas fa-spinner fa-spin"></i> Chargement...
              </div>
            </div>
          </div>
        </div>

        <!-- Top Chauffeurs -->
        <div class="card yango-top-card" id="yango-top-card" style="margin-top: var(--space-md);">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-trophy"></i> Top chauffeurs du jour</span>
          </div>
          <div id="yango-top-drivers">
            <div class="yango-loading">
              <i class="fas fa-spinner fa-spin"></i> Chargement...
            </div>
          </div>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="grid-4">
        <div class="kpi-card">
          <div class="kpi-icon"><i class="fas fa-coins"></i></div>
          <div class="kpi-value">${Utils.formatCurrency(d.caThisMonth)}</div>
          <div class="kpi-label">Chiffre d'affaires du mois</div>
          <div class="kpi-trend ${d.caTrend >= 0 ? 'up' : 'down'}">
            <i class="fas fa-arrow-${d.caTrend >= 0 ? 'up' : 'down'}"></i> ${Math.abs(d.caTrend).toFixed(1)}%
          </div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><i class="fas fa-money-bill-transfer"></i></div>
          <div class="kpi-value">${Utils.formatCurrency(d.totalVerse)}</div>
          <div class="kpi-label">Versements recus ce mois</div>
          <div class="kpi-trend ${d.retardCount > 0 ? 'down' : 'up'}">
            <i class="fas fa-exclamation-triangle"></i> ${d.retardCount} en retard
          </div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><i class="fas fa-route"></i></div>
          <div class="kpi-value">${Utils.formatNumber(d.monthCourses)}</div>
          <div class="kpi-label">Courses ce mois</div>
          <div class="kpi-trend neutral">
            <i class="fas fa-users"></i> ${d.activeCount} chauffeurs actifs
          </div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-icon"><i class="fas fa-car"></i></div>
          <div class="kpi-value">${d.vehiclesActifs}</div>
          <div class="kpi-label">Vehicules en service</div>
          <div class="kpi-trend neutral">
            <i class="fas fa-bolt" style="color:var(--volt-yellow)"></i> ${d.vehiclesEV} EV
            <span style="margin:0 2px">&bull;</span>
            <i class="fas fa-gas-pump"></i> ${d.vehiclesThermique} therm.
          </div>
        </div>
      </div>

      <!-- Charts Row 1 -->
      <div class="charts-grid">
        <div class="chart-card full-width">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-line"></i> Evolution du chiffre d'affaires</div>
          </div>
          <div class="chart-container" style="height: 300px;">
            <canvas id="chart-revenue"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-bar"></i> Versements hebdomadaires</div>
          </div>
          <div class="chart-container" style="height: 280px;">
            <canvas id="chart-payments"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-pie"></i> Repartition des courses</div>
          </div>
          <div class="chart-container" style="height: 280px;">
            <canvas id="chart-rides"></canvas>
          </div>
        </div>
      </div>

      <!-- Bottom section -->
      <div class="charts-grid" style="margin-top: var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-bar"></i> Rentabilite par vehicule</div>
          </div>
          <div class="chart-container" style="height: 280px;">
            <canvas id="chart-profit"></canvas>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Derniers versements</span>
            <a href="#/versements" class="btn btn-sm btn-secondary">Voir tout</a>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${d.recentVersements.map(v => {
              const chauffeur = d.chauffeurs.find(c => c.id === v.chauffeurId);
              const name = chauffeur ? `${chauffeur.prenom} ${chauffeur.nom}` : v.chauffeurId;
              return `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:8px; border-radius:var(--radius-sm); background:var(--bg-tertiary);">
                  <div>
                    <div style="font-size:var(--font-size-sm); font-weight:500;">${name}</div>
                    <div style="font-size:var(--font-size-xs); color:var(--text-muted);">${v.periode} - ${Utils.formatDate(v.date)}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:var(--font-size-sm); font-weight:600;" class="tabular-nums">${Utils.formatCurrency(v.montantVerse)}</div>
                    ${Utils.statusBadge(v.statut)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  },

  // =================== YANGO REAL-TIME SECTION ===================

  async _loadYangoSection() {
    const refreshBtn = document.getElementById('yango-refresh-btn');
    if (refreshBtn) {
      refreshBtn.classList.add('spinning');
      refreshBtn.disabled = true;
    }

    try {
      const stats = await Store.getYangoStats();

      if (!stats || stats.error) {
        const msg = stats?.details || stats?.error || 'Erreur de connexion';
        console.error('Yango API error:', stats);
        this._showYangoError(msg);
        return;
      }

      this._yangoData = stats;
      this._renderYangoKPIs(stats);
      this._renderYangoDriversTable(stats.chauffeurs?.liste || []);
      this._renderYangoRecentCourses(stats.courses?.recentes || []);
      this._renderYangoTopDrivers(stats.topChauffeurs || []);

      // Update last refresh time
      const updateEl = document.getElementById('yango-last-update');
      if (updateEl) {
        const now = new Date();
        updateEl.textContent = `Maj: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      }

    } catch (err) {
      console.error('Yango load error:', err);
      this._showYangoError('Impossible de charger les donnees Yango');
    } finally {
      if (refreshBtn) {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
      }
    }
  },

  _renderYangoKPIs(stats) {
    // Chauffeurs actifs (en service)
    const onlineEl = document.getElementById('yango-online');
    const onlineDetail = document.getElementById('yango-online-detail');
    if (onlineEl) {
      const online = stats.chauffeurs?.enLigne || 0;
      const total = stats.chauffeurs?.total || 0;
      const busy = stats.chauffeurs?.occupes || 0;
      onlineEl.textContent = total;
      if (onlineDetail) {
        onlineDetail.innerHTML = `
          <span class="yango-dot yango-dot-green"></span> ${online} dispo
          <span style="margin:0 4px">&bull;</span>
          <span class="yango-dot yango-dot-yellow"></span> ${busy} occup.
          <span style="margin:0 4px">&bull;</span>
          <span class="yango-dot yango-dot-red"></span> ${total - online - busy} hors ligne
        `;
      }
    }

    // CA du jour
    const caEl = document.getElementById('yango-ca');
    const caDetail = document.getElementById('yango-ca-detail');
    if (caEl) {
      const caToday = stats.chiffreAffaires?.aujourd_hui || 0;
      const caMonth = stats.chiffreAffaires?.mois || 0;
      caEl.textContent = Utils.formatCurrency(caToday);
      if (caDetail) {
        caDetail.innerHTML = `<i class="fas fa-calendar"></i> ${Utils.formatCurrency(caMonth)} ce mois`;
      }
    }

    // Courses aujourd'hui
    const coursesEl = document.getElementById('yango-courses');
    const coursesDetail = document.getElementById('yango-courses-detail');
    if (coursesEl) {
      const todayCount = stats.courses?.aujourd_hui || 0;
      const enCours = stats.courses?.enCours || 0;
      const terminees = stats.courses?.terminees || 0;
      const annulees = stats.courses?.annulees || 0;
      coursesEl.textContent = todayCount;
      if (coursesDetail) {
        const parts = [];
        if (enCours > 0) parts.push(`<span class="yango-dot yango-dot-green"></span> ${enCours} en cours`);
        if (terminees > 0) parts.push(`<i class="fas fa-check" style="color:#22c55e;font-size:9px"></i> ${terminees} ok`);
        if (annulees > 0) parts.push(`<i class="fas fa-times" style="color:#ef4444;font-size:9px"></i> ${annulees} ann.`);
        if (parts.length === 0) parts.push(`<i class="fas fa-chart-line"></i> ${stats.courses?.mois || 0} ce mois`);
        coursesDetail.innerHTML = parts.join(' <span style="margin:0 3px">&bull;</span> ');
      }
    }

    // Commission Yango (3%)
    const commEl = document.getElementById('yango-commission');
    const commDetail = document.getElementById('yango-commission-detail');
    if (commEl) {
      const commToday = stats.commissionYango?.aujourd_hui || 0;
      const commMonth = stats.commissionYango?.mois || 0;
      commEl.textContent = Utils.formatCurrency(commMonth);
      if (commDetail) {
        commDetail.innerHTML = `<i class="fas fa-calendar-day"></i> ${Utils.formatCurrency(commToday)} aujourd'hui`;
      }
    }
  },

  _renderYangoDriversTable(drivers) {
    const container = document.getElementById('yango-drivers-table');
    const countBadge = document.getElementById('yango-drivers-count');
    if (!container) return;

    if (countBadge) countBadge.textContent = drivers.length;

    if (!drivers || drivers.length === 0) {
      container.innerHTML = `
        <div class="yango-empty">
          <i class="fas fa-user-slash"></i>
          <span>Aucun chauffeur en service sur Yango</span>
        </div>
      `;
      return;
    }

    // Sort: online first, then busy, then offline
    const statusOrder = { en_ligne: 0, occupe: 1, hors_ligne: 2 };
    const sorted = [...drivers].sort((a, b) => (statusOrder[a.statut] || 2) - (statusOrder[b.statut] || 2));

    container.innerHTML = `
      <div class="yango-drivers-list">
        ${sorted.slice(0, 15).map(d => {
          const statusConfig = {
            en_ligne: { label: 'En ligne', class: 'yango-status-online', dot: 'yango-dot-green' },
            occupe: { label: 'Occupe', class: 'yango-status-busy', dot: 'yango-dot-yellow' },
            hors_ligne: { label: 'Hors ligne', class: 'yango-status-offline', dot: 'yango-dot-red' }
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
        ${sorted.length > 15 ? `<div class="yango-more-link">+ ${sorted.length - 15} autres chauffeurs</div>` : ''}
      </div>
    `;
  },

  _renderYangoRecentCourses(courses) {
    const container = document.getElementById('yango-courses-list');
    const countBadge = document.getElementById('yango-courses-count');
    if (!container) return;

    if (countBadge) countBadge.textContent = courses.length;

    if (!courses || courses.length === 0) {
      container.innerHTML = `
        <div class="yango-empty">
          <i class="fas fa-car-side"></i>
          <span>Aucune course aujourd'hui</span>
        </div>
      `;
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
                  ${c.depart ? `<span><i class="fas fa-map-pin" style="color:#22c55e;font-size:9px"></i> ${c.depart.substring(0, 35)}${c.depart.length > 35 ? '...' : ''}</span>` : ''}
                  ${c.arrivee ? `<span><i class="fas fa-flag-checkered" style="color:#ef4444;font-size:9px"></i> ${c.arrivee.substring(0, 35)}${c.arrivee.length > 35 ? '...' : ''}</span>` : ''}
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

  _renderYangoTopDrivers(topDrivers) {
    const container = document.getElementById('yango-top-drivers');
    if (!container) return;

    if (!topDrivers || topDrivers.length === 0) {
      container.innerHTML = `
        <div class="yango-empty">
          <i class="fas fa-trophy"></i>
          <span>Aucune donnee disponible</span>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="yango-top-list">
        ${topDrivers.map((d, i) => {
          const medals = ['🥇', '🥈', '🥉'];
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

  _showYangoError(message) {
    const kpis = document.getElementById('yango-kpis');
    const driversCard = document.getElementById('yango-drivers-table');

    // Show error in KPIs
    ['yango-online', 'yango-ca', 'yango-courses', 'yango-commission'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '--';
    });
    ['yango-online-detail', 'yango-ca-detail', 'yango-courses-detail', 'yango-commission-detail'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });

    if (driversCard) {
      driversCard.innerHTML = `
        <div class="yango-error">
          <i class="fas fa-exclamation-triangle"></i>
          <span>${message}</span>
          <button class="btn btn-sm btn-secondary" onclick="DashboardPage._loadYangoSection()" style="margin-top:8px;">
            <i class="fas fa-redo"></i> Reessayer
          </button>
        </div>
      `;
    }
  },

  // =================== CHARTS ===================

  _loadCharts(d) {
    this._charts = [];

    // ======= 1. Revenue chart (line) =======
    const revenueCtx = document.getElementById('chart-revenue');
    if (revenueCtx) {
      this._charts.push(new Chart(revenueCtx, {
        type: 'line',
        data: {
          labels: d.monthlyRevenue.map(m => m.month),
          datasets: [{
            label: "Chiffre d'affaires",
            data: d.monthlyRevenue.map(m => m.revenue),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            borderWidth: 2,
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#111827',
            pointBorderWidth: 2,
            pointHoverRadius: 8,
            pointHoverBorderWidth: 3,
            pointHoverBackgroundColor: '#3b82f6',
            pointHoverBorderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => items.length ? `${items[0].label}` : '',
                label: (ctx) => {
                  const val = Utils.formatCurrency(ctx.raw);
                  const idx = ctx.dataIndex;
                  const data = ctx.dataset.data;
                  if (idx > 0 && data[idx - 1] > 0) {
                    const variation = ((ctx.raw - data[idx - 1]) / data[idx - 1] * 100).toFixed(1);
                    const arrow = variation >= 0 ? '+' : '';
                    return [`CA : ${val}`, `${arrow}${variation}% vs mois precedent`];
                  }
                  return `CA : ${val}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (val) => Utils.formatCurrency(val) }
            }
          }
        }
      }));
    }

    // ======= 2. Weekly payments chart (bar) =======
    const paymentsCtx = document.getElementById('chart-payments');
    if (paymentsCtx) {
      this._charts.push(new Chart(paymentsCtx, {
        type: 'bar',
        data: {
          labels: d.weeklyPayments.map(w => w.label),
          datasets: [
            {
              label: 'Verse',
              data: d.weeklyPayments.map(w => Math.round(w.verse)),
              backgroundColor: '#3b82f6',
              hoverBackgroundColor: '#2563eb',
              borderRadius: 4
            },
            {
              label: 'Attendu',
              data: d.weeklyPayments.map(w => Math.round(w.attendu)),
              backgroundColor: 'rgba(250, 204, 21, 0.6)',
              hoverBackgroundColor: 'rgba(250, 204, 21, 0.9)',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                title: (items) => items.length ? `Semaine ${items[0].label}` : '',
                label: (ctx) => `${ctx.dataset.label} : ${Utils.formatCurrency(ctx.raw)}`,
                afterBody: (items) => {
                  if (!items.length) return '';
                  const idx = items[0].dataIndex;
                  const verse = d.weeklyPayments[idx].verse;
                  const attendu = d.weeklyPayments[idx].attendu;
                  const taux = attendu > 0 ? (verse / attendu * 100).toFixed(1) : 0;
                  return `\nTaux de recouvrement : ${taux}%`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (val) => Utils.formatCurrency(val) }
            }
          }
        }
      }));
    }

    // ======= 3. Rides by type chart (doughnut) =======
    const ridesCtx = document.getElementById('chart-rides');
    if (ridesCtx) {
      const types = Object.keys(d.coursesByType);
      const colors = ['#3b82f6', '#facc15', '#22d3ee', '#22c55e', '#f59e0b'];
      const totalRides = types.reduce((s, t) => s + d.coursesByType[t], 0);

      this._charts.push(new Chart(ridesCtx, {
        type: 'doughnut',
        data: {
          labels: types.map(t => d.typeLabels[t] || t),
          datasets: [{
            data: types.map(t => d.coursesByType[t]),
            backgroundColor: colors.slice(0, types.length),
            borderColor: '#111827',
            borderWidth: 2,
            hoverOffset: 12
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { padding: 12, font: { size: 11 } }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw;
                  const pct = totalRides > 0 ? (val / totalRides * 100).toFixed(1) : 0;
                  return `${ctx.label} : ${val} courses (${pct}%)`;
                }
              }
            }
          },
          cutout: '65%'
        },
        plugins: [Utils.doughnutCenterPlugin(
          () => totalRides.toString(),
          'courses'
        )]
      }));
    }

    // ======= 4. Vehicle profitability (horizontal bar) =======
    const profitCtx = document.getElementById('chart-profit');
    if (profitCtx) {
      this._charts.push(new Chart(profitCtx, {
        type: 'bar',
        data: {
          labels: d.vehicleProfit.map(v => v.label),
          datasets: [{
            label: 'Profit mensuel',
            data: d.vehicleProfit.map(v => v.profit),
            backgroundColor: d.vehicleProfit.map(v => v.profit >= 0 ? '#22c55e' : '#ef4444'),
            hoverBackgroundColor: d.vehicleProfit.map(v => v.profit >= 0 ? '#16a34a' : '#dc2626'),
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => items.length ? `${items[0].label}` : '',
                label: (ctx) => {
                  const val = Utils.formatCurrency(ctx.raw);
                  const status = ctx.raw >= 0 ? 'Profitable' : 'Deficitaire';
                  return [`Profit : ${val}`, status];
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { callback: (val) => Utils.formatCurrency(val) }
            }
          }
        }
      }));
    }
  },

  refresh() {
    this.destroy();
    this.render();
    Toast.info('Tableau de bord actualise');
  }
};
