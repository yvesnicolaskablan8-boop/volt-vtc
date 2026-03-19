/**
 * RentabilitePage - Vehicle profitability analysis
 */
const RentabilitePage = {
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    container.innerHTML = this._template(data);
    this._renderPaiements(data.analysis);
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

    // Helper : montant d'un versement (tester plusieurs champs)
    const getVersementMontant = (vs) => vs.montantVerse || vs.montantNet || vs.montant || vs.montantBrut || 0;

    // Build reverse map: chauffeurId → vehiculeId from versements themselves
    const chauffeurToVehicle = {};
    chauffeurs.forEach(ch => {
      if (ch.vehiculeAssigne) chauffeurToVehicle[ch.id] = ch.vehiculeAssigne;
    });
    // Also from versements that have both chauffeurId and vehiculeId
    versements.forEach(vs => {
      if (vs.chauffeurId && vs.vehiculeId && !chauffeurToVehicle[vs.chauffeurId]) {
        chauffeurToVehicle[vs.chauffeurId] = vs.vehiculeId;
      }
    });

    if (versements.length > 0) {
    }

    // Per-vehicle analysis
    const analysis = vehicules.map(v => {
      const vCourses = courses.filter(c => c.vehiculeId === v.id);
      // Relier versements via vehiculeId OU via les chauffeurs assignés au véhicule
      const chIds = vehiculeChauffeurIds[v.id] || [];
      // Also check chauffeurToVehicle reverse map
      const allLinkedChauffeurs = [...chIds];
      Object.entries(chauffeurToVehicle).forEach(([chId, vId]) => {
        if (vId === v.id && !allLinkedChauffeurs.includes(chId)) allLinkedChauffeurs.push(chId);
      });
      const vVersements = versements.filter(vs => vs.vehiculeId === v.id || allLinkedChauffeurs.includes(vs.chauffeurId));

      const totalRevenue = vVersements.filter(vs => vs.statut !== 'supprime').reduce((s, vs) => s + getVersementMontant(vs), 0);
      const totalCA = vCourses.reduce((s, c) => s + c.montantTTC, 0);

      // Months in service — utiliser dateAcquisition si disponible, sinon dateCreation
      // Math.ceil car si on est dans le mois 2, on a payé 2 mensualités
      const startDate = new Date(v.dateAcquisition || v.dateCreation);
      const monthsInService = Math.max(1, Math.ceil((now - startDate) / (30 * 24 * 60 * 60 * 1000)));

      // Acquisition cost = only what has been paid so far
      let acquisitionTotal = 0;
      let mensualitesPaid = 0;
      if (v.typeAcquisition === 'leasing') {
        if (typeof v.mensualitesPaid === 'number') {
          mensualitesPaid = v.mensualitesPaid;
          if (v.autoFillLeasing !== false && v.mensualitesPaidDate) {
            const savedDate = new Date(v.mensualitesPaidDate);
            const monthsSinceSave = Math.max(0, Math.floor((now - savedDate) / (30 * 24 * 60 * 60 * 1000)));
            mensualitesPaid += monthsSinceSave;
          }
          mensualitesPaid = Math.min(mensualitesPaid, v.dureeLeasing || 36);
        } else {
          mensualitesPaid = Math.min(monthsInService, v.dureeLeasing || 36);
        }
        acquisitionTotal = (v.apportInitial || 0) + ((v.mensualiteLeasing || 0) * mensualitesPaid);
      } else {
        acquisitionTotal = typeof v.montantPaye === 'number' ? v.montantPaye : (v.prixAchat || 0);
      }

      const isEV = v.typeEnergie === 'electrique';

      // Charges RÉELLES uniquement (pas de calculs estimés)
      // Dépenses enregistrées pour ce véhicule
      const depenses = Store.get('depenses') || [];
      const vehiculeDepenses = depenses.filter(dep => dep.vehiculeId === v.id).reduce((s, dep) => s + (dep.montant || 0), 0);
      // Réparations enregistrées
      const reparations = Store.get('reparations') || [];
      const vehiculeReparations = reparations.filter(r => r.vehiculeId === v.id).reduce((s, r) => s + (r.coutReel || r.coutEstime || 0), 0);
      // Maintenance enregistrée
      const maintenanceTotal = (v.coutsMaintenance || []).reduce((s, m) => s + (m.montant || 0), 0);

      // Coûts = acquisition + charges réelles (dépenses + réparations + maintenance)
      const chargesReelles = vehiculeDepenses + vehiculeReparations + maintenanceTotal;
      const totalCost = acquisitionTotal + chargesReelles;

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
        chargesReelles,
        monthsInService,
        monthlyRevenue: Math.round(monthlyRevenue),
        monthlyCost: Math.round(monthlyCost),
        monthlyProfit: Math.round(monthlyProfit),
        roi,
        bookValue: Math.round(bookValueCalc),
        vehiculeDepenses,
        vehiculeReparations,
        courses: vCourses.length,
        coutParKm: Math.round(coutParKm),
        mensualitesPaid
      };
    });

    // Total fleet — revenus calculés depuis TOUS les versements (pas juste ceux liés à un véhicule)
    const allVersementsValides = versements.filter(vs => vs.statut !== 'supprime' && getVersementMontant(vs) > 0);
    const fleetTotalRevenue = allVersementsValides.reduce((s, vs) => s + getVersementMontant(vs), 0);
    const fleetTotalCost = analysis.reduce((s, a) => s + a.totalCost, 0);
    const fleetProfit = fleetTotalRevenue - fleetTotalCost;
    const fleetROI = fleetTotalCost > 0 ? ((fleetTotalRevenue - fleetTotalCost) / fleetTotalCost) * 100 : 0;
    // Versements non liés à un véhicule (pour diagnostic)
    const linkedRevenue = analysis.reduce((s, a) => s + a.totalRevenue, 0);
    const unlinkedRevenue = fleetTotalRevenue - linkedRevenue;

    // Leasing vs Cash comparison
    const leasingVehicles = analysis.filter(a => a.vehicule.typeAcquisition === 'leasing');
    const cashVehicles = analysis.filter(a => a.vehicule.typeAcquisition === 'cash');

    // RSI leasing/cash basé sur les revenus RÉELS de la flotte (pas per-vehicle)
    const leasingTotalCost = leasingVehicles.reduce((s, a) => s + a.totalCost, 0);
    const cashTotalCost = cashVehicles.reduce((s, a) => s + a.totalCost, 0);
    // Distribuer le revenu fleet proportionnellement au nombre de véhicules
    const leasingRevenuePart = leasingVehicles.length > 0 ? fleetTotalRevenue * (leasingVehicles.length / analysis.length) : 0;
    const cashRevenuePart = cashVehicles.length > 0 ? fleetTotalRevenue * (cashVehicles.length / analysis.length) : 0;
    const avgLeasingROI = leasingTotalCost > 0 ? ((leasingRevenuePart - leasingTotalCost) / leasingTotalCost) * 100 : 0;
    const avgCashROI = cashTotalCost > 0 ? ((cashRevenuePart - cashTotalCost) / cashTotalCost) * 100 : 0;

    // EV vs Thermique comparison
    const evVehicles = analysis.filter(a => a.isEV);
    const thermalVehicles = analysis.filter(a => !a.isEV);

    const avgEVCoutKm = evVehicles.length > 0
      ? evVehicles.reduce((s, a) => s + a.coutParKm, 0) / evVehicles.length : 0;
    const avgThermalCoutKm = thermalVehicles.length > 0
      ? thermalVehicles.reduce((s, a) => s + a.coutParKm, 0) / thermalVehicles.length : 0;

    const avgEVCharges = evVehicles.length > 0
      ? evVehicles.reduce((s, a) => s + a.chargesReelles, 0) / evVehicles.length : 0;
    const avgThermalCharges = thermalVehicles.length > 0
      ? thermalVehicles.reduce((s, a) => s + a.chargesReelles, 0) / thermalVehicles.length : 0;

    const avgEVMaintenance = evVehicles.length > 0
      ? evVehicles.reduce((s, a) => s + a.maintenanceTotal, 0) / evVehicles.length : 0;
    const avgThermalMaintenance = thermalVehicles.length > 0
      ? thermalVehicles.reduce((s, a) => s + a.maintenanceTotal, 0) / thermalVehicles.length : 0;

    const avgEVROI = evVehicles.length > 0
      ? evVehicles.reduce((s, a) => s + a.roi, 0) / evVehicles.length : 0;
    const avgThermalROI = thermalVehicles.length > 0
      ? thermalVehicles.reduce((s, a) => s + a.roi, 0) / thermalVehicles.length : 0;

    const chargesSavingsPercent = avgThermalCharges > 0
      ? Math.round((1 - avgEVCharges / avgThermalCharges) * 100) : 0;

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

    // RSI global — investissement total (engagement complet) vs profit d'exploitation cumulé
    // Pour leasing : engagement = apport + mensualités × durée totale du contrat
    // Pour cash : engagement = prix d'achat
    const investTotal = vehicules.reduce((s, v) => {
      if (v.typeAcquisition === 'leasing') return s + (v.apportInitial || 0) + ((v.mensualiteLeasing || 0) * (v.dureeLeasing || 36));
      return s + (v.prixAchat || 0);
    }, 0);
    // Investissement déjà payé (leasing : uniquement les mensualités réglées)
    const investPaye = analysis.reduce((s, a) => s + a.acquisitionTotal, 0);
    // Coûts opérationnels = tout sauf l'acquisition (maintenance, assurance, énergie, dépenses, réparations)
    const coutOperationnel = fleetTotalCost - investPaye;
    // Résultat cumulé = revenus - coûts opérationnels SEULEMENT (hors acquisition)
    // Car on veut mesurer combien le profit d'exploitation "rembourse" l'investissement
    const resultatCumule = fleetTotalRevenue - coutOperationnel;
    const rsiGlobal = investTotal > 0 ? (resultatCumule / investTotal * 100) : 0;
    // Délai de récupération — basé sur le profit NET mensuel (revenus - TOUS les coûts y compris leasing payé)
    const avgMonthsService = analysis.length > 0 ? analysis.reduce((s, a) => s + a.monthsInService, 0) / analysis.length : 1;
    const profitNetMensuel = avgMonthsService > 0 ? fleetProfit / avgMonthsService : 0;
    // Mensualité leasing totale par mois (pour tous les véhicules)
    const mensualiteTotaleMensuelle = vehicules.reduce((s, v) => s + (v.typeAcquisition === 'leasing' ? (v.mensualiteLeasing || 0) : 0), 0);
    // Marge mensuelle = profit exploitation mensuel - mensualités leasing
    const resultatMensuelMoyen = avgMonthsService > 0 ? resultatCumule / avgMonthsService : 0;
    const margeMensuelle = resultatMensuelMoyen - mensualiteTotaleMensuelle;
    // Durée max leasing (pour référence)
    const maxDureeLeasing = vehicules.reduce((m, v) => Math.max(m, v.typeAcquisition === 'leasing' ? (v.dureeLeasing || 36) : 0), 0);
    let moisRecuperation = null;
    if (margeMensuelle > 0) {
      // Marge positive : le profit couvre le leasing + dégage du bénéfice
      // Récupération = restant à payer / marge mensuelle
      const restantAPayer = investTotal - investPaye;
      moisRecuperation = Math.ceil(restantAPayer / margeMensuelle);
    } else if (resultatMensuelMoyen > 0 && resultatMensuelMoyen >= mensualiteTotaleMensuelle * 0.8) {
      // Profit couvre presque le leasing → récupération à la fin du contrat
      moisRecuperation = maxDureeLeasing > 0 ? maxDureeLeasing : null;
    }

    // Debug data
    const debugPerVehicle = analysis.map(a =>
      `${a.vehicule.marque || ''} ${a.vehicule.modele || a.vehicule.immatriculation || a.vehicule.id}: rev=${Utils.formatCurrency(a.totalRevenue)}, coût=${Utils.formatCurrency(a.totalCost)}, acq=${Utils.formatCurrency(a.acquisitionTotal)}, chauffeurs=[${(vehiculeChauffeurIds[a.vehicule.id]||[]).join(',')}]`
    ).join('<br>');

    return {
      analysis, fleetTotalRevenue, fleetTotalCost, fleetProfit, fleetROI,
      avgLeasingROI, avgCashROI, cumulativeLeasingCost, cumulativeCashCost,
      leasingCount: leasingVehicles.length, cashCount: cashVehicles.length,
      evCount: evVehicles.length, thermalCount: thermalVehicles.length,
      avgEVCoutKm, avgThermalCoutKm, avgEVCharges, avgThermalCharges,
      avgEVMaintenance, avgThermalMaintenance, avgEVROI, avgThermalROI,
      chargesSavingsPercent,
      debugVersementsTotal: versements.length,
      debugVersementsAvecMontant: allVersementsValides.length,
      debugLinkedRevenue: linkedRevenue,
      debugUnlinkedRevenue: unlinkedRevenue,
      debugAcquisitionTotal: analysis.reduce((s, a) => s + a.acquisitionTotal, 0),
      debugPerVehicle,
      investTotal, investPaye, resultatCumule, rsiGlobal, moisRecuperation,
      margeMensuelle: Math.round(margeMensuelle), mensualiteTotaleMensuelle, resultatMensuelMoyen: Math.round(resultatMensuelMoyen),
      vehiculeCount: vehicules.length
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
            <div style="font-size:12px;color:rgba(255,255,255,.5);">Basé sur ${d.vehiculeCount} véhicule${d.vehiculeCount > 1 ? 's' : ''} — engagement total : ${Utils.formatCurrency(d.investTotal)}</div>
          </div>
        </div>

        <div class="rent-hero-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">
          <div class="rent-kpi-glass">
            <div class="rent-kpi-val" style="color:${rsiColor};">${d.rsiGlobal.toFixed(1)}%</div>
            <div class="rent-kpi-lbl">RSI global</div>
          </div>
          <div class="rent-kpi-glass">
            <div class="rent-kpi-val" style="color:#fff;">${Utils.formatCurrency(d.investPaye)}</div>
            <div class="rent-kpi-lbl">Payé à ce jour</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:4px;">sur ${Utils.formatCurrency(d.investTotal)}</div>
          </div>
          <div class="rent-kpi-glass">
            <div class="rent-kpi-val" style="color:${d.resultatCumule >= 0 ? '#34d399' : '#f87171'};">${Utils.formatCurrency(d.resultatCumule)}</div>
            <div class="rent-kpi-lbl">Profit d'exploitation</div>
          </div>
          <div class="rent-kpi-glass">
            <div class="rent-kpi-val" style="color:${d.margeMensuelle >= 0 ? '#34d399' : '#f87171'};">${Utils.formatCurrency(d.margeMensuelle)}</div>
            <div class="rent-kpi-lbl">Marge nette / mois</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:4px;">${d.mensualiteTotaleMensuelle > 0 ? 'Profit ' + Utils.formatCurrency(d.resultatMensuelMoyen) + ' − Leasing ' + Utils.formatCurrency(d.mensualiteTotaleMensuelle) : ''}</div>
          </div>
        </div>

        <div class="rent-progress">
          <div class="rent-progress-fill" style="width:${rsiPct}%;"></div>
        </div>
        <div style="text-align:right;margin-top:8px;font-size:12px;font-weight:700;color:${rsiBarColor};">${rsiPct.toFixed(0)}% récupéré</div>

        <div style="margin-top:16px;padding:14px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);">
          <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.5);margin-bottom:8px;"><iconify-icon icon="solar:info-circle-bold-duotone"></iconify-icon> Détail du calcul</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;">
            <div style="color:rgba(255,255,255,.4);">Revenus (versements) :</div><div style="color:#34d399;font-weight:600;text-align:right;">+ ${Utils.formatCurrency(d.fleetTotalRevenue)}</div>
            <div style="color:rgba(255,255,255,.4);">Coûts opérationnels :</div><div style="color:#f87171;font-weight:600;text-align:right;">− ${Utils.formatCurrency(d.fleetTotalCost - d.investPaye)}</div>
            <div style="color:rgba(255,255,255,.3);font-size:10px;padding-left:10px;">dont dépenses :</div><div style="color:rgba(255,255,255,.3);font-size:10px;text-align:right;">${Utils.formatCurrency(d.analysis.reduce((s,a) => s + a.vehiculeDepenses, 0))}</div>
            <div style="color:rgba(255,255,255,.3);font-size:10px;padding-left:10px;">dont réparations :</div><div style="color:rgba(255,255,255,.3);font-size:10px;text-align:right;">${Utils.formatCurrency(d.analysis.reduce((s,a) => s + a.vehiculeReparations, 0))}</div>
            <div style="color:rgba(255,255,255,.3);font-size:10px;padding-left:10px;">dont maintenance :</div><div style="color:rgba(255,255,255,.3);font-size:10px;text-align:right;">${Utils.formatCurrency(d.analysis.reduce((s,a) => s + a.maintenanceTotal, 0))}</div>
            <div style="border-top:1px solid rgba(255,255,255,.1);padding-top:4px;color:rgba(255,255,255,.6);font-weight:700;">= Profit d'exploitation :</div><div style="border-top:1px solid rgba(255,255,255,.1);padding-top:4px;color:${d.resultatCumule >= 0 ? '#34d399' : '#f87171'};font-weight:700;text-align:right;">${Utils.formatCurrency(d.resultatCumule)}</div>
          </div>
        </div>
      </div>



      <!-- ===== SUIVI DES PAIEMENTS ===== -->
      <div class="rent-card" style="margin-bottom:24px;">
        <div class="rent-section-title">
          <div class="rent-section-icon" style="background:rgba(99,102,241,.1);color:#6366f1;"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
          <div style="font-size:14px;font-weight:800;color:var(--text-primary);">Suivi des paiements</div>
        </div>
        <div id="rent-paiements-list" style="display:flex;flex-direction:column;gap:12px;"></div>
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
          <div id="html-chart-rev-cost" style="padding:10px 0;"></div>
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
          <div id="html-chart-profit" style="padding:10px 0;"></div>
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

  // =================== SUIVI PAIEMENTS ===================

  _renderPaiements(analysis) {
    const container = document.getElementById('rent-paiements-list');
    if (!container) return;
    container.innerHTML = analysis.map(a => {
      const v = a.vehicule;
      const isLeasing = v.typeAcquisition === 'leasing';
      const label = v.immatriculation ? v.marque + ' ' + v.modele + ' (' + v.immatriculation + ')' : v.marque + ' ' + v.modele;
      // Véhicule non configuré
      if (!v.typeAcquisition || (isLeasing && !v.mensualiteLeasing) || (!isLeasing && !v.prixAchat)) {
        return '<div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-tertiary);border:1px dashed var(--border-color);">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span class="badge badge-neutral" style="font-size:10px;">Non configuré</span>'
          + '<span style="font-size:13px;font-weight:700;color:var(--text-primary);">' + label + '</span>'
          + '</div>'
          + '<button class="btn btn-sm btn-primary" onclick="RentabilitePage._editPaiement(\'' + v.id + '\')" style="font-size:11px;padding:4px 12px;">'
          + '<iconify-icon icon="solar:settings-bold-duotone"></iconify-icon> Configurer</button>'
          + '</div></div>';
      }
      if (isLeasing) {
        const duree = v.dureeLeasing || 36;
        const paid = a.mensualitesPaid;
        const pct = Math.min(Math.round(paid / duree * 100), 100);
        const montantPaye = (v.apportInitial || 0) + ((v.mensualiteLeasing || 0) * paid);
        const montantTotal = (v.apportInitial || 0) + ((v.mensualiteLeasing || 0) * duree);
        const autoFill = v.autoFillLeasing !== false;
        const barColor = pct >= 100 ? '#10b981' : pct >= 50 ? '#6366f1' : '#f59e0b';
        return '<div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-tertiary);border:1px solid var(--border-color);">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span class="badge badge-info" style="font-size:10px;">Leasing</span>'
          + '<span style="font-size:13px;font-weight:700;color:var(--text-primary);">' + label + '</span>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);cursor:pointer;">'
          + '<input type="checkbox" ' + (autoFill ? 'checked' : '') + ' onchange="RentabilitePage._toggleAutoFill(\'' + v.id + '\', this.checked)" style="accent-color:#6366f1;">'
          + ' Auto'
          + '</label>'
          + '<button class="btn btn-sm btn-outline" onclick="RentabilitePage._editPaiement(\'' + v.id + '\')" style="font-size:11px;padding:4px 10px;">'
          + '<iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>'
          + '</div></div>'
          + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">'
          + '<div style="flex:1;height:8px;border-radius:8px;background:var(--bg-secondary);overflow:hidden;">'
          + '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:8px;transition:width .5s;"></div></div>'
          + '<span style="font-size:12px;font-weight:700;color:' + barColor + ';min-width:40px;">' + pct + '%</span></div>'
          + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);">'
          + '<span><strong>' + paid + '</strong> / ' + duree + ' mensualités payées</span>'
          + '<span>' + Utils.formatCurrency(montantPaye) + ' / ' + Utils.formatCurrency(montantTotal) + '</span></div>'
          + '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">' + Utils.formatCurrency(v.mensualiteLeasing || 0) + ' / mois'
          + (v.apportInitial ? ' + apport ' + Utils.formatCurrency(v.apportInitial) : '') + '</div>'
          + '</div>';
      } else {
        const prixAchat = v.prixAchat || 0;
        const mp = typeof v.montantPaye === 'number' ? v.montantPaye : prixAchat;
        const pct = prixAchat > 0 ? Math.min(Math.round(mp / prixAchat * 100), 100) : 100;
        const barColor = pct >= 100 ? '#10b981' : pct >= 50 ? '#6366f1' : '#f59e0b';
        return '<div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-tertiary);border:1px solid var(--border-color);">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span class="badge badge-success" style="font-size:10px;">Cash</span>'
          + '<span style="font-size:13px;font-weight:700;color:var(--text-primary);">' + label + '</span>'
          + '</div>'
          + '<button class="btn btn-sm btn-outline" onclick="RentabilitePage._editPaiementCash(\'' + v.id + '\')" style="font-size:11px;padding:4px 10px;">'
          + '<iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">'
          + '<div style="flex:1;height:8px;border-radius:8px;background:var(--bg-secondary);overflow:hidden;">'
          + '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:8px;transition:width .5s;"></div></div>'
          + '<span style="font-size:12px;font-weight:700;color:' + barColor + ';min-width:40px;">' + pct + '%</span></div>'
          + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);">'
          + '<span>' + (pct >= 100 ? 'Payé intégralement' : 'Paiement en cours') + '</span>'
          + '<span>' + Utils.formatCurrency(mp) + ' / ' + Utils.formatCurrency(prixAchat) + '</span></div>'
          + '</div>';
      }
    }).join('');
  },

  _toggleAutoFill(vehiculeId, checked) {
    Store.update('vehicules', vehiculeId, { autoFillLeasing: checked, mensualitesPaid: undefined });
    this.render();
  },

  _editPaiement(vehiculeId) {
    const v = Store.findById('vehicules', vehiculeId);
    if (!v) return;
    const isLeasing = v.typeAcquisition === 'leasing';
    const autoFill = v.autoFillLeasing !== false;
    const now = new Date();
    const startDate = new Date(v.dateAcquisition || v.dateCreation);
    const monthsAuto = Math.max(1, Math.ceil((now - startDate) / (30 * 24 * 60 * 60 * 1000)));
    const duree = v.dureeLeasing || 36;
    const currentPaid = autoFill ? Math.min(monthsAuto, duree) : (v.mensualitesPaid || 0);
    const prixAchat = v.prixAchat || 0;
    const montantPaye = typeof v.montantPaye === 'number' ? v.montantPaye : prixAchat;
    const vLabel = (v.marque || '') + ' ' + (v.modele || '');

    Modal.form(
      '<iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#6366f1;"></iconify-icon> Acquisition & Paiements — ' + vLabel,
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Type d'acquisition</label>
          <select name="typeAcquisition" class="form-control" onchange="RentabilitePage._onTypeChange(this.value)">
            <option value="leasing" ${isLeasing ? 'selected' : ''}>Leasing</option>
            <option value="cash" ${!isLeasing ? 'selected' : ''}>Cash</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Date d'acquisition</label>
          <input type="date" name="dateAcquisition" class="form-control" value="${v.dateAcquisition || ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Prix d'achat / Valeur véhicule (FCFA)</label>
        <input type="number" name="prixAchat" class="form-control" value="${prixAchat}" min="0" step="100000">
      </div>
      <div id="rent-leasing-fields" style="${isLeasing ? '' : 'display:none;'}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Mensualité leasing (FCFA)</label>
            <input type="number" name="mensualiteLeasing" class="form-control" value="${v.mensualiteLeasing || ''}" min="0" step="10000">
          </div>
          <div class="form-group">
            <label class="form-label">Durée leasing (mois)</label>
            <input type="number" name="dureeLeasing" class="form-control" value="${duree}" min="1" step="1">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Apport initial (FCFA)</label>
          <input type="number" name="apportInitial" class="form-control" value="${v.apportInitial || 0}" min="0" step="10000">
        </div>
        <hr style="border-color:var(--border-color);margin:16px 0;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px;"><iconify-icon icon="solar:calendar-bold-duotone" style="color:#6366f1;"></iconify-icon> Suivi des mensualités</div>
        <div class="form-group">
          <label class="form-label">Mensualités payées</label>
          <input type="number" name="mensualitesPaid" class="form-control" value="${currentPaid}" min="0" max="${duree}" step="1">
        </div>
        <div class="form-group" style="margin-top:8px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" name="autoFillLeasing" ${autoFill ? 'checked' : ''} style="accent-color:#6366f1;">
            <span class="form-label" style="margin:0;">Remplissage automatique</span>
          </label>
          <small style="color:var(--text-muted);margin-top:4px;display:block;">Incrémente automatiquement de +1 chaque mois</small>
        </div>
      </div>
      <div id="rent-cash-fields" style="${!isLeasing ? '' : 'display:none;'}">
        <hr style="border-color:var(--border-color);margin:16px 0;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px;"><iconify-icon icon="solar:money-bag-bold-duotone" style="color:#10b981;"></iconify-icon> Suivi du paiement</div>
        <div class="form-group">
          <label class="form-label">Montant payé (FCFA)</label>
          <input type="number" name="montantPaye" class="form-control" value="${montantPaye}" min="0" step="10000">
        </div>
        <div class="form-group" style="margin-top:8px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" name="payeIntegral" ${montantPaye >= prixAchat ? 'checked' : ''} onchange="this.closest('.modal-body').querySelector('[name=montantPaye]').value = this.checked ? this.closest('.modal-body').querySelector('[name=prixAchat]').value : '0'" style="accent-color:#10b981;">
            <span class="form-label" style="margin:0;">Payé intégralement</span>
          </label>
        </div>
      </div>`,
      () => {
        const body = document.querySelector('.modal-body');
        const data = {
          typeAcquisition: body.querySelector('[name=typeAcquisition]').value,
          dateAcquisition: body.querySelector('[name=dateAcquisition]').value || undefined,
          prixAchat: parseInt(body.querySelector('[name=prixAchat]').value) || 0
        };
        if (data.typeAcquisition === 'leasing') {
          data.mensualiteLeasing = parseInt(body.querySelector('[name=mensualiteLeasing]').value) || 0;
          data.dureeLeasing = parseInt(body.querySelector('[name=dureeLeasing]').value) || 36;
          data.apportInitial = parseInt(body.querySelector('[name=apportInitial]').value) || 0;
          data.autoFillLeasing = body.querySelector('[name=autoFillLeasing]').checked;
          data.mensualitesPaid = parseInt(body.querySelector('[name=mensualitesPaid]').value) || 0;
          data.mensualitesPaidDate = new Date().toISOString().split('T')[0];
        } else {
          data.montantPaye = parseInt(body.querySelector('[name=montantPaye]').value) || 0;
        }
        Store.update('vehicules', vehiculeId, data);
        Modal.close();
        this.render();
      },
      'lg'
    );
  },

  _editPaiementCash(vehiculeId) {
    // Redirige vers le même modal unifié
    this._editPaiement(vehiculeId);
  },

  _onTypeChange(type) {
    const leasingFields = document.getElementById('rent-leasing-fields');
    const cashFields = document.getElementById('rent-cash-fields');
    if (leasingFields) leasingFields.style.display = type === 'leasing' ? '' : 'none';
    if (cashFields) cashFields.style.display = type === 'cash' ? '' : 'none';
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

    // 1. Revenus vs Coûts — HTML bars
    const revCostContainer = document.getElementById('html-chart-rev-cost');
    if (revCostContainer) {
      const maxVal = Math.max(...d.analysis.map(a => Math.max(a.totalRevenue, a.totalCost)));
      const legendHtml = `<div style="display:flex;gap:16px;justify-content:center;margin-bottom:14px;font-size:12px;font-weight:600;">
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:3px;background:#10b981;"></span><span style="color:var(--text-muted);">Revenus</span></span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:3px;background:#ef4444;"></span><span style="color:var(--text-muted);">Coûts</span></span>
      </div>`;
      const barsHtml = d.analysis.map(a => {
        const revPct = maxVal > 0 ? (a.totalRevenue / maxVal * 100) : 0;
        const costPct = maxVal > 0 ? (a.totalCost / maxVal * 100) : 0;
        const label = a.vehicule.immatriculation || `${a.vehicule.marque} ${a.vehicule.modele}`.slice(0, 10);
        return `<div style="margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:11px;font-weight:700;color:var(--text-primary);">${label}</span>
            <span style="font-size:10px;color:var(--text-muted);">Profit: ${Utils.formatCurrency(a.totalRevenue - a.totalCost)}</span>
          </div>
          <div style="display:flex;gap:4px;align-items:center;">
            <div style="flex:1;height:14px;background:rgba(255,255,255,.05);border-radius:8px;overflow:hidden;">
              <div style="height:100%;width:${revPct}%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:8px;transition:width .8s ease;"></div>
            </div>
            <span style="font-size:10px;color:#10b981;min-width:70px;text-align:right;">${Utils.formatCurrency(a.totalRevenue)}</span>
          </div>
          <div style="display:flex;gap:4px;align-items:center;margin-top:3px;">
            <div style="flex:1;height:14px;background:rgba(255,255,255,.05);border-radius:8px;overflow:hidden;">
              <div style="height:100%;width:${costPct}%;background:linear-gradient(90deg,#ef4444,#f87171);border-radius:8px;transition:width .8s ease;"></div>
            </div>
            <span style="font-size:10px;color:#ef4444;min-width:70px;text-align:right;">${Utils.formatCurrency(a.totalCost)}</span>
          </div>
        </div>`;
      }).join('');
      revCostContainer.innerHTML = legendHtml + barsHtml;
    }

    // 2. Répartition des coûts — Doughnut moderne
    const costBrkCtx = document.getElementById('chart-cost-breakdown');
    if (costBrkCtx) {
      const totalAcq = d.analysis.reduce((s, a) => s + (a.acquisitionTotal || 0), 0);
      const totalMaint = d.analysis.reduce((s, a) => s + (a.maintenanceTotal || 0), 0);
      const totalDep = d.analysis.reduce((s, a) => s + (a.vehiculeDepenses || 0), 0);
      const totalRep = d.analysis.reduce((s, a) => s + (a.vehiculeReparations || 0), 0);
      const costData = [totalAcq, totalMaint, totalDep, totalRep].map(v => Math.round(v));
      const costLabels = ['Leasing / Achat', 'Maintenance', 'Dépenses', 'Réparations'];
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

    // 3. Profit mensuel — HTML bars
    const profitContainer = document.getElementById('html-chart-profit');
    if (profitContainer) {
      const maxProfit = Math.max(...d.analysis.map(a => Math.abs(a.monthlyProfit)));
      const barsHtml = d.analysis.map(a => {
        const pct = maxProfit > 0 ? (Math.abs(a.monthlyProfit) / maxProfit * 100) : 0;
        const isPositive = a.monthlyProfit >= 0;
        const color = isPositive ? '#10b981' : '#ef4444';
        const gradEnd = isPositive ? '#34d399' : '#f87171';
        const label = a.vehicule.immatriculation || `${a.vehicule.marque} ${a.vehicule.modele}`.slice(0, 10);
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:10px;font-weight:700;color:var(--text-muted);min-width:75px;text-align:right;">${label}</span>
          <div style="flex:1;height:20px;background:rgba(255,255,255,.05);border-radius:10px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${color},${gradEnd});border-radius:10px;transition:width .8s ease;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;">
              ${pct > 25 ? `<span style="font-size:9px;font-weight:800;color:#fff;">${Utils.formatCurrency(a.monthlyProfit)}/mois</span>` : ''}
            </div>
          </div>
          ${pct <= 25 ? `<span style="font-size:10px;font-weight:700;color:${color};">${Utils.formatCurrency(a.monthlyProfit)}/mois</span>` : ''}
        </div>`;
      }).join('');
      profitContainer.innerHTML = barsHtml;
    }

    // 4. Projection leasing — area chart (coût cumulé vs revenus cumulés sur durée leasing)
    const projCtx = document.getElementById('chart-projection');
    if (projCtx) {
      const months = 36;
      const labels = Array.from({ length: months + 1 }, (_, i) => i === 0 ? '0' : `${i}`);

      // Coût leasing cumulé moyen (toute la flotte)
      const avgMensualite = d.analysis.reduce((s, a) => s + (a.vehicule.mensualiteLeasing || 0), 0);
      const totalApport = d.analysis.reduce((s, a) => s + (a.vehicule.apportInitial || 0), 0);
      const avgMonthlyRevenue = d.analysis.reduce((s, a) => s + a.monthlyRevenue, 0);
      const costCumul = labels.map((_, i) => totalApport + avgMensualite * i);
      const revCumul = labels.map((_, i) => avgMonthlyRevenue * i);

      this._charts.push(new Chart(projCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Revenus cumulés', data: revCumul, borderColor: '#10b981', borderWidth: 3, pointRadius: 0,
              pointHoverRadius: 6, pointHoverBackgroundColor: '#10b981', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
              fill: true, backgroundColor: 'rgba(16,185,129,.12)', tension: 0.4
            },
            {
              label: 'Coût leasing cumulé', data: costCumul, borderColor: '#ef4444', borderWidth: 3, pointRadius: 0,
              pointHoverRadius: 6, pointHoverBackgroundColor: '#ef4444', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
              fill: true, backgroundColor: 'rgba(239,68,68,.12)', tension: 0.1, borderDash: [8, 4]
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
