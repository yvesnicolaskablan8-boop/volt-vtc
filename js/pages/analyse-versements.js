/**
 * AnalyseVersementsPage — Analyse des versements (recette encaissée)
 * Ouverte depuis le widget « Recette encaissée » du tableau de bord (clic sur
 * une barre) ou directement via #/analyse-versements. Style « Boostboard » :
 * grande bande KPI à gros chiffres, barres en pilules empilées, bulles de
 * répartition, table des versements de la période. Montants en entier (FCFA).
 */
const AnalyseVersementsPage = {
  _ctx: null,       // contexte passé par le dashboard : { gran, index }
  _gran: 'semaine', // jour | semaine | mois
  _sel: 7,          // index de la période mise en avant (0..7)
  _anchor: null,    // jour de fin des 8 périodes (null = aujourd'hui) — sélecteur calendrier
  _series: [],
  _ENC: '#F5512E',  // encaissé (orange brand)
  _REST: '#FFC93C', // reste à recouvrer (jaune)
  _IND: '#635BFF',  // accent indigo

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

  _periodsBounds(gran) {
    const now = this._anchor ? new Date(this._anchor + 'T12:00:00') : new Date();
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
  _tri(up) { return `<span class="av-tri ${up ? 'up' : 'down'}"></span>`; },

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

    // Grande bande KPI façon Boostboard : barre d'accent + gros chiffres noirs.
    const band = `
      <div class="av-band">
        <span class="av-band-bar"></span>
        <div class="av-band-item">
          <div class="av-band-lbl">Recette encaissée</div>
          <div class="av-band-val">${this._fmt(cur.encaisse)}${this._tri(trendUp)}</div>
        </div>
        <div class="av-band-item">
          <div class="av-band-lbl">Versements reçus</div>
          <div class="av-band-val">${Utils.formatNumber(cur.nb)}</div>
        </div>
        <div class="av-band-item">
          <div class="av-band-lbl">Versement moyen</div>
          <div class="av-band-val">${this._fmt(ticket)}</div>
        </div>
        <div class="av-band-item">
          <div class="av-band-lbl">Reste à recouvrer</div>
          <div class="av-band-val">${this._fmt(cur.manquant)}${cur.manquant > 0 ? this._tri(false) : '<span class="av-solde">soldé</span>'}</div>
        </div>
      </div>`;

    return `
      ${this._styles()}
      <div class="page-header av-header">
        <div class="av-hgroup">
          <div class="av-heyebrow">Suivi financier</div>
          <h1><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Analyse des versements</h1>
        </div>
        <div class="page-actions">
          <label class="av-datepick" title="Choisir un jour précis">
            <iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon>
            <input type="date" value="${this._anchor || ''}" max="${new Date().toISOString().split('T')[0]}" onchange="AnalyseVersementsPage._setDate(this.value)">
          </label>
          <div class="av-gran">${gBtn('jour', 'Jour')}${gBtn('semaine', 'Semaine')}${gBtn('mois', 'Mois')}</div>
          <button class="av-back" onclick="Router.navigate('/dashboard')"><iconify-icon icon="solar:arrow-left-linear"></iconify-icon> Tableau de bord</button>
        </div>
      </div>

      ${band}

      <div class="av-grid">
        <div class="av-main">
          <div class="av-main-head">
            <div>
              <div class="av-eyebrow">Recette encaissée · 8 ${this._gran === 'jour' ? 'jours' : this._gran === 'mois' ? 'mois' : 'semaines'}</div>
              <div class="av-main-title">Évolution par ${granLbl}</div>
            </div>
            <div class="av-main-total">
              <div class="av-main-amount">${this._fmt(totalEncaisse)}</div>
              <span class="av-trend ${trendUp ? 'up' : 'down'}">${this._tri(trendUp)}${this._pct(trend)}</span>
            </div>
          </div>
          ${this._pillBars(s, this._sel)}
          <div class="av-legend">
            <span class="av-lg"><span class="av-ldot" style="background:${this._ENC}"></span>Encaissé</span>
            <span class="av-lg"><span class="av-ldot" style="background:${this._REST}"></span>Reste à recouvrer</span>
          </div>
        </div>

        <div class="av-side">
          <div class="av-goal">
            <div>
              <div class="av-goal-eyebrow">Taux de recouvrement</div>
              <div class="av-goal-title">Encaissé / attendu</div>
            </div>
            <div class="av-goal-bottom">
              <div class="av-goal-line"><span class="av-goal-pct">${recouvr}%</span><span class="av-goal-target">Attendu&nbsp;: ${this._fmt(cur.attendu)}</span></div>
              <div class="av-goal-bar"><div class="av-goal-fill" style="width:${recouvr}%"></div></div>
            </div>
          </div>
          ${this._bubbleChart(cur)}
        </div>
      </div>

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

  // Barres en pilules empilées : encaissé (orange) + reste à recouvrer (jaune).
  _pillBars(series, sel) {
    const max = Math.max(1, ...series.map(s => (s.encaisse || 0) + (s.manquant || 0)));
    const cols = series.map((s, i) => {
      const total = (s.encaisse || 0) + (s.manquant || 0);
      const hPct = total > 0 ? (total / max * 100) : 2;
      const encPct = total > 0 ? (s.encaisse / total * 100) : 0;
      const on = i === sel;
      return `<div class="av-bcol${on ? ' on' : ''}" onclick="AnalyseVersementsPage._openPeriod(${i})">
          <div class="av-btip">${Utils.escHtml(this._fmt(s.encaisse))}</div>
          <div class="av-bstack" style="height:${Math.max(3, hPct).toFixed(1)}%;">
            ${s.manquant > 0 ? `<div class="av-bseg" style="flex:${(100 - encPct).toFixed(2)};background:${this._REST};"></div>` : ''}
            <div class="av-bseg" style="flex:${Math.max(0.01, encPct).toFixed(2)};background:${this._ENC};"></div>
          </div>
          <div class="av-blbl">${Utils.escHtml(s.label || '')}</div>
        </div>`;
    }).join('');
    return `<div class="av-bars">${cols}</div>`;
  },

  // Bulles de répartition des versements de la période par statut.
  _bubbleChart(cur) {
    const items = cur.items || [];
    const groups = [
      { key: 'valide', label: 'Validé', color: this._ENC },
      { key: 'partiel', label: 'Partiel', color: this._REST },
      { key: 'en_attente', label: 'En attente', color: this._IND },
    ];
    const counts = groups.map(g => ({ ...g, n: items.filter(v => v.statut === g.key).length }));
    const total = counts.reduce((s, c) => s + c.n, 0);
    const head = `<div class="av-info-head"><div class="av-info-icon"><iconify-icon icon="solar:pie-chart-2-bold"></iconify-icon></div><h4>Répartition</h4></div>`;
    if (total === 0) {
      return `<div class="av-info">${head}<div class="av-bub-empty">Aucun versement sur la période</div></div>`;
    }
    const maxN = Math.max(1, ...counts.map(c => c.n));
    const ranked = counts.filter(c => c.n > 0).sort((a, b) => b.n - a.n);
    const slots = [ { l: 4, t: 14 }, { l: 44, t: 4 }, { l: 40, t: 46 } ];
    const bubbles = ranked.map((c, i) => {
      const sz = 54 + Math.round((c.n / maxN) * 58); // 54..112 px
      const pos = slots[i] || { l: 10 + i * 20, t: 30 };
      return `<div class="av-bubble" style="width:${sz}px;height:${sz}px;left:${pos.l}%;top:${pos.t}%;background:${c.color};">${c.n}</div>`;
    }).join('');
    const legend = counts.map(c => {
      const pct = total > 0 ? Math.round(c.n / total * 100) : 0;
      return `<div class="av-blg-row"><span class="av-ldot" style="background:${c.color}"></span><span class="av-blg-lbl">${c.label}</span><span class="av-blg-val">${c.n} · ${pct}%</span></div>`;
    }).join('');
    return `<div class="av-info">${head}
      <div class="av-bubbles">${bubbles}</div>
      <div class="av-blg">${legend}</div>
    </div>`;
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
        ? ` <a href="https://fleet.yango.com/contractors/${encodeURIComponent(ch.yangoDriverId)}/details?park_id=${encodeURIComponent(parkId)}" target="_blank" rel="noopener" title="Ouvrir la page Yango (surveillance)" class="av-yango">YANGO</a>`
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

  _setGran(g) {
    if (!['jour', 'semaine', 'mois'].includes(g)) return;
    this._gran = g;
    this._anchor = null; // revenir aux 8 dernières périodes se terminant aujourd'hui
    this._series = this._buildSeries(g);
    this._sel = this._series.length - 1;
    this._paint();
  },
  // Sélection d'un jour précis via le calendrier : bascule en granularité « jour »,
  // ancre les 8 jours sur la date choisie et met ce jour en avant.
  _setDate(value) {
    if (!value) { this._anchor = null; }
    else { this._anchor = value; this._gran = 'jour'; }
    this._series = this._buildSeries(this._gran);
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
      .av-header { align-items:flex-end; }
      .av-hgroup { display:flex; flex-direction:column; gap:2px; }
      .av-heyebrow { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.14em; color:var(--text-muted); }
      .av-back { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:12px; font-weight:700; padding:8px 14px; border-radius:20px; cursor:pointer; }
      .av-back:hover { background:var(--bg-tertiary); }

      /* Bande KPI */
      .av-band { position:relative; display:grid; grid-template-columns:repeat(4,1fr); gap:20px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:26px; padding:26px 30px 26px 40px; margin-bottom:18px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
      @media (max-width:860px){ .av-band{ grid-template-columns:repeat(2,1fr); row-gap:22px; } }
      .av-band-bar { position:absolute; left:18px; top:24px; bottom:24px; width:5px; border-radius:99px; background:${this._ENC}; }
      .av-band-item { min-width:0; }
      .av-band-lbl { font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:4px; white-space:nowrap; }
      .av-band-val { display:flex; align-items:center; font-size:clamp(24px,2.6vw,38px); font-weight:800; color:var(--text-primary); letter-spacing:-1.4px; line-height:1; white-space:nowrap; }
      .av-solde { font-size:11px; font-weight:800; color:#0a9d78; background:rgba(19,222,185,.16); padding:3px 8px; border-radius:20px; margin-left:8px; letter-spacing:0; }
      .av-tri { display:inline-block; width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; margin-left:8px; }
      .av-tri.up { border-bottom:8px solid #13DEB9; }
      .av-tri.down { border-top:8px solid #EF4444; }

      .av-grid { display:grid; grid-template-columns:2fr 1fr; gap:18px; margin-bottom:18px; }
      @media (max-width:900px){ .av-grid{ grid-template-columns:1fr; } }
      .av-main { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:26px; padding:24px 26px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
      .av-main-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:14px; }
      .av-eyebrow { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.18em; color:var(--text-muted); }
      .av-main-title { font-size:19px; font-weight:800; color:var(--text-primary); margin-top:4px; letter-spacing:-.02em; }
      .av-main-total { text-align:right; }
      .av-main-amount { font-size:26px; font-weight:800; color:var(--text-primary); letter-spacing:-1px; white-space:nowrap; }
      .av-trend { display:inline-flex; align-items:center; gap:3px; font-size:12px; font-weight:800; padding:2px 9px; border-radius:20px; margin-top:6px; }
      .av-trend.up { color:#0a9d78; background:rgba(19,222,185,.15); }
      .av-trend.down { color:#e0603a; background:rgba(250,137,107,.15); }

      /* Barres pilules */
      .av-bars { display:flex; align-items:flex-end; gap:12px; height:230px; padding-top:24px; }
      .av-bcol { position:relative; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; cursor:pointer; }
      .av-bstack { width:100%; max-width:46px; display:flex; flex-direction:column; border-radius:99px; overflow:hidden; transition:transform .2s cubic-bezier(.34,1.56,.64,1), filter .2s; filter:saturate(.6) opacity(.55); }
      .av-bseg { width:100%; }
      .av-bcol:hover .av-bstack { filter:none; }
      .av-bcol.on .av-bstack { filter:none; transform:scaleY(1.02); box-shadow:0 8px 18px -8px rgba(245,81,46,.5); }
      .av-blbl { margin-top:10px; font-size:12px; font-weight:600; color:var(--text-muted); }
      .av-bcol.on .av-blbl { color:var(--text-primary); font-weight:800; }
      .av-btip { position:absolute; top:-22px; opacity:0; background:var(--text-primary); color:var(--bg-secondary); font-size:11px; font-weight:700; padding:3px 8px; border-radius:7px; white-space:nowrap; pointer-events:none; transition:opacity .15s; z-index:3; }
      .av-bcol:hover .av-btip, .av-bcol.on .av-btip { opacity:1; }
      .av-legend { display:flex; gap:18px; margin-top:16px; padding-top:14px; border-top:1px solid var(--border-color); }
      .av-lg { display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600; color:var(--text-secondary); }
      .av-ldot { width:10px; height:10px; border-radius:50%; display:inline-block; }

      .av-side { display:flex; flex-direction:column; gap:16px; }
      .av-goal { background:#18181b; color:#fff; border-radius:26px; padding:24px; display:flex; flex-direction:column; justify-content:space-between; min-height:150px; box-shadow:0 16px 34px -20px rgba(0,0,0,.5); }
      .av-goal-eyebrow { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.2em; color:#8b8b96; }
      .av-goal-title { font-size:18px; font-weight:800; margin-top:4px; }
      .av-goal-line { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; }
      .av-goal-pct { font-size:34px; font-weight:800; letter-spacing:-1px; }
      .av-goal-target { font-size:12px; color:#a1a1aa; margin-bottom:5px; }
      .av-goal-bar { width:100%; height:7px; background:rgba(255,255,255,.14); border-radius:99px; overflow:hidden; }
      .av-goal-fill { height:100%; background:${this._ENC}; border-radius:99px; transition:width .6s cubic-bezier(.25,1,.5,1); }

      .av-info { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:26px; padding:22px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
      .av-info-head { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
      .av-info-icon { width:34px; height:34px; border-radius:11px; background:rgba(245,81,46,.14); color:${this._ENC}; display:flex; align-items:center; justify-content:center; font-size:18px; }
      .av-info h4 { margin:0; font-size:15px; font-weight:800; color:var(--text-primary); }
      .av-bub-empty { padding:22px 4px; text-align:center; color:var(--text-muted); font-size:13px; }
      .av-bubbles { position:relative; height:150px; margin:2px 0 12px; }
      .av-bubble { position:absolute; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:17px; box-shadow:0 8px 18px -6px rgba(0,0,0,.28); }
      .av-blg { display:flex; flex-direction:column; gap:8px; }
      .av-blg-row { display:flex; align-items:center; gap:8px; font-size:12.5px; }
      .av-blg-lbl { font-weight:600; color:var(--text-secondary); }
      .av-blg-val { margin-left:auto; font-weight:800; color:var(--text-primary); }

      .av-datepick { display:inline-flex; align-items:center; gap:7px; padding:7px 13px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:20px; cursor:pointer; color:var(--text-primary); font-weight:700; font-size:12px; transition:border-color .15s, box-shadow .15s; }
      .av-datepick:hover { border-color:var(--pilote-blue); box-shadow:0 2px 10px -4px rgba(245,81,46,.4); }
      .av-datepick iconify-icon { color:var(--pilote-blue); font-size:16px; }
      .av-datepick input { border:none; background:transparent; color:var(--text-primary); font-weight:700; font-size:12px; font-family:inherit; outline:none; cursor:pointer; padding:0; }
      .av-gran { display:inline-flex; gap:4px; padding:4px; background:var(--bg-tertiary); border-radius:20px; border:1px solid var(--border-color); }
      .av-gran-btn { border:none; background:transparent; color:var(--text-secondary); font-size:12px; font-weight:700; padding:6px 14px; border-radius:16px; cursor:pointer; transition:color .15s, background .15s, box-shadow .15s; }
      .av-gran-btn:hover { color:var(--text-primary); }
      .av-gran-btn.is-active { background:var(--bg-secondary); color:var(--pilote-blue); box-shadow:0 2px 8px -2px rgba(30,32,34,.2); }

      .av-table-card { background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:26px; padding:22px 26px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
      .av-table-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
      .av-table-head h3 { margin:0; font-size:16px; font-weight:800; color:var(--text-primary); letter-spacing:-.02em; }
      .av-table-sub { font-size:12px; color:var(--text-muted); font-weight:600; }
      .av-table-wrap { overflow-x:auto; }
      .av-table { width:100%; border-collapse:collapse; font-size:13px; }
      .av-table th { text-align:left; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); padding:8px 10px; border-bottom:1px solid var(--border-color); }
      .av-table td { padding:12px 10px; border-bottom:1px solid var(--border-color); color:var(--text-primary); }
      .av-table tbody tr:last-child td { border-bottom:none; }
      .av-td-num { text-align:right; }
      .av-td-strong { font-weight:800; }
      .av-td-muted { color:var(--text-muted); }
      .av-name { font-weight:600; }
      .av-tel { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:6px; text-decoration:none; vertical-align:-5px; margin-left:3px; font-size:13px; background:rgba(19,222,185,.14); color:#0a9d78; }
      .av-yango { display:inline-flex; align-items:center; justify-content:center; padding:2px 7px; border-radius:6px; text-decoration:none; vertical-align:-4px; margin-left:4px; font-size:10px; font-weight:800; font-style:italic; letter-spacing:.02em; background:${this._ENC}; color:#fff; }
      .av-badge { display:inline-flex; align-items:center; font-size:11px; font-weight:800; padding:3px 9px; border-radius:20px; }
      .av-badge.up { color:#0a9d78; background:rgba(19,222,185,.14); }
      .av-badge.down { color:#e0603a; background:rgba(250,137,107,.14); }
      .av-badge.warn { color:#b45309; background:rgba(255,174,31,.16); }
      .av-badge.info { color:${this._ENC}; background:rgba(245,81,46,.14); }
      .av-badge.muted { color:var(--text-muted); background:var(--bg-tertiary); }
      .av-empty { padding:26px 4px; text-align:center; color:var(--text-muted); font-size:13px; }
    </style>`;
  }
};
