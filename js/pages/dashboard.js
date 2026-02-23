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

    return {
      caThisMonth, caTrend, totalVerse, retardCount,
      activeCount, vehiclesActifs, vehiclesEV, vehiclesThermique,
      monthCourses: monthCourses.length,
      monthlyRevenue, weeklyPayments,
      coursesByType, typeLabels, vehicleProfit,
      recentVersements, chauffeurs, vehiculesTotal: vehicules.length,
      maintenanceAlerts
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

      <!-- Maintenance Alerts -->
      ${this._renderMaintenanceAlerts(d)}

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
      const icon = isRetard ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
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
        <i class="fas ${icon}" style="color:${color};font-size:0.9rem;flex-shrink:0;"></i>
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
        <span class="card-title"><i class="fas fa-tools" style="color:${borderColor};"></i> Alertes maintenance (${d.maintenanceAlerts.length})</span>
        <a href="#/maintenances" class="btn btn-sm btn-secondary">Voir tout</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${rows}
        ${moreText}
      </div>
    </div>`;
  },

  refresh() {
    this.destroy();
    this.render();
    Toast.info('Tableau de bord actualise');
  }
};
