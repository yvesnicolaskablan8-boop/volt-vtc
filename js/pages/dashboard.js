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
    try {
      let data;
      try {
        data = this._getData();
      } catch (dataErr) {
        console.error('DashboardPage._getData() error:', dataErr);
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'padding:40px;color:#ef4444;font-size:16px;';
        const errTitle = document.createElement('strong');
        errTitle.textContent = 'Erreur getData :';
        const errPre = document.createElement('pre');
        errPre.style.cssText = 'white-space:pre-wrap;margin-top:12px;background:#fef2f2;padding:16px;border-radius:12px;font-size:13px;';
        errPre.textContent = String(dataErr.stack || dataErr);
        errDiv.appendChild(errTitle);
        errDiv.appendChild(errPre);
        container.textContent = '';
        container.appendChild(errDiv);
        return;
      }
      this._lastData = data;
      let html;
      try {
        html = this._template(data);
      } catch (tplErr) {
        console.error('DashboardPage._template() error:', tplErr);
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'padding:40px;color:#ef4444;font-size:16px;';
        const errTitle = document.createElement('strong');
        errTitle.textContent = 'Erreur template :';
        const errPre = document.createElement('pre');
        errPre.style.cssText = 'white-space:pre-wrap;margin-top:12px;background:#fef2f2;padding:16px;border-radius:12px;font-size:13px;';
        errPre.textContent = String(tplErr.stack || tplErr);
        errDiv.appendChild(errTitle);
        errDiv.appendChild(errPre);
        container.textContent = '';
        container.appendChild(errDiv);
        return;
      }
      container.innerHTML = html; // template uses escaped/static content only
      try {
        this._loadCharts(data);
      } catch (chartErr) {
        console.error('DashboardPage._loadCharts() error:', chartErr);
      }
      this._bindPeriodSelector();
      if (this._isToday()) { this._startAutoRefresh(); this._maybeRefreshCa(); } else this._stopAutoRefresh();
      // Fire-and-forget: auto-generate then re-render if new data
      this._autoGenerateVersements();
    } catch (err) {
      console.error('DashboardPage.render() error:', err);
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'padding:40px;color:#ef4444;font-size:16px;';
      const errTitle = document.createElement('strong');
      errTitle.textContent = 'Erreur dashboard :';
      const errPre = document.createElement('pre');
      errPre.style.cssText = 'white-space:pre-wrap;margin-top:12px;background:#fef2f2;padding:16px;border-radius:12px;font-size:13px;';
      errPre.textContent = String(err.stack || err);
      errDiv.appendChild(errTitle);
      errDiv.appendChild(errPre);
      container.textContent = '';
      container.appendChild(errDiv);
    }
  },

  // Auto-générer les versements du jour (1x/jour max)
  async _autoGenerateVersements() {
    const today = new Date().toISOString().split('T')[0];
    const lastGen = localStorage.getItem('pilote_autogen_date');
    if (lastGen === today) return;
    localStorage.setItem('pilote_autogen_date', today);
    // Auto-generate versements is now handled client-side
    console.log('Auto-generate versements: skipped (server-side endpoint removed)');
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
    this._stopAutoRefresh();
  },

  _startAutoRefresh() {
    this._stopAutoRefresh();
    this._refreshInterval = setInterval(() => {
      this._maybeRefreshCa();  // re-synchronise le CA Yango (auto-throttlé)
      this._silentRefresh();   // ré-affiche depuis le cache
    }, 30000);
  },

  _stopAutoRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  },

  // Re-synchronise le CA Yango du jour pour que la « recette du jour » suive
  // l'activité en temps quasi réel. Auto-throttlé (2 min) pour ménager l'API.
  async _maybeRefreshCa() {
    if (!this._isToday()) return;
    const now = Date.now();
    if (this._lastCaLiveSync && (now - this._lastCaLiveSync) < 120000) return;
    this._lastCaLiveSync = now;
    try {
      const r = await Store.synchroniserCaJour(null, 1); // aujourd'hui seulement (léger)
      if (!this._refreshInterval) return; // tableau de bord quitté pendant la synchro
      if (r && !r.error) {
        await Store.rechargerCollection('caJour');
        if (this._refreshInterval) this._silentRefresh(); // réaffiche avec le CA frais
      }
    } catch (e) { /* silencieux : réessai au prochain tick */ }
  },

  // Page de détail « Activité du jour » (style Spike : thème clair, cartes blanches
  // arrondies, accent bleu, pastilles pastel). S'ouvre au clic sur le hero.
  // Le contenu dynamique (noms) est échappé via Utils.escHtml.
  _showActiviteDetail() {
    const jour = new Date().toISOString().split('T')[0];
    const chauffeurs = Store.get('chauffeurs') || [];
    const chById = new Map(chauffeurs.map(c => [c.id, c]));
    const caJour = (Store.get('caJour') || []).filter(e => String(e.date).slice(0, 10) === jour);
    const caById = {}; caJour.forEach(e => { caById[e.chauffeurId] = e; });
    const planningSet = new Set((Store.get('planning') || []).filter(p => p.date === jour).map(p => p.chauffeurId));
    const chargesJour = {}; (Store.get('charges') || []).filter(c => String(c.date).slice(0, 10) === jour).forEach(c => { chargesJour[c.chauffeurId] = (chargesJour[c.chauffeurId] || 0) + (Number(c.montant) || 0); });
    const verseJour = {}; (Store.get('versements') || []).filter(v => (v.dateService || v.date) === jour && v.statut !== 'supprime').forEach(v => { verseJour[v.chauffeurId] = (verseJour[v.chauffeurId] || 0) + (Number(v.montantVerse) || 0); });

    const ids = new Set();
    caJour.forEach(e => { const ch = chById.get(e.chauffeurId); if (ch && ch.statut !== 'inactif' && ch.typeContrat === 'salarie') ids.add(e.chauffeurId); });
    planningSet.forEach(id => { const ch = chById.get(id); if (ch && ch.statut !== 'inactif') ids.add(id); });
    const lignes = [...ids].map(id => {
      const ch = chById.get(id); const e = caById[id];
      const ca = e ? Number(e.caBrut) || 0 : 0;
      const charges = chargesJour[id] || 0;
      return { prenom: ch.prenom, nom: ch.nom, ca, courses: e ? Number(e.nbCourses) || 0 : 0, programme: planningSet.has(id), roule: ca > 0, charges, verse: verseJour[id] || 0, du: Math.max(0, ca - charges) };
    }).sort((a, b) => b.ca - a.ca);

    const caBrutJour = lignes.reduce((s, l) => s + l.ca, 0);
    const totalCharges = lignes.reduce((s, l) => s + l.charges, 0);
    const totalVerse = lignes.reduce((s, l) => s + l.verse, 0);
    const totalDu = lignes.reduce((s, l) => s + l.du, 0);
    const reste = Math.max(0, totalDu - totalVerse);
    const caMois = (Store.get('caJour') || []).filter(e => String(e.date).slice(0, 7) === jour.slice(0, 7)).reduce((s, e) => s + (Number(e.caBrut) || 0), 0);
    const nbProg = lignes.filter(l => l.programme).length;
    const nbActifs = lignes.filter(l => l.roule).length;
    const nbHors = lignes.filter(l => l.roule && !l.programme).length;

    // === Style Spike EXACT (plein écran, thème clair, police Plus Jakarta Sans) ===
    const C = {
      bg: '#F5F7FB', card: '#ffffff', head: '#2A3547', mut: '#5A6A85', mut2: '#7C8FAC', bd: '#EBF1F6',
      blue: '#5D87FF', blueS: 'rgba(93,135,255,.12)',
      green: '#13DEB9', greenT: '#0a9d86', greenS: 'rgba(19,222,185,.13)',
      amber: '#FFAE1F', amberT: '#B47C00', amberS: 'rgba(255,174,31,.14)',
      red: '#FA896B', redT: '#D9583B', redS: 'rgba(250,137,107,.13)',
      purple: '#8b5cf6', purpleS: 'rgba(139,92,246,.12)'
    };
    const SH = '0 2px 6px rgba(37,83,185,.10)'; // ombre bleutée signature de Spike
    const cardCss = `background:${C.card};border-radius:18px;box-shadow:${SH};`;
    const money = (n) => Utils.formatCurrency(n);
    const stat = (icon, color, bgc, label, value, sub) => `
      <div style="${cardCss}padding:22px 24px;">
        <div style="width:48px;height:48px;border-radius:14px;background:${bgc};color:${color};display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px;"><iconify-icon icon="${icon}"></iconify-icon></div>
        <div style="font-size:24px;font-weight:800;color:${C.head};letter-spacing:-.5px;">${value}</div>
        <div style="font-size:14px;color:${C.mut};font-weight:500;margin-top:3px;">${label}</div>
        ${sub ? `<div style="font-size:12.5px;color:${C.mut2};margin-top:2px;">${sub}</div>` : ''}
      </div>`;
    const pill = (txt, color, bgc) => `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:30px;background:${bgc};color:${color};font-size:12px;font-weight:700;">${txt}</span>`;
    const totalLine = (label, value, color, strong) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${strong ? `border-top:1px solid ${C.bd};margin-top:2px;padding-top:14px;` : ''}"><span style="font-size:14px;color:${C.mut};font-weight:${strong ? 700 : 500};">${label}</span><strong style="font-size:${strong ? 18 : 15}px;color:${color || C.head};">${value}</strong></div>`;

    const rows = lignes.map((l, i) => {
      const statutPill = l.roule ? (l.programme ? pill('En activité', C.greenT, C.greenS) : pill('⚠ Hors planning', C.amberT, C.amberS)) : pill('Pas encore parti', C.mut2, 'rgba(124,143,172,.12)');
      const detail = [];
      if (l.charges > 0) detail.push(`charges ${money(l.charges)}`);
      if (l.verse > 0) detail.push(`versé ${money(l.verse)}`);
      return `<div style="display:flex;align-items:center;gap:16px;padding:16px 0;${i < lignes.length - 1 ? `border-bottom:1px solid ${C.bd};` : ''}">
        <div style="width:44px;height:44px;flex-shrink:0;border-radius:50%;background:${l.programme ? C.blueS : C.amberS};color:${l.programme ? C.blue : C.amberT};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;">${Utils.escHtml((l.prenom || '?').charAt(0))}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:700;color:${C.head};">${Utils.escHtml(l.prenom)} ${Utils.escHtml(l.nom)}</div>
          <div style="font-size:13px;color:${C.mut2};margin-top:2px;">${l.roule ? `${l.courses} course${l.courses > 1 ? 's' : ''}` : 'aucune course'}${detail.length ? ' · ' + detail.join(' · ') : ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:17px;font-weight:800;color:${C.head};">${money(l.ca)}</div>
          <div style="margin-top:5px;">${statutPill}</div>
        </div>
      </div>`;
    }).join('') || `<div style="text-align:center;color:${C.mut2};padding:34px;">Aucune activité aujourd'hui.</div>`;

    const html = `
      <div style="max-width:1200px;margin:0 auto;padding:26px 26px 70px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:26px;">
          <div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <h2 style="margin:0;font-size:25px;font-weight:800;color:${C.head};letter-spacing:-.6px;">Activité du jour</h2>
              <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:${C.redT};background:${C.redS};padding:5px 13px;border-radius:30px;font-weight:800;letter-spacing:.4px;"><span style="width:7px;height:7px;border-radius:50%;background:${C.red};animation:livePulse 1.6s infinite;"></span>EN DIRECT</span>
            </div>
            <div style="font-size:14px;color:${C.mut};margin-top:7px;">${Utils.formatDate(jour)}</div>
          </div>
          <button onclick="document.getElementById('activite-detail-overlay').remove()" style="background:${C.card};border:none;width:44px;height:44px;border-radius:14px;font-size:22px;cursor:pointer;color:${C.mut};display:flex;align-items:center;justify-content:center;box-shadow:${SH};flex-shrink:0;">&times;</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:24px;margin-bottom:24px;">
          ${stat('solar:wallet-money-bold-duotone', C.blue, C.blueS, 'Recette du jour', money(caBrutJour), 'à verser')}
          ${stat('solar:users-group-rounded-bold-duotone', C.greenT, C.greenS, 'Programmés', String(nbProg), nbActifs + ' en activité')}
          ${stat('solar:wheel-angle-bold-duotone', C.purple, C.purpleS, 'En activité', String(nbActifs), nbHors > 0 ? nbHors + ' hors planning' : 'tous programmés')}
          ${stat('solar:calendar-bold-duotone', C.amberT, C.amberS, 'CA du mois', money(caMois))}
        </div>

        ${nbHors > 0 ? `<div style="display:flex;align-items:center;gap:14px;background:${C.amberS};border-radius:16px;padding:16px 20px;margin-bottom:24px;">
          <iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:${C.amber};font-size:26px;flex-shrink:0;"></iconify-icon>
          <div style="font-size:14px;color:${C.head};font-weight:500;"><strong>${lignes.filter(l => l.roule && !l.programme).map(l => Utils.escHtml(l.prenom)).join(', ')}</strong> roule${nbHors > 1 ? 'nt' : ''} sans être au planning. Pensez à corriger le planning du jour.</div>
        </div>` : ''}

        <div style="${cardCss}padding:6px 26px 20px;margin-bottom:24px;">
          <div style="font-size:18px;font-weight:800;color:${C.head};padding:20px 0 4px;">Chauffeurs du jour</div>
          ${rows}
        </div>

        <div style="${cardCss}padding:24px 28px;max-width:560px;">
          <div style="font-size:18px;font-weight:800;color:${C.head};margin-bottom:10px;">Récapitulatif</div>
          ${totalLine('CA brut Yango', money(caBrutJour), C.head)}
          ${totalLine('− Charges', totalCharges > 0 ? '− ' + money(totalCharges) : money(0), C.redT)}
          ${totalLine('= À verser', money(totalDu), C.head, true)}
          ${totalLine('Déjà versé', money(totalVerse), C.greenT)}
          ${totalLine('Reste dû', money(reste), reste > 0 ? C.redT : C.greenT)}
        </div>
      </div>`;

    if (!document.getElementById('spike-font')) {
      const lk = document.createElement('link');
      lk.id = 'spike-font'; lk.rel = 'stylesheet';
      lk.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(lk);
    }
    const existing = document.getElementById('activite-detail-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'activite-detail-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:${C.bg};z-index:3000;overflow-y:auto;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`;
    overlay.insertAdjacentHTML('beforeend', html);
    document.addEventListener('keydown', function handler(e) { if (e.key === 'Escape') { const o = document.getElementById('activite-detail-overlay'); if (o) o.remove(); document.removeEventListener('keydown', handler); } });
    document.body.appendChild(overlay);
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
    try {
      if (!this._isToday()) return;
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
      container.innerHTML = this._template(data); // template uses escaped/static content only
      this._loadCharts(data);
      this._bindPeriodSelector();
      this._startAutoRefresh();
    } catch (err) {
      console.error('DashboardPage._silentRefresh() error:', err);
    }
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
    const totalVerse = monthVersements.filter(v => v.statut !== 'supprime').reduce((s, v) => s + (v.montantVerse || 0), 0);

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
        .reduce((s, v) => s + (v.montantVerse || 0), 0);
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
        .reduce((s, v) => s + (v.montantVerse || 0), 0);
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
        .reduce((s, v) => s + (v.montantVerse || 0), 0);
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
        verse: weekVers.filter(v => v.statut !== 'supprime').reduce((s, v) => s + (v.montantVerse || 0), 0),
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
      const hasValidOrDismissed = versements.some(v => v.chauffeurId === p.chauffeurId && v.date === p.date && (v.statut === 'valide' || v.statut === 'supprime' || v.statut === 'perte'));
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

    // Taux de recouvrement — TOUJOURS calculé sur le mois entier (pas le jour)
    const matchesMonth = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    };
    const allMonthVersements = versements.filter(v => matchesMonth(v.date));
    const totalVerseMonth = allMonthVersements.filter(v => v.statut !== 'supprime').reduce((s, v) => s + (v.montantVerse || 0), 0);
    // Montant attendu = versements payés + impayés du mois (plannings passés sans versement)
    const allMonthPlanning = planning.filter(p => matchesMonth(p.date) && p.date < now.toISOString().split('T')[0]);
    let totalAttenduMonth = 0;
    const monthScheduled = new Map();
    allMonthPlanning.forEach(p => {
      const key = `${p.chauffeurId}|${p.date}`;
      if (!monthScheduled.has(key)) monthScheduled.set(key, p);
    });
    monthScheduled.forEach((p) => {
      const hasAbsence = absences.some(a => a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin);
      if (hasAbsence) return;
      const ch = chauffeurs.find(c => c.id === p.chauffeurId);
      if (!ch || ch.statut === 'inactif') return;
      const redevance = (p.redevanceOverride > 0) ? p.redevanceOverride : (ch.redevanceQuotidienne || 0);
      if (redevance > 0) totalAttenduMonth += redevance;
    });
    const tauxRecouvrement = totalAttenduMonth > 0 ? Math.min(Math.round((totalVerseMonth / totalAttenduMonth) * 100), 100) : (totalVerseMonth > 0 ? 100 : 0);
    const totalAttendu = totalAttenduMonth;

    // =================== DÉPENSES VÉHICULES ===================
    const depenses = Store.get('depenses') || [];
    const monthDepenses = depenses.filter(dep => matchesPeriod(dep.date));
    const totalDepensesMois = monthDepenses.reduce((s, d) => s + (d.montant || 0), 0);
    const depensesByType = {};
    monthDepenses.forEach(d => {
      depensesByType[d.typeDepense] = (depensesByType[d.typeDepense] || 0) + d.montant;
    });

    // =================== DETTES & PERTES ===================
    // Utilise la fonction partagée Utils.computeDebts() pour cohérence avec VersementsPage
    const debtData = Utils.computeDebts({
      versements, chauffeurs, planning, absences,
      contraventions: Store.get('contraventions') || [],
      caJour: Store.get('caJour') || [],
      charges: Store.get('charges') || []
    });
    const totalDettes = debtData.totalDettes;
    const totalPertes = debtData.totalPertes;
    const nbDetteDrivers = debtData.nbDetteDrivers;
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
    // Ce bloc s'appelle « Planning semaine » : il doit montrer qui est
    // PROGRAMME. Ne garder que le statut « actif » en excluait des chauffeurs
    // ayant pourtant un creneau — « repos » decrit l'etat du JOUR, pas une
    // indisponibilite pour la semaine. Le tableau de bord annoncait alors deux
    // chauffeurs la ou le planning en montrait trois.
    const joursSemaine = new Set(heatmapWeekDays.map(d => d.date));
    const programmesSemaine = new Set(
      (planning || []).filter(p => joursSemaine.has(p.date)).map(p => p.chauffeurId)
    );
    const activeDrivers = chauffeurs
      .filter(c => c.statut === 'actif' || programmesSemaine.has(c.id))
      .sort((a, b) => (a.prenom || '').localeCompare(b.prenom || ''));
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
        const hasVersement = versements.some(v => v.chauffeurId === c.id && v.date === wd.date && (v.statut === 'valide' || v.statut === 'supprime' || v.statut === 'perte'));
        return { status: hasVersement ? 'verse' : 'en_retard', heures, shiftId };
      });
      return { id: c.id, prenom: c.prenom, nom: c.nom, photo: c.photo || '', initials: ((c.prenom||'')[0] + (c.nom||'')[0]).toUpperCase(), vehiculeAssigne: c.vehiculeAssigne || '', cells };
    });

    // =================== TOP CHAUFFEURS — SCORE COMPOSITE ===================
    // Score = 40% recettes + 25% score conduite + 20% regularite versements + 15% contraventions
    const contras = Store.get('contraventions') || [];
    const infractions = Store.get('infractionsVitesse') || [];
    const activeChauffeurs = chauffeurs.filter(c => c.statut === 'actif' || c.statut === 'repos');

    // Calcul du CA max du mois pour normaliser
    const revenueByDriver = {};
    versements.filter(v => v.statut !== 'supprime' && v.montantVerse > 0 && matchesMonth(v.date)).forEach(v => {
      revenueByDriver[v.chauffeurId] = (revenueByDriver[v.chauffeurId] || 0) + v.montantVerse;
    });
    const maxCA = Math.max(...Object.values(revenueByDriver), 1);

    const topDriversRevenue = activeChauffeurs.map(ch => {
      const cId = ch.id;

      // 1. Score recettes (40%) — normalisé par rapport au meilleur CA
      const ca = revenueByDriver[cId] || 0;
      const scoreRecettes = Math.min((ca / maxCA) * 100, 100);

      // 2. Score conduite (25%) — directement le scoreConduite du chauffeur
      const scoreConduite = ch.scoreConduite || 0;

      // 3. Regularite versements (20%) — % de jours planifiés avec versement ce mois
      const planningMois = planning.filter(p => p.chauffeurId === cId && matchesMonth(p.date));
      const versementsMois = versements.filter(v => v.chauffeurId === cId && matchesMonth(v.date) && (v.statut === 'valide' || v.statut === 'supprime'));
      const nbPlanifie = planningMois.length || 1;
      const nbVerse = Math.min(versementsMois.length, nbPlanifie);
      const scoreRegularite = (nbVerse / nbPlanifie) * 100;

      // 4. Contraventions/Infractions (15%) — penalite par infraction
      const nbContras = contras.filter(c => c.chauffeurId === cId && matchesMonth(c.date)).length;
      const nbInfractions = infractions.filter(inf => inf.chauffeurId === cId && matchesMonth(inf.date)).length;
      const penalite = (nbContras * 15) + (nbInfractions * 5);
      const scoreContra = Math.max(100 - penalite, 0);

      // Score global pondere
      const scoreGlobal = Math.round(
        (scoreRecettes * 0.40) +
        (scoreConduite * 0.25) +
        (scoreRegularite * 0.20) +
        (scoreContra * 0.15)
      );

      return {
        chauffeurId: cId,
        nom: `${ch.prenom} ${ch.nom}`,
        total: scoreGlobal,
        ca,
        scoreConduite: Math.round(scoreConduite),
        regularite: Math.round(scoreRegularite),
        nbContras: nbContras + nbInfractions
      };
    })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // =================== TOP CHAUFFEURS PAR DETTES ===================
    const topDriversDettes = debtData.detteList.slice(0, 5);

    // =================== DOCUMENTS EXPIRANT SOUS 30 JOURS ===================
    const docFields = [
      { field: 'dateExpirationPermis', label: 'Permis' },
      { field: 'dateExpirationVTC', label: 'Carte VTC' },
      { field: 'dateExpirationVisite', label: 'Visite médicale' }
    ];
    const expiringDocs = [];
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);
    chauffeurs.filter(c => c.statut !== 'inactif').forEach(c => {
      docFields.forEach(df => {
        const dateStr = c[df.field];
        if (!dateStr) return;
        const expDate = new Date(dateStr);
        if (expDate <= in30Days && expDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          const daysLeft = Math.ceil((expDate - now) / 86400000);
          expiringDocs.push({ chauffeurId: c.id, nom: `${c.prenom} ${c.nom}`, docLabel: df.label, dateExpiration: dateStr, daysLeft });
        }
      });
    });
    expiringDocs.sort((a, b) => a.daysLeft - b.daysLeft);

    // Montant ATTENDU en versement aujourd'hui : ce que la flotte doit verser.
    //  - locataire programmé : sa redevance du jour ;
    //  - salarié : son CA brut Yango du jour moins ses charges (>0).
    const jourAtt = now.toISOString().split('T')[0];
    const _plan = Store.get('planning') || [];
    const _caj = Store.get('caJour') || [];
    const _chg = Store.get('charges') || [];
    const _abs = Store.get('absences') || [];
    const chById2 = new Map((chauffeurs || []).map(c => [c.id, c]));
    const absentCe = (id) => _abs.some(a => a.chauffeurId === id && jourAtt >= a.dateDebut && jourAtt <= a.dateFin);
    const chargesJ = {};
    _chg.filter(c => String(c.date).slice(0, 10) === jourAtt)
        .forEach(c => { chargesJ[c.chauffeurId] = (chargesJ[c.chauffeurId] || 0) + (Number(c.montant) || 0); });
    let versementAttenduJour = 0;
    let nbActifsJour = 0;   // salariés ayant roulé aujourd'hui (activité en cours)
    const dejaComptes = new Set();
    _plan.filter(p => p.date === jourAtt).forEach(p => {
      const ch = chById2.get(p.chauffeurId);
      if (!ch || ch.statut === 'inactif' || ch.typeContrat === 'salarie' || absentCe(ch.id)) return;
      if (dejaComptes.has(ch.id)) return; dejaComptes.add(ch.id);
      const r = (p.redevanceOverride != null && p.redevanceOverride > 0) ? p.redevanceOverride : (ch.redevanceQuotidienne || 0);
      versementAttenduJour += r;
    });
    _caj.filter(e => String(e.date).slice(0, 10) === jourAtt).forEach(e => {
      const ch = chById2.get(e.chauffeurId);
      if (!ch || ch.statut === 'inactif' || ch.typeContrat !== 'salarie' || absentCe(ch.id)) return;
      const du = (Number(e.caBrut) || 0) - (chargesJ[ch.id] || 0);
      if (du > 0) { versementAttenduJour += du; nbActifsJour++; }
    });

    // === ACTIVITÉ DU JOUR (CA en direct) + rythme (alerte si anormalement bas) ===
    const estSalarieActif = (id) => { const ch = chById2.get(id); return ch && ch.statut !== 'inactif' && ch.typeContrat === 'salarie' && !absentCe(id); };
    const _cajToday = _caj.filter(e => String(e.date).slice(0, 10) === jourAtt && estSalarieActif(e.chauffeurId));
    const caBrutJour = _cajToday.reduce((s, e) => s + (Number(e.caBrut) || 0), 0);
    const programmesJourSet = new Set(_plan.filter(p => p.date === jourAtt).map(p => p.chauffeurId));
    // Activité par chauffeur (CA du jour), pour les chips
    const caParChJour = {}; _cajToday.forEach(e => { caParChJour[e.chauffeurId] = { ca: Number(e.caBrut) || 0, courses: Number(e.nbCourses) || 0 }; });
    // Chauffeurs PROGRAMMÉS aujourd'hui (planning) + leur activité
    const _progMap = new Map();
    _plan.filter(p => p.date === jourAtt).forEach(p => {
      const ch = chById2.get(p.chauffeurId);
      if (!ch || ch.statut === 'inactif' || absentCe(ch.id) || _progMap.has(ch.id)) return;
      const a = caParChJour[ch.id] || { ca: 0, courses: 0 };
      _progMap.set(ch.id, { prenom: ch.prenom, nom: ch.nom, ca: a.ca, courses: a.courses, actif: a.ca > 0 });
    });
    const chauffeursProgrammes = [..._progMap.values()].sort((a, b) => b.ca - a.ca);
    const nbProgrammesJour = chauffeursProgrammes.length;
    const nbProgrammesActifs = chauffeursProgrammes.filter(c => c.actif).length;
    // Chauffeurs qui roulent SANS être au planning (anomalie → alerte)
    const chauffeursHorsPlanning = _cajToday
      .filter(e => (Number(e.caBrut) || 0) > 0 && !programmesJourSet.has(e.chauffeurId))
      .map(e => { const ch = chById2.get(e.chauffeurId); return { prenom: ch.prenom, nom: ch.nom, ca: Number(e.caBrut) || 0 }; })
      .sort((a, b) => b.ca - a.ca);
    const nbHorsPlanning = chauffeursHorsPlanning.length;
    // CA réel du mois (source : fleet_ca_jour), pour remplacer l'ancien « versé = 0 »
    const _moisPrefix = jourAtt.slice(0, 7);
    const caReelMois = _caj.filter(e => String(e.date).slice(0, 7) === _moisPrefix).reduce((s, e) => s + (Number(e.caBrut) || 0), 0);
    // Référence : CA médian d'une journée travaillée récente (jours échus, 21 j glissants)
    const _refDebut = (() => { const dd = new Date(now); dd.setDate(dd.getDate() - 21); return dd.toISOString().slice(0, 10); })();
    const _refVals = _caj.filter(e => { const dt = String(e.date).slice(0, 10); return dt >= _refDebut && dt < jourAtt && (Number(e.caBrut) || 0) > 0; })
      .map(e => Number(e.caBrut) || 0).sort((a, b) => a - b);
    const refParChauffeur = _refVals.length ? _refVals[Math.floor(_refVals.length / 2)] : 65000;
    // « Journée type » = CA médian d'un chauffeur × nombre en activité. On ne juge le
    // CA « bas » que le SOIR : la recette VTC se fait surtout la nuit, donc à 15h être
    // à 20 % d'une journée type est NORMAL (la journée n'est pas finie), pas anormal.
    const objectifJourActifs = Math.round(refParChauffeur * nbActifsJour);
    const pctJourType = objectifJourActifs > 0 ? (caBrutJour / objectifJourActifs) : 0;
    const _heureDec = now.getUTCHours() + now.getUTCMinutes() / 60; // Abidjan = UTC
    const _soir = _heureDec >= 19 || _heureDec < 5; // soirée/nuit : la journée de travail est faite
    let paceState = 'neutre', paceLabel = 'En attente d’activité';
    if (nbActifsJour > 0) {
      if (pctJourType >= 0.85) { paceState = 'bon'; paceLabel = 'Journée type atteinte'; }
      else if (_soir && pctJourType < 0.5) { paceState = 'faible'; paceLabel = 'CA anormalement bas'; }
      else if (_soir && pctJourType < 0.75) { paceState = 'modere'; paceLabel = 'Journée sous la moyenne'; }
      else { paceState = 'demarrage'; paceLabel = 'Journée en cours'; }
    }

    return {
      versementAttenduJour, nbActifsJour,
      caBrutJour, caReelMois, chauffeursProgrammes, nbProgrammesJour, nbProgrammesActifs, chauffeursHorsPlanning, nbHorsPlanning, refParChauffeur, objectifJourActifs, pctJourType, paceState, paceLabel,
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
      tauxRecouvrement, totalAttendu, totalVerseMonth,
      serviceEnCours, serviceEnPause, serviceTermine, servicePasCommence, programmesCount,
      heatmapWeekDays, heatmapDrivers,
      periodLabel, monthLabel, isMonthView,
      topDriversRevenue, topDriversDettes, expiringDocs,
      // === PRÉVISIONS CA ===
      ...this._computeForecasts(monthlyRevenue, versements, chauffeurs, planning, absences, thisMonth, thisYear, sel, isMonthView, totalVerseMonth)
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
    // Couleur fixe par carte pour les différencier (alignée sur la couleur de l'icône) :
    // Recouvrement = émeraude, Objectif = indigo.
    const recouvrementColor = '#10b981';
    const progressColor = '#5D87FF';
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

    // SVG radial tick gauge (demi-cercle de rayons) — style "Objectif flotte"
    const radialGauge = (pct, color) => {
      const N = 24;                       // nombre de rayons
      const cx = 100, cy = 104;           // centre (bas du demi-cercle)
      const rInner = 66, rOuter = 94;     // rayons interne/externe des traits
      const safe = Math.min(Math.max(pct || 0, 0), 100);
      const active = Math.round(safe / 100 * N);
      let ticks = '';
      for (let i = 0; i < N; i++) {
        const f = N === 1 ? 0 : i / (N - 1);
        const ang = (180 - f * 180) * Math.PI / 180;  // de gauche (180°) à droite (0°)
        const cos = Math.cos(ang), sin = Math.sin(ang);
        const x1 = (cx + rInner * cos).toFixed(1), y1 = (cy - rInner * sin).toFixed(1);
        const x2 = (cx + rOuter * cos).toFixed(1), y2 = (cy - rOuter * sin).toFixed(1);
        const on = i < active;
        // Rayon inactif : gris semi-transparent visible sur thème clair ET sombre
        // (ne pas utiliser var(--border-color) qui vaut du blanc en thème clair).
        const stroke = on ? color : 'rgba(148,163,184,0.35)';
        ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/>`;
      }
      return `<svg viewBox="0 0 200 116" width="100%" style="display:block;max-width:200px;margin:0 auto;overflow:visible;">${ticks}</svg>`;
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
        @keyframes livePulse { 0%{box-shadow:0 0 0 0 rgba(255,255,255,.55)} 70%{box-shadow:0 0 0 9px rgba(255,255,255,0)} 100%{box-shadow:0 0 0 0 rgba(255,255,255,0)} }
        .live-chip { animation: dSlide .4s ease both; }
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
          background: linear-gradient(135deg, #4570EA 0%, #7c3aed 35%, #a855f7 65%, #c084fc 100%);
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
          font-size: 28px; font-weight: 800; color: var(--text-primary);
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
        .d-tag.purple { background:rgba(99,102,241,.08); color:#5D87FF; }
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
          display:grid; grid-template-columns:minmax(150px,auto) repeat(7,1fr); gap:3px 4px; align-items:center;
        }
        .d-hm-head {
          text-align:center; font-size:11px; font-weight:700; color:#9ca3af; padding:8px 0 6px;
          text-transform:uppercase; letter-spacing:.8px;
          border-bottom:2px solid transparent;
        }
        .d-hm-head.today {
          color:#5D87FF;
          background:linear-gradient(180deg, rgba(99,102,241,.06) 0%, rgba(99,102,241,.02) 100%);
          border-radius:12px 12px 0 0;
          border-bottom:2px solid #5D87FF;
        }
        .d-hm-head .d-hm-daynum { display:block; font-size:16px; font-weight:800; color:var(--text-primary); margin-top:2px; }
        .d-hm-head.today .d-hm-daynum { color:#5D87FF; }
        [data-theme="dark"] .d-hm-head { color:#6b7280; }
        [data-theme="dark"] .d-hm-head.today { background:rgba(99,102,241,.1); }
        [data-theme="dark"] .d-hm-head .d-hm-daynum { color:#d1d5db; }
        .d-hm-driver {
          display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:var(--text-primary);
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
        .hm-programme { background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.1)); color:#5D87FF; }
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
          <div style="font-size:28px;font-weight:800;color:var(--text-primary);letter-spacing:-.6px;margin-top:2px;">${userName} !</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:0;background:var(--bg-secondary);backdrop-filter:blur(12px);border-radius:14px;border:1px solid var(--border-color);padding:3px;">
            <input type="date" id="dashboard-period" value="${this._selectedPeriod || new Date().toISOString().split('T')[0]}" max="${new Date().toISOString().split('T')[0]}" style="font-size:12px;padding:6px 10px;border-radius:11px;background:transparent;border:none;color:var(--text-primary);font-weight:500;outline:none;">
            <button onclick="DashboardPage._toggleMonthView()" style="font-size:12px;padding:6px 14px;border-radius:11px;background:${this._monthView ? '#5D87FF' : 'transparent'};color:${this._monthView ? '#fff' : '#6b7280'};border:none;font-weight:600;cursor:pointer;transition:all .2s;">
              ${this._monthView ? 'Mois' : 'Jour'}
            </button>
            ${this._selectedPeriod || this._monthView ? '<button onclick="DashboardPage._resetToToday()" style="font-size:13px;padding:6px 8px;border-radius:11px;background:transparent;border:none;cursor:pointer;color:#6b7280;"><iconify-icon icon="solar:restart-bold"></iconify-icon></button>' : ''}
          </div>
          ${this._isToday() ? '<span id="live-indicator" style="display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#5D87FF;background:rgba(99,102,241,.08);padding:5px 14px;border-radius:20px;font-weight:700;backdrop-filter:blur(8px);"><span style="width:6px;height:6px;border-radius:50%;background:#5D87FF;animation:pulse-dot 2s infinite;"></span>LIVE</span>' : `<span style="font-size:12px;color:#9ca3af;font-weight:500;">${d.periodLabel}</span>`}
          <div style="position:relative;">
            <iconify-icon icon="solar:magnifer-bold" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;color:#9ca3af;pointer-events:none;"></iconify-icon>
            <input type="text" id="dashboard-search" placeholder="Rechercher..." style="padding:8px 14px 8px 34px;font-size:12px;width:160px;border-radius:14px;background:var(--bg-secondary);backdrop-filter:blur(12px);border:1px solid var(--border-color);color:var(--text-primary);outline:none;font-weight:500;" oninput="DashboardPage._filterByDriver(this.value)">
          </div>
        </div>
      </div>

      <!-- Style Dashboard 2 (Spike) : hero d'accueil + trio KPI + barres + line + donut -->
      <style>
        .d2-r1{grid-template-columns:1.7fr 1.15fr;align-items:stretch;}
        .d2-r2{grid-template-columns:1.7fr 1.3fr;align-items:stretch;}
        .d2-r3{grid-template-columns:1.15fr 1fr 1fr;align-items:stretch;}
        .d2-kpis{display:flex;flex-direction:column;gap:16px;}
        .d2-kpi{border-radius:16px;padding:15px 17px;display:flex;flex-direction:column;gap:10px;flex:1;justify-content:center;border:1px solid var(--border-color);text-decoration:none;color:inherit;transition:transform .15s, box-shadow .15s;}
        .d2-kpi:hover{transform:translateY(-2px);box-shadow:var(--shadow-card);}
        .d2-num{font-size:21px;font-weight:800;color:var(--text-primary);line-height:1.05;}
        .d2-pill{display:inline-flex;align-items:center;gap:2px;font-size:11px;font-weight:800;padding:3px 8px;border-radius:20px;}
        @media(max-width:1024px){ .d2-r1,.d2-r2,.d2-r3{grid-template-columns:1fr;} .d2-kpis{flex-direction:row;flex-wrap:wrap;} .d2-kpi{min-width:150px;flex:1 1 150px;} }
        @media(max-width:560px){ .d2-kpis{flex-direction:column;} }
      </style>

      <!-- Row 1 : Hero d'accueil + trio KPI colorés -->
      <div class="d-grid d2-r1">

        <!-- Hero d'accueil (accueil + activité en direct) -->
        <div onclick="DashboardPage._showActiviteDetail()" class="d-card" style="cursor:pointer;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:14px;">
          <div style="position:absolute;top:-50px;right:-40px;width:230px;height:230px;border-radius:50%;background:radial-gradient(circle at 35% 35%, rgba(93,135,255,.16), rgba(93,135,255,0) 70%);pointer-events:none;"></div>

          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;position:relative;">
            <div style="min-width:0;">
              <div style="font-size:23px;font-weight:800;color:var(--text-primary);letter-spacing:-.4px;">${(() => { const h = new Date().getHours(); const g = h < 12 ? 'Bonjour' : (h < 18 ? 'Bon après-midi' : 'Bonsoir'); let p = ''; try { p = (typeof Auth !== 'undefined' && Auth.getSession && (Auth.getSession() || {}).prenom) || ''; } catch (e) {} return g + (p ? ', ' + Utils.escHtml(p) : ''); })()} <span style="font-size:20px;">👋</span></div>
              <div style="font-size:13px;color:var(--text-secondary);font-weight:600;margin-top:3px;">Voici l'activité de votre flotte aujourd'hui.</div>
            </div>
            <div style="width:46px;height:46px;border-radius:13px;background:rgba(93,135,255,.12);color:var(--pilote-blue);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:23px;">
              <iconify-icon icon="solar:wheel-angle-bold-duotone"></iconify-icon>
            </div>
          </div>

          <div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;position:relative;">
            <div>
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.1px;display:flex;align-items:center;gap:7px;">
                <span style="width:8px;height:8px;border-radius:50%;background:var(--danger);"></span>Recette du jour · en direct
              </div>
              <div style="font-size:31px;font-weight:800;letter-spacing:-.5px;color:var(--text-primary);margin-top:6px;">${Utils.formatCurrency(d.caBrutJour)}</div>
            </div>
            <div style="display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${d.paceState === 'faible' ? 'rgba(250,137,107,.15)' : d.paceState === 'bon' ? 'rgba(19,222,185,.15)' : d.paceState === 'modere' ? 'rgba(255,174,31,.16)' : 'var(--bg-tertiary)'};color:${d.paceState === 'faible' ? 'var(--danger-dim)' : d.paceState === 'bon' ? 'var(--success-dim)' : d.paceState === 'modere' ? 'var(--warning-dim)' : 'var(--text-secondary)'};">
              <iconify-icon icon="${d.paceState === 'faible' ? 'solar:danger-triangle-bold' : d.paceState === 'bon' ? 'solar:check-circle-bold' : d.paceState === 'modere' ? 'solar:info-circle-bold' : 'solar:clock-circle-bold'}"></iconify-icon>
              ${d.paceLabel}${d.nbActifsJour > 0 && d.objectifJourActifs > 0 ? ` · ${Math.round(d.pctJourType * 100)}% d'une journée type` : ''}
            </div>
          </div>

          <div style="position:relative;">
            <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:7px;">${d.nbProgrammesJour} chauffeur${d.nbProgrammesJour > 1 ? 's' : ''} programmé${d.nbProgrammesJour > 1 ? 's' : ''}${d.nbProgrammesActifs !== d.nbProgrammesJour ? ` · ${d.nbProgrammesActifs} en activité` : ''}</div>
            ${d.chauffeursProgrammes.length ? `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:3px;">${d.chauffeursProgrammes.map(c => `
              <div class="live-chip" style="flex:0 0 auto;display:flex;align-items:center;gap:8px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:12px;padding:7px 11px 7px 8px;${c.actif ? '' : 'opacity:.6;'}">
                <div style="width:26px;height:26px;border-radius:50%;background:rgba(93,135,255,.12);color:var(--pilote-blue);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;">${Utils.escHtml((c.prenom || '?').charAt(0))}</div>
                <div style="line-height:1.15;">
                  <div style="font-size:12px;font-weight:700;white-space:nowrap;color:var(--text-primary);">${Utils.escHtml(c.prenom)}</div>
                  <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${c.actif ? `${Utils.formatCurrency(c.ca)}${c.courses ? ` · ${c.courses} c.` : ''}` : 'pas encore parti'}</div>
                </div>
              </div>`).join('')}</div>` : '<div style="font-size:12px;color:var(--text-muted);padding:6px 0;">Aucun chauffeur programmé aujourd’hui.</div>'}
            ${d.nbHorsPlanning > 0 ? `<div style="margin-top:9px;display:flex;align-items:center;gap:8px;background:rgba(255,174,31,.14);border-radius:12px;padding:8px 11px;font-size:12px;font-weight:600;color:var(--text-primary);">
              <iconify-icon icon="solar:danger-triangle-bold" style="color:var(--warning);font-size:15px;flex-shrink:0;"></iconify-icon>
              <span><strong>${d.chauffeursHorsPlanning.map(c => Utils.escHtml(c.prenom)).join(', ')}</strong> roule${d.nbHorsPlanning > 1 ? 'nt' : ''} hors planning — à ajouter</span>
            </div>` : ''}
          </div>

          <div style="margin-top:auto;position:relative;display:inline-flex;align-self:flex-start;align-items:center;gap:7px;background:var(--pilote-blue);color:#fff;font-weight:700;font-size:13px;padding:9px 16px;border-radius:12px;box-shadow:0 8px 18px rgba(93,135,255,.32);">
            Voir l'activité du jour <iconify-icon icon="solar:arrow-right-linear"></iconify-icon>
          </div>
        </div>

        <!-- Trio KPI colorés -->
        <div class="d2-kpis">
          <a href="#/versements" class="d2-kpi" style="background:linear-gradient(135deg, rgba(93,135,255,.16), rgba(93,135,255,.02));">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="width:40px;height:40px;border-radius:12px;background:#5D87FF;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 14px rgba(93,135,255,.35);"><iconify-icon icon="solar:safe-2-bold-duotone"></iconify-icon></div>
              <span class="d2-pill" style="background:rgba(2,179,169,.16);color:#02b3a9;"><iconify-icon icon="solar:shield-check-bold"></iconify-icon>${d.tauxRecouvrement}%</span>
            </div>
            <div><div class="d2-num">${Utils.formatCurrency(d.totalAttendu)}</div><div style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-top:3px;">Trésorerie · attendu ce mois</div></div>
            ${(() => {
              const fmtK = n => { n = Math.round(n || 0); const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(',0', '').replace('.0', '').replace('.', ',') + 'M'; if (a >= 1e3) return Math.round(n / 1e3) + 'k'; return String(n); };
              const PAL = { success: ['var(--success-dim)', 'rgba(19,222,185,.14)'], warning: ['var(--warning-dim)', 'rgba(255,174,31,.14)'], danger: ['var(--danger-dim)', 'rgba(250,137,107,.14)'], neutral: ['var(--text-muted)', 'var(--bg-tertiary)'] };
              const w = (icon, label, val, sem) => {
                const [col, bg] = (val > 0) ? PAL[sem] : PAL.neutral;
                return `<div style="flex:1;min-width:0;background:${bg};border-radius:10px;padding:6px 7px;display:flex;flex-direction:column;gap:1px;">
                  <span style="display:flex;align-items:center;gap:3px;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:${col};"><iconify-icon icon="${icon}" style="font-size:10px;"></iconify-icon>${label}</span>
                  <strong style="font-size:12px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fmtK(val)} F</strong>
                </div>`;
              };
              return `<div style="display:flex;gap:6px;margin-top:2px;">${w('solar:check-circle-bold', 'Versé', d.totalVerseMonth, 'success')}${w('solar:danger-triangle-bold', 'Dettes', d.totalDettes, 'warning')}${w('solar:arrow-down-bold', 'Pertes', d.totalPertes, 'danger')}</div>`;
            })()}
          </a>
          <a href="#/versements" class="d2-kpi" style="background:linear-gradient(135deg, rgba(19,222,185,.18), rgba(19,222,185,.02));">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="width:40px;height:40px;border-radius:12px;background:#13DEB9;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 14px rgba(19,222,185,.35);"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
              <span class="d2-pill" style="background:rgba(2,179,169,.16);color:#02b3a9;"><iconify-icon icon="solar:shield-check-bold"></iconify-icon>${d.tauxRecouvrement}%</span>
            </div>
            <div><div class="d2-num">${Utils.formatCurrency(d.totalVerseMonth)}</div><div style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-top:3px;">Versé ce mois</div></div>
          </a>
          <a href="#/rentabilite" class="d2-kpi" style="background:linear-gradient(135deg, rgba(255,174,31,.18), rgba(255,174,31,.02));">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="width:40px;height:40px;border-radius:12px;background:#FFAE1F;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 14px rgba(255,174,31,.35);"><iconify-icon icon="solar:target-bold-duotone"></iconify-icon></div>
              <span class="d2-pill" style="background:rgba(217,144,0,.16);color:#D99000;"><iconify-icon icon="solar:calendar-bold"></iconify-icon>${d.joursRestants}j</span>
            </div>
            <div><div class="d2-num">${d.progressionObjectif}%</div><div style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-top:3px;">Objectif · ${Utils.formatCurrency(d.objectifMensuel)}</div></div>
          </a>
        </div>
      </div>

      <!-- Row 2 : Barres Recette/Attendu + Évolution du CA -->
      <div class="d-grid d2-r2">

        <!-- Recette vs attendu (barres, style Profit & Expenses) -->
        <div class="d-card" style="display:flex;flex-direction:column;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div class="d-icon" style="background:rgba(93,135,255,.12);color:#5D87FF;"><iconify-icon icon="solar:chart-square-bold-duotone"></iconify-icon></div>
            <div><div class="d-lbl" style="margin:0;">Recette vs attendu</div><div class="d-sub" style="margin:0;">8 dernières semaines</div></div>
          </div>
          ${(() => {
            const weeks = (d.weeklyPayments || []).slice(-8);
            const maxV = Math.max(1, ...weeks.map(w => Math.max(w.verse || 0, w.attendu || 0)));
            const sumV = weeks.reduce((s, w) => s + (w.verse || 0), 0);
            const sumA = weeks.reduce((s, w) => s + (w.attendu || 0), 0);
            const bars = weeks.map(w => {
              const vH = (w.verse || 0) / maxV * 100, aH = (w.attendu || 0) / maxV * 100;
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;">
                <div style="width:100%;max-width:32px;display:flex;gap:3px;align-items:flex-end;height:140px;">
                  <div title="Versé ${Utils.formatCurrency(w.verse || 0)}" style="flex:1;background:#5D87FF;border-radius:5px 5px 0 0;height:${vH.toFixed(1)}%;min-height:3px;"></div>
                  <div title="Attendu ${Utils.formatCurrency(w.attendu || 0)}" style="flex:1;background:rgba(93,135,255,.22);border-radius:5px 5px 0 0;height:${aH.toFixed(1)}%;min-height:3px;"></div>
                </div>
                <div style="font-size:9.5px;color:var(--text-muted);font-weight:600;white-space:nowrap;">${Utils.escHtml(w.label || '')}</div>
              </div>`;
            }).join('');
            return `<div style="display:flex;gap:18px;align-items:stretch;flex:1;">
              <div style="flex:1;display:flex;align-items:flex-end;gap:7px;min-width:0;">${bars}</div>
              <div style="width:148px;flex-shrink:0;display:flex;flex-direction:column;justify-content:center;gap:15px;border-left:1px solid var(--border-color);padding-left:18px;">
                <div><div style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-secondary);font-weight:600;"><span style="width:10px;height:10px;border-radius:3px;background:#5D87FF;"></span>Versé</div><div style="font-size:18px;font-weight:800;color:var(--text-primary);margin-top:3px;">${Utils.formatCurrency(sumV)}</div></div>
                <div><div style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-secondary);font-weight:600;"><span style="width:10px;height:10px;border-radius:3px;background:rgba(93,135,255,.30);"></span>Attendu</div><div style="font-size:18px;font-weight:800;color:var(--text-primary);margin-top:3px;">${Utils.formatCurrency(sumA)}</div></div>
                <a href="#/versements" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--pilote-blue);color:#fff;font-weight:700;font-size:12px;padding:9px 12px;border-radius:10px;text-decoration:none;box-shadow:0 6px 14px rgba(93,135,255,.30);">Voir le rapport <iconify-icon icon="solar:arrow-right-linear"></iconify-icon></a>
              </div>
            </div>`;
          })()}
        </div>

        <!-- Évolution du CA (aire lissée) -->
        <div class="d-card" style="display:flex;flex-direction:column;">
          ${(() => {
            const series = (d.monthlyRevenue || []).slice(-12);
            const vals = series.map(s => s.revenue || 0);
            const last = vals.length ? vals[vals.length - 1] : 0;
            const prev = vals.length > 1 ? vals[vals.length - 2] : 0;
            const t = prev > 0 ? Math.round((last - prev) / prev * 100) : (last > 0 ? 100 : 0);
            const up = t >= 0;
            const tColor = up ? '#02b3a9' : '#D9583B';
            const tIcon = up ? 'solar:arrow-right-up-linear' : 'solar:arrow-right-down-linear';
            const W = 640, H = 150, padB = 22, padT = 14, chartH = H - padB - padT;
            const max = Math.max(...vals, 1);
            const n = vals.length;
            const pts = vals.map((v, i) => ({
              x: n > 1 ? +(i / (n - 1) * W).toFixed(2) : W / 2,
              y: +(padT + chartH - (v / max) * chartH).toFixed(2)
            }));
            const smooth = (p) => {
              if (p.length < 2) return p.length ? `M${p[0].x},${p[0].y}` : '';
              let dd = `M${p[0].x},${p[0].y}`;
              for (let i = 0; i < p.length - 1; i++) {
                const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
                const c1x = +(p1.x + (p2.x - p0.x) / 6).toFixed(2);
                const c1y = +(p1.y + (p2.y - p0.y) / 6).toFixed(2);
                const c2x = +(p2.x - (p3.x - p1.x) / 6).toFixed(2);
                const c2y = +(p2.y - (p3.y - p1.y) / 6).toFixed(2);
                dd += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
              }
              return dd;
            };
            const line = smooth(pts);
            const area = pts.length ? `${line} L${W},${padT + chartH} L0,${padT + chartH} Z` : '';
            const endP = pts[pts.length - 1];
            const labels = series.map((s, i) => {
              const show = n <= 8 ? true : ((n - 1 - i) % 2 === 0);
              if (!show) return '';
              const x = n > 1 ? (i / (n - 1) * W) : W / 2;
              const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
              return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="${anchor}" font-size="11" font-weight="600" fill="#7C8FAC">${Utils.escHtml(s.month || '')}</text>`;
            }).join('');
            return `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="d-icon" style="background:rgba(93,135,255,.12);color:#5D87FF;">
                  <iconify-icon icon="solar:graph-new-bold-duotone"></iconify-icon>
                </div>
                <div>
                  <div class="d-lbl" style="margin:0;">Évolution du CA</div>
                  <div class="d-sub" style="margin:0;">12 derniers mois</div>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:22px;font-weight:800;color:var(--text-primary);line-height:1;">${Utils.formatCurrency(last)}</div>
                <div style="display:inline-flex;align-items:center;gap:2px;font-size:12px;font-weight:700;margin-top:5px;color:${tColor};">
                  <iconify-icon icon="${tIcon}"></iconify-icon>${up ? '+' : ''}${t}%
                </div>
              </div>
            </div>
            <div style="flex:1;display:flex;align-items:flex-end;margin-top:8px;">
              <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible;">
                <defs>
                  <linearGradient id="caEvoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#5D87FF" stop-opacity=".26"/>
                    <stop offset="1" stop-color="#5D87FF" stop-opacity="0"/>
                  </linearGradient>
                </defs>
                ${area ? `<path d="${area}" fill="url(#caEvoGrad)"/>` : ''}
                ${line ? `<path d="${line}" fill="none" stroke="#5D87FF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
                ${endP ? `<circle cx="${endP.x}" cy="${endP.y}" r="5.5" fill="#5D87FF" stroke="#fff" stroke-width="3"/>` : ''}
                ${labels}
              </svg>
            </div>`;
          })()}
        </div>
      </div>

      <!-- Row 3 : Répartition + Dettes + Pertes -->
      <div class="d-grid d2-r3">

        <!-- Répartition chauffeurs (donut) -->
        <a href="#/chauffeurs" class="d-card" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div class="d-icon" style="background:rgba(19,222,185,.14);color:#02b3a9;">
              <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
            </div>
            <div class="d-lbl" style="margin:0;">Répartition</div>
          </div>
          ${(() => {
            const segs = [
              { label: 'Actifs', value: d.activeCount || 0, color: '#13DEB9' },
              { label: 'Suspendus', value: d.suspendusCount || 0, color: '#FFAE1F' },
              { label: 'Inactifs', value: d.inactifsCount || 0, color: '#C7D0DD' }
            ].filter(s => s.value > 0);
            const total = d.totalChauffeurs || segs.reduce((a, s) => a + s.value, 0);
            const cx = 70, cy = 70, r = 54, sw = 16, C = 2 * Math.PI * r;
            const GAP = segs.length > 1 ? 6 : 0;
            let off = 0;
            const arcs = segs.map(s => {
              const frac = total > 0 ? s.value / total : 0;
              const dash = Math.max(0, frac * C - GAP);
              const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
              off += frac * C;
              return el;
            }).join('');
            const legend = segs.map(s => `
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div class="d-legend"><span class="d-legend-dot" style="background:${s.color};"></span>${s.label}</div>
                <strong style="font-size:13px;color:var(--text-primary);">${s.value}</strong>
              </div>`).join('');
            return `
            <div style="display:flex;flex-direction:column;align-items:center;gap:16px;flex:1;justify-content:center;">
              <svg width="150" height="150" viewBox="0 0 140 140">
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EBF1F6" stroke-width="${sw}"/>
                ${arcs}
                <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="30" font-weight="800" fill="#2A3547">${total}</text>
                <text x="${cx}" y="${cy + 17}" text-anchor="middle" font-size="12" font-weight="600" fill="#7C8FAC">chauffeurs</text>
              </svg>
              <div style="display:flex;flex-direction:column;gap:9px;width:100%;">
                ${legend}
              </div>
            </div>`;
          })()}
        </a>

        <!-- Dettes -->
        <a href="#/versements" class="d-card" style="text-decoration:none;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="width:46px;height:46px;border-radius:13px;background:${d.totalDettes > 0 ? 'rgba(255,174,31,.14)' : 'var(--bg-tertiary)'};color:${d.totalDettes > 0 ? 'var(--warning-dim)' : 'var(--text-muted)'};display:flex;align-items:center;justify-content:center;font-size:22px;">
              <iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon>
            </div>
            <div style="margin:0;color:var(--text-muted);font-weight:500;">Dettes</div>
          </div>
          <div style="font-size:24px;font-weight:800;color:var(--text-primary);">${Utils.formatCurrency(d.totalDettes)}</div>
          <div style="color:var(--text-muted);font-size:13px;margin-top:2px;">${d.nbDetteDrivers} chauffeur${d.nbDetteDrivers !== 1 ? 's' : ''}</div>
          <div class="d-bar-track" style="margin-top:12px;background:var(--bg-tertiary);">
            <div class="d-bar-fill" style="width:${d.totalAttendu > 0 ? Math.min(d.totalDettes / d.totalAttendu * 100, 100) : 0}%;background:${d.totalDettes > 0 ? 'var(--warning)' : 'var(--text-muted)'};"></div>
          </div>
        </a>

        <!-- Pertes -->
        <a href="#/versements" class="d-card" style="text-decoration:none;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="width:46px;height:46px;border-radius:13px;background:${d.totalPertes > 0 ? 'rgba(250,137,107,.15)' : 'var(--bg-tertiary)'};color:${d.totalPertes > 0 ? 'var(--danger-dim)' : 'var(--text-muted)'};display:flex;align-items:center;justify-content:center;font-size:22px;">
              <iconify-icon icon="solar:arrow-down-bold-duotone"></iconify-icon>
            </div>
            <div style="margin:0;color:var(--text-muted);font-weight:500;">Pertes</div>
          </div>
          <div style="font-size:24px;font-weight:800;color:var(--text-primary);">${Utils.formatCurrency(d.totalPertes)}</div>
          <div style="color:var(--text-muted);font-size:13px;margin-top:2px;">${d.nbPerteDrivers} chauffeur${d.nbPerteDrivers !== 1 ? 's' : ''}</div>
          <div class="d-bar-track" style="margin-top:12px;background:var(--bg-tertiary);">
            <div class="d-bar-fill" style="width:${d.totalAttendu > 0 ? Math.min(d.totalPertes / d.totalAttendu * 100, 100) : 0}%;background:${d.totalPertes > 0 ? 'var(--danger)' : 'var(--text-muted)'};"></div>
          </div>
        </a>
      </div>

      <!-- Row 3: Mes taches + Alertes (côte à côte) -->
      <div class="d-grid d-g21" style="grid-template-columns:1fr 1fr;align-items:stretch;">
          <!-- Mes taches -->
          ${this._renderMesTaches()}

          <!-- Alertes -->
          ${(() => {
            let aGrad, aShadow;
            if (d.alertesCritiques > 0) {
              aGrad = 'linear-gradient(135deg,#ef4444,#f87171)';
              aShadow = '0 4px 20px rgba(239,68,68,.35)';
            } else if (d.alertesTotal > 0) {
              aGrad = 'linear-gradient(135deg,#f97316,#fb923c)';
              aShadow = '0 4px 20px rgba(249,115,22,.35)';
            } else {
              aGrad = 'linear-gradient(135deg,#22c55e,#4ade80)';
              aShadow = '0 4px 20px rgba(34,197,94,.35)';
            }
            return `<a href="#/alertes" class="d-card" style="text-decoration:none;color:inherit;background:${aGrad};border:none;box-shadow:${aShadow};padding:16px 20px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:${d.alertesCritiques > 0 ? '12px' : '0'};">
              <div style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.15rem;background:rgba(255,255,255,.25);color:#fff;backdrop-filter:blur(4px);">
                <iconify-icon icon="${d.alertesTotal > 0 ? 'solar:bell-bing-bold-duotone' : 'solar:check-circle-bold-duotone'}"></iconify-icon>
              </div>
              <div>
                <div style="font-weight:700;font-size:var(--font-size-sm);color:#fff;margin:0;">Alertes</div>
                <div style="font-size:11px;color:rgba(255,255,255,.8);">${d.alertesTotal > 0 ? d.alertesTotal + ' alerte' + (d.alertesTotal > 1 ? 's' : '') : 'Tout est OK'}</div>
              </div>
            </div>
            ${d.alertesCritiques > 0 || d.alertesUrgentes > 0 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-left:52px;">
              ${d.alertesCritiques > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:rgba(255,255,255,.2);color:#fff;">${d.alertesCritiques} critique${d.alertesCritiques > 1 ? 's' : ''}</span>` : ''}
              ${d.alertesUrgentes > 0 ? `<span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:rgba(255,255,255,.2);color:#fff;">${d.alertesUrgentes} urgent${d.alertesUrgentes > 1 ? 's' : ''}</span>` : ''}
            </div>` : ''}
          </a>`;
          })()}
      </div>

      <!-- Row 3.5: Planning Heatmap -->
      <div class="d-grid" style="grid-template-columns:1fr;">
        ${this._renderPlanningHeatmap(d)}
      </div>

      <!-- Row 4: Top chauffeurs + Documents & Maintenance -->
      <div class="d-grid d-g3" style="grid-template-columns:1fr 1fr 1fr;">
        ${this._renderTopDriversRevenue(d)}
        ${this._renderTopDriversDettes(d)}
        <div>${this._renderExpiringDocs(d)}${this._renderMaintenancePanel(d)}</div>
      </div>

      </div>
      </div>
    `;
  },

  _renderMesTaches() {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    // Chauffeurs n'ont pas accès aux taches
    if (session && session.role === 'chauffeur') return '';
    const userId = session ? session.userId : '';
    const isAdmin = session && session.role === 'Administrateur';
    const allTaches = Store.get('taches') || [];

    // Admin: taches qu'il a creees (attribuees aux autres)
    // Non-admin: taches qui lui sont assignees
    const toutesLesMiennes = isAdmin
      ? allTaches.filter(t => t.creePar === userId)
      : allTaches.filter(t => t.assigneA === userId);
    const mesTaches = toutesLesMiennes.filter(t => t.statut !== 'terminee' && t.statut !== 'annulee');
    const terminees = toutesLesMiennes.filter(t => t.statut === 'terminee').length;

    const aFaire = mesTaches.filter(t => t.statut === 'a_faire').length;
    const enCours = mesTaches.filter(t => t.statut === 'en_cours').length;
    const urgentes = mesTaches.filter(t => t.priorite === 'urgente').length;
    const enRetard = mesTaches.filter(t => t.dateEcheance && t.dateEcheance < new Date().toISOString().split('T')[0]).length;

    // Top 3 taches les plus urgentes
    const top3 = [...mesTaches].sort((a, b) => {
      const pOrd = { urgente: 0, haute: 1, normale: 2, basse: 3 };
      return (pOrd[a.priorite] ?? 2) - (pOrd[b.priorite] ?? 2);
    }).slice(0, 3);

    const statutLabels = { a_faire: 'A faire', en_cours: 'En cours', terminee: 'Terminee' };

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
    const totalMiennes = mesTaches.length + terminees;
    const subtitle = isAdmin
      ? `${totalMiennes} tache${totalMiennes !== 1 ? 's' : ''} dont ${terminees} terminee${terminees !== 1 ? 's' : ''}`
      : `${mesTaches.length} en cours / a faire, ${terminees} terminee${terminees !== 1 ? 's' : ''}`;
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
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${top3.length > 0 ? '10px' : '0'};">
          <div style="display:flex;align-items:center;gap:4px;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.2);flex:1;min-width:0;">
            <span style="width:6px;height:6px;border-radius:50%;background:#fbbf24;flex-shrink:0;"></span>
            <span style="font-size:10px;color:rgba(255,255,255,.85);white-space:nowrap;">A faire</span>
            <strong style="margin-left:auto;font-size:12px;color:#fff;">${aFaire}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:4px;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.2);flex:1;min-width:0;">
            <span style="width:6px;height:6px;border-radius:50%;background:#60a5fa;flex-shrink:0;"></span>
            <span style="font-size:10px;color:rgba(255,255,255,.85);white-space:nowrap;">En cours</span>
            <strong style="margin-left:auto;font-size:12px;color:#fff;">${enCours}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:4px;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.15);flex:1;min-width:0;">
            <span style="width:6px;height:6px;border-radius:50%;background:#4ade80;flex-shrink:0;"></span>
            <span style="font-size:10px;color:rgba(255,255,255,.85);white-space:nowrap;">Termin.</span>
            <strong style="margin-left:auto;font-size:12px;color:#fff;">${terminees}</strong>
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
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Maintenance OK</div>
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
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${typeLabel} <span class="d-tag ${isRetard ? 'red' : 'orange'}" style="font-size:9px;padding:1px 6px;">${badgeLabel}</span></div>
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
          <div class="d-lbl" style="margin:0;font-size:14px;font-weight:700;color:var(--text-primary);">Maintenance</div>
        </div>
        <a href="#/garage" style="font-size:11px;font-weight:600;color:#5D87FF;text-decoration:none;">Voir tout →</a>
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
        <div class="d-icon" style="background:rgba(99,102,241,.08);color:#5D87FF;"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon></div>
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Planning semaine</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Aucun chauffeur actif</div>
        </div>
      </div>`;
    }

    const vehicules = Store.get('vehicules') || [];
    const vehMap = {};
    vehicules.forEach(v => { vehMap[v.id] = v.immatriculation || `${v.marque} ${v.modele}`; });
    // Reverse map: chauffeurId → plaque (via Vehicule.chauffeurAssigne)
    const chauffeurPlaqueMap = {};
    vehicules.forEach(v => {
      if (v.chauffeurAssigne) chauffeurPlaqueMap[v.chauffeurAssigne] = v.immatriculation || `${v.marque} ${v.modele}`;
    });

    const statusLabels = { verse: 'Versé', programme: 'Programmé', en_retard: 'En retard', absent: 'Absent', repos: 'Repos' };
    const statusColors = { verse: '#10b981', programme: '#5D87FF', en_retard: '#ef4444', absent: '#f97316', repos: '#9ca3af' };
    const MAX_CHIPS = 6;

    // Cartes calendrier par jour (style MAURALEX) : les chauffeurs programmés
    // apparaissent dans le cadre du jour sous forme de puces colorées par statut.
    const dayCards = days.map((wd, ci) => {
      const chips = [];
      drivers.forEach(dr => {
        const cell = dr.cells[ci] || {};
        if (!cell.status || cell.status === 'repos') return;
        const color = statusColors[cell.status] || '#9ca3af';
        const onclick = cell.shiftId ? `event.stopPropagation();DashboardPage._openShift('${cell.shiftId}')` : `event.stopPropagation();Router.navigate('/planning')`;
        const tooltip = `${dr.prenom} ${dr.nom} — ${statusLabels[cell.status]}${cell.heures ? ' (' + cell.heures + ')' : ''}`;
        chips.push(`<div class="d-pcal-chip" title="${tooltip}" onclick="${onclick}">
          <span class="d-pcal-dot" style="background:${color};"></span><span class="d-pcal-chip-txt">${dr.prenom.split(' ')[0]} ${dr.nom.charAt(0)}.${cell.status === 'programme' && cell.heures ? ` <span class="d-pcal-time">${cell.heures}</span>` : ''}</span>
        </div>`);
      });
      const visible = chips.slice(0, MAX_CHIPS);
      const overflow = chips.length - visible.length;
      const numHtml = wd.isToday
        ? `<span class="d-pcal-num d-pcal-today">${wd.dayNum}</span>`
        : `<span class="d-pcal-num">${wd.dayNum}</span>`;
      return `<div class="d-pcal-cell${wd.isToday ? ' d-pcal-cell-today' : ''}" onclick="Router.navigate('/planning')" title="Voir le planning">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          ${numHtml}
          <span style="font-size:9px;font-weight:700;letter-spacing:.08em;color:var(--text-muted);">${wd.label.toUpperCase()}</span>
        </div>
        <div class="d-pcal-chips">${visible.join('')}${overflow > 0 ? `<div class="d-pcal-more">+${overflow} autre${overflow > 1 ? 's' : ''}</div>` : ''}</div>
      </div>`;
    }).join('');

    let html = `
      <style>
        .d-pcal-wrap { overflow-x:auto; }
        .d-pcal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; min-width:640px; animation:dSlide .5s cubic-bezier(.16,1,.3,1); }
        .d-pcal-cell { border:1px solid var(--border-color); border-radius:12px; background:var(--bg-secondary); min-height:120px; padding:8px; cursor:pointer; transition:border-color .15s, box-shadow .15s; display:flex; flex-direction:column; gap:5px; }
        .d-pcal-cell:hover { border-color:#5D87FF; box-shadow:0 2px 10px rgba(99,102,241,.10); }
        .d-pcal-cell-today { border-color:rgba(99,102,241,.45); }
        .d-pcal-num { font-size:12px; font-weight:700; color:var(--text-primary); line-height:22px; }
        .d-pcal-today { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:var(--text-primary); color:var(--bg-secondary); font-weight:800; }
        .d-pcal-chips { display:flex; flex-direction:column; gap:3px; overflow:hidden; }
        .d-pcal-chip { display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:600; color:var(--text-secondary); background:var(--bg-tertiary); border-radius:5px; padding:2px 5px; white-space:nowrap; overflow:hidden; }
        .d-pcal-chip:hover { background:var(--border-color); }
        .d-pcal-chip-txt { overflow:hidden; text-overflow:ellipsis; }
        .d-pcal-time { font-weight:500; color:var(--text-muted); font-size:8.5px; }
        .d-pcal-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
        .d-pcal-more { font-size:9px; font-weight:600; color:var(--text-muted); padding-left:2px; }
      </style>
      <div class="d-pcal-wrap"><div class="d-pcal-grid">${dayCards}</div></div>`;

    // Legend — modern pills
    html += `<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;justify-content:center;">
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(16,185,129,.08);font-size:11px;font-weight:600;color:#10b981;"><span style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span> Versé</div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(99,102,241,.08);font-size:11px;font-weight:600;color:#5D87FF;"><span style="width:6px;height:6px;border-radius:50%;background:#5D87FF;"></span> Programmé</div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(239,68,68,.08);font-size:11px;font-weight:600;color:#ef4444;"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span> En retard</div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(249,115,22,.08);font-size:11px;font-weight:600;color:#f97316;"><span style="width:6px;height:6px;border-radius:50%;background:#f97316;"></span> Absent</div>
      <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(0,0,0,.03);font-size:11px;font-weight:600;color:#9ca3af;"><span style="width:6px;height:6px;border-radius:50%;background:#d1d5db;"></span> Repos</div>
    </div>`;

    return `<div class="d-card" style="padding:24px 20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#5D87FF,#4570EA);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(99,102,241,.25);">
            <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:18px;color:#fff;"></iconify-icon>
          </div>
          <div>
            <div style="font-size:15px;font-weight:800;color:var(--text-primary);letter-spacing:-.3px;">Planning semaine</div>
            <div style="font-size:11px;color:#9ca3af;font-weight:500;margin-top:1px;">${drivers.length} chauffeur${drivers.length > 1 ? 's' : ''} actif${drivers.length > 1 ? 's' : ''}</div>
          </div>
        </div>
        <a href="#/planning" style="font-size:11px;font-weight:600;color:#5D87FF;text-decoration:none;">Voir tout →</a>
      </div>
      ${html}
    </div>`;
  },

  // =================== TOP CHAUFFEURS & DOCS WIDGETS ===================

  _renderTopDriversRevenue(d) {
    const drivers = d.topDriversRevenue || [];
    const maxVal = drivers.length > 0 ? drivers[0].total : 1;
    const rows = drivers.length > 0 ? drivers.map((dr, i) => {
      const pct = maxVal > 0 ? Math.round((dr.total / maxVal) * 100) : 0;
      const medals = ['#f59e0b', '#9ca3af', '#cd7f32'];
      const medalColor = i < 3 ? medals[i] : '';
      const scoreColor = dr.total >= 75 ? '#22c55e' : dr.total >= 50 ? '#f59e0b' : '#ef4444';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.02);border:1px solid rgba(0,0,0,.03);cursor:pointer;" onclick="Router.navigate('/classement')">
        <div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;${medalColor ? 'background:' + medalColor + '20;color:' + medalColor : 'background:rgba(0,0,0,.04);color:#9ca3af;'}">${i + 1}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${dr.nom}</div>
          <div style="display:flex;gap:6px;margin-top:4px;font-size:9px;color:var(--text-muted);">
            <span title="Recettes">${Utils.formatCurrency(dr.ca)}</span>
            <span>•</span>
            <span title="Conduite">${dr.scoreConduite}/100</span>
            <span>•</span>
            <span title="Regularite">${dr.regularite}%</span>
            ${dr.nbContras > 0 ? '<span>•</span><span style="color:#ef4444;" title="Infractions">' + dr.nbContras + ' inf.</span>' : ''}
          </div>
        </div>
        <div style="font-size:14px;font-weight:800;color:${scoreColor};white-space:nowrap;">${dr.total}<span style="font-size:9px;font-weight:600;opacity:.7">/100</span></div>
      </div>`;
    }).join('') : '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:20px 0;">Aucun chauffeur actif</div>';

    return `<div class="d-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div class="d-icon" style="background:rgba(99,102,241,.08);color:#5D87FF;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;">
          <iconify-icon icon="solar:cup-star-bold-duotone"></iconify-icon>
        </div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Top 5 chauffeurs</div>
          <div style="font-size:11px;color:#9ca3af;">Score global (${d.monthLabel})</div>
        </div>
        <a href="#/classement" style="font-size:11px;font-weight:600;color:#5D87FF;text-decoration:none;">Voir tout &rarr;</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">${rows}</div>
    </div>`;
  },

  _renderTopDriversDettes(d) {
    const drivers = d.topDriversDettes || [];
    const maxVal = drivers.length > 0 ? drivers[0].total : 1;
    const rows = drivers.length > 0 ? drivers.map((dr, i) => {
      const pct = maxVal > 0 ? Math.round((dr.total / maxVal) * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.02);border:1px solid rgba(0,0,0,.03);cursor:pointer;" onclick="Router.navigate('/versements');setTimeout(()=>{var el=document.getElementById('dette-section-recettes');if(el)el.scrollIntoView({behavior:'smooth'})},500)">
        <div style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:rgba(239,68,68,.1);color:#ef4444;">${i + 1}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${dr.nom}</div>
          <div style="height:4px;border-radius:2px;background:rgba(0,0,0,.06);margin-top:4px;"><div style="height:100%;border-radius:2px;background:linear-gradient(90deg,#ef4444,#f87171);width:${pct}%;transition:width .6s ease;"></div></div>
        </div>
        <div style="font-size:12px;font-weight:700;color:#ef4444;white-space:nowrap;">${Utils.formatCurrency(dr.total)}</div>
      </div>`;
    }).join('') : '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:20px 0;">Aucune dette en cours</div>';

    return `<div class="d-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div class="d-icon" style="background:rgba(239,68,68,.08);color:#ef4444;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;">
          <iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon>
        </div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Top 5 dettes</div>
          <div style="font-size:11px;color:#9ca3af;">${drivers.length} chauffeur${drivers.length !== 1 ? 's' : ''} &bull; Total ${Utils.formatCurrency(d.totalDettes)}</div>
        </div>
        <a href="#/versements" onclick="setTimeout(()=>{var el=document.getElementById('dette-section-recettes');if(el)el.scrollIntoView({behavior:'smooth'})},500)" style="font-size:11px;font-weight:600;color:#5D87FF;text-decoration:none;">Voir tout &rarr;</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">${rows}</div>
    </div>`;
  },

  _renderExpiringDocs(d) {
    const docs = d.expiringDocs || [];
    const rows = docs.length > 0 ? docs.slice(0, 8).map(doc => {
      const urgencyColor = doc.daysLeft <= 7 ? '#ef4444' : doc.daysLeft <= 15 ? '#f97316' : '#d97706';
      const badgeLabel = doc.daysLeft === 0 ? "Aujourd'hui" : doc.daysLeft + 'j';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.02);border:1px solid rgba(0,0,0,.03);">
        <div style="width:6px;height:6px;border-radius:50%;background:${urgencyColor};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${doc.nom}</div>
          <div style="font-size:10px;color:#9ca3af;">${doc.docLabel}</div>
        </div>
        <div style="font-size:10px;font-weight:700;color:${urgencyColor};white-space:nowrap;padding:2px 8px;border-radius:8px;background:${urgencyColor}15;">${badgeLabel}</div>
      </div>`;
    }).join('') : '<div style="font-size:12px;color:#10b981;text-align:center;padding:20px 0;"><iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:18px;vertical-align:middle;margin-right:4px;color:#10b981;"></iconify-icon>Tous les documents sont à jour</div>';

    const countColor = docs.length > 5 ? '#ef4444' : docs.length > 0 ? '#f97316' : '#10b981';
    return `<div class="d-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div class="d-icon" style="background:${countColor}14;color:${countColor};width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;">
          <iconify-icon icon="solar:document-medicine-bold-duotone"></iconify-icon>
        </div>
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Documents</div>
          <div style="font-size:11px;color:#9ca3af;">${docs.length > 0 ? docs.length + ' expiration' + (docs.length > 1 ? 's' : '') + ' sous 30 jours' : 'Aucune expiration proche'}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">${rows}</div>
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
      const data = this._lastData || this._getData();
      const notifications = data.unpaidItems.map(item => objToSnake({
        id: Utils.generateId('NTF'),
        chauffeurId: item.chauffeurId,
        type: 'deadline_rappel',
        titre: 'Rappel de paiement',
        message: `Redevance du ${Utils.formatDate(item.date)} en attente: ${Utils.formatCurrency(item.totalDu)}`,
        canal,
        statut: 'envoyee',
        dateCreation: new Date().toISOString()
      }));
      const { error } = await supabase.from('fleet_notifications').insert(notifications);
      if (error) { console.error('Notification error:', error); throw error; }
      Toast.success(`${notifications.length} rappel(s) envoy\u00e9(s) avec succ\u00e8s`);
    } catch (err) {
      console.error('[Notifications] Erreur:', err);
      Toast.error('Erreur lors de l\'envoi des rappels');
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
          const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
          const rows = chauffeurs.map(c => objToSnake({
            chauffeurId: c.id,
            type: 'annonce',
            titre: values.titre,
            message: values.message,
            canal: values.canal || 'push',
            statut: 'envoyee'
          }));
          const { error } = await supabase.from('fleet_notifications').insert(rows);
          if (error) { console.error('Notification error:', error); throw error; }
          Toast.success(`Annonce envoy\u00e9e \u00e0 ${rows.length} chauffeur(s)`);
        } catch (err) {
          console.error('[Annonce] Erreur:', err);
          Toast.error('Erreur lors de l\'envoi de l\'annonce');
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

  async _generateReceiptPDF(chauffeurId, date, montant, moyenPaiement, reference) {
    await LazyLibs.jspdf();
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
