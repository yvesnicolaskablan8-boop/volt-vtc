/**
 * DashboardPage - Main dashboard with KPIs and charts (internal Pilote data)
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
    const lastGen = localStorage.getItem('pilote_autogen_date');
    if (lastGen === today) return; // Déjà fait aujourd'hui
    localStorage.setItem('pilote_autogen_date', today);
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

    // =================== PLANNING HEATMAP (semaine) ===================
    const hmToday = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const hmSel = new Date(selectedDay);
    const hmDow = hmSel.getDay() || 7; // 1=Lun ... 7=Dim
    const hmMonday = new Date(hmSel);
    hmMonday.setDate(hmSel.getDate() - hmDow + 1);
    const dayLabels = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    const heatmapWeekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(hmMonday);
      d.setDate(hmMonday.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      heatmapWeekDays.push({ date: ds, label: dayLabels[i], dayNum: d.getDate(), isToday: ds === hmToday });
    }
    const activeDrivers = chauffeurs.filter(c => c.statut === 'actif').sort((a, b) => (a.prenom || '').localeCompare(b.prenom || ''));
    const heatmapDrivers = activeDrivers.map(c => {
      const cells = heatmapWeekDays.map(wd => {
        // Check absence
        const hasAbsence = absences.some(a => a.chauffeurId === c.id && wd.date >= a.dateDebut && wd.date <= a.dateFin);
        if (hasAbsence) return { status: 'absent', heures: '', shiftId: '' };
        // Check if planned
        const planEntry = planning.find(p => p.chauffeurId === c.id && p.date === wd.date);
        if (!planEntry) return { status: 'repos', heures: '', shiftId: '' };
        // Format heures
        const h1 = planEntry.heureDebut ? planEntry.heureDebut.replace(':00','h').replace(':30','h30') : '';
        const h2 = planEntry.heureFin ? planEntry.heureFin.replace(':00','h').replace(':30','h30') : '';
        const heures = h1 && h2 ? `${h1}-${h2}` : h1 || h2 || '';
        const shiftId = planEntry.id || '';
        // Planned — check if future or today
        if (wd.date >= hmToday) return { status: 'programme', heures, shiftId };
        // Past — check versement
        const hasVersement = versements.some(v => v.chauffeurId === c.id && v.date === wd.date && (v.statut === 'valide' || v.statut === 'supprime'));
        return { status: hasVersement ? 'verse' : 'en_retard', heures, shiftId };
      });
      return { id: c.id, prenom: c.prenom, nom: c.nom, photo: c.photo || '', initials: ((c.prenom||'')[0] + (c.nom||'')[0]).toUpperCase(), cells };
    });

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
      serviceEnCours, serviceEnPause, serviceTermine, servicePasCommence, programmesCount,
      heatmapWeekDays, heatmapDrivers,
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

    // --- 3. Objectif mensuel ---
    // Priorité : objectif manuel défini dans Paramètres > Entreprise, sinon calcul auto
    const settingsObj = Store.get('settings') || {};
    const objectifManuel = settingsObj.entreprise?.objectifMensuelCA || 0;

    let objectifMensuel = 0;
    if (objectifManuel > 0) {
      objectifMensuel = objectifManuel;
    } else {
      // Calcul auto = somme redevances × jours programmés du mois
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
      uniqueDays.forEach((p) => {
        // Exclure absences
        const hasAbsence = absences.some(a => a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin);
        if (hasAbsence) return;
        const ch = chauffeurs.find(c => c.id === p.chauffeurId);
        if (!ch || ch.statut === 'inactif') return;
        const redevance = ch.redevanceQuotidienne || 0;
        if (redevance > 0) objectifMensuel += redevance;
      });
    }

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
      isObjectifManuel: objectifManuel > 0,
      progressionObjectif,
      tendancePctMois,
      trendSlope,
      forecastChartData,
      caMoyenJour: Math.round(caMoyenJour),
      joursRestants: daysInMonth - daysPassed
    };
  },

  _template(d) {
    const caTrendSign = d.caTrend >= 0 ? '+' : '';
    const recouvrementColor = d.tauxRecouvrement >= 80 ? '#0d9488' : d.tauxRecouvrement >= 50 ? '#d97706' : '#dc2626';
    const progressColor = d.progressionObjectif >= 80 ? '#0d9488' : d.progressionObjectif >= 50 ? '#d97706' : '#dc2626';
    const session = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : {};
    const userName = session.prenom || 'Patron';

    // SVG semi-donut arc helper (like the Customers chart in reference)
    const arc = (pct, color, secondColor = '#f97316', size = 120, stroke = 14) => {
      const r = (size - stroke) / 2;
      const circ = Math.PI * r; // semi-circle
      const mainOffset = circ - (Math.min(pct, 100) / 100) * circ;
      return `<svg width="${size}" height="${size * 0.65}" viewBox="0 0 ${size} ${size * 0.65}" style="display:block;margin:0 auto;">
        <path d="M ${stroke/2} ${size*0.6} A ${r} ${r} 0 0 1 ${size - stroke/2} ${size*0.6}" fill="none" stroke="#e5e7eb" stroke-width="${stroke}" stroke-linecap="round"/>
        <path d="M ${stroke/2} ${size*0.6} A ${r} ${r} 0 0 1 ${size - stroke/2} ${size*0.6}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${circ}" stroke-dashoffset="${mainOffset}" style="transition:stroke-dashoffset .8s ease;"/>
      </svg>`;
    };

    // SVG circular gauge helper
    const gauge = (pct, color, size = 72, stroke = 6) => {
      const r = (size - stroke) / 2;
      const circ = 2 * Math.PI * r;
      const offset = circ - (Math.min(pct, 100) / 100) * circ;
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${stroke}"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset .8s ease;"/>
      </svg>`;
    };

    // Mini sparkline SVG with area fill
    const sparkline = (values, color = '#0d9488', w = 90, h = 32) => {
      if (!values || values.length < 2) return '';
      const max = Math.max(...values, 1);
      const min = Math.min(...values, 0);
      const range = max - min || 1;
      const step = w / (values.length - 1);
      const pts = values.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`);
      const line = pts.join(' ');
      const area = `${pts.join(' ')} ${w},${h} 0,${h}`;
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
        <polygon points="${area}" fill="${color}" opacity="0.08"/>
        <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${(values.length-1)*step}" cy="${h - ((values[values.length-1] - min) / range) * (h-4) - 2}" r="3" fill="${color}"/>
      </svg>`;
    };

    const last6Rev = d.monthlyRevenue ? d.monthlyRevenue.slice(-6).map(m => m.revenue) : [];

    return `
      <style>
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes dSlide { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        #live-indicator.pulse { animation:flash-indicator 1.5s }
        @keyframes flash-indicator { 0%{background:rgba(99,102,241,.3)} 100%{background:rgba(99,102,241,.08)} }

        .d-wrap { animation: dSlide .5s cubic-bezier(.16,1,.3,1); }
        .d-bg {
          background: linear-gradient(160deg, #f0f4ff 0%, #faf5ff 40%, #fdf2f8 100%);
          margin: -24px -28px;
          padding: 32px 32px 40px;
          min-height: 100vh;
        }
        [data-theme="dark"] .d-bg { background: linear-gradient(160deg, #0c0f1a 0%, #13111c 40%, #170f14 100%); }

        .d-grid { display:grid; gap:16px; margin-bottom:16px; }
        .d-card {
          background: rgba(255,255,255,.72);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-radius: 20px;
          padding: 22px 24px;
          border: 1px solid rgba(255,255,255,.6);
          box-shadow: 0 1px 3px rgba(0,0,0,.04), 0 8px 32px rgba(0,0,0,.04);
          transition: all .25s cubic-bezier(.16,1,.3,1);
          position: relative;
          overflow: hidden;
        }
        [data-theme="dark"] .d-card {
          background: rgba(30,27,40,.65);
          border-color: rgba(255,255,255,.06);
          box-shadow: 0 1px 3px rgba(0,0,0,.2), 0 8px 32px rgba(0,0,0,.15);
        }
        .d-card:hover { transform:translateY(-2px); box-shadow:0 8px 40px rgba(99,102,241,.1); border-color:rgba(99,102,241,.15); }
        [data-theme="dark"] .d-card:hover { box-shadow:0 8px 40px rgba(99,102,241,.15); border-color:rgba(99,102,241,.2); }

        .d-card.hero {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 35%, #a855f7 65%, #c084fc 100%);
          background-size: 200% 200%;
          animation: heroGradient 8s ease infinite;
          border: 1px solid rgba(255,255,255,.18);
          color: #fff;
          box-shadow: 0 4px 24px rgba(99,102,241,.3), 0 0 60px rgba(139,92,246,.15), inset 0 1px 0 rgba(255,255,255,.15);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          position: relative;
          overflow: hidden;
        }
        @keyframes heroGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .d-card.hero:hover { transform:translateY(-3px); box-shadow:0 12px 48px rgba(99,102,241,.4), 0 0 80px rgba(139,92,246,.2), inset 0 1px 0 rgba(255,255,255,.2); }
        .d-card.hero::before {
          content:''; position:absolute; top:-50%; left:-30%; width:260px; height:260px;
          background:radial-gradient(circle, rgba(255,255,255,.1) 0%, transparent 60%);
          pointer-events:none; animation: heroBubble1 12s ease-in-out infinite;
        }
        .d-card.hero::after {
          content:''; position:absolute; bottom:-40%; right:-20%; width:200px; height:200px;
          background:radial-gradient(circle, rgba(255,255,255,.08) 0%, transparent 65%);
          pointer-events:none; animation: heroBubble2 10s ease-in-out infinite reverse;
        }
        @keyframes heroBubble1 {
          0%,100% { transform:translate(0,0) scale(1); }
          50% { transform:translate(30px,20px) scale(1.15); }
        }
        @keyframes heroBubble2 {
          0%,100% { transform:translate(0,0) scale(1); }
          50% { transform:translate(-20px,-15px) scale(1.1); }
        }
        .hero-glass-overlay {
          position:absolute; top:0; left:0; right:0; bottom:0;
          background: linear-gradient(180deg, rgba(255,255,255,.06) 0%, transparent 50%, rgba(0,0,0,.08) 100%);
          pointer-events:none; z-index:0;
        }
        .hero-shimmer {
          position:absolute; top:0; left:-100%; width:60%; height:100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent);
          pointer-events:none; animation: heroShimmer 6s ease-in-out infinite;
        }
        @keyframes heroShimmer {
          0% { left:-100%; }
          50% { left:150%; }
          100% { left:150%; }
        }
        .hero-content { position:relative; z-index:1; }

        .d-icon {
          width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center;
          font-size:18px; flex-shrink:0;
        }

        .d-lbl {
          font-size: 13px; font-weight: 600; color: #6b7280;
          letter-spacing: .2px;
        }
        [data-theme="dark"] .d-lbl { color: #9ca3af; }

        .d-val {
          font-size: 28px; font-weight: 800; color: #111827;
          line-height: 1.1; letter-spacing: -.5px;
          font-feature-settings: 'tnum';
        }
        [data-theme="dark"] .d-val { color: #f9fafb; }
        .d-val.xl { font-size: 32px; }
        .d-val.hero { color: #fff; font-size: 36px; }

        .d-sub { font-size: 12px; color: #9ca3af; margin-top: 4px; font-weight:500; }
        [data-theme="dark"] .d-sub { color: #6b7280; }

        .d-tag {
          display:inline-flex; align-items:center; gap:3px; padding:4px 10px; border-radius:20px;
          font-size: 11px; font-weight: 700;
        }
        .d-tag.purple { background:rgba(99,102,241,.08); color:#6366f1; }
        .d-tag.green { background:rgba(16,185,129,.08); color:#10b981; }
        .d-tag.red { background:rgba(239,68,68,.08); color:#ef4444; }
        .d-tag.orange { background:rgba(249,115,22,.08); color:#f97316; }
        .d-tag.white { background:rgba(255,255,255,.2); color:#fff; }
        [data-theme="dark"] .d-tag.purple { background:rgba(99,102,241,.15); }
        [data-theme="dark"] .d-tag.green { background:rgba(16,185,129,.15); }
        [data-theme="dark"] .d-tag.red { background:rgba(239,68,68,.15); }
        [data-theme="dark"] .d-tag.orange { background:rgba(249,115,22,.15); }

        .d-pill {
          display:inline-flex; align-items:center; gap:4px; padding:5px 12px; border-radius:12px;
          font-size:11px; font-weight:600; background:rgba(0,0,0,.04); color:#4b5563;
        }
        [data-theme="dark"] .d-pill { background:rgba(255,255,255,.06); color:#d1d5db; }

        .d-chip {
          display:inline-flex; align-items:center; gap:4px; padding:6px 14px; border-radius:12px;
          font-size:12px; font-weight:600; background:rgba(0,0,0,.03); color:#4b5563;
        }
        [data-theme="dark"] .d-chip { background:rgba(255,255,255,.06); color:#d1d5db; }

        .d-gauge-wrap { position:relative; display:flex; align-items:center; justify-content:center; }
        .d-gauge-txt { position:absolute; font-weight:800; }

        .d-legend {
          display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#4b5563;
        }
        .d-legend-dot { width:8px; height:8px; border-radius:50%; }
        [data-theme="dark"] .d-legend { color:#d1d5db; }

        .d-bar-track { height:6px; border-radius:6px; background:rgba(0,0,0,.06); overflow:hidden; }
        [data-theme="dark"] .d-bar-track { background:rgba(255,255,255,.06); }
        .d-bar-fill { height:100%; border-radius:6px; transition:width .6s cubic-bezier(.16,1,.3,1); }

        .d-section-title {
          font-size:11px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:1px;
          margin-bottom:10px; margin-top:6px;
        }

        /* Heatmap */
        .d-hm-grid {
          display:grid; grid-template-columns:120px repeat(7,1fr); gap:3px 4px; align-items:center;
        }
        .d-hm-head {
          text-align:center; font-size:11px; font-weight:700; color:#9ca3af; padding:8px 0 6px;
          text-transform:uppercase; letter-spacing:.8px;
          border-bottom:2px solid transparent;
        }
        .d-hm-head.today {
          color:#6366f1;
          background:linear-gradient(180deg, rgba(99,102,241,.06) 0%, rgba(99,102,241,.02) 100%);
          border-radius:12px 12px 0 0;
          border-bottom:2px solid #6366f1;
        }
        .d-hm-head .d-hm-daynum { display:block; font-size:16px; font-weight:800; color:#374151; margin-top:2px; }
        .d-hm-head.today .d-hm-daynum { color:#6366f1; }
        [data-theme="dark"] .d-hm-head { color:#6b7280; }
        [data-theme="dark"] .d-hm-head.today { background:rgba(99,102,241,.1); }
        [data-theme="dark"] .d-hm-head .d-hm-daynum { color:#d1d5db; }
        .d-hm-driver {
          display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:#374151;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:4px 0;
        }
        [data-theme="dark"] .d-hm-driver { color:#d1d5db; }
        .d-hm-avatar {
          width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          font-size:9px; font-weight:700; color:#fff; flex-shrink:0;
          box-shadow:0 2px 6px rgba(0,0,0,.15);
          border:2px solid rgba(255,255,255,.8);
        }
        .d-hm-row-even { background:rgba(0,0,0,.015); border-radius:8px; }
        [data-theme="dark"] .d-hm-row-even { background:rgba(255,255,255,.02); }
        .d-hm-cell {
          height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center;
          font-size:13px; cursor:pointer; transition:all .2s cubic-bezier(.16,1,.3,1);
          position:relative;
        }
        .d-hm-cell:hover { transform:scale(1.1); box-shadow:0 4px 12px rgba(0,0,0,.12); z-index:2; }
        .hm-verse { background:linear-gradient(135deg,rgba(16,185,129,.18),rgba(52,211,153,.12)); color:#10b981; }
        .hm-programme { background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.1)); color:#6366f1; }
        .hm-en_retard { background:linear-gradient(135deg,rgba(239,68,68,.18),rgba(248,113,113,.1)); color:#ef4444; }
        .hm-absent { background:linear-gradient(135deg,rgba(249,115,22,.15),rgba(251,146,60,.08)); color:#f97316; }
        .hm-repos { background:rgba(0,0,0,.025); color:#d1d5db; }
        .hm-verse:hover { background:linear-gradient(135deg,rgba(16,185,129,.28),rgba(52,211,153,.2)); }
        .hm-programme:hover { background:linear-gradient(135deg,rgba(99,102,241,.25),rgba(139,92,246,.18)); }
        .hm-en_retard:hover { background:linear-gradient(135deg,rgba(239,68,68,.28),rgba(248,113,113,.2)); }
        .hm-absent:hover { background:linear-gradient(135deg,rgba(249,115,22,.25),rgba(251,146,60,.15)); }
        [data-theme="dark"] .hm-verse { background:linear-gradient(135deg,rgba(16,185,129,.22),rgba(52,211,153,.15)); }
        [data-theme="dark"] .hm-programme { background:linear-gradient(135deg,rgba(99,102,241,.22),rgba(139,92,246,.15)); }
        [data-theme="dark"] .hm-en_retard { background:linear-gradient(135deg,rgba(239,68,68,.22),rgba(248,113,113,.15)); }
        [data-theme="dark"] .hm-absent { background:linear-gradient(135deg,rgba(249,115,22,.2),rgba(251,146,60,.12)); }
        [data-theme="dark"] .hm-repos { background:rgba(255,255,255,.03); color:#4b5563; }

        @media(max-width:900px) {
          .d-g4 { grid-template-columns:repeat(2,1fr) !important; }
          .d-g3 { grid-template-columns:1fr 1fr !important; }
          .d-g21 { grid-template-columns:1fr !important; }
        }
        @media(max-width:600px) {
          .d-g4 { grid-template-columns:repeat(2,1fr) !important; }
          .d-bg { margin:-16px; padding:12px 10px 24px; }
          .d-card { padding:12px !important; overflow:hidden; }
          .d-val { font-size:20px !important; }
          .d-lbl { font-size:11px !important; }
          .d-grid { gap:8px !important; }
          .d-legend { font-size:10px !important; white-space:nowrap; }
          .d-chauffeurs-donut { flex-direction:column !important; gap:6px !important; align-items:center !important; }
          .d-chauffeurs-donut > div:first-child { max-width:80px !important; }
          .d-chauffeurs-donut svg { width:70px !important; height:auto !important; }
          .d-chauffeurs-donut .d-donut-center { font-size:14px !important; }
          .d-chauffeurs-legends { flex-direction:row !important; flex-wrap:wrap !important; gap:6px 12px !important; justify-content:center !important; width:100% !important; }
          .d-chauffeurs-legends > div { justify-content:flex-start !important; gap:6px !important; }
          .d-chauffeurs-legends strong { font-size:12px !important; }
          .d-hm-grid { grid-template-columns:36px repeat(7,1fr) !important; gap:2px !important; }
          .d-hm-driver { font-size:10px !important; }
          .d-hm-driver span:last-child { display:none; }
          .d-hm-avatar { width:22px !important; height:22px !important; font-size:8px !important; }
          .d-hm-cell { height:24px; border-radius:5px; font-size:9px; }
          .d-hm-head { font-size:10px !important; }
        }
      </style>

      <div class="d-wrap">
      <div class="d-bg">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:14px;">
        <div>
          <div style="font-size:14px;color:#9ca3af;font-weight:500;">Bienvenue,</div>
          <div style="font-size:28px;font-weight:800;color:#111827;letter-spacing:-.6px;margin-top:2px;">${userName} !</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:0;background:rgba(255,255,255,.7);backdrop-filter:blur(12px);border-radius:14px;border:1px solid rgba(0,0,0,.06);padding:3px;">
            <input type="date" id="dashboard-period" value="${this._selectedPeriod || new Date().toISOString().split('T')[0]}" max="${new Date().toISOString().split('T')[0]}" style="font-size:12px;padding:6px 10px;border-radius:11px;background:transparent;border:none;color:#374151;font-weight:500;outline:none;">
            <button onclick="DashboardPage._toggleMonthView()" style="font-size:12px;padding:6px 14px;border-radius:11px;background:${this._monthView ? '#6366f1' : 'transparent'};color:${this._monthView ? '#fff' : '#6b7280'};border:none;font-weight:600;cursor:pointer;transition:all .2s;">
              ${this._monthView ? 'Mois' : 'Jour'}
            </button>
            ${this._selectedPeriod || this._monthView ? '<button onclick="DashboardPage._resetToToday()" style="font-size:13px;padding:6px 8px;border-radius:11px;background:transparent;border:none;cursor:pointer;color:#6b7280;"><iconify-icon icon="solar:restart-bold"></iconify-icon></button>' : ''}
          </div>
          ${this._isToday() ? '<span id="live-indicator" style="display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#6366f1;background:rgba(99,102,241,.08);padding:5px 14px;border-radius:20px;font-weight:700;backdrop-filter:blur(8px);"><span style="width:6px;height:6px;border-radius:50%;background:#6366f1;animation:pulse-dot 2s infinite;"></span>LIVE</span>' : `<span style="font-size:12px;color:#9ca3af;font-weight:500;">${d.periodLabel}</span>`}
          <div style="position:relative;">
            <iconify-icon icon="solar:magnifer-bold" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;color:#9ca3af;pointer-events:none;"></iconify-icon>
            <input type="text" id="dashboard-search" placeholder="Rechercher..." style="padding:8px 14px 8px 34px;font-size:12px;width:160px;border-radius:14px;background:rgba(255,255,255,.7);backdrop-filter:blur(12px);border:1px solid rgba(0,0,0,.06);color:#374151;outline:none;font-weight:500;" oninput="DashboardPage._filterByDriver(this.value)">
          </div>
        </div>
      </div>

      <!-- Row 1: Hero CA + Versements + Dettes + Pertes -->
      <div class="d-grid d-g4" style="grid-template-columns:1.6fr 1fr 1fr 1fr;">

        <!-- CA Hero Card -->
        <a href="#/versements" class="d-card hero" style="text-decoration:none;color:#fff;grid-row:span 1;">
          <div class="hero-glass-overlay"></div>
          <div class="hero-shimmer"></div>
          <div class="hero-content">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:1.2px;">Chiffre d'affaires</div>
                <div class="d-val hero" style="margin-top:8px;">${Utils.formatCurrency(d.caThisMonth)}</div>
              </div>
              <div style="width:40px;height:40px;border-radius:14px;background:rgba(255,255,255,.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;">
                <iconify-icon icon="solar:graph-new-up-bold" style="font-size:20px;color:#fff;"></iconify-icon>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:12px;">
              <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;background:${d.caTrend >= 0 ? 'rgba(52,211,153,.2)' : 'rgba(248,113,113,.2)'};backdrop-filter:blur(6px);border:1px solid ${d.caTrend >= 0 ? 'rgba(52,211,153,.25)' : 'rgba(248,113,113,.25)'};font-size:11px;font-weight:700;color:#fff;">
                <iconify-icon icon="${d.caTrend >= 0 ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold'}" style="font-size:10px;"></iconify-icon>
                ${caTrendSign}${Math.abs(Math.round(d.caTrend))}%
              </span>
              <span style="font-size:11px;color:rgba(255,255,255,.45);font-weight:500;">vs période préc.</span>
            </div>
            <div style="margin-top:14px;height:60px;position:relative;">
              <canvas id="hero-ca-chart" style="width:100%;height:60px;"></canvas>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:6px;">
              ${(d.forecastChartData || []).map(m => `<span style="font-size:9px;color:rgba(255,255,255,.35);font-weight:500;">${m.label}</span>`).join('')}
            </div>
          </div>
        </a>

        <!-- Versements (fond vert) -->
        <a href="#/versements" class="d-card" style="text-decoration:none;color:#fff;background:linear-gradient(135deg,#10b981,#34d399);border:none;box-shadow:0 4px 20px rgba(16,185,129,.25);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;">
              <iconify-icon icon="solar:card-send-bold-duotone"></iconify-icon>
            </div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">Versements</div>
          </div>
          <div class="d-val xl" style="color:#fff;">${d.nbVersementsPeriode}</div>
          <div class="d-sub" style="color:rgba(255,255,255,.65);">${Utils.formatCurrency(d.caMoyenJour)} / jour</div>
          <div style="margin-top:10px;">
            <span style="display:inline-flex;align-items:center;gap:3px;padding:4px 10px;border-radius:20px;background:rgba(255,255,255,.2);backdrop-filter:blur(4px);font-size:11px;font-weight:700;color:#fff;">${d.retardCount} en retard</span>
          </div>
        </a>

        <!-- Dettes (fond orange vif) -->
        <a href="#/versements" class="d-card" style="text-decoration:none;color:#fff;background:linear-gradient(135deg,#f97316,#fb923c);border:none;box-shadow:0 4px 20px rgba(249,115,22,.25);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;">
              <iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon>
            </div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">Dettes</div>
          </div>
          <div class="d-val" style="color:#fff;">${Utils.formatCurrency(d.totalDettes)}</div>
          <div class="d-sub" style="color:rgba(255,255,255,.65);">${d.nbDetteDrivers} chauffeur${d.nbDetteDrivers !== 1 ? 's' : ''}</div>
          <div class="d-bar-track" style="margin-top:12px;background:rgba(255,255,255,.15);">
            <div class="d-bar-fill" style="width:${d.totalAttendu > 0 ? Math.min(d.totalDettes/d.totalAttendu*100,100) : 0}%;background:rgba(255,255,255,.5);"></div>
          </div>
        </a>

        <!-- Pertes (fond rouge) -->
        <a href="#/versements" class="d-card" style="text-decoration:none;color:#fff;background:linear-gradient(135deg,#ef4444,#f87171);border:none;box-shadow:0 4px 20px rgba(239,68,68,.25);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;">
              <iconify-icon icon="solar:arrow-down-bold-duotone"></iconify-icon>
            </div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">Pertes</div>
          </div>
          <div class="d-val" style="color:#fff;">${Utils.formatCurrency(d.totalPertes)}</div>
          <div class="d-sub" style="color:rgba(255,255,255,.65);">${d.nbPerteDrivers} chauffeur${d.nbPerteDrivers !== 1 ? 's' : ''}</div>
          <div class="d-bar-track" style="margin-top:12px;background:rgba(255,255,255,.15);">
            <div class="d-bar-fill" style="width:${d.totalAttendu > 0 ? Math.min(d.totalPertes/d.totalAttendu*100,100) : 0}%;background:rgba(255,255,255,.5);"></div>
          </div>
        </a>
      </div>

      <!-- Row 2: Chauffeurs + Objectif + Recouvrement + Flotte -->
      <div class="d-grid d-g4" style="grid-template-columns:1.4fr 1fr 1fr 1fr;">

        <!-- Chauffeurs with donut -->
        <a href="#/chauffeurs" class="d-card" style="text-decoration:none;color:inherit;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div class="d-icon" style="background:rgba(59,130,246,.1);color:#3b82f6;">
              <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
            </div>
            <div class="d-lbl" style="margin:0;">Chauffeurs</div>
          </div>
          <div class="d-chauffeurs-donut" style="display:flex;align-items:center;gap:16px;">
            <div style="position:relative;flex-shrink:0;">
              ${arc(d.totalChauffeurs > 0 ? (d.activeCount / d.totalChauffeurs * 100) : 0, '#10b981', '#f97316', 100, 12)}
              <div style="position:absolute;top:55%;left:50%;transform:translate(-50%,-30%);text-align:center;">
                <div class="d-donut-center" style="font-size:20px;font-weight:800;color:#111827;">${d.totalChauffeurs}</div>
                <div style="font-size:9px;color:#9ca3af;font-weight:600;">Total</div>
              </div>
            </div>
            <div class="d-chauffeurs-legends" style="display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                <div class="d-legend"><span class="d-legend-dot" style="background:#10b981;"></span> Actifs</div>
                <strong style="font-size:13px;color:#374151;flex-shrink:0;">${d.activeCount}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                <div class="d-legend"><span class="d-legend-dot" style="background:#f97316;"></span> Suspendus</div>
                <strong style="font-size:13px;color:#374151;flex-shrink:0;">${d.suspendusCount}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                <div class="d-legend"><span class="d-legend-dot" style="background:#d1d5db;"></span> Inactifs</div>
                <strong style="font-size:13px;color:#374151;flex-shrink:0;">${d.inactifsCount}</strong>
              </div>
            </div>
          </div>
        </a>

        <!-- Objectif -->
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(99,102,241,.08);color:#6366f1;">
              <iconify-icon icon="solar:target-bold-duotone"></iconify-icon>
            </div>
            <div class="d-lbl" style="margin:0;">Objectif</div>
          </div>
          <div class="d-gauge-wrap" style="margin:4px 0;">
            ${gauge(d.progressionObjectif, progressColor, 64, 5)}
            <div class="d-gauge-txt" style="color:${progressColor};font-size:14px;">${d.progressionObjectif}%</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:#374151;text-align:center;margin-top:6px;">${Utils.formatCurrency(d.objectifMensuel)}</div>
          <div class="d-sub" style="text-align:center;">${d.joursRestants}j restants</div>
        </div>

        <!-- Recouvrement -->
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(16,185,129,.08);color:#10b981;">
              <iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon>
            </div>
            <div class="d-lbl" style="margin:0;">Recouvrement</div>
          </div>
          <div class="d-gauge-wrap" style="margin:4px 0;">
            ${gauge(d.tauxRecouvrement, recouvrementColor, 64, 5)}
            <div class="d-gauge-txt" style="color:${recouvrementColor};font-size:14px;">${d.tauxRecouvrement}%</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:#374151;text-align:center;margin-top:6px;">${Utils.formatCurrency(d.totalVerse)}</div>
          <div class="d-sub" style="text-align:center;">/ ${Utils.formatCurrency(d.totalAttendu)}</div>
        </div>

        <!-- Flotte -->
        <a href="#/vehicules" class="d-card" style="text-decoration:none;color:inherit;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(59,130,246,.1);color:#3b82f6;">
              <iconify-icon icon="solar:bus-bold-duotone"></iconify-icon>
            </div>
            <div class="d-lbl" style="margin:0;">Flotte</div>
          </div>
          <div style="display:flex;align-items:baseline;gap:5px;">
            <span class="d-val">${d.vehiclesActifs}</span>
            <span style="font-size:15px;color:#9ca3af;font-weight:600;">/ ${d.vehiculesTotal}</span>
          </div>
          <div style="display:flex;gap:6px;margin-top:12px;">
            <span class="d-pill">⚡ ${d.vehiclesEV}</span>
            <span class="d-pill">⛽ ${d.vehiclesThermique}</span>
          </div>
        </a>
      </div>

      <!-- Row 3: Mes taches + Alertes (côte à côte) -->
      <div class="d-grid" style="grid-template-columns:1fr 1fr;align-items:stretch;">
          <!-- Mes taches -->
          ${this._renderMesTaches()}

          <!-- Alertes -->
          <a href="#/alertes" class="d-card" style="text-decoration:none;color:inherit;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="d-icon" style="background:${d.alertesTotal > 0 ? 'rgba(239,68,68,.08)' : 'rgba(16,185,129,.08)'};color:${d.alertesTotal > 0 ? '#ef4444' : '#10b981'};width:34px;height:34px;border-radius:10px;font-size:15px;">
                  <iconify-icon icon="${d.alertesTotal > 0 ? 'solar:bell-bing-bold-duotone' : 'solar:check-circle-bold-duotone'}"></iconify-icon>
                </div>
                <div class="d-lbl" style="margin:0;">Alertes</div>
              </div>
              <span class="d-tag ${d.alertesTotal > 0 ? 'red' : 'green'}">${d.alertesTotal > 0 ? d.alertesTotal + ' alerte' + (d.alertesTotal > 1 ? 's' : '') : 'Tout OK'}</span>
            </div>
            ${d.alertesCritiques > 0 ? `<div style="display:flex;gap:8px;margin-top:10px;">
              <span class="d-tag red">${d.alertesCritiques} critique${d.alertesCritiques > 1 ? 's' : ''}</span>
              ${d.alertesUrgentes > 0 ? `<span class="d-tag orange">${d.alertesUrgentes} urgent${d.alertesUrgentes > 1 ? 's' : ''}</span>` : ''}
            </div>` : ''}
          </a>
      </div>

      <!-- Row 3.5: Planning Heatmap -->
      <div class="d-grid" style="grid-template-columns:1fr;">
        ${this._renderPlanningHeatmap(d)}
      </div>

      <!-- Row 4: Maintenance -->
      <div class="d-grid" style="grid-template-columns:1fr;">
        ${this._renderMaintenancePanel(d)}
      </div>

      </div>
      </div>
    `;
  },

  _renderMesTaches() {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const userId = session ? session.userId : '';
    const isAdmin = session && session.role === 'Administrateur';
    const allTaches = Store.get('taches') || [];

    // Admin: taches qu'il a creees (attribuees aux autres)
    // Non-admin: taches qui lui sont assignees
    const mesTaches = isAdmin
      ? allTaches.filter(t => t.creePar === userId && t.statut !== 'terminee' && t.statut !== 'annulee')
      : allTaches.filter(t => t.assigneA === userId && t.statut !== 'terminee' && t.statut !== 'annulee');

    const aFaire = mesTaches.filter(t => t.statut === 'a_faire').length;
    const enCours = mesTaches.filter(t => t.statut === 'en_cours').length;
    const urgentes = mesTaches.filter(t => t.priorite === 'urgente').length;
    const enRetard = mesTaches.filter(t => t.dateEcheance && t.dateEcheance < new Date().toISOString().split('T')[0]).length;

    // Top 3 taches les plus urgentes
    const top3 = [...mesTaches].sort((a, b) => {
      const pOrd = { urgente: 0, haute: 1, normale: 2, basse: 3 };
      return (pOrd[a.priorite] ?? 2) - (pOrd[b.priorite] ?? 2);
    }).slice(0, 3);

    const statutLabels = { a_faire: 'A faire', en_cours: 'En cours' };

    // Dynamic color
    let cardGrad, cardShadow;
    if (enRetard > 0 || urgentes > 0) {
      cardGrad = 'linear-gradient(135deg,#ef4444,#f87171)';
      cardShadow = '0 4px 20px rgba(239,68,68,.35)';
    } else if (mesTaches.some(t => t.priorite === 'haute')) {
      cardGrad = 'linear-gradient(135deg,#f97316,#fb923c)';
      cardShadow = '0 4px 20px rgba(249,115,22,.35)';
    } else if (mesTaches.length > 0) {
      cardGrad = 'linear-gradient(135deg,#f59e0b,#fbbf24)';
      cardShadow = '0 4px 20px rgba(245,158,11,.35)';
    } else {
      cardGrad = 'linear-gradient(135deg,#22c55e,#4ade80)';
      cardShadow = '0 4px 20px rgba(34,197,94,.35)';
    }

    const title = isAdmin ? 'Taches attribuees' : 'Mes taches';
    const subtitle = isAdmin
      ? `${mesTaches.length} tache${mesTaches.length !== 1 ? 's' : ''} en cours`
      : `${mesTaches.length} en cours / a faire`;
    const emptyMsg = isAdmin ? 'Aucune tache attribuee' : 'Aucune tache en attente';
    const icon = isAdmin ? 'solar:users-group-rounded-bold-duotone' : 'solar:checklist-bold-duotone';

    return `
      <a href="#/taches" class="d-card" style="text-decoration:none;color:inherit;background:${cardGrad};border:none;box-shadow:${cardShadow};padding:16px 20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.15rem;background:rgba(255,255,255,.25);color:#fff;backdrop-filter:blur(4px);">
            <iconify-icon icon="${icon}"></iconify-icon>
          </div>
          <div>
            <div style="font-weight:700;font-size:var(--font-size-sm);color:#fff;margin:0;">${title}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.8);">${subtitle}</div>
          </div>
          ${enRetard > 0 ? `<span style="margin-left:auto;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:rgba(239,68,68,.9);color:#fff;">${enRetard} en retard</span>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:${top3.length > 0 ? '10px' : '0'};">
          <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.2);">
            <span style="width:6px;height:6px;border-radius:50%;background:#fff;"></span>
            <span style="font-size:11px;color:rgba(255,255,255,.85);">A faire</span>
            <strong style="margin-left:auto;font-size:13px;color:#fff;">${aFaire}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.2);">
            <span style="width:6px;height:6px;border-radius:50%;background:#fff;"></span>
            <span style="font-size:11px;color:rgba(255,255,255,.85);">En cours</span>
            <strong style="margin-left:auto;font-size:13px;color:#fff;">${enCours}</strong>
          </div>
        </div>
        ${top3.length > 0 ? `<div style="display:flex;flex-direction:column;gap:4px;">
          ${top3.map(t => {
            const sLabel = statutLabels[t.statut] || t.statut;
            const isLate = t.dateEcheance && t.dateEcheance < new Date().toISOString().split('T')[0];
            return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.15);font-size:11px;">
              <span style="width:5px;height:5px;border-radius:50%;background:#fff;flex-shrink:0;"></span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;color:#fff;">${t.titre}</span>
              ${isAdmin ? `<span style="font-size:10px;color:rgba(255,255,255,.7);">${t.assigneANom || 'Non assigne'}</span>` : ''}
              ${isLate ? '<span style="color:#fecaca;font-weight:600;font-size:10px;">En retard</span>' : ''}
              <span style="padding:2px 6px;border-radius:8px;font-size:9px;font-weight:600;background:rgba(255,255,255,.2);color:#fff;">${sLabel}</span>
            </div>`;
          }).join('')}
        </div>` : `<div style="text-align:center;padding:8px;color:rgba(255,255,255,.7);font-size:12px;">${emptyMsg}</div>`}
      </a>`;
  },

  _renderMaintenancePanel(d) {
    const typeLabels = { vidange:'Vidange', revision:'Révision', pneus:'Pneus', freins:'Freins', filtres:'Filtres', climatisation:'Clim.', courroie:'Courroie', controle_technique:'CT', batterie:'Batterie', amortisseurs:'Amort.', echappement:'Échap.', carrosserie:'Carrosserie', autre:'Autre' };
    const alerts = d.maintenanceAlerts || [];

    if (alerts.length === 0) {
      return `<div class="d-card" style="display:flex;align-items:center;gap:14px;">
        <div class="d-icon" style="background:rgba(16,185,129,.08);color:#10b981;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;">
          <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon>
        </div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#111827;">Maintenance OK</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Aucun entretien en retard</div>
        </div>
      </div>`;
    }

    const rows = alerts.slice(0, 4).map(m => {
      const isRetard = m.statut === 'en_retard';
      const color = isRetard ? '#dc2626' : '#d97706';
      const badgeLabel = isRetard ? 'RETARD' : 'URGENT';
      let echeance = '';
      if (m.prochaineDate) {
        const jours = Math.ceil((new Date(m.prochaineDate) - new Date()) / 86400000);
        if (jours < 0) echeance = Math.abs(jours) + 'j retard';
        else if (jours === 0) echeance = "aujourd'hui";
        else echeance = 'dans ' + jours + 'j';
      }
      const typeLabel = typeLabels[m.type] || m.type;
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.02);border:1px solid rgba(0,0,0,.04);cursor:pointer;transition:background .2s;" onclick="Router.navigate('/vehicules/${m.vehiculeId}')" onmouseover="this.style.background='rgba(0,0,0,.04)'" onmouseout="this.style.background='rgba(0,0,0,.02)'">
        <div style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:#111827;">${typeLabel} <span class="d-tag ${isRetard ? 'red' : 'orange'}" style="font-size:9px;padding:1px 6px;">${badgeLabel}</span></div>
          <div style="font-size:10px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.vehiculeLabel}</div>
        </div>
        ${echeance ? `<div style="font-size:10px;color:${color};font-weight:600;white-space:nowrap;">${echeance}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="d-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="d-icon" style="background:rgba(249,115,22,.08);color:#f97316;width:34px;height:34px;border-radius:10px;font-size:15px;display:flex;align-items:center;justify-content:center;">
            <iconify-icon icon="solar:settings-bold-duotone"></iconify-icon>
          </div>
          <div class="d-lbl" style="margin:0;font-size:14px;font-weight:700;color:#111827;">Maintenance</div>
        </div>
        <a href="#/garage" style="font-size:11px;font-weight:600;color:#6366f1;text-decoration:none;">Voir tout →</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;">${rows}</div>
      ${alerts.length > 4 ? `<div style="text-align:center;padding:4px;font-size:10px;color:#9ca3af;margin-top:4px;">+ ${alerts.length - 4} autre(s)</div>` : ''}
    </div>`;
  },

  _renderPlanningHeatmap(d) {
    const drivers = d.heatmapDrivers || [];
    const days = d.heatmapWeekDays || [];
    if (drivers.length === 0) {
      return `<div class="d-card" style="display:flex;align-items:center;gap:14px;">
        <div class="d-icon" style="background:rgba(99,102,241,.08);color:#6366f1;"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon></div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#111827;">Planning semaine</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Aucun chauffeur actif</div>
        </div>
      </div>`;
    }

    const statusIcons = {
      verse: '<iconify-icon icon="solar:check-circle-bold" style="font-size:14px;"></iconify-icon>',
      en_retard: '<iconify-icon icon="solar:danger-triangle-bold" style="font-size:14px;"></iconify-icon>',
      absent: '<iconify-icon icon="solar:minus-circle-bold" style="font-size:14px;"></iconify-icon>',
      repos: ''
    };
    const statusLabels = { verse: 'Versé', programme: 'Programmé', en_retard: 'En retard', absent: 'Absent', repos: 'Repos' };
    const avatarColors = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'];

    // Header row
    let html = '<div class="d-hm-grid" style="animation:dSlide .5s cubic-bezier(.16,1,.3,1);">';
    html += '<div></div>'; // empty top-left
    days.forEach(wd => {
      html += `<div class="d-hm-head ${wd.isToday ? 'today' : ''}">
        <span>${wd.label}</span>
        <span class="d-hm-daynum">${wd.dayNum}</span>
      </div>`;
    });

    // Driver rows
    drivers.forEach((dr, idx) => {
      const color = avatarColors[idx % avatarColors.length];
      const rowClass = idx % 2 === 1 ? ' d-hm-row-even' : '';
      const avatarHtml = dr.photo
        ? `<img src="${dr.photo}" alt="${dr.initials}" class="d-hm-avatar" style="object-fit:cover;">`
        : `<div class="d-hm-avatar" style="background:linear-gradient(135deg,${color},${color}dd);">${dr.initials}</div>`;
      html += `<div class="d-hm-driver${rowClass}" style="animation:dSlide .4s cubic-bezier(.16,1,.3,1) ${idx * 30}ms both;">${avatarHtml}<span>${dr.prenom}</span></div>`;
      dr.cells.forEach((cell, ci) => {
        const status = cell.status;
        const heures = cell.heures;
        const shiftId = cell.shiftId;
        const tooltip = `${dr.prenom} ${dr.nom} — ${days[ci].label} ${days[ci].dayNum}: ${statusLabels[status]}${heures ? ' (' + heures + ')' : ''}`;
        const content = status === 'programme' && heures ? `<span style="font-size:9px;font-weight:700;letter-spacing:-.2px;">${heures}</span>` : (statusIcons[status] || '');
        const onclick = shiftId ? `DashboardPage._openShift('${shiftId}')` : `Router.navigate('/planning')`;
        html += `<div class="d-hm-cell hm-${status}${rowClass}" title="${tooltip}" onclick="${onclick}" style="animation:dSlide .4s cubic-bezier(.16,1,.3,1) ${idx * 30 + ci * 15}ms both;">${content}</div>`;
      });
    });
    html += '</div>';

    // Legend — modern pills
    html += `<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;justify-content:center;">
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(16,185,129,.08);font-size:11px;font-weight:600;color:#10b981;"><span style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span> Versé</div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(99,102,241,.08);font-size:11px;font-weight:600;color:#6366f1;"><span style="width:6px;height:6px;border-radius:50%;background:#6366f1;"></span> Programmé</div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(239,68,68,.08);font-size:11px;font-weight:600;color:#ef4444;"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span> En retard</div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(249,115,22,.08);font-size:11px;font-weight:600;color:#f97316;"><span style="width:6px;height:6px;border-radius:50%;background:#f97316;"></span> Absent</div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(0,0,0,.03);font-size:11px;font-weight:600;color:#9ca3af;"><span style="width:6px;height:6px;border-radius:50%;background:#d1d5db;"></span> Repos</div>
    </div>`;

    return `<div class="d-card" style="padding:24px 20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(99,102,241,.25);">
            <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:18px;color:#fff;"></iconify-icon>
          </div>
          <div>
            <div style="font-size:15px;font-weight:800;color:#111827;letter-spacing:-.3px;">Planning semaine</div>
            <div style="font-size:11px;color:#9ca3af;font-weight:500;margin-top:1px;">${drivers.length} chauffeur${drivers.length > 1 ? 's' : ''} actif${drivers.length > 1 ? 's' : ''}</div>
          </div>
        </div>
        <a href="#/planning" style="font-size:11px;font-weight:600;color:#6366f1;text-decoration:none;">Voir tout →</a>
      </div>
      ${html}
    </div>`;
  },

  // =================== CHARTS ===================

  _loadCharts(d) {
    this._charts = [];

    // === Hero CA mini chart (Chart.js interactif) ===
    const heroCanvas = document.getElementById('hero-ca-chart');
    if (heroCanvas && typeof Chart !== 'undefined' && d.forecastChartData && d.forecastChartData.length > 1) {
      const ctx = heroCanvas.getContext('2d');
      heroCanvas.height = 60;

      // Gradient fill
      const gradient = ctx.createLinearGradient(0, 0, 0, 60);
      gradient.addColorStop(0, 'rgba(255,255,255,.25)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,.08)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      const labels = d.forecastChartData.map(m => m.label);
      const values = d.forecastChartData.map(m => m.value);
      const isForecast = d.forecastChartData.map(m => m.type === 'forecast');

      // Point colors: white for actual, dashed for forecast
      const pointBg = isForecast.map(f => f ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.9)');
      const pointBorder = isForecast.map(f => f ? 'rgba(255,255,255,.3)' : '#fff');

      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: values,
            fill: true,
            backgroundColor: gradient,
            borderColor: 'rgba(255,255,255,.7)',
            borderWidth: 2.5,
            pointRadius: values.map((_, i) => i === values.length - 1 ? 5 : 3),
            pointHoverRadius: 7,
            pointBackgroundColor: pointBg,
            pointBorderColor: pointBorder,
            pointBorderWidth: 2,
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            tension: 0.4,
            segment: {
              borderDash: (ctx) => isForecast[ctx.p1DataIndex] ? [5, 4] : undefined,
              borderColor: (ctx) => isForecast[ctx.p1DataIndex] ? 'rgba(255,255,255,.4)' : undefined
            }
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 1200,
            easing: 'easeOutQuart'
          },
          layout: { padding: { top: 4, bottom: 0, left: 0, right: 0 } },
          scales: {
            x: { display: false },
            y: { display: false, beginAtZero: true }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              backgroundColor: 'rgba(255,255,255,.95)',
              titleColor: '#374151',
              bodyColor: '#111827',
              titleFont: { size: 10, weight: '500' },
              bodyFont: { size: 13, weight: '700' },
              padding: { top: 6, bottom: 6, left: 10, right: 10 },
              cornerRadius: 10,
              borderColor: 'rgba(99,102,241,.15)',
              borderWidth: 1,
              displayColors: false,
              caretSize: 6,
              callbacks: {
                title: (items) => items[0].label,
                label: (item) => {
                  const val = item.raw;
                  const fc = isForecast[item.dataIndex] ? ' (prévision)' : '';
                  return Utils.formatCurrency(val) + fc;
                }
              }
            }
          },
          interaction: {
            mode: 'index',
            intersect: false
          },
          hover: {
            mode: 'index',
            intersect: false
          }
        }
      });
      this._charts.push(chart);
    }
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

  _openShift(shiftId) {
    const shift = Store.findById('planning', shiftId);
    if (!shift) { Router.navigate('/planning'); return; }
    const chauffeurs = (Store.get('chauffeurs') || []).filter(c => c.statut === 'actif');
    const chauffeur = chauffeurs.find(c => c.id === shift.chauffeurId);
    const nom = chauffeur ? `${chauffeur.prenom} ${chauffeur.nom}` : 'Chauffeur';

    const shiftPresets = { matin: ['06:00','14:00'], apres_midi: ['14:00','22:00'], journee: ['08:00','20:00'], nuit: ['22:00','06:00'] };
    const editValues = { ...shift };
    if (!editValues.heureDebut && editValues.typeCreneaux && shiftPresets[editValues.typeCreneaux]) {
      editValues.heureDebut = shiftPresets[editValues.typeCreneaux][0];
      editValues.heureFin = shiftPresets[editValues.typeCreneaux][1];
    }
    if (!editValues.heureDebut) {
      editValues.typeCreneaux = 'custom';
      editValues.heureDebut = '06:00';
      editValues.heureFin = '00:00';
    }

    const fields = [
      { type: 'row-start' },
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { type: 'row-end' },
      { name: 'typeCreneaux', label: 'Créneau type', type: 'select', required: false, options: [
        { value: 'custom', label: 'Personnalisé' },
        { value: 'matin', label: 'Matin (6h - 14h)' },
        { value: 'apres_midi', label: 'Après-midi (14h - 22h)' },
        { value: 'journee', label: 'Journée complète (8h - 20h)' },
        { value: 'nuit', label: 'Nuit (22h - 6h)' }
      ]},
      { type: 'row-start' },
      { name: 'heureDebut', label: 'Heure début', type: 'time', required: true },
      { name: 'heureFin', label: 'Heure fin', type: 'time', required: true },
      { type: 'row-end' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ];

    Modal.form(`<iconify-icon icon="solar:calendar-bold-duotone" class="text-blue"></iconify-icon> Créneau — ${nom}`, FormBuilder.build(fields, editValues), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      Store.update('planning', shiftId, values);
      Toast.success('Créneau modifié');
      Modal.close();
      this._silentRefresh();
    }, 'Enregistrer');

    // Bind typeCreneaux → auto-fill heures
    setTimeout(() => {
      const typeSelect = document.querySelector('[name="typeCreneaux"]');
      if (typeSelect) {
        typeSelect.addEventListener('change', () => {
          const preset = shiftPresets[typeSelect.value];
          if (preset) {
            const hd = document.querySelector('[name="heureDebut"]');
            const hf = document.querySelector('[name="heureFin"]');
            if (hd) hd.value = preset[0];
            if (hf) hf.value = preset[1];
          }
        });
      }
    }, 100);
  },

  _shareWhatsApp() {
    const d = this._lastData || this._getData();
    const today = new Date().toLocaleDateString('fr-FR');
    const text = [
      `📊 *PILOTE — Résumé du ${today}*`,
      '',
      `💰 CA du mois: ${Utils.formatCurrency(d.caThisMonth)}`,
      `✅ Versements reçus: ${Utils.formatCurrency(d.totalVerse)}`,
      `👥 Chauffeurs actifs: ${d.activeCount}/${d.totalChauffeurs}`,
      `🚗 Véhicules en service: ${d.vehiclesActifs}`,
      d.retardCount > 0 ? `⚠️ Versements en retard: ${d.retardCount}` : '',
      d.unpaidItems.length > 0 ? `🔴 Recettes impayées: ${d.unpaidItems.length} (${Utils.formatCurrency(d.totalUnpaid)})` : '',
      '',
      '📱 _Envoyé depuis Pilote_'
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
          'Authorization': 'Bearer ' + localStorage.getItem('pilote_token')
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
              'Authorization': 'Bearer ' + localStorage.getItem('pilote_token')
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
    Utils.exportCSV(headers, rows, `pilote-depenses-${new Date().toISOString().split('T')[0]}.csv`);
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
    doc.text('PILOTE', 14, 14);
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
    doc.text('G\u00e9n\u00e9r\u00e9 automatiquement par Pilote.', 14, y + 5);

    doc.save(`recu-${name.replace(/\s+/g, '-')}-${date}.pdf`);
    Toast.success('Re\u00e7u PDF g\u00e9n\u00e9r\u00e9');
  }
};
