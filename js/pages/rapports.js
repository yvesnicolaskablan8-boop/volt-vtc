/**
 * RapportsPage — Tableau de bord analytique de la flotte (style « advanced stats »).
 * Graphe CA encaissé (6 mois) + carte coûts flotte + tendance + KPI + top
 * chauffeurs. Lecture seule, données issues du Store. Montants entiers (FCFA).
 */
const RapportsPage = {
  _acc: '#F5512E',

  render() {
    this._d = this._getData();
    this._paint();
  },
  destroy() { this._d = null; },

  _fmt(n) { return Utils.formatNumber(Math.round(n || 0)) + ' F'; },
  _pct(n) { return (n >= 0 ? '+' : '') + Math.round(n) + '%'; },

  _getData() {
    const now = new Date();
    const versements = (Store.get('versements') || []).filter(v => v.statut !== 'supprime');
    const courses = (Store.get('courses') || []).filter(c => c.statut === 'terminee');
    const chauffeurs = (Store.get('chauffeurs') || []).filter(c => (c.statut || 'actif') !== 'inactif');
    const vehicules = Store.get('vehicules') || [];

    // Séries mensuelles (6 derniers mois)
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const vIn = versements.filter(v => { const d = new Date(v.date); return d >= mStart && d < mEnd; });
      const cIn = courses.filter(c => { const d = new Date(c.dateHeure); return d >= mStart && d < mEnd; });
      months.push({
        label: Utils.getMonthShort(mStart.getMonth()),
        encaisse: vIn.reduce((s, v) => s + (v.montantVerse || 0), 0),
        commission: vIn.reduce((s, v) => s + (v.commission || 0), 0),
        courses: cIn.length
      });
    }

    // Coûts flotte annualisés (Acquisition / Assurance / Maintenance / Énergie)
    let acq = 0, assur = 0, maint = 0, energie = 0;
    vehicules.forEach(v => {
      const isEV = v.typeEnergie === 'electrique';
      maint += (v.coutsMaintenance || []).reduce((s, m) => s + (m.montant || 0), 0);
      assur += v.primeAnnuelle || 0;
      acq += v.typeAcquisition === 'leasing' ? (v.mensualiteLeasing || 0) * 12 : (v.prixAchat || 0) / 5;
      const conso = v.consommation || (isEV ? 15 : 6.5);
      const coutE = v.coutEnergie || (isEV ? 120 : 800);
      energie += ((v.kilometrageMensuel || 2500) * 12 * conso / 100) * coutE;
    });
    const couts = [
      { label: 'Acquisition', val: Math.round(acq), color: '#F5512E' },
      { label: 'Assurance', val: Math.round(assur), color: '#e8930c' },
      { label: 'Maintenance', val: Math.round(maint), color: '#ef4444' },
      { label: 'Énergie', val: Math.round(energie), color: '#13deb9' }
    ];
    const coutTotal = couts.reduce((s, c) => s + c.val, 0);

    // Top chauffeurs par CA encaissé (versements)
    const byDriver = new Map();
    versements.forEach(v => { if (v.chauffeurId) byDriver.set(v.chauffeurId, (byDriver.get(v.chauffeurId) || 0) + (v.montantVerse || 0)); });
    const chById = new Map(chauffeurs.map(c => [c.id, c]));
    const drivers = [...byDriver.entries()]
      .map(([id, ca]) => { const c = chById.get(id); return { nom: c ? `${c.prenom || ''} ${c.nom || ''}`.trim() : (id || '—'), ca }; })
      .filter(d => d.ca > 0)
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 8);

    const caTotal = months.reduce((s, m) => s + m.encaisse, 0);
    const commTotal = months.reduce((s, m) => s + m.commission, 0);
    const coursesTotal = months.reduce((s, m) => s + m.courses, 0);

    return { months, couts, coutTotal, drivers, caTotal, commTotal, coursesTotal, nbChauffeurs: chauffeurs.filter(c => c.statut === 'actif').length, nbVehicules: vehicules.filter(v => v.statut !== 'inactif' && v.statut !== 'vendu').length };
  },

  _paint() {
    const c = document.getElementById('page-content');
    if (!c) return;
    c.replaceChildren();
    c.insertAdjacentHTML('beforeend', this._template());
  },

  _template() {
    const d = this._d;
    const m = d.months;
    const cur = m[m.length - 1] || { encaisse: 0 };
    const prev = m[m.length - 2];
    const trend = prev && prev.encaisse > 0 ? ((cur.encaisse - prev.encaisse) / prev.encaisse * 100) : (cur.encaisse > 0 ? 100 : 0);
    const up = trend >= 0;

    const kpis = [
      { lbl: 'CA encaissé (6 mois)', val: this._fmt(d.caTotal), tag: this._pct(trend), up },
      { lbl: 'Commissions (6 mois)', val: this._fmt(d.commTotal), tag: null },
      { lbl: 'Coûts flotte (annuel)', val: this._fmt(d.coutTotal), tag: null },
      { lbl: 'Courses (6 mois)', val: Utils.formatNumber(d.coursesTotal), tag: null }
    ];
    const kpiRow = kpis.map(k => `
      <div class="rp-kpi">
        <div class="rp-kpi-lbl">${k.lbl}</div>
        <div class="rp-kpi-row"><div class="rp-kpi-val">${k.val}</div>${k.tag ? `<span class="rp-kpi-tag ${k.up ? 'up' : 'down'}">${k.tag}</span>` : ''}</div>
      </div>`).join('');

    // Barre empilée des coûts (carte noire)
    const ct = d.coutTotal || 1;
    const stack = d.couts.map(c => `<span style="width:${(c.val / ct * 100).toFixed(1)}%;background:${c.color};" title="${c.label} : ${this._fmt(c.val)}"></span>`).join('');
    const coutLegend = d.couts.map(c => `<span class="rp-cl"><span class="rp-sw" style="background:${c.color};"></span>${c.label} · <b>${this._fmt(c.val)}</b></span>`).join('');

    const best = d.drivers[0];
    const tri = (u) => `<span class="rp-tri ${u ? 'up' : 'down'}"></span>`;
    const band = `<div class="rp-band"><span class="rp-band-bar"></span>${kpis.map(k => `<div class="rp-band-item"><div class="rp-band-lbl">${k.lbl}</div><div class="rp-band-val">${k.val}${k.tag ? tri(k.up) : ''}</div></div>`).join('')}</div>`;

    return `
      ${this._styles()}
      <div class="page-header rp-header">
        <div class="rp-hgroup"><div class="rp-heyebrow">Suivi financier</div><h1><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Rapports</h1></div>
      </div>

      ${band}

      <div class="rp-grid">
        <div class="rp-main">
          <div class="rp-main-head">
            <div>
              <div class="rp-eyebrow">CA encaissé · 6 derniers mois</div>
              <div class="rp-main-title">Chiffre d'affaires mensuel</div>
            </div>
            <div class="rp-main-total">
              <div class="rp-main-amount">${this._fmt(cur.encaisse)}</div>
              <span class="rp-trend ${up ? 'up' : 'down'}">${tri(up)}${this._pct(trend)} vs mois préc.</span>
            </div>
          </div>
          ${this._pillBars(m)}
        </div>

        <div class="rp-side">
          <div class="rp-goal">
            <div>
              <div class="rp-goal-eyebrow">Coûts de la flotte</div>
              <div class="rp-goal-amount">${this._fmt(d.coutTotal)}</div>
              <div class="rp-goal-sub">coût total annuel estimé</div>
            </div>
            <div class="rp-goal-bottom">
              <div class="rp-stack">${stack}</div>
              <div class="rp-legend">${coutLegend}</div>
            </div>
          </div>
          <div class="rp-info">
            <div class="rp-info-head">
              <div class="rp-info-icon"><iconify-icon icon="solar:users-group-rounded-bold"></iconify-icon></div>
              <h4>Activité</h4>
            </div>
            <p><b>${d.nbChauffeurs}</b> chauffeur${d.nbChauffeurs > 1 ? 's' : ''} actif${d.nbChauffeurs > 1 ? 's' : ''} · <b>${d.nbVehicules}</b> véhicule${d.nbVehicules > 1 ? 's' : ''}.${best ? ` Meilleur chauffeur&nbsp;: <b>${Utils.escHtml(best.nom)}</b> (${this._fmt(best.ca)}).` : ''}</p>
          </div>
        </div>
      </div>

      <div class="rp-table-card">
        <div class="rp-table-head"><h3>Performance des chauffeurs</h3><span class="rp-table-sub">CA encaissé cumulé · top ${d.drivers.length}</span></div>
        ${this._table(d.drivers)}
      </div>
    `;
  },

  _table(drivers) {
    if (!drivers.length) return `<div class="rp-empty">Aucun versement enregistré.</div>`;
    const max = Math.max(1, ...drivers.map(d => d.ca));
    const rows = drivers.map((d, i) => `<tr>
      <td class="rp-rank">${i + 1}</td>
      <td><span class="rp-name">${Utils.escHtml(d.nom)}</span></td>
      <td class="rp-barcell"><span class="rp-bar" style="width:${(d.ca / max * 100).toFixed(1)}%;"></span></td>
      <td class="rp-td-num rp-td-strong">${this._fmt(d.ca)}</td>
    </tr>`).join('');
    return `<div class="rp-table-wrap"><table class="rp-table"><tbody>${rows}</tbody></table></div>`;
  },

  // Barres en pilules arrondies (style Boostboard) — CA encaissé par mois,
  // le mois courant (dernier) mis en avant, les autres estompés.
  _pillBars(months) {
    const max = Math.max(1, ...months.map(m => m.encaisse || 0));
    const last = months.length - 1;
    const cols = months.map((m, i) => {
      const on = i === last;
      const h = (m.encaisse || 0) > 0 ? (m.encaisse / max * 100) : 2;
      return `<div class="rp-bcol${on ? ' on' : ''}" title="${Utils.escHtml(m.label)} : ${this._fmt(m.encaisse || 0)}">
          <div class="rp-btip">${this._fmt(m.encaisse || 0)}</div>
          <div class="rp-bstack" style="height:${Math.max(3, h).toFixed(1)}%;background:${this._acc};"></div>
          <div class="rp-blbl">${Utils.escHtml(m.label || '')}</div>
        </div>`;
    }).join('');
    return `<div class="rp-bars">${cols}</div>`;
  },

  _styles() {
    return `<style>
      .rp-hgroup { display:flex; flex-direction:column; gap:2px; }
      .rp-heyebrow { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.14em; color:var(--text-muted); }
      /* Bande KPI façon Boostboard */
      .rp-band { position:relative; display:grid; grid-template-columns:repeat(4,1fr); gap:20px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:26px; padding:26px 30px 26px 40px; margin-bottom:18px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
      @media (max-width:860px){ .rp-band{ grid-template-columns:repeat(2,1fr); row-gap:22px; } }
      .rp-band-bar { position:absolute; left:18px; top:24px; bottom:24px; width:5px; border-radius:99px; background:var(--pilote-blue); }
      .rp-band-item { min-width:0; }
      .rp-band-lbl { font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:4px; white-space:nowrap; }
      .rp-band-val { display:flex; align-items:center; font-size:clamp(22px,2.5vw,36px); font-weight:800; color:var(--text-primary); letter-spacing:-1.4px; line-height:1; white-space:nowrap; }
      .rp-tri { display:inline-block; width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; margin-left:8px; }
      .rp-tri.up { border-bottom:8px solid #13DEB9; }
      .rp-tri.down { border-top:8px solid #EF4444; }
      /* Barres pilules */
      .rp-bars { display:flex; align-items:flex-end; gap:12px; height:250px; padding-top:24px; margin-top:8px; }
      .rp-bcol { position:relative; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
      .rp-bstack { width:100%; max-width:52px; border-radius:99px; transition:filter .2s, transform .2s cubic-bezier(.34,1.56,.64,1); filter:saturate(.6) opacity(.5); }
      .rp-bcol:hover .rp-bstack { filter:none; }
      .rp-bcol.on .rp-bstack { filter:none; transform:scaleY(1.02); box-shadow:0 8px 18px -8px rgba(245,81,46,.5); }
      .rp-blbl { margin-top:10px; font-size:12px; font-weight:600; color:var(--text-muted); }
      .rp-bcol.on .rp-blbl { color:var(--text-primary); font-weight:800; }
      .rp-btip { position:absolute; top:-4px; opacity:0; background:var(--text-primary); color:var(--bg-secondary); font-size:11px; font-weight:700; padding:3px 8px; border-radius:7px; white-space:nowrap; pointer-events:none; transition:opacity .15s; z-index:3; }
      .rp-bcol:hover .rp-btip, .rp-bcol.on .rp-btip { opacity:1; }
      .rp-grid { display:grid; grid-template-columns:2fr 1fr; gap:18px; margin-bottom:18px; }
      @media (max-width:900px){ .rp-grid{ grid-template-columns:1fr; } }
      .rp-main { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:22px; padding:22px 24px; }
      .rp-main-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
      .rp-eyebrow { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.18em; color:var(--text-muted); }
      .rp-main-title { font-size:18px; font-weight:800; color:var(--text-primary); margin-top:4px; }
      .rp-main-total { text-align:right; }
      .rp-main-amount { font-size:24px; font-weight:900; color:var(--text-primary); letter-spacing:-.02em; white-space:nowrap; }
      .rp-trend { display:inline-flex; align-items:center; gap:3px; font-size:12px; font-weight:800; padding:2px 8px; border-radius:20px; margin-top:4px; white-space:nowrap; }
      .rp-trend.up { color:#0a9d78; background:rgba(19,222,185,.15); }
      .rp-trend.down { color:#e0603a; background:rgba(250,137,107,.15); }
      .rp-chart { width:100%; height:250px; display:block; margin-top:8px; overflow:visible; }
      .rp-xlbl { fill:var(--text-muted); font-size:11px; font-weight:600; }
      .rp-side { display:flex; flex-direction:column; gap:14px; }
      .rp-goal { background:#18181b; color:#fff; border-radius:22px; padding:22px; display:flex; flex-direction:column; justify-content:space-between; gap:18px; min-height:170px; }
      .rp-goal-eyebrow { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.2em; color:#8b8b96; }
      .rp-goal-amount { font-size:26px; font-weight:900; letter-spacing:-.02em; margin-top:6px; }
      .rp-goal-sub { font-size:12px; color:#a1a1aa; margin-top:2px; }
      .rp-stack { display:flex; width:100%; height:10px; border-radius:99px; overflow:hidden; background:rgba(255,255,255,.1); }
      .rp-stack span { height:100%; }
      .rp-legend { display:flex; flex-direction:column; gap:5px; margin-top:12px; }
      .rp-cl { font-size:11.5px; color:#d4d4d8; display:inline-flex; align-items:center; gap:6px; }
      .rp-cl b { color:#fff; font-weight:700; }
      .rp-sw { width:9px; height:9px; border-radius:3px; flex-shrink:0; }
      .rp-info { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:22px; padding:20px; }
      .rp-info-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
      .rp-info-icon { width:32px; height:32px; border-radius:10px; background:rgba(245,81,46,.14); color:#F5512E; display:flex; align-items:center; justify-content:center; font-size:18px; }
      .rp-info h4 { margin:0; font-size:15px; font-weight:800; color:var(--text-primary); }
      .rp-info p { margin:0; font-size:13px; line-height:1.55; color:var(--text-secondary); }
      .rp-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:18px; }
      @media (max-width:760px){ .rp-kpis{ grid-template-columns:repeat(2,1fr); } }
      .rp-kpi { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:16px; padding:16px 18px; }
      .rp-kpi-lbl { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--text-muted); margin-bottom:8px; }
      .rp-kpi-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
      .rp-kpi-val { font-size:19px; font-weight:900; color:var(--text-primary); letter-spacing:-.02em; white-space:nowrap; }
      .rp-kpi-tag { font-size:11px; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap; }
      .rp-kpi-tag.up { color:#0a9d78; background:rgba(19,222,185,.14); }
      .rp-kpi-tag.down { color:#e0603a; background:rgba(250,137,107,.14); }
      .rp-table-card { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:22px; padding:20px 24px; }
      .rp-table-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
      .rp-table-head h3 { margin:0; font-size:16px; font-weight:800; color:var(--text-primary); }
      .rp-table-sub { font-size:12px; color:var(--text-muted); font-weight:600; }
      .rp-table-wrap { overflow-x:auto; }
      .rp-table { width:100%; border-collapse:collapse; font-size:13px; }
      .rp-table td { padding:10px 10px; border-bottom:1px solid var(--border-color); color:var(--text-primary); vertical-align:middle; }
      .rp-table tbody tr:last-child td { border-bottom:none; }
      .rp-rank { width:26px; color:var(--text-muted); font-weight:800; }
      .rp-name { font-weight:700; }
      .rp-barcell { width:45%; }
      .rp-bar { display:block; height:8px; border-radius:99px; background:linear-gradient(90deg,#F5512E,#8AA8FF); min-width:4px; }
      .rp-td-num { text-align:right; }
      .rp-td-strong { font-weight:800; white-space:nowrap; }
      .rp-empty { padding:26px 4px; text-align:center; color:var(--text-muted); font-size:13px; }
    </style>`;
  }
};
