/**
 * Volt Monitor — Dashboard KPI temps réel pour admins
 * Single IIFE: Auth + Data + UI + Init
 */
(function() {
  'use strict';

  const TOKEN_KEY = 'volt_monitor_token';
  const SESSION_KEY = 'volt_monitor_session';
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

      return {
        recetteJour, nbVersementsJour,
        recetteAttendue, programmesCount,
        tauxRecouvrement,
        totalDettes, nbDetteDrivers,
        totalPertes, nbPerteDrivers,
        activeCount, totalChauffeurs,
        vehiculesService, totalVehicules,
        retardCount, totalUnpaid, totalPenalites,
        caMois, dateLabel, monthLabel
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
      const perteColor = k.totalPertes > 0 ? 'orange' : 'green';
      const retardColor = k.retardCount > 0 ? 'red' : 'green';

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

          <div class="kpi-card green">
            <div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.recetteJour)}</div>
            <div class="kpi-label">Recette du jour</div>
            <div class="kpi-sub">${k.nbVersementsJour} versement${k.nbVersementsJour > 1 ? 's' : ''}</div>
          </div>

          <div class="kpi-card blue">
            <div class="kpi-icon"><iconify-icon icon="solar:target-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.recetteAttendue)}</div>
            <div class="kpi-label">Recette attendue</div>
            <div class="kpi-sub">${k.programmesCount} chauffeur${k.programmesCount > 1 ? 's' : ''} programm${k.programmesCount > 1 ? 'es' : 'e'}</div>
          </div>

          <div class="kpi-card ${tauxColor}">
            <div class="kpi-icon"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.tauxRecouvrement}%</div>
            <div class="kpi-label">Recouvrement mois</div>
            <div class="kpi-sub">Verse <span class="highlight green">${fmtCurrency(k.caMois)}</span></div>
          </div>

          <div class="kpi-card ${detteColor}">
            <div class="kpi-icon"><iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.totalDettes)}</div>
            <div class="kpi-label">Dette totale</div>
            <div class="kpi-sub">${k.nbDetteDrivers} chauffeur${k.nbDetteDrivers > 1 ? 's' : ''}</div>
          </div>

        </div>

        <!-- ALERTES -->
        <div class="section-title">Alertes</div>
        <div class="kpi-grid">

          <div class="kpi-card ${perteColor}">
            <div class="kpi-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${fmtCurrency(k.totalPertes)}</div>
            <div class="kpi-label">Pertes totales</div>
            <div class="kpi-sub">${k.nbPerteDrivers} chauffeur${k.nbPerteDrivers > 1 ? 's' : ''}</div>
          </div>

          <div class="kpi-card ${retardColor}">
            <div class="kpi-icon"><iconify-icon icon="solar:alarm-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.retardCount}</div>
            <div class="kpi-label">Versements en retard</div>
            <div class="kpi-sub">${k.retardCount > 0 ? fmtCurrency(k.totalUnpaid) + ' + ' + fmtCurrency(k.totalPenalites) + ' penalites' : 'Aucun retard'}</div>
          </div>

        </div>

        <!-- FLOTTE -->
        <div class="section-title">Flotte</div>
        <div class="kpi-grid">

          <div class="kpi-card cyan">
            <div class="kpi-icon"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.programmesCount}</div>
            <div class="kpi-label">Chauffeurs programmes</div>
            <div class="kpi-sub">${k.dateLabel}</div>
          </div>

          <div class="kpi-card cyan">
            <div class="kpi-icon"><iconify-icon icon="solar:user-check-rounded-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.activeCount}<span style="font-size:0.8rem;font-weight:500;opacity:0.65">/${k.totalChauffeurs}</span></div>
            <div class="kpi-label">Chauffeurs actifs</div>
            <div class="kpi-sub">${k.totalChauffeurs - k.activeCount} inactif${(k.totalChauffeurs - k.activeCount) > 1 ? 's' : ''}</div>
          </div>

          <div class="kpi-card cyan">
            <div class="kpi-icon"><iconify-icon icon="solar:bus-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">${k.vehiculesService}<span style="font-size:0.8rem;font-weight:500;opacity:0.65">/${k.totalVehicules}</span></div>
            <div class="kpi-label">Vehicules en service</div>
            <div class="kpi-sub">${k.totalVehicules - k.vehiculesService} hors service</div>
          </div>

          <div class="kpi-card blue">
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
