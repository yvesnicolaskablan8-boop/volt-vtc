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
    const chauffeurs = Store.get('chauffeurs') || [];
    const courses = Store.get('courses').filter(c => c.statut === 'terminee');
    const now = new Date();

    // Map véhicule → chauffeurs assignés (pour relier les versements)
    const vehiculeChauffeurIds = {};
    chauffeurs.forEach(ch => {
      if (ch.vehiculeAssigne) {
        if (!vehiculeChauffeurIds[ch.vehiculeAssigne]) vehiculeChauffeurIds[ch.vehiculeAssigne] = [];
        vehiculeChauffeurIds[ch.vehiculeAssigne].push(ch.id);
      }
    });

    // Per-vehicle analysis
    const analysis = vehicules.map(v => {
      const vCourses = courses.filter(c => c.vehiculeId === v.id);
      // Relier versements via vehiculeId OU via les chauffeurs assignés au véhicule
      const chIds = vehiculeChauffeurIds[v.id] || [];
      const vVersements = versements.filter(vs => vs.vehiculeId === v.id || chIds.includes(vs.chauffeurId));

      const totalRevenue = vVersements.filter(vs => vs.statut !== 'supprime' && vs.montantVerse > 0).reduce((s, vs) => s + vs.montantVerse, 0);
      const totalCA = vCourses.reduce((s, c) => s + c.montantTTC, 0);

      // Months in service
      const startDate = new Date(v.dateCreation);
      const monthsInService = Math.max(1, Math.round((now - startDate) / (30 * 24 * 60 * 60 * 1000)));

      // Costs — only real expenses
      const maintenanceTotal = (v.coutsMaintenance || []).reduce((s, m) => s + (m.montant || 0), 0);
      const assuranceTotal = (v.primeAnnuelle && v.primeAnnuelle > 0) ? (v.primeAnnuelle / 12) * monthsInService : 0;

      // Acquisition cost = only what has been paid so far
      let acquisitionTotal = 0;
      if (v.typeAcquisition === 'leasing') {
        const monthsPaid = Math.min(monthsInService, v.dureeLeasing || 36);
        acquisitionTotal = (v.apportInitial || 0) + ((v.mensualiteLeasing || 0) * monthsPaid);
      } else {
        acquisitionTotal = v.prixAchat || 0;
      }

      // Energy cost — only if kilometrage is tracked, otherwise 0
      const isEV = v.typeEnergie === 'electrique';
      let energyCost = 0;
      if (v.kilometrage && v.kilometrage > 0 && v.consommation && v.coutEnergie) {
        energyCost = (v.kilometrage * v.consommation / 100) * v.coutEnergie;
      }

      // Also count real depenses from the store for this vehicle
      const depenses = Store.get('depenses') || [];
      const vehiculeDepenses = depenses.filter(dep => dep.vehiculeId === v.id).reduce((s, dep) => s + (dep.montant || 0), 0);

      // Also count réparations from the store
      const reparations = Store.get('reparations') || [];
      const vehiculeReparations = reparations.filter(r => r.vehiculeId === v.id).reduce((s, r) => s + (r.coutReel || r.coutEstime || 0), 0);

      const totalCost = acquisitionTotal + maintenanceTotal + assuranceTotal + energyCost + vehiculeDepenses + vehiculeReparations;

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

    // Total fleet — revenus calculés depuis TOUS les versements (pas juste ceux liés à un véhicule)
    const fleetTotalRevenue = versements.filter(vs => vs.statut !== 'supprime' && vs.montantVerse > 0).reduce((s, vs) => s + vs.montantVerse, 0);
    const fleetTotalCost = analysis.reduce((s, a) => s + a.totalCost, 0);
    const fleetProfit = fleetTotalRevenue - fleetTotalCost;
    const fleetROI = fleetTotalCost > 0 ? ((fleetTotalRevenue - fleetTotalCost) / fleetTotalCost) * 100 : 0;
    console.log('[Rentabilité] Versements total:', versements.length, '| Versements avec montant:', versements.filter(vs => vs.statut !== 'supprime' && vs.montantVerse > 0).length, '| Revenue:', fleetTotalRevenue, '| Coûts:', fleetTotalCost);

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

    // RSI global — investissement total (coût d'acquisition complet) vs résultat cumulé
    const investTotal = vehicules.reduce((s, v) => {
      if (v.typeAcquisition === 'leasing') return s + (v.apportInitial || 0) + ((v.mensualiteLeasing || 0) * (v.dureeLeasing || 36));
      return s + (v.prixAchat || 0);
    }, 0);
    // Résultat = revenus réels - coûts opérationnels (hors acquisition)
    const coutOperationnel = analysis.reduce((s, a) => s + a.maintenanceTotal + a.assuranceTotal + a.energyCost, 0);
    const depensesTotal = (Store.get('depenses') || []).reduce((s, dep) => s + (dep.montant || 0), 0);
    const reparationsTotal = (Store.get('reparations') || []).reduce((s, r) => s + (r.coutReel || r.coutEstime || 0), 0);
    const resultatCumule = fleetTotalRevenue - fleetTotalCost;
    const rsiGlobal = investTotal > 0 ? (resultatCumule / investTotal * 100) : 0;
    console.log('[Rentabilité] investTotal:', investTotal, '| resultatCumule:', resultatCumule, '| rsiGlobal:', rsiGlobal.toFixed(1) + '%');
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
            <div style="font-size:12px;color:var(--text-muted);font-weight:600;">RSI</div>
          </div>
          <div style="font-size:22px;font-weight:900;color:${d.rsiGlobal >= 0 ? '#6366f1' : '#ef4444'};letter-spacing:-.3px;">${d.rsiGlobal.toFixed(1)}%</div>
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
            <div style="font-size:14px;font-weight:800;color:var(--text-primary);">Revenus vs Coûts par véhicule</div>
          </div>
          <div style="height:340px;"><canvas id="chart-rev-vs-cost"></canvas></div>
        </div>
        <div class="rent-chart-wrap">
          <div class="rent-section-title">
            <div class="rent-section-icon" style="background:rgba(245,158,11,.1);color:#f59e0b;"><iconify-icon icon="solar:pie-chart-2-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:800;color:var(--text-primary);">Répartition des coûts</div>
          </div>
          <div style="height:340px;"><canvas id="chart-cost-breakdown"></canvas></div>
        </div>
        <div class="rent-chart-wrap">
          <div class="rent-section-title">
            <div class="rent-section-icon" style="background:rgba(16,185,129,.1);color:#10b981;"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:800;color:var(--text-primary);">Profit mensuel par véhicule</div>
          </div>
          <div style="height:340px;"><canvas id="chart-monthly-profit"></canvas></div>
        </div>
        <div class="rent-chart-wrap">
          <div class="rent-section-title">
            <div class="rent-section-icon" style="background:rgba(139,92,246,.1);color:#8b5cf6;"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon></div>
            <div style="font-size:14px;font-weight:800;color:var(--text-primary);">Projection leasing (36 mois)</div>
          </div>
          <div style="height:340px;"><canvas id="chart-projection"></canvas></div>
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
    const shortLabel = (a) => a.vehicule.immatriculation || `${a.vehicule.marque} ${a.vehicule.modele}`.slice(0, 12);

    // 1. Revenus vs Coûts — grouped bar with gradient
    const revCostCtx = document.getElementById('chart-rev-vs-cost');
    if (revCostCtx) {
      const ctx2d = revCostCtx.getContext('2d');
      const revGrad = ctx2d.createLinearGradient(0, 340, 0, 0);
      revGrad.addColorStop(0, 'rgba(16,185,129,.15)');
      revGrad.addColorStop(1, 'rgba(16,185,129,.9)');
      const costGrad = ctx2d.createLinearGradient(0, 340, 0, 0);
      costGrad.addColorStop(0, 'rgba(239,68,68,.15)');
      costGrad.addColorStop(1, 'rgba(239,68,68,.9)');

      this._charts.push(new Chart(revCostCtx, {
        type: 'bar',
        data: {
          labels: d.analysis.map(a => shortLabel(a)),
          datasets: [
            { label: 'Revenus', data: d.analysis.map(a => Math.round(a.totalRevenue)), backgroundColor: revGrad, hoverBackgroundColor: '#10b981', borderRadius: 12, borderSkipped: false, barPercentage: 0.7 },
            { label: 'Coûts', data: d.analysis.map(a => Math.round(a.totalCost)), backgroundColor: costGrad, hoverBackgroundColor: '#ef4444', borderRadius: 12, borderSkipped: false, barPercentage: 0.7 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            tooltip: { ...cd.tooltip, callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}`,
              afterBody: (items) => { const a = d.analysis[items[0].dataIndex]; return `\n  Profit: ${Utils.formatCurrency(a.totalRevenue - a.totalCost)}\n  RSI: ${a.roi.toFixed(1)}%`; }
            }},
            legend: { ...cd.legend, position: 'top' }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: cd.tickColor, font: { size: 10 }, maxRotation: 45 } },
            y: { grid: { color: cd.gridColor, drawBorder: false }, ticks: { color: cd.tickColor, font: { size: 10 }, callback: v => (v/1000000).toFixed(1) + 'M' }, border: { display: false } }
          }
        }
      }));
    }

    // 2. Répartition des coûts — Doughnut moderne
    const costBrkCtx = document.getElementById('chart-cost-breakdown');
    if (costBrkCtx) {
      const totalAcq = d.analysis.reduce((s, a) => s + (a.acquisitionTotal || 0), 0);
      const totalMaint = d.analysis.reduce((s, a) => s + (a.maintenanceTotal || 0), 0);
      const totalAssur = d.analysis.reduce((s, a) => s + (a.assuranceTotal || 0), 0);
      const totalEnergy = d.analysis.reduce((s, a) => s + (a.energyCost || 0), 0);
      const costData = [totalAcq, totalMaint, totalAssur, totalEnergy].map(v => Math.round(v));
      const costLabels = ['Leasing / Achat', 'Maintenance', 'Assurance', 'Énergie'];
      const costColors = ['#6366f1', '#f87171', '#fbbf24', '#22d3ee'];
      const costHover = ['#818cf8', '#fca5a5', '#fcd34d', '#67e8f9'];

      this._charts.push(new Chart(costBrkCtx, {
        type: 'doughnut',
        data: {
          labels: costLabels,
          datasets: [{
            data: costData,
            backgroundColor: costColors,
            hoverBackgroundColor: costHover,
            borderWidth: 0,
            hoverOffset: 12,
            spacing: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            tooltip: { ...cd.tooltip, callbacks: {
              label: (ctx) => {
                const total = costData.reduce((s, v) => s + v, 0);
                const pct = total > 0 ? (ctx.raw / total * 100).toFixed(1) : 0;
                return ` ${ctx.label}: ${Utils.formatCurrency(ctx.raw)} (${pct}%)`;
              }
            }},
            legend: { position: 'bottom', labels: { color: cd.tickColor, font: { size: 12, weight: 600 }, usePointStyle: true, pointStyle: 'circle', padding: 16 } }
          }
        }
      }));
    }

    // 3. Profit mensuel — bar chart avec gradient
    const profitCtx = document.getElementById('chart-monthly-profit');
    if (profitCtx) {
      const ctx2d = profitCtx.getContext('2d');
      const profitBgs = d.analysis.map(a => {
        const g = ctx2d.createLinearGradient(0, 340, 0, 0);
        if (a.monthlyProfit >= 0) { g.addColorStop(0, 'rgba(16,185,129,.1)'); g.addColorStop(1, 'rgba(16,185,129,.85)'); }
        else { g.addColorStop(0, 'rgba(239,68,68,.1)'); g.addColorStop(1, 'rgba(239,68,68,.85)'); }
        return g;
      });

      this._charts.push(new Chart(profitCtx, {
        type: 'bar',
        data: {
          labels: d.analysis.map(a => shortLabel(a)),
          datasets: [{
            label: 'Profit/mois',
            data: d.analysis.map(a => a.monthlyProfit),
            backgroundColor: profitBgs,
            hoverBackgroundColor: d.analysis.map(a => a.monthlyProfit >= 0 ? '#34d399' : '#f87171'),
            borderRadius: 14, borderSkipped: false, barPercentage: 0.6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { ...cd.tooltip, callbacks: {
              label: (ctx) => ` Profit: ${Utils.formatCurrency(ctx.raw)}/mois`,
              afterLabel: (ctx) => { const a = d.analysis[ctx.dataIndex]; return `  Revenu: ${Utils.formatCurrency(a.monthlyRevenue)}/mois\n  Coût: ${Utils.formatCurrency(a.monthlyCost)}/mois`; }
            }}
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: cd.tickColor, font: { size: 10 }, maxRotation: 45 } },
            y: { grid: { color: cd.gridColor, drawBorder: false }, ticks: { color: cd.tickColor, font: { size: 10 }, callback: v => Utils.formatCurrency(v) }, border: { display: false } }
          }
        }
      }));
    }

    // 4. Projection leasing — area chart (coût cumulé vs revenus cumulés sur durée leasing)
    const projCtx = document.getElementById('chart-projection');
    if (projCtx) {
      const ctx2d = projCtx.getContext('2d');
      const months = 36;
      const labels = Array.from({ length: months + 1 }, (_, i) => i === 0 ? '0' : `${i}`);

      // Coût leasing cumulé moyen (toute la flotte)
      const avgMensualite = d.analysis.reduce((s, a) => s + (a.vehicule.mensualiteLeasing || 0), 0);
      const totalApport = d.analysis.reduce((s, a) => s + (a.vehicule.apportInitial || 0), 0);
      const avgMonthlyRevenue = d.analysis.reduce((s, a) => s + a.monthlyRevenue, 0);
      const costCumul = labels.map((_, i) => totalApport + avgMensualite * i);
      const revCumul = labels.map((_, i) => avgMonthlyRevenue * i);

      const costGrad = ctx2d.createLinearGradient(0, 0, 0, 340);
      costGrad.addColorStop(0, 'rgba(239,68,68,.3)');
      costGrad.addColorStop(1, 'rgba(239,68,68,.02)');
      const revGrad = ctx2d.createLinearGradient(0, 0, 0, 340);
      revGrad.addColorStop(0, 'rgba(16,185,129,.3)');
      revGrad.addColorStop(1, 'rgba(16,185,129,.02)');

      this._charts.push(new Chart(projCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Revenus cumulés', data: revCumul, borderColor: '#10b981', borderWidth: 3, pointRadius: 0,
              pointHoverRadius: 6, pointHoverBackgroundColor: '#10b981', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
              fill: true, backgroundColor: revGrad, tension: 0.4
            },
            {
              label: 'Coût leasing cumulé', data: costCumul, borderColor: '#ef4444', borderWidth: 3, pointRadius: 0,
              pointHoverRadius: 6, pointHoverBackgroundColor: '#ef4444', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
              fill: true, backgroundColor: costGrad, tension: 0.1, borderDash: [8, 4]
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: { ...cd.tooltip, callbacks: {
              title: (items) => `Mois ${items[0].label}`,
              label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}`,
              afterBody: (items) => {
                const m = items[0].dataIndex;
                const diff = revCumul[m] - costCumul[m];
                return `\n  ${diff >= 0 ? '✅ Rentable' : '⏳ Pas encore rentable'}: ${Utils.formatCurrency(Math.abs(diff))}`;
              }
            }},
            legend: { ...cd.legend, position: 'top' }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: cd.tickColor, font: { size: 10 }, maxTicksLimit: 12 }, title: { display: true, text: 'Mois', color: cd.tickColor, font: { size: 11, weight: 600 } } },
            y: { grid: { color: cd.gridColor, drawBorder: false }, ticks: { color: cd.tickColor, font: { size: 10 }, callback: v => (v/1000000).toFixed(0) + 'M' }, border: { display: false } }
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
