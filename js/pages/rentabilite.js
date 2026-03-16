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
      const totalRevenue = vVersements.filter(vs => vs.statut !== 'supprime').reduce((s, vs) => s + vs.montantVerse, 0);
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
      <div class="d-wrap"><div class="d-bg">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:14px;">
        <div>
          <div style="font-size:14px;color:#9ca3af;font-weight:500;">Analyse financière</div>
          <div style="font-size:28px;font-weight:800;color:var(--text-primary);letter-spacing:-.6px;margin-top:2px;display:flex;align-items:center;gap:12px;">
            <iconify-icon icon="solar:pie-chart-2-bold-duotone" style="color:#6366f1;"></iconify-icon> Rentabilité
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="d-grid d-g4" style="grid-template-columns:repeat(4,1fr);">
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(16,185,129,.1);color:#10b981;"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;">Revenus totaux flotte</div>
          </div>
          <div class="d-val" style="color:#10b981;">${Utils.formatCurrency(d.fleetTotalRevenue)}</div>
        </div>
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(239,68,68,.1);color:#ef4444;"><iconify-icon icon="solar:graph-down-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;">Coûts totaux flotte</div>
          </div>
          <div class="d-val" style="color:#ef4444;">${Utils.formatCurrency(d.fleetTotalCost)}</div>
        </div>
        <div class="d-card" style="${d.fleetProfit < 0 ? 'border-color:rgba(239,68,68,.2);' : ''}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:${d.fleetProfit >= 0 ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)'};color:${d.fleetProfit >= 0 ? '#10b981' : '#ef4444'};"><iconify-icon icon="solar:calculator-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;">Profit net flotte</div>
          </div>
          <div class="d-val" style="color:${d.fleetProfit >= 0 ? '#10b981' : '#ef4444'};">${Utils.formatCurrency(d.fleetProfit)}</div>
        </div>
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(99,102,241,.08);color:#6366f1;"><iconify-icon icon="solar:sale-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;">ROI global</div>
          </div>
          <div class="d-val" style="color:#6366f1;">${d.fleetROI.toFixed(1)}%</div>
        </div>
      </div>

      <!-- EV vs Thermique comparison -->
      <div class="d-card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <div class="d-icon" style="background:rgba(245,158,11,.1);color:#f59e0b;"><iconify-icon icon="solar:bolt-bold-duotone"></iconify-icon></div>
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Comparaison Électrique vs Thermique</div>
        </div>
        <div class="grid-2" style="gap:var(--space-lg);">
          <div>
            <div style="margin-bottom:var(--space-md);"><span class="d-tag yellow"><iconify-icon icon="solar:bolt-bold-duotone" style="font-size:10px"></iconify-icon> ${d.evCount} véhicules électriques</span></div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:var(--font-size-sm);">
              <div style="display:flex;justify-content:space-between;"><span style="color:#9ca3af;">ROI moyen</span><strong style="color:#f59e0b">${d.avgEVROI.toFixed(1)}%</strong></div>
              <div style="display:flex;justify-content:space-between;"><span style="color:#9ca3af;">Coût énergie moyen</span><strong>${Utils.formatCurrency(d.avgEVEnergy)}</strong></div>
              <div style="display:flex;justify-content:space-between;"><span style="color:#9ca3af;">Maintenance moyenne</span><strong>${Utils.formatCurrency(d.avgEVMaintenance)}</strong></div>
              <div style="display:flex;justify-content:space-between;"><span style="color:#9ca3af;">Coût moyen/km</span><strong>${d.avgEVCoutKm} FCFA/km</strong></div>
            </div>
          </div>
          <div>
            <div style="margin-bottom:var(--space-md);"><span class="d-tag purple"><iconify-icon icon="solar:gas-station-bold-duotone" style="font-size:10px"></iconify-icon> ${d.thermalCount} véhicules thermiques</span></div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:var(--font-size-sm);">
              <div style="display:flex;justify-content:space-between;"><span style="color:#9ca3af;">ROI moyen</span><strong>${d.avgThermalROI.toFixed(1)}%</strong></div>
              <div style="display:flex;justify-content:space-between;"><span style="color:#9ca3af;">Coût énergie moyen</span><strong>${Utils.formatCurrency(d.avgThermalEnergy)}</strong></div>
              <div style="display:flex;justify-content:space-between;"><span style="color:#9ca3af;">Maintenance moyenne</span><strong>${Utils.formatCurrency(d.avgThermalMaintenance)}</strong></div>
              <div style="display:flex;justify-content:space-between;"><span style="color:#9ca3af;">Coût moyen/km</span><strong>${d.avgThermalCoutKm} FCFA/km</strong></div>
            </div>
          </div>
        </div>
        ${d.energySavingsPercent > 0 ? `
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(0,0,0,.06);text-align:center;">
          <span class="d-tag green"><iconify-icon icon="solar:leaf-bold-duotone" style="font-size:10px;"></iconify-icon> Les véhicules électriques économisent ~${d.energySavingsPercent}% en coûts d'énergie</span>
        </div>
        ` : ''}
      </div>

      <!-- Leasing vs Cash summary -->
      <div class="d-grid" style="grid-template-columns:1fr 1fr;">
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(99,102,241,.08);color:#6366f1;"><iconify-icon icon="solar:document-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;">Leasing (${d.leasingCount} véhicules)</div>
          </div>
          <div class="d-val" style="color:#6366f1;">${d.avgLeasingROI.toFixed(1)}%</div>
          <div class="d-sub">ROI moyen — trésorerie préservée, charges déductibles</div>
        </div>
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(16,185,129,.1);color:#10b981;"><iconify-icon icon="solar:money-bag-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;">Cash (${d.cashCount} véhicules)</div>
          </div>
          <div class="d-val" style="color:#10b981;">${d.avgCashROI.toFixed(1)}%</div>
          <div class="d-sub">ROI moyen — pas de mensualités, coût total inférieur</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="d-grid" style="grid-template-columns:1fr 1fr;margin-top:8px;">
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(99,102,241,.08);color:#6366f1;width:34px;height:34px;border-radius:10px;font-size:15px;"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">TCO par véhicule</div>
          </div>
          <div style="height:320px;"><canvas id="chart-tco"></canvas></div>
        </div>
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(16,185,129,.08);color:#10b981;width:34px;height:34px;border-radius:10px;font-size:15px;"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Leasing vs Cash</div>
          </div>
          <div style="height:320px;"><canvas id="chart-leasing-cash"></canvas></div>
        </div>
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(245,158,11,.08);color:#f59e0b;width:34px;height:34px;border-radius:10px;font-size:15px;"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Profit mensuel par véhicule</div>
          </div>
          <div style="height:320px;"><canvas id="chart-monthly-profit"></canvas></div>
        </div>
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(139,92,246,.08);color:#8b5cf6;width:34px;height:34px;border-radius:10px;font-size:15px;"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Amortissement des véhicules</div>
          </div>
          <div style="height:320px;"><canvas id="chart-depreciation"></canvas></div>
        </div>
      </div>

      <!-- Detail table -->
      <div class="d-card" style="margin-top:16px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div class="d-icon" style="background:rgba(99,102,241,.08);color:#6366f1;width:34px;height:34px;border-radius:10px;font-size:15px;"><iconify-icon icon="solar:list-bold-duotone"></iconify-icon></div>
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Détail par véhicule</div>
        </div>
        <div id="rentabilite-table"></div>
      </div>

      </div></div>
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
            const icon = a.isEV ? '<iconify-icon icon="solar:bolt-bold-duotone" style="color:var(--pilote-yellow);font-size:10px;margin-left:4px"></iconify-icon>' : '';
            return `${a.vehicule.marque} ${a.vehicule.modele} ${icon}`;
          },
          value: (a) => a.vehicule.marque
        },
        {
          label: 'Énergie',
          render: (a) => a.isEV
            ? '<span class="badge badge-warning"><iconify-icon icon="solar:bolt-bold-duotone" style="font-size:8px"></iconify-icon> EV</span>'
            : '<span class="badge badge-neutral"><iconify-icon icon="solar:gas-station-bold-duotone" style="font-size:8px"></iconify-icon> Therm.</span>'
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
