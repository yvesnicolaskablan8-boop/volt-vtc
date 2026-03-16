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

    // RSI global — investissement total vs résultat cumulé
    const investTotal = vehicules.reduce((s, v) => {
      if (v.typeAcquisition === 'leasing') return s + (v.apportInitial || 0) + ((v.mensualiteLeasing || 0) * (v.dureeLeasing || 0));
      return s + (v.prixAchat || 0);
    }, 0);
    const resultatCumule = fleetTotalRevenue - fleetTotalCost;
    const rsiGlobal = investTotal > 0 ? (resultatCumule / investTotal * 100) : 0;
    // Délai de récupération
    const avgMonthsService = analysis.length > 0 ? analysis.reduce((s, a) => s + a.monthsInService, 0) / analysis.length : 1;
    const resultatMensuelMoyen = avgMonthsService > 0 ? resultatCumule / avgMonthsService : 0;
    const moisRecuperation = resultatMensuelMoyen > 0 ? Math.ceil((investTotal - Math.max(0, resultatCumule)) / resultatMensuelMoyen) : null;

    return {
      analysis, fleetTotalRevenue, fleetTotalCost, fleetProfit, fleetROI,
      avgLeasingROI, avgCashROI, cumulativeLeasingCost, cumulativeCashCost,
      leasingCount: leasingVehicles.length, cashCount: cashVehicles.length,
      evCount: evVehicles.length, thermalCount: thermalVehicles.length,
      avgEVCoutKm, avgThermalCoutKm, avgEVEnergy, avgThermalEnergy,
      avgEVMaintenance, avgThermalMaintenance, avgEVROI, avgThermalROI,
      energySavingsPercent,
      investTotal, resultatCumule, rsiGlobal, moisRecuperation, vehiculeCount: vehicules.length
    };
  },

  _template(d) {
    const rsiColor = d.rsiGlobal >= 50 ? '#10b981' : d.rsiGlobal >= 0 ? '#f59e0b' : '#ef4444';
    const rsiBarColor = d.rsiGlobal >= 100 ? '#10b981' : d.rsiGlobal >= 50 ? '#3b82f6' : d.rsiGlobal >= 0 ? '#f59e0b' : '#ef4444';
    const rsiPct = Math.min(Math.max(d.rsiGlobal, 0), 100);

    return `
      <style>
        .rent-hero { position:relative;border-radius:24px;padding:32px;margin-bottom:24px;overflow:hidden;background:linear-gradient(135deg,#1e1b4b,#312e81,#4338ca);box-shadow:0 20px 60px rgba(99,102,241,.25); }
        .rent-hero::before { content:'';position:absolute;top:-50%;right:-30%;width:80%;height:200%;background:radial-gradient(circle,rgba(139,92,246,.15) 0%,transparent 70%);pointer-events:none; }
        .rent-hero::after { content:'';position:absolute;bottom:-40%;left:-20%;width:60%;height:150%;background:radial-gradient(circle,rgba(16,185,129,.1) 0%,transparent 60%);pointer-events:none; }
        .rent-hero * { position:relative;z-index:1; }
        .rent-kpi-glass { background:rgba(255,255,255,.08);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:20px;text-align:center;transition:transform .2s,box-shadow .2s; }
        .rent-kpi-glass:hover { transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.2); }
        .rent-kpi-val { font-size:26px;font-weight:900;letter-spacing:-.5px;line-height:1.1; }
        .rent-kpi-lbl { font-size:11px;color:rgba(255,255,255,.6);margin-top:6px;font-weight:500; }
        .rent-progress { height:10px;border-radius:10px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:18px; }
        .rent-progress-fill { height:100%;border-radius:10px;transition:width 1s ease-out;background:linear-gradient(90deg,${rsiBarColor},${rsiBarColor}cc); box-shadow:0 0 12px ${rsiBarColor}66; }
        .rent-card { border-radius:20px;padding:24px;background:var(--bg-secondary);border:1px solid var(--border-color);transition:transform .2s,box-shadow .2s; }
        .rent-card:hover { transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,0,0,.08); }
        .rent-chart-wrap { border-radius:20px;padding:24px;background:var(--bg-secondary);border:1px solid var(--border-color); }
        .rent-section-title { display:flex;align-items:center;gap:10px;margin-bottom:18px; }
        .rent-section-icon { width:38px;height:38px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:17px; }
        .rent-compare-row { display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-color);font-size:13px; }
        .rent-compare-row:last-child { border-bottom:none; }
        .rent-badge { display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700; }
        @media(max-width:768px) {
          .rent-hero { padding:20px;border-radius:18px; }
          .rent-kpi-val { font-size:20px; }
          .rent-hero-grid { grid-template-columns:1fr 1fr !important; }
        }
      </style>

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

      <!-- ===== RSI HERO BLOCK ===== -->
      <div class="rent-hero">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;backdrop-filter:blur(8px);">
            <iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon>
          </div>
          <div>
            <div style="font-size:17px;font-weight:800;color:#fff;">Retour Sur Investissement (RSI)</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);">Basé sur ${d.vehiculeCount} véhicule${d.vehiculeCount > 1 ? 's' : ''} — investissement total : ${Utils.formatCurrency(d.investTotal)}</div>
          </div>
        </div>

        <div class="rent-hero-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">
          <div class="rent-kpi-glass">
            <div class="rent-kpi-val" style="color:${rsiColor};">${d.rsiGlobal.toFixed(1)}%</div>
            <div class="rent-kpi-lbl">RSI global</div>
          </div>
          <div class="rent-kpi-glass">
            <div class="rent-kpi-val" style="color:#fff;">${Utils.formatCurrency(d.investTotal)}</div>
            <div class="rent-kpi-lbl">Investissement total</div>
          </div>
          <div class="rent-kpi-glass">
            <div class="rent-kpi-val" style="color:${d.resultatCumule >= 0 ? '#34d399' : '#f87171'};">${Utils.formatCurrency(d.resultatCumule)}</div>
            <div class="rent-kpi-lbl">Résultat cumulé</div>
          </div>
          <div class="rent-kpi-glass">
            <div class="rent-kpi-val" style="color:${d.moisRecuperation !== null && d.moisRecuperation <= 0 ? '#34d399' : '#fbbf24'};">${d.moisRecuperation !== null ? (d.moisRecuperation <= 0 ? 'Récupéré !' : d.moisRecuperation + ' mois') : '—'}</div>
            <div class="rent-kpi-lbl">${d.moisRecuperation !== null && d.moisRecuperation <= 0 ? 'Investissement amorti' : 'Délai de récupération'}</div>
          </div>
        </div>

        <div class="rent-progress">
          <div class="rent-progress-fill" style="width:${rsiPct}%;"></div>
        </div>
        <div style="text-align:right;margin-top:8px;font-size:12px;font-weight:700;color:${rsiBarColor};">${rsiPct.toFixed(0)}% récupéré</div>
      </div>

      <!-- ===== KPIs FLOTTE ===== -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;">
        <div class="rent-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <div class="rent-section-icon" style="background:rgba(16,185,129,.1);color:#10b981;"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon></div>
            <div style="font-size:12px;color:var(--text-muted);font-weight:600;">Revenus flotte</div>
          </div>
          <div style="font-size:22px;font-weight:900;color:#10b981;letter-spacing:-.3px;">${Utils.formatCurrency(d.fleetTotalRevenue)}</div>
        </div>
        <div class="rent-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <div class="rent-section-icon" style="background:rgba(239,68,68,.1);color:#ef4444;"><iconify-icon icon="solar:graph-down-bold-duotone"></iconify-icon></div>
            <div style="font-size:12px;color:var(--text-muted);font-weight:600;">Coûts flotte</div>
          </div>
          <div style="font-size:22px;font-weight:900;color:#ef4444;letter-spacing:-.3px;">${Utils.formatCurrency(d.fleetTotalCost)}</div>
        </div>
        <div class="rent-card" style="${d.fleetProfit < 0 ? 'border-color:rgba(239,68,68,.25);' : ''}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <div class="rent-section-icon" style="background:${d.fleetProfit >= 0 ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)'};color:${d.fleetProfit >= 0 ? '#10b981' : '#ef4444'};"><iconify-icon icon="solar:calculator-bold-duotone"></iconify-icon></div>
            <div style="font-size:12px;color:var(--text-muted);font-weight:600;">Profit net</div>
          </div>
          <div style="font-size:22px;font-weight:900;color:${d.fleetProfit >= 0 ? '#10b981' : '#ef4444'};letter-spacing:-.3px;">${Utils.formatCurrency(d.fleetProfit)}</div>
        </div>
        <div class="rent-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <div class="rent-section-icon" style="background:rgba(99,102,241,.1);color:#6366f1;"><iconify-icon icon="solar:sale-bold-duotone"></iconify-icon></div>
            <div style="font-size:12px;color:var(--text-muted);font-weight:600;">RSI flotte</div>
          </div>
          <div style="font-size:22px;font-weight:900;color:#6366f1;letter-spacing:-.3px;">${d.fleetROI.toFixed(1)}%</div>
        </div>
      </div>

      <!-- ===== LEASING vs CASH ===== -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px;">
        <div class="rent-card" style="background:linear-gradient(135deg,var(--bg-secondary),rgba(99,102,241,.04));">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <div class="rent-section-icon" style="background:rgba(99,102,241,.12);color:#6366f1;"><iconify-icon icon="solar:document-bold-duotone"></iconify-icon></div>
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text-primary);">Leasing</div>
              <div style="font-size:11px;color:var(--text-muted);">${d.leasingCount} véhicule${d.leasingCount > 1 ? 's' : ''}</div>
            </div>
          </div>
          <div style="font-size:28px;font-weight:900;color:#6366f1;margin-bottom:6px;">${d.avgLeasingROI.toFixed(1)}%</div>
          <div style="font-size:11px;color:var(--text-muted);">RSI moyen — trésorerie préservée</div>
        </div>
        <div class="rent-card" style="background:linear-gradient(135deg,var(--bg-secondary),rgba(16,185,129,.04));">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <div class="rent-section-icon" style="background:rgba(16,185,129,.12);color:#10b981;"><iconify-icon icon="solar:money-bag-bold-duotone"></iconify-icon></div>
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text-primary);">Cash</div>
              <div style="font-size:11px;color:var(--text-muted);">${d.cashCount} véhicule${d.cashCount > 1 ? 's' : ''}</div>
            </div>
          </div>
          <div style="font-size:28px;font-weight:900;color:#10b981;margin-bottom:6px;">${d.avgCashROI.toFixed(1)}%</div>
          <div style="font-size:11px;color:var(--text-muted);">RSI moyen — pas de mensualités</div>
        </div>
      </div>

      <!-- ===== CHARTS ===== -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px;">
        <div class="rent-chart-wrap">
          <div class="rent-section-title">
            <div class="rent-section-icon" style="background:rgba(99,102,241,.1);color:#6366f1;"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:800;color:var(--text-primary);">TCO par véhicule</div>
          </div>
          <div style="height:320px;"><canvas id="chart-tco"></canvas></div>
        </div>
        <div class="rent-chart-wrap">
          <div class="rent-section-title">
            <div class="rent-section-icon" style="background:rgba(16,185,129,.1);color:#10b981;"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:800;color:var(--text-primary);">Leasing vs Cash (48 mois)</div>
          </div>
          <div style="height:320px;"><canvas id="chart-leasing-cash"></canvas></div>
        </div>
        <div class="rent-chart-wrap">
          <div class="rent-section-title">
            <div class="rent-section-icon" style="background:rgba(245,158,11,.1);color:#f59e0b;"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:800;color:var(--text-primary);">Profit mensuel</div>
          </div>
          <div style="height:320px;"><canvas id="chart-monthly-profit"></canvas></div>
        </div>
        <div class="rent-chart-wrap">
          <div class="rent-section-title">
            <div class="rent-section-icon" style="background:rgba(139,92,246,.1);color:#8b5cf6;"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:800;color:var(--text-primary);">Amortissement (5 ans)</div>
          </div>
          <div style="height:320px;"><canvas id="chart-depreciation"></canvas></div>
        </div>
      </div>

      <!-- ===== RSI par véhicule — Radar ===== -->
      <div class="rent-chart-wrap" style="margin-bottom:24px;">
        <div class="rent-section-title">
          <div class="rent-section-icon" style="background:rgba(99,102,241,.1);color:#6366f1;"><iconify-icon icon="solar:pie-chart-2-bold-duotone"></iconify-icon></div>
          <div style="font-size:14px;font-weight:800;color:var(--text-primary);">RSI par véhicule</div>
        </div>
        <div style="height:350px;"><canvas id="chart-rsi-vehicule"></canvas></div>
      </div>

      <!-- ===== TABLE DETAIL ===== -->
      <div class="rent-card">
        <div class="rent-section-title">
          <div class="rent-section-icon" style="background:rgba(99,102,241,.1);color:#6366f1;"><iconify-icon icon="solar:list-bold-duotone"></iconify-icon></div>
          <div style="font-size:14px;font-weight:800;color:var(--text-primary);">Détail par véhicule</div>
        </div>
        <div id="rentabilite-table"></div>
      </div>

      </div></div>
    `;
  },

  _chartDefaults() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)';
    const tickColor = isDark ? '#94a3b8' : '#6b7280';
    return {
      tooltip: {
        backgroundColor: isDark ? 'rgba(15,23,42,.97)' : 'rgba(255,255,255,.98)',
        titleColor: isDark ? '#f1f5f9' : '#111827',
        bodyColor: isDark ? '#cbd5e1' : '#4b5563',
        borderColor: isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)',
        borderWidth: 1,
        cornerRadius: 16,
        padding: 16,
        boxPadding: 8,
        titleFont: { size: 13, weight: 800 },
        bodyFont: { size: 12, weight: 500 },
        displayColors: true,
        usePointStyle: true,
        caretSize: 8,
      },
      legend: {
        labels: { color: tickColor, font: { size: 12, weight: 600 }, usePointStyle: true, pointStyle: 'rectRounded', padding: 20 }
      },
      gridColor, tickColor, isDark
    };
  },

  _makeGradient(ctx, color1, color2, vertical) {
    const gradient = ctx.createLinearGradient(0, 0, vertical ? 0 : ctx.canvas.width, vertical ? ctx.canvas.height : 0);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    return gradient;
  },

  _loadCharts(d) {
    this._charts = [];
    const cd = this._chartDefaults();

    // TCO stacked bar chart — modern rounded
    const tcoCtx = document.getElementById('chart-tco');
    if (tcoCtx) {
      this._charts.push(new Chart(tcoCtx, {
        type: 'bar',
        data: {
          labels: d.analysis.map(a => `${a.vehicule.marque} ${a.vehicule.modele}`),
          datasets: [
            { label: 'Acquisition', data: d.analysis.map(a => Math.round(a.acquisitionTotal)), backgroundColor: '#6366f1', hoverBackgroundColor: '#818cf8', borderRadius: 10, borderSkipped: false },
            { label: 'Assurance', data: d.analysis.map(a => a.assuranceTotal), backgroundColor: '#fbbf24', hoverBackgroundColor: '#fcd34d', borderRadius: 10, borderSkipped: false },
            { label: 'Maintenance', data: d.analysis.map(a => Math.round(a.maintenanceTotal)), backgroundColor: '#f87171', hoverBackgroundColor: '#fca5a5', borderRadius: 10, borderSkipped: false },
            { label: 'Énergie', data: d.analysis.map(a => a.energyCost), backgroundColor: '#22d3ee', hoverBackgroundColor: '#67e8f9', borderRadius: 10, borderSkipped: false }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: { ...cd.tooltip, callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                const a = d.analysis[idx];
                return `${a.vehicule.marque} ${a.vehicule.modele} (${a.isEV ? '⚡ EV' : '⛽ Thermique'})`;
              },
              label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}`,
              afterBody: (items) => {
                const idx = items[0].dataIndex;
                const a = d.analysis[idx];
                return `\n  TCO total: ${Utils.formatCurrency(a.totalCost)}\n  Coût/km: ${a.coutParKm} FCFA`;
              }
            }},
            legend: cd.legend
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: cd.tickColor, font: { size: 11 } } },
            y: { stacked: true, grid: { color: cd.gridColor }, ticks: { color: cd.tickColor, font: { size: 11 }, callback: (v) => Utils.formatCurrency(v) }, border: { display: false } }
          }
        }
      }));
    }

    // Leasing vs Cash comparison
    if (d.cumulativeLeasingCost.length > 0) {
      const lcCtx = document.getElementById('chart-leasing-cash');
      if (lcCtx) {
        const labels = Array.from({ length: 49 }, (_, i) => i === 0 ? '0' : `${i}`);
        let crossoverMonth = null;
        for (let m = 1; m < d.cumulativeLeasingCost.length; m++) {
          const diffPrev = d.cumulativeLeasingCost[m - 1] - d.cumulativeCashCost[m - 1];
          const diffCurr = d.cumulativeLeasingCost[m] - d.cumulativeCashCost[m];
          if ((diffPrev >= 0 && diffCurr < 0) || (diffPrev <= 0 && diffCurr > 0)) { crossoverMonth = m; break; }
        }

        const ctxCanvas = lcCtx.getContext('2d');
        const leasingGrad = ctxCanvas.createLinearGradient(0, 0, 0, 320);
        leasingGrad.addColorStop(0, 'rgba(99,102,241,.25)');
        leasingGrad.addColorStop(1, 'rgba(99,102,241,.02)');
        const cashGrad = ctxCanvas.createLinearGradient(0, 0, 0, 320);
        cashGrad.addColorStop(0, 'rgba(34,197,94,.25)');
        cashGrad.addColorStop(1, 'rgba(34,197,94,.02)');

        this._charts.push(new Chart(lcCtx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Leasing', data: d.cumulativeLeasingCost, borderColor: '#6366f1', borderWidth: 2.5, pointRadius: 0,
                pointHoverRadius: 6, pointHoverBorderWidth: 2, pointHoverBackgroundColor: '#6366f1', pointHoverBorderColor: '#fff',
                fill: true, backgroundColor: leasingGrad, tension: 0.4
              },
              {
                label: 'Cash', data: d.cumulativeCashCost, borderColor: '#22c55e', borderWidth: 2.5, pointRadius: 0,
                pointHoverRadius: 6, pointHoverBorderWidth: 2, pointHoverBackgroundColor: '#22c55e', pointHoverBorderColor: '#fff',
                fill: true, backgroundColor: cashGrad, tension: 0.4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              tooltip: { ...cd.tooltip, callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}`,
                afterBody: (items) => {
                  const month = items[0].dataIndex;
                  const diff = Math.abs(d.cumulativeLeasingCost[month] - d.cumulativeCashCost[month]);
                  let lines = [`\n  Écart: ${Utils.formatCurrency(diff)}`];
                  if (crossoverMonth !== null) lines.push(`  Seuil de rentabilité: mois ${crossoverMonth}`);
                  return lines.join('\n');
                }
              }},
              legend: cd.legend
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: cd.tickColor, font: { size: 10 }, maxTicksLimit: 12 }, title: { display: true, text: 'Mois', color: cd.tickColor, font: { size: 11 } } },
              y: { grid: { color: cd.gridColor }, ticks: { color: cd.tickColor, font: { size: 11 }, callback: (v) => Utils.formatCurrency(v) }, border: { display: false } }
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
            backgroundColor: d.analysis.map(a => a.monthlyProfit >= 0 ? '#34d399' : '#f87171'),
            hoverBackgroundColor: d.analysis.map(a => a.monthlyProfit >= 0 ? '#6ee7b7' : '#fca5a5'),
            borderRadius: 12,
            borderSkipped: false,
            barPercentage: 0.65,
            categoryPercentage: 0.7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { ...cd.tooltip, callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                const a = d.analysis[idx];
                return `${a.vehicule.marque} ${a.vehicule.modele}`;
              },
              label: (ctx) => ` Profit mensuel: ${Utils.formatCurrency(ctx.raw)}`,
              afterBody: (items) => {
                const idx = items[0].dataIndex;
                const a = d.analysis[idx];
                return [`\n  Revenu/mois: ${Utils.formatCurrency(a.monthlyRevenue)}`, `  Coût/mois: ${Utils.formatCurrency(a.monthlyCost)}`, `  RSI: ${a.roi.toFixed(1)}%`].join('\n');
              }
            }}
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: cd.tickColor, font: { size: 11 } } },
            y: { grid: { color: cd.gridColor }, ticks: { color: cd.tickColor, font: { size: 11 }, callback: (v) => Utils.formatCurrency(v) }, border: { display: false } }
          }
        }
      }));
    }

    // Depreciation chart
    const depCtx = document.getElementById('chart-depreciation');
    if (depCtx) {
      const depColors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316'];
      const datasets = d.analysis.map((a, i) => {
        const depRate = a.isEV ? 0.85 : 0.80;
        const data = [];
        for (let y = 0; y <= 5; y++) data.push(Math.round(a.vehicule.prixAchat * Math.pow(depRate, y)));
        const color = depColors[i % depColors.length];
        return {
          label: `${a.vehicule.marque} ${a.vehicule.modele}${a.isEV ? ' ⚡' : ''}`,
          data,
          borderColor: color,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: color,
          pointBorderColor: cd.isDark ? '#1a2235' : '#fff',
          pointBorderWidth: 2,
          pointHoverRadius: 7,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          borderDash: a.isEV ? [] : [6, 4],
          tension: 0.3
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
            tooltip: { ...cd.tooltip, callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}`,
              afterLabel: (ctx) => {
                const a = d.analysis[ctx.datasetIndex];
                const year = ctx.dataIndex;
                if (year === 0) return '';
                const depPercent = ((1 - ctx.raw / a.vehicule.prixAchat) * 100).toFixed(1);
                return `  Dépréciation: -${depPercent}% (${a.isEV ? '15' : '20'}%/an)`;
              }
            }},
            legend: cd.legend
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: cd.tickColor, font: { size: 11 } } },
            y: { grid: { color: cd.gridColor }, ticks: { color: cd.tickColor, font: { size: 11 }, callback: (v) => Utils.formatCurrency(v) }, border: { display: false } }
          }
        }
      }));
    }

    // RSI par véhicule — horizontal bar chart
    const rsiCtx = document.getElementById('chart-rsi-vehicule');
    if (rsiCtx) {
      const sorted = [...d.analysis].sort((a, b) => b.roi - a.roi);
      const rsiColors = sorted.map(a => a.roi >= 20 ? '#10b981' : a.roi >= 0 ? '#f59e0b' : '#ef4444');
      const ctxC = rsiCtx.getContext('2d');
      const rsiGrads = sorted.map((a, i) => {
        const g = ctxC.createLinearGradient(0, 0, ctxC.canvas.width, 0);
        g.addColorStop(0, rsiColors[i] + '33');
        g.addColorStop(1, rsiColors[i]);
        return g;
      });

      this._charts.push(new Chart(rsiCtx, {
        type: 'bar',
        data: {
          labels: sorted.map(a => `${a.vehicule.marque} ${a.vehicule.modele}`),
          datasets: [{
            label: 'RSI',
            data: sorted.map(a => parseFloat(a.roi.toFixed(1))),
            backgroundColor: rsiGrads,
            hoverBackgroundColor: rsiColors,
            borderRadius: 10,
            borderSkipped: false,
            barPercentage: 0.6,
            categoryPercentage: 0.8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: { ...cd.tooltip, callbacks: {
              label: (ctx) => ` RSI: ${ctx.raw}%`,
              afterLabel: (ctx) => {
                const a = sorted[ctx.dataIndex];
                return `  Revenu: ${Utils.formatCurrency(a.totalRevenue)}\n  Coût: ${Utils.formatCurrency(a.totalCost)}\n  Profit: ${Utils.formatCurrency(a.totalRevenue - a.totalCost)}`;
              }
            }}
          },
          scales: {
            x: { grid: { color: cd.gridColor }, ticks: { color: cd.tickColor, font: { size: 11, weight: 600 }, callback: v => v + '%' }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: cd.tickColor, font: { size: 12, weight: 600 } } }
          }
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
        { label: 'RSI', render: (a) => `<span class="${a.roi >= 0 ? 'text-success' : 'text-danger'}">${a.roi.toFixed(1)}%</span>`, value: (a) => a.roi },
        { label: 'Valeur résiduelle', render: (a) => Utils.formatCurrency(a.bookValue), value: (a) => a.bookValue }
      ],
      data: d.analysis,
      pageSize: 10
    });
  }
};
