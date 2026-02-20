/**
 * RentabilitePage - Vehicle profitability analysis
 */
const RentabilitePage = {
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
    const vehicules = Store.get('vehicules');
    const versements = Store.get('versements');
    const courses = Store.get('courses').filter(c => c.statut === 'terminee');
    const now = new Date();

    // Per-vehicle analysis
    const analysis = vehicules.map(v => {
      const vCourses = courses.filter(c => c.vehiculeId === v.id);
      const vVersements = versements.filter(vs => vs.vehiculeId === v.id);

      // Revenue (company commission = 20% of rides)
      const totalRevenue = vVersements.reduce((s, vs) => s + vs.montantVerse, 0);
      const totalCA = vCourses.reduce((s, c) => s + c.montantTTC, 0);

      // Months in service
      const startDate = new Date(v.dateCreation);
      const monthsInService = Math.max(1, Math.round((now - startDate) / (30 * 24 * 60 * 60 * 1000)));

      // Costs
      const maintenanceTotal = (v.coutsMaintenance || []).reduce((s, m) => s + m.montant, 0);
      const assuranceTotal = (v.primeAnnuelle / 12) * monthsInService;

      // Acquisition cost
      let acquisitionTotal;
      if (v.typeAcquisition === 'leasing') {
        const monthsPaid = Math.min(monthsInService, v.dureeLeasing);
        acquisitionTotal = v.apportInitial + (v.mensualiteLeasing * monthsPaid);
      } else {
        acquisitionTotal = v.prixAchat;
      }

      // Energy cost estimate (FCFA - coutEnergie is per liter for thermal, per kWh for EV)
      const isEV = v.typeEnergie === 'electrique';
      const defaultConsommation = isEV ? 15 : 6.5;
      const defaultCoutEnergie = isEV ? 120 : 800;
      const energyCost = (v.kilometrage * (v.consommation || defaultConsommation) / 100) * (v.coutEnergie || defaultCoutEnergie);

      const totalCost = acquisitionTotal + maintenanceTotal + assuranceTotal + energyCost;

      const monthlyRevenue = totalRevenue / monthsInService;
      const monthlyCost = totalCost / monthsInService;
      const monthlyProfit = monthlyRevenue - monthlyCost;

      const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;

      const yearsInService = monthsInService / 12;

      // Depreciation rate: EVs retain value better (15%/year vs 20%/year)
      const depreciationRate = isEV ? 0.85 : 0.80;
      const bookValueCalc = v.prixAchat * Math.pow(depreciationRate, yearsInService);

      // Cost per km
      const coutParKm = v.kilometrage > 0 ? totalCost / v.kilometrage : 0;

      return {
        vehicule: v,
        isEV,
        totalCA,
        totalRevenue,
        totalCost,
        acquisitionTotal,
        maintenanceTotal,
        assuranceTotal: Math.round(assuranceTotal),
        energyCost: Math.round(energyCost),
        monthsInService,
        monthlyRevenue: Math.round(monthlyRevenue),
        monthlyCost: Math.round(monthlyCost),
        monthlyProfit: Math.round(monthlyProfit),
        roi,
        bookValue: Math.round(bookValueCalc),
        courses: vCourses.length,
        coutParKm: Math.round(coutParKm)
      };
    });

    // Total fleet
    const fleetTotalRevenue = analysis.reduce((s, a) => s + a.totalRevenue, 0);
    const fleetTotalCost = analysis.reduce((s, a) => s + a.totalCost, 0);
    const fleetProfit = fleetTotalRevenue - fleetTotalCost;
    const fleetROI = fleetTotalCost > 0 ? ((fleetTotalRevenue - fleetTotalCost) / fleetTotalCost) * 100 : 0;

    // Leasing vs Cash comparison
    const leasingVehicles = analysis.filter(a => a.vehicule.typeAcquisition === 'leasing');
    const cashVehicles = analysis.filter(a => a.vehicule.typeAcquisition === 'cash');

    const avgLeasingROI = leasingVehicles.length > 0
      ? leasingVehicles.reduce((s, a) => s + a.roi, 0) / leasingVehicles.length : 0;
    const avgCashROI = cashVehicles.length > 0
      ? cashVehicles.reduce((s, a) => s + a.roi, 0) / cashVehicles.length : 0;

    // EV vs Thermique comparison
    const evVehicles = analysis.filter(a => a.isEV);
    const thermalVehicles = analysis.filter(a => !a.isEV);

    const avgEVCoutKm = evVehicles.length > 0
      ? evVehicles.reduce((s, a) => s + a.coutParKm, 0) / evVehicles.length : 0;
    const avgThermalCoutKm = thermalVehicles.length > 0
      ? thermalVehicles.reduce((s, a) => s + a.coutParKm, 0) / thermalVehicles.length : 0;

    const avgEVEnergy = evVehicles.length > 0
      ? evVehicles.reduce((s, a) => s + a.energyCost, 0) / evVehicles.length : 0;
    const avgThermalEnergy = thermalVehicles.length > 0
      ? thermalVehicles.reduce((s, a) => s + a.energyCost, 0) / thermalVehicles.length : 0;

    const avgEVMaintenance = evVehicles.length > 0
      ? evVehicles.reduce((s, a) => s + a.maintenanceTotal, 0) / evVehicles.length : 0;
    const avgThermalMaintenance = thermalVehicles.length > 0
      ? thermalVehicles.reduce((s, a) => s + a.maintenanceTotal, 0) / thermalVehicles.length : 0;

    const avgEVROI = evVehicles.length > 0
      ? evVehicles.reduce((s, a) => s + a.roi, 0) / evVehicles.length : 0;
    const avgThermalROI = thermalVehicles.length > 0
      ? thermalVehicles.reduce((s, a) => s + a.roi, 0) / thermalVehicles.length : 0;

    const energySavingsPercent = avgThermalEnergy > 0
      ? Math.round((1 - avgEVEnergy / avgThermalEnergy) * 100) : 0;

    // Cumulative cost comparison over time (48 months)
    const cumulativeLeasingCost = [];
    const cumulativeCashCost = [];
    const avgLeasing = leasingVehicles[0];
    const avgCash = cashVehicles[0];

    if (avgLeasing && avgCash) {
      for (let m = 0; m <= 48; m++) {
        // Leasing: monthly payments + running costs
        const leaseCost = avgLeasing.vehicule.apportInitial +
          (avgLeasing.vehicule.mensualiteLeasing * m) +
          (avgLeasing.vehicule.primeAnnuelle / 12 * m) +
          (m * 150000); // estimated monthly running cost in FCFA

        // Cash: full price + running costs
        const cashCost = avgCash.vehicule.prixAchat +
          (avgCash.vehicule.primeAnnuelle / 12 * m) +
          (m * 150000);

        cumulativeLeasingCost.push(Math.round(leaseCost));
        cumulativeCashCost.push(Math.round(cashCost));
      }
    }

    return {
      analysis, fleetTotalRevenue, fleetTotalCost, fleetProfit, fleetROI,
      avgLeasingROI, avgCashROI, cumulativeLeasingCost, cumulativeCashCost,
      leasingCount: leasingVehicles.length, cashCount: cashVehicles.length,
      evCount: evVehicles.length, thermalCount: thermalVehicles.length,
      avgEVCoutKm, avgThermalCoutKm, avgEVEnergy, avgThermalEnergy,
      avgEVMaintenance, avgThermalMaintenance, avgEVROI, avgThermalROI,
      energySavingsPercent
    };
  },

  _template(d) {
    return `
      <div class="page-header">
        <h1><i class="fas fa-chart-pie"></i> Rentabilité</h1>
      </div>

      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card green">
          <div class="kpi-icon"><i class="fas fa-arrow-trend-up"></i></div>
          <div class="kpi-value">${Utils.formatCurrency(d.fleetTotalRevenue)}</div>
          <div class="kpi-label">Revenus totaux flotte</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-icon"><i class="fas fa-arrow-trend-down"></i></div>
          <div class="kpi-value">${Utils.formatCurrency(d.fleetTotalCost)}</div>
          <div class="kpi-label">Coûts totaux flotte</div>
        </div>
        <div class="kpi-card ${d.fleetProfit >= 0 ? 'green' : 'red'}">
          <div class="kpi-icon"><i class="fas fa-calculator"></i></div>
          <div class="kpi-value">${Utils.formatCurrency(d.fleetProfit)}</div>
          <div class="kpi-label">Profit net flotte</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><i class="fas fa-percentage"></i></div>
          <div class="kpi-value">${d.fleetROI.toFixed(1)}%</div>
          <div class="kpi-label">ROI global</div>
        </div>
      </div>

      <!-- EV vs Thermique comparison -->
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid var(--volt-yellow);background:rgba(250,204,21,0.03);">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-bolt" style="color:var(--volt-yellow)"></i> Comparaison Électrique vs Thermique</span>
        </div>
        <div class="grid-2" style="gap:var(--space-lg);">
          <div>
            <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-md);">
              <span class="badge badge-warning"><i class="fas fa-bolt" style="font-size:8px"></i> ${d.evCount} véhicules électriques</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:var(--font-size-sm);">
              <div style="display:flex;justify-content:space-between;"><span class="text-muted">ROI moyen</span><strong style="color:var(--volt-yellow)">${d.avgEVROI.toFixed(1)}%</strong></div>
              <div style="display:flex;justify-content:space-between;"><span class="text-muted">Coût énergie moyen</span><strong>${Utils.formatCurrency(d.avgEVEnergy)}</strong></div>
              <div style="display:flex;justify-content:space-between;"><span class="text-muted">Maintenance moyenne</span><strong>${Utils.formatCurrency(d.avgEVMaintenance)}</strong></div>
              <div style="display:flex;justify-content:space-between;"><span class="text-muted">Coût moyen/km</span><strong>${d.avgEVCoutKm} FCFA/km</strong></div>
            </div>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-md);">
              <span class="badge badge-neutral"><i class="fas fa-gas-pump" style="font-size:8px"></i> ${d.thermalCount} véhicules thermiques</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:var(--font-size-sm);">
              <div style="display:flex;justify-content:space-between;"><span class="text-muted">ROI moyen</span><strong>${d.avgThermalROI.toFixed(1)}%</strong></div>
              <div style="display:flex;justify-content:space-between;"><span class="text-muted">Coût énergie moyen</span><strong>${Utils.formatCurrency(d.avgThermalEnergy)}</strong></div>
              <div style="display:flex;justify-content:space-between;"><span class="text-muted">Maintenance moyenne</span><strong>${Utils.formatCurrency(d.avgThermalMaintenance)}</strong></div>
              <div style="display:flex;justify-content:space-between;"><span class="text-muted">Coût moyen/km</span><strong>${d.avgThermalCoutKm} FCFA/km</strong></div>
            </div>
          </div>
        </div>
        ${d.energySavingsPercent > 0 ? `
        <div style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border-primary);text-align:center;">
          <span style="font-size:var(--font-size-sm);color:var(--success);font-weight:600;">
            <i class="fas fa-leaf"></i> Les véhicules électriques économisent ~${d.energySavingsPercent}% en coûts d'énergie par rapport aux thermiques
          </span>
        </div>
        ` : ''}
      </div>

      <!-- Leasing vs Cash summary -->
      <div class="grid-2" style="margin-bottom:var(--space-lg);">
        <div class="card" style="border-left:4px solid var(--volt-blue);">
          <div class="card-header"><span class="card-title"><i class="fas fa-file-contract text-blue"></i> Leasing (${d.leasingCount} véhicules)</span></div>
          <div class="kpi-value" style="font-size:var(--font-size-xl);">${d.avgLeasingROI.toFixed(1)}% ROI moyen</div>
          <p style="font-size:var(--font-size-sm);margin-top:var(--space-sm);">Avantages : trésorerie préservée, véhicules récents, charges déductibles</p>
        </div>
        <div class="card" style="border-left:4px solid var(--success);">
          <div class="card-header"><span class="card-title"><i class="fas fa-money-bills text-success"></i> Cash (${d.cashCount} véhicules)</span></div>
          <div class="kpi-value" style="font-size:var(--font-size-xl);">${d.avgCashROI.toFixed(1)}% ROI moyen</div>
          <p style="font-size:var(--font-size-sm);margin-top:var(--space-sm);">Avantages : pas de mensualités, actif au bilan, coût total inférieur</p>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-bar"></i> TCO par véhicule</div>
          </div>
          <div class="chart-container" style="height:320px;">
            <canvas id="chart-tco"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-line"></i> Comparaison Leasing vs Cash (coût cumulé)</div>
          </div>
          <div class="chart-container" style="height:320px;">
            <canvas id="chart-leasing-cash"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-bar"></i> Profit mensuel par véhicule</div>
          </div>
          <div class="chart-container" style="height:320px;">
            <canvas id="chart-monthly-profit"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-line"></i> Amortissement des véhicules</div>
          </div>
          <div class="chart-container" style="height:320px;">
            <canvas id="chart-depreciation"></canvas>
          </div>
        </div>
      </div>

      <!-- Detail table -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title">Détail par véhicule</span>
        </div>
        <div id="rentabilite-table"></div>
      </div>
    `;
  },

  _loadCharts(d) {
    this._charts = [];

    // TCO stacked bar chart
    const tcoCtx = document.getElementById('chart-tco');
    if (tcoCtx) {
      this._charts.push(new Chart(tcoCtx, {
        type: 'bar',
        data: {
          labels: d.analysis.map(a => `${a.vehicule.marque} ${a.vehicule.modele}`),
          datasets: [
            { label: 'Acquisition', data: d.analysis.map(a => Math.round(a.acquisitionTotal)), backgroundColor: '#3b82f6', hoverBackgroundColor: '#2563eb' },
            { label: 'Assurance', data: d.analysis.map(a => a.assuranceTotal), backgroundColor: '#facc15', hoverBackgroundColor: '#eab308' },
            { label: 'Maintenance', data: d.analysis.map(a => Math.round(a.maintenanceTotal)), backgroundColor: '#ef4444', hoverBackgroundColor: '#dc2626' },
            { label: 'Énergie', data: d.analysis.map(a => a.energyCost), backgroundColor: '#22d3ee', hoverBackgroundColor: '#06b6d4' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                title: (items) => {
                  const idx = items[0].dataIndex;
                  const a = d.analysis[idx];
                  return `${a.vehicule.marque} ${a.vehicule.modele} (${a.isEV ? 'EV' : 'Thermique'})`;
                },
                label: (ctx) => `${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}`,
                afterBody: (items) => {
                  const idx = items[0].dataIndex;
                  const a = d.analysis[idx];
                  return `\nTCO total: ${Utils.formatCurrency(a.totalCost)}\nCoût/km: ${a.coutParKm} FCFA`;
                }
              }
            }
          },
          scales: {
            x: { stacked: true },
            y: { stacked: true, ticks: { callback: (v) => Utils.formatCurrency(v) } }
          }
        }
      }));
    }

    // Leasing vs Cash comparison
    if (d.cumulativeLeasingCost.length > 0) {
      const lcCtx = document.getElementById('chart-leasing-cash');
      if (lcCtx) {
        const labels = Array.from({ length: 49 }, (_, i) => i === 0 ? '0' : `${i}`);
        // Find crossover month (where leasing becomes cheaper or vice versa)
        let crossoverMonth = null;
        for (let m = 1; m < d.cumulativeLeasingCost.length; m++) {
          const diffPrev = d.cumulativeLeasingCost[m - 1] - d.cumulativeCashCost[m - 1];
          const diffCurr = d.cumulativeLeasingCost[m] - d.cumulativeCashCost[m];
          if ((diffPrev >= 0 && diffCurr < 0) || (diffPrev <= 0 && diffCurr > 0)) {
            crossoverMonth = m;
            break;
          }
        }

        this._charts.push(new Chart(lcCtx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Leasing', data: d.cumulativeLeasingCost, borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0,
                pointHoverRadius: 8, pointHoverBorderWidth: 3, pointHoverBackgroundColor: '#3b82f6', pointHoverBorderColor: '#fff'
              },
              {
                label: 'Cash', data: d.cumulativeCashCost, borderColor: '#22c55e', borderWidth: 2, pointRadius: 0,
                pointHoverRadius: 8, pointHoverBorderWidth: 3, pointHoverBackgroundColor: '#22c55e', pointHoverBorderColor: '#fff'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}`,
                  afterBody: (items) => {
                    const month = items[0].dataIndex;
                    const leasingVal = d.cumulativeLeasingCost[month];
                    const cashVal = d.cumulativeCashCost[month];
                    const diff = Math.abs(leasingVal - cashVal);
                    let lines = [`\nEcart: ${Utils.formatCurrency(diff)}`];
                    if (crossoverMonth !== null) {
                      lines.push(`Seuil de rentabilite: mois ${crossoverMonth}`);
                    }
                    return lines.join('\n');
                  }
                }
              }
            },
            scales: {
              x: { title: { display: true, text: 'Mois', color: '#94a3b8' } },
              y: { ticks: { callback: (v) => Utils.formatCurrency(v) } }
            }
          }
        }));
      }
    }

    // Monthly profit bar
    const profitCtx = document.getElementById('chart-monthly-profit');
    if (profitCtx) {
      this._charts.push(new Chart(profitCtx, {
        type: 'bar',
        data: {
          labels: d.analysis.map(a => `${a.vehicule.marque} ${a.vehicule.modele}`),
          datasets: [{
            label: 'Profit mensuel',
            data: d.analysis.map(a => a.monthlyProfit),
            backgroundColor: d.analysis.map(a => a.monthlyProfit >= 0 ? '#22c55e' : '#ef4444'),
            hoverBackgroundColor: d.analysis.map(a => a.monthlyProfit >= 0 ? '#16a34a' : '#dc2626'),
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const idx = items[0].dataIndex;
                  const a = d.analysis[idx];
                  return `${a.vehicule.marque} ${a.vehicule.modele}`;
                },
                label: (ctx) => `Profit mensuel: ${Utils.formatCurrency(ctx.raw)}`,
                afterBody: (items) => {
                  const idx = items[0].dataIndex;
                  const a = d.analysis[idx];
                  return [
                    `\nRevenu/mois: ${Utils.formatCurrency(a.monthlyRevenue)}`,
                    `Coût/mois: ${Utils.formatCurrency(a.monthlyCost)}`,
                    `ROI: ${a.roi.toFixed(1)}%`
                  ].join('\n');
                }
              }
            }
          },
          scales: { y: { ticks: { callback: (v) => Utils.formatCurrency(v) } } }
        }
      }));
    }

    // Depreciation chart (EV retains value better: 15%/year vs 20%/year)
    const depCtx = document.getElementById('chart-depreciation');
    if (depCtx) {
      const depColors = ['#3b82f6', '#22c55e', '#facc15', '#ef4444', '#8b5cf6', '#22d3ee', '#f59e0b', '#ec4899', '#14b8a6'];
      const datasets = d.analysis.map((a, i) => {
        const depRate = a.isEV ? 0.85 : 0.80;
        const data = [];
        for (let y = 0; y <= 5; y++) {
          data.push(Math.round(a.vehicule.prixAchat * Math.pow(depRate, y)));
        }
        const color = depColors[i % depColors.length];
        return {
          label: `${a.vehicule.marque} ${a.vehicule.modele}${a.isEV ? ' ⚡' : ''}`,
          data,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 8,
          pointHoverBorderWidth: 3,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          borderDash: a.isEV ? [5, 3] : []
        };
      });

      this._charts.push(new Chart(depCtx, {
        type: 'line',
        data: {
          labels: ['Année 0', 'Année 1', 'Année 2', 'Année 3', 'Année 4', 'Année 5'],
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}`,
                afterLabel: (ctx) => {
                  const a = d.analysis[ctx.datasetIndex];
                  const year = ctx.dataIndex;
                  if (year === 0) return '';
                  const depPercent = ((1 - ctx.raw / a.vehicule.prixAchat) * 100).toFixed(1);
                  const depRate = a.isEV ? '15%' : '20%';
                  return `Depreciation: -${depPercent}% (taux: ${depRate}/an)`;
                }
              }
            }
          },
          scales: { y: { ticks: { callback: (v) => Utils.formatCurrency(v) } } }
        }
      }));
    }

    // Detail table
    Table.create({
      containerId: 'rentabilite-table',
      columns: [
        {
          label: 'Véhicule', primary: true,
          render: (a) => {
            const icon = a.isEV ? '<i class="fas fa-bolt" style="color:var(--volt-yellow);font-size:10px;margin-left:4px"></i>' : '';
            return `${a.vehicule.marque} ${a.vehicule.modele} ${icon}`;
          },
          value: (a) => a.vehicule.marque
        },
        {
          label: 'Énergie',
          render: (a) => a.isEV
            ? '<span class="badge badge-warning"><i class="fas fa-bolt" style="font-size:8px"></i> EV</span>'
            : '<span class="badge badge-neutral"><i class="fas fa-gas-pump" style="font-size:8px"></i> Therm.</span>'
        },
        { label: 'Acq.', render: (a) => `<span class="badge ${a.vehicule.typeAcquisition === 'leasing' ? 'badge-info' : 'badge-success'}">${a.vehicule.typeAcquisition}</span>` },
        { label: 'CA généré', render: (a) => Utils.formatCurrency(a.totalCA), value: (a) => a.totalCA },
        { label: 'Revenu (comm.)', render: (a) => Utils.formatCurrency(a.totalRevenue), value: (a) => a.totalRevenue },
        { label: 'Coût total', render: (a) => Utils.formatCurrency(a.totalCost), value: (a) => a.totalCost },
        { label: 'Profit/mois', render: (a) => `<span class="${a.monthlyProfit >= 0 ? 'text-success' : 'text-danger'}">${Utils.formatCurrency(a.monthlyProfit)}</span>`, value: (a) => a.monthlyProfit },
        { label: 'ROI', render: (a) => `<span class="${a.roi >= 0 ? 'text-success' : 'text-danger'}">${a.roi.toFixed(1)}%</span>`, value: (a) => a.roi },
        { label: 'Valeur résiduelle', render: (a) => Utils.formatCurrency(a.bookValue), value: (a) => a.bookValue }
      ],
      data: d.analysis,
      pageSize: 10
    });
  }
};
