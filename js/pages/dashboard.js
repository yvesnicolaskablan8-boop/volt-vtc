/**
 * DashboardPage - Main dashboard with KPIs and charts (internal Volt data)
 */
const DashboardPage = {
  _charts: [],
  _refreshInterval: null,
  _lastData: null,

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    this._lastData = data;
    container.innerHTML = this._template(data);
    this._loadCharts(data);
    this._startAutoRefresh();
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
    this._stopAutoRefresh();
  },

  _startAutoRefresh() {
    this._stopAutoRefresh();
    this._refreshInterval = setInterval(() => {
      this._silentRefresh();
    }, 30000);
  },

  _stopAutoRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  },

  _silentRefresh() {
    const indicator = document.getElementById('live-indicator');
    if (indicator) {
      indicator.classList.add('pulse');
      setTimeout(() => indicator.classList.remove('pulse'), 1500);
    }
    this.destroy();
    const container = document.getElementById('page-content');
    if (!container) return;
    const data = this._getData();
    this._lastData = data;
    container.innerHTML = this._template(data);
    this._loadCharts(data);
    this._startAutoRefresh();
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

    // Maintenance alerts
    const maintenanceAlerts = [];
    vehicules.forEach(v => {
      if (!v.maintenancesPlanifiees) return;
      const chauffeur = chauffeurs.find(c => c.vehiculeAssigne === v.id);
      v.maintenancesPlanifiees.forEach(m => {
        if (m.statut === 'en_retard' || m.statut === 'urgent') {
          maintenanceAlerts.push({
            ...m,
            vehiculeLabel: `${v.marque} ${v.modele}`,
            immatriculation: v.immatriculation,
            vehiculeId: v.id,
            chauffeurNom: chauffeur ? `${chauffeur.prenom} ${chauffeur.nom}` : null
          });
        }
      });
    });
    const ordre = { en_retard: 0, urgent: 1 };
    maintenanceAlerts.sort((a, b) => (ordre[a.statut] || 9) - (ordre[b.statut] || 9));

    // =================== RECETTES IMPAYÉES ===================
    const planning = Store.get('planning') || [];
    const absences = Store.get('absences') || [];
    const today = now.toISOString().split('T')[0];

    // Limiter aux 30 derniers jours
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const minDate = thirtyDaysAgo.toISOString().split('T')[0];

    // Dédupliquer par (chauffeurId, date) — un seul impayé par jour même si 2 shifts
    const scheduledDays = new Map();
    planning.filter(p => p.date <= today && p.date >= minDate).forEach(p => {
      const key = `${p.chauffeurId}|${p.date}`;
      if (!scheduledDays.has(key)) scheduledDays.set(key, p);
    });

    // Vérifier les versements
    const unpaidItems = [];
    scheduledDays.forEach((p) => {
      // Skip si absence
      const hasAbsence = absences.some(a => a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin);
      if (hasAbsence) return;
      // Skip si chauffeur inactif
      const ch = chauffeurs.find(c => c.id === p.chauffeurId);
      if (!ch || ch.statut === 'inactif') return;
      // Skip si chauffeur n'a pas de redevance définie
      const redevance = ch.redevanceQuotidienne || 0;
      if (redevance <= 0) return;
      // Vérifier si versement valide existe
      const hasValidPayment = versements.some(v => v.chauffeurId === p.chauffeurId && v.date === p.date && v.statut === 'valide');
      if (!hasValidPayment) {
        // Chercher un versement existant (même non validé) pour la justification
        const existing = versements.find(v => v.chauffeurId === p.chauffeurId && v.date === p.date);
        // Calcul pénalités progressives
        const joursRetard = Math.floor((now - new Date(p.date)) / 86400000);
        let tauxPenalite = 0;
        if (joursRetard > 7) tauxPenalite = 0.15;
        else if (joursRetard > 4) tauxPenalite = 0.10;
        else if (joursRetard > 2) tauxPenalite = 0.05;
        const penalite = Math.round(redevance * tauxPenalite);
        unpaidItems.push({
          planningId: p.id,
          chauffeurId: p.chauffeurId,
          date: p.date,
          typeCreneaux: p.typeCreneaux,
          heureDebut: p.heureDebut,
          heureFin: p.heureFin,
          montantDu: redevance,
          joursRetard,
          tauxPenalite,
          penalite,
          totalDu: redevance + penalite,
          justification: existing ? existing.justification : null,
          versementId: existing ? existing.id : null
        });
      }
    });

    // Trier par date décroissante
    unpaidItems.sort((a, b) => b.date.localeCompare(a.date));
    const totalUnpaid = unpaidItems.reduce((s, i) => s + i.montantDu, 0);
    const totalPenalites = unpaidItems.reduce((s, i) => s + i.penalite, 0);

    // =================== DÉPENSES VÉHICULES ===================
    const depenses = Store.get('depenses') || [];
    const monthDepenses = depenses.filter(dep => {
      const d = new Date(dep.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const totalDepensesMois = monthDepenses.reduce((s, d) => s + (d.montant || 0), 0);
    const depensesByType = {};
    monthDepenses.forEach(d => {
      depensesByType[d.typeDepense] = (depensesByType[d.typeDepense] || 0) + d.montant;
    });

    return {
      caThisMonth, caTrend, totalVerse, retardCount,
      activeCount, vehiclesActifs, vehiclesEV, vehiclesThermique,
      monthCourses: monthCourses.length,
      monthlyRevenue, weeklyPayments,
      coursesByType, typeLabels, vehicleProfit,
      recentVersements, chauffeurs, vehiculesTotal: vehicules.length,
      maintenanceAlerts, unpaidItems, totalUnpaid, totalPenalites,
      depenses, monthDepenses, totalDepensesMois, depensesByType, vehicules
    };
  },

  _template(d) {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:spedometer-max-bold-duotone"></iconify-icon> Tableau de bord</h1>
        <div class="page-actions">
          <span id="live-indicator" style="display:inline-flex;align-items:center;gap:4px;font-size:var(--font-size-xs);color:#22c55e;background:rgba(34,197,94,0.1);padding:4px 10px;border-radius:20px;font-weight:600;">
            <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulse-dot 2s infinite;"></span> EN DIRECT
          </span>
          <button class="btn btn-secondary" onclick="DashboardPage._sendPaymentReminders()" title="Envoyer rappels de paiement"><iconify-icon icon="solar:bell-bold-duotone"></iconify-icon> Rappels</button>
          <button class="btn btn-secondary" onclick="DashboardPage._sendAnnouncement()" title="Envoyer annonce"><iconify-icon icon="solar:letter-bold-duotone"></iconify-icon></button>
          <button class="btn btn-secondary" onclick="DashboardPage.refresh()"><iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Actualiser</button>
        </div>
      </div>
      <style>
        @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        #live-indicator.pulse { animation: flash-indicator 1.5s; }
        @keyframes flash-indicator { 0% { background:rgba(34,197,94,0.3); } 100% { background:rgba(34,197,94,0.1); } }
      </style>

      <!-- KPI Cards -->
      <div class="grid-4">
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(d.caThisMonth)}</div>
          <div class="kpi-label">Chiffre d'affaires du mois</div>
          <div class="kpi-trend ${d.caTrend >= 0 ? 'up' : 'down'}">
            <iconify-icon icon="solar:arrow-${d.caTrend >= 0 ? 'up' : 'down'}-bold"></iconify-icon> ${Math.abs(d.caTrend).toFixed(1)}%
          </div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><iconify-icon icon="solar:transfer-horizontal-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(d.totalVerse)}</div>
          <div class="kpi-label">Versements recus ce mois</div>
          <div class="kpi-trend ${d.retardCount > 0 ? 'down' : 'up'}">
            <iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> ${d.retardCount} en retard
          </div>
        </div>
        <div class="kpi-card ${d.retardCount > 0 ? 'red' : 'cyan'}">
          <div class="kpi-icon"><iconify-icon icon="solar:bill-cross-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.retardCount}</div>
          <div class="kpi-label">Versements en retard</div>
          <div class="kpi-trend ${d.retardCount > 0 ? 'down' : 'up'}">
            <iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon> ${d.activeCount} chauffeurs actifs
          </div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-icon"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.vehiclesActifs}</div>
          <div class="kpi-label">Vehicules en service</div>
          <div class="kpi-trend neutral">
            <iconify-icon icon="solar:bolt-bold-duotone" style="color:var(--volt-yellow)"></iconify-icon> ${d.vehiclesEV} EV
            <span style="margin:0 2px">&bull;</span>
            <iconify-icon icon="solar:gas-station-bold-duotone"></iconify-icon> ${d.vehiclesThermique} therm.
          </div>
        </div>
      </div>

      <!-- Maintenance Alerts -->
      ${this._renderMaintenanceAlerts(d)}

      <!-- Recettes impayées -->
      ${this._renderUnpaidSection(d)}

      <!-- Charts Row 1 -->
      <div class="charts-grid">
        <div class="chart-card full-width">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> Evolution du chiffre d'affaires</div>
          </div>
          <div class="chart-container" style="height: 300px;">
            <canvas id="chart-revenue"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Versements hebdomadaires</div>
          </div>
          <div class="chart-container" style="height: 280px;">
            <canvas id="chart-payments"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:pie-chart-2-bold-duotone"></iconify-icon> Repartition des courses</div>
          </div>
          <div class="chart-container" style="height: 280px;">
            <canvas id="chart-rides"></canvas>
          </div>
        </div>
      </div>

      <!-- Dépenses véhicules -->
      ${this._renderDepensesSection(d)}

      <!-- Bottom section -->
      <div class="charts-grid" style="margin-top: var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Rentabilite par vehicule</div>
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
                    <div style="font-size:var(--font-size-xs); color:var(--text-muted);">${v.moyenPaiement || v.periode || ''} - ${Utils.formatDate(v.date)}</div>
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

  _renderMaintenanceAlerts(d) {
    if (!d.maintenanceAlerts || d.maintenanceAlerts.length === 0) return '';

    const typeLabels = { vidange:'Vidange', revision:'Revision', pneus:'Pneus', freins:'Freins', filtres:'Filtres', climatisation:'Clim.', courroie:'Courroie', controle_technique:'CT', batterie:'Batterie', amortisseurs:'Amortisseurs', echappement:'Echappement', carrosserie:'Carrosserie', autre:'Autre' };
    const hasRetard = d.maintenanceAlerts.some(m => m.statut === 'en_retard');
    const borderColor = hasRetard ? '#ef4444' : '#f59e0b';

    const rows = d.maintenanceAlerts.slice(0, 5).map(m => {
      const isRetard = m.statut === 'en_retard';
      const color = isRetard ? '#ef4444' : '#f59e0b';
      const icon = isRetard ? 'solar:danger-circle-bold-duotone' : 'solar:danger-triangle-bold-duotone';
      const badgeLabel = isRetard ? 'EN RETARD' : 'URGENT';
      let echeance = '';
      if (m.prochaineDate) {
        const jours = Math.ceil((new Date(m.prochaineDate) - new Date()) / 86400000);
        if (jours < 0) echeance = Math.abs(jours) + 'j de retard';
        else if (jours === 0) echeance = "aujourd\u2019hui";
        else echeance = 'dans ' + jours + 'j';
      }
      const typeLabel = typeLabels[m.type] || m.type;
      const chauffeurInfo = m.chauffeurNom ? ' \u2014 ' + m.chauffeurNom : '';

      return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--radius-sm);background:var(--bg-tertiary);cursor:pointer;" onclick="Router.navigate('/vehicules/${m.vehiculeId}')">
        <iconify-icon icon="${icon}" style="color:${color};font-size:0.9rem;flex-shrink:0;"></iconify-icon>
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--font-size-sm);font-weight:600;">${typeLabel} <span style="font-size:var(--font-size-xs);font-weight:700;color:${color};">${badgeLabel}</span></div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.vehiculeLabel} (${m.immatriculation})${chauffeurInfo}</div>
        </div>
        ${echeance ? `<div style="font-size:var(--font-size-xs);color:${color};font-weight:600;white-space:nowrap;">${echeance}</div>` : ''}
      </div>`;
    }).join('');

    const moreText = d.maintenanceAlerts.length > 5 ? `<div style="text-align:center;padding:4px;font-size:var(--font-size-xs);color:var(--text-muted);">+ ${d.maintenanceAlerts.length - 5} autre(s)...</div>` : '';

    return `<div class="card" style="margin-top:var(--space-lg);border-left:4px solid ${borderColor};">
      <div class="card-header">
        <span class="card-title"><iconify-icon icon="solar:tuning-2-bold-duotone" style="color:${borderColor};"></iconify-icon> Alertes maintenance (${d.maintenanceAlerts.length})</span>
        <a href="#/maintenances" class="btn btn-sm btn-secondary">Voir tout</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${rows}
        ${moreText}
      </div>
    </div>`;
  },

  // =================== RECETTES IMPAYÉES ===================

  _renderUnpaidSection(d) {
    if (!d.unpaidItems || d.unpaidItems.length === 0) return '';

    const rows = d.unpaidItems.slice(0, 5).map(item => {
      const ch = d.chauffeurs.find(c => c.id === item.chauffeurId);
      const name = ch ? `${ch.prenom} ${ch.nom}` : item.chauffeurId;
      const hasJustif = !!item.justification;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-radius:var(--radius-sm);background:var(--bg-tertiary);">
        <div style="min-width:0;flex:1;">
          <div style="font-size:var(--font-size-sm);font-weight:500;">${name}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${Utils.formatDate(item.date)}${item.heureDebut && item.heureFin ? ' \u2014 ' + item.heureDebut + ' \u00e0 ' + item.heureFin : ''} &bull; ${item.joursRetard}j de retard</div>
          ${hasJustif ? `<div style="font-size:var(--font-size-xs);color:var(--volt-blue);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> ${item.justification}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:8px;">
          <div style="font-size:var(--font-size-sm);font-weight:600;color:#ef4444;">${Utils.formatCurrency(item.montantDu)}</div>
          ${item.penalite > 0 ? `<div style="font-size:10px;color:#f59e0b;font-weight:600;">+ ${Utils.formatCurrency(item.penalite)} p\u00e9nalit\u00e9</div>` : ''}
        </div>
      </div>`;
    }).join('');

    const moreText = d.unpaidItems.length > 5 ? `<div style="text-align:center;padding:4px;font-size:var(--font-size-xs);color:var(--text-muted);">+ ${d.unpaidItems.length - 5} autre(s)...</div>` : '';

    return `<div class="card" style="margin-top:var(--space-lg);border-left:4px solid #ef4444;cursor:pointer;" onclick="DashboardPage._showUnpaidDetails()">
      <div class="card-header">
        <span class="card-title"><iconify-icon icon="solar:bill-cross-bold-duotone" style="color:#ef4444;"></iconify-icon> Recettes impay\u00e9es (${d.unpaidItems.length})</span>
        <div style="text-align:right;">
          <div style="font-size:var(--font-size-base);font-weight:700;color:#ef4444;">${Utils.formatCurrency(d.totalUnpaid)}</div>
          ${d.totalPenalites > 0 ? `<div style="font-size:var(--font-size-xs);color:#f59e0b;font-weight:600;"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> + ${Utils.formatCurrency(d.totalPenalites)} p\u00e9nalit\u00e9s</div>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${rows}
        ${moreText}
      </div>
    </div>`;
  },

  _showUnpaidDetails() {
    const data = this._getData();
    if (!data.unpaidItems || data.unpaidItems.length === 0) {
      Toast.info('Aucune recette impay\u00e9e');
      return;
    }

    // Stocker pour filtrage
    this._unpaidData = data;
    this._unpaidFilters = { chauffeurId: '', dateFrom: '', dateTo: '', minRetard: 0 };

    const chauffeurIds = [...new Set(data.unpaidItems.map(i => i.chauffeurId))];
    const chauffeurOptions = chauffeurIds.map(id => {
      const ch = data.chauffeurs.find(c => c.id === id);
      return ch ? `<option value="${id}">${ch.prenom} ${ch.nom}</option>` : '';
    }).join('');

    const filtersHtml = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:1;min-width:140px;">
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">Chauffeur</label>
          <select class="form-control" id="unpaid-filter-chauffeur" style="font-size:var(--font-size-xs);padding:6px 8px;" onchange="DashboardPage._applyUnpaidFilters()">
            <option value="">Tous</option>
            ${chauffeurOptions}
          </select>
        </div>
        <div>
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">Du</label>
          <input type="date" class="form-control" id="unpaid-filter-from" style="font-size:var(--font-size-xs);padding:6px 8px;" onchange="DashboardPage._applyUnpaidFilters()">
        </div>
        <div>
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">Au</label>
          <input type="date" class="form-control" id="unpaid-filter-to" style="font-size:var(--font-size-xs);padding:6px 8px;" onchange="DashboardPage._applyUnpaidFilters()">
        </div>
        <div>
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">Retard min (j)</label>
          <input type="number" class="form-control" id="unpaid-filter-retard" min="0" value="0" style="font-size:var(--font-size-xs);padding:6px 8px;width:80px;" onchange="DashboardPage._applyUnpaidFilters()">
        </div>
        <button class="btn btn-sm btn-success" onclick="DashboardPage._exportUnpaidExcel()" title="Exporter en Excel">
          <iconify-icon icon="solar:file-download-bold-duotone"></iconify-icon> Excel
        </button>
      </div>
      <div id="unpaid-summary" style="display:flex;gap:12px;margin-bottom:8px;font-size:var(--font-size-xs);padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);"></div>
    `;

    const rows = this._renderUnpaidRows(data.unpaidItems, data.chauffeurs);

    Modal.open({
      title: '<iconify-icon icon="solar:bill-cross-bold-duotone" style="color:#ef4444;"></iconify-icon> Recettes impay\u00e9es (' + data.unpaidItems.length + ')',
      body: filtersHtml + `<div id="unpaid-rows-container" style="display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto;">${rows}</div>`,
      footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>',
      size: 'large'
    });

    this._updateUnpaidSummary(data.unpaidItems);
  },

  _renderUnpaidRows(items, chauffeurs) {
    return items.map(item => {
      const ch = chauffeurs.find(c => c.id === item.chauffeurId);
      const name = ch ? `${ch.prenom} ${ch.nom}` : item.chauffeurId;
      const hasJustif = !!item.justification;
      const creneauLabel = item.heureDebut && item.heureFin ? `${item.heureDebut} \u00e0 ${item.heureFin}` : (item.typeCreneaux || '');
      const penaliteHtml = item.penalite > 0 ? `<div style="font-size:10px;color:#f59e0b;font-weight:600;">+ ${Utils.formatCurrency(item.penalite)} (${Math.round(item.tauxPenalite*100)}%)</div>` : '';

      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:var(--radius-sm);background:var(--bg-tertiary);gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--font-size-sm);font-weight:600;">${name}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${Utils.formatDate(item.date)}${creneauLabel ? ' \u2014 ' + creneauLabel : ''} &bull; <span style="color:${item.joursRetard > 4 ? '#ef4444' : '#f59e0b'};font-weight:600;">${item.joursRetard}j de retard</span></div>
          ${hasJustif ? `<div style="font-size:var(--font-size-xs);color:var(--volt-blue);margin-top:2px;"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> ${item.justification}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:var(--font-size-sm);font-weight:600;color:#ef4444;">${Utils.formatCurrency(item.montantDu)}</div>
          ${penaliteHtml}
          <div style="display:flex;gap:4px;margin-top:4px;">
            <button class="btn btn-sm btn-success" onclick="event.stopPropagation();DashboardPage._payReceipt('${item.chauffeurId}','${item.date}','${item.planningId}','${item.versementId || ''}',${item.totalDu})">
              <iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon> Payer
            </button>
            <button class="btn btn-sm ${hasJustif ? 'btn-secondary' : 'btn-outline'}" onclick="event.stopPropagation();DashboardPage._addJustification('${item.chauffeurId}','${item.date}','${item.planningId}','${item.versementId || ''}')">
              <iconify-icon icon="solar:document-add-bold-duotone"></iconify-icon> ${hasJustif ? 'Modifier' : 'Justifier'}
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
  },

  _updateUnpaidSummary(items) {
    const el = document.getElementById('unpaid-summary');
    if (!el) return;
    const total = items.reduce((s, i) => s + i.montantDu, 0);
    const totalPen = items.reduce((s, i) => s + i.penalite, 0);
    const avgRetard = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.joursRetard, 0) / items.length) : 0;
    el.innerHTML = `
      <div><strong>${items.length}</strong> impay\u00e9(s)</div>
      <div>Total: <strong style="color:#ef4444;">${Utils.formatCurrency(total)}</strong></div>
      ${totalPen > 0 ? `<div>P\u00e9nalit\u00e9s: <strong style="color:#f59e0b;">${Utils.formatCurrency(totalPen)}</strong></div>` : ''}
      <div>Retard moy: <strong>${avgRetard}j</strong></div>
    `;
  },

  _applyUnpaidFilters() {
    if (!this._unpaidData) return;
    let items = [...this._unpaidData.unpaidItems];

    const chauffeurId = document.getElementById('unpaid-filter-chauffeur')?.value;
    const dateFrom = document.getElementById('unpaid-filter-from')?.value;
    const dateTo = document.getElementById('unpaid-filter-to')?.value;
    const minRetard = parseInt(document.getElementById('unpaid-filter-retard')?.value) || 0;

    if (chauffeurId) items = items.filter(i => i.chauffeurId === chauffeurId);
    if (dateFrom) items = items.filter(i => i.date >= dateFrom);
    if (dateTo) items = items.filter(i => i.date <= dateTo);
    if (minRetard > 0) items = items.filter(i => i.joursRetard >= minRetard);

    const container = document.getElementById('unpaid-rows-container');
    if (container) container.innerHTML = this._renderUnpaidRows(items, this._unpaidData.chauffeurs);
    this._updateUnpaidSummary(items);
  },

  _exportUnpaidExcel() {
    const data = this._unpaidData || this._getData();
    let items = [...data.unpaidItems];

    // Appliquer les filtres actifs
    const chauffeurId = document.getElementById('unpaid-filter-chauffeur')?.value;
    const dateFrom = document.getElementById('unpaid-filter-from')?.value;
    const dateTo = document.getElementById('unpaid-filter-to')?.value;
    const minRetard = parseInt(document.getElementById('unpaid-filter-retard')?.value) || 0;
    if (chauffeurId) items = items.filter(i => i.chauffeurId === chauffeurId);
    if (dateFrom) items = items.filter(i => i.date >= dateFrom);
    if (dateTo) items = items.filter(i => i.date <= dateTo);
    if (minRetard > 0) items = items.filter(i => i.joursRetard >= minRetard);

    const headers = ['Chauffeur', 'Date', 'Cr\u00e9neau', 'Montant d\u00fb', 'Jours retard', 'Taux p\u00e9nalit\u00e9', 'P\u00e9nalit\u00e9', 'Total d\u00fb', 'Justification'];
    const rows = items.map(i => {
      const ch = data.chauffeurs.find(c => c.id === i.chauffeurId);
      return [
        ch ? `${ch.prenom} ${ch.nom}` : i.chauffeurId,
        i.date,
        i.heureDebut && i.heureFin ? `${i.heureDebut}-${i.heureFin}` : i.typeCreneaux || '',
        i.montantDu,
        i.joursRetard,
        `${Math.round(i.tauxPenalite * 100)}%`,
        i.penalite,
        i.totalDu,
        i.justification || ''
      ];
    });
    Utils.exportCSV(headers, rows, `volt-impayes-${new Date().toISOString().split('T')[0]}.csv`);
    Toast.success(`${items.length} impay\u00e9(s) export\u00e9(s) en Excel`);
  },

  _addJustification(chauffeurId, date, planningId, versementId) {
    const versements = Store.get('versements') || [];
    const existing = versementId && versementId !== 'null' ? versements.find(v => v.id === versementId) : versements.find(v => v.chauffeurId === chauffeurId && v.date === date);

    const fields = [
      { name: 'justification', label: 'Justificatif / Raison', type: 'textarea', rows: 3, placeholder: 'Expliquer pourquoi la recette n\'a pas \u00e9t\u00e9 pay\u00e9e...', required: true }
    ];

    const existingValues = existing ? { justification: existing.justification || '' } : {};

    Modal.form(
      '<iconify-icon icon="solar:document-add-bold-duotone" style="color:var(--volt-blue);"></iconify-icon> Justifier l\'impay\u00e9',
      FormBuilder.build(fields, existingValues),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        if (existing) {
          Store.update('versements', existing.id, {
            justification: values.justification,
            justificationDate: new Date().toISOString()
          });
        } else {
          Store.add('versements', {
            id: Utils.generateId('VRS'),
            chauffeurId,
            date,
            periode: '',
            montantVerse: 0,
            statut: 'en_attente',
            justification: values.justification,
            justificationDate: new Date().toISOString(),
            dateCreation: new Date().toISOString()
          });
        }

        Modal.close();
        Toast.success('Justificatif enregistr\u00e9');
        this.render();
      }
    );
  },

  _payReceipt(chauffeurId, date, planningId, versementId, montantDu) {
    const versements = Store.get('versements') || [];
    const existing = versementId && versementId !== 'null' ? versements.find(v => v.id === versementId) : versements.find(v => v.chauffeurId === chauffeurId && v.date === date);
    const chauffeurs = Store.get('chauffeurs') || [];
    const ch = chauffeurs.find(c => c.id === chauffeurId);
    const name = ch ? `${ch.prenom} ${ch.nom}` : chauffeurId;

    const fields = [
      { type: 'heading', label: `Paiement pour ${name} \u2014 ${date}` },
      { type: 'row-start' },
      { name: 'montantVerse', label: 'Montant vers\u00e9 (FCFA)', type: 'number', required: true, min: 0, step: 100, default: montantDu || 0, placeholder: 'Montant de la redevance...' },
      { name: 'moyenPaiement', label: 'Moyen de paiement', type: 'select', required: true, options: [
        { value: 'especes', label: 'Esp\u00e8ces' },
        { value: 'mobile_money', label: 'Mobile Money' },
        { value: 'wave', label: 'Wave' },
        { value: 'orange_money', label: 'Orange Money' },
        { value: 'virement', label: 'Virement bancaire' },
        { value: 'cheque', label: 'Ch\u00e8que' },
        { value: 'autre', label: 'Autre' }
      ]},
      { type: 'row-end' },
      { name: 'referencePaiement', label: 'R\u00e9f\u00e9rence / N\u00b0 transaction', type: 'text', placeholder: 'Num\u00e9ro de transaction, re\u00e7u...' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2, placeholder: 'Notes sur le paiement...' }
    ];

    const existingValues = existing ? {
      montantVerse: existing.montantVerse || montantDu || 0,
      moyenPaiement: existing.moyenPaiement || '',
      referencePaiement: existing.referencePaiement || '',
      commentaire: existing.commentaire || ''
    } : {};

    Modal.form(
      '<iconify-icon icon="solar:hand-money-bold-duotone" style="color:#22c55e;"></iconify-icon> Encaisser la recette',
      FormBuilder.build(fields, existingValues),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);
        const montant = parseFloat(values.montantVerse) || 0;

        if (montant <= 0) {
          Toast.error('Le montant doit \u00eatre sup\u00e9rieur \u00e0 0');
          return;
        }

        if (existing) {
          Store.update('versements', existing.id, {
            montantVerse: montant,
            statut: 'valide',
            moyenPaiement: values.moyenPaiement,
            referencePaiement: values.referencePaiement,
            commentaire: values.commentaire,
            dateValidation: new Date().toISOString()
          });
        } else {
          Store.add('versements', {
            id: Utils.generateId('VRS'),
            chauffeurId,
            date,
            periode: '',
            montantVerse: montant,
            statut: 'valide',
            moyenPaiement: values.moyenPaiement,
            referencePaiement: values.referencePaiement,
            commentaire: values.commentaire,
            dateValidation: new Date().toISOString(),
            dateCreation: new Date().toISOString()
          });
        }

        Modal.close();
        Toast.success('Paiement enregistr\u00e9 \u2014 ' + Utils.formatCurrency(montant));

        // Proposer le PDF
        setTimeout(() => {
          Modal.confirm(
            'G\u00e9n\u00e9rer le re\u00e7u PDF ?',
            `Voulez-vous g\u00e9n\u00e9rer un re\u00e7u PDF pour ce paiement de <strong>${Utils.formatCurrency(montant)}</strong> ?`,
            () => {
              this._generateReceiptPDF(chauffeurId, date, montant, values.moyenPaiement, values.referencePaiement);
            }
          );
        }, 300);

        this.render();
      }
    );
  },

  refresh() {
    this.destroy();
    this.render();
    Toast.info('Tableau de bord actualis\u00e9');
  },

  // =================== NOTIFICATIONS PUSH ===================

  _sendPaymentReminders() {
    const data = this._lastData || this._getData();
    if (!data.unpaidItems || data.unpaidItems.length === 0) {
      Toast.info('Aucun impay\u00e9 \u00e0 notifier');
      return;
    }

    // Regrouper par chauffeur
    const byDriver = {};
    data.unpaidItems.forEach(item => {
      if (!byDriver[item.chauffeurId]) byDriver[item.chauffeurId] = [];
      byDriver[item.chauffeurId].push(item);
    });

    const drivers = Object.keys(byDriver);
    const lines = drivers.map(id => {
      const ch = data.chauffeurs.find(c => c.id === id);
      const name = ch ? `${ch.prenom} ${ch.nom}` : id;
      const count = byDriver[id].length;
      const total = byDriver[id].reduce((s, i) => s + i.totalDu, 0);
      return `<div style="font-size:var(--font-size-xs);padding:4px 0;"><strong>${name}</strong> \u2014 ${count} impay\u00e9(s), ${Utils.formatCurrency(total)}</div>`;
    }).join('');

    Modal.open({
      title: '<iconify-icon icon="solar:bell-bold-duotone" style="color:#3b82f6;"></iconify-icon> Envoyer des rappels',
      body: `
        <div style="margin-bottom:12px;font-size:var(--font-size-sm);">${drivers.length} chauffeur(s) concern\u00e9(s) :</div>
        <div style="max-height:200px;overflow-y:auto;background:var(--bg-tertiary);padding:8px 12px;border-radius:var(--radius-sm);margin-bottom:12px;">${lines}</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <label style="font-size:var(--font-size-sm);font-weight:500;">Canal :</label>
          <select class="form-control" id="notif-canal" style="width:auto;font-size:var(--font-size-xs);">
            <option value="push">Push notification</option>
            <option value="sms">SMS</option>
            <option value="both">Push + SMS</option>
          </select>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Un rappel de paiement sera envoy\u00e9 \u00e0 chaque chauffeur concern\u00e9.</div>
      `,
      footer: `<button class="btn btn-primary" onclick="DashboardPage._confirmSendReminders()"><iconify-icon icon="solar:bell-bold-duotone"></iconify-icon> Envoyer</button><button class="btn btn-secondary" data-action="cancel">Annuler</button>`,
      size: 'medium'
    });
  },

  async _confirmSendReminders() {
    const canal = document.getElementById('notif-canal')?.value || 'push';
    Modal.close();
    Toast.info('Envoi des rappels en cours...');

    try {
      const res = await fetch(Store._apiBase + '/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('volt_token')
        },
        body: JSON.stringify({
          titre: 'Rappel de paiement',
          message: 'Vous avez des redevances en attente de paiement. Veuillez r\u00e9gulariser votre situation dans les plus brefs d\u00e9lais.',
          canal
        })
      });

      if (res.ok) {
        const result = await res.json();
        Toast.success(`${result.sent || 0} rappel(s) envoy\u00e9(s) avec succ\u00e8s`);
      } else {
        Toast.error('Erreur lors de l\'envoi des rappels');
      }
    } catch (err) {
      // Fallback: log locally
      const data = this._lastData || this._getData();
      const notifications = data.unpaidItems.map(item => ({
        id: Utils.generateId('NTF'),
        chauffeurId: item.chauffeurId,
        type: 'deadline_rappel',
        titre: 'Rappel de paiement',
        message: `Redevance du ${Utils.formatDate(item.date)} en attente: ${Utils.formatCurrency(item.totalDu)}`,
        canal,
        statut: 'envoyee',
        dateCreation: new Date().toISOString()
      }));
      notifications.forEach(n => Store.add('notifications', n));
      Toast.success(`${notifications.length} rappel(s) enregistr\u00e9(s)`);
    }
  },

  _sendAnnouncement() {
    const fields = [
      { name: 'titre', label: 'Titre', type: 'text', required: true, placeholder: 'Titre de l\'annonce...' },
      { name: 'message', label: 'Message', type: 'textarea', rows: 4, required: true, placeholder: 'Contenu de l\'annonce...' },
      { name: 'canal', label: 'Canal', type: 'select', options: [
        { value: 'push', label: 'Push notification' },
        { value: 'sms', label: 'SMS' },
        { value: 'both', label: 'Push + SMS' }
      ]}
    ];

    Modal.form(
      '<iconify-icon icon="solar:letter-bold-duotone" style="color:#3b82f6;"></iconify-icon> Envoyer une annonce',
      FormBuilder.build(fields),
      async () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        Modal.close();
        Toast.info('Envoi en cours...');

        try {
          const res = await fetch(Store._apiBase + '/notifications/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + localStorage.getItem('volt_token')
            },
            body: JSON.stringify(values)
          });

          if (res.ok) {
            const result = await res.json();
            Toast.success(`Annonce envoy\u00e9e \u00e0 ${result.sent || 0} chauffeur(s)`);
          } else {
            Toast.error('Erreur lors de l\'envoi');
          }
        } catch (err) {
          Toast.error('API indisponible \u2014 annonce non envoy\u00e9e');
        }
      }
    );
  },

  // =================== DÉPENSES VÉHICULES ===================

  _renderDepensesSection(d) {
    const typeLabels = { carburant: 'Carburant', peage: 'P\u00e9age', lavage: 'Lavage', assurance: 'Assurance', reparation: 'R\u00e9paration', stationnement: 'Stationnement', autre: 'Autre' };
    const typeIcons = { carburant: 'solar:gas-station-bold-duotone', peage: 'solar:road-bold-duotone', lavage: 'solar:washing-machine-bold-duotone', assurance: 'solar:shield-check-bold-duotone', reparation: 'solar:wrench-bold-duotone', stationnement: 'solar:map-point-bold-duotone', autre: 'solar:bag-bold-duotone' };

    const typeEntries = Object.entries(d.depensesByType || {}).sort((a, b) => b[1] - a[1]);
    const recentDeps = (d.depenses || []).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

    return `<div class="card" style="margin-top:var(--space-lg);">
      <div class="card-header">
        <span class="card-title"><iconify-icon icon="solar:wallet-2-bold-duotone" style="color:#f59e0b;"></iconify-icon> D\u00e9penses v\u00e9hicules (${Utils.getMonthShort(new Date().getMonth())})</span>
        <div style="display:flex;gap:6px;">
          <span style="font-size:var(--font-size-base);font-weight:700;color:#f59e0b;">${Utils.formatCurrency(d.totalDepensesMois)}</span>
          <button class="btn btn-sm btn-primary" onclick="DashboardPage._addDepense()"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon></button>
          ${d.depenses && d.depenses.length > 0 ? `<button class="btn btn-sm btn-secondary" onclick="DashboardPage._showDepenses()"><iconify-icon icon="solar:list-bold"></iconify-icon></button>` : ''}
        </div>
      </div>
      ${typeEntries.length > 0 ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          ${typeEntries.map(([type, montant]) => `
            <div style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:var(--font-size-xs);">
              <iconify-icon icon="${typeIcons[type] || 'solar:bag-bold-duotone'}" style="color:#f59e0b;"></iconify-icon>
              <span>${typeLabels[type] || type}</span>
              <strong>${Utils.formatCurrency(montant)}</strong>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${recentDeps.map(dep => {
          const veh = d.vehicules.find(v => v.id === dep.vehiculeId);
          const vehLabel = veh ? `${veh.marque} ${veh.modele}` : dep.vehiculeId || '';
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:var(--radius-sm);background:var(--bg-tertiary);font-size:var(--font-size-xs);">
            <div style="display:flex;align-items:center;gap:6px;">
              <iconify-icon icon="${typeIcons[dep.typeDepense] || 'solar:bag-bold-duotone'}" style="color:#f59e0b;"></iconify-icon>
              <div>
                <span style="font-weight:500;">${typeLabels[dep.typeDepense] || dep.typeDepense}</span>
                <span style="color:var(--text-muted);"> \u2014 ${vehLabel}</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:var(--text-muted);">${Utils.formatDate(dep.date)}</span>
              <strong>${Utils.formatCurrency(dep.montant)}</strong>
            </div>
          </div>`;
        }).join('')}
        ${recentDeps.length === 0 ? '<div style="text-align:center;padding:12px;font-size:var(--font-size-xs);color:var(--text-muted);">Aucune d\u00e9pense enregistr\u00e9e ce mois</div>' : ''}
      </div>
    </div>`;
  },

  _addDepense() {
    const vehicules = Store.get('vehicules') || [];
    const fields = [
      { name: 'vehiculeId', label: 'V\u00e9hicule', type: 'select', required: true, placeholder: 'S\u00e9lectionner...', options: vehicules.map(v => ({ value: v.id, label: `${v.marque} ${v.modele} (${v.immatriculation})` })) },
      { type: 'row-start' },
      { name: 'typeDepense', label: 'Type de d\u00e9pense', type: 'select', required: true, options: [
        { value: 'carburant', label: 'Carburant' },
        { value: 'peage', label: 'P\u00e9age' },
        { value: 'lavage', label: 'Lavage' },
        { value: 'assurance', label: 'Assurance' },
        { value: 'reparation', label: 'R\u00e9paration' },
        { value: 'stationnement', label: 'Stationnement' },
        { value: 'autre', label: 'Autre' }
      ]},
      { name: 'montant', label: 'Montant (FCFA)', type: 'number', required: true, min: 0, step: 100 },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'date', label: 'Date', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
      { name: 'kilometrage', label: 'Kilom\u00e9trage', type: 'number', min: 0 },
      { type: 'row-end' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2, placeholder: 'D\u00e9tails de la d\u00e9pense...' }
    ];

    Modal.form(
      '<iconify-icon icon="solar:wallet-2-bold-duotone" style="color:#f59e0b;"></iconify-icon> Nouvelle d\u00e9pense',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        Store.add('depenses', {
          id: Utils.generateId('DEP'),
          ...values,
          montant: parseFloat(values.montant) || 0,
          dateCreation: new Date().toISOString()
        });

        Modal.close();
        Toast.success('D\u00e9pense enregistr\u00e9e \u2014 ' + Utils.formatCurrency(values.montant));
        this.render();
      }
    );
  },

  _showDepenses() {
    const depenses = (Store.get('depenses') || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const vehicules = Store.get('vehicules') || [];
    const typeLabels = { carburant: 'Carburant', peage: 'P\u00e9age', lavage: 'Lavage', assurance: 'Assurance', reparation: 'R\u00e9paration', stationnement: 'Stationnement', autre: 'Autre' };

    if (depenses.length === 0) {
      Toast.info('Aucune d\u00e9pense enregistr\u00e9e');
      return;
    }

    // R\u00e9sum\u00e9 par v\u00e9hicule
    const byVehicle = {};
    depenses.forEach(d => {
      if (!byVehicle[d.vehiculeId]) byVehicle[d.vehiculeId] = 0;
      byVehicle[d.vehiculeId] += d.montant || 0;
    });

    const summaryHtml = Object.entries(byVehicle).map(([vId, total]) => {
      const v = vehicules.find(x => x.id === vId);
      return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:var(--font-size-xs);"><span>${v ? `${v.marque} ${v.modele}` : vId}</span><strong>${Utils.formatCurrency(total)}</strong></div>`;
    }).join('');

    const rows = depenses.map(d => {
      const v = vehicules.find(x => x.id === d.vehiculeId);
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-radius:var(--radius-sm);background:var(--bg-tertiary);">
        <div>
          <div style="font-size:var(--font-size-sm);font-weight:500;">${typeLabels[d.typeDepense] || d.typeDepense}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${v ? `${v.marque} ${v.modele}` : ''} &bull; ${Utils.formatDate(d.date)}</div>
          ${d.commentaire ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${d.commentaire}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:var(--font-size-sm);font-weight:600;color:#f59e0b;">${Utils.formatCurrency(d.montant)}</div>
          <button class="btn btn-sm btn-danger" style="margin-top:4px;padding:2px 6px;" onclick="DashboardPage._deleteDepense('${d.id}')"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
        </div>
      </div>`;
    }).join('');

    const totalAll = depenses.reduce((s, d) => s + (d.montant || 0), 0);

    Modal.open({
      title: `<iconify-icon icon="solar:wallet-2-bold-duotone" style="color:#f59e0b;"></iconify-icon> D\u00e9penses (${depenses.length})`,
      body: `
        <div style="padding:8px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-bottom:12px;">
          <div style="font-size:var(--font-size-sm);font-weight:600;margin-bottom:4px;">Par v\u00e9hicule</div>
          ${summaryHtml}
          <div style="border-top:1px solid var(--border-color);margin-top:4px;padding-top:4px;display:flex;justify-content:space-between;font-size:var(--font-size-sm);font-weight:700;">
            <span>Total</span><span style="color:#f59e0b;">${Utils.formatCurrency(totalAll)}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto;">${rows}</div>
      `,
      footer: `<button class="btn btn-success" onclick="DashboardPage._exportDepensesExcel()"><iconify-icon icon="solar:file-download-bold-duotone"></iconify-icon> Excel</button><button class="btn btn-secondary" data-action="cancel">Fermer</button>`,
      size: 'large'
    });
  },

  _deleteDepense(id) {
    Store.delete('depenses', id);
    Toast.success('D\u00e9pense supprim\u00e9e');
    Modal.close();
    this.render();
  },

  _exportDepensesExcel() {
    const depenses = (Store.get('depenses') || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const vehicules = Store.get('vehicules') || [];
    const typeLabels = { carburant: 'Carburant', peage: 'P\u00e9age', lavage: 'Lavage', assurance: 'Assurance', reparation: 'R\u00e9paration', stationnement: 'Stationnement', autre: 'Autre' };

    const headers = ['Date', 'V\u00e9hicule', 'Type', 'Montant', 'Kilom\u00e9trage', 'Commentaire'];
    const rows = depenses.map(d => {
      const v = vehicules.find(x => x.id === d.vehiculeId);
      return [d.date, v ? `${v.marque} ${v.modele}` : d.vehiculeId, typeLabels[d.typeDepense] || d.typeDepense, d.montant, d.kilometrage || '', d.commentaire || ''];
    });
    Utils.exportCSV(headers, rows, `volt-depenses-${new Date().toISOString().split('T')[0]}.csv`);
    Toast.success(`${depenses.length} d\u00e9pense(s) export\u00e9e(s)`);
  },

  // =================== EXPORT PDF REÇU ===================

  _generateReceiptPDF(chauffeurId, date, montant, moyenPaiement, reference) {
    const chauffeurs = Store.get('chauffeurs') || [];
    const ch = chauffeurs.find(c => c.id === chauffeurId);
    const name = ch ? `${ch.prenom} ${ch.nom}` : chauffeurId;
    const settings = Store.get('settings') || {};
    const entreprise = settings.entreprise || {};

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a5');

    // En-tête
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, 148, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('VOLT VTC', 14, 14);
    doc.setFontSize(10);
    doc.text('Re\u00e7u de paiement', 14, 22);
    doc.setFontSize(8);
    doc.text(`N\u00b0 ${Utils.generateId('REC')}`, 100, 14);
    doc.text(new Date().toLocaleDateString('fr-FR'), 100, 20);

    // Infos entreprise
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    let y = 38;
    if (entreprise.nom) { doc.text(entreprise.nom, 14, y); y += 5; }
    if (entreprise.adresse) { doc.text(entreprise.adresse, 14, y); y += 5; }
    if (entreprise.telephone) { doc.text(`T\u00e9l: ${entreprise.telephone}`, 14, y); y += 5; }

    // Ligne de s\u00e9paration
    y += 3;
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y, 134, y);
    y += 8;

    // D\u00e9tails du paiement
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text('D\u00e9tails du paiement', 14, y);
    y += 10;

    doc.setFontSize(9);
    const details = [
      ['Chauffeur', name],
      ['Date', Utils.formatDate(date)],
      ['Montant', Utils.formatCurrency(montant)],
      ['Moyen de paiement', moyenPaiement || '-'],
      ['R\u00e9f\u00e9rence', reference || '-'],
      ['Date de validation', new Date().toLocaleDateString('fr-FR')]
    ];

    details.forEach(([label, value]) => {
      doc.setTextColor(100, 116, 139);
      doc.text(label, 14, y);
      doc.setTextColor(15, 23, 42);
      doc.setFont(undefined, 'bold');
      doc.text(String(value), 70, y);
      doc.setFont(undefined, 'normal');
      y += 7;
    });

    // Pied de page
    y += 10;
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y, 134, y);
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Ce document fait office de re\u00e7u de paiement.', 14, y);
    doc.text('G\u00e9n\u00e9r\u00e9 automatiquement par Volt VTC.', 14, y + 5);

    doc.save(`recu-${name.replace(/\s+/g, '-')}-${date}.pdf`);
    Toast.success('Re\u00e7u PDF g\u00e9n\u00e9r\u00e9');
  }
};
