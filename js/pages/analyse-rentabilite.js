/**
 * AnalyseRentabilitePage — Analyse de la rentabilité de la flotte.
 * Ouverte au clic sur le widget « Rentabilité » du tableau de bord. Design
 * analytique (graphe + objectif RSI + tendance + KPI + table par véhicule).
 * Réutilise les calculs de RentabilitePage._getData(). Montants entiers (F).
 */
const AnalyseRentabilitePage = {
  _d: null,

  render() {
    this._d = this._load();
    this._paint();
  },
  destroy() { this._d = null; },

  _load() {
    try {
      if (typeof RentabilitePage !== 'undefined' && RentabilitePage._getData) return RentabilitePage._getData();
    } catch (e) { console.warn('Analyse rentabilité:', e.message); }
    return null;
  },

  _fmt(n) { return Utils.formatNumber(Math.round(n || 0)) + ' F'; },
  _pct(n) { return (n >= 0 ? '+' : '') + (Math.round((n || 0) * 10) / 10) + '%'; },

  _paint() {
    const c = document.getElementById('page-content');
    if (!c) return;
    c.replaceChildren();
    c.insertAdjacentHTML('beforeend', this._template());
  },

  _template() {
    const d = this._d;
    if (!d) {
      return `${this._styles()}
      <div class="page-header"><h1><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Analyse de la rentabilité</h1>
        <div class="page-actions"><button class="btn btn-sm btn-secondary" onclick="Router.navigate('/dashboard')"><iconify-icon icon="solar:arrow-left-linear"></iconify-icon> Tableau de bord</button></div>
      </div>
      <div class="ar-empty">Données de rentabilité indisponibles (aucun véhicule ou versement).</div>`;
    }

    const profit = d.fleetProfit || 0;
    const revenus = d.fleetTotalRevenue || 0;
    const couts = d.fleetTotalCost || 0;
    const rsi = d.rsiGlobal || 0;
    const marge = d.margeMensuelle || 0;
    const rsiPct = Math.min(100, Math.max(0, rsi));
    const profitUp = profit >= 0;
    const margeUp = marge >= 0;
    const acc = profitUp ? '#0a9d78' : '#dc2626';

    const kpis = [
      { lbl: 'Revenus totaux', val: this._fmt(revenus), tag: null },
      { lbl: 'Coûts totaux', val: this._fmt(couts), tag: null },
      { lbl: 'Résultat net', val: this._fmt(profit), tag: this._pct(d.fleetROI || 0), up: profitUp },
      { lbl: 'RSI global', val: this._pct(rsi).replace('+', ''), tag: rsi >= 100 ? 'récupéré' : 'en cours', up: rsi >= 0 }
    ];
    const kpiRow = kpis.map(k => `
      <div class="ar-kpi">
        <div class="ar-kpi-lbl">${k.lbl}</div>
        <div class="ar-kpi-row">
          <div class="ar-kpi-val">${k.val}</div>
          ${k.tag ? `<span class="ar-kpi-tag ${k.up ? 'up' : 'down'}">${k.tag}</span>` : ''}
        </div>
      </div>`).join('');

    return `
      ${this._styles()}
      <div class="page-header">
        <h1><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Analyse de la rentabilité</h1>
        <div class="page-actions">
          <button class="btn btn-sm btn-secondary" onclick="Router.navigate('/rentabilite')"><iconify-icon icon="solar:document-text-linear"></iconify-icon> Rapport détaillé</button>
          <button class="btn btn-sm btn-secondary" onclick="Router.navigate('/dashboard')"><iconify-icon icon="solar:arrow-left-linear"></iconify-icon> Tableau de bord</button>
        </div>
      </div>

      <div class="ar-grid">
        <div class="ar-main">
          <div class="ar-main-head">
            <div>
              <div class="ar-eyebrow">Résultat mensuel par véhicule</div>
              <div class="ar-main-title">Profit net / mois</div>
            </div>
            <div class="ar-main-total">
              <div class="ar-main-amount" style="color:${acc};">${this._fmt(marge)}<span class="ar-unit"> /mois</span></div>
              <span class="ar-trend ${margeUp ? 'up' : 'down'}"><iconify-icon icon="${margeUp ? 'solar:arrow-right-up-linear' : 'solar:arrow-right-down-linear'}"></iconify-icon>marge nette</span>
            </div>
          </div>
          ${this._barChart(d.analysis || [])}
        </div>

        <div class="ar-side">
          <div class="ar-goal">
            <div>
              <div class="ar-goal-eyebrow">Retour sur investissement</div>
              <div class="ar-goal-title">Récupération du capital</div>
            </div>
            <div class="ar-goal-bottom">
              <div class="ar-goal-line">
                <span class="ar-goal-pct">${this._pct(rsi).replace('+', '')}</span>
                <span class="ar-goal-target">Investi&nbsp;: ${this._fmt(d.investTotal || 0)}</span>
              </div>
              <div class="ar-goal-bar"><div class="ar-goal-fill" style="width:${rsiPct}%"></div></div>
              <div class="ar-goal-note">${d.moisRecuperation ? `Capital récupéré dans ~${d.moisRecuperation} mois au rythme actuel` : (marge > 0 ? 'Investissement déjà couvert' : 'Marge négative — récupération non atteignable actuellement')}</div>
            </div>
          </div>
          <div class="ar-info">
            <div class="ar-info-head">
              <div class="ar-info-icon" style="background:${profitUp ? 'rgba(19,222,185,.14)' : 'rgba(250,137,107,.16)'};color:${acc};"><iconify-icon icon="${profitUp ? 'solar:graph-up-bold' : 'solar:graph-down-bold'}"></iconify-icon></div>
              <h4>${profitUp ? 'Flotte rentable' : 'Flotte déficitaire'}</h4>
            </div>
            <p>La flotte dégage un résultat de <b style="color:${acc};">${this._fmt(profit)}</b> pour ${this._fmt(revenus)} de revenus et ${this._fmt(couts)} de coûts. Charges d'exploitation&nbsp;: <b>${this._fmt(d.chargesOperationnelles || 0)}/mois</b>, mensualités&nbsp;: <b>${this._fmt(d.mensualiteTotaleMensuelle || 0)}/mois</b>.</p>
          </div>
        </div>
      </div>

      <div class="ar-kpis">${kpiRow}</div>

      <div class="ar-table-card">
        <div class="ar-table-head">
          <h3>Rentabilité par véhicule</h3>
          <span class="ar-table-sub">${(d.analysis || []).length} véhicule${(d.analysis || []).length > 1 ? 's' : ''} · leasing ${d.leasingCount || 0} · achat ${d.cashCount || 0}</span>
        </div>
        ${this._table(d.analysis || [])}
      </div>
    `;
  },

  // Barres verticales : profit mensuel par véhicule (vert positif / rouge négatif),
  // triées décroissant, ligne de zéro.
  _barChart(analysis) {
    const items = (analysis || []).slice()
      .map(a => ({ label: (a.vehicule && (a.vehicule.immatriculation || `${a.vehicule.marque || ''} ${a.vehicule.modele || ''}`.trim())) || '—', value: a.monthlyProfit || 0 }))
      .sort((x, y) => y.value - x.value)
      .slice(0, 12);
    if (!items.length) return `<div class="ar-empty">Aucun véhicule à analyser.</div>`;
    const W = 720, H = 240, padX = 6, padTop = 24, padBot = 40;
    const innerW = W - padX * 2, innerH = H - padTop - padBot;
    const posMax = Math.max(0, ...items.map(i => i.value));
    const negMax = Math.min(0, ...items.map(i => i.value));
    const range = (posMax - negMax) || 1;
    const zeroY = padTop + (posMax / range) * innerH;
    const n = items.length;
    const slot = innerW / n, bw = Math.min(46, slot * 0.6);
    const bars = items.map((it, i) => {
      const cx = padX + slot * i + slot / 2;
      const h = Math.abs(it.value) / range * innerH;
      const y = it.value >= 0 ? zeroY - h : zeroY;
      const col = it.value >= 0 ? '#13DEB9' : '#FA896B';
      const short = it.label.length > 9 ? it.label.slice(0, 8) + '…' : it.label;
      return `<g>
        <rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="5" fill="${col}"><title>${Utils.escHtml(it.label)} : ${this._fmt(it.value)}/mois</title></rect>
        <text x="${cx.toFixed(1)}" y="${(H - 24).toFixed(1)}" text-anchor="middle" class="ar-bxlbl">${Utils.escHtml(short)}</text>
        <text x="${cx.toFixed(1)}" y="${(H - 12).toFixed(1)}" text-anchor="middle" class="ar-bxval" fill="${col}">${this._fmtShort(it.value)}</text>
      </g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="ar-chart" preserveAspectRatio="none" role="img" aria-label="Profit mensuel par véhicule">
      <line x1="${padX}" y1="${zeroY.toFixed(1)}" x2="${W - padX}" y2="${zeroY.toFixed(1)}" stroke="var(--border-color)" stroke-width="1"></line>
      ${bars}
    </svg>`;
  },

  _fmtShort(n) {
    n = Math.round(n || 0); const a = Math.abs(n);
    const s = a >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + 'M' : a >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
    return s;
  },

  _table(analysis) {
    const items = (analysis || []).slice().sort((a, b) => (b.monthlyProfit || 0) - (a.monthlyProfit || 0));
    if (!items.length) return `<div class="ar-empty">Aucun véhicule à analyser.</div>`;
    const rows = items.map(a => {
      const v = a.vehicule || {};
      const nom = v.immatriculation || `${v.marque || ''} ${v.modele || ''}`.trim() || '—';
      const type = a.isEV ? `<span class="ar-badge info">Électrique</span>` : `<span class="ar-badge muted">Thermique</span>`;
      const prof = a.monthlyProfit || 0;
      const roi = a.roi || 0;
      return `<tr>
        <td><span class="ar-name">${Utils.escHtml(nom)}</span> ${type}</td>
        <td class="ar-td-num ar-td-muted">${this._fmt(a.totalRevenue || 0)}</td>
        <td class="ar-td-num ar-td-muted">${this._fmt(a.totalCost || 0)}</td>
        <td class="ar-td-num ar-td-strong" style="color:${prof >= 0 ? '#0a9d78' : '#dc2626'};">${this._fmt(prof)}/mois</td>
        <td class="ar-td-num"><span class="ar-badge ${roi >= 0 ? 'up' : 'down'}">${this._pct(roi)}</span></td>
      </tr>`;
    }).join('');
    return `<div class="ar-table-wrap"><table class="ar-table">
      <thead><tr><th>Véhicule</th><th class="ar-td-num">Revenus</th><th class="ar-td-num">Coûts</th><th class="ar-td-num">Profit</th><th class="ar-td-num">ROI</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  },

  _styles() {
    return `<style>
      .ar-grid { display:grid; grid-template-columns:2fr 1fr; gap:18px; margin-bottom:18px; }
      @media (max-width:900px){ .ar-grid{ grid-template-columns:1fr; } }
      .ar-main { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:22px; padding:22px 24px; }
      .ar-main-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:6px; }
      .ar-eyebrow { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.18em; color:var(--text-muted); }
      .ar-main-title { font-size:18px; font-weight:800; color:var(--text-primary); margin-top:4px; }
      .ar-main-total { text-align:right; }
      .ar-main-amount { font-size:24px; font-weight:900; letter-spacing:-.02em; white-space:nowrap; }
      .ar-unit { font-size:13px; font-weight:700; color:var(--text-muted); }
      .ar-trend { display:inline-flex; align-items:center; gap:3px; font-size:12px; font-weight:800; padding:2px 8px; border-radius:20px; margin-top:4px; }
      .ar-trend.up { color:#0a9d78; background:rgba(19,222,185,.15); }
      .ar-trend.down { color:#e0603a; background:rgba(250,137,107,.15); }
      .ar-chart { width:100%; height:240px; display:block; margin-top:10px; overflow:visible; }
      .ar-bxlbl { fill:var(--text-muted); font-size:10px; font-weight:600; }
      .ar-bxval { font-size:10px; font-weight:800; }
      .ar-side { display:flex; flex-direction:column; gap:14px; }
      .ar-goal { background:#18181b; color:#fff; border-radius:22px; padding:22px; display:flex; flex-direction:column; justify-content:space-between; min-height:170px; gap:16px; }
      .ar-goal-eyebrow { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.2em; color:#8b8b96; }
      .ar-goal-title { font-size:18px; font-weight:800; margin-top:4px; }
      .ar-goal-line { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; }
      .ar-goal-pct { font-size:30px; font-weight:800; letter-spacing:-.02em; }
      .ar-goal-target { font-size:12px; color:#a1a1aa; margin-bottom:4px; }
      .ar-goal-bar { width:100%; height:6px; background:rgba(255,255,255,.14); border-radius:99px; overflow:hidden; }
      .ar-goal-fill { height:100%; background:#fff; border-radius:99px; transition:width .5s cubic-bezier(.25,1,.5,1); }
      .ar-goal-note { font-size:11px; color:#a1a1aa; margin-top:10px; line-height:1.4; }
      .ar-info { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:22px; padding:20px; }
      .ar-info-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
      .ar-info-icon { width:32px; height:32px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; }
      .ar-info h4 { margin:0; font-size:15px; font-weight:800; color:var(--text-primary); }
      .ar-info p { margin:0; font-size:13px; line-height:1.55; color:var(--text-secondary); }
      .ar-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:18px; }
      @media (max-width:760px){ .ar-kpis{ grid-template-columns:repeat(2,1fr); } }
      .ar-kpi { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; padding:16px 18px; }
      .ar-kpi-lbl { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text-muted); margin-bottom:8px; }
      .ar-kpi-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
      .ar-kpi-val { font-size:20px; font-weight:900; color:var(--text-primary); letter-spacing:-.02em; white-space:nowrap; }
      .ar-kpi-tag { font-size:11px; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap; }
      .ar-kpi-tag.up { color:#0a9d78; background:rgba(19,222,185,.14); }
      .ar-kpi-tag.down { color:#e0603a; background:rgba(250,137,107,.14); }
      .ar-table-card { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:22px; padding:20px 24px; }
      .ar-table-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
      .ar-table-head h3 { margin:0; font-size:16px; font-weight:800; color:var(--text-primary); }
      .ar-table-sub { font-size:12px; color:var(--text-muted); font-weight:600; }
      .ar-table-wrap { overflow-x:auto; }
      .ar-table { width:100%; border-collapse:collapse; font-size:13px; }
      .ar-table th { text-align:left; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); padding:8px 10px; border-bottom:1px solid var(--border-color); }
      .ar-table td { padding:11px 10px; border-bottom:1px solid var(--border-color); color:var(--text-primary); }
      .ar-table tbody tr:last-child td { border-bottom:none; }
      .ar-td-num { text-align:right; }
      .ar-td-strong { font-weight:800; }
      .ar-td-muted { color:var(--text-muted); }
      .ar-name { font-weight:700; }
      .ar-badge { display:inline-flex; align-items:center; font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:20px; }
      .ar-badge.up { color:#0a9d78; background:rgba(19,222,185,.14); }
      .ar-badge.down { color:#e0603a; background:rgba(250,137,107,.14); }
      .ar-badge.info { color:#5D87FF; background:rgba(93,135,255,.14); }
      .ar-badge.muted { color:var(--text-muted); background:var(--bg-tertiary); }
      .ar-empty { padding:26px 4px; text-align:center; color:var(--text-muted); font-size:13px; }
    </style>`;
  }
};
