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
    const hmToday = now.toISOString().split('T')[0];
    const hmSel = new Date(selectedDay);
    const hmDow = hmSel.getDay() || 7; // 1=Lun ... 7=Dim
    const hmMonday = new Date(hmSel);
    hmMonday.setDate(hmSel.getDate() - hmDow + 1);
    const dayLabels = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    const heatmapWeekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(hmMonday);
      d.setDate(hmMonday.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      heatmapWeekDays.push({ date: ds, label: dayLabels[i], dayNum: d.getDate(), isToday: ds === hmToday });
    }
    const activeDrivers = chauffeurs.filter(c => c.statut === 'actif').sort((a, b) => (a.prenom || '').localeCompare(b.prenom || ''));
    const heatmapDrivers = activeDrivers.map(c => {
      const cells = heatmapWeekDays.map(wd => {
        // Check absence
        const hasAbsence = absences.some(a => a.chauffeurId === c.id && wd.date >= a.dateDebut && wd.date <= a.dateFin);
        if (hasAbsence) return 'absent';
        // Check if planned
        const isPlanned = planning.some(p => p.chauffeurId === c.id && p.date === wd.date);
        if (!isPlanned) return 'repos';
        // Planned — check if future
        if (wd.date > hmToday) return 'programme';
        // Past or today — check versement
        const hasVersement = versements.some(v => v.chauffeurId === c.id && v.date === wd.date && (v.statut === 'valide' || v.statut === 'supprime'));
        return hasVersement ? 'verse' : 'en_retard';
      });
      return { id: c.id, prenom: c.prenom, nom: c.nom, initials: ((c.prenom||'')[0] + (c.nom||'')[0]).toUpperCase(), cells };
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
      serviceEnCours, serviceEnPause, serviceTermine, servicePasCommence,
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

    // Recent versements for table
    const recentRows = (d.recentVersements || []).slice(0, 5).map(v => {
      const ch = d.chauffeurs.find(c => c.id === v.chauffeurId);
      const name = ch ? `${ch.prenom} ${ch.nom}` : v.chauffeurId;
      const initials = ch ? ((ch.prenom||'')[0] + (ch.nom||'')[0]).toUpperCase() : '??';
      const statusColor = v.statut === 'valide' ? '#10b981' : v.statut === 'partiel' ? '#3b82f6' : '#f59e0b';
      const statusLabel = v.statut === 'valide' ? 'Validé' : v.statut === 'partiel' ? 'Partiel' : 'En attente';
      const hasDette = v.traitementManquant === 'dette';
      const hasPerte = v.traitementManquant === 'perte';
      return `<tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:12px 8px;"><div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:${statusColor}22;color:${statusColor};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${initials}</div>
          <div><div style="font-size:13px;font-weight:600;color:#111827;">${name}</div><div style="font-size:11px;color:#9ca3af;">${Utils.formatDate(v.date)}</div></div>
        </div></td>
        <td style="padding:12px 8px;text-align:right;"><div style="font-size:14px;font-weight:700;color:#111827;">${Utils.formatCurrency(v.montantVerse)}</div></td>
        <td style="padding:12px 8px;text-align:right;"><span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${hasDette ? '#d97706' : hasPerte ? '#ef4444' : statusColor};"><span style="width:6px;height:6px;border-radius:50%;background:${hasDette ? '#d97706' : hasPerte ? '#ef4444' : statusColor};"></span>${hasDette ? 'Dette' : hasPerte ? 'Perte' : statusLabel}</span></td>
      </tr>`;
    }).join('');

    // Chauffeur rows for "Top Chauffeurs" panel (like Top Countries)
    const avatarColors = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
    const chauffeurRows = d.chauffeurs
      .filter(c => c.statut === 'actif')
      .slice(0, 4)
      .map((c, i) => {
        const color = avatarColors[i % avatarColors.length];
        const redev = c.redevanceQuotidienne || 0;
        const pct = d.totalAttendu > 0 && redev > 0 ? Math.min(Math.round(redev / d.totalAttendu * d.chauffeurs.filter(x => x.statut === 'actif').length * 100), 100) : 0;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;${i < 3 ? 'border-bottom:1px solid #f3f4f6;' : ''}">
          <div style="width:30px;height:30px;border-radius:50%;background:${color}18;color:${color};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${((c.prenom||'')[0]+(c.nom||'')[0]).toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.prenom} ${c.nom}</div>
            <div class="d-bar-track" style="height:4px;margin-top:4px;"><div class="d-bar-fill" style="width:${pct}%;background:${color};"></div></div>
          </div>
          <div style="font-size:12px;font-weight:700;color:#374151;">${Utils.formatCurrency(redev)}</div>
        </div>`;
      }).join('');

    return `
      <style>
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes dSlide { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        #live-indicator.pulse { animation:flash-indicator 1.5s }
        @keyframes flash-indicator { 0%{background:rgba(99,102,241,.3)} 100%{background:rgba(99,102,241,.08)} }

        .sc-wrap { animation: dSlide .5s cubic-bezier(.16,1,.3,1); }
        .sc-bg {
          background: #f5f5f7;
          margin: -24px -28px;
          padding: 28px 32px 40px;
          min-height: 100vh;
        }
        [data-theme="dark"] .sc-bg { background: #111113; }

        .sc-grid { display:grid; gap:20px; margin-bottom:20px; }

        .sc-card {
          background: #fff;
          border-radius: 16px;
          padding: 22px 24px;
          border: 1px solid #f0f0f0;
          box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.02);
          transition: box-shadow .2s ease;
          position: relative;
          overflow: hidden;
        }
        [data-theme="dark"] .sc-card {
          background: #1c1c1e;
          border-color: #2c2c2e;
          box-shadow: 0 1px 3px rgba(0,0,0,.3);
        }
        .sc-card:hover { box-shadow:0 2px 12px rgba(0,0,0,.08); }
        [data-theme="dark"] .sc-card:hover { box-shadow:0 2px 12px rgba(0,0,0,.4); }

        .sc-card-title {
          display:flex; align-items:center; gap:8px;
          font-size:15px; font-weight:700; color:#111827;
          margin-bottom:16px;
        }
        .sc-card-title iconify-icon { font-size:18px; color:#6b7280; }
        [data-theme="dark"] .sc-card-title { color:#f9fafb; }

        /* Mini KPI cards inside hero */
        .sc-mini-kpi {
          background: #f9fafb;
          border-radius: 14px;
          padding: 16px 18px;
          border: 1px solid #f0f0f0;
          flex: 1;
          position: relative;
        }
        [data-theme="dark"] .sc-mini-kpi { background:#2c2c2e; border-color:#3c3c3e; }
        .sc-mini-kpi-title { font-size:11px; font-weight:500; color:#9ca3af; margin-bottom:8px; }
        .sc-mini-kpi-val { font-size:20px; font-weight:800; color:#111827; font-feature-settings:'tnum'; }
        [data-theme="dark"] .sc-mini-kpi-val { color:#f9fafb; }

        /* Tag styles */
        .d-tag { display:inline-flex; align-items:center; gap:3px; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; }
        .d-tag.green { background:rgba(16,185,129,.08); color:#10b981; }
        .d-tag.red { background:rgba(239,68,68,.08); color:#ef4444; }
        .d-tag.orange { background:rgba(249,115,22,.08); color:#f97316; }
        .d-tag.purple { background:rgba(99,102,241,.08); color:#6366f1; }

        /* Bar fills */
        .d-bar-track { height:6px; border-radius:6px; background:#f3f4f6; overflow:hidden; }
        [data-theme="dark"] .d-bar-track { background:#2c2c2e; }
        .d-bar-fill { height:100%; border-radius:6px; transition:width .6s cubic-bezier(.16,1,.3,1); }

        /* Legend */
        .d-legend { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#4b5563; }
        .d-legend-dot { width:8px; height:8px; border-radius:50%; }
        [data-theme="dark"] .d-legend { color:#d1d5db; }

        /* Heatmap */
        .d-hm-grid { display:grid; grid-template-columns:100px repeat(7,1fr); gap:3px; align-items:center; }
        .d-hm-head { text-align:center; font-size:10px; font-weight:700; color:#9ca3af; padding:4px 0; text-transform:uppercase; }
        .d-hm-head.today { background:#6366f1; color:#fff; border-radius:8px; }
        .d-hm-driver { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:#374151; padding:2px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        [data-theme="dark"] .d-hm-driver { color:#d1d5db; }
        .d-hm-avatar { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:700; color:#fff; flex-shrink:0; }
        .d-hm-cell { height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer; transition:all .12s ease; }
        .d-hm-cell:hover { transform:scale(1.1); box-shadow:0 2px 8px rgba(0,0,0,.12); }
        .hm-verse { background:rgba(16,185,129,.18); color:#10b981; }
        .hm-programme { background:rgba(99,102,241,.15); color:#6366f1; }
        .hm-en_retard { background:rgba(239,68,68,.18); color:#ef4444; }
        .hm-absent { background:rgba(249,115,22,.15); color:#f97316; }
        .hm-repos { background:#f9fafb; color:#d1d5db; }
        [data-theme="dark"] .hm-repos { background:#2c2c2e; color:#4b5563; }

        /* Header tabs */
        .sc-tabs { display:flex; align-items:center; gap:0; background:#fff; border-radius:12px; padding:3px; border:1px solid #f0f0f0; }
        .sc-tab { font-size:12px; padding:7px 16px; border-radius:9px; border:none; background:transparent; color:#6b7280; font-weight:600; cursor:pointer; transition:all .15s; }
        .sc-tab.active { background:#111827; color:#fff; }
        [data-theme="dark"] .sc-tabs { background:#1c1c1e; border-color:#2c2c2e; }
        [data-theme="dark"] .sc-tab.active { background:#f9fafb; color:#111827; }

        /* Table */
        .sc-table { width:100%; border-collapse:collapse; }
        .sc-table th { font-size:11px; font-weight:600; color:#9ca3af; text-transform:uppercase; letter-spacing:.5px; padding:8px; text-align:left; border-bottom:1px solid #f3f4f6; }
        .sc-table th:last-child { text-align:right; }
        [data-theme="dark"] .sc-table th { border-color:#2c2c2e; }
        [data-theme="dark"] .sc-table tr { border-color:#2c2c2e !important; }

        @media(max-width:1100px) {
          .sc-row1 { grid-template-columns:1fr !important; }
          .sc-row2 { grid-template-columns:1fr !important; }
        }
        @media(max-width:600px) {
          .sc-bg { margin:-16px; padding:16px 14px 24px; }
          .sc-mini-kpis { flex-direction:column !important; }
          .d-hm-grid { grid-template-columns:36px repeat(7,1fr); gap:2px; }
          .d-hm-driver span { display:none; }
          .d-hm-cell { height:22px; font-size:9px; }
        }
      </style>

      <div class="sc-wrap">
      <div class="sc-bg">

      <!-- Header bar (SellCraft style) -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="font-size:20px;font-weight:800;color:#111827;letter-spacing:-.4px;">Pilote</div>
          <div class="sc-tabs">
            <button class="sc-tab active">Overview</button>
            <button class="sc-tab" onclick="DashboardPage._toggleMonthView()">${this._monthView ? '📅 Mois' : '📅 Jour'}</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="date" id="dashboard-period" value="${this._selectedPeriod || new Date().toISOString().split('T')[0]}" max="${new Date().toISOString().split('T')[0]}" style="font-size:12px;padding:7px 12px;border-radius:10px;background:#fff;border:1px solid #f0f0f0;color:#374151;font-weight:500;outline:none;">
          ${this._selectedPeriod || this._monthView ? '<button onclick="DashboardPage._resetToToday()" style="font-size:12px;padding:7px 12px;border-radius:10px;background:#fff;border:1px solid #f0f0f0;cursor:pointer;color:#6b7280;font-weight:600;">Aujourd\'hui</button>' : ''}
          ${this._isToday() ? '<span id="live-indicator" style="display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#10b981;background:rgba(16,185,129,.08);padding:5px 14px;border-radius:20px;font-weight:700;"><span style="width:6px;height:6px;border-radius:50%;background:#10b981;animation:pulse-dot 2s infinite;"></span>LIVE</span>' : `<span style="font-size:12px;color:#9ca3af;font-weight:500;">${d.periodLabel}</span>`}
          <div style="position:relative;">
            <iconify-icon icon="solar:magnifer-bold" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:#9ca3af;pointer-events:none;"></iconify-icon>
            <input type="text" id="dashboard-search" placeholder="Rechercher..." style="padding:7px 12px 7px 30px;font-size:12px;width:150px;border-radius:10px;background:#fff;border:1px solid #f0f0f0;color:#374151;outline:none;font-weight:500;" oninput="DashboardPage._filterByDriver(this.value)">
          </div>
        </div>
      </div>

      <!-- ROW 1: Hero CA (big) | Heatmap Planning | Top Chauffeurs — 3 columns like SellCraft -->
      <div class="sc-grid sc-row1" style="grid-template-columns:1.8fr 1.5fr 1fr;">

        <!-- LEFT: CA hero + 3 mini KPIs (like Total Sales card) -->
        <div style="display:flex;flex-direction:column;gap:12px;">
          <a href="#/versements" class="sc-card" style="text-decoration:none;color:inherit;flex:1;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div class="sc-card-title" style="margin-bottom:8px;">
                <iconify-icon icon="solar:graph-new-up-bold-duotone"></iconify-icon> Chiffre d'affaires
              </div>
              <span class="d-tag ${d.caTrend >= 0 ? 'green' : 'red'}">
                ${caTrendSign}${Math.abs(Math.round(d.caTrend))}%
              </span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
              <div>
                <div style="font-size:36px;font-weight:800;color:#111827;letter-spacing:-1px;font-feature-settings:'tnum';">${Utils.formatCurrency(d.caThisMonth)}</div>
                <div style="font-size:12px;color:#10b981;font-weight:600;margin-top:4px;">${caTrendSign}${Math.abs(Math.round(d.caTrend))}% • ${Utils.formatCurrency(d.caMoyenJour)} / jour</div>
              </div>
              <div>${sparkline(last6Rev, '#111827', 130, 48)}</div>
            </div>
          </a>
          <!-- 3 mini KPI cards row (like Total Orders / Cancel Orders / Total Visitors) -->
          <div class="sc-mini-kpis" style="display:flex;gap:10px;">
            <a href="#/versements" class="sc-mini-kpi" style="text-decoration:none;color:inherit;">
              <div class="sc-mini-kpi-title">Versements</div>
              <div class="sc-mini-kpi-val">${d.nbVersementsPeriode}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
                <span class="d-tag ${d.retardCount > 0 ? 'red' : 'green'}" style="font-size:10px;padding:2px 8px;">${d.retardCount > 0 ? '-' : '+'}${d.retardCount} retard</span>
              </div>
            </a>
            <div class="sc-mini-kpi" style="${d.totalDettes > 0 ? 'border-color:rgba(239,68,68,.2);' : ''}">
              <div class="sc-mini-kpi-title">Dettes</div>
              <div class="sc-mini-kpi-val" style="color:${d.totalDettes > 0 ? '#ef4444' : '#111827'};">${Utils.formatCurrency(d.totalDettes)}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
                <span class="d-tag ${d.totalDettes > 0 ? 'red' : 'green'}" style="font-size:10px;padding:2px 8px;">${d.nbDetteDrivers} chauffeur${d.nbDetteDrivers !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div class="sc-mini-kpi" style="${d.totalPertes > 0 ? 'border-color:rgba(249,115,22,.2);' : ''}">
              <div class="sc-mini-kpi-title">Pertes</div>
              <div class="sc-mini-kpi-val" style="color:${d.totalPertes > 0 ? '#f97316' : '#111827'};">${Utils.formatCurrency(d.totalPertes)}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
                <span class="d-tag ${d.totalPertes > 0 ? 'orange' : 'green'}" style="font-size:10px;padding:2px 8px;">${d.nbPerteDrivers} chauffeur${d.nbPerteDrivers !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- CENTER: Planning Heatmap (like Sales Heatmap) -->
        ${this._renderPlanningHeatmap(d)}

        <!-- RIGHT: Top Chauffeurs (like Top Countries By Order) -->
        <div class="sc-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <div class="sc-card-title" style="margin-bottom:0;">
              <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon> Chauffeurs
            </div>
            <span class="d-tag green">${d.activeCount} actif${d.activeCount !== 1 ? 's' : ''}</span>
          </div>
          <div style="font-size:11px;color:#9ca3af;margin-bottom:14px;">${d.totalChauffeurs} au total</div>
          ${chauffeurRows}
          <div style="margin-top:14px;display:flex;gap:8px;">
            <a href="#/chauffeurs" style="font-size:11px;font-weight:600;color:#6366f1;text-decoration:none;">Voir tout →</a>
          </div>
        </div>
      </div>

      <!-- ROW 2: Versements table | Analyses chart — 2 columns like SellCraft -->
      <div class="sc-grid sc-row2" style="grid-template-columns:1.2fr 1fr;">

        <!-- LEFT: Recent versements table (like Top Selling Product) -->
        <a href="#/versements" class="sc-card" style="text-decoration:none;color:inherit;">
          <div class="sc-card-title">
            <iconify-icon icon="solar:card-send-bold-duotone"></iconify-icon> Derniers versements
          </div>
          <table class="sc-table">
            <thead><tr><th>Chauffeur</th><th style="text-align:right;">Montant</th><th style="text-align:right;">Statut</th></tr></thead>
            <tbody>${recentRows || '<tr><td colspan="3" style="text-align:center;padding:20px;color:#9ca3af;font-size:13px;">Aucun versement récent</td></tr>'}</tbody>
          </table>
        </a>

        <!-- RIGHT: Analyses chart (like Analyses multi-line) -->
        <div class="sc-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <div class="sc-card-title" style="margin-bottom:0;">
              <iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Analyses
            </div>
            <span class="d-tag ${d.tendancePctMois >= 0 ? 'green' : 'red'}">
              <iconify-icon icon="${d.tendancePctMois >= 0 ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold'}" style="font-size:10px;"></iconify-icon>
              ${d.tendancePctMois >= 0 ? '+' : ''}${d.tendancePctMois}%
            </span>
          </div>
          <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
            <div class="d-legend"><span class="d-legend-dot" style="background:#6366f1;"></span> CA réel</div>
            <div class="d-legend"><span class="d-legend-dot" style="background:#a855f7;"></span> Prévision</div>
          </div>
          <div style="height:220px;">
            <canvas id="chart-forecast"></canvas>
          </div>
        </div>
      </div>

      <!-- ROW 3: Service du jour + Objectif + Recouvrement + Flotte — 4 mini cards -->
      <div class="sc-grid" style="grid-template-columns:repeat(4,1fr);">
        <!-- Service du jour -->
        <a href="#/planning" class="sc-card" style="text-decoration:none;color:inherit;">
          <div class="sc-card-title"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> Service</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            <div style="display:flex;align-items:center;gap:4px;padding:5px 8px;border-radius:8px;background:rgba(16,185,129,.06);">
              <span style="width:5px;height:5px;border-radius:50%;background:#10b981;"></span>
              <span style="font-size:10px;color:#6b7280;">Actifs</span>
              <strong style="margin-left:auto;font-size:12px;color:#111827;">${d.serviceEnCours}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:4px;padding:5px 8px;border-radius:8px;background:rgba(249,115,22,.06);">
              <span style="width:5px;height:5px;border-radius:50%;background:#f97316;"></span>
              <span style="font-size:10px;color:#6b7280;">Pause</span>
              <strong style="margin-left:auto;font-size:12px;color:#111827;">${d.serviceEnPause}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:4px;padding:5px 8px;border-radius:8px;background:rgba(107,114,128,.06);">
              <span style="width:5px;height:5px;border-radius:50%;background:#6b7280;"></span>
              <span style="font-size:10px;color:#6b7280;">Finis</span>
              <strong style="margin-left:auto;font-size:12px;color:#111827;">${d.serviceTermine}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:4px;padding:5px 8px;border-radius:8px;background:rgba(209,213,219,.08);">
              <span style="width:5px;height:5px;border-radius:50%;background:#d1d5db;"></span>
              <span style="font-size:10px;color:#6b7280;">Attente</span>
              <strong style="margin-left:auto;font-size:12px;color:#111827;">${d.servicePasCommence}</strong>
            </div>
          </div>
        </a>

        <!-- Objectif -->
        <div class="sc-card" style="text-align:center;">
          <div class="sc-card-title" style="justify-content:center;"><iconify-icon icon="solar:target-bold-duotone"></iconify-icon> Objectif</div>
          <div style="position:relative;display:flex;align-items:center;justify-content:center;">
            ${gauge(d.progressionObjectif, progressColor, 72, 6)}
            <div style="position:absolute;font-size:16px;font-weight:800;color:${progressColor};">${d.progressionObjectif}%</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:#111827;margin-top:6px;">${Utils.formatCurrency(d.objectifMensuel)}</div>
          <div style="font-size:11px;color:#9ca3af;">${d.joursRestants}j restants</div>
        </div>

        <!-- Recouvrement -->
        <div class="sc-card" style="text-align:center;">
          <div class="sc-card-title" style="justify-content:center;"><iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon> Recouvrement</div>
          <div style="position:relative;display:flex;align-items:center;justify-content:center;">
            ${gauge(d.tauxRecouvrement, recouvrementColor, 72, 6)}
            <div style="position:absolute;font-size:16px;font-weight:800;color:${recouvrementColor};">${d.tauxRecouvrement}%</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:#111827;margin-top:6px;">${Utils.formatCurrency(d.totalVerse)}</div>
          <div style="font-size:11px;color:#9ca3af;">/ ${Utils.formatCurrency(d.totalAttendu)}</div>
        </div>

        <!-- Flotte -->
        <a href="#/vehicules" class="sc-card" style="text-decoration:none;color:inherit;">
          <div class="sc-card-title"><iconify-icon icon="solar:bus-bold-duotone"></iconify-icon> Flotte</div>
          <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:8px;">
            <span style="font-size:28px;font-weight:800;color:#111827;">${d.vehiclesActifs}</span>
            <span style="font-size:14px;color:#9ca3af;font-weight:600;">/ ${d.vehiculesTotal}</span>
          </div>
          <div style="display:flex;gap:6px;">
            <span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;background:#f3f4f6;color:#374151;">⚡ ${d.vehiclesEV} EV</span>
            <span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;background:#f3f4f6;color:#374151;">⛽ ${d.vehiclesThermique}</span>
          </div>
        </a>
      </div>

      <!-- ROW 4: Alertes + Maintenance -->
      <div class="sc-grid" style="grid-template-columns:1fr 1fr;">
        <!-- Alertes -->
        <a href="#/alertes" class="sc-card" style="text-decoration:none;color:inherit;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="sc-card-title" style="margin-bottom:0;">
              <iconify-icon icon="${d.alertesTotal > 0 ? 'solar:bell-bing-bold-duotone' : 'solar:check-circle-bold-duotone'}" style="color:${d.alertesTotal > 0 ? '#ef4444' : '#10b981'};"></iconify-icon> Alertes
            </div>
            <span class="d-tag ${d.alertesTotal > 0 ? 'red' : 'green'}">${d.alertesTotal > 0 ? d.alertesTotal + ' alerte' + (d.alertesTotal > 1 ? 's' : '') : 'Tout OK'}</span>
          </div>
          ${d.alertesCritiques > 0 ? `<div style="display:flex;gap:8px;margin-top:10px;">
            <span class="d-tag red">${d.alertesCritiques} critique${d.alertesCritiques > 1 ? 's' : ''}</span>
            ${d.alertesUrgentes > 0 ? `<span class="d-tag orange">${d.alertesUrgentes} urgent${d.alertesUrgentes > 1 ? 's' : ''}</span>` : ''}
          </div>` : ''}
        </a>

        <!-- Maintenance -->
        ${this._renderMaintenancePanel(d)}
      </div>

      </div>
      </div>
    `;
  },

  _renderMaintenancePanel(d) {
    const typeLabels = { vidange:'Vidange', revision:'Révision', pneus:'Pneus', freins:'Freins', filtres:'Filtres', climatisation:'Clim.', courroie:'Courroie', controle_technique:'CT', batterie:'Batterie', amortisseurs:'Amort.', echappement:'Échap.', carrosserie:'Carrosserie', autre:'Autre' };
    const alerts = d.maintenanceAlerts || [];

    if (alerts.length === 0) {
      return `<div class="sc-card" style="display:flex;align-items:center;gap:14px;">
        <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:18px;color:#10b981;"></iconify-icon>
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

    return `<div class="sc-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div class="sc-card-title" style="margin-bottom:0;">
          <iconify-icon icon="solar:settings-bold-duotone" style="color:#f97316;"></iconify-icon> Maintenance
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
      return `<div class="sc-card" style="display:flex;align-items:center;gap:14px;">
        <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:18px;color:#6b7280;"></iconify-icon>
        <div>
          <div style="font-size:14px;font-weight:700;color:#111827;">Planning semaine</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Aucun chauffeur actif</div>
        </div>
      </div>`;
    }

    const statusIcons = {
      verse: '<iconify-icon icon="solar:check-circle-bold" style="font-size:14px;"></iconify-icon>',
      programme: '<iconify-icon icon="solar:clock-circle-bold" style="font-size:14px;"></iconify-icon>',
      en_retard: '<iconify-icon icon="solar:danger-triangle-bold" style="font-size:14px;"></iconify-icon>',
      absent: '<iconify-icon icon="solar:minus-circle-bold" style="font-size:14px;"></iconify-icon>',
      repos: ''
    };
    const statusLabels = { verse: 'Versé', programme: 'Programmé', en_retard: 'En retard', absent: 'Absent', repos: 'Repos' };
    const avatarColors = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'];

    // Header row
    let html = '<div class="d-hm-grid">';
    html += '<div></div>'; // empty top-left
    days.forEach(wd => {
      html += `<div class="d-hm-head ${wd.isToday ? 'today' : ''}">${wd.label}<br><span class="d-hm-daynum">${wd.dayNum}</span></div>`;
    });

    // Driver rows
    drivers.forEach((dr, idx) => {
      const color = avatarColors[idx % avatarColors.length];
      html += `<div class="d-hm-driver"><div class="d-hm-avatar" style="background:${color};">${dr.initials}</div><span>${dr.prenom}</span></div>`;
      dr.cells.forEach((status, ci) => {
        const tooltip = `${dr.prenom} ${dr.nom} — ${days[ci].label} ${days[ci].dayNum}: ${statusLabels[status]}`;
        html += `<div class="d-hm-cell hm-${status}" title="${tooltip}" onclick="Router.navigate('/chauffeurs/${dr.id}')">${statusIcons[status]}</div>`;
      });
    });
    html += '</div>';

    // Legend
    html += `<div style="display:flex;gap:14px;margin-top:14px;flex-wrap:wrap;">
      <div class="d-legend"><span class="d-legend-dot" style="background:#10b981;"></span> Versé</div>
      <div class="d-legend"><span class="d-legend-dot" style="background:#6366f1;"></span> Programmé</div>
      <div class="d-legend"><span class="d-legend-dot" style="background:#ef4444;"></span> En retard</div>
      <div class="d-legend"><span class="d-legend-dot" style="background:#f97316;"></span> Absent</div>
      <div class="d-legend"><span class="d-legend-dot" style="background:#e5e7eb;"></span> Repos</div>
    </div>`;

    return `<div class="sc-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div class="sc-card-title" style="margin-bottom:0;">
          <iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Planning semaine
        </div>
        <a href="#/planning" style="font-size:11px;font-weight:600;color:#6366f1;text-decoration:none;">Voir tout →</a>
      </div>
      ${html}
    </div>`;
  },

  // =================== CHARTS ===================

  _loadCharts(d) {
    this._charts = [];

    // ======= Forecast chart (line + projected bar) =======
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
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              fill: true,
              borderWidth: 2.5,
              pointBackgroundColor: '#6366f1',
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
