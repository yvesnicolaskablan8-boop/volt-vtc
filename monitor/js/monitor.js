/**
 * Pilote Monitor — Dashboard KPI temps réel pour admins
 * Single IIFE: Auth + Data + UI + Init
 */
(function() {
  'use strict';

  const TOKEN_KEY = 'pilote_monitor_token';
  const SESSION_KEY = 'pilote_monitor_session';
  const REFRESH_MS = 30000; // 30 secondes

  // =================== STATE ===================

  let _selectedDate = null; // null = aujourd'hui

  function getSelectedDate() {
    return _selectedDate || new Date().toISOString().split('T')[0];
  }

  function isToday() {
    return !_selectedDate || _selectedDate === new Date().toISOString().split('T')[0];
  }

  // =================== AUTH ===================

  const Auth = {
    getToken()  { return localStorage.getItem(TOKEN_KEY); },
    setToken(t) { localStorage.setItem(TOKEN_KEY, t); },
    getSession() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch(e) { return null; }
    },
    setSession(user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        prenom: user.prenom, nom: user.nom, role: user.role
      }));
    },
    isLoggedIn() { return !!this.getToken(); },
    logout() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SESSION_KEY);
    },

    async login(email, password) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success || data.token) {
          this.setToken(data.token);
          if (data.user) this.setSession(data.user);
          return { success: true };
        }
        return { success: false, error: data.message || data.error || 'Identifiants incorrects' };
      } catch (e) {
        return { success: false, error: 'Erreur de connexion au serveur' };
      }
    }
  };

  // =================== DATA ===================

  const Data = {
    _raw: null,
    _kpis: null,

    async fetch() {
      try {
        const res = await fetch('/api/data', {
          headers: { 'Authorization': 'Bearer ' + Auth.getToken() }
        });
        if (res.status === 401) {
          Auth.logout();
          UI.showLogin();
          return null;
        }
        if (!res.ok) return null;
        this._raw = await res.json();
        this._kpis = this.computeKPIs(this._raw, getSelectedDate());
        return this._kpis;
      } catch (e) {
        console.warn('[Monitor] Fetch error:', e.message);
        return null;
      }
    },

    recompute() {
      if (!this._raw) return null;
      this._kpis = this.computeKPIs(this._raw, getSelectedDate());
      return this._kpis;
    },

    computeKPIs(data, selectedDay) {
      const chauffeurs = data.chauffeurs || [];
      const vehicules  = data.vehicules  || [];
      const versements = data.versements || [];
      const planning   = data.planning   || [];
      const absences   = data.absences   || [];
      const depenses   = data.depenses   || [];

      const now = new Date();
      const sel = new Date(selectedDay);
      const thisMonth = sel.getMonth();
      const thisYear  = sel.getFullYear();

      // ——— 1. Recette versée du jour sélectionné ———
      const dayVersements = versements.filter(v =>
        v.date && v.date.startsWith(selectedDay) && v.statut !== 'supprime'
      );
      const recetteJour = dayVersements.reduce((s, v) => s + (v.montantVerse || 0), 0);
      const nbVersementsJour = dayVersements.filter(v => v.montantVerse > 0).length;

      // ——— 2. Chauffeurs programmés le jour sélectionné ———
      const dayPlanning = planning.filter(p => p.date === selectedDay);
      const programmesSet = new Set(dayPlanning.map(p => p.chauffeurId));
      const programmesCount = programmesSet.size;

      // ——— 3. Recette attendue du jour sélectionné ———
      let recetteAttendue = 0;
      const seenCh = new Set();
      dayPlanning.forEach(p => {
        if (seenCh.has(p.chauffeurId)) return;
        seenCh.add(p.chauffeurId);
        const hasAbsence = absences.some(a =>
          a.chauffeurId === p.chauffeurId && selectedDay >= a.dateDebut && selectedDay <= a.dateFin
        );
        if (hasAbsence) return;
        const ch = chauffeurs.find(c => c.id === p.chauffeurId);
        if (!ch || ch.statut === 'inactif') return;
        recetteAttendue += (ch.redevanceQuotidienne || 0);
      });

      // ——— 4. Taux de recouvrement (du mois de la date sélectionnée) ———
      const todayStr = now.toISOString().split('T')[0];
      const maxDate = selectedDay <= todayStr ? selectedDay : todayStr;
      const minDate = new Date(thisYear, thisMonth, 1).toISOString().split('T')[0];
      const scheduledDays = new Map();
      planning.filter(p => p.date <= maxDate && p.date >= minDate).forEach(p => {
        const key = p.chauffeurId + '|' + p.date;
        if (!scheduledDays.has(key)) scheduledDays.set(key, p);
      });

      const unpaidItems = [];
      scheduledDays.forEach(p => {
        const hasAbsence = absences.some(a =>
          a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin
        );
        if (hasAbsence) return;
        const ch = chauffeurs.find(c => c.id === p.chauffeurId);
        if (!ch || ch.statut === 'inactif') return;
        const redevance = ch.redevanceQuotidienne || 0;
        if (redevance <= 0) return;
        const hasValid = versements.some(v =>
          v.chauffeurId === p.chauffeurId && v.date === p.date &&
          (v.statut === 'valide' || v.statut === 'supprime')
        );
        if (!hasValid) {
          const joursRetard = Math.floor((now - new Date(p.date)) / 86400000);
          let tauxPenalite = 0;
          if (joursRetard > 7) tauxPenalite = 0.15;
          else if (joursRetard > 4) tauxPenalite = 0.10;
          else if (joursRetard > 2) tauxPenalite = 0.05;
          unpaidItems.push({
            montantDu: redevance,
            penalite: Math.round(redevance * tauxPenalite),
            joursRetard
          });
        }
      });

      const totalUnpaid = unpaidItems.reduce((s, i) => s + i.montantDu, 0);
      const totalPenalites = unpaidItems.reduce((s, i) => s + i.penalite, 0);
      const retardCount = unpaidItems.length;

      const monthVersements = versements.filter(v => {
        if (!v.date || v.statut === 'supprime') return false;
        const d = new Date(v.date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      });
      const totalVerseMois = monthVersements.reduce((s, v) => s + (v.montantVerse || 0), 0);
      const totalAttendu = totalUnpaid + totalVerseMois;
      const tauxRecouvrement = totalAttendu > 0 ? Math.round((totalVerseMois / totalAttendu) * 100) : 100;

      // ——— 5. Dette totale ———
      const totalDettes = versements
        .filter(v => v.traitementManquant === 'dette' && v.manquant > 0)
        .reduce((s, v) => s + v.manquant, 0);
      const nbDetteDrivers = new Set(
        versements.filter(v => v.traitementManquant === 'dette' && v.manquant > 0).map(v => v.chauffeurId)
      ).size;

      // ——— 6. Pertes totales ———
      const totalPertes = versements
        .filter(v => v.traitementManquant === 'perte' && v.manquant > 0)
        .reduce((s, v) => s + v.manquant, 0);
      const nbPerteDrivers = new Set(
        versements.filter(v => v.traitementManquant === 'perte' && v.manquant > 0).map(v => v.chauffeurId)
      ).size;

      // ——— 7. Chauffeurs actifs ———
      const totalChauffeurs = chauffeurs.length;
      const activeCount = chauffeurs.filter(c => c.statut === 'actif').length;

      // ——— 8. Véhicules en service ———
      const totalVehicules = vehicules.length;
      const vehiculesService = vehicules.filter(v => v.statut === 'en_service').length;

      // ——— 9. CA du mois ———
      const caMois = totalVerseMois;

      // ——— Label date ———
      const monthNames = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
      const dateLabel = selectedDay === todayStr
        ? "Aujourd'hui"
        : new Date(selectedDay + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      const monthLabel = monthNames[thisMonth] + ' ' + thisYear;

      // ——— Detail lists for clickable KPIs ———
      const chMap = {};
      chauffeurs.forEach(c => { chMap[c.id] = c; });

      // Recette du jour — detail per driver
      const recetteJourDetail = [];
      const recByDriver = {};
      dayVersements.filter(v => v.montantVerse > 0).forEach(v => {
        if (!recByDriver[v.chauffeurId]) recByDriver[v.chauffeurId] = { total: 0, count: 0 };
        recByDriver[v.chauffeurId].total += v.montantVerse;
        recByDriver[v.chauffeurId].count++;
      });
      Object.keys(recByDriver).forEach(cid => {
        const ch = chMap[cid];
        recetteJourDetail.push({
          nom: ch ? (ch.prenom + ' ' + ch.nom) : cid,
          montant: recByDriver[cid].total,
          count: recByDriver[cid].count
        });
      });
      recetteJourDetail.sort((a, b) => b.montant - a.montant);

      // Recette attendue — detail per scheduled driver
      const attendueDetail = [];
      const seenAtt = new Set();
      dayPlanning.forEach(p => {
        if (seenAtt.has(p.chauffeurId)) return;
        seenAtt.add(p.chauffeurId);
        const hasAbs = absences.some(a => a.chauffeurId === p.chauffeurId && selectedDay >= a.dateDebut && selectedDay <= a.dateFin);
        const ch = chMap[p.chauffeurId];
        if (!ch || ch.statut === 'inactif') return;
        const red = ch.redevanceQuotidienne || 0;
        const paid = dayVersements.some(v => v.chauffeurId === p.chauffeurId && v.montantVerse > 0);
        attendueDetail.push({
          nom: ch.prenom + ' ' + ch.nom,
          redevance: red,
          absent: hasAbs,
          paid: paid
        });
      });
      attendueDetail.sort((a, b) => b.redevance - a.redevance);

      // Unpaid items enriched with driver name
      const unpaidDetail = [];
      scheduledDays.forEach(p => {
        const hasAbs = absences.some(a => a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin);
        if (hasAbs) return;
        const ch = chMap[p.chauffeurId];
        if (!ch || ch.statut === 'inactif') return;
        const redevance = ch.redevanceQuotidienne || 0;
        if (redevance <= 0) return;
        const hasValid = versements.some(v => v.chauffeurId === p.chauffeurId && v.date === p.date && (v.statut === 'valide' || v.statut === 'supprime'));
        if (!hasValid) {
          const jr = Math.floor((now - new Date(p.date)) / 86400000);
          unpaidDetail.push({
            nom: ch.prenom + ' ' + ch.nom,
            date: p.date,
            montant: redevance,
            joursRetard: jr
          });
        }
      });
      unpaidDetail.sort((a, b) => b.joursRetard - a.joursRetard);

      // Dettes detail per driver
      const detteDetail = [];
      const detteByDriver = {};
      versements.filter(v => v.traitementManquant === 'dette' && v.manquant > 0).forEach(v => {
        if (!detteByDriver[v.chauffeurId]) detteByDriver[v.chauffeurId] = { total: 0, count: 0 };
        detteByDriver[v.chauffeurId].total += v.manquant;
        detteByDriver[v.chauffeurId].count++;
      });
      Object.keys(detteByDriver).forEach(cid => {
        const ch = chMap[cid];
        detteDetail.push({
          nom: ch ? (ch.prenom + ' ' + ch.nom) : cid,
          montant: detteByDriver[cid].total,
          count: detteByDriver[cid].count
        });
      });
      detteDetail.sort((a, b) => b.montant - a.montant);

      // Pertes detail per driver
      const perteDetail = [];
      const perteByDriver = {};
      versements.filter(v => v.traitementManquant === 'perte' && v.manquant > 0).forEach(v => {
        if (!perteByDriver[v.chauffeurId]) perteByDriver[v.chauffeurId] = { total: 0, count: 0 };
        perteByDriver[v.chauffeurId].total += v.manquant;
        perteByDriver[v.chauffeurId].count++;
      });
      Object.keys(perteByDriver).forEach(cid => {
        const ch = chMap[cid];
        perteDetail.push({
          nom: ch ? (ch.prenom + ' ' + ch.nom) : cid,
          montant: perteByDriver[cid].total,
          count: perteByDriver[cid].count
        });
      });
      perteDetail.sort((a, b) => b.montant - a.montant);

      // Chauffeurs programmés detail
      const programmesDetail = [];
      programmesSet.forEach(cid => {
        const ch = chMap[cid];
        if (ch) programmesDetail.push({ nom: ch.prenom + ' ' + ch.nom, redevance: ch.redevanceQuotidienne || 0 });
      });
      programmesDetail.sort((a, b) => a.nom.localeCompare(b.nom));

      // Chauffeurs actifs/inactifs
      const chauffeursDetail = chauffeurs.map(c => ({
        nom: c.prenom + ' ' + c.nom,
        statut: c.statut,
        redevance: c.redevanceQuotidienne || 0
      })).sort((a, b) => a.nom.localeCompare(b.nom));

      // Véhicules detail
      const vehiculesDetail = vehicules.map(v => ({
        nom: v.immatriculation || ((v.marque || '') + ' ' + (v.modele || '')).trim(),
        statut: v.statut
      })).sort((a, b) => a.nom.localeCompare(b.nom));

      // CA mois — top drivers
      const caMoisDetail = [];
      const caByDriver = {};
      monthVersements.filter(v => (v.montantVerse || 0) > 0).forEach(v => {
        if (!caByDriver[v.chauffeurId]) caByDriver[v.chauffeurId] = 0;
        caByDriver[v.chauffeurId] += v.montantVerse;
      });
      Object.keys(caByDriver).forEach(cid => {
        const ch = chMap[cid];
        caMoisDetail.push({ nom: ch ? (ch.prenom + ' ' + ch.nom) : cid, montant: caByDriver[cid] });
      });
      caMoisDetail.sort((a, b) => b.montant - a.montant);

      // ——— 10. Incidents / Sinistres ———
      const incidents = data.incidents || [];
      const incidentsOuverts = incidents.filter(i => i.statut === 'ouvert' || i.statut === 'en_cours');
      const incidentsCritiques = incidentsOuverts.filter(i => i.gravite === 'critique' || i.gravite === 'grave');
      const coutIncidents = incidentsOuverts.reduce((s, i) => s + (i.coutEstime || 0), 0);

      const typeLabels = { accident: 'Accident', panne: 'Panne', vol: 'Vol', agression: 'Agression', contravention: 'Contravention', autre: 'Autre' };
      const gravLabels = { mineur: 'Mineur', moyen: 'Moyen', grave: 'Grave', critique: 'Critique' };
      const gravColors = { critique: 'var(--red)', grave: 'var(--orange)', moyen: '#eab308', mineur: 'var(--cyan)' };

      const incidentsDetail = incidentsOuverts.map(i => {
        const ch = chMap[i.chauffeurId];
        const veh = i.vehiculeId ? vehicules.find(v => v.id === i.vehiculeId) : null;
        return {
          nom: ch ? (ch.prenom + ' ' + ch.nom) : (i.chauffeurId || 'Inconnu'),
          type: typeLabels[i.type] || i.type,
          gravite: i.gravite,
          graviteLabel: gravLabels[i.gravite] || i.gravite,
          graviteColor: gravColors[i.gravite] || 'var(--text-muted)',
          vehicule: veh ? (veh.immatriculation || ((veh.marque || '') + ' ' + (veh.modele || '')).trim()) : '',
          date: i.date,
          description: (i.description || '').substring(0, 80),
          cout: i.coutEstime || 0,
          statut: i.statut === 'en_cours' ? 'En cours' : 'Ouvert'
        };
      }).sort((a, b) => {
        const go = { critique: 0, grave: 1, moyen: 2, mineur: 3 };
        return (go[a.gravite] || 9) - (go[b.gravite] || 9);
      });

      // ——— 11. Dépenses du mois ———
      const depenseTypeLabels = {
        carburant: 'Carburant', peage: 'Peage', lavage: 'Lavage',
        assurance: 'Assurance', reparation: 'Reparation', stationnement: 'Stationnement',
        recharge_yango: 'Recharge Yango', recharge: 'Recharge', autre: 'Autre'
      };
      const monthDepenses = depenses.filter(d => {
        if (!d.date) return false;
        const dd = new Date(d.date);
        return dd.getMonth() === thisMonth && dd.getFullYear() === thisYear;
      });
      const totalDepensesMois = monthDepenses.reduce((s, d) => s + (d.montant || 0), 0);
      const nbDepensesMois = monthDepenses.length;

      // Détail par type
      const depByType = {};
      monthDepenses.forEach(d => {
        const t = d.typeDepense || 'autre';
        if (!depByType[t]) depByType[t] = { total: 0, count: 0 };
        depByType[t].total += (d.montant || 0);
        depByType[t].count++;
      });
      const depensesDetail = Object.keys(depByType).map(t => ({
        nom: depenseTypeLabels[t] || t,
        montant: depByType[t].total,
        count: depByType[t].count
      })).sort((a, b) => b.montant - a.montant);

      return {
        recetteJour, nbVersementsJour, recetteJourDetail,
        recetteAttendue, programmesCount, attendueDetail,
        tauxRecouvrement,
        totalDettes, nbDetteDrivers, detteDetail,
        totalPertes, nbPerteDrivers, perteDetail,
        activeCount, totalChauffeurs, chauffeursDetail,
        vehiculesService, totalVehicules, vehiculesDetail,
        retardCount, totalUnpaid, totalPenalites, unpaidDetail,
        caMois, caMoisDetail, dateLabel, monthLabel,
        programmesDetail,
        nbIncidentsOuverts: incidentsOuverts.length,
        nbIncidentsCritiques: incidentsCritiques.length,
        coutIncidents,
        totalIncidents: incidents.length,
        incidentsDetail,
        totalDepensesMois, nbDepensesMois, depensesDetail
      };
    }
  };

  // =================== HELPERS ===================

  function fmt(n) {
    return new Intl.NumberFormat('fr-FR').format(Math.round(n));
  }

  function fmtCurrency(n) {
    return fmt(n) + ' F';
  }

  // =================== UI ===================

  const UI = {
    _timer: null,

    showLogin() {
      document.getElementById('monitor-login').style.display = '';
      document.getElementById('monitor-app').classList.remove('active');
      document.documentElement.classList.remove('has-token');
      this.stopRefresh();
    },

    showApp() {
      document.getElementById('monitor-login').style.display = 'none';
      document.getElementById('monitor-app').classList.add('active');
    },

    renderDashboard(kpis) {
      const c = document.getElementById('monitor-content');
      if (!c) return;

      const k = kpis;
      const today = new Date().toISOString().split('T')[0];

      // Couleurs conditionnelles
      const tauxColor = k.tauxRecouvrement >= 80 ? 'green' : k.tauxRecouvrement >= 50 ? 'orange' : 'red';
      const detteColor = k.totalDettes > 0 ? 'red' : 'green';
      const perteColor = k.totalPertes > 0 ? 'red' : 'green';
      const retardColor = k.retardCount > 0 ? 'red' : 'green';
      const incidentColor = k.nbIncidentsCritiques > 0 ? 'red' : 'orange';

      c.innerHTML = `
        <!-- DATE PICKER -->
        <div class="date-picker-row">
          <button class="date-nav-btn" id="date-prev">
            <iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon>
          </button>
          <button class="date-picker-btn" id="date-picker-btn">
            <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:1rem"></iconify-icon>
            <span id="date-label">${k.dateLabel}</span>
            ${isToday() ? '<span class="date-live">LIVE</span>' : ''}
          </button>
          <button class="date-nav-btn" id="date-next" ${getSelectedDate() >= today ? 'disabled' : ''}>
            <iconify-icon icon="solar:alt-arrow-right-bold"></iconify-icon>
          </button>
          <input type="date" id="date-input" value="${getSelectedDate()}" max="${today}" style="position:absolute;opacity:0;pointer-events:none;width:0;height:0">
          ${!isToday() ? '<button class="date-today-btn" id="date-today">Aujourd\'hui</button>' : ''}
        </div>

        <!-- FINANCES -->
        <div class="section-title">Finances — ${k.dateLabel}</div>
        <div class="kpi-grid">

          <div class="kpi-card green clickable" onclick="window.__kpiDetail('recetteJour')">
            <div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.recetteJour)}</div>
            <div class="kpi-label">Recette versee</div>
            <div class="kpi-sub">${k.nbVersementsJour} versement${k.nbVersementsJour > 1 ? 's' : ''}</div>
          </div>

          <div class="kpi-card blue clickable" onclick="window.__kpiDetail('attendue')">
            <div class="kpi-icon"><iconify-icon icon="solar:target-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.recetteAttendue)}</div>
            <div class="kpi-label">Recette attendue</div>
            <div class="kpi-sub">${k.programmesCount} chauffeur${k.programmesCount > 1 ? 's' : ''} programm${k.programmesCount > 1 ? 'es' : 'e'}</div>
          </div>

          <div class="kpi-card ${tauxColor} clickable" onclick="window.__kpiDetail('recouvrement')">
            <div class="kpi-icon"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.tauxRecouvrement}%</div>
            <div class="kpi-label">Recouvrement mois</div>
            <div class="kpi-sub">Verse <span class="highlight green">${fmtCurrency(k.caMois)}</span></div>
          </div>

          <div class="kpi-card ${detteColor} clickable" onclick="window.__kpiDetail('dette')">
            <div class="kpi-icon"><iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.totalDettes)}</div>
            <div class="kpi-label">Dette totale</div>
            <div class="kpi-sub">${k.nbDetteDrivers} chauffeur${k.nbDetteDrivers > 1 ? 's' : ''}</div>
          </div>

          <div class="kpi-card orange clickable" onclick="window.__kpiDetail('depenses')">
            <div class="kpi-icon"><iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.totalDepensesMois)}</div>
            <div class="kpi-label">Depenses du mois</div>
            <div class="kpi-sub">${k.nbDepensesMois} depense${k.nbDepensesMois > 1 ? 's' : ''} &bull; ${k.monthLabel}</div>
          </div>

        </div>

        <!-- ALERTES -->
        <div class="section-title">Alertes</div>
        <div class="kpi-grid">

          <div class="kpi-card ${perteColor} clickable" onclick="window.__kpiDetail('pertes')">
            <div class="kpi-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.totalPertes)}</div>
            <div class="kpi-label">Pertes totales</div>
            <div class="kpi-sub">${k.nbPerteDrivers} chauffeur${k.nbPerteDrivers > 1 ? 's' : ''}</div>
          </div>

          <div class="kpi-card ${retardColor} clickable" onclick="window.__kpiDetail('retard')">
            <div class="kpi-icon"><iconify-icon icon="solar:alarm-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.retardCount}</div>
            <div class="kpi-label">Versements en retard</div>
            <div class="kpi-sub">${k.retardCount > 0 ? fmtCurrency(k.totalUnpaid) + ' + ' + fmtCurrency(k.totalPenalites) + ' penalites' : 'Aucun retard'}</div>
          </div>

          <div class="kpi-card ${incidentColor} clickable" onclick="window.__kpiDetail('incidents')">
            <div class="kpi-icon"><iconify-icon icon="solar:shield-warning-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.totalIncidents}</div>
            <div class="kpi-label">Incidents</div>
            <div class="kpi-sub">${k.nbIncidentsOuverts > 0 ? k.nbIncidentsOuverts + ' ouvert' + (k.nbIncidentsOuverts > 1 ? 's' : '') : 'Aucun ouvert'}${k.nbIncidentsCritiques > 0 ? ' \u2022 ' + k.nbIncidentsCritiques + ' grave' + (k.nbIncidentsCritiques > 1 ? 's' : '') : ''}</div>
          </div>

        </div>

        <!-- FLOTTE -->
        <div class="section-title">Flotte</div>
        <div class="kpi-grid">

          <div class="kpi-card cyan clickable" onclick="window.__kpiDetail('programmes')">
            <div class="kpi-icon"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.programmesCount}</div>
            <div class="kpi-label">Chauffeurs programmes</div>
            <div class="kpi-sub">${k.dateLabel}</div>
          </div>

          <div class="kpi-card cyan clickable" onclick="window.__kpiDetail('vehicules')">
            <div class="kpi-icon"><iconify-icon icon="solar:bus-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.vehiculesService}<span style="font-size:0.8rem;font-weight:500;opacity:0.65">/${k.totalVehicules}</span></div>
            <div class="kpi-label">Vehicules en service</div>
            <div class="kpi-sub">${k.totalVehicules - k.vehiculesService} hors service</div>
          </div>

          <div class="kpi-card blue clickable" onclick="window.__kpiDetail('caMois')">
            <div class="kpi-icon"><iconify-icon icon="solar:cash-out-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.caMois)}</div>
            <div class="kpi-label">CA du mois</div>
            <div class="kpi-sub">${k.monthLabel}</div>
          </div>

        </div>
      `;

      // Mettre à jour l'heure
      document.getElementById('last-update').textContent =
        new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Live dot visibility
      const dot = document.getElementById('live-dot');
      if (dot) dot.style.display = isToday() ? '' : 'none';

      // Bind date controls
      this._bindDateControls();
    },

    _bindDateControls() {
      const input = document.getElementById('date-input');
      const pickerBtn = document.getElementById('date-picker-btn');
      const prevBtn = document.getElementById('date-prev');
      const nextBtn = document.getElementById('date-next');
      const todayBtn = document.getElementById('date-today');

      if (pickerBtn && input) {
        pickerBtn.onclick = function() { input.showPicker ? input.showPicker() : input.click(); };
        input.onchange = function() {
          const today = new Date().toISOString().split('T')[0];
          _selectedDate = input.value === today ? null : input.value;
          var kpis = Data.recompute();
          if (kpis) UI.renderDashboard(kpis);
        };
      }

      if (prevBtn) {
        prevBtn.onclick = function() {
          var d = new Date(getSelectedDate() + 'T12:00:00');
          d.setDate(d.getDate() - 1);
          var today = new Date().toISOString().split('T')[0];
          _selectedDate = d.toISOString().split('T')[0] === today ? null : d.toISOString().split('T')[0];
          var kpis = Data.recompute();
          if (kpis) UI.renderDashboard(kpis);
        };
      }

      if (nextBtn) {
        nextBtn.onclick = function() {
          var d = new Date(getSelectedDate() + 'T12:00:00');
          d.setDate(d.getDate() + 1);
          var today = new Date().toISOString().split('T')[0];
          if (d.toISOString().split('T')[0] > today) return;
          _selectedDate = d.toISOString().split('T')[0] === today ? null : d.toISOString().split('T')[0];
          var kpis = Data.recompute();
          if (kpis) UI.renderDashboard(kpis);
        };
      }

      if (todayBtn) {
        todayBtn.onclick = function() {
          _selectedDate = null;
          var kpis = Data.recompute();
          if (kpis) UI.renderDashboard(kpis);
        };
      }
    },

    renderError(msg) {
      const c = document.getElementById('monitor-content');
      if (!c) return;
      c.innerHTML = `
        <div class="monitor-error">
          <iconify-icon icon="solar:cloud-cross-bold-duotone"></iconify-icon>
          <p style="font-weight:600;margin-bottom:4px">Erreur de chargement</p>
          <p style="font-size:0.8rem">${msg || 'Impossible de recuperer les donnees'}</p>
          <button class="retry-btn" onclick="window.__monitorRetry()">Reessayer</button>
        </div>
      `;
    },

    renderLoading() {
      const c = document.getElementById('monitor-content');
      if (!c) return;
      c.innerHTML = `
        <div class="monitor-loading">
          <iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon>
          <span>Chargement...</span>
        </div>
      `;
    },

    startRefresh() {
      this.stopRefresh();
      this._timer = setInterval(async () => {
        const kpis = await Data.fetch();
        if (kpis) this.renderDashboard(kpis);
      }, REFRESH_MS);
    },

    stopRefresh() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }
  };

  // =================== KPI DETAIL MODAL ===================

  function showMonitorModal(title, bodyHtml) {
    // Remove existing modal
    const old = document.getElementById('mon-modal-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'mon-modal-overlay';
    overlay.className = 'mon-modal-overlay';
    overlay.innerHTML = `
      <div class="mon-modal">
        <div class="mon-modal-header">
          <div class="mon-modal-title">${title}</div>
          <button class="mon-modal-close" onclick="document.getElementById('mon-modal-overlay').remove()">&times;</button>
        </div>
        <div class="mon-modal-body">${bodyHtml}</div>
      </div>
    `;
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('visible'); });
  }

  function buildListRows(items, valueFn, subFn) {
    if (!items.length) return '<div style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucune donnee</div>';
    return items.map(function(item) {
      return '<div class="mon-detail-row">' +
        '<div class="mon-detail-name">' + item.nom + (subFn ? '<div class="mon-detail-sub">' + subFn(item) + '</div>' : '') + '</div>' +
        '<div class="mon-detail-value">' + valueFn(item) + '</div>' +
      '</div>';
    }).join('');
  }

  window.__kpiDetail = function(type) {
    const k = Data._kpis;
    if (!k) return;

    switch (type) {
      case 'recetteJour':
        showMonitorModal(
          '<iconify-icon icon="solar:wallet-money-bold-duotone" style="color:var(--green)"></iconify-icon> Recette versee — ' + k.dateLabel,
          '<div class="mon-detail-total">Total : <strong>' + fmtCurrency(k.recetteJour) + '</strong></div>' +
          buildListRows(k.recetteJourDetail,
            function(i) { return '<strong>' + fmtCurrency(i.montant) + '</strong>'; },
            function(i) { return i.count + ' versement' + (i.count > 1 ? 's' : ''); }
          )
        );
        break;

      case 'attendue':
        showMonitorModal(
          '<iconify-icon icon="solar:target-bold-duotone" style="color:var(--blue)"></iconify-icon> Recette attendue — ' + k.dateLabel,
          '<div class="mon-detail-total">Total attendu : <strong>' + fmtCurrency(k.recetteAttendue) + '</strong> &mdash; ' + k.programmesCount + ' chauffeurs</div>' +
          buildListRows(k.attendueDetail,
            function(i) { return '<strong>' + fmtCurrency(i.redevance) + '</strong>'; },
            function(i) { return (i.absent ? '<span style="color:var(--orange)">Absent</span>' : i.paid ? '<span style="color:var(--green)">Verse</span>' : '<span style="color:var(--red)">En attente</span>'); }
          )
        );
        break;

      case 'recouvrement':
        showMonitorModal(
          '<iconify-icon icon="solar:chart-bold-duotone" style="color:var(--blue)"></iconify-icon> Recouvrement — ' + k.monthLabel,
          '<div class="mon-detail-total">Taux : <strong>' + k.tauxRecouvrement + '%</strong> &mdash; CA : <strong>' + fmtCurrency(k.caMois) + '</strong></div>' +
          '<div class="mon-detail-total" style="margin-top:4px">Impaye : <strong style="color:var(--red)">' + fmtCurrency(k.totalUnpaid) + '</strong> &mdash; ' + k.retardCount + ' retard' + (k.retardCount > 1 ? 's' : '') + '</div>' +
          buildListRows(k.caMoisDetail,
            function(i) { return '<strong>' + fmtCurrency(i.montant) + '</strong>'; },
            null
          )
        );
        break;

      case 'dette':
        showMonitorModal(
          '<iconify-icon icon="solar:hand-money-bold-duotone" style="color:var(--red)"></iconify-icon> Dettes par chauffeur',
          '<div class="mon-detail-total">Total : <strong style="color:var(--red)">' + fmtCurrency(k.totalDettes) + '</strong> &mdash; ' + k.nbDetteDrivers + ' chauffeur' + (k.nbDetteDrivers > 1 ? 's' : '') + '</div>' +
          buildListRows(k.detteDetail,
            function(i) { return '<strong style="color:var(--red)">' + fmtCurrency(i.montant) + '</strong>'; },
            function(i) { return i.count + ' versement' + (i.count > 1 ? 's' : '') + ' en dette'; }
          )
        );
        break;

      case 'pertes':
        showMonitorModal(
          '<iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:var(--orange)"></iconify-icon> Pertes par chauffeur',
          '<div class="mon-detail-total">Total : <strong style="color:var(--orange)">' + fmtCurrency(k.totalPertes) + '</strong> &mdash; ' + k.nbPerteDrivers + ' chauffeur' + (k.nbPerteDrivers > 1 ? 's' : '') + '</div>' +
          buildListRows(k.perteDetail,
            function(i) { return '<strong style="color:var(--orange)">' + fmtCurrency(i.montant) + '</strong>'; },
            function(i) { return i.count + ' versement' + (i.count > 1 ? 's' : '') + ' en perte'; }
          )
        );
        break;

      case 'retard':
        showMonitorModal(
          '<iconify-icon icon="solar:alarm-bold-duotone" style="color:var(--red)"></iconify-icon> Versements en retard',
          '<div class="mon-detail-total">Total impaye : <strong style="color:var(--red)">' + fmtCurrency(k.totalUnpaid) + '</strong> + <strong style="color:var(--orange)">' + fmtCurrency(k.totalPenalites) + '</strong> penalites</div>' +
          buildListRows(k.unpaidDetail,
            function(i) { return '<strong style="color:var(--red)">' + fmtCurrency(i.montant) + '</strong>'; },
            function(i) { return i.date + ' &bull; ' + i.joursRetard + 'j de retard'; }
          )
        );
        break;

      case 'programmes':
        showMonitorModal(
          '<iconify-icon icon="solar:users-group-rounded-bold-duotone" style="color:var(--cyan)"></iconify-icon> Chauffeurs programmes — ' + k.dateLabel,
          '<div class="mon-detail-total">' + k.programmesCount + ' chauffeur' + (k.programmesCount > 1 ? 's' : '') + ' programme' + (k.programmesCount > 1 ? 's' : '') + '</div>' +
          buildListRows(k.programmesDetail,
            function(i) { return i.redevance > 0 ? fmtCurrency(i.redevance) + '/j' : '-'; },
            null
          )
        );
        break;

      case 'chauffeurs':
        var actifs = k.chauffeursDetail.filter(function(c) { return c.statut === 'actif'; });
        var inactifs = k.chauffeursDetail.filter(function(c) { return c.statut !== 'actif'; });
        showMonitorModal(
          '<iconify-icon icon="solar:user-check-rounded-bold-duotone" style="color:var(--cyan)"></iconify-icon> Chauffeurs (' + k.totalChauffeurs + ')',
          '<div class="mon-detail-total">' + k.activeCount + ' actifs &mdash; ' + (k.totalChauffeurs - k.activeCount) + ' inactifs</div>' +
          (actifs.length ? '<div class="mon-detail-section">Actifs</div>' + buildListRows(actifs, function(i) { return i.redevance > 0 ? fmtCurrency(i.redevance) + '/j' : '-'; }, null) : '') +
          (inactifs.length ? '<div class="mon-detail-section" style="color:var(--red)">Inactifs</div>' + buildListRows(inactifs, function(i) { return '<span style="color:var(--text-muted)">' + (i.redevance > 0 ? fmtCurrency(i.redevance) + '/j' : '-') + '</span>'; }, null) : '')
        );
        break;

      case 'vehicules':
        var enService = k.vehiculesDetail.filter(function(v) { return v.statut === 'en_service'; });
        var horsService = k.vehiculesDetail.filter(function(v) { return v.statut !== 'en_service'; });
        showMonitorModal(
          '<iconify-icon icon="solar:bus-bold-duotone" style="color:var(--cyan)"></iconify-icon> Vehicules (' + k.totalVehicules + ')',
          '<div class="mon-detail-total">' + k.vehiculesService + ' en service &mdash; ' + (k.totalVehicules - k.vehiculesService) + ' hors service</div>' +
          (enService.length ? '<div class="mon-detail-section">En service</div>' + buildListRows(enService, function() { return '<span style="color:var(--green)">&#10003;</span>'; }, null) : '') +
          (horsService.length ? '<div class="mon-detail-section" style="color:var(--red)">Hors service</div>' + buildListRows(horsService, function() { return '<span style="color:var(--red)">&times;</span>'; }, null) : '')
        );
        break;

      case 'caMois':
        showMonitorModal(
          '<iconify-icon icon="solar:cash-out-bold-duotone" style="color:var(--blue)"></iconify-icon> CA du mois — ' + k.monthLabel,
          '<div class="mon-detail-total">Total : <strong>' + fmtCurrency(k.caMois) + '</strong></div>' +
          buildListRows(k.caMoisDetail,
            function(i) { return '<strong>' + fmtCurrency(i.montant) + '</strong>'; },
            null
          )
        );
        break;

      case 'incidents':
        showMonitorModal(
          '<iconify-icon icon="solar:shield-warning-bold-duotone" style="color:var(--orange)"></iconify-icon> Incidents ouverts (' + k.nbIncidentsOuverts + '/' + k.totalIncidents + ')',
          '<div class="mon-detail-total">' + k.nbIncidentsOuverts + ' ouvert' + (k.nbIncidentsOuverts > 1 ? 's' : '') +
          (k.nbIncidentsCritiques > 0 ? ' &mdash; <strong style="color:var(--red)">' + k.nbIncidentsCritiques + ' grave' + (k.nbIncidentsCritiques > 1 ? 's' : '') + '</strong>' : '') +
          (k.coutIncidents > 0 ? ' &mdash; Cout : <strong style="color:var(--orange)">' + fmtCurrency(k.coutIncidents) + '</strong>' : '') +
          '</div>' +
          (k.incidentsDetail.length === 0
            ? '<div style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucun incident ouvert</div>'
            : k.incidentsDetail.map(function(i) {
                return '<div class="mon-detail-row">' +
                  '<div class="mon-detail-name">' + i.nom +
                    '<div class="mon-detail-sub">' + i.type + ' &bull; ' + i.date + (i.vehicule ? ' &bull; ' + i.vehicule : '') + '</div>' +
                    (i.description ? '<div class="mon-detail-sub" style="opacity:0.6;font-size:0.7rem">' + i.description + '</div>' : '') +
                  '</div>' +
                  '<div class="mon-detail-value">' +
                    '<span style="color:' + i.graviteColor + ';font-weight:600;font-size:0.75rem">' + i.graviteLabel + '</span>' +
                    (i.cout > 0 ? '<div style="font-size:0.7rem;margin-top:2px">' + fmtCurrency(i.cout) + '</div>' : '') +
                  '</div>' +
                '</div>';
              }).join('')
          )
        );
        break;

      case 'depenses':
        showMonitorModal(
          '<iconify-icon icon="solar:bill-list-bold-duotone" style="color:var(--orange)"></iconify-icon> Depenses — ' + k.monthLabel,
          '<div class="mon-detail-total">Total : <strong style="color:var(--orange)">' + fmtCurrency(k.totalDepensesMois) + '</strong> &mdash; ' + k.nbDepensesMois + ' depense' + (k.nbDepensesMois > 1 ? 's' : '') + '</div>' +
          buildListRows(k.depensesDetail,
            function(i) { return '<strong style="color:var(--orange)">' + fmtCurrency(i.montant) + '</strong>'; },
            function(i) { return i.count + ' depense' + (i.count > 1 ? 's' : ''); }
          )
        );
        break;
    }
  };

  // =================== INIT ===================

  async function loadAndRender() {
    const kpis = await Data.fetch();
    if (kpis) {
      UI.showApp();
      UI.renderDashboard(kpis);
      UI.startRefresh();
    } else if (Auth.isLoggedIn()) {
      UI.showApp();
      UI.renderError();
    } else {
      UI.showLogin();
    }
  }

  // Retry global
  window.__monitorRetry = async function() {
    UI.renderLoading();
    await loadAndRender();
  };

  function init() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/monitor/sw.js', { scope: '/monitor/' })
        .catch(function() {});
    }

    // Bind login form
    document.getElementById('login-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');

      btn.disabled = true;
      btn.textContent = 'Connexion...';
      errEl.classList.remove('visible');

      const result = await Auth.login(email, password);

      if (result.success) {
        UI.renderLoading();
        UI.showApp();
        await loadAndRender();
      } else {
        errEl.textContent = result.error;
        errEl.classList.add('visible');
      }

      btn.disabled = false;
      btn.textContent = 'Se connecter';
    });

    // Bind refresh button
    document.getElementById('btn-refresh').addEventListener('click', async function() {
      const btn = this;
      btn.classList.add('spin');
      const kpis = await Data.fetch();
      if (kpis) UI.renderDashboard(kpis);
      setTimeout(function() { btn.classList.remove('spin'); }, 600);
    });

    // Bind logout
    document.getElementById('btn-logout').addEventListener('click', function() {
      Auth.logout();
      UI.showLogin();
      _selectedDate = null;
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
      document.getElementById('login-error').classList.remove('visible');
    });

    // Check auth and load
    if (Auth.isLoggedIn()) {
      loadAndRender();
    } else {
      UI.showLogin();
    }
  }

  // Lancer quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
