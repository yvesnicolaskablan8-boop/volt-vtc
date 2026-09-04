/**
 * AnalyseVersementsPage — Analyse des versements (recette encaissée)
 * Ouverte depuis le widget « Recette encaissée » du tableau de bord (clic sur
 * une barre) ou directement via #/analyse-versements. Design inspiré d'un
 * dashboard analytique : grand graphique d'aire + objectif + tendance + KPI +
 * table des versements de la période sélectionnée. Montants en entier (FCFA).
 */
const AnalyseVersementsPage = {
  _ctx: null,       // contexte passé par le dashboard : { gran, index }
  _gran: 'semaine', // jour | semaine | mois
  _sel: 7,          // index de la période mise en avant (0..7)
  _series: [],
  _acc: '#13DEB9',

  // Appelé par le dashboard juste avant Router.navigate pour cibler une période.
  setContext(ctx) { this._ctx = ctx || null; },

  render() {
    if (this._ctx && this._ctx.gran) this._gran = this._ctx.gran;
    this._series = this._buildSeries(this._gran);
    this._sel = (this._ctx && this._ctx.index != null)
      ? Math.min(this._series.length - 1, Math.max(0, this._ctx.index))
      : this._series.length - 1;
    this._ctx = null;
    this._paint();
  },

  destroy() { this._series = []; },

  // ---- Données -----------------------------------------------------------

  // Bornes des 8 dernières périodes selon la granularité.
  _periodsBounds(gran) {
    const now = new Date();
    const out = [];
    if (gran === 'jour') {
      for (let d = 7; d >= 0; d--) {
        const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - d);
        const end = new Date(start); end.setDate(end.getDate() + 1);
        out.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, start, end });
      }
    } else if (gran === 'mois') {
      for (let m = 7; m >= 0; m--) {
        const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
        out.push({ label: Utils.getMonthShort(start.getMonth()), start, end });
      }
    } else {
      for (let w = 7; w >= 0; w--) {
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (w * 7 + now.getDay()));
        const end = new Date(start); end.setDate(end.getDate() + 7);
        out.push({ label: `S${Utils.getWeekNumber(start)}`, start, end });
      }
    }
    return out;
  },

  _buildSeries(gran) {
    const vers = Store.get('versements') || [];
    return this._periodsBounds(gran).map(b => {
      const inP = vers.filter(v => { const x = new Date(v.date); return x >= b.start && x < b.end; });
      const valid = inP.filter(v => v.statut !== 'supprime');
      return {
        label: b.label, start: b.start, end: b.end,
        encaisse: valid.reduce((s, v) => s + (v.montantVerse || 0), 0),
        attendu: valid.reduce((s, v) => s + (v.commission || 0), 0),
        manquant: valid.reduce((s, v) => s + (v.manquant || 0), 0),
        nb: valid.filter(v => (v.montantVerse || 0) > 0).length,
        items: valid
      };
    });
  },

  _fmt(n) { return Utils.formatNumber(Math.round(n || 0)) + ' F'; },
  _pct(n) { return (n >= 0 ? '+' : '') + Math.round(n) + '%'; },

  // ---- Rendu -------------------------------------------------------------

  _paint() {
    const c = document.getElementById('page-content');
    if (!c) return;
    c.replaceChildren();
    c.insertAdjacentHTML('beforeend', this._template());
  },

  _template() {
    const s = this._series;
    const cur = s[this._sel] || { encaisse: 0, attendu: 0, manquant: 0, nb: 0, items: [] };
    const prev = s[this._sel - 1];
    const totalEncaisse = cur.encaisse;
    const recouvr = cur.attendu > 0 ? Math.min(100, Math.round(cur.encaisse / cur.attendu * 100)) : (cur.encaisse > 0 ? 100 : 0);
    const trend = prev && prev.encaisse > 0 ? ((cur.encaisse - prev.encaisse) / prev.encaisse * 100) : (cur.encaisse > 0 ? 100 : 0);
    const trendUp = trend >= 0;
    const ticket = cur.nb > 0 ? cur.encaisse / cur.nb : 0;
    const granLbl = this._gran === 'jour' ? 'jour' : this._gran === 'mois' ? 'mois' : 'semaine';

    const gBtn = (k, l) => `<button type="button" class="av-gran-btn${this._gran === k ? ' is-active' : ''}" onclick="AnalyseVersementsPage._setGran('${k}')">${l}</button>`;

    const kpis = [
      { lbl: 'Recette encaissée', val: this._fmt(cur.encaisse), tag: this._pct(trend), up: trendUp },
      { lbl: 'Versements reçus', val: Utils.formatNumber(cur.nb), tag: null },
      { lbl: 'Versement moyen', val: this._fmt(ticket), tag: null },
      { lbl: 'Reste à recouvrer', val: this._fmt(cur.manquant), tag: cur.manquant > 0 ? 'à relancer' : 'soldé', up: cur.manquant === 0 }
    ];
    const kpiRow = kpis.map(k => `
      <div class="av-kpi">
        <div class="av-kpi-lbl">${k.lbl}</div>
        <div class="av-kpi-row">
          <div class="av-kpi-val">${k.val}</div>
          ${k.tag ? `<span class="av-kpi-tag ${k.up ? 'up' : 'down'}">${k.tag}</span>` : ''}
        </div>
      </div>`).join('');

    return `
      ${this._styles()}
      <div class="page-header">
        <h1><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Analyse des versements</h1>
        <div class="page-actions">
          <div class="av-gran">${gBtn('jour', 'Jour')}${gBtn('semaine', 'Semaine')}${gBtn('mois', 'Mois')}</div>
          <button class="btn btn-sm btn-secondary" onclick="Router.navigate('/dashboard')"><iconify-icon icon="solar:arrow-left-linear"></iconify-icon> Tableau de bord</button>
        </div>
      </div>

      <div class="av-grid">
        <div class="av-main">
          <div class="av-main-head">
            <div>
              <div class="av-eyebrow">Recette encaissée · 8 ${this._gran === 'jour' ? 'jours' : this._gran === 'mois' ? 'mois' : 'semaines'}</div>
              <div class="av-main-title">Évolution par ${granLbl}</div>
            </div>
            <div class="av-main-total">
              <div class="av-main-amount">${this._fmt(totalEncaisse)}</div>
              <span class="av-trend ${trendUp ? 'up' : 'down'}"><iconify-icon icon="${trendUp ? 'solar:arrow-right-up-linear' : 'solar:arrow-right-down-linear'}"></iconify-icon>${this._pct(trend)}</span>
            </div>
          </div>
          ${this._areaChart(s, this._sel)}
        </div>

        <div class="av-side">
          <div class="av-goal">
            <div>
              <div class="av-goal-eyebrow">Taux de recouvrement</div>
              <div class="av-goal-title">Encaissé / attendu</div>
            </div>
            <div class="av-goal-bottom">
              <div class="av-goal-line">
                <span class="av-goal-pct">${recouvr}%</span>
                <span class="av-goal-target">Attendu&nbsp;: ${this._fmt(cur.attendu)}</span>
              </div>
              <div class="av-goal-bar"><div class="av-goal-fill" style="width:${recouvr}%"></div></div>
            </div>
          </div>
          <div class="av-info">
            <div class="av-info-head">
              <div class="av-info-icon"><iconify-icon icon="${trendUp ? 'solar:graph-up-bold' : 'solar:graph-down-bold'}"></iconify-icon></div>
              <h4>Tendance</h4>
            </div>
            <p>La recette de cette ${granLbl} est ${trendUp ? 'en hausse' : 'en baisse'} de <b>${this._pct(Math.abs(trend))}</b> ${prev ? `par rapport à la ${granLbl} précédente (${this._fmt(prev.encaisse)}).` : '.'}</p>
          </div>
        </div>
      </div>

      <div class="av-kpis">${kpiRow}</div>

      <div class="av-table-card">
        <div class="av-table-head">
          <h3>Versements · ${Utils.escHtml(cur.label || '')}</h3>
          <span class="av-table-sub">${this._periodRangeLabel(cur)} · ${cur.nb} versement${cur.nb > 1 ? 's' : ''}</span>
        </div>
        ${this._table(cur)}
      </div>
    `;
  },

  _periodRangeLabel(p) {
    if (!p || !p.start) return '';
    const f = (d) => Utils.formatDate ? Utils.formatDate(d.toISOString().split('T')[0]) : d.toLocaleDateString('fr-FR');
    const last = new Date(p.end); last.setDate(last.getDate() - 1);
    if (this._gran === 'jour') return f(p.start);
    return `${f(p.start)} → ${f(last)}`;
  },

  _table(p) {
    const chById = new Map((Store.get('chauffeurs') || []).map(c => [c.id, c]));
    const parkId = (((Store.get('settings') || {}).integrations || {}).yango || {}).parkId || '';
    const items = (p.items || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!items.length) return `<div class="av-empty">Aucun versement sur cette période.</div>`;
    const stMap = {
      valide: ['Validé', 'up'], en_attente: ['En attente', 'warn'], partiel: ['Partiel', 'info'], supprime: ['Supprimé', 'muted']
    };
    const rows = items.map(v => {
      const ch = chById.get(v.chauffeurId);
      const nom = ch ? `${ch.prenom || ''} ${ch.nom || ''}`.trim() : (v.chauffeurId || '—');
      const st = stMap[v.statut] || [v.statut || '—', 'muted'];
      const date = Utils.formatDate ? Utils.formatDate(String(v.date).slice(0, 10)) : String(v.date).slice(0, 10);
      const yango = (ch && ch.yangoDriverId && parkId)
        ? ` <a href="https://fleet.yango.com/contractors/${encodeURIComponent(ch.yangoDriverId)}/details?park_id=${encodeURIComponent(parkId)}" target="_blank" rel="noopener" title="Ouvrir la page Yango (surveillance)" class="av-yango"><iconify-icon icon="solar:map-point-bold"></iconify-icon></a>`
        : '';
      const tel = ch && ch.telephone ? ` <a href="tel:${Utils.escHtml(String(ch.telephone))}" title="Appeler" class="av-tel"><iconify-icon icon="solar:phone-bold"></iconify-icon></a>` : '';
      return `<tr>
        <td><span class="av-name">${Utils.escHtml(nom || 'Chauffeur')}</span>${tel}${yango}</td>
        <td class="av-td-muted">${Utils.escHtml(date)}</td>
        <td class="av-td-num av-td-strong">${this._fmt(v.montantVerse || 0)}</td>
        <td class="av-td-num av-td-muted">${this._fmt(v.commission || 0)}</td>
        <td>${v.manquant > 0 ? `<span class="av-badge down">${this._fmt(v.manquant)}</span>` : '—'}</td>
        <td><span class="av-badge ${st[1]}">${Utils.escHtml(st[0])}</span></td>
      </tr>`;
    }).join('');
    return `<div class="av-table-wrap"><table class="av-table">
      <thead><tr><th>Chauffeur</th><th>Date</th><th class="av-td-num">Versé</th><th class="av-td-num">Commission</th><th>Manquant</th><th>Statut</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  },

  // Graphique d'aire lissé (Catmull-Rom → Bézier), période sélectionnée en relief.
  _areaChart(series, sel) {
    const W = 720, H = 240, padX = 8, padTop = 26, padBot = 34;
    const n = series.length;
    const vals = series.map(s => s.encaisse || 0);
    const max = Math.max(1, ...vals);
    const innerW = W - padX * 2, innerH = H - padTop - padBot;
    const xs = i => padX + (n === 1 ? innerW / 2 : i / (n - 1) * innerW);
    const ys = v => padTop + innerH - (v / max) * innerH;
    const pts = vals.map((v, i) => [+xs(i).toFixed(1), +ys(v).toFixed(1)]);
    let line = pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : '';
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1), c1y = (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1);
      const c2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1), c2y = (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1);
      line += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    const area = pts.length ? `${line} L ${pts[n - 1][0]},${padTop + innerH} L ${pts[0][0]},${padTop + innerH} Z` : '';
    const dots = pts.map((p, i) => {
      const on = i === sel;
      return `<circle cx="${p[0]}" cy="${p[1]}" r="${on ? 6 : 3.5}" fill="${on ? this._acc : 'var(--bg-secondary)'}" stroke="${this._acc}" stroke-width="${on ? 3 : 2}" class="av-dot" style="cursor:pointer" onclick="AnalyseVersementsPage._openPeriod(${i})"></circle>`;
    }).join('');
    const labels = series.map((s, i) => `<text x="${xs(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" class="av-xlbl ${i === sel ? 'on' : ''}">${Utils.escHtml(s.label || '')}</text>`).join('');
    const selPt = pts[sel];
    const tip = selPt ? `<g transform="translate(${selPt[0]},${Math.max(16, selPt[1] - 14)})"><rect x="-52" y="-20" width="104" height="22" rx="6" fill="var(--text-primary)"></rect><text x="0" y="-5" text-anchor="middle" class="av-tip-txt">${Utils.escHtml(this._fmt(vals[sel]))}</text></g>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" class="av-chart" preserveAspectRatio="none" role="img" aria-label="Recette encaissée par période">
      <defs><linearGradient id="avGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${this._acc}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${this._acc}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#avGrad)"></path>
      <path d="${line}" fill="none" stroke="${this._acc}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
      ${dots}${labels}${tip}
    </svg>`;
  },

  _setGran(g) {
    if (!['jour', 'semaine', 'mois'].includes(g)) return;
    this._gran = g;
    this._series = this._buildSeries(g);
    this._sel = this._series.length - 1;
    this._paint();
  },
  _openPeriod(i) {
    if (i < 0 || i >= this._series.length) return;
    this._sel = i;
    this._paint();
  },

  _styles() {
    return `<style>
      .av-grid { display:grid; grid-template-columns:2fr 1fr; gap:18px; margin-bottom:18px; }
      @media (max-width:900px){ .av-grid{ grid-template-columns:1fr; } }
      .av-main { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:22px; padding:22px 24px; }
      .av-main-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:6px; }
      .av-eyebrow { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.18em; color:var(--text-muted); }
      .av-main-title { font-size:18px; font-weight:800; color:var(--text-primary); margin-top:4px; }
      .av-main-total { text-align:right; }
      .av-main-amount { font-size:24px; font-weight:900; color:var(--text-primary); letter-spacing:-.02em; white-space:nowrap; }
      .av-trend { display:inline-flex; align-items:center; gap:3px; font-size:12px; font-weight:800; padding:2px 8px; border-radius:20px; margin-top:4px; }
      .av-trend.up { color:#0a9d78; background:rgba(19,222,185,.15); }
      .av-trend.down { color:#e0603a; background:rgba(250,137,107,.15); }
      .av-chart { width:100%; height:240px; display:block; margin-top:8px; overflow:visible; }
      .av-xlbl { fill:var(--text-muted); font-size:11px; font-weight:600; }
      .av-xlbl.on { fill:var(--text-primary); font-weight:800; }
      .av-tip-txt { fill:var(--bg-secondary); font-size:11px; font-weight:700; }
      .av-side { display:flex; flex-direction:column; gap:14px; }
      .av-goal { background:#18181b; color:#fff; border-radius:22px; padding:22px; display:flex; flex-direction:column; justify-content:space-between; min-height:150px; }
      .av-goal-eyebrow { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.2em; color:#8b8b96; }
      .av-goal-title { font-size:18px; font-weight:800; margin-top:4px; }
      .av-goal-line { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; }
      .av-goal-pct { font-size:30px; font-weight:800; letter-spacing:-.02em; }
      .av-goal-target { font-size:12px; color:#a1a1aa; margin-bottom:4px; }
      .av-goal-bar { width:100%; height:6px; background:rgba(255,255,255,.14); border-radius:99px; overflow:hidden; }
      .av-goal-fill { height:100%; background:#fff; border-radius:99px; transition:width .5s cubic-bezier(.25,1,.5,1); }
      .av-info { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:22px; padding:20px; }
      .av-info-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
      .av-info-icon { width:32px; height:32px; border-radius:10px; background:rgba(19,222,185,.14); color:#0a9d78; display:flex; align-items:center; justify-content:center; font-size:18px; }
      .av-info h4 { margin:0; font-size:15px; font-weight:800; color:var(--text-primary); }
      .av-info p { margin:0; font-size:13px; line-height:1.5; color:var(--text-secondary); }
      .av-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:18px; }
      @media (max-width:760px){ .av-kpis{ grid-template-columns:repeat(2,1fr); } }
      .av-kpi { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; padding:16px 18px; }
      .av-kpi-lbl { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text-muted); margin-bottom:8px; }
      .av-kpi-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
      .av-kpi-val { font-size:20px; font-weight:900; color:var(--text-primary); letter-spacing:-.02em; white-space:nowrap; }
      .av-kpi-tag { font-size:11px; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap; }
      .av-kpi-tag.up { color:#0a9d78; background:rgba(19,222,185,.14); }
      .av-kpi-tag.down { color:#e0603a; background:rgba(250,137,107,.14); }
      .av-gran { display:inline-flex; gap:4px; padding:3px; background:var(--bg-tertiary); border-radius:20px; }
      .av-gran-btn { border:none; background:transparent; color:var(--text-muted); font-size:12px; font-weight:700; padding:5px 13px; border-radius:20px; cursor:pointer; transition:all .15s; }
      .av-gran-btn:hover { color:var(--text-primary); }
      .av-gran-btn.is-active { background:var(--bg-secondary); color:var(--text-primary); box-shadow:0 1px 3px rgba(0,0,0,.12); }
      .av-table-card { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:22px; padding:20px 24px; }
      .av-table-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
      .av-table-head h3 { margin:0; font-size:16px; font-weight:800; color:var(--text-primary); }
      .av-table-sub { font-size:12px; color:var(--text-muted); font-weight:600; }
      .av-table-wrap { overflow-x:auto; }
      .av-table { width:100%; border-collapse:collapse; font-size:13px; }
      .av-table th { text-align:left; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); padding:8px 10px; border-bottom:1px solid var(--border-color); }
      .av-table td { padding:11px 10px; border-bottom:1px solid var(--border-color); color:var(--text-primary); }
      .av-table tbody tr:last-child td { border-bottom:none; }
      .av-td-num { text-align:right; }
      .av-td-strong { font-weight:800; }
      .av-td-muted { color:var(--text-muted); }
      .av-name { font-weight:600; }
      .av-tel, .av-yango { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:6px; text-decoration:none; vertical-align:-5px; margin-left:3px; font-size:13px; }
      .av-tel { background:rgba(19,222,185,.14); color:#0a9d78; }
      .av-yango { background:rgba(99,91,255,.13); color:#635BFF; }
      .av-badge { display:inline-flex; align-items:center; font-size:11px; font-weight:800; padding:3px 9px; border-radius:20px; }
      .av-badge.up { color:#0a9d78; background:rgba(19,222,185,.14); }
      .av-badge.down { color:#e0603a; background:rgba(250,137,107,.14); }
      .av-badge.warn { color:#b7791f; background:rgba(255,174,31,.16); }
      .av-badge.info { color:#5D87FF; background:rgba(93,135,255,.14); }
      .av-badge.muted { color:var(--text-muted); background:var(--bg-tertiary); }
      .av-empty { padding:26px 4px; text-align:center; color:var(--text-muted); font-size:13px; }
    </style>`;
  }
};
