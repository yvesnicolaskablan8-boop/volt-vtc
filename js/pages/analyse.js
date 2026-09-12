/**
 * AnalysePage — « Analyse IA » de l'activité (remplace l'ancien simulateur).
 *
 * Les chiffres viennent de /api/analyse (calcul déterministe côté serveur sur les
 * tables fleet_*) ; l'IA n'intervient que pour interpréter (« Lancer l'analyse »)
 * et répondre aux questions du gestionnaire. Sans clé ANTHROPIC_API_KEY sur
 * Vercel, la page affiche quand même les indicateurs.
 */
const AnalysePage = {
  _periode: '30j',
  _donnees: null,      // dernier snapshot reçu (kpis, chauffeurs, série…)
  _analyses: {},       // texte de l'analyse IA par période
  _echanges: [],       // questions / réponses de la session
  _occupe: false,

  render() {
    const c = document.getElementById('page-content');
    c.replaceChildren();
    c.insertAdjacentHTML('beforeend', this._template());
    this._bind();
    this._chargerKpis();
  },

  // ---------- appels serveur ----------
  async _api(body) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session && session.access_token;
    if (!token) throw new Error('Non authentifié, veuillez vous reconnecter');
    const res = await fetch('/api/analyse', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
    return json;
  },

  async _chargerKpis() {
    this._setEtat('Calcul des indicateurs…');
    try {
      this._donnees = await this._api({ periode: this._periode, mode: 'kpis' });
      this._peindreKpis();
      this._peindreAnalyse();
      this._setEtat('');
    } catch (e) {
      this._setEtat(e.message || 'Chargement impossible', true);
    }
  },

  async _lancerAnalyse() {
    if (this._occupe) return;
    this._occupe = true;
    const btn = document.getElementById('an-lancer');
    if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Analyse en cours…'; }
    this._setEtat('L’IA lit les chiffres de la période…');
    try {
      const r = await this._api({ periode: this._periode, mode: 'analyse' });
      this._donnees = r;
      this._peindreKpis();
      if (r.analyse) { this._analyses[this._periode] = r.analyse; this._setEtat(''); }
      else this._setEtat(r.erreur || 'Analyse indisponible', true);
      this._peindreAnalyse();
    } catch (e) {
      this._setEtat(e.message || 'Analyse impossible', true);
    } finally {
      this._occupe = false;
      if (btn) { btn.disabled = false; btn.querySelector('span').textContent = this._analyses[this._periode] ? 'Relancer l’analyse' : 'Lancer l’analyse IA'; }
    }
  },

  async _poserQuestion() {
    const input = document.getElementById('an-question');
    const question = (input && input.value || '').trim();
    if (!question || this._occupe) return;
    this._occupe = true;
    this._echanges.push({ question, reponse: null });
    this._peindreEchanges();
    if (input) input.value = '';
    try {
      const r = await this._api({ periode: this._periode, mode: 'question', question });
      this._echanges[this._echanges.length - 1].reponse = r.reponse || r.erreur || 'Pas de réponse';
    } catch (e) {
      this._echanges[this._echanges.length - 1].reponse = e.message || 'Réponse impossible';
    } finally {
      this._occupe = false;
      this._peindreEchanges();
    }
  },

  // ---------- rendu ----------
  _template() {
    const p = this._periode;
    const pill = (k, l) => `<button type="button" class="an-pill${p === k ? ' is-on' : ''}" data-periode="${k}">${l}</button>`;
    return `
      <style>
        .an-wrap{max-width:1180px;margin:0 auto;}
        .an-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:18px;}
        .an-k{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0071e3;margin-bottom:6px;}
        .an-h1{font-size:32px;font-weight:800;letter-spacing:-.03em;line-height:1.05;margin:0;color:var(--text-primary);}
        .an-h1 em{font-style:normal;color:#0071e3;}
        .an-sub{color:var(--text-muted);font-size:14px;margin-top:8px;max-width:640px;}
        .an-pills{display:inline-flex;gap:6px;background:var(--bg-tertiary);padding:5px;border-radius:999px;}
        .an-pill{border:0;background:transparent;color:var(--text-secondary);font:inherit;font-weight:700;font-size:13px;padding:8px 14px;border-radius:999px;cursor:pointer;transition:.15s;}
        .an-pill.is-on{background:var(--bg-secondary);color:var(--text-primary);box-shadow:0 2px 8px rgba(0,0,0,.08);}
        .an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:18px 0;}
        .an-card{background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:20px;padding:16px 18px;}
        .an-card .l{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);}
        .an-card .v{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:6px;color:var(--text-primary);font-variant-numeric:tabular-nums;}
        .an-card .s{font-size:12px;color:var(--text-muted);margin-top:4px;}
        .an-card.navy{background:radial-gradient(circle at 85% 0%,rgba(0,113,227,.55),transparent 55%),#0b1220;border-color:rgba(255,255,255,.06);color:#fff;}
        .an-card.navy .l{color:rgba(255,255,255,.55);} .an-card.navy .v{color:#fff;} .an-card.navy .s{color:rgba(255,255,255,.65);}
        .an-card .v.ok{color:#0a9d78;} .an-card .v.ko{color:#dc2626;} .an-card .v.warn{color:#c96f00;}
        .an-two{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;align-items:start;}
        @media(max-width:900px){.an-two{grid-template-columns:1fr;}}
        .an-ia{background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:22px;padding:22px 24px;min-height:220px;}
        .an-ia-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
        .an-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 10px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#0071e3;background:rgba(0,113,227,.12);}
        .an-btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;background:#0071e3;color:#fff;font:inherit;font-weight:800;font-size:14px;padding:11px 18px;cursor:pointer;box-shadow:0 8px 20px -8px rgba(0,113,227,.8);transition:.15s;}
        .an-btn:hover{transform:translateY(-1px);} .an-btn:disabled{opacity:.6;cursor:default;transform:none;}
        .an-md h2{font-size:15px;font-weight:800;letter-spacing:-.01em;margin:18px 0 8px;color:var(--text-primary);padding-bottom:6px;border-bottom:1px solid var(--border-color);}
        .an-md h2:first-child{margin-top:0;}
        .an-md p{font-size:14px;line-height:1.6;color:var(--text-secondary);margin:6px 0;}
        .an-md ul{margin:6px 0 10px 18px;padding:0;} .an-md li{font-size:14px;line-height:1.6;color:var(--text-secondary);margin:4px 0;}
        .an-md strong{color:var(--text-primary);}
        .an-vide{color:var(--text-muted);font-size:14px;line-height:1.6;}
        .an-etat{font-size:13px;color:var(--text-muted);min-height:18px;margin-top:10px;} .an-etat.err{color:#dc2626;}
        .an-q{display:flex;gap:8px;margin-top:14px;}
        .an-q input{flex:1;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);border-radius:999px;padding:11px 16px;font:inherit;font-size:14px;outline:none;}
        .an-q input:focus{border-color:#0071e3;box-shadow:0 0 0 4px rgba(0,113,227,.12);}
        .an-ech{margin-top:12px;display:flex;flex-direction:column;gap:10px;}
        .an-ech .qq{align-self:flex-end;max-width:85%;background:#0071e3;color:#fff;border-radius:18px 18px 4px 18px;padding:10px 14px;font-size:14px;}
        .an-ech .rr{align-self:flex-start;max-width:92%;background:var(--bg-tertiary);border-radius:18px 18px 18px 4px;padding:10px 14px;}
        .an-tab{width:100%;border-collapse:collapse;font-size:13px;}
        .an-tab th{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);text-align:left;padding:8px 8px;border-bottom:1px solid var(--border-color);}
        .an-tab td{padding:9px 8px;border-bottom:1px solid var(--border-color);color:var(--text-primary);font-variant-numeric:tabular-nums;}
        .an-tab td.r,.an-tab th.r{text-align:right;}
        .an-taux{display:inline-block;min-width:44px;text-align:center;border-radius:999px;padding:2px 8px;font-weight:800;font-size:12px;}
        .an-taux.ok{background:rgba(48,209,88,.16);color:#1a9e3f;} .an-taux.mid{background:rgba(255,159,10,.18);color:#c96f00;} .an-taux.ko{background:rgba(239,68,68,.14);color:#dc2626;}
        .an-note{font-size:12px;color:var(--text-muted);margin-top:8px;}
      </style>
      <div class="an-wrap">
        <div class="an-head">
          <div>
            <div class="an-k">Pilote / Analyse IA</div>
            <h1 class="an-h1">Votre activité, <em>lue par l’IA.</em></h1>
            <div class="an-sub">Les chiffres sont calculés à partir de vos données réelles (CA Yango, versements, planning, véhicules). L’IA les interprète et répond à vos questions.</div>
          </div>
          <div class="an-pills">${pill('7j', '7 jours')}${pill('30j', '30 jours')}${pill('mois', 'Mois en cours')}</div>
        </div>
        <div id="an-kpis" class="an-grid"></div>
        <div class="an-two">
          <div class="an-ia">
            <div class="an-ia-top">
              <span class="an-badge"><iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon> Analyse IA</span>
              <button type="button" id="an-lancer" class="an-btn"><iconify-icon icon="solar:play-bold" style="font-size:16px"></iconify-icon><span>Lancer l’analyse IA</span></button>
            </div>
            <div id="an-texte" class="an-md"><div class="an-vide">Choisissez une période, puis lancez l’analyse : diagnostic, points d’attention, recommandations, données à vérifier.</div></div>
            <div id="an-etat" class="an-etat"></div>
            <div class="an-q">
              <input id="an-question" type="text" placeholder="Posez une question : « Qui n’a pas versé cette semaine ? », « Que rapporte une voiture par jour ? »…" autocomplete="off">
              <button type="button" id="an-envoyer" class="an-btn"><iconify-icon icon="solar:arrow-right-bold" style="font-size:16px"></iconify-icon></button>
            </div>
            <div id="an-echanges" class="an-ech"></div>
          </div>
          <div class="an-ia">
            <div class="an-ia-top"><span class="an-badge" style="color:#c96f00;background:rgba(255,159,10,.16)"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon> Par chauffeur</span></div>
            <div id="an-chauffeurs"><div class="an-vide">Chargement…</div></div>
            <div class="an-note">Taux = versé / CA net Yango sur la période. « Non versé » = jours planifiés sans versement, valorisés au CA net du jour.</div>
          </div>
        </div>
      </div>`;
  },

  _bind() {
    document.querySelectorAll('.an-pill').forEach(b => b.addEventListener('click', () => {
      this._periode = b.getAttribute('data-periode');
      document.querySelectorAll('.an-pill').forEach(x => x.classList.toggle('is-on', x === b));
      this._donnees = null;
      this._peindreAnalyse();
      this._chargerKpis();
    }));
    const lancer = document.getElementById('an-lancer');
    if (lancer) lancer.addEventListener('click', () => this._lancerAnalyse());
    const envoyer = document.getElementById('an-envoyer');
    if (envoyer) envoyer.addEventListener('click', () => this._poserQuestion());
    const q = document.getElementById('an-question');
    if (q) q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this._poserQuestion(); } });
  },

  _setEtat(texte, erreur = false) {
    const el = document.getElementById('an-etat');
    if (!el) return;
    el.textContent = texte;
    el.classList.toggle('err', !!erreur);
  },

  _f(v) { return Utils.formatCurrency(Math.round(Number(v) || 0)); },

  _peindreKpis() {
    const el = document.getElementById('an-kpis');
    const d = this._donnees; if (!el || !d) return;
    const k = d.kpis;
    const taux = k.tauxEncaissement;
    const tauxCls = taux == null ? '' : taux >= 90 ? 'ok' : taux >= 70 ? 'warn' : 'ko';
    const res = k.resultatSurEncaisse;
    const carte = (l, v, s, cls = '', navy = false) => `<div class="an-card${navy ? ' navy' : ''}"><div class="l">${l}</div><div class="v ${cls}">${v}</div><div class="s">${s}</div></div>`;
    el.replaceChildren();
    el.insertAdjacentHTML('beforeend', [
      carte('CA net Yango', this._f(k.caNet), `${d.periode.libelle} · ${k.joursChauffeur} jours-chauffeur · ${k.courses} courses`, '', true),
      carte('Encaissé', this._f(k.verse), taux == null ? 'aucun CA sur la période' : `${taux} % du CA net`, tauxCls),
      carte('Non versé estimé', this._f(k.nonVerseEstime), `${k.joursNonVerses} jour(s) planifié(s) sans versement`, k.nonVerseEstime > 0 ? 'ko' : 'ok'),
      carte('Résultat sur encaissé', this._f(res), `coûts estimés ${this._f(k.couts.total)} · si tout encaissé : ${this._f(k.resultatSiToutEncaisse)}`, res >= 0 ? 'ok' : 'ko'),
      carte('CA net par jour-chauffeur', this._f(k.caNetParJourChauffeur), `${k.chauffeursActifs} chauffeurs actifs (${k.salaries} salariés)`),
      carte('Utilisation des voitures', k.joursChauffeurParVoitureJour == null ? '—' : `${k.joursChauffeurParVoitureJour}`, `jours-chauffeur par voiture et par jour · ${k.vehiculesPlanifies} voiture(s) planifiée(s) sur ${k.vehiculesFlotte} · objectif 2`, k.joursChauffeurParVoitureJour >= 1.8 ? 'ok' : k.joursChauffeurParVoitureJour >= 1.2 ? 'warn' : 'ko'),
    ].join(''));
    this._peindreChauffeurs();
  },

  _peindreChauffeurs() {
    const el = document.getElementById('an-chauffeurs');
    const d = this._donnees; if (!el || !d) return;
    const rows = (d.chauffeurs || []).filter(c => c.joursCA > 0 || c.joursPlanifies > 0);
    el.replaceChildren();
    if (!rows.length) { el.insertAdjacentHTML('beforeend', '<div class="an-vide">Aucune activité sur la période.</div>'); return; }
    const esc = (s) => Utils.escHtml ? Utils.escHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tauxHtml = (t) => t == null ? '<span class="an-taux">—</span>' : `<span class="an-taux ${t >= 90 ? 'ok' : t >= 70 ? 'mid' : 'ko'}">${t} %</span>`;
    el.insertAdjacentHTML('beforeend', `<div style="overflow-x:auto"><table class="an-tab">
      <thead><tr><th>Chauffeur</th><th class="r">Jours</th><th class="r">CA net</th><th class="r">Versé</th><th class="r">Taux</th><th class="r">Non versé</th></tr></thead>
      <tbody>${rows.map(c => `<tr>
        <td><strong>${esc(c.nom)}</strong>${c.contraventionsImpayees ? `<div style="font-size:11px;color:#c96f00">${c.contraventionsImpayees} amende(s) impayée(s)</div>` : ''}</td>
        <td class="r">${c.joursCA}</td>
        <td class="r">${this._f(c.caNet)}</td>
        <td class="r">${this._f(c.verse)}</td>
        <td class="r">${tauxHtml(c.taux)}</td>
        <td class="r" style="${c.nonVerseEstime > 0 ? 'color:#dc2626;font-weight:700' : ''}">${c.nonVerseEstime > 0 ? this._f(c.nonVerseEstime) : '—'}</td>
      </tr>`).join('')}</tbody></table></div>`);
  },

  _peindreAnalyse() {
    const el = document.getElementById('an-texte');
    const btn = document.getElementById('an-lancer');
    if (!el) return;
    const texte = this._analyses[this._periode];
    el.replaceChildren();
    if (texte) {
      el.insertAdjacentHTML('beforeend', this._md(texte));
      if (btn) btn.querySelector('span').textContent = 'Relancer l’analyse';
    } else {
      const d = this._donnees;
      const nonConfigure = d && d.configure === false;
      el.insertAdjacentHTML('beforeend', `<div class="an-vide">${nonConfigure
        ? 'L’analyse IA n’est pas encore activée : ajoutez la variable <strong>ANTHROPIC_API_KEY</strong> dans les réglages Vercel du projet. Les indicateurs ci-dessus restent disponibles.'
        : 'Choisissez une période, puis lancez l’analyse : diagnostic, points d’attention, recommandations, données à vérifier.'}</div>`);
      if (btn) btn.querySelector('span').textContent = 'Lancer l’analyse IA';
    }
  },

  _peindreEchanges() {
    const el = document.getElementById('an-echanges');
    if (!el) return;
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    el.replaceChildren();
    el.insertAdjacentHTML('beforeend', this._echanges.map(e => `
      <div class="qq">${esc(e.question)}</div>
      <div class="rr an-md">${e.reponse ? this._md(e.reponse) : '<span class="an-vide">L’IA réfléchit…</span>'}</div>`).join(''));
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // Markdown minimal (titres ##, listes -, gras **, paragraphes), texte échappé d'abord.
  _md(texte) {
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const lignes = String(texte).split(/\r?\n/);
    let html = '', liste = false, para = [];
    const flush = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
    const fermerListe = () => { if (liste) { html += '</ul>'; liste = false; } };
    for (const l of lignes) {
      const t = l.trim();
      if (!t) { flush(); fermerListe(); continue; }
      const h = t.match(/^#{1,3}\s+(.*)$/);
      if (h) { flush(); fermerListe(); html += `<h2>${inline(h[1])}</h2>`; continue; }
      const li = t.match(/^[-*•]\s+(.*)$/) || t.match(/^\d+[.)]\s+(.*)$/);
      if (li) { flush(); if (!liste) { html += '<ul>'; liste = true; } html += `<li>${inline(li[1])}</li>`; continue; }
      fermerListe(); para.push(t);
    }
    flush(); fermerListe();
    return html;
  },
};
