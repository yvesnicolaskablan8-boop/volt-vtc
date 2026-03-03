/**
 * DashboardPage - Main dashboard with KPIs and charts (internal Volt data)
 */
const DashboardPage = {
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    container.innerHTML = this._template(data);
    this._loadCharts(data);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
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
        unpaidItems.push({
          planningId: p.id,
          chauffeurId: p.chauffeurId,
          date: p.date,
          typeCreneaux: p.typeCreneaux,
          heureDebut: p.heureDebut,
          heureFin: p.heureFin,
          montantDu: redevance,
          justification: existing ? existing.justification : null,
          versementId: existing ? existing.id : null
        });
      }
    });

    // Trier par date décroissante
    unpaidItems.sort((a, b) => b.date.localeCompare(a.date));
    const totalUnpaid = unpaidItems.reduce((s, i) => s + i.montantDu, 0);

    return {
      caThisMonth, caTrend, totalVerse, retardCount,
      activeCount, vehiclesActifs, vehiclesEV, vehiclesThermique,
      monthCourses: monthCourses.length,
      monthlyRevenue, weeklyPayments,
      coursesByType, typeLabels, vehicleProfit,
      recentVersements, chauffeurs, vehiculesTotal: vehicules.length,
      maintenanceAlerts, unpaidItems, totalUnpaid
    };
  },

  _template(d) {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:spedometer-max-bold-duotone"></iconify-icon> Tableau de bord</h1>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="DashboardPage.refresh()"><iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Actualiser</button>
        </div>
      </div>

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
        <div class="kpi-card cyan">
          <div class="kpi-icon"><iconify-icon icon="solar:route-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatNumber(d.monthCourses)}</div>
          <div class="kpi-label">Courses ce mois</div>
          <div class="kpi-trend neutral">
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
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${Utils.formatDate(item.date)}${item.heureDebut && item.heureFin ? ' \u2014 ' + item.heureDebut + ' \u00e0 ' + item.heureFin : ''}</div>
          ${hasJustif ? `<div style="font-size:var(--font-size-xs);color:var(--volt-blue);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> ${item.justification}</div>` : ''}
        </div>
        <div style="font-size:var(--font-size-sm);font-weight:600;color:#ef4444;flex-shrink:0;margin-left:8px;">
          ${Utils.formatCurrency(item.montantDu)}
        </div>
      </div>`;
    }).join('');

    const moreText = d.unpaidItems.length > 5 ? `<div style="text-align:center;padding:4px;font-size:var(--font-size-xs);color:var(--text-muted);">+ ${d.unpaidItems.length - 5} autre(s)...</div>` : '';

    return `<div class="card" style="margin-top:var(--space-lg);border-left:4px solid #ef4444;cursor:pointer;" onclick="DashboardPage._showUnpaidDetails()">
      <div class="card-header">
        <span class="card-title"><iconify-icon icon="solar:bill-cross-bold-duotone" style="color:#ef4444;"></iconify-icon> Recettes impay\u00e9es (${d.unpaidItems.length})</span>
        <span style="font-size:var(--font-size-base);font-weight:700;color:#ef4444;">${Utils.formatCurrency(d.totalUnpaid)}</span>
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

    const rows = data.unpaidItems.map(item => {
      const ch = data.chauffeurs.find(c => c.id === item.chauffeurId);
      const name = ch ? `${ch.prenom} ${ch.nom}` : item.chauffeurId;
      const hasJustif = !!item.justification;
      const creneauLabel = item.heureDebut && item.heureFin ? `${item.heureDebut} \u00e0 ${item.heureFin}` : (item.typeCreneaux || '');

      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:var(--radius-sm);background:var(--bg-tertiary);gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--font-size-sm);font-weight:600;">${name}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${Utils.formatDate(item.date)}${creneauLabel ? ' \u2014 ' + creneauLabel : ''}</div>
          ${hasJustif ? `<div style="font-size:var(--font-size-xs);color:var(--volt-blue);margin-top:2px;"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> ${item.justification}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:var(--font-size-sm);font-weight:600;color:#ef4444;">
            ${Utils.formatCurrency(item.montantDu)}
          </div>
          <div style="display:flex;gap:4px;margin-top:4px;">
            <button class="btn btn-sm btn-success" onclick="event.stopPropagation();DashboardPage._payReceipt('${item.chauffeurId}','${item.date}','${item.planningId}','${item.versementId || ''}',${item.montantDu})">
              <iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon> Payer
            </button>
            <button class="btn btn-sm ${hasJustif ? 'btn-secondary' : 'btn-outline'}" onclick="event.stopPropagation();DashboardPage._addJustification('${item.chauffeurId}','${item.date}','${item.planningId}','${item.versementId || ''}')">
              <iconify-icon icon="solar:document-add-bold-duotone"></iconify-icon> ${hasJustif ? 'Modifier' : 'Justifier'}
            </button>
          </div>
        </div>
      </div>`;
    }).join('');

    Modal.open({
      title: '<iconify-icon icon="solar:bill-cross-bold-duotone" style="color:#ef4444;"></iconify-icon> Recettes impay\u00e9es (' + data.unpaidItems.length + ')',
      body: `<div style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow-y:auto;">${rows}</div>`,
      footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>',
      size: 'large'
    });
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
        this.render();
      }
    );
  },

  refresh() {
    this.destroy();
    this.render();
    Toast.info('Tableau de bord actualise');
  }
};
