/**
 * OccupationVehiculesPage — Frise (Gantt) d'occupation des véhicules.
 * Une ligne par véhicule, une barre = le chauffeur qui le conduit, sur une
 * fenêtre de jours glissante. Fait ressortir les rotations/doublures, les
 * véhicules non affectés (manque à gagner) et les jours sans conducteur.
 * Données : planning + chauffeurs + vehicules (Store), lecture seule.
 */
const OccupationVehiculesPage = {
  _start: null,   // 1er jour de la fenêtre (00:00)
  _days: 14,      // largeur de la fenêtre en jours
  _COLW: 76,
  _container: null, // conteneur cible (null = #page-content en mode page)

  // Mode widget : rend la frise DANS un conteneur fourni (ex. onglet Planning).
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

  _defaultStart() {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 3);
    return d;
  },
  _dateStr(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; },

  // Véhicule d'un créneau : colonne vehiculeId, sinon voiture assignée au chauffeur.
  _vehIdOf(p, chById) {
    if (p.vehiculeId) return p.vehiculeId;
    const ch = chById.get(p.chauffeurId);
    return ch ? (ch.vehiculeAssigne || null) : null;
  },

  // Couleur stable par chauffeur (hash simple sur l'id).
  _chColor(id) {
    const pal = ['#5D87FF', '#13DEB9', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899', '#eab308', '#0a9d78', '#e0603a', '#635BFF'];
    let h = 0; const s = String(id || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return pal[h % pal.length];
  },

  _nav(deltaDays) { const d = new Date(this._start); d.setDate(d.getDate() + deltaDays); this._start = d; this._paint(); },
  _today() { this._start = this._defaultStart(); this._paint(); },
  _setDays(n) { this._days = n; this._paint(); },

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
    const todayStr = this._dateStr(new Date());
    const isWE = d => d.getDay() === 0 || d.getDay() === 6;
    const todayIdx = days.findIndex(d => this._dateStr(d) === todayStr);

    const chauffeurs = Store.get('chauffeurs') || [];
    const chById = new Map(chauffeurs.map(c => [c.id, c]));
    const vehicules = (Store.get('vehicules') || []).filter(v => v.statut !== 'inactif' && v.statut !== 'vendu');
    const planning = Store.get('planning') || [];

    // Index planning par jour+véhicule → chauffeur (1er créneau trouvé).
    const dayStrs = days.map(d => this._dateStr(d));
    const dayIdx = new Map(dayStrs.map((s, i) => [s, i]));
    const occ = new Map(); // vehId -> Array(N) de chauffeurId|null
    vehicules.forEach(v => occ.set(v.id, new Array(N).fill(null)));
    planning.forEach(p => {
      const di = dayIdx.get(String(p.date).slice(0, 10));
      if (di === undefined) return;
      const vid = this._vehIdOf(p, chById);
      if (!vid || !occ.has(vid)) return;
      const row = occ.get(vid);
      if (!row[di]) row[di] = p.chauffeurId; // 1er créneau du jour gagne
    });

    const trackW = N * COLW;

    // En-tête jours
    const daysHead = days.map((d, i) => `<div class="ov-day ${isWE(d) ? 'we' : ''} ${i === todayIdx ? 'today' : ''}"><span class="ov-dow">${dows[d.getDay()]}</span><span class="ov-num">${d.getDate()}</span></div>`).join('');

    // Lignes véhicules
    const rows = vehicules.length ? vehicules.map(v => {
      const arr = occ.get(v.id);
      // Fusion en segments (jours consécutifs même chauffeur ; null = trou).
      const segs = [];
      let i = 0;
      while (i < N) {
        const who = arr[i];
        let j = i + 1; while (j < N && arr[j] === who) j++;
        segs.push({ i, len: j - i, who });
        i = j;
      }
      const bg = days.map(d => `<div class="ov-tcell ${isWE(d) ? 'we' : ''}"></div>`).join('');
      const bars = segs.map(s => {
        const left = s.i * COLW + 3, w = s.len * COLW - 6;
        if (!s.who) return `<div class="ov-gap" style="left:${left}px;width:${w}px" title="Aucun conducteur programmé">non affecté</div>`;
        const ch = chById.get(s.who);
        const nom = ch ? `${ch.prenom || ''} ${ch.nom || ''}`.trim() : 'Chauffeur';
        const col = this._chColor(s.who);
        return `<div class="ov-seg" style="left:${left}px;width:${w}px;background:${col}" title="${Utils.escHtml(nom)}" onclick="Router.navigate('/chauffeurs/${Utils.escHtml(String(s.who))}')">${Utils.escHtml(nom)}</div>`;
      }).join('');
      const now = todayIdx >= 0 ? `<div class="ov-now" style="left:${todayIdx * COLW + COLW / 2}px"></div>` : '';
      const plaque = v.immatriculation || `${v.marque || ''} ${v.modele || ''}`.trim() || v.id;
      const sub = v.immatriculation ? `${v.marque || ''} ${v.modele || ''}`.trim() : '';
      return `<div class="ov-row">
        <div class="ov-vcell"><div class="ov-veh-ic"><iconify-icon icon="solar:wheel-bold"></iconify-icon></div><div style="min-width:0;"><div class="ov-plate">${Utils.escHtml(plaque)}</div><div class="ov-sub">${Utils.escHtml(sub)}</div></div></div>
        <div class="ov-track" style="width:${trackW}px">${bg}${bars}${now}</div>
      </div>`;
    }).join('') : `<div class="ov-empty">Aucun véhicule actif à afficher.</div>`;

    const title = `${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${days[N - 1].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const dBtn = (n, l) => `<button type="button" class="ov-dbtn${N === n ? ' is-active' : ''}" onclick="OccupationVehiculesPage._setDays(${n})">${l}</button>`;

    return `
      ${this._styles()}
      <div class="ov-toolbar">
        <div class="ov-days">${dBtn(7, '7 j')}${dBtn(14, '14 j')}${dBtn(30, '30 j')}</div>
        <button class="btn btn-sm btn-secondary" onclick="OccupationVehiculesPage._today()">Aujourd'hui</button>
        <button class="btn btn-sm btn-secondary" onclick="OccupationVehiculesPage._nav(-7)"><iconify-icon icon="solar:alt-arrow-left-linear"></iconify-icon></button>
        <button class="btn btn-sm btn-secondary" onclick="OccupationVehiculesPage._nav(7)"><iconify-icon icon="solar:alt-arrow-right-linear"></iconify-icon></button>
      </div>

      <div class="ov-card">
        <div class="ov-titlebar">${Utils.escHtml(title)}</div>
        <div class="ov-scroll"><div class="ov-grid">
          <div class="ov-row ov-dhead"><div class="ov-corner">Véhicule</div><div class="ov-days-row">${daysHead}</div></div>
          ${rows}
        </div></div>
        <div class="ov-legend">
          <b style="color:var(--text-primary);">Occupation</b>
          <span class="ov-lg"><span class="ov-sw" style="background:#5D87FF;"></span>Chauffeur affecté</span>
          <span class="ov-lg"><span class="ov-sw" style="background:#F5A99A;border:1.5px dashed #E0603A;background:rgba(250,137,107,.15);"></span>Non affecté</span>
          <span style="color:var(--text-muted);">· chaque barre = un chauffeur ; les changements = rotations / doublures · clic → fiche chauffeur</span>
        </div>
      </div>
    `;
  },

  _styles() {
    return `<style>
      .ov-toolbar { display:flex; justify-content:flex-end; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
      .ov-card { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:18px; overflow:hidden; }
      .ov-titlebar { padding:14px 20px; font-size:15px; font-weight:800; border-bottom:1px solid var(--border-color); }
      .ov-days { display:inline-flex; gap:3px; padding:3px; background:var(--bg-tertiary); border-radius:20px; margin-right:4px; }
      .ov-dbtn { border:none; background:transparent; color:var(--text-muted); font-size:12px; font-weight:700; padding:5px 11px; border-radius:20px; cursor:pointer; }
      .ov-dbtn.is-active { background:var(--bg-secondary); color:var(--text-primary); box-shadow:0 1px 3px rgba(0,0,0,.12); }
      .ov-scroll { overflow-x:auto; }
      .ov-grid { min-width:max-content; }
      .ov-row { display:flex; height:56px; border-bottom:1px solid var(--border-color); }
      .ov-row:last-child { border-bottom:none; }
      .ov-corner, .ov-vcell { width:236px; min-width:236px; position:sticky; left:0; z-index:3; background:var(--bg-secondary); border-right:1px solid var(--border-color); display:flex; align-items:center; padding:0 16px; gap:10px; }
      .ov-corner { z-index:4; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--text-muted); }
      .ov-days-row { display:flex; }
      .ov-dhead { height:56px; }
      .ov-day { width:76px; min-width:76px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-right:1px solid var(--border-color); }
      .ov-day.we { background:var(--bg-tertiary); }
      .ov-dow { color:var(--text-muted); font-weight:600; font-size:11px; }
      .ov-num { font-weight:800; font-size:13px; }
      .ov-day.today .ov-num { background:var(--text-primary); color:var(--bg-secondary); border-radius:8px; padding:1px 7px; }
      .ov-track { position:relative; display:flex; }
      .ov-tcell { width:76px; min-width:76px; border-right:1px solid var(--border-color); }
      .ov-tcell.we { background:rgba(150,160,180,.06); }
      .ov-seg { position:absolute; top:11px; height:34px; border-radius:9px; display:flex; align-items:center; padding:0 10px; font-size:12px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.12); transition:filter .12s; }
      .ov-seg:hover { filter:brightness(1.06); }
      .ov-gap { position:absolute; top:11px; height:34px; border-radius:9px; border:1.5px dashed #F5A99A; background:rgba(250,137,107,.07); display:flex; align-items:center; justify-content:center; color:#E0603A; font-size:10.5px; font-weight:700; }
      .ov-now { position:absolute; top:0; bottom:0; width:2px; background:#EF4444; z-index:2; }
      .ov-now::before { content:''; position:absolute; top:-1px; left:-3px; width:8px; height:8px; border-radius:50%; background:#EF4444; }
      .ov-veh-ic { width:30px; height:30px; border-radius:9px; background:var(--bg-tertiary); display:flex; align-items:center; justify-content:center; color:var(--text-secondary); flex-shrink:0; }
      .ov-plate { font-weight:800; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ov-sub { font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ov-legend { display:flex; gap:16px; flex-wrap:wrap; align-items:center; padding:12px 20px; border-top:1px solid var(--border-color); font-size:12px; color:var(--text-secondary); }
      .ov-lg { display:inline-flex; align-items:center; gap:6px; }
      .ov-sw { width:12px; height:12px; border-radius:4px; }
      .ov-empty { padding:40px; text-align:center; color:var(--text-muted); font-size:14px; }
    </style>`;
  }
};
