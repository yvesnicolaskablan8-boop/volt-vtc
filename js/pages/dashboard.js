/**
 * DashboardPage - Main dashboard with KPIs and charts (internal Volt data)
 */
const DashboardPage = {
  _charts: [],
  _refreshInterval: null,
  _lastData: null,
  _selectedPeriod: null, // null = today/current month
  _monthView: false, // false = jour, true = mois entier

  render() {
    const container = document.getElementById('page-content');
    this._autoGenerateVersements();
    const data = this._getData();
    this._lastData = data;
    container.innerHTML = this._template(data);
    this._loadCharts(data);
    this._bindPeriodSelector();
    if (this._isToday()) this._startAutoRefresh(); else this._stopAutoRefresh();
  },

  // Auto-générer les versements du jour (1x/jour max)
  async _autoGenerateVersements() {
    const today = new Date().toISOString().split('T')[0];
    const lastGen = localStorage.getItem('volt_autogen_date');
    if (lastGen === today) return; // Déjà fait aujourd'hui
    localStorage.setItem('volt_autogen_date', today);
    try {
      const res = await fetch(Store._apiBase + '/versements/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Auth.getToken() },
        body: JSON.stringify({ date: today })
      });
      if (res.ok) {
        const result = await res.json();
        if (result.created > 0) {
          console.log(`[Auto-versements] ${result.created} versement(s) créé(s) pour ${today}`);
          // Recharger les données pour afficher les nouveaux versements
          await Store.initialize();
          this.destroy();
          this.render();
        }
      }
    } catch (e) {
      console.warn('[Auto-versements] Erreur:', e.message);
    }
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

  _isCurrentMonth() {
    if (!this._selectedPeriod) return true;
    const now = new Date();
    const sel = new Date(this._selectedPeriod);
    return sel.getMonth() === now.getMonth() && sel.getFullYear() === now.getFullYear();
  },

  _isToday() {
    if (this._monthView) return false;
    if (!this._selectedPeriod) return true;
    return this._selectedPeriod === new Date().toISOString().split('T')[0];
  },

  _bindPeriodSelector() {
    const input = document.getElementById('dashboard-period');
    if (input) {
      input.addEventListener('change', () => this._onPeriodChange(input.value));
    }
  },

  _onPeriodChange(value) {
    const today = new Date().toISOString().split('T')[0];
    this._selectedPeriod = (value === today) ? null : value;
    this.destroy();
    this.render();
  },

  _toggleMonthView() {
    this._monthView = !this._monthView;
    this.destroy();
    this.render();
  },

  _resetToToday() {
    this._selectedPeriod = null;
    this._monthView = false;
    this.destroy();
    this.render();
  },

  _silentRefresh() {
    if (!this._isToday()) return; // Don't auto-refresh historical data
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
    this._bindPeriodSelector();
    this._startAutoRefresh();
  },

  _getData() {
    const chauffeurs = Store.get('chauffeurs');
    const vehicules = Store.get('vehicules');
    const versements = Store.get('versements');
    const courses = Store.get('courses');
    const now = new Date();
    const selectedDay = this._selectedPeriod || now.toISOString().split('T')[0];
    const sel = new Date(selectedDay);
    const thisMonth = sel.getMonth();
    const thisYear = sel.getFullYear();
    const isMonthView = this._monthView;
    const dayFilter = isMonthView ? null : selectedDay;

    // Filter helper: filtre par jour ou par mois selon le mode
    const matchesPeriod = (dateStr) => {
      if (!dateStr) return false;
      if (dayFilter) return dateStr.startsWith(dayFilter);
      const d = new Date(dateStr);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    };

    // Versements — relatif à la période sélectionnée (jour ou mois)
    const monthVersements = versements.filter(v => matchesPeriod(v.date));
    const totalVerse = monthVersements.filter(v => v.statut !== 'supprime').reduce((s, v) => s + v.montantVerse, 0);

    // CA = recettes réellement encaissées (versements payés)
    const caThisMonth = totalVerse;

    // CA période précédente pour comparaison
    let caPrevPeriod = 0;
    if (dayFilter) {
      // Vue jour → comparer avec la veille
      const prevDay = new Date(sel);
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDayStr = prevDay.toISOString().split('T')[0];
      caPrevPeriod = versements
        .filter(v => v.date && v.date.startsWith(prevDayStr) && v.statut !== 'supprime')
        .reduce((s, v) => s + v.montantVerse, 0);
    } else {
      // Vue mois → comparer avec le mois précédent
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
      caPrevPeriod = versements
        .filter(v => {
          if (!v.date || v.statut === 'supprime') return false;
          const d = new Date(v.date);
          return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
        })
        .reduce((s, v) => s + v.montantVerse, 0);
    }
    let caTrend = 0;
    if (caPrevPeriod > 0) {
      caTrend = ((caThisMonth - caPrevPeriod) / caPrevPeriod) * 100;
    } else if (caThisMonth > 0) {
      caTrend = 100; // Pas de ref précédente mais on a du CA → +100%
    }

    // Versements en retard — sera recalculé à partir de unpaidItems plus bas
    let retardCount = versements.filter(v => v.statut === 'retard').length;

    // Drivers count
    const totalChauffeurs = chauffeurs.length;
    const activeCount = chauffeurs.filter(c => c.statut === 'actif').length;
    const suspendusCount = chauffeurs.filter(c => c.statut === 'suspendu').length;
    const inactifsCount = chauffeurs.filter(c => c.statut === 'inactif').length;

    // Chauffeurs programmés à la période sélectionnée
    const planning = Store.get('planning') || [];
    const programmesIds = [...new Set(planning.filter(p => matchesPeriod(p.date)).map(p => p.chauffeurId))];
    const programmesCount = programmesIds.length;

    // Vehicles in service
    const vehiclesActifs = vehicules.filter(v => v.statut === 'en_service').length;
    const vehiclesEV = vehicules.filter(v => v.typeEnergie === 'electrique').length;
    const vehiclesThermique = vehicules.filter(v => v.typeEnergie !== 'electrique').length;

    // Monthly revenue for last 12 months (based on versements encaissés)
    const monthlyRevenue = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(thisYear, thisMonth - i, 1);
      const monthNum = m.getMonth();
      const yearNum = m.getFullYear();
      const rev = versements
        .filter(v => {
          if (!v.date || v.statut === 'supprime') return false;
          const d = new Date(v.date);
          return d.getMonth() === monthNum && d.getFullYear() === yearNum;
        })
        .reduce((s, v) => s + v.montantVerse, 0);
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
        verse: weekVers.filter(v => v.statut !== 'supprime').reduce((s, v) => s + v.montantVerse, 0),
        attendu: weekVers.filter(v => v.statut !== 'supprime').reduce((s, v) => s + v.commission, 0)
      });
    }

    // Courses by type (from local courses collection, if any)
    const monthCourses = courses.filter(c => matchesPeriod(c.dateHeure) && c.statut === 'terminee');
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

    // Recent activities — exclure les versements en_attente (auto-générés, pas encore payés)
    const recentVersements = versements
      .filter(v => v.statut !== 'en_attente')
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
    const absences = Store.get('absences') || [];
    // Limiter au jour ou mois sélectionné
    const today = isMonthView
      ? new Date(thisYear, thisMonth + 1, 0).toISOString().split('T')[0] // dernier jour du mois
      : (selectedDay <= now.toISOString().split('T')[0] ? selectedDay : now.toISOString().split('T')[0]);

    // Limiter au mois sélectionné
    const periodStart = new Date(thisYear, thisMonth, 1);
    const minDate = periodStart.toISOString().split('T')[0];

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
      // Vérifier si versement valide ou supprimé existe (supprimé = admin a dismissé la recette)
      const hasValidOrDismissed = versements.some(v => v.chauffeurId === p.chauffeurId && v.date === p.date && (v.statut === 'valide' || v.statut === 'supprime'));
      if (!hasValidOrDismissed) {
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

    // Recalculer retardCount = nombre de jours impayés pour la période sélectionnée
    retardCount = unpaidItems.length;

    // Taux de recouvrement
    const totalAttendu = unpaidItems.reduce((s, i) => s + i.montantDu, 0) + monthVersements.filter(v => v.statut !== 'supprime').reduce((s, v) => s + v.montantVerse, 0);
    const tauxRecouvrement = totalAttendu > 0 ? Math.round((totalVerse / totalAttendu) * 100) : 100;

    // =================== DÉPENSES VÉHICULES ===================
    const depenses = Store.get('depenses') || [];
    const monthDepenses = depenses.filter(dep => matchesPeriod(dep.date));
    const totalDepensesMois = monthDepenses.reduce((s, d) => s + (d.montant || 0), 0);
    const depensesByType = {};
    monthDepenses.forEach(d => {
      depensesByType[d.typeDepense] = (depensesByType[d.typeDepense] || 0) + d.montant;
    });

    // =================== DETTES & PERTES ===================
    const totalDettes = versements
      .filter(v => v.traitementManquant === 'dette' && v.manquant > 0)
      .reduce((s, v) => s + v.manquant, 0);
    const totalPertes = versements
      .filter(v => v.traitementManquant === 'perte' && v.manquant > 0)
      .reduce((s, v) => s + v.manquant, 0);
    const nbDetteDrivers = new Set(
      versements.filter(v => v.traitementManquant === 'dette' && v.manquant > 0).map(v => v.chauffeurId)
    ).size;
    const nbPerteDrivers = new Set(
      versements.filter(v => v.traitementManquant === 'perte' && v.manquant > 0).map(v => v.chauffeurId)
    ).size;

    // Alertes count (reuse AlertesPage generator if available)
    let alertesTotal = 0, alertesCritiques = 0, alertesUrgentes = 0;
    try {
      const allAlerts = typeof AlertesPage !== 'undefined' ? AlertesPage._generateAllAlerts() : [];
      alertesTotal = allAlerts.length;
      alertesCritiques = allAlerts.filter(a => a.niveau === 'critique').length;
      alertesUrgentes = allAlerts.filter(a => a.niveau === 'urgent').length;
    } catch (e) { /* AlertesPage not loaded yet */ }

    // Pointage / Service du jour
    const pointages = Store.get('pointages') || [];
    const todayPointages = pointages.filter(p => matchesPeriod(p.date));
    const serviceEnCours = todayPointages.filter(p => p.statut === 'en_service').length;
    const serviceEnPause = todayPointages.filter(p => p.statut === 'pause').length;
    const serviceTermine = todayPointages.filter(p => p.statut === 'termine').length;
    const servicePasCommence = Math.max(0, programmesCount - todayPointages.length);

    const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const monthLabel = monthNames[thisMonth] + ' ' + thisYear;
    const periodLabel = isMonthView ? monthLabel : Utils.formatDate(selectedDay);

    return {
      caThisMonth, caTrend, caPrevPeriod, totalVerse, retardCount, totalDettes, totalPertes, nbDetteDrivers, nbPerteDrivers,
      nbVersementsPeriode: monthVersements.filter(v => v.statut !== 'supprime' && v.montantVerse > 0).length,
      totalChauffeurs, activeCount, suspendusCount, inactifsCount, programmesCount,
      vehiclesActifs, vehiclesEV, vehiclesThermique,
      monthCourses: monthCourses.length,
      monthlyRevenue, weeklyPayments,
      coursesByType, typeLabels, vehicleProfit,
      recentVersements, chauffeurs, vehiculesTotal: vehicules.length,
      maintenanceAlerts, unpaidItems, totalUnpaid, totalPenalites,
      depenses, monthDepenses, totalDepensesMois, depensesByType, vehicules,
      alertesTotal, alertesCritiques, alertesUrgentes,
      tauxRecouvrement, totalAttendu,
      serviceEnCours, serviceEnPause, serviceTermine, servicePasCommence,
      periodLabel, monthLabel, isMonthView,
      // === PRÉVISIONS CA ===
      ...this._computeForecasts(monthlyRevenue, versements, chauffeurs, planning, absences, thisMonth, thisYear, sel, isMonthView, totalVerse)
    };
  },

  /**
   * Compute revenue forecasts: projection fin de mois, mois suivant, objectif mensuel
   */
  _computeForecasts(monthlyRevenue, versements, chauffeurs, planning, absences, thisMonth, thisYear, selDate, isMonthView, caActuel) {
    const now = new Date();
    const todayDay = now.getDate();

    // --- 1. Projection fin de mois (extrapolation linéaire du CA actuel) ---
    const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
    const daysPassed = Math.min(todayDay, daysInMonth);
    const caMoyenJour = daysPassed > 0 ? caActuel / daysPassed : 0;
    const projectionFinMois = Math.round(caMoyenJour * daysInMonth);

    // --- 2. Régression linéaire sur les 6 derniers mois pour tendance ---
    const last6 = monthlyRevenue.slice(-6);
    let trendSlope = 0;
    let trendIntercept = 0;
    if (last6.length >= 3) {
      const n = last6.length;
      const xVals = last6.map((_, i) => i);
      const yVals = last6.map(m => m.revenue);
      const sumX = xVals.reduce((s, x) => s + x, 0);
      const sumY = yVals.reduce((s, y) => s + y, 0);
      const sumXY = xVals.reduce((s, x, i) => s + x * yVals[i], 0);
      const sumX2 = xVals.reduce((s, x) => s + x * x, 0);
      const denom = n * sumX2 - sumX * sumX;
      if (denom !== 0) {
        trendSlope = (n * sumXY - sumX * sumY) / denom;
        trendIntercept = (sumY - trendSlope * sumX) / n;
      }
    }

    // Prévision mois prochain = régression extrapolée au point suivant
    const nextIdx = last6.length;
    let previsionMoisSuivant = Math.round(trendIntercept + trendSlope * nextIdx);
    // Fallback: si régression donne négatif ou 0, utiliser la moyenne des 3 derniers mois
    if (previsionMoisSuivant <= 0 && last6.length >= 3) {
      previsionMoisSuivant = Math.round(last6.slice(-3).reduce((s, m) => s + m.revenue, 0) / 3);
    }
    // Ajustement saisonnalité: si même mois l'an dernier existe, pondérer 70% regression / 30% historique
    const lastYearSameMonth = monthlyRevenue.find((m, i) => {
      const mDate = new Date(thisYear, thisMonth - (11 - i), 1);
      return mDate.getMonth() === (thisMonth + 1) % 12 && mDate.getFullYear() === (thisMonth === 11 ? thisYear : thisYear - 1);
    });
    if (lastYearSameMonth && lastYearSameMonth.revenue > 0) {
      previsionMoisSuivant = Math.round(previsionMoisSuivant * 0.7 + lastYearSameMonth.revenue * 0.3);
    }

    // --- 3. Objectif mensuel = somme redevances × jours programmés du mois ---
    const monthPlanning = planning.filter(p => {
      if (!p.date) return false;
      const d = new Date(p.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    // Dédupliquer par (chauffeur, date) — compter chaque jour programmé une seule fois
    const uniqueDays = new Map();
    monthPlanning.forEach(p => {
      const key = `${p.chauffeurId}|${p.date}`;
      if (!uniqueDays.has(key)) uniqueDays.set(key, p);
    });
    let objectifMensuel = 0;
    uniqueDays.forEach((p) => {
      // Exclure absences
      const hasAbsence = absences.some(a => a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin);
      if (hasAbsence) return;
      const ch = chauffeurs.find(c => c.id === p.chauffeurId);
      if (!ch || ch.statut === 'inactif') return;
      const redevance = ch.redevanceQuotidienne || 0;
      if (redevance > 0) objectifMensuel += redevance;
    });

    // Progression vers l'objectif (%)
    const progressionObjectif = objectifMensuel > 0 ? Math.min(Math.round((caActuel / objectifMensuel) * 100), 999) : 0;

    // Tendance mensuelle (% variation mois courant vs projeté vs précédent)
    const prevMonthRev = last6.length >= 2 ? last6[last6.length - 2].revenue : 0;
    const tendancePctMois = prevMonthRev > 0 ? Math.round(((projectionFinMois - prevMonthRev) / prevMonthRev) * 100) : 0;

    // Données pour sparkline chart (6 derniers mois + projection)
    const forecastChartData = last6.map(m => ({ label: m.month, value: m.revenue, type: 'actual' }));
    const nextMonthIdx = (thisMonth + 1) % 12;
    const monthShorts = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    forecastChartData.push({ label: monthShorts[nextMonthIdx], value: previsionMoisSuivant, type: 'forecast' });

    return {
      projectionFinMois,
      previsionMoisSuivant,
      objectifMensuel,
      progressionObjectif,
      tendancePctMois,
      trendSlope,
      forecastChartData,
      caMoyenJour: Math.round(caMoyenJour),
      joursRestants: daysInMonth - daysPassed
    };
  },

  _template(d) {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:spedometer-max-bold-duotone"></iconify-icon> Tableau de bord</h1>
        <div class="page-actions">
          <input type="date" id="dashboard-period" class="form-control" value="${this._selectedPeriod || new Date().toISOString().split('T')[0]}" max="${new Date().toISOString().split('T')[0]}" style="width:155px;font-size:var(--font-size-xs);padding:4px 8px;">
          <button class="btn btn-sm ${this._monthView ? 'btn-primary' : 'btn-secondary'}" onclick="DashboardPage._toggleMonthView()" style="font-size:var(--font-size-xs);padding:4px 10px;" title="${this._monthView ? 'Voir le jour' : 'Voir le mois entier'}">
            <iconify-icon icon="${this._monthView ? 'solar:calendar-minimalistic-bold' : 'solar:calendar-bold-duotone'}"></iconify-icon> ${this._monthView ? 'Mois' : 'Jour'}
          </button>
          ${this._selectedPeriod || this._monthView ? `<button class="btn btn-sm btn-secondary" onclick="DashboardPage._resetToToday()" style="font-size:var(--font-size-xs);padding:4px 10px;">
            <iconify-icon icon="solar:restart-bold"></iconify-icon> Aujourd'hui
          </button>` : ''}
          ${this._isToday() ? `<span id="live-indicator" style="display:inline-flex;align-items:center;gap:4px;font-size:var(--font-size-xs);color:#22c55e;background:rgba(34,197,94,0.1);padding:4px 10px;border-radius:20px;font-weight:600;">
            <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulse-dot 2s infinite;"></span> EN DIRECT
          </span>` : ''}
          <div style="position:relative;">
            <iconify-icon icon="solar:magnifer-bold" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--text-muted);pointer-events:none;"></iconify-icon>
            <input type="text" id="dashboard-search" class="form-control" placeholder="Rechercher un chauffeur..." style="padding-left:32px;font-size:var(--font-size-xs);width:200px;" oninput="DashboardPage._filterByDriver(this.value)">
          </div>
        </div>
      </div>
      <style>
        @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        #live-indicator.pulse { animation: flash-indicator 1.5s; }
        @keyframes flash-indicator { 0% { background:rgba(34,197,94,0.3); } 100% { background:rgba(34,197,94,0.1); } }
      </style>

      <!-- KPI Cards -->
      <div class="grid-4">
        <a href="#/versements" class="kpi-card ${d.totalDettes > 0 ? 'red' : 'green'}" style="text-decoration:none;color:inherit;cursor:pointer;">
          <div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.totalDettes > 0 ? Utils.formatCurrency(d.totalDettes) : '<span style="color:var(--success)">0 FCFA</span>'}</div>
          <div class="kpi-label">Dettes chauffeurs</div>
          <div class="kpi-trend ${d.totalDettes > 0 ? 'down' : 'up'}">
            ${d.totalDettes > 0 ? `<iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> ${d.nbDetteDrivers} chauffeur${d.nbDetteDrivers > 1 ? 's' : ''} endetté${d.nbDetteDrivers > 1 ? 's' : ''}` : '<iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Aucune dette ✔'}
          </div>
        </a>
        <a href="#/versements" class="kpi-card ${d.retardCount > 0 ? 'red' : 'green'}" style="text-decoration:none;color:inherit;cursor:pointer;">
          <div class="kpi-icon"><iconify-icon icon="solar:transfer-horizontal-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(d.totalVerse)}</div>
          <div class="kpi-label">Versements — ${d.periodLabel}</div>
          <div class="kpi-trend ${d.retardCount > 0 ? 'down' : 'up'}">
            <iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> ${d.retardCount} en retard
          </div>
        </a>
        <a href="#/planning" class="kpi-card cyan" style="text-decoration:none;color:inherit;cursor:pointer;">
          <div class="kpi-icon"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.programmesCount}</div>
          <div class="kpi-label">Chauffeurs programmés — ${d.periodLabel}</div>
          <div class="kpi-trend up">
            <iconify-icon icon="solar:record-circle-bold-duotone" style="color:var(--success);font-size:6px"></iconify-icon> ${d.activeCount} actifs sur ${d.totalChauffeurs}
          </div>
        </a>
        <a href="#/alertes" class="kpi-card ${d.alertesTotal > 0 ? 'red' : 'green'}" style="text-decoration:none;color:inherit;cursor:pointer;">
          <div class="kpi-icon"><iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.alertesTotal}</div>
          <div class="kpi-label">Alertes actives</div>
          <div class="kpi-trend ${d.alertesCritiques > 0 ? 'down' : d.alertesTotal === 0 ? 'up' : ''}">
            ${d.alertesCritiques > 0 ? `<iconify-icon icon="solar:danger-circle-bold-duotone" style="color:var(--danger)"></iconify-icon> ${d.alertesCritiques} critique${d.alertesCritiques > 1 ? 's' : ''}` : d.alertesTotal === 0 ? '<iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tout est en ordre' : `<iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> ${d.alertesUrgentes} urgente${d.alertesUrgentes > 1 ? 's' : ''}`}
          </div>
        </a>
      </div>

      <!-- KPI Row 2 -->
      <div class="grid-4" style="margin-top:var(--space-sm);">
        <div class="kpi-card ${d.tauxRecouvrement >= 80 ? 'green' : d.tauxRecouvrement >= 50 ? '' : 'red'}">
          <div class="kpi-icon"><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.tauxRecouvrement}%</div>
          <div class="kpi-label">Taux de recouvrement</div>
          <div class="kpi-trend ${d.tauxRecouvrement >= 80 ? 'up' : 'down'}">
            <iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon> ${Utils.formatCurrency(d.totalVerse)} / ${Utils.formatCurrency(d.totalAttendu)}
          </div>
        </div>
        <a href="#/versements" class="kpi-card red" style="text-decoration:none;color:inherit;cursor:pointer;">
          <div class="kpi-icon"><iconify-icon icon="solar:fire-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" style="color:var(--danger)">${d.totalPertes > 0 ? Utils.formatCurrency(d.totalPertes) : '0 FCFA'}</div>
          <div class="kpi-label">Pertes enregistrées</div>
          <div class="kpi-trend down">
            ${d.totalPertes > 0 ? `<iconify-icon icon="solar:danger-circle-bold-duotone" style="color:var(--danger)"></iconify-icon> ${d.nbPerteDrivers} chauffeur${d.nbPerteDrivers > 1 ? 's' : ''}` : '<iconify-icon icon="solar:danger-circle-bold-duotone" style="color:var(--danger)"></iconify-icon> Pertes irrécupérables'}
          </div>
        </a>
        <a href="#/vehicules" class="kpi-card" style="text-decoration:none;color:inherit;cursor:pointer;">
          <div class="kpi-icon"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.vehiclesActifs}</div>
          <div class="kpi-label">Véhicules en service</div>
          <div class="kpi-trend up">
            ⚡ ${d.vehiclesEV} élec. <span style="margin:0 2px">&bull;</span> ⛽ ${d.vehiclesThermique} therm.
          </div>
        </a>
        <div class="kpi-card ${d.totalDepensesMois > 0 ? '' : 'green'}">
          <div class="kpi-icon"><iconify-icon icon="solar:card-send-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(d.totalDepensesMois)}</div>
          <div class="kpi-label">Dépenses — ${d.periodLabel}</div>
          <div class="kpi-trend ${d.totalDepensesMois > 0 ? 'down' : 'up'}">
            <iconify-icon icon="solar:tag-bold-duotone"></iconify-icon> ${Object.keys(d.depensesByType).length} catégories
          </div>
        </div>
      </div>

      <!-- Récap quotidien -->
      <div class="card" style="margin-top:var(--space-md);background:linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));border:1px solid var(--border-color);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <iconify-icon icon="solar:clipboard-list-bold-duotone" style="font-size:24px;color:var(--volt-blue);"></iconify-icon>
          <div>
            <div style="font-weight:700;font-size:var(--font-size-md);">Récap du ${d.periodLabel}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Vue d'ensemble de la journée</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--radius-sm);background:var(--bg-primary);">
            <iconify-icon icon="solar:users-group-rounded-bold-duotone" style="font-size:20px;color:var(--volt-cyan);"></iconify-icon>
            <div>
              <div style="font-weight:600;font-size:var(--font-size-sm);">${d.programmesCount} chauffeur${d.programmesCount > 1 ? 's' : ''} programmé${d.programmesCount > 1 ? 's' : ''}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">sur ${d.activeCount} actifs</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--radius-sm);background:var(--bg-primary);cursor:pointer;" onclick="Router.navigate('/versements')">
            <iconify-icon icon="solar:wallet-money-bold-duotone" style="font-size:20px;color:${d.unpaidItems.length > 0 ? 'var(--danger)' : 'var(--success)'};"></iconify-icon>
            <div>
              <div style="font-weight:600;font-size:var(--font-size-sm);">${d.unpaidItems.length > 0 ? d.unpaidItems.length + ' recette' + (d.unpaidItems.length > 1 ? 's' : '') + ' impayée' + (d.unpaidItems.length > 1 ? 's' : '') : 'Aucune recette impayée'}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${d.unpaidItems.length > 0 ? Utils.formatCurrency(d.totalUnpaid) + ' à recouvrer' : 'Tout est à jour ✓'}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--radius-sm);background:var(--bg-primary);">
            <iconify-icon icon="solar:shield-warning-bold-duotone" style="font-size:20px;color:${d.maintenanceAlerts.length > 0 ? 'var(--warning)' : 'var(--success)'};"></iconify-icon>
            <div>
              <div style="font-weight:600;font-size:var(--font-size-sm);">${d.maintenanceAlerts.length > 0 ? d.maintenanceAlerts.length + ' alerte' + (d.maintenanceAlerts.length > 1 ? 's' : '') + ' maintenance' : 'Aucune alerte maintenance'}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${d.maintenanceAlerts.length > 0 ? 'Action requise' : 'Flotte en bon état ✓'}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--radius-sm);background:var(--bg-primary);">
            <iconify-icon icon="solar:graph-up-bold-duotone" style="font-size:20px;color:var(--volt-blue);"></iconify-icon>
            <div>
              <div style="font-weight:600;font-size:var(--font-size-sm);">${Utils.formatCurrency(d.caThisMonth)} CA</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${d.nbVersementsPeriode} versement${d.nbVersementsPeriode > 1 ? 's' : ''} encaissé${d.nbVersementsPeriode > 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Maintenance Alerts -->
      ${this._renderMaintenanceAlerts(d)}

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

      <!-- Prévisions CA -->
      ${this._renderForecastSection(d)}
    `;
  },

  // =================== PRÉVISIONS CA ===================

  _renderForecastSection(d) {
    if (!d.forecastChartData || d.forecastChartData.length === 0) return '';

    const progressColor = d.progressionObjectif >= 80 ? '#22c55e' : d.progressionObjectif >= 50 ? '#f59e0b' : '#ef4444';
    const progressIcon = d.progressionObjectif >= 80 ? 'solar:check-circle-bold-duotone' : d.progressionObjectif >= 50 ? 'solar:clock-circle-bold-duotone' : 'solar:danger-triangle-bold-duotone';
    const tendanceIcon = d.tendancePctMois >= 0 ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold';
    const tendanceColor = d.tendancePctMois >= 0 ? '#22c55e' : '#ef4444';
    const tendanceSign = d.tendancePctMois >= 0 ? '+' : '';

    return `
      <div class="card" style="margin-top:var(--space-lg);border-left:4px solid var(--volt-blue);">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:graph-new-up-bold-duotone" style="color:var(--volt-blue);"></iconify-icon> Prévisions de chiffre d'affaires</span>
          <span style="font-size:var(--font-size-xs);color:var(--text-muted);">Basé sur les ${d.forecastChartData.length - 1} derniers mois</span>
        </div>

        <!-- 3 mini cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;">
          <!-- Projection fin de mois -->
          <div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-tertiary);position:relative;overflow:hidden;">
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">
              <iconify-icon icon="solar:calendar-mark-bold-duotone" style="color:var(--volt-blue);"></iconify-icon> Projection fin de mois
            </div>
            <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--text-primary);">${Utils.formatCurrency(d.projectionFinMois)}</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:4px;font-size:var(--font-size-xs);">
              <iconify-icon icon="${tendanceIcon}" style="color:${tendanceColor};"></iconify-icon>
              <span style="color:${tendanceColor};font-weight:600;">${tendanceSign}${d.tendancePctMois}%</span>
              <span style="color:var(--text-muted);">vs mois précédent</span>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${Utils.formatCurrency(d.caMoyenJour)}/jour × ${d.joursRestants}j restants</div>
          </div>

          <!-- Prévision mois prochain -->
          <div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-tertiary);">
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">
              <iconify-icon icon="solar:graph-new-up-bold-duotone" style="color:#8b5cf6;"></iconify-icon> Prévision mois prochain
            </div>
            <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--text-primary);">${Utils.formatCurrency(d.previsionMoisSuivant)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px;">
              Régression linéaire ${d.trendSlope > 0 ? '<span style="color:#22c55e;">↗ tendance haussière</span>' : d.trendSlope < 0 ? '<span style="color:#ef4444;">↘ tendance baissière</span>' : '<span style="color:var(--text-muted);">→ stable</span>'}
            </div>
          </div>

          <!-- Objectif mensuel -->
          <div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-tertiary);">
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">
              <iconify-icon icon="solar:target-bold-duotone" style="color:${progressColor};"></iconify-icon> Objectif mensuel
            </div>
            <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--text-primary);">${Utils.formatCurrency(d.objectifMensuel)}</div>
            <div style="margin-top:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:10px;color:var(--text-muted);">Progression</span>
                <span style="font-size:var(--font-size-xs);font-weight:700;color:${progressColor};">
                  <iconify-icon icon="${progressIcon}"></iconify-icon> ${d.progressionObjectif}%
                </span>
              </div>
              <div style="height:6px;background:var(--bg-primary);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(d.progressionObjectif, 100)}%;background:${progressColor};border-radius:3px;transition:width 0.5s;"></div>
              </div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${Utils.formatCurrency(d.caThisMonth)} / ${Utils.formatCurrency(d.objectifMensuel)}</div>
            </div>
          </div>
        </div>

        <!-- Sparkline chart -->
        <div style="height:180px;">
          <canvas id="chart-forecast"></canvas>
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
            pointBorderColor: Utils.chartBorderColor(),
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
            borderColor: Utils.chartBorderColor(),
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

    // ======= 5. Forecast chart (line + projected bar) =======
    const forecastCtx = document.getElementById('chart-forecast');
    if (forecastCtx && d.forecastChartData && d.forecastChartData.length > 0) {
      const labels = d.forecastChartData.map(f => f.label);
      const actualData = d.forecastChartData.map(f => f.type === 'actual' ? f.value : null);
      const forecastData = d.forecastChartData.map((f, i) => {
        // Connect forecast point to last actual point
        if (f.type === 'forecast') return f.value;
        if (i === d.forecastChartData.length - 2) return f.value; // bridge point
        return null;
      });

      this._charts.push(new Chart(forecastCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              type: 'line',
              label: 'CA réel',
              data: actualData,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              fill: true,
              borderWidth: 2.5,
              pointBackgroundColor: '#3b82f6',
              pointBorderColor: Utils.chartBorderColor(),
              pointBorderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 7,
              spanGaps: false,
              order: 1
            },
            {
              type: 'line',
              label: 'Prévision',
              data: forecastData,
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.08)',
              fill: true,
              borderWidth: 2.5,
              borderDash: [6, 4],
              pointBackgroundColor: '#8b5cf6',
              pointBorderColor: Utils.chartBorderColor(),
              pointBorderWidth: 2,
              pointRadius: (ctx) => {
                return ctx.dataIndex === d.forecastChartData.length - 1 ? 6 : 0;
              },
              pointHoverRadius: 8,
              spanGaps: true,
              order: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = Utils.formatCurrency(ctx.raw);
                  const isPrev = ctx.dataset.label === 'Prévision';
                  return `${ctx.dataset.label} : ${val}${isPrev ? ' (estimé)' : ''}`;
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
        <a href="#/garage" class="btn btn-sm btn-secondary">Voir tout</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${rows}
        ${moreText}
      </div>
    </div>`;
  },


  _filterByDriver(query) {
    // Remove existing dropdown
    const existing = document.getElementById('dashboard-search-dropdown');
    if (existing) existing.remove();

    if (!query || query.trim().length < 2) return;

    const q = query.toLowerCase().trim();
    const chauffeurs = Store.get('chauffeurs').filter(c =>
      (`${c.prenom} ${c.nom}`).toLowerCase().includes(q) ||
      (c.telephone || '').includes(q)
    ).slice(0, 8);

    if (chauffeurs.length === 0) return;

    const input = document.getElementById('dashboard-search');
    if (!input) return;
    const parent = input.parentElement;

    const dropdown = document.createElement('div');
    dropdown.id = 'dashboard-search-dropdown';
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;margin-top:4px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-height:240px;overflow-y:auto;';

    chauffeurs.forEach(c => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:var(--font-size-sm);display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-color);';
      item.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;">${(c.prenom||'')[0]}${(c.nom||'')[0]}</div><div><div style="font-weight:600;">${c.prenom} ${c.nom}</div><div style="font-size:var(--font-size-xs);color:var(--text-muted);">${c.telephone || ''}</div></div>`;
      item.addEventListener('click', () => {
        dropdown.remove();
        input.value = '';
        Router.navigate('/chauffeurs/' + c.id);
      });
      item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-secondary)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      dropdown.appendChild(item);
    });

    parent.appendChild(dropdown);

    // Close on click outside
    const close = (e) => {
      if (!parent.contains(e.target)) {
        dropdown.remove();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  _shareWhatsApp() {
    const d = this._lastData || this._getData();
    const today = new Date().toLocaleDateString('fr-FR');
    const text = [
      `📊 *VOLT VTC — Résumé du ${today}*`,
      '',
      `💰 CA du mois: ${Utils.formatCurrency(d.caThisMonth)}`,
      `✅ Versements reçus: ${Utils.formatCurrency(d.totalVerse)}`,
      `👥 Chauffeurs actifs: ${d.activeCount}/${d.totalChauffeurs}`,
      `🚗 Véhicules en service: ${d.vehiclesActifs}`,
      d.retardCount > 0 ? `⚠️ Versements en retard: ${d.retardCount}` : '',
      d.unpaidItems.length > 0 ? `🔴 Recettes impayées: ${d.unpaidItems.length} (${Utils.formatCurrency(d.totalUnpaid)})` : '',
      '',
      '📱 _Envoyé depuis Volt VTC_'
    ].filter(Boolean).join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
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
