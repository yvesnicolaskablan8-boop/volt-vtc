/**
 * GanttTachesPage — Frise (Gantt) des tâches.
 * Une ligne par tâche, une barre = de la date de début (ou création) à
 * l'échéance, couleur par statut. Les tâches en retard (échéance passée, non
 * terminées) ressortent en rouge et dépassent la ligne « aujourd'hui ».
 * Données : taches (Store), lecture seule.
 */
const GanttTachesPage = {
  _start: null,
  _days: 14,
  _COLW: 84,
  _container: null,

  renderInto(el) {
    this._container = (typeof el === 'string') ? document.getElementById(el) : el;
    if (!this._start) this._start = this._defaultStart();
    this._paint();
  },

  render() {
    this._container = null;
    if (!this._start) this._start = this._defaultStart();
    this._paint();
  },
  destroy() {},

  _defaultStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 3); return d; },
  _dateStr(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; },
  _parse(s) { if (!s) return null; const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? null : d; },
  _dayDiff(a, b) { return Math.round((b - a) / 86400000); },

  _nav(n) { const d = new Date(this._start); d.setDate(d.getDate() + n); this._start = d; this._paint(); },
  _today() { this._start = this._defaultStart(); this._paint(); },
  _setDays(n) { this._days = n; this._paint(); },

  _statusMeta(statut, retard) {
    if (retard) return ['#FA896B', 'En retard'];
    switch (statut) {
      case 'terminee': return ['#13DEB9', 'Terminée'];
      case 'en_cours': return ['#5D87FF', 'En cours'];
      case 'a_faire': return ['#94a3b8', 'À faire'];
      default: return ['#94a3b8', statut || '—'];
    }
  },

  _assignee(t) {
    if (t.assigneANom) return t.assigneANom;
    try { if (typeof TachesPage !== 'undefined' && TachesPage._getUserName) return TachesPage._getUserName(t.assigneA) || 'Non assigné'; } catch (e) { }
    return 'Non assigné';
  },

  _paint() {
    const c = this._container || document.getElementById('page-content');
    if (!c) return;
    c.replaceChildren();
    c.insertAdjacentHTML('beforeend', this._template());
  },

  _template() {
    const COLW = this._COLW, N = this._days;
    const dows = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const start = new Date(this._start);
    const days = []; for (let i = 0; i < N; i++) { const d = new Date(start); d.setDate(d.getDate() + i); days.push(d); }
    const wEnd = new Date(start); wEnd.setDate(wEnd.getDate() + N - 1);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = this._dateStr(today);
    const isWE = d => d.getDay() === 0 || d.getDay() === 6;
    const todayIdx = days.findIndex(d => this._dateStr(d) === todayStr);

    // Tâches actives (hors annulées) chevauchant la fenêtre, triées par début.
    const rowsData = (Store.get('taches') || [])
      .filter(t => t.statut !== 'annulee')
      .map(t => {
        const deb = this._parse(t.dateDebut) || this._parse(t.dateCreation) || this._parse(t.dateEcheance);
        let fin = this._parse(t.dateEcheance) || deb;
        if (deb && fin && fin < deb) fin = deb;
        return { t, deb, fin };
      })
      .filter(r => r.deb && r.fin && r.deb <= wEnd && r.fin >= start)
      .sort((a, b) => a.deb - b.deb);

    const trackW = N * COLW;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const daysHead = days.map((d, i) => `<div class="gt-day ${isWE(d) ? 'we' : ''} ${i === todayIdx ? 'today' : ''}"><span class="gt-dow">${dows[d.getDay()]}</span><span class="gt-num">${d.getDate()}</span></div>`).join('');

    const rows = rowsData.length ? rowsData.map(({ t, deb, fin }) => {
      const retard = !!(this._parse(t.dateEcheance) && this._parse(t.dateEcheance) < today && t.statut !== 'terminee');
      const [col, lbl] = this._statusMeta(t.statut, retard);
      const startIdx = this._dayDiff(start, deb);
      const endIdxExcl = this._dayDiff(start, fin) + 1; // échéance incluse
      const l = clamp(startIdx, 0, N), r = clamp(endIdxExcl, 0, N);
      const left = l * COLW + 3, w = Math.max(COLW - 6, (r - l) * COLW - 6);
      const overflowL = startIdx < 0, overflowR = endIdxExcl > N;
      const bg = days.map(d => `<div class="gt-tcell ${isWE(d) ? 'we' : ''}"></div>`).join('');
      const titre = t.titre || 'Tâche';
      const bar = `<div class="gt-seg${retard ? ' late' : ''}" style="left:${left}px;width:${w}px;background:${col};${overflowL ? 'border-top-left-radius:0;border-bottom-left-radius:0;' : ''}${overflowR ? 'border-top-right-radius:0;border-bottom-right-radius:0;' : ''}" title="${Utils.escHtml(titre)} — ${lbl}" onclick="Router.navigate('/taches')">${retard ? '<iconify-icon icon=\'solar:danger-triangle-bold\' style=\'margin-right:5px\'></iconify-icon>' : ''}${Utils.escHtml(titre)}</div>`;
      const now = todayIdx >= 0 ? `<div class="gt-now" style="left:${todayIdx * COLW + COLW / 2}px"></div>` : '';
      const initiale = (this._assignee(t).charAt(0) || '?').toUpperCase();
      return `<div class="gt-row">
        <div class="gt-tcellname"><div class="gt-ava" style="background:${col};">${Utils.escHtml(initiale)}</div><div style="min-width:0;"><div class="gt-tt">${Utils.escHtml(titre)}</div><div class="gt-sub">${Utils.escHtml(this._assignee(t))}</div></div></div>
        <div class="gt-track" style="width:${trackW}px">${bg}${bar}${now}</div>
      </div>`;
    }).join('') : `<div class="gt-empty">Aucune tâche sur cette période.</div>`;

    const title = `${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${days[N - 1].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const dBtn = (n, l) => `<button type="button" class="gt-dbtn${N === n ? ' is-active' : ''}" onclick="GanttTachesPage._setDays(${n})">${l}</button>`;
    const legend = [['À faire', '#94a3b8'], ['En cours', '#5D87FF'], ['Terminée', '#13DEB9'], ['En retard', '#FA896B']];

    return `
      ${this._styles()}
      <div class="gt-toolbar">
        <div class="gt-days">${dBtn(7, '7 j')}${dBtn(14, '14 j')}${dBtn(30, '30 j')}</div>
        <button class="btn btn-sm btn-secondary" onclick="GanttTachesPage._today()">Aujourd'hui</button>
        <button class="btn btn-sm btn-secondary" onclick="GanttTachesPage._nav(-7)"><iconify-icon icon="solar:alt-arrow-left-linear"></iconify-icon></button>
        <button class="btn btn-sm btn-secondary" onclick="GanttTachesPage._nav(7)"><iconify-icon icon="solar:alt-arrow-right-linear"></iconify-icon></button>
      </div>

      <div class="gt-card">
        <div class="gt-titlebar">${Utils.escHtml(title)}</div>
        <div class="gt-scroll"><div class="gt-grid">
          <div class="gt-row gt-dhead"><div class="gt-corner">Tâche</div><div class="gt-days-row">${daysHead}</div></div>
          ${rows}
        </div></div>
        <div class="gt-legend">
          <b style="color:var(--text-primary);">Statut</b>
          ${legend.map(l => `<span class="gt-lg"><span class="gt-sw" style="background:${l[1]};"></span>${l[0]}</span>`).join('')}
          <span style="color:var(--text-muted);">· barre = début → échéance · clic → tâches</span>
        </div>
      </div>
    `;
  },

  _styles() {
    return `<style>
      .gt-toolbar { display:flex; justify-content:flex-end; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
      .gt-card { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:18px; overflow:hidden; }
      .gt-titlebar { padding:14px 20px; font-size:15px; font-weight:800; border-bottom:1px solid var(--border-color); }
      .gt-days { display:inline-flex; gap:3px; padding:3px; background:var(--bg-tertiary); border-radius:20px; margin-right:4px; }
      .gt-dbtn { border:none; background:transparent; color:var(--text-muted); font-size:12px; font-weight:700; padding:5px 11px; border-radius:20px; cursor:pointer; }
      .gt-dbtn.is-active { background:var(--bg-secondary); color:var(--text-primary); box-shadow:0 1px 3px rgba(0,0,0,.12); }
      .gt-scroll { overflow-x:auto; }
      .gt-grid { min-width:max-content; }
      .gt-row { display:flex; height:54px; border-bottom:1px solid var(--border-color); }
      .gt-row:last-child { border-bottom:none; }
      .gt-corner, .gt-tcellname { width:260px; min-width:260px; position:sticky; left:0; z-index:3; background:var(--bg-secondary); border-right:1px solid var(--border-color); display:flex; align-items:center; padding:0 16px; gap:10px; }
      .gt-corner { z-index:4; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--text-muted); }
      .gt-days-row { display:flex; }
      .gt-dhead { height:54px; }
      .gt-day { width:84px; min-width:84px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-right:1px solid var(--border-color); }
      .gt-day.we { background:var(--bg-tertiary); }
      .gt-dow { color:var(--text-muted); font-weight:600; font-size:11px; }
      .gt-num { font-weight:800; font-size:13px; }
      .gt-day.today .gt-num { background:var(--text-primary); color:var(--bg-secondary); border-radius:8px; padding:1px 7px; }
      .gt-track { position:relative; display:flex; }
      .gt-tcell { width:84px; min-width:84px; border-right:1px solid var(--border-color); }
      .gt-tcell.we { background:rgba(150,160,180,.06); }
      .gt-seg { position:absolute; top:10px; height:34px; border-radius:9px; display:flex; align-items:center; padding:0 10px; font-size:12px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.12); transition:filter .12s; }
      .gt-seg:hover { filter:brightness(1.06); }
      .gt-seg.late { box-shadow:0 0 0 2px rgba(250,137,107,.35); }
      .gt-now { position:absolute; top:0; bottom:0; width:2px; background:#EF4444; z-index:2; }
      .gt-now::before { content:''; position:absolute; top:-1px; left:-3px; width:8px; height:8px; border-radius:50%; background:#EF4444; }
      .gt-ava { width:30px; height:30px; border-radius:50%; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; flex-shrink:0; }
      .gt-tt { font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .gt-sub { font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .gt-legend { display:flex; gap:16px; flex-wrap:wrap; align-items:center; padding:12px 20px; border-top:1px solid var(--border-color); font-size:12px; color:var(--text-secondary); }
      .gt-lg { display:inline-flex; align-items:center; gap:6px; }
      .gt-sw { width:12px; height:12px; border-radius:4px; }
      .gt-empty { padding:40px; text-align:center; color:var(--text-muted); font-size:14px; }
    </style>`;
  }
};
