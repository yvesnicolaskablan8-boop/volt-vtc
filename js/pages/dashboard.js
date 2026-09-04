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
      const _ps = document.getElementById('header-period-slot');
      if (_ps) _ps.innerHTML = this._renderPeriodPicker();
      this._bindPeriodSelector();
      this._loadFleetStatus(data);
      this._initTaskStack();
      this._loadRecetteLive();
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
    if (this._rtlChart) { this._rtlChart.destroy(); this._rtlChart = null; }
    this._stopAutoRefresh();
    // Vider le sélecteur de date du header (spécifique au tableau de bord)
    const _ps = document.getElementById('header-period-slot');
    if (_ps) _ps.innerHTML = '';
  },

  // Sélecteur de date affiché dans le header global (uniquement sur le dashboard)
  _renderPeriodPicker() {
    const today = new Date().toISOString().split('T')[0];
    return `<div style="display:flex;align-items:center;gap:0;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:3px;">
      <input type="date" id="dashboard-period" value="${this._selectedPeriod || today}" max="${today}" style="font-size:12px;padding:6px 10px;border-radius:9px;background:transparent;border:none;color:var(--text-primary);font-weight:600;outline:none;">
      <button onclick="DashboardPage._toggleMonthView()" style="font-size:12px;padding:6px 14px;border-radius:9px;background:${this._monthView ? 'var(--pilote-blue)' : 'transparent'};color:${this._monthView ? '#fff' : 'var(--text-secondary)'};border:none;font-weight:700;cursor:pointer;">${this._monthView ? 'Mois' : 'Jour'}</button>
      ${this._selectedPeriod || this._monthView ? `<button onclick="DashboardPage._resetToToday()" title="Aujourd'hui" style="font-size:13px;padding:6px 8px;border-radius:9px;background:transparent;border:none;cursor:pointer;color:var(--text-muted);"><iconify-icon icon="solar:restart-bold"></iconify-icon></button>` : ''}
    </div>`;
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

  // Clic sur « À AJOUTER » (chauffeur hors planning) → aller au Planning et
  // ouvrir l'ajout de créneau pré-rempli pour ce chauffeur, ce jour-là.
  _ajouterAuPlanning(chauffeurId) {
    const ov = document.getElementById('activite-detail-overlay'); if (ov) ov.remove();
    const jour = this._selectedPeriod || new Date().toISOString().split('T')[0];
    try { sessionStorage.setItem('pilote_planning_add', JSON.stringify({ chauffeurId, date: jour, returnTo: 'dashboard' })); } catch (_) {}
    if (typeof Router !== 'undefined' && Router.navigate) Router.navigate('/planning');
    else window.location.hash = '#/planning';
  },

  // Page de détail « Activité du jour » (style Spike : thème clair, cartes blanches
  // arrondies, accent bleu, pastilles pastel). S'ouvre au clic sur le hero.
  // Le contenu dynamique (noms) est échappé via Utils.escHtml.
  _showActiviteDetail() {
    // Suit le sélecteur de date du tableau de bord (aujourd'hui par défaut).
    const jour = this._selectedPeriod || new Date().toISOString().split('T')[0];
    const estAujourdhui = jour === new Date().toISOString().split('T')[0];
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
      return { id, prenom: ch.prenom, nom: ch.nom, ca, courses: e ? Number(e.nbCourses) || 0 : 0, programme: planningSet.has(id), roule: ca > 0, charges, verse: verseJour[id] || 0, du: Math.max(0, ca - charges) };
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

    // === Style Modernize / Spike (bleu #5D87FF, cartes arrondies pastel, ombre douce) ===
    const C = {
      bg: '#F5F7FB', card: '#ffffff', head: '#2A3547', mut: '#5A6A85', mut2: '#7C8FAC', bd: '#EBF1F6',
      blue: '#5D87FF', blueS: 'rgba(93,135,255,.10)',
      green: '#02b3a9', greenS: 'rgba(19,222,185,.14)',
      amber: '#D99000', amberS: 'rgba(255,174,31,.16)',
      red: '#D9583B', redS: 'rgba(250,137,107,.14)',
      violet: '#635BFF', violetS: 'rgba(99,91,255,.10)'
    };
    const SH = '0 2px 6px rgba(37,83,185,.10)';
    const cardCss = `background:${C.card};border-radius:18px;box-shadow:${SH};`;
    const money = (n) => Utils.formatCurrency(n);
    const dot = (c) => `<span style="width:7px;height:7px;border-radius:50%;background:${c};display:inline-block;"></span>`;
    const badge = (txt, v) => {
      const st = { green: `background:${C.greenS};color:${C.green};`, amber: `background:${C.amberS};color:${C.amber};`, muted: `background:${C.bg};color:${C.mut2};` };
      return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;${st[v] || st.muted}">${txt}</span>`;
    };
    const stat = (icon, iconColor, tint, label, value, sub) => `
      <div style="background:${tint};border-radius:18px;padding:22px;">
        <div style="width:46px;height:46px;border-radius:13px;background:#fff;color:${iconColor};display:flex;align-items:center;justify-content:center;font-size:23px;box-shadow:0 4px 12px rgba(0,0,0,.06);margin-bottom:16px;"><iconify-icon icon="${icon}"></iconify-icon></div>
        <div style="font-size:26px;font-weight:800;color:${C.head};letter-spacing:-.5px;">${value}</div>
        <div style="font-size:14px;color:${C.mut};font-weight:600;margin-top:3px;">${label}</div>
        ${sub ? `<div style="font-size:12.5px;color:${C.mut2};margin-top:2px;">${sub}</div>` : ''}
      </div>`;
    const totalLine = (label, value, color, strong) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${strong ? `border-top:1px solid ${C.bd};margin-top:2px;padding-top:14px;` : ''}"><span style="font-size:14px;color:${C.mut};font-weight:${strong ? 700 : 500};">${label}</span><strong style="font-size:${strong ? 18 : 15}px;color:${color || C.head};">${value}</strong></div>`;
    const th = (txt, align) => `<th style="text-align:${align || 'left'};padding:11px 14px;font-size:12px;font-weight:600;color:${C.mut2};text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid ${C.bd};">${txt}</th>`;

    // Graphe : recette par chauffeur (barres bleues, façon « Revenue Updates »)
    const topCA = [...lignes].filter(l => l.ca > 0).sort((a, b) => b.ca - a.ca).slice(0, 8);
    const maxCA = topCA.length ? topCA[0].ca : 1;
    const barChart = topCA.length ? `<div style="${cardCss}padding:22px 24px;margin-bottom:24px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
        <div><div style="font-size:17px;font-weight:800;color:${C.head};">Recette par chauffeur</div><div style="font-size:13px;color:${C.mut};margin-top:2px;">Top ${topCA.length} du jour</div></div>
        <div style="font-size:22px;font-weight:800;color:${C.head};">${money(caBrutJour)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px;">
        ${topCA.map(l => `<div style="display:flex;align-items:center;gap:14px;">
          <div style="width:120px;flex-shrink:0;font-size:13px;font-weight:700;color:${C.head};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escHtml(l.prenom)} ${Utils.escHtml((l.nom || '').charAt(0))}.</div>
          <div style="flex:1;height:24px;background:${C.bg};border-radius:8px;overflow:hidden;"><div style="height:100%;width:${(l.ca / maxCA * 100).toFixed(1)}%;background:linear-gradient(90deg,#5D87FF,#8AA8FF);border-radius:8px;min-width:4px;"></div></div>
          <div style="width:100px;flex-shrink:0;text-align:right;font-size:13px;font-weight:800;color:${C.head};">${money(l.ca)}</div>
        </div>`).join('')}
      </div>
    </div>` : '';

    const rows = lignes.map(l => {
      const st = l.roule ? (l.programme ? badge(dot('#13DEB9') + 'En activité', 'green') : badge(dot('#FFAE1F') + 'Hors planning', 'amber')) : badge('Pas parti', 'muted');
      return `<tr style="border-bottom:1px solid ${C.bd};">
        <td style="padding:13px 14px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:38px;height:38px;flex-shrink:0;border-radius:50%;background:${l.programme ? C.blueS : C.amberS};color:${l.programme ? C.blue : C.amber};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;">${Utils.escHtml((l.prenom || '?').charAt(0))}</div>
            <div style="min-width:0;"><div style="font-size:14px;font-weight:700;color:${C.head};">${Utils.escHtml(l.prenom)} ${Utils.escHtml(l.nom)}</div>${l.charges > 0 ? `<div style="font-size:12px;color:${C.mut2};">charges ${money(l.charges)}</div>` : ''}</div>
          </div>
        </td>
        <td style="padding:13px 14px;">${st}</td>
        <td style="padding:13px 14px;text-align:right;font-size:13px;color:${C.mut};">${l.roule ? l.courses : '—'}</td>
        <td style="padding:13px 14px;text-align:right;font-size:13px;color:${C.mut};">${l.verse > 0 ? money(l.verse) : '—'}</td>
        <td style="padding:13px 14px;text-align:right;font-size:14px;font-weight:800;color:${C.head};">${money(l.ca)}</td>
        <td style="padding:13px 14px;text-align:right;">${(l.roule && !l.programme) ? `<button onclick="event.stopPropagation();DashboardPage._ajouterAuPlanning('${l.id}')" style="font-size:12px;font-weight:700;color:#fff;background:${C.blue};border:none;border-radius:9px;padding:6px 12px;cursor:pointer;box-shadow:0 4px 10px rgba(93,135,255,.30);">+ Planning</button>` : ''}</td>
      </tr>`;
    }).join('');
    const tableOrEmpty = lignes.length ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:560px;"><thead><tr>${th('Chauffeur')}${th('Statut')}${th('Courses', 'right')}${th('Versé', 'right')}${th('CA', 'right')}${th('', 'right')}</tr></thead><tbody>${rows}</tbody></table></div>` : `<div style="text-align:center;color:${C.mut2};padding:40px;font-size:14px;">Aucune activité ${estAujourdhui ? 'aujourd’hui' : 'ce jour-là'}.</div>`;

    // Carte « CA du mois » (façon Monthly Earnings) : montant + variation + sparkline
    const _cajAll = Store.get('caJour') || [];
    const _moisPfx = jour.slice(0, 7);
    const _parJour = {};
    _cajAll.forEach(e => { const dt = String(e.date).slice(0, 10); if (dt.slice(0, 7) === _moisPfx) _parJour[dt] = (_parJour[dt] || 0) + (Number(e.caBrut) || 0); });
    const _spark = Object.keys(_parJour).sort().map(k => _parJour[k]);
    const _prevD = new Date(jour + 'T00:00:00'); _prevD.setMonth(_prevD.getMonth() - 1);
    const _prevPfx = `${_prevD.getFullYear()}-${String(_prevD.getMonth() + 1).padStart(2, '0')}`;
    const _caMoisPrev = _cajAll.filter(e => String(e.date).slice(0, 7) === _prevPfx).reduce((s, e) => s + (Number(e.caBrut) || 0), 0);
    const _varPct = _caMoisPrev > 0 ? Math.round((caMois - _caMoisPrev) / _caMoisPrev * 100) : (caMois > 0 ? 100 : 0);
    const sparkline = (vals) => {
      if (!vals || vals.length < 2) return '';
      const W = 320, H = 60, max = Math.max(...vals, 1), n = vals.length;
      const pts = vals.map((v, i) => ({ x: +(i / (n - 1) * W).toFixed(1), y: +(H - 6 - (v / max) * (H - 12)).toFixed(1) }));
      let dd = `M${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2; dd += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x},${p2.y}`; }
      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:60px;display:block;"><defs><linearGradient id="meGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#49BEFF" stop-opacity=".28"/><stop offset="1" stop-color="#49BEFF" stop-opacity="0"/></linearGradient></defs><path d="${dd} L${W},${H} L0,${H} Z" fill="url(#meGrad)"/><path d="${dd}" fill="none" stroke="#49BEFF" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    };
    const monthlyCard = `<div style="${cardCss}padding:24px 28px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:${C.head};">CA du mois</div>
          <div style="font-size:30px;font-weight:800;color:${C.head};margin-top:12px;letter-spacing:-.5px;">${money(caMois)}</div>
          <div style="display:inline-flex;align-items:center;gap:8px;margin-top:9px;">
            <span style="width:24px;height:24px;border-radius:50%;background:${_varPct >= 0 ? C.greenS : C.redS};color:${_varPct >= 0 ? C.green : C.red};display:flex;align-items:center;justify-content:center;font-size:14px;"><iconify-icon icon="${_varPct >= 0 ? 'solar:arrow-right-up-linear' : 'solar:arrow-right-down-linear'}"></iconify-icon></span>
            <span style="font-size:13px;font-weight:700;color:${C.head};">${_varPct >= 0 ? '+' : ''}${_varPct}%</span>
            <span style="font-size:13px;color:${C.mut};">vs mois dernier</span>
          </div>
        </div>
        <div style="width:44px;height:44px;border-radius:50%;background:${C.blue};color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 8px 18px rgba(93,135,255,.32);flex-shrink:0;"><iconify-icon icon="solar:money-bag-bold-duotone"></iconify-icon></div>
      </div>
      <div style="margin-top:16px;">${sparkline(_spark)}</div>
    </div>`;

    const html = `
      <div style="max-width:1120px;margin:0 auto;padding:26px 26px 70px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px;">
          <div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <h2 style="margin:0;font-size:25px;font-weight:800;color:${C.head};letter-spacing:-.6px;">Activité en détail</h2>
              ${estAujourdhui ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:${C.red};background:${C.redS};padding:5px 13px;border-radius:30px;font-weight:800;letter-spacing:.4px;"><span style="width:7px;height:7px;border-radius:50%;background:${C.red};animation:livePulse 1.6s infinite;"></span>EN DIRECT</span>` : ''}
            </div>
            <div style="font-size:14px;color:${C.mut};margin-top:7px;text-transform:capitalize;">${Utils.escHtml(Utils.formatDate(jour))}</div>
          </div>
          <button onclick="document.getElementById('activite-detail-overlay').remove()" style="${cardCss}border:none;width:44px;height:44px;font-size:22px;cursor:pointer;color:${C.mut};display:flex;align-items:center;justify-content:center;flex-shrink:0;">&times;</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:20px;margin-bottom:24px;">
          ${stat('solar:wallet-money-bold-duotone', C.blue, C.blueS, 'Recette du jour', money(caBrutJour), 'à verser')}
          ${stat('solar:users-group-rounded-bold-duotone', C.green, C.greenS, 'Programmés', String(nbProg), nbActifs + ' en activité')}
          ${stat('solar:wheel-angle-bold-duotone', C.amber, C.amberS, 'En activité', String(nbActifs), nbHors > 0 ? nbHors + ' hors planning' : 'tous programmés')}
          ${stat('solar:banknote-2-bold-duotone', C.violet, C.violetS, 'À recouvrer', money(reste), reste > 0 ? 'reste dû' : 'tout est versé')}
        </div>

        ${barChart}

        ${nbHors > 0 ? `<div style="display:flex;align-items:center;gap:14px;background:${C.amberS};border-radius:16px;padding:16px 20px;margin-bottom:24px;">
          <iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:#FFAE1F;font-size:26px;flex-shrink:0;"></iconify-icon>
          <div style="font-size:14px;color:${C.head};font-weight:500;"><strong>${lignes.filter(l => l.roule && !l.programme).map(l => Utils.escHtml(l.prenom)).join(', ')}</strong> roule${nbHors > 1 ? 'nt' : ''} sans être au planning.</div>
        </div>` : ''}

        <div style="${cardCss}padding:0;margin-bottom:24px;overflow:hidden;">
          <div style="font-size:18px;font-weight:800;color:${C.head};padding:20px 22px;">Chauffeurs du jour <span style="color:${C.mut2};font-weight:500;font-size:15px;">· ${lignes.length}</span></div>
          ${tableOrEmpty}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;align-items:start;">
          ${monthlyCard}
          <div style="${cardCss}padding:24px 28px;">
            <div style="font-size:18px;font-weight:800;color:${C.head};margin-bottom:10px;">Récapitulatif</div>
            ${totalLine('CA brut Yango', money(caBrutJour), C.head)}
            ${totalLine('− Charges', totalCharges > 0 ? '− ' + money(totalCharges) : money(0), C.red)}
            ${totalLine('= À verser', money(totalDu), C.head, true)}
            ${totalLine('Déjà versé', money(totalVerse), C.green)}
            ${totalLine('Reste dû', money(reste), reste > 0 ? C.red : C.green)}
          </div>
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
      this._loadFleetStatus(data);
      this._initTaskStack();
      this._loadRecetteLive();
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
    // La journée affichée suit le sélecteur de date : aujourd'hui par défaut,
    // ou la date choisie pour consulter une journée passée (planning + CA de ce jour).
    const jourAtt = selectedDay;
    const estAujourdhui = jourAtt === now.toISOString().split('T')[0];
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
    // Une journée passée est complète : on la juge comme une soirée (journée finie).
    const _soir = !estAujourdhui || _heureDec >= 19 || _heureDec < 5;
    let paceState = 'neutre', paceLabel = estAujourdhui ? 'En attente d’activité' : 'Aucune activité ce jour';
    if (nbActifsJour > 0) {
      if (pctJourType >= 0.85) { paceState = 'bon'; paceLabel = 'Journée type atteinte'; }
      else if (_soir && pctJourType < 0.5) { paceState = 'faible'; paceLabel = 'CA anormalement bas'; }
      else if (_soir && pctJourType < 0.75) { paceState = 'modere'; paceLabel = 'Journée sous la moyenne'; }
      else { paceState = 'demarrage'; paceLabel = 'Journée en cours'; }
    }

    // === Liste unifiée « chauffeurs en activité » (programmés + hors planning) ===
    // Chaque chauffeur reçoit un état couleur selon son CA — même logique que le
    // rythme global, appliquée individuellement (neutre tant que la journée court).
    const _driverState = (ca) => {
      if (!ca || ca <= 0) return 'neutre';
      const pct = refParChauffeur > 0 ? ca / refParChauffeur : 0;
      if (pct >= 0.85) return 'bon';
      if (!_soir) return 'demarrage';
      if (pct >= 0.5) return 'modere';
      return 'faible';
    };
    const chauffeursActifsJour = [];
    _plan.filter(p => p.date === jourAtt).forEach(p => {
      const ch = chById2.get(p.chauffeurId);
      if (!ch || ch.statut === 'inactif' || absentCe(ch.id) || chauffeursActifsJour.some(x => x.id === ch.id)) return;
      const a = caParChJour[ch.id] || { ca: 0, courses: 0 };
      chauffeursActifsJour.push({ id: ch.id, prenom: ch.prenom, nom: ch.nom, ca: a.ca, courses: a.courses, programme: true, actif: a.ca > 0, state: _driverState(a.ca) });
    });
    _cajToday.forEach(e => {
      const ca = Number(e.caBrut) || 0;
      if (ca <= 0 || programmesJourSet.has(e.chauffeurId)) return;
      const ch = chById2.get(e.chauffeurId);
      if (!ch || chauffeursActifsJour.some(x => x.id === ch.id)) return;
      chauffeursActifsJour.push({ id: ch.id, prenom: ch.prenom, nom: ch.nom, ca, courses: Number(e.nbCourses) || 0, programme: false, actif: true, state: _driverState(ca) });
    });
    chauffeursActifsJour.sort((a, b) => (b.ca - a.ca) || (b.programme - a.programme));
    const nbActifsTotal = chauffeursActifsJour.filter(c => c.actif).length;
    const nbAjouter = chauffeursActifsJour.filter(c => !c.programme).length;

    return {
      chauffeursActifsJour, nbActifsTotal, nbAjouter,
      versementAttenduJour, nbActifsJour,
      caBrutJour, caReelMois, chauffeursProgrammes, nbProgrammesJour, nbProgrammesActifs, chauffeursHorsPlanning, nbHorsPlanning, refParChauffeur, objectifJourActifs, pctJourType, paceState, paceLabel,
      estAujourdhui, jourAtt,
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
        /* (styles .rec-* et keyframe rtlGrow retirés — plus utilisés) */
        @keyframes miniPulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        .mini-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .mini-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:var(--text-muted); }
        .mini-dot { width:8px; height:8px; border-radius:50%; background:#13DEB9; animation:miniPulse 1.6s infinite; }
        .mini-val { font-size:17px; font-weight:800; color:var(--text-primary); opacity:.55; min-height:22px; transition:opacity .3s; }
        .mini-chart:hover .mini-val { opacity:1; }
        .mini-bars { display:flex; align-items:flex-end; gap:8px; height:100px; }
        .mini-col { position:relative; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
        .mini-bar { width:100%; border-radius:99px; background:#13DEB9; opacity:.32; transform-origin:bottom; transition:all .3s ease-out; cursor:pointer; }
        .mini-chart:hover .mini-bar { opacity:.42; }
        .mini-bar.is-hover { opacity:1 !important; transform:scaleX(1.12) scaleY(1.02); }
        .mini-bar.is-neighbor { opacity:.35 !important; transform:scaleX(1.05); }
        .mini-bar.is-dim { opacity:.10 !important; }
        .mini-lbl { font-size:10px; font-weight:600; color:var(--text-muted); margin-top:8px; transition:color .3s; }
        .mini-col.is-hover .mini-lbl { color:var(--text-primary); }
        .mini-tip { position:absolute; top:-30px; left:50%; transform:translate(-50%,4px); opacity:0; background:var(--text-primary); color:var(--bg-secondary); font-size:11px; font-weight:600; padding:3px 8px; border-radius:6px; white-space:nowrap; pointer-events:none; transition:all .2s; z-index:5; }
        .mini-col.is-hover .mini-tip { opacity:1; transform:translate(-50%,0); }
        .spk-line { stroke-dasharray:1; stroke-dashoffset:1; animation:spkDraw 1s ease-out forwards; }
        @keyframes spkDraw { to { stroke-dashoffset:0; } }
        .spk-area { opacity:0; animation:spkFade .8s ease-out .25s forwards; }
        @keyframes spkFade { to { opacity:1; } }
        .rtl-dots { position:absolute; inset:0; color:var(--text-primary); opacity:.10; background-image:radial-gradient(currentColor 1px, transparent 1px); background-size:14px 14px; -webkit-mask-image:linear-gradient(to right, transparent, #000 55%); mask-image:linear-gradient(to right, transparent, #000 55%); }
        .rtl-tbtn { border:none; background:transparent; color:var(--text-muted); width:27px; height:22px; border-radius:7px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; font-size:14px; transition:all .2s; }
        .rtl-tbtn.rtl-on { background:var(--bg-secondary); color:var(--text-primary); box-shadow:0 1px 3px rgba(0,0,0,.10); }

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

      <!-- Style Dashboard 2 (Spike) : hero d'accueil + trio KPI + barres + line + donut -->
      <style>
        .d2-r1{grid-template-columns:1fr;align-items:stretch;}
        .d2-r2{grid-template-columns:1fr;align-items:stretch;}
        .d2-r3{grid-template-columns:1.15fr 1fr 1fr;align-items:stretch;}
        .d2-kpis{display:flex;flex-direction:column;gap:16px;}
        .d2-kpi{border-radius:16px;padding:15px 17px;display:flex;flex-direction:column;gap:10px;flex:1;justify-content:center;border:1px solid var(--border-color);text-decoration:none;color:inherit;transition:transform .15s, box-shadow .15s;}
        .d2-kpi:hover{transform:translateY(-2px);box-shadow:var(--shadow-card);}
        .d2-num{font-size:21px;font-weight:800;color:var(--text-primary);line-height:1.05;}
        .d2-pill{display:inline-flex;align-items:center;gap:2px;font-size:11px;font-weight:800;padding:3px 8px;border-radius:20px;}
        @media(max-width:1024px){ .d2-r1,.d2-r2,.d2-r3{grid-template-columns:1fr;} .d2-kpis{flex-direction:row;flex-wrap:wrap;} .d2-kpi{min-width:150px;flex:1 1 150px;} }
        @media(max-width:560px){ .d2-kpis{flex-direction:column;} }
        /* Flotte en direct — donut centralisé */
        .fd-card{padding:24px 24px 20px;}
        .fd-head{display:flex;align-items:center;gap:10px;margin-bottom:4px;}
        .fd-title{font-size:15px;font-weight:800;color:var(--text-primary);}
        .fd-live{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--text-muted);}
        .fd-dot-live{width:8px;height:8px;border-radius:50%;background:#FA3E3E;animation:fdPulse 1.8s infinite;}
        @keyframes fdPulse{0%{box-shadow:0 0 0 0 rgba(250,62,62,.5)}70%{box-shadow:0 0 0 7px rgba(250,62,62,0)}100%{box-shadow:0 0 0 0 rgba(250,62,62,0)}}
        .fd-spin{animation:fdSpin 1s linear infinite;display:inline-flex;}
        @keyframes fdSpin{to{transform:rotate(360deg)}}
        .fd-top{display:flex;align-items:center;gap:24px;margin:6px 0 20px;}
        .fd-donut-wrap{position:relative;width:230px;height:230px;flex-shrink:0;}
        .fd-recette{flex:1;min-width:0;}
        .fd-recette-inner{display:flex;flex-direction:column;gap:12px;cursor:pointer;border-left:1px solid var(--border-color);padding-left:24px;}
        .fd-voir{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;background:var(--pilote-blue);color:#fff;font-weight:700;font-size:13px;padding:9px 16px;border-radius:12px;box-shadow:0 8px 18px rgba(93,135,255,.32);}
        .fd-svg{width:100%;height:100%;transform:rotate(-90deg);}
        .fd-seg{transition:stroke-width .2s ease,opacity .2s ease;cursor:pointer;}
        .fd-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none;}
        .fd-center-lbl{font-size:12px;font-weight:600;color:var(--text-muted);}
        .fd-center-val{font-size:24px;font-weight:800;letter-spacing:-.5px;line-height:1.05;margin-top:2px;color:var(--text-primary);white-space:nowrap;}
        .fd-center-sub{font-size:11px;color:var(--text-muted);margin-top:3px;}
        .fd-cards{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;}
        .fd-c{background:var(--bg-tertiary);border:1px solid transparent;border-radius:14px;padding:13px 14px;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;}
        .fd-c.fd-c-off{cursor:default;opacity:.65;}
        .fd-c:not(.fd-c-off):hover,.fd-c.hot{transform:translateY(-3px);box-shadow:0 8px 20px rgba(0,0,0,.10);}
        .fd-c-top{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--text-secondary);}
        .fd-c-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
        .fd-c-mid{margin-top:8px;}
        .fd-c-val{font-size:23px;font-weight:800;letter-spacing:-.5px;}
        .fd-c-pct{font-size:12px;font-weight:700;color:var(--text-muted);margin-left:6px;}
        .fd-c-desc{font-size:11px;color:var(--text-muted);margin-top:3px;}
        @media(max-width:820px){ .fd-cards{grid-template-columns:repeat(2,1fr);} .fd-top{flex-direction:column;} .fd-donut-wrap{margin:0 auto;} .fd-recette{width:100%;} .fd-recette-inner{border-left:none;border-top:1px solid var(--border-color);padding-left:0;padding-top:16px;} }
        /* Widgets de visibilité (Trésorerie / Rentabilité / Tâches / Alertes) */
        .iw-grid{grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(2,minmax(155px,auto));gap:16px;}
        .iw-hero{grid-column:1/span 3;grid-row:1/span 2;}
        .iw-wide{grid-column:4/span 3;grid-row:1;}
        .iw-med{grid-column:4/span 2;grid-row:2;}
        .iw-sm{grid-column:6/span 1;grid-row:2;}
        .iw-hero-mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}
        .iw-hero .iw-gauge{max-width:250px;margin-top:0;}
        .iw-hero-marge{font-size:26px;font-weight:800;letter-spacing:-.5px;line-height:1.1;text-align:center;}
        .iw-hero-ctx{font-size:12px;color:var(--text-muted);font-weight:600;text-align:center;}
        .iw-wide-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex:1;}
        .iw-wide-side{text-align:right;font-size:13px;font-weight:700;line-height:1.6;}
        .iw{display:flex;flex-direction:column;background:var(--bg-secondary);border:1px solid var(--border-color);border-left:4px solid var(--iw-accent);border-radius:16px;padding:15px 17px;text-decoration:none;color:inherit;transition:transform .15s ease,box-shadow .15s ease;}
        .iw.iw-plain{border:none;}
        .iw-gauge{width:100%;max-width:180px;margin:8px auto 0;}
        .iw-gauge svg{width:100%;height:auto;display:block;overflow:visible;}
        .iw-gauge-arc{animation:iwGauge 1.3s ease-out forwards;}
        @keyframes iwGauge{from{stroke-dashoffset:100;}to{stroke-dashoffset:var(--gauge-off);}}
        .iw:hover{transform:translateY(-3px);box-shadow:0 10px 26px rgba(0,0,0,.10);}
        .iw-top{display:flex;align-items:center;gap:9px;}
        .iw-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--iw-bg);color:var(--iw-accent);font-size:19px;flex-shrink:0;}
        .iw-label{font-size:13px;font-weight:700;color:var(--text-secondary);}
        .iw-val{font-size:26px;font-weight:800;color:var(--iw-accent);letter-spacing:-.5px;margin-top:12px;line-height:1;}
        .iw-unit{font-size:13px;font-weight:700;color:var(--text-muted);margin-left:2px;}
        .iw-sub{font-size:11.5px;color:var(--text-muted);font-weight:600;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        @media(max-width:860px){ .iw-grid{grid-template-columns:1fr;grid-template-rows:none;} .iw-hero,.iw-wide,.iw-med,.iw-sm{grid-column:auto;grid-row:auto;} .iw-hero-mid{min-height:190px;} }
        /* Tâches — pile de cartes morphable */
        .ts-toggle{margin-left:auto;display:inline-flex;background:var(--bg-tertiary);border-radius:8px;padding:2px;gap:2px;}
        .ts-tbtn{border:none;background:transparent;color:var(--text-muted);width:24px;height:22px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:13px;}
        .ts-tbtn.ts-on{background:var(--bg-secondary);color:var(--iw-accent);box-shadow:0 1px 3px rgba(0,0,0,.15);}
        .ts-body{position:relative;margin-top:12px;}
        .ts-body.ts-stack{height:104px;touch-action:pan-y;}
        .ts-body.ts-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .ts-body.ts-list{display:flex;flex-direction:column;gap:8px;}
        .ts-c{background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:12px;padding:9px 11px;cursor:pointer;transition:transform .35s cubic-bezier(.2,.8,.3,1),opacity .3s ease;}
        .ts-stack .ts-c{position:absolute;top:0;left:0;right:0;height:104px;box-sizing:border-box;}
        .ts-grid .ts-c{overflow:hidden;}
        .ts-c-top{display:flex;align-items:center;gap:6px;}
        .ts-c-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .ts-c-ech{margin-left:auto;font-size:10px;font-weight:700;color:var(--text-muted);}
        .ts-c-title{font-size:12.5px;font-weight:700;color:var(--text-primary);margin-top:7px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
        .ts-dots{display:flex;justify-content:center;gap:5px;margin-top:10px;}
        .ts-dot{height:5px;width:5px;border-radius:99px;background:var(--text-muted);opacity:.35;border:none;cursor:pointer;padding:0;transition:all .2s;}
        .ts-dot.on{width:14px;opacity:1;background:var(--iw-accent);}
        .ts-empty{margin-top:16px;font-size:12px;color:var(--text-muted);font-weight:600;}
      </style>

      <!-- Row 0 : Flotte en direct (donut centralisé) -->
      <div class="d-grid" style="grid-template-columns:1fr;">
        ${this._renderFleetDonut(d)}
      </div>

      <!-- Row 1 : Widgets de visibilité (Trésorerie / Rentabilité / Tâches / Alertes) -->
      ${this._renderInsightWidgets(d)}

      <!-- Row 2 : Planning (pleine largeur) -->
      <div class="d-grid d2-r2">
        ${this._renderPlanningHeatmap(d)}
      </div>

      <!-- Row 3 : Répartition chauffeurs + Top chauffeurs -->
      <div class="d-grid d-g3" style="grid-template-columns:1fr 1fr 1fr;">
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
        ${this._renderTopDriversRevenue(d)}
        ${this._renderTopDriversDettes(d)}
      </div>

      <!-- Row 4: Documents & Maintenance -->
      <div class="d-grid d-g21" style="grid-template-columns:1fr 1fr;">
        ${this._renderExpiringDocs(d)}
        ${this._renderMaintenancePanel(d)}
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

  // ============ Recette en direct (courbe CA par heure, intégrée au hero blanc) ============
  async _loadRecetteLive() {
    if (!document.getElementById('rtl-spark')) return;
    const period = this._rtlPeriodSel || 'jour';
    const fmt = n => { n = Math.round(n || 0); const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M'; if (a >= 1e3) return Math.round(n / 1e3) + 'k'; return String(n); };
    if (period === '7j') {
      const caj = Store.get('caJour') || [];
      const byDay = {};
      caj.forEach(e => { const dd = String(e.date || '').slice(0, 10); if (dd) byDay[dd] = (byDay[dd] || 0) + (Number(e.caBrut) || 0); });
      const days = [];
      for (let i = 6; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); const ds = dt.toISOString().slice(0, 10); days.push({ label: dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), v: byDay[ds] || 0 }); }
      const tot = days.reduce((s, x) => s + x.v, 0);
      this._rtlData = { series: days, deltaTxt: `${fmt(tot)} F sur 7 jours`, updateHero: false, heroTotal: 0 };
      this._rtlDraw();
      return;
    }
    if (!this._isToday()) { const st = document.getElementById('rtl-stats'); if (st) st.textContent = 'Jour passé'; return; }
    const r = await Store.getRecetteJourHoraire();
    if (!document.getElementById('rtl-spark')) return;
    if (!r || !Array.isArray(r.repartitionHoraire)) { const st = document.getElementById('rtl-stats'); if (st) st.textContent = 'Statut Yango indisponible'; return; }
    const rp = r.repartitionHoraire;
    const nowH = new Date().getUTCHours();
    const order = []; for (let h = 5; h <= 23; h++) order.push(h); for (let h = 0; h <= 4; h++) order.push(h);
    const pertinent = h => (h >= 5) ? true : (nowH < 5);
    const s2 = order.map(h => ({ h, ca: (rp[h] ? rp[h].ca : 0) || 0, courses: (rp[h] ? rp[h].courses : 0) || 0 })).filter(x => x.ca > 0 || x.courses > 0 || pertinent(x.h));
    const courses = s2.reduce((s, x) => s + x.courses, 0);
    const tot = s2.reduce((s, x) => s + x.ca, 0);
    this._rtlData = { series: s2.map(x => ({ label: x.h + 'h', v: x.ca })), deltaTxt: `${courses} course${courses > 1 ? 's' : ''} aujourd'hui`, updateHero: true, heroTotal: tot };
    this._rtlDraw();
  },

  _rtlDraw() {
    const spark = document.getElementById('rtl-spark');
    const data = this._rtlData;
    if (!spark || !data) return;
    const vals = data.series.map(s => s.v);
    const nz = vals.filter(v => v > 0);
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = nz.length ? Math.round(total / nz.length) : 0;
    const peak = vals.length ? Math.max(...vals) : 0;
    const low = nz.length ? Math.min(...nz) : 0;
    const lastV = vals.length ? vals[vals.length - 1] : 0;
    const pct = avg > 0 ? Math.round((lastV - avg) / avg * 100) : 0;
    const dir = Math.abs(pct) < 1 ? 'flat' : (pct >= 0 ? 'up' : 'down');
    const ACC = { up: { s: '#10b981', t: '#059669', ic: 'solar:arrow-up-linear' }, down: { s: '#f43f5e', t: '#e11d48', ic: 'solar:arrow-down-linear' }, flat: { s: '#64748b', t: 'var(--text-muted)', ic: 'solar:arrow-right-linear' } }[dir];
    const fmt = n => { n = Math.round(n || 0); const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M'; if (a >= 1e3) return Math.round(n / 1e3) + 'k'; return String(n); };
    const trendEl = document.getElementById('rtl-trend'); if (trendEl) { trendEl.style.color = ACC.t; trendEl.replaceChildren(); trendEl.insertAdjacentHTML('beforeend', `<iconify-icon icon="${ACC.ic}"></iconify-icon>${Math.abs(pct)}%`); }
    const deltaEl = document.getElementById('rtl-delta'); if (deltaEl) { deltaEl.style.color = ACC.t; deltaEl.textContent = data.deltaTxt; }
    const statsEl = document.getElementById('rtl-stats'); if (statsEl) { statsEl.replaceChildren(); statsEl.insertAdjacentHTML('beforeend', `<span style="color:var(--text-primary);font-weight:700;">${fmt(peak)}</span> peak · <span style="color:var(--text-primary);font-weight:700;">${fmt(low)}</span> low · <span style="color:var(--text-primary);font-weight:700;">${fmt(avg)}</span> avg`); }
    const fadeEl = document.getElementById('rtl-fade'); if (fadeEl) fadeEl.style.background = `linear-gradient(to left, ${ACC.s}26, transparent 75%)`;
    if (data.updateHero) { const ha = document.getElementById('hero-ca-amount'); if (ha) ha.textContent = Utils.formatCurrency(data.heroTotal); const fc = document.getElementById('fleet-ca-center'); if (fc) fc.textContent = Utils.formatCurrency(data.heroTotal); }
    const maxV = Math.max(1, ...vals);
    const W = 200, Hh = 150;
    let inner;
    if ((this._rtlViewMode || 'curve') === 'bar') {
      const n = vals.length || 1, gap = 4, bw = Math.max(2, (W - gap * (n - 1)) / n);
      inner = vals.map((v, i) => { const h = Math.max(1, (v / maxV) * (Hh * 0.82)); const x = i * (bw + gap), y = Hh - h; return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${ACC.s}" class="spk-area"/>`; }).join('');
    } else {
      const step = W / Math.max(1, vals.length - 1);
      const pts = vals.map((v, i) => [i * step, Hh - (v / maxV) * (Hh * 0.78) - Hh * 0.10]);
      let line = pts.length ? `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` : `M 0 ${Hh}`;
      for (let i = 0; i < pts.length - 1; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; const mx = ((x1 + x2) / 2).toFixed(1); line += ` C ${mx},${y1.toFixed(1)} ${mx},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`; }
      const area = `${line} L ${W} ${Hh} L 0 ${Hh} Z`;
      inner = `<path d="${area}" fill="${ACC.s}" opacity="0.16" class="spk-area"/><path d="${line}" fill="none" stroke="${ACC.s}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="spk-line" vector-effect="non-scaling-stroke"/>`;
    }
    spark.replaceChildren();
    spark.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" style="width:100%;height:100%;">${inner}</svg>`);
  },

  _rtlView(v) {
    this._rtlViewMode = v;
    const c = document.getElementById('rtl-btn-curve'), b = document.getElementById('rtl-btn-bar');
    if (c) c.classList.toggle('rtl-on', v === 'curve');
    if (b) b.classList.toggle('rtl-on', v === 'bar');
    this._rtlDraw();
  },

  _rtlPeriod(p) {
    this._rtlPeriodSel = p;
    this._loadRecetteLive();
  },

  // MiniChart « Recette encaissée » : survol interactif d'une barre.
  _miniHover(i) {
    const cont = document.getElementById('hero-mini');
    if (!cont) return;
    const cols = cont.querySelectorAll('.mini-col');
    const bars = cont.querySelectorAll('.mini-bar');
    bars.forEach((b, idx) => {
      b.classList.remove('is-hover', 'is-neighbor', 'is-dim');
      if (cols[idx]) cols[idx].classList.remove('is-hover');
      if (idx === i) { b.classList.add('is-hover'); if (cols[idx]) cols[idx].classList.add('is-hover'); }
      else if (idx === i - 1 || idx === i + 1) b.classList.add('is-neighbor');
      else b.classList.add('is-dim');
    });
    const val = document.getElementById('mini-value');
    if (val && bars[i]) val.textContent = bars[i].dataset.fmt || '';
  },
  _miniLeave() {
    const cont = document.getElementById('hero-mini');
    if (!cont) return;
    cont.querySelectorAll('.mini-bar').forEach(b => b.classList.remove('is-hover', 'is-neighbor', 'is-dim'));
    cont.querySelectorAll('.mini-col').forEach(c => c.classList.remove('is-hover'));
    const val = document.getElementById('mini-value');
    if (val) val.textContent = cont.dataset.total || '';
  },

  // ============ Chauffeurs à surveiller ============
  // Combine deux signaux : CA « pas bon » (zone à surveiller : faible/modéré) et
  // chauffeurs qui se mettent en « occupé » sur Yango (statut busy, distinct d'une
  // vraie course in_order). La partie Yango est chargée en asynchrone (_loadYangoWatch).
  _renderWatchlist(d) {
    const initial = this._isToday() ? null : []; // null = statut Yango en cours de chargement
    return `<div class="d-card" style="padding:0;overflow:hidden;">
      <div id="dash-watchlist">${this._watchlistInner(d, initial)}</div>
    </div>`;
  },

  // Bandeau de synthèse d'activité (En activité / En forme / À surveiller / Inactif /
  // Hors planning) — affiché en tête de la carte « Chauffeurs à surveiller ».
  _activityTiles(d) {
    const list = d.chauffeursActifsJour || [];
    if (!list.length) return '';
    const total = list.length;
    const counts = {}; list.forEach(c => { counts[c.state] = (counts[c.state] || 0) + 1; });
    const ZONE = { bon: 'ok', demarrage: 'ok', modere: 'watch', faible: 'watch', neutre: 'off' };
    const zc = {}; Object.keys(counts).forEach(k => { const z = ZONE[k] || 'off'; zc[z] = (zc[z] || 0) + counts[k]; });
    const enForme = zc.ok || 0, aSurv = zc.watch || 0, inactif = zc.off || 0;
    const pctForme = total ? Math.round(enForme / total * 100) : 0;
    const horsNoms = list.filter(c => !c.programme).map(c => c.prenom);
    const tile = (lbl, val, col, bg) => `<div style="background:${bg};border-radius:11px;padding:6px 11px;text-align:center;min-width:60px;"><div style="font-size:10px;font-weight:700;color:var(--text-secondary);white-space:nowrap;">${lbl}</div><div style="font-size:15px;font-weight:800;color:${col};white-space:nowrap;margin-top:1px;">${val}</div></div>`;
    return `<div style="display:flex;gap:9px;flex-wrap:wrap;">
      ${tile('En activité', `${d.nbActifsTotal}/${total}`, 'var(--success-dim)', 'rgba(19,222,185,.12)')}
      ${tile('En forme', `${pctForme}%`, '#02b3a9', 'rgba(19,222,185,.10)')}
      ${aSurv ? tile('À surveiller', String(aSurv), 'var(--warning-dim)', 'rgba(255,174,31,.12)') : ''}
      ${inactif ? tile('Inactif', String(inactif), 'var(--text-muted)', 'var(--bg-tertiary)') : ''}
      ${horsNoms.length ? tile('Hors planning', String(horsNoms.length), 'var(--danger-dim)', 'rgba(250,137,107,.12)') : ''}
    </div>`;
  },

  _watchlistInner(d, yBusy) {
    const RSN = {
      ca_faible: ['CA anormalement bas', '#FA896B', 'rgba(250,137,107,.14)', 'solar:chart-2-bold'],
      ca_modere: ['CA sous la moyenne', '#FFAE1F', 'rgba(255,174,31,.16)', 'solar:chart-2-bold'],
      occupe: ['Occupé sur Yango', '#635BFF', 'rgba(99,91,255,.13)', 'solar:phone-calling-rounded-bold'],
    };
    const chauffeurs = (typeof Store !== 'undefined' && Store.get) ? (Store.get('chauffeurs') || []) : [];
    const chById = new Map(chauffeurs.map(c => [c.id, c]));
    const caById = new Map((d.chauffeursActifsJour || []).map(c => [c.id, c]));
    const items = new Map();
    // 1) CA « pas bon »
    (d.chauffeursActifsJour || []).forEach(c => {
      if (c.state === 'faible' || c.state === 'modere') {
        items.set(c.id, { id: c.id, prenom: c.prenom, nom: c.nom, ca: c.ca, reasons: [c.state === 'faible' ? 'ca_faible' : 'ca_modere'] });
      }
    });
    // 2) Occupé sur Yango (statut busy)
    if (yBusy) {
      yBusy.forEach(b => {
        const ch = chauffeurs.find(x => x.yangoDriverId && x.yangoDriverId === b.id);
        const key = ch ? ch.id : ('y:' + b.id);
        const ex = items.get(key);
        if (ex) { if (!ex.reasons.includes('occupe')) ex.reasons.push('occupe'); }
        else {
          const info = ch ? caById.get(ch.id) : null;
          const parts = (b.nom || '').trim().split(' ');
          items.set(key, { id: ch ? ch.id : null, prenom: ch ? ch.prenom : (parts[0] || ''), nom: ch ? ch.nom : (parts.slice(1).join(' ')), ca: info ? info.ca : null, reasons: ['occupe'] });
        }
      });
    }
    const list = [...items.values()].sort((a, b) => (b.reasons.length - a.reasons.length) || ((a.ca == null ? 1e12 : a.ca) - (b.ca == null ? 1e12 : b.ca)));
    const loading = (yBusy === null);
    const today = this._isToday();

    const refreshBtn = today ? `<button onclick="DashboardPage._loadYangoWatch(DashboardPage._lastData, true)" title="Rafraîchir le statut Yango" style="background:var(--bg-tertiary);border:none;width:34px;height:34px;border-radius:9px;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><iconify-icon icon="solar:refresh-bold"></iconify-icon></button>` : '';
    const head = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 18px;border-bottom:1px solid var(--border-color);">
      <div style="display:flex;align-items:center;gap:10px;min-width:0;">
        <div class="d-icon" style="width:38px;height:38px;font-size:1.05rem;background:rgba(255,174,31,.15);color:#FFAE1F;flex-shrink:0;"><iconify-icon icon="solar:eye-scan-bold-duotone"></iconify-icon></div>
        <div style="min-width:0;"><div class="d-lbl" style="margin:0;">Chauffeurs à surveiller</div><div class="d-sub" style="margin:0;">CA faible${today ? ' ou occupé sur Yango' : ''}${loading ? '' : ` · ${list.length}`}</div></div>
      </div>
      ${refreshBtn}
    </div>`;

    const _tiles = this._activityTiles(d);
    const tilesStrip = _tiles ? `<div style="padding:13px 18px 12px;border-bottom:1px solid var(--border-color);">${_tiles}</div>` : '';

    if (!list.length && !loading) {
      return head + tilesStrip + `<div style="padding:22px 18px;display:flex;align-items:center;gap:10px;color:var(--success-dim);font-size:13px;font-weight:600;"><iconify-icon icon="solar:check-circle-bold" style="font-size:18px;"></iconify-icon>Aucun chauffeur à surveiller pour le moment.</div>`;
    }

    const rows = list.map(it => {
      const initial = (it.prenom || it.nom || '?').charAt(0).toUpperCase();
      const sev = it.reasons.includes('ca_faible') ? '#FA896B' : (it.reasons.includes('occupe') ? '#635BFF' : '#FFAE1F');
      const ch = it.id ? chById.get(it.id) : null;
      const tel = ch && ch.telephone ? String(ch.telephone) : '';
      const badges = it.reasons.map(r => { const m = RSN[r]; return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px;background:${m[2]};color:${m[1]};"><iconify-icon icon="${m[3]}" style="font-size:12px;"></iconify-icon>${m[0]}</span>`; }).join('');
      const caTxt = (it.ca != null) ? `<div style="font-size:12px;font-weight:800;color:var(--text-primary);white-space:nowrap;">${Utils.formatCurrency(it.ca)}</div>` : '';
      const callBtn = tel ? `<a href="tel:${Utils.escHtml(tel)}" title="Appeler" style="width:34px;height:34px;border-radius:9px;background:rgba(19,222,185,.14);color:var(--success-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0;text-decoration:none;"><iconify-icon icon="solar:phone-bold"></iconify-icon></a>` : '';
      return `<div style="display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid var(--border-color);">
        <div style="width:36px;height:36px;border-radius:50%;background:${sev};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">${Utils.escHtml(initial)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escHtml(((it.prenom || '') + ' ' + (it.nom || '')).trim() || 'Chauffeur')}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${badges}</div>
        </div>
        ${caTxt}
        ${callBtn}
      </div>`;
    }).join('');

    const loadingRow = loading ? `<div style="padding:11px 18px;display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:12px;font-weight:600;"><iconify-icon icon="solar:refresh-bold" style="font-size:14px;"></iconify-icon>Vérification des statuts Yango…</div>` : '';

    return head + tilesStrip + `<div style="max-height:340px;overflow-y:auto;">${rows}${loadingRow}</div>`;
  },

  async _loadYangoWatch(d, force) {
    d = d || this._lastData;
    if (!d) return;
    if (!this._isToday()) return; // le statut « occupé » temps réel n'a de sens que pour aujourd'hui
    let el = document.getElementById('dash-watchlist');
    if (!el) return;
    const now = Date.now();
    if (!force && this._yangoWatchCache && (now - this._yangoWatchCache.ts < 60000)) {
      el.replaceChildren();
      el.insertAdjacentHTML('beforeend', this._watchlistInner(d, this._yangoWatchCache.busy));
      return;
    }
    let busy = [];
    try {
      const r = await Store.getFleetStatus();
      if (r && Array.isArray(r.drivers)) busy = r.drivers.filter(x => x.status === 'busy');
      this._yangoWatchCache = { ts: now, busy };
    } catch (e) {
      console.warn('Watchlist Yango error:', e.message);
      busy = []; // échec API : on garde la partie CA
    }
    el = document.getElementById('dash-watchlist');
    if (el) { el.replaceChildren(); el.insertAdjacentHTML('beforeend', this._watchlistInner(d, busy)); }
  },

  // ============ Widgets de visibilité (Trésorerie / Rentabilité / Tâches / Alertes) ============
  // Cartes cliquables affichant la donnée réelle en un coup d'œil (chiffre + détail),
  // en remplacement des pastilles peu parlantes du header.
  _renderInsightWidgets(d) {
    const fmtK = n => { n = Math.round(n || 0); const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + 'M' : a >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); };

    // Trésorerie (déjà dans d) — versé du MOIS entier (totalVerseMonth), stable
    // quel que soit le jour sélectionné, pour rester cohérent avec dettes/pertes
    // (qui sont des cumuls). d.totalVerse suit la période affichée → 0 un jour sans activité.
    const verse = d.totalVerseMonth || 0, dettes = d.totalDettes || 0, pertes = d.totalPertes || 0;

    // Rentabilité (calcul de la page rentabilité, appelé sans effet de bord)
    let marge = null, rsi = null, recup = null;
    try {
      if (typeof RentabilitePage !== 'undefined' && RentabilitePage._getData) {
        const r = RentabilitePage._getData();
        if (r) { marge = r.margeMensuelle; rsi = Math.round(r.rsiGlobal || 0); recup = r.moisRecuperation; }
      }
    } catch (e) { console.warn('Widget rentabilité:', e.message); }

    // Tâches
    let taches = 0, tachesRetard = 0;
    try {
      const s = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
      const uid = s ? s.userId : ''; const admin = s && s.role === 'Administrateur';
      const today = new Date().toISOString().slice(0, 10);
      const allT = Store.get('taches') || [];
      const mine = (admin ? allT.filter(t => t.creePar === uid) : allT.filter(t => t.assigneA === uid)).filter(t => t.statut !== 'terminee' && t.statut !== 'annulee');
      taches = mine.length;
      tachesRetard = mine.filter(t => t.dateEcheance && t.dateEcheance < today).length;
    } catch (e) { }

    // Alertes
    let crit = 0, urg = 0, att = 0, totA = 0;
    try {
      let alerts = [];
      if (typeof AlertesPage !== 'undefined' && AlertesPage._generateAllAlerts) alerts = AlertesPage._generateAllAlerts() || [];
      crit = alerts.filter(a => a.niveau === 'critique').length;
      urg = alerts.filter(a => a.niveau === 'urgent').length;
      att = alerts.filter(a => a.niveau === 'attention').length;
      totA = alerts.length;
    } catch (e) { }
    const alertAccent = crit > 0 ? '#EF4444' : urg > 0 ? '#E8930C' : att > 0 ? '#0891b2' : '#02b3a9';

    const widget = (o) => `<a href="${o.href}" class="iw" style="--iw-accent:${o.accent};--iw-bg:${o.bg};">
      <div class="iw-top"><span class="iw-icon"><iconify-icon icon="${o.icon}"></iconify-icon></span><span class="iw-label">${o.label}</span></div>
      <div class="iw-val">${o.value}</div>
      <div class="iw-sub">${o.sub}</div>
    </a>`;

    const alertSub = totA > 0 ? (crit > 0 ? `${crit} critique${crit > 1 ? 's' : ''}` : urg > 0 ? `${urg} urgente${urg > 1 ? 's' : ''}` : `${att} attention`) : 'Aucune ✓';
    // Disposition bento : Rentabilité en grand (hero), Trésorerie large, Tâches moyen, Alertes petit.
    return `<div class="d-grid iw-grid">
      ${(rsi != null || marge != null) ? (() => {
        const gc = this._gaugeColor(rsi || 0, marge);
        return `<a href="#/rentabilite" class="iw iw-plain iw-hero" style="--iw-accent:${gc.rgb};--iw-bg:${gc.soft};">
        <div class="iw-top"><span class="iw-icon"><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon></span><span class="iw-label">Rentabilité</span></div>
        <div class="iw-hero-mid">${this._renderRadialGauge(rsi || 0, gc.rgb)}<div class="iw-hero-marge" style="color:${gc.rgb};">${marge != null ? `${fmtK(marge)} F/mois` : '—'}</div><div class="iw-hero-ctx">RSI ${rsi != null ? rsi : '—'}%${recup > 0 && isFinite(recup) ? ` · récup. ${recup} mois` : ''}</div></div>
      </a>`; })() : `<a href="#/rentabilite" class="iw iw-hero" style="--iw-accent:#f97316;--iw-bg:rgba(249,115,22,.12);"><div class="iw-top"><span class="iw-icon"><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon></span><span class="iw-label">Rentabilité</span></div><div class="iw-hero-mid" style="color:var(--text-muted);font-weight:600;">Voir l'analyse →</div></a>`}
      <a href="#/versements" class="iw iw-wide" style="--iw-accent:#02b3a9;--iw-bg:rgba(19,222,185,.12);">
        <div class="iw-top"><span class="iw-icon"><iconify-icon icon="solar:safe-2-bold-duotone"></iconify-icon></span><span class="iw-label">Trésorerie</span></div>
        <div class="iw-wide-row"><div class="iw-val" style="font-size:34px;color:#02b3a9;">${fmtK(verse)} F</div><div class="iw-wide-side"><div style="color:#D99000;">Dettes ${fmtK(dettes)}</div><div style="color:#D9583B;">Pertes ${fmtK(pertes)}</div></div></div>
      </a>
      ${this._renderTaskStack(d)}
      <a href="#/alertes" class="iw iw-sm" style="--iw-accent:${alertAccent};--iw-bg:rgba(239,68,68,.10);">
        <div class="iw-top"><span class="iw-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></span><span class="iw-label">Alertes</span></div>
        <div class="iw-val" style="color:${alertAccent};margin-top:auto;">${totA}</div>
        <div class="iw-sub">${alertSub}</div>
      </a>
    </div>`;
  },

  // Couleur santé de la jauge : rouge si perte (marge < 0), sinon ambre → vert
  // selon le RSI (plus on récupère, plus c'est vert).
  _gaugeColor(pct, marge) {
    let rgb;
    if (marge != null && marge < 0) rgb = [220, 38, 38];
    else {
      const t = Math.max(0, Math.min(1, (pct || 0) / 100));
      const a = [245, 158, 11], b = [22, 163, 74];
      rgb = a.map((ch, i) => Math.round(ch + (b[i] - ch) * t));
    }
    return { rgb: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, soft: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, .12)` };
  },

  // Jauge radiale animée (demi-cercle) — couleur santé dynamique, sans encadré ni
  // labels 0/100 (elle se fond dans la carte). Recréée d'après AnimatedRadialChart.
  _renderRadialGauge(pct, color) {
    const R = 45, cx = 60, cy = 56, sw = 11;
    const frac = Math.max(0, Math.min(1, (pct || 0) / 100));
    const off = (100 - frac * 100).toFixed(1);
    const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
    const col = color || '#f97316';
    return `<div class="iw-gauge"><svg viewBox="0 0 120 62"><path d="${arc}" fill="none" stroke="var(--bg-tertiary)" stroke-width="${sw}" stroke-linecap="round"></path><path d="${arc}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" pathLength="100" stroke-dasharray="100" class="iw-gauge-arc" style="--gauge-off:${off};"></path><text x="60" y="47" text-anchor="middle" font-size="20" font-weight="800" fill="${col}" style="letter-spacing:-.5px;">${Math.round(pct)}%</text></svg></div>`;
  },

  // ============ Tâches — pile de cartes morphable (stack / grille / liste) ============
  // Recréé en vanilla d'après MorphingCardStack : bascule de disposition + navigation
  // (glisser / points) sur la pile. Remplace le widget Tâches dans la grille.
  _renderTaskStack(d) {
    let tasks = [];
    try {
      const s = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
      const uid = s ? s.userId : ''; const admin = s && s.role === 'Administrateur';
      const allT = Store.get('taches') || [];
      tasks = (admin ? allT.filter(t => t.creePar === uid) : allT.filter(t => t.assigneA === uid))
        .filter(t => t.statut !== 'terminee' && t.statut !== 'annulee')
        .sort((a, b) => String(a.dateEcheance || '9999').localeCompare(String(b.dateEcheance || '9999')))
        .slice(0, 6);
    } catch (e) { }
    const prioCol = { haute: '#EF4444', urgente: '#EF4444', normale: '#0891b2', basse: '#7C8FAC' };
    const layout = this._tsLayoutMode || 'stack';
    const head = `<div class="iw-top"><span class="iw-icon"><iconify-icon icon="solar:clipboard-list-bold-duotone"></iconify-icon></span><span class="iw-label">Tâches</span>
      <div class="ts-toggle">
        <button class="ts-tbtn${layout === 'stack' ? ' ts-on' : ''}" data-m="stack" title="Pile" onclick="DashboardPage._tsLayout('stack')"><iconify-icon icon="solar:layers-bold"></iconify-icon></button>
        <button class="ts-tbtn${layout === 'grid' ? ' ts-on' : ''}" data-m="grid" title="Grille" onclick="DashboardPage._tsLayout('grid')"><iconify-icon icon="solar:widget-4-bold"></iconify-icon></button>
        <button class="ts-tbtn${layout === 'list' ? ' ts-on' : ''}" data-m="list" title="Liste" onclick="DashboardPage._tsLayout('list')"><iconify-icon icon="solar:list-bold"></iconify-icon></button>
      </div></div>`;
    if (!tasks.length) {
      return `<div class="iw iw-med" style="--iw-accent:#5D87FF;--iw-bg:rgba(93,135,255,.12);">${head}<div class="ts-empty">Rien en attente 🎉</div></div>`;
    }
    this._tsCount = tasks.length;
    if (this._tsActive == null || this._tsActive >= tasks.length) this._tsActive = 0;
    const cards = tasks.map((t, i) => {
      const c = prioCol[t.priorite] || '#0891b2';
      const ech = t.dateEcheance ? Utils.formatDate(t.dateEcheance) : '';
      return `<div class="ts-c" data-i="${i}"><div class="ts-c-top"><span class="ts-c-dot" style="background:${c};"></span><span class="ts-c-ech">${ech}</span></div><div class="ts-c-title">${Utils.escHtml(t.titre || 'Tâche')}</div></div>`;
    }).join('');
    const dots = tasks.map((_, i) => `<button class="ts-dot" onclick="DashboardPage._tsGoto(${i})" aria-label="Tâche ${i + 1}"></button>`).join('');
    return `<div class="iw ts-card iw-med" style="--iw-accent:#5D87FF;--iw-bg:rgba(93,135,255,.12);">${head}<div class="ts-body ts-${layout}" id="ts-body">${cards}</div><div class="ts-dots" id="ts-dots">${dots}</div></div>`;
  },

  _tsLayout(m) { this._tsLayoutMode = m; this._tsRender(); },
  _tsGoto(i) { this._tsActive = i; this._tsRender(); },
  _tsCycle(dir) { const n = this._tsCount || 1; this._tsActive = (((this._tsActive || 0) + dir) % n + n) % n; this._tsRender(); },

  _tsRender() {
    const body = document.getElementById('ts-body'); if (!body) return;
    const layout = this._tsLayoutMode || 'stack';
    body.className = 'ts-body ts-' + layout;
    const cards = Array.from(body.querySelectorAll('.ts-c')); const n = cards.length;
    const active = this._tsActive || 0;
    if (layout === 'stack') {
      cards.forEach((c, i) => {
        const pos = (i - active + n) % n; const show = pos < 3;
        c.style.transform = `translate(${pos * 7}px, ${pos * 9}px) rotate(${pos === 0 ? 0 : (pos % 2 ? 2.5 : -2.5)}deg) scale(${1 - pos * 0.05})`;
        c.style.zIndex = String(n - pos); c.style.opacity = show ? (pos === 0 ? '1' : '0.6') : '0'; c.style.pointerEvents = pos === 0 ? 'auto' : 'none';
      });
    } else {
      cards.forEach(c => { c.style.transform = ''; c.style.zIndex = ''; c.style.opacity = ''; c.style.pointerEvents = ''; });
    }
    const dotsEl = document.getElementById('ts-dots'); if (dotsEl) dotsEl.style.display = layout === 'stack' ? 'flex' : 'none';
    document.querySelectorAll('.ts-dot').forEach((dd, i) => dd.classList.toggle('on', i === active));
    document.querySelectorAll('.ts-tbtn').forEach(b => b.classList.toggle('ts-on', b.getAttribute('data-m') === layout));
  },

  _initTaskStack() {
    this._tsRender();
    const body = document.getElementById('ts-body'); if (!body || body._tsBound) return; body._tsBound = true;
    let sx = null, dx = 0, drag = false, topEl = null;
    body.addEventListener('pointerdown', (e) => {
      this._tsDragged = false; // chaque nouvelle interaction repart propre (sinon un swipe précédent avale le tap suivant)
      if ((this._tsLayoutMode || 'stack') !== 'stack') return;
      topEl = e.target.closest('.ts-c'); if (!topEl || topEl.style.pointerEvents === 'none') { topEl = null; return; }
      sx = e.clientX; dx = 0; drag = false;
      try { topEl.setPointerCapture(e.pointerId); } catch (_) { }
    });
    body.addEventListener('pointermove', (e) => {
      if (sx == null || !topEl) return;
      dx = e.clientX - sx; if (Math.abs(dx) > 4) drag = true;
      topEl.style.transition = 'none';
      topEl.style.transform = `translate(${dx}px, 0) rotate(${(dx * 0.03).toFixed(2)}deg)`;
    });
    const end = () => {
      if (sx == null) return;
      const moved = dx; sx = null;
      if (topEl) topEl.style.transition = '';
      if (drag) { this._tsDragged = true; if (Math.abs(moved) > 40) this._tsCycle(moved < 0 ? 1 : -1); else this._tsRender(); }
      topEl = null; drag = false;
    };
    body.addEventListener('pointerup', end);
    body.addEventListener('pointercancel', end);
    body.addEventListener('click', (e) => {
      if (this._tsDragged) { this._tsDragged = false; return; }
      if (e.target.closest('.ts-c')) location.hash = '#/taches';
    });
  },

  // ============ Flotte en direct (donut centralisé) ============
  // Répartit toute la flotte active en 5 états mutuellement exclusifs, affichés
  // en anneau + cartes. Le statut temps réel Yango (course/libre/hors-ligne) est
  // chargé en asynchrone (_loadFleetStatus). Un chauffeur « free » depuis ≥ 10 min
  // (statusTs Yango) bascule en « à surveiller ».
  _fleetSegDef() {
    return [
      { key: 'course', label: 'En course', color: '#13DEB9', desc: 'Sur une course' },
      { key: 'ligne', label: 'En ligne', color: '#5D87FF', desc: 'Disponible' },
      { key: 'surv', label: 'À surveiller', color: '#FFAE1F', desc: 'CA bas / inactif' },
      { key: 'nonpl', label: 'Non planifiés', color: '#635BFF', desc: 'Sans planning' },
      { key: 'hors', label: 'Hors ligne', color: '#C7D0DD', desc: 'Déconnectés' },
    ];
  },

  _fleetBuckets(d, yStatus) {
    const chauffeurs = (typeof Store !== 'undefined' && Store.get) ? (Store.get('chauffeurs') || []) : [];
    const fleet = chauffeurs.filter(c => (c.statut || 'actif') !== 'inactif');
    const caById = new Map((d.chauffeursActifsJour || []).map(c => [c.id, c]));
    const now = Date.now() / 1000;
    const toEpoch = ts => { if (ts == null) return null; if (typeof ts === 'number') return ts > 1e12 ? ts / 1000 : ts; const p = Date.parse(ts); return isNaN(p) ? null : p / 1000; };
    const yById = new Map();
    if (yStatus && Array.isArray(yStatus.drivers)) yStatus.drivers.forEach(y => { if (y.id) yById.set(y.id, y); });
    const haveY = !!yStatus;

    const B = { course: [], ligne: [], surv: [], nonpl: [], hors: [] };
    fleet.forEach(ch => {
      const info = caById.get(ch.id) || null;
      const caState = info ? info.state : null;
      const programme = info ? info.programme : false;
      const ca = info ? info.ca : 0;
      const actif = info ? info.actif : false;
      let ystat = null, idleMin = 0, idle = false;
      if (haveY) {
        const y = ch.yangoDriverId ? yById.get(ch.yangoDriverId) : null;
        ystat = y ? y.status : 'offline';
        if (y && y.status === 'free' && y.statusTs) { const e = toEpoch(y.statusTs); if (e) { idleMin = Math.max(0, Math.floor((now - e) / 60)); idle = idleMin >= 10; } }
      }
      const online = ystat === 'free' || ystat === 'busy' || ystat === 'in_order';
      const reasons = [];
      if (caState === 'faible') reasons.push('ca_faible'); else if (caState === 'modere') reasons.push('ca_modere');
      if (ystat === 'busy') reasons.push('occupe');
      if (idle) reasons.push('idle');
      const entry = { id: ch.id, prenom: ch.prenom, nom: ch.nom, tel: ch.telephone || '', ca, programme, reasons, idleMin };
      const survByCa = (caState === 'faible' || caState === 'modere');
      const isSurv = haveY ? (online && (survByCa || ystat === 'busy' || idle)) : survByCa;
      const isNonpl = !programme && (haveY ? online : actif);
      if (isSurv) B.surv.push(entry);
      else if (isNonpl) B.nonpl.push(entry);
      else if (haveY ? ystat === 'in_order' : actif) B.course.push(entry);
      else if (haveY && ystat === 'free') B.ligne.push(entry);
      else B.hors.push(entry);
    });

    const segments = this._fleetSegDef().map(s => ({ ...s, count: B[s.key].length, drivers: B[s.key] }));
    return { segments, total: fleet.length, haveY };
  },

  _fleetDonutSvg(segments, total) {
    const R = 80, C = 2 * Math.PI * R, GAP = 7, SW = 18;
    const active = segments.filter(s => s.count > 0);
    if (!total || !active.length) {
      return `<circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--border-color)" stroke-width="${SW}"></circle>`;
    }
    let cum = 0;
    return segments.map((s, i) => {
      if (!s.count) return '';
      const frac = s.count / total, len = frac * C, dash = Math.max(0.5, len - GAP);
      const el = `<circle data-seg="${i}" cx="100" cy="100" r="${R}" fill="none" stroke="${s.color}" stroke-width="${SW}" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-cum).toFixed(2)}" class="fd-seg" onmouseenter="DashboardPage._fdHot(${i},true)" onmouseleave="DashboardPage._fdHot(${i},false)" onclick="DashboardPage._fleetCardClick('${s.key}')"></circle>`;
      cum += len;
      return el;
    }).join('');
  },

  // Format compact pour le centre du donut (évite le débordement dans le cercle).
  _caCenter(n) {
    n = Math.round(n || 0);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + 'M F';
    return new Intl.NumberFormat('fr-FR').format(n) + ' F';
  },

  _fleetCircleInner(d, segments, total) {
    const svg = this._fleetDonutSvg(segments, total);
    const caTxt = this._caCenter(d.caBrutJour);
    const sub = `${this._isToday() ? "aujourd'hui" : Utils.escHtml(Utils.formatDate(d.jourAtt))} · ${total} chauffeur${total > 1 ? 's' : ''}`;
    return `<svg viewBox="0 0 200 200" class="fd-svg">${svg}</svg>
      <div class="fd-center"><div class="fd-center-lbl">CA flotte</div><div class="fd-center-val" id="fleet-ca-center">${caTxt}</div><div class="fd-center-sub">${sub}</div></div>`;
  },

  _fleetCardsInner(segments) {
    return segments.map((s, i) => {
      const clickable = s.count > 0;
      const handlers = clickable ? `onmouseenter="DashboardPage._fdHot(${i},true)" onmouseleave="DashboardPage._fdHot(${i},false)" onclick="DashboardPage._fleetCardClick('${s.key}')"` : '';
      return `<div class="fd-c${clickable ? '' : ' fd-c-off'}" data-i="${i}" ${handlers}>
        <div class="fd-c-top"><span class="fd-c-dot" style="background:${s.color};"></span>${s.label}</div>
        <div class="fd-c-mid"><span class="fd-c-val" style="color:${s.color};">${s.count}</span></div>
        <div class="fd-c-desc">${s.desc}</div>
      </div>`;
    }).join('');
  },

  // Volet recette placé à côté du cercle (rythme + recette encaissée + accès détail).
  _fleetRecettePanel(d) {
    const paceBg = d.paceState === 'faible' ? 'rgba(250,137,107,.15)' : d.paceState === 'bon' ? 'rgba(19,222,185,.15)' : d.paceState === 'modere' ? 'rgba(255,174,31,.16)' : 'var(--bg-tertiary)';
    const paceColor = d.paceState === 'faible' ? 'var(--danger-dim)' : d.paceState === 'bon' ? 'var(--success-dim)' : d.paceState === 'modere' ? 'var(--warning-dim)' : 'var(--text-secondary)';
    const paceIcon = d.paceState === 'faible' ? 'solar:danger-triangle-bold' : d.paceState === 'bon' ? 'solar:check-circle-bold' : d.paceState === 'modere' ? 'solar:info-circle-bold' : 'solar:clock-circle-bold';
    const pace = `<div style="display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${paceBg};color:${paceColor};align-self:flex-start;"><iconify-icon icon="${paceIcon}"></iconify-icon>${d.paceLabel}${d.nbActifsJour > 0 && d.objectifJourActifs > 0 ? ` · ${Math.round(d.pctJourType * 100)}% d'une journée type` : ''}</div>`;
    const bars = (() => {
      const weeks = (d.weeklyPayments || []).slice(-8);
      const maxV = Math.max(1, ...weeks.map(w => w.verse || 0));
      const sumV = weeks.reduce((s, w) => s + (w.verse || 0), 0);
      const fmt = n => { n = Math.round(n || 0); const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M'; if (a >= 1e3) return Math.round(n / 1e3) + 'k'; return String(n); };
      const cols = weeks.map((w, i) => {
        const h = Math.max(4, (w.verse || 0) / maxV * 82);
        return `<div class="mini-col" onmouseenter="DashboardPage._miniHover(${i})"><div class="mini-tip">${fmt(w.verse || 0)} F</div><div class="mini-bar" data-fmt="${fmt(w.verse || 0)} F" style="height:${h.toFixed(1)}px;"></div><div class="mini-lbl">${Utils.escHtml(w.label || '')}</div></div>`;
      }).join('');
      return `<div id="hero-mini" class="mini-chart" data-total="${fmt(sumV)} F" onmouseleave="DashboardPage._miniLeave()"><div class="mini-head"><div class="mini-title"><span class="mini-dot"></span>Recette encaissée · 8 sem.</div><div class="mini-val" id="mini-value">${fmt(sumV)} F</div></div><div class="mini-bars">${cols}</div></div>`;
    })();
    return `<div class="fd-recette-inner" onclick="DashboardPage._showActiviteDetail()">
      ${pace}
      ${bars}
      <div class="fd-voir">Voir l'activité en détail <iconify-icon icon="solar:arrow-right-linear"></iconify-icon></div>
    </div>`;
  },

  _renderFleetDonut(d) {
    const yStatus = this._fleetStatusCache ? this._fleetStatusCache.data : null;
    const { segments, total } = this._fleetBuckets(d, yStatus);
    return `<div class="d-card fd-card">
      <div class="fd-head"><div class="fd-title">Flotte en direct</div><span class="fd-live"><span class="fd-dot-live"></span>Temps réel</span></div>
      <div class="fd-top">
        <div class="fd-donut-wrap" id="fleet-donut-circle">${this._fleetCircleInner(d, segments, total)}</div>
        <div class="fd-recette">${this._fleetRecettePanel(d)}</div>
      </div>
      <div class="fd-cards" id="fleet-donut-cards">${this._fleetCardsInner(segments)}</div>
    </div>`;
  },

  _renderFleetDonutInto(d) {
    const yStatus = this._fleetStatusCache ? this._fleetStatusCache.data : null;
    const { segments, total } = this._fleetBuckets(d, yStatus);
    const circle = document.getElementById('fleet-donut-circle');
    if (circle) { circle.replaceChildren(); circle.insertAdjacentHTML('beforeend', this._fleetCircleInner(d, segments, total)); }
    const cards = document.getElementById('fleet-donut-cards');
    if (cards) { cards.replaceChildren(); cards.insertAdjacentHTML('beforeend', this._fleetCardsInner(segments)); }
  },

  async _loadFleetStatus(d, force) {
    d = d || this._lastData;
    if (!d) return;
    if (!this._isToday()) return; // temps réel pertinent uniquement pour aujourd'hui
    const now = Date.now();
    if (!force && this._fleetStatusCache && (now - this._fleetStatusCache.ts < 60000)) {
      this._renderFleetDonutInto(d);
      return;
    }
    let data = null;
    try {
      const r = await Store.getFleetStatus();
      if (r) data = r;
    } catch (e) { console.warn('Fleet status error:', e.message); }
    this._fleetStatusCache = { ts: now, data };
    this._renderFleetDonutInto(d);
  },

  _fdHot(i, on) {
    document.querySelectorAll('.fd-seg').forEach(el => {
      const j = +el.getAttribute('data-seg');
      if (j === i) { el.style.strokeWidth = on ? '24' : '18'; el.style.opacity = '1'; }
      else el.style.opacity = on ? '0.35' : '1';
    });
    document.querySelectorAll('.fd-c').forEach(c => c.classList.toggle('hot', on && +c.getAttribute('data-i') === i));
  },

  _fleetCardClick(key) {
    const d = this._lastData; if (!d) return;
    const yStatus = this._fleetStatusCache ? this._fleetStatusCache.data : null;
    const { segments } = this._fleetBuckets(d, yStatus);
    const seg = segments.find(s => s.key === key); if (!seg) return;
    const RSN = {
      ca_faible: ['CA anormalement bas', '#FA896B', 'rgba(250,137,107,.14)'],
      ca_modere: ['CA sous la moyenne', '#FFAE1F', 'rgba(255,174,31,.16)'],
      occupe: ['Occupé sur Yango', '#635BFF', 'rgba(99,91,255,.13)'],
      idle: ['En ligne sans course >10 min', '#EF4444', 'rgba(239,68,68,.13)'],
    };
    const rows = seg.drivers.length ? seg.drivers.map(it => {
      const initial = (it.prenom || it.nom || '?').charAt(0).toUpperCase();
      const badges = (it.reasons || []).map(r => { const m = RSN[r]; return m ? `<span style="display:inline-flex;align-items:center;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px;background:${m[2]};color:${m[1]};">${m[0]}</span>` : ''; }).join('');
      const extra = it.idleMin && (it.reasons || []).includes('idle') ? `<span style="font-size:11px;color:var(--text-muted);font-weight:600;">${it.idleMin} min</span>` : '';
      const caTxt = (it.ca != null && it.ca > 0) ? `<div style="font-size:12px;font-weight:800;color:var(--text-primary);white-space:nowrap;">${Utils.formatCurrency(it.ca)}</div>` : '';
      const call = it.tel ? `<a href="tel:${Utils.escHtml(String(it.tel))}" title="Appeler" style="width:34px;height:34px;border-radius:9px;background:rgba(19,222,185,.14);color:var(--success-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0;text-decoration:none;"><iconify-icon icon="solar:phone-bold"></iconify-icon></a>` : '';
      return `<div style="display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--border-color);">
        <div style="width:36px;height:36px;border-radius:50%;background:${seg.color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">${Utils.escHtml(initial)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escHtml(((it.prenom || '') + ' ' + (it.nom || '')).trim() || 'Chauffeur')}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px;">${badges}${extra}</div>
        </div>
        ${caTxt}
        ${call}
      </div>`;
    }).join('') : `<div style="padding:22px 4px;color:var(--text-muted);font-size:13px;">Aucun chauffeur dans cet état.</div>`;
    const body = `<div style="max-height:60vh;overflow-y:auto;">${rows}</div>`;
    Modal.open({ title: `${seg.label} · ${seg.drivers.length}`, body, size: 'md' });
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
