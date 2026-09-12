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
  _tri: 'nonVerse',    // tri de la liste chauffeurs

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
    if (!res.ok) throw new Error(json.erreur || json.error || `Erreur ${res.status}`);
    return json;
  },

  async _chargerKpis() {
    this._setEtat('Calcul des indicateurs…');
    this._peindreSquelette('kpis');
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
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); btn.querySelector('span:last-child').textContent = 'Analyse en cours…'; }
    this._setEtat('');
    this._peindreSquelette('ia');
    try {
      const r = await this._api({ periode: this._periode, mode: 'analyse' });
      this._donnees = r;
      this._peindreKpis();
      if (r.analyse) { this._analyses[this._periode] = r.analyse; this._setEtat(''); }
      else this._setEtat(r.erreur || 'Analyse indisponible', true);
      this._peindreAnalyse();
    } catch (e) {
      this._peindreAnalyse();
      this._setEtat(e.message || 'Analyse impossible', true);
    } finally {
      this._occupe = false;
      if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); btn.querySelector('span:last-child').textContent = this._analyses[this._periode] ? 'Relancer l’analyse' : 'Lancer l’analyse IA'; }
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
        /* --- bandeau --- */
        .an-hero{position:relative;overflow:hidden;border-radius:28px;padding:34px 36px 30px;color:#fff;
          background:radial-gradient(900px 420px at 88% -20%,rgba(0,113,227,.55),transparent 60%),radial-gradient(600px 300px at 0% 120%,rgba(48,209,88,.22),transparent 60%),linear-gradient(135deg,#0b1220 0%,#0e1a33 100%);
          box-shadow:0 30px 60px -30px rgba(11,18,32,.6);isolation:isolate;}
        .an-hero::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:36px 36px;-webkit-mask-image:radial-gradient(60% 80% at 70% 30%,#000,transparent);mask-image:radial-gradient(60% 80% at 70% 30%,#000,transparent);pointer-events:none;}
        .an-orb{position:absolute;border-radius:50%;filter:blur(60px);opacity:.55;pointer-events:none;z-index:-1;animation:anOrb 14s ease-in-out infinite;}
        .an-orb.a{width:340px;height:340px;right:-80px;top:-140px;background:#0071e3;}
        .an-orb.b{width:260px;height:260px;left:38%;bottom:-160px;background:#5ac8fa;animation-delay:-6s;opacity:.3;}
        @keyframes anOrb{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-30px,24px,0) scale(1.12)}}
        .an-hero-in{position:relative;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:22px;}
        .an-k{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#8fd0ff;margin-bottom:12px;}
        .an-k .dot{width:7px;height:7px;border-radius:50%;background:#30d158;box-shadow:0 0 0 0 rgba(48,209,88,.6);animation:anPing 2s infinite;}
        @keyframes anPing{0%{box-shadow:0 0 0 0 rgba(48,209,88,.55)}70%{box-shadow:0 0 0 9px rgba(48,209,88,0)}100%{box-shadow:0 0 0 0 rgba(48,209,88,0)}}
        .an-h1{font-size:38px;font-weight:800;letter-spacing:-.035em;line-height:1.02;margin:0;color:#fff;}
        .an-h1 em{font-style:normal;background:linear-gradient(90deg,#5ac8fa,#8fd0ff 60%,#fff);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .an-sub{color:rgba(255,255,255,.62);font-size:14.5px;margin-top:12px;max-width:560px;line-height:1.55;}
        .an-ctl{display:flex;flex-direction:column;align-items:flex-end;gap:12px;}
        .an-pills{display:inline-flex;gap:4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(14px);padding:4px;border-radius:999px;}
        .an-pill{border:0;background:transparent;color:rgba(255,255,255,.7);font:inherit;font-weight:700;font-size:13px;padding:8px 15px;border-radius:999px;cursor:pointer;transition:.2s;}
        .an-pill:hover{color:#fff;}
        .an-pill.is-on{background:#fff;color:#0b1220;box-shadow:0 6px 16px -6px rgba(0,0,0,.5);}
        .an-cta{display:inline-flex;align-items:center;gap:10px;border:0;border-radius:999px;background:#fff;color:#0b1220;font:inherit;font-weight:800;font-size:15px;padding:13px 22px;cursor:pointer;box-shadow:0 14px 30px -12px rgba(255,255,255,.5);transition:.2s;position:relative;overflow:hidden;}
        .an-cta:hover{transform:translateY(-2px);box-shadow:0 20px 34px -12px rgba(255,255,255,.55);}
        .an-cta:disabled{opacity:.75;cursor:default;transform:none;}
        .an-cta .ic{width:26px;height:26px;border-radius:50%;background:#0071e3;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:14px;}
        .an-cta.is-busy .ic{animation:anSpin 1.1s linear infinite;}
        @keyframes anSpin{to{transform:rotate(360deg)}}
        .an-cta::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(0,113,227,.12) 50%,transparent 70%);transform:translateX(-120%);}
        .an-cta:hover::after{animation:anSheen .9s ease forwards;}
        @keyframes anSheen{to{transform:translateX(120%)}}
        .an-hero-foot{position:relative;display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.1);font-size:12.5px;color:rgba(255,255,255,.55);}
        .an-hero-foot:empty{display:none;}
        .an-hero-foot b{color:#fff;font-weight:700;}
        /* --- KPI --- */
        .an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:14px;margin:18px 0;}
        .an-card{position:relative;overflow:hidden;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:22px;padding:18px 18px 16px;transition:transform .25s,box-shadow .25s,border-color .25s;animation:anUp .55s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*70ms);}
        .an-card:hover{transform:translateY(-3px);box-shadow:0 18px 36px -22px rgba(0,0,0,.35);border-color:rgba(0,113,227,.35);}
        @keyframes anUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        .an-card .top{display:flex;align-items:center;justify-content:space-between;gap:8px;}
        .an-card .l{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.11em;color:var(--text-muted);}
        .an-card .ico{width:34px;height:34px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;color:#0071e3;background:rgba(0,113,227,.12);flex:none;}
        .an-card .ico.g{color:#1a9e3f;background:rgba(48,209,88,.14);} .an-card .ico.r{color:#dc2626;background:rgba(239,68,68,.12);} .an-card .ico.o{color:#c96f00;background:rgba(255,159,10,.16);} .an-card .ico.v{color:#7c3aed;background:rgba(124,58,237,.12);}
        .an-card .v{font-size:28px;font-weight:800;letter-spacing:-.03em;margin-top:12px;color:var(--text-primary);font-variant-numeric:tabular-nums;line-height:1.05;}
        .an-card .s{font-size:12.5px;color:var(--text-muted);margin-top:6px;line-height:1.45;}
        .an-card .v.ok{color:#0a9d78;} .an-card .v.ko{color:#dc2626;} .an-card .v.warn{color:#c96f00;}
        .an-card.navy{background:radial-gradient(circle at 90% -10%,rgba(0,113,227,.7),transparent 55%),#0b1220;border-color:rgba(255,255,255,.06);color:#fff;}
        .an-card.navy .l{color:rgba(255,255,255,.55);} .an-card.navy .v{color:#fff;} .an-card.navy .s{color:rgba(255,255,255,.62);position:relative;z-index:1;} .an-card.navy .ico{background:rgba(255,255,255,.12);color:#8fd0ff;}
        .an-spark{position:absolute;left:0;right:0;bottom:0;height:64px;pointer-events:none;}
        .an-spark path.a{fill:url(#anSparkFill);} .an-spark path.l{fill:none;stroke:#5ac8fa;stroke-width:2;stroke-linecap:round;stroke-dasharray:600;stroke-dashoffset:600;animation:anDraw 1.4s .3s ease-out forwards;}
        @keyframes anDraw{to{stroke-dashoffset:0}}
        .an-ring{position:absolute;right:16px;bottom:14px;width:58px;height:58px;}
        .an-ring circle{fill:none;stroke-width:6;stroke-linecap:round;}
        .an-ring .bg{stroke:var(--bg-tertiary);} .an-ring .fg{stroke:#0a9d78;transform:rotate(-90deg);transform-origin:50% 50%;stroke-dasharray:157;stroke-dashoffset:157;transition:stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1);}
        .an-ring .fg.warn{stroke:#c96f00;} .an-ring .fg.ko{stroke:#dc2626;}
        .an-ring text{font-size:12px;font-weight:800;fill:var(--text-primary);}
        .an-bar{height:8px;border-radius:999px;background:var(--bg-tertiary);overflow:visible;margin-top:12px;position:relative;}
        .an-bar i{position:absolute;inset:0 auto 0 0;width:0;border-radius:999px;background:linear-gradient(90deg,#0071e3,#5ac8fa);transition:width 1.1s cubic-bezier(.2,.7,.2,1);}
        .an-bar i.warn{background:linear-gradient(90deg,#ff9f0a,#ffd60a);} .an-bar i.ko{background:linear-gradient(90deg,#dc2626,#ff6b6b);} .an-bar i.ok{background:linear-gradient(90deg,#0a9d78,#30d158);}
        .an-bar b{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--text-muted);opacity:.6;}
        .an-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;border-radius:999px;padding:3px 9px;margin-top:10px;background:var(--bg-tertiary);color:var(--text-secondary);}
        .an-chip.ok{background:rgba(48,209,88,.14);color:#1a9e3f;} .an-chip.ko{background:rgba(239,68,68,.12);color:#dc2626;}
        /* --- colonnes --- */
        .an-two{display:grid;grid-template-columns:1.45fr 1fr;gap:16px;align-items:start;}
        @media(max-width:960px){.an-two{grid-template-columns:1fr;}}
        .an-panel{background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:24px;padding:22px 24px;min-height:240px;animation:anUp .6s .25s cubic-bezier(.2,.7,.2,1) both;}
        .an-panel-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
        .an-badge{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:6px 12px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#fff;background:linear-gradient(90deg,#0071e3,#5ac8fa);box-shadow:0 8px 18px -10px rgba(0,113,227,.9);}
        .an-badge.amber{background:linear-gradient(90deg,#ff9f0a,#ffb340);box-shadow:0 8px 18px -10px rgba(255,159,10,.9);}
        .an-model{font-size:11.5px;color:var(--text-muted);display:inline-flex;align-items:center;gap:6px;}
        .an-model i{width:6px;height:6px;border-radius:50%;background:#30d158;display:inline-block;}
        .an-btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;background:#0071e3;color:#fff;font:inherit;font-weight:800;font-size:13.5px;padding:10px 16px;cursor:pointer;box-shadow:0 8px 20px -8px rgba(0,113,227,.8);transition:.2s;}
        .an-btn:hover{transform:translateY(-1px);} .an-btn:disabled{opacity:.6;cursor:default;transform:none;}
        .an-btn.round{width:44px;height:44px;padding:0;justify-content:center;flex:none;}
        .an-ghost{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font:inherit;font-weight:700;font-size:12.5px;padding:7px 12px;border-radius:999px;cursor:pointer;transition:.2s;}
        .an-ghost:hover{border-color:#0071e3;color:#0071e3;background:rgba(0,113,227,.06);transform:translateY(-1px);}
        .an-ghost:disabled{opacity:.5;cursor:default;transform:none;}
        /* --- analyse en sections --- */
        .an-cap{font-size:12px;color:var(--text-muted);margin-bottom:12px;display:flex;align-items:center;gap:8px;}
        .an-cap iconify-icon{color:#0071e3;font-size:15px;}
        .an-sec{position:relative;border:1px solid var(--border-color);border-radius:18px;padding:14px 16px 12px 18px;margin:10px 0;background:var(--bg-primary);overflow:hidden;animation:anUp .5s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*90ms);transition:border-color .2s,transform .2s;}
        .an-sec:hover{border-color:var(--c,#0071e3);transform:translateX(2px);}
        .an-sec::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c,#0071e3);}
        .an-sec-h{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
        .an-sec-h .ic{width:28px;height:28px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-size:16px;color:var(--c,#0071e3);background:color-mix(in srgb,var(--c,#0071e3) 14%,transparent);}
        .an-sec-h h3{margin:0;font-size:14px;font-weight:800;letter-spacing:-.01em;color:var(--text-primary);}
        .an-sec p{font-size:14px;line-height:1.62;color:var(--text-secondary);margin:6px 0;}
        .an-sec ul{list-style:none;margin:4px 0 2px;padding:0;display:flex;flex-direction:column;gap:6px;}
        .an-sec li{position:relative;font-size:14px;line-height:1.55;color:var(--text-secondary);padding-left:22px;}
        .an-sec li::before{content:"";position:absolute;left:0;top:9px;width:12px;height:12px;border-radius:50%;background:color-mix(in srgb,var(--c,#0071e3) 18%,transparent);box-shadow:inset 0 0 0 3px var(--bg-primary),0 0 0 1px color-mix(in srgb,var(--c,#0071e3) 45%,transparent);}
        .an-sec strong{color:var(--text-primary);}
        .an-md p{font-size:14px;line-height:1.6;color:var(--text-secondary);margin:6px 0;} .an-md ul{margin:6px 0 10px 18px;padding:0;} .an-md li{font-size:14px;line-height:1.6;color:var(--text-secondary);margin:4px 0;} .an-md strong{color:var(--text-primary);} .an-md h2{font-size:14px;font-weight:800;margin:12px 0 6px;color:var(--text-primary);}
        .an-vide{color:var(--text-muted);font-size:14px;line-height:1.6;}
        .an-empty{display:flex;gap:14px;align-items:center;padding:18px 16px;border:1px dashed var(--border-color);border-radius:18px;}
        .an-empty .big{width:46px;height:46px;border-radius:14px;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:24px;color:#0071e3;background:rgba(0,113,227,.1);}
        .an-empty b{display:block;color:var(--text-primary);font-size:14px;margin-bottom:2px;}
        .an-etat{font-size:13px;color:var(--text-muted);min-height:18px;margin-top:10px;} .an-etat.err{color:#dc2626;font-weight:600;}
        /* squelette */
        .an-sk{display:flex;flex-direction:column;gap:10px;padding:4px 0;}
        .an-sk i{display:block;height:12px;border-radius:999px;background:linear-gradient(90deg,var(--bg-tertiary) 25%,var(--border-color) 50%,var(--bg-tertiary) 75%);background-size:200% 100%;animation:anShim 1.3s linear infinite;}
        .an-sk i.t{height:16px;width:46%;margin-bottom:4px;} .an-sk i.w{width:92%;} .an-sk i.m{width:74%;} .an-sk i.s{width:58%;}
        @keyframes anShim{to{background-position:-200% 0}}
        .an-think{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-secondary);margin-bottom:12px;}
        .an-think .dots i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#0071e3;margin-right:4px;animation:anDots 1.2s infinite;} .an-think .dots i:nth-child(2){animation-delay:.2s} .an-think .dots i:nth-child(3){animation-delay:.4s}
        @keyframes anDots{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}
        /* chat */
        .an-q{display:flex;gap:8px;margin-top:16px;align-items:center;}
        .an-q .box{flex:1;display:flex;align-items:center;gap:8px;border:1px solid var(--border-color);background:var(--bg-primary);border-radius:999px;padding:4px 6px 4px 14px;transition:.2s;}
        .an-q .box:focus-within{border-color:#0071e3;box-shadow:0 0 0 4px rgba(0,113,227,.12);}
        .an-q .box iconify-icon{color:var(--text-muted);font-size:17px;flex:none;}
        .an-q input{flex:1;border:0;background:transparent;color:var(--text-primary);padding:9px 4px;font:inherit;font-size:14px;outline:none;min-width:0;}
        .an-sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
        .an-sugg button{border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);font:inherit;font-size:12px;font-weight:600;border-radius:999px;padding:6px 11px;cursor:pointer;transition:.15s;}
        .an-sugg button:hover{border-color:#0071e3;color:#0071e3;background:rgba(0,113,227,.06);}
        .an-ech{margin-top:14px;display:flex;flex-direction:column;gap:10px;}
        .an-ech:empty{display:none;}
        .an-ech .qq{align-self:flex-end;max-width:85%;background:linear-gradient(135deg,#0b1220,#1b2a4a);color:#fff;border-radius:18px 18px 4px 18px;padding:10px 14px;font-size:14px;animation:anUp .3s both;}
        .an-ech .rrw{display:flex;gap:10px;align-items:flex-start;max-width:94%;animation:anUp .35s both;}
        .an-ech .av{width:28px;height:28px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0071e3,#5ac8fa);color:#fff;font-size:15px;margin-top:2px;}
        .an-ech .rr{background:var(--bg-primary);border:1px solid var(--border-color);border-radius:4px 18px 18px 18px;padding:10px 14px;min-width:0;}
        /* chauffeurs */
        .an-tri{display:inline-flex;gap:2px;background:var(--bg-tertiary);padding:3px;border-radius:999px;}
        .an-tri button{border:0;background:transparent;color:var(--text-muted);font:inherit;font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:999px;cursor:pointer;}
        .an-tri button.is-on{background:var(--bg-secondary);color:var(--text-primary);box-shadow:0 1px 4px rgba(0,0,0,.08);}
        .an-list{display:flex;flex-direction:column;gap:8px;}
        .an-row{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:11px 12px;border-radius:16px;border:1px solid transparent;background:var(--bg-primary);transition:.2s;animation:anUp .45s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*45ms);}
        .an-row:hover{border-color:rgba(0,113,227,.35);transform:translateX(2px);box-shadow:0 10px 24px -18px rgba(0,0,0,.4);}
        .an-av{width:38px;height:38px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#fff;letter-spacing:.02em;}
        .an-row .nm{font-weight:700;font-size:13.5px;color:var(--text-primary);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .an-row .mt{font-size:11.5px;color:var(--text-muted);margin-top:2px;}
        .an-row .mt em{font-style:normal;color:#c96f00;font-weight:700;}
        .an-row .pb{height:5px;border-radius:999px;background:var(--bg-tertiary);margin-top:7px;overflow:hidden;position:relative;}
        .an-row .pb i{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;transition:width 1s cubic-bezier(.2,.7,.2,1);}
        .an-row .pb i.ok{background:linear-gradient(90deg,#0a9d78,#30d158);} .an-row .pb i.mid{background:linear-gradient(90deg,#ff9f0a,#ffd60a);} .an-row .pb i.ko{background:linear-gradient(90deg,#dc2626,#ff6b6b);}
        .an-row .rt{text-align:right;font-variant-numeric:tabular-nums;}
        .an-row .rt .t{font-weight:800;font-size:15px;letter-spacing:-.01em;color:var(--text-primary);}
        .an-row .rt .t.ok{color:#1a9e3f;} .an-row .rt .t.mid{color:#c96f00;} .an-row .rt .t.ko{color:#dc2626;}
        .an-row .rt .u{font-size:11.5px;color:var(--text-muted);margin-top:2px;white-space:nowrap;}
        .an-row .rt .nv{display:inline-block;margin-top:5px;font-size:11.5px;font-weight:800;color:#dc2626;background:rgba(239,68,68,.1);border-radius:999px;padding:2px 8px;white-space:nowrap;}
        .an-note{font-size:12px;color:var(--text-muted);margin-top:12px;line-height:1.5;}
        @media(max-width:640px){.an-hero{padding:26px 22px 22px;border-radius:22px;} .an-h1{font-size:30px;} .an-ctl{align-items:stretch;width:100%;} .an-cta{justify-content:center;} .an-panel{padding:18px 16px;}}
        @media(prefers-reduced-motion:reduce){.an-card,.an-panel,.an-sec,.an-row,.an-ech .qq,.an-ech .rrw{animation:none;} .an-orb,.an-k .dot,.an-spark path.l{animation:none;} .an-spark path.l{stroke-dashoffset:0;} .an-ring .fg,.an-bar i,.an-row .pb i{transition:none;}}
      </style>
      <div class="an-wrap">
        <section class="an-hero">
          <span class="an-orb a"></span><span class="an-orb b"></span>
          <div class="an-hero-in">
            <div>
              <div class="an-k"><span class="dot"></span> Pilote · Analyse IA</div>
              <h1 class="an-h1">Votre activité,<br><em>lue par l’IA.</em></h1>
              <div class="an-sub">Les indicateurs sont calculés sur vos données réelles : CA Yango, versements, planning, véhicules. L’IA les interprète, signale les écarts et répond à vos questions.</div>
            </div>
            <div class="an-ctl">
              <div class="an-pills">${pill('7j', '7 jours')}${pill('30j', '30 jours')}${pill('mois', 'Mois en cours')}</div>
              <button type="button" id="an-lancer" class="an-cta"><span class="ic"><iconify-icon icon="solar:magic-stick-3-bold"></iconify-icon></span><span>Lancer l’analyse IA</span></button>
            </div>
          </div>
          <div id="an-hero-foot" class="an-hero-foot"></div>
        </section>

        <div id="an-kpis" class="an-grid"></div>

        <div class="an-two">
          <div class="an-panel">
            <div class="an-panel-top">
              <span class="an-badge"><iconify-icon icon="solar:magic-stick-3-bold"></iconify-icon> Analyse IA</span>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span id="an-model" class="an-model"></span>
                <button type="button" id="an-pdf" class="an-ghost" title="Exporter le rapport en PDF"><iconify-icon icon="solar:file-download-bold" style="font-size:16px"></iconify-icon><span>PDF</span></button>
              </div>
            </div>
            <div id="an-texte"></div>
            <div id="an-etat" class="an-etat"></div>
            <div class="an-q">
              <div class="box"><iconify-icon icon="solar:chat-round-dots-linear"></iconify-icon><input id="an-question" type="text" placeholder="Posez une question sur la période…" autocomplete="off"></div>
              <button type="button" id="an-envoyer" class="an-btn round" title="Envoyer"><iconify-icon icon="solar:arrow-up-bold" style="font-size:18px"></iconify-icon></button>
            </div>
            <div class="an-sugg">
              <button type="button" data-q="Qui n’a pas versé cette semaine ?">Qui n’a pas versé cette semaine ?</button>
              <button type="button" data-q="Que rapporte une voiture par jour ?">Que rapporte une voiture par jour ?</button>
              <button type="button" data-q="Quel chauffeur dois-je voir en priorité ?">Qui voir en priorité ?</button>
            </div>
            <div id="an-echanges" class="an-ech"></div>
          </div>
          <div class="an-panel">
            <div class="an-panel-top">
              <span class="an-badge amber"><iconify-icon icon="solar:users-group-rounded-bold"></iconify-icon> Par chauffeur</span>
              <div class="an-tri" id="an-tri">
                <button type="button" data-tri="nonVerse" class="is-on">Non versé</button>
                <button type="button" data-tri="taux">Taux</button>
                <button type="button" data-tri="caNet">CA net</button>
              </div>
            </div>
            <div id="an-chauffeurs"></div>
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
    document.querySelectorAll('.an-sugg button').forEach(b => b.addEventListener('click', () => {
      if (q) q.value = b.getAttribute('data-q');
      this._poserQuestion();
    }));
    const pdf = document.getElementById('an-pdf');
    if (pdf) pdf.addEventListener('click', () => this._exporterPDF());
    const tri = document.getElementById('an-tri');
    if (tri) tri.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      this._tri = b.getAttribute('data-tri');
      tri.querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
      this._peindreChauffeurs();
    }));
  },

  _setEtat(texte, erreur = false) {
    const el = document.getElementById('an-etat');
    if (!el) return;
    el.textContent = texte;
    el.classList.toggle('err', !!erreur);
  },

  _f(v) { return Utils.formatCurrency(Math.round(Number(v) || 0)); },
  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _reduit() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); },

  _peindreSquelette(quoi) {
    if (quoi === 'kpis') {
      const el = document.getElementById('an-kpis');
      if (el && !this._donnees) {
        el.replaceChildren();
        el.insertAdjacentHTML('beforeend', Array.from({ length: 6 }, (_, i) => `<div class="an-card" style="--i:${i}"><div class="an-sk"><i class="s"></i><i class="t"></i><i class="m"></i></div></div>`).join(''));
      }
    } else {
      const el = document.getElementById('an-texte');
      if (!el) return;
      el.replaceChildren();
      el.insertAdjacentHTML('beforeend', `
        <div class="an-think"><span class="dots"><i></i><i></i><i></i></span> L’IA lit les chiffres de la période et prépare son diagnostic…</div>
        <div class="an-sec" style="--c:#0071e3"><div class="an-sk"><i class="t"></i><i class="w"></i><i class="m"></i><i class="s"></i></div></div>
        <div class="an-sec" style="--c:#1a9e3f;--i:1"><div class="an-sk"><i class="t"></i><i class="w"></i><i class="m"></i></div></div>
        <div class="an-sec" style="--c:#c96f00;--i:2"><div class="an-sk"><i class="t"></i><i class="w"></i><i class="s"></i></div></div>`);
    }
  },

  // Compteur animé sur les montants (respecte prefers-reduced-motion).
  _compter(el, valeur, formatteur) {
    const fin = Math.round(Number(valeur) || 0);
    if (this._reduit() || Math.abs(fin) < 2) { el.textContent = formatteur(fin); return; }
    const t0 = performance.now(), duree = 900;
    const pas = (t) => {
      const k = Math.min(1, (t - t0) / duree), e = 1 - Math.pow(1 - k, 3);
      el.textContent = formatteur(Math.round(fin * e));
      if (k < 1) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  },

  _sparkline(serie) {
    const vals = (serie || []).map(s => Number(s.caNet) || 0);
    if (vals.length < 2) return '';
    const W = 300, H = 64, max = Math.max(...vals, 1);
    const pts = vals.map((v, i) => [i * (W / (vals.length - 1)), H - 6 - (v / max) * (H - 14)]);
    const ligne = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return `<svg class="an-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="anSparkFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5ac8fa" stop-opacity=".35"/><stop offset="1" stop-color="#5ac8fa" stop-opacity="0"/></linearGradient></defs>
      <path class="a" d="${ligne} L${W} ${H} L0 ${H} Z"/><path class="l" d="${ligne}"/></svg>`;
  },

  _peindreKpis() {
    const el = document.getElementById('an-kpis');
    const d = this._donnees; if (!el || !d) return;
    const k = d.kpis;
    const taux = k.tauxEncaissement;
    const tauxCls = taux == null ? '' : taux >= 90 ? 'ok' : taux >= 70 ? 'warn' : 'ko';
    const res = k.resultatSurEncaisse;
    const util = k.joursChauffeurParVoitureJour;
    const utilCls = util == null ? '' : util >= 1.8 ? 'ok' : util >= 1.2 ? 'warn' : 'ko';
    const carte = (i, o) => `<div class="an-card${o.navy ? ' navy' : ''}" style="--i:${i}">
        <div class="top"><div class="l">${o.l}</div><span class="ico ${o.ic || ''}"><iconify-icon icon="${o.icon}"></iconify-icon></span></div>
        <div class="v ${o.cls || ''}" data-n="${o.n == null ? '' : o.n}" data-fmt="${o.fmt || 'f'}">${o.v || ''}</div>
        <div class="s">${o.s}</div>${o.extra || ''}</div>`;
    el.replaceChildren();
    el.insertAdjacentHTML('beforeend', [
      carte(0, { navy: true, l: 'CA net Yango', icon: 'solar:graph-up-bold', n: k.caNet, s: `${d.periode.libelle} · ${k.joursChauffeur} jours-chauffeur · ${k.courses} courses`, extra: this._sparkline(d.serie) + '<div style="height:30px"></div>' }),
      carte(1, { l: 'Encaissé', icon: 'solar:wallet-money-bold', ic: 'g', n: k.verse, cls: tauxCls, s: taux == null ? 'aucun CA sur la période' : `${taux} % du CA net versé<br>par les chauffeurs`,
        extra: taux == null ? '' : `<svg class="an-ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="25"/><circle class="fg ${tauxCls}" cx="30" cy="30" r="25" data-taux="${Math.min(100, taux)}"/><text x="30" y="34" text-anchor="middle">${taux}%</text></svg>` }),
      carte(2, { l: 'Non versé estimé', icon: 'solar:danger-triangle-bold', ic: 'r', n: k.nonVerseEstime, cls: k.nonVerseEstime > 0 ? 'ko' : 'ok', s: `${k.joursNonVerses} jour(s) planifié(s) sans versement`,
        extra: `<span class="an-chip ${k.nonVerseEstime > 0 ? 'ko' : 'ok'}"><iconify-icon icon="${k.nonVerseEstime > 0 ? 'solar:clock-circle-bold' : 'solar:check-circle-bold'}"></iconify-icon> ${k.nonVerseEstime > 0 ? 'à récupérer' : 'tout est versé'}</span>` }),
      carte(3, { l: 'Résultat sur encaissé', icon: 'solar:chart-square-bold', ic: res >= 0 ? 'g' : 'r', n: res, cls: res >= 0 ? 'ok' : 'ko', s: `coûts estimés ${this._f(k.couts.total)}`,
        extra: `<span class="an-chip ${k.resultatSiToutEncaisse >= 0 ? 'ok' : 'ko'}"><iconify-icon icon="solar:target-bold"></iconify-icon> si tout encaissé : ${this._f(k.resultatSiToutEncaisse)}</span>` }),
      carte(4, { l: 'CA net par jour-chauffeur', icon: 'solar:user-id-bold', ic: 'v', n: k.caNetParJourChauffeur, s: `${k.chauffeursActifs} chauffeurs actifs (${k.salaries} salariés)` }),
      carte(5, { l: 'Utilisation des voitures', icon: 'solar:wheel-bold', ic: 'o', n: util, fmt: 'x', cls: utilCls, v: util == null ? '—' : '', s: `${k.vehiculesPlanifies} voiture(s) planifiée(s) sur ${k.vehiculesFlotte} · objectif 2 (double service)`,
        extra: util == null ? '' : `<div class="an-bar"><i class="${utilCls}" data-w="${Math.min(100, (util / 2) * 100)}"></i><b style="left:50%"></b></div>` }),
    ].join(''));

    // compteurs + jauges après insertion
    el.querySelectorAll('.v[data-n]').forEach(v => {
      const n = v.getAttribute('data-n'); if (n === '') return;
      if (v.getAttribute('data-fmt') === 'x') { v.textContent = Number(n).toFixed(2).replace('.', ','); return; }
      this._compter(v, Number(n), (x) => this._f(x));
    });
    requestAnimationFrame(() => {
      el.querySelectorAll('.an-ring .fg').forEach(c => { c.style.strokeDashoffset = String(157 - (157 * Number(c.getAttribute('data-taux'))) / 100); });
      el.querySelectorAll('.an-bar i[data-w]').forEach(b => { b.style.width = b.getAttribute('data-w') + '%'; });
    });

    const foot = document.getElementById('an-hero-foot');
    if (foot) {
      foot.replaceChildren();
      foot.insertAdjacentHTML('beforeend', `
        <span>Période <b>${this._esc(d.periode.du)} → ${this._esc(d.periode.au)}</b> · ${d.periode.jours} jours</span>
        <span>CA brut <b>${this._f(k.caBrut)}</b> · commission Yango <b>${this._f(k.commission)}</b></span>
        <span>Charges déclarées <b>${this._f(k.charges)}</b></span>
        ${k.contraventionsImpayees ? `<span>Amendes impayées <b style="color:#ffb340">${k.contraventionsImpayees} · ${this._f(k.contraventionsMontant)}</b></span>` : ''}
        ${k.derniereSynchroCA ? `<span>Dernière synchro Yango <b>${this._esc(String(k.derniereSynchroCA).slice(0, 16).replace('T', ' '))}</b></span>` : ''}`);
    }
    const model = document.getElementById('an-model');
    if (model) { model.replaceChildren(); model.insertAdjacentHTML('beforeend', d.configure === false ? 'IA non activée' : `<i></i> ${this._esc(d.modele || 'Claude')}`); }
    this._peindreChauffeurs();
  },

  _couleurAvatar(nom) {
    const pal = ['#0071e3', '#7c3aed', '#0a9d78', '#c96f00', '#dc2626', '#0e7490', '#be185d', '#4d7c0f'];
    let h = 0; for (const ch of String(nom)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return pal[h % pal.length];
  },

  _peindreChauffeurs() {
    const el = document.getElementById('an-chauffeurs');
    const d = this._donnees; if (!el || !d) return;
    let rows = (d.chauffeurs || []).filter(c => c.joursCA > 0 || c.joursPlanifies > 0);
    const tri = this._tri;
    rows = rows.slice().sort((a, b) => tri === 'taux' ? ((a.taux == null ? 999 : a.taux) - (b.taux == null ? 999 : b.taux)) : tri === 'caNet' ? (b.caNet - a.caNet) : ((b.nonVerseEstime - a.nonVerseEstime) || ((a.taux || 0) - (b.taux || 0))));
    el.replaceChildren();
    if (!rows.length) { el.insertAdjacentHTML('beforeend', '<div class="an-vide">Aucune activité sur la période.</div>'); return; }
    const cls = (t) => t == null ? '' : t >= 90 ? 'ok' : t >= 70 ? 'mid' : 'ko';
    const initiales = (nom) => String(nom).split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
    el.insertAdjacentHTML('beforeend', `<div class="an-list">${rows.map((c, i) => `
      <div class="an-row" style="--i:${i}">
        <span class="an-av" style="background:${this._couleurAvatar(c.nom)}">${this._esc(initiales(c.nom))}</span>
        <div style="min-width:0">
          <div class="nm">${this._esc(c.nom)}</div>
          <div class="mt">${c.joursCA} j · ${c.courses || 0} courses · CA net ${this._f(c.caNet)}${c.contraventionsImpayees ? ` · <em>${c.contraventionsImpayees} amende(s)</em>` : ''}</div>
          <div class="pb"><i class="${cls(c.taux)}" data-w="${c.taux == null ? 0 : Math.min(100, c.taux)}"></i></div>
        </div>
        <div class="rt">
          <div class="t ${cls(c.taux)}">${c.taux == null ? '—' : c.taux + ' %'}</div>
          <div class="u">versé ${this._f(c.verse)}</div>
          ${c.nonVerseEstime > 0 ? `<span class="nv">− ${this._f(c.nonVerseEstime)}</span>` : ''}
        </div>
      </div>`).join('')}</div>`);
    requestAnimationFrame(() => el.querySelectorAll('.pb i[data-w]').forEach(b => { b.style.width = b.getAttribute('data-w') + '%'; }));
  },

  _peindreAnalyse() {
    const el = document.getElementById('an-texte');
    const btn = document.getElementById('an-lancer');
    if (!el) return;
    const texte = this._analyses[this._periode];
    el.replaceChildren();
    if (texte) {
      el.insertAdjacentHTML('beforeend', this._sections(texte));
      if (btn) btn.querySelector('span:last-child').textContent = 'Relancer l’analyse';
    } else {
      const d = this._donnees;
      const nonConfigure = d && d.configure === false;
      el.insertAdjacentHTML('beforeend', `<div class="an-empty"><span class="big"><iconify-icon icon="${nonConfigure ? 'solar:key-bold' : 'solar:magic-stick-3-bold'}"></iconify-icon></span><div>${nonConfigure
        ? '<b>L’analyse IA n’est pas encore activée</b><span class="an-vide">Ajoutez la variable <strong>ANTHROPIC_API_KEY</strong> dans les réglages Vercel du projet. Les indicateurs restent disponibles.</span>'
        : '<b>Prêt à analyser la période</b><span class="an-vide">Diagnostic, ce qui va bien, points d’attention, recommandations et données à vérifier, en quelques secondes.</span>'}</div></div>`);
      if (btn) btn.querySelector('span:last-child').textContent = 'Lancer l’analyse IA';
    }
  },

  _peindreEchanges() {
    const el = document.getElementById('an-echanges');
    if (!el) return;
    el.replaceChildren();
    el.insertAdjacentHTML('beforeend', this._echanges.map(e => `
      <div class="qq">${this._esc(e.question)}</div>
      <div class="rrw"><span class="av"><iconify-icon icon="solar:magic-stick-3-bold"></iconify-icon></span><div class="rr an-md">${e.reponse ? this._md(e.reponse) : '<span class="an-think" style="margin:0"><span class="dots"><i></i><i></i><i></i></span> L’IA réfléchit…</span>'}</div></div>`).join(''));
    el.scrollIntoView({ behavior: this._reduit() ? 'auto' : 'smooth', block: 'nearest' });
  },

  // ---------- export PDF ----------
  // jsPDF n'embarque que des polices latines de base : on remplace les signes typographiques.
  _txt(s) {
    return String(s == null ? '' : s)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
      .replace(/→/g, '->').replace(/−/g, '-').replace(/[–—]/g, '-')
      .replace(/[   ]/g, ' ').replace(/…/g, '...').replace(/•/g, '-');
  },

  async _exporterPDF() {
    const d = this._donnees;
    if (!d) { Toast.warning('Les indicateurs ne sont pas encore chargés'); return; }
    const btn = document.getElementById('an-pdf');
    if (btn) btn.disabled = true;
    try {
      await LazyLibs.jspdf();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('portrait', 'mm', 'a4');
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      const M = 14, LW = W - 2 * M;
      const k = d.kpis, f = (v) => this._txt(this._f(v));
      const auj = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      let y = 0;

      const pagesEntete = new Set();
      const entete = () => {
        pagesEntete.add(doc.internal.getCurrentPageInfo().pageNumber);
        doc.setFillColor(11, 18, 32); doc.rect(0, 0, W, 30, 'F');
        doc.setFillColor(0, 113, 227); doc.circle(W - 22, 15, 9, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('PILOTE', M, 13);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(143, 208, 255);
        doc.text(this._txt(`Analyse IA de l'activité · ${d.periode.libelle} (${d.periode.du} -> ${d.periode.au})`), M, 20);
        doc.setTextColor(180, 190, 205); doc.setFontSize(8.5); doc.text(this._txt(`Généré le ${auj} · ${d.modele || ''}`), M, 26);
        y = 40;
      };
      const pied = () => {
        const n = doc.internal.getNumberOfPages();
        for (let i = 1; i <= n; i++) {
          doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150, 158, 170);
          doc.text(this._txt('Pilote · gestion.pilote.tech · document confidentiel'), M, H - 8);
          doc.text(`${i} / ${n}`, W - M, H - 8, { align: 'right' });
        }
      };
      const saut = (h) => { if (y + h > H - 16) { doc.addPage(); entete(); } };
      const titre = (t, rgb) => {
        saut(14);
        doc.setFillColor(...rgb); doc.roundedRect(M, y - 1, 3, 7, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(23, 24, 26);
        doc.text(this._txt(t), M + 6, y + 4.5); y += 11;
      };
      const para = (t, opt = {}) => {
        doc.setFont('helvetica', opt.gras ? 'bold' : 'normal'); doc.setFontSize(opt.taille || 9.5); doc.setTextColor(...(opt.rgb || [70, 75, 85]));
        const lignes = doc.splitTextToSize(this._txt(t), LW - (opt.retrait || 0));
        const h = lignes.length * (opt.interligne || 4.6);
        saut(h + 2);
        if (opt.puce) { doc.setFillColor(...(opt.puceRgb || [0, 113, 227])); doc.circle(M + 2.2, y - 1.2, 1.1, 'F'); }
        doc.text(lignes, M + (opt.retrait || 0), y); y += h + (opt.apres == null ? 2.5 : opt.apres);
      };

      entete();

      // --- indicateurs clés ---
      titre('Indicateurs clés', [0, 113, 227]);
      const cartes = [
        ['CA net Yango', f(k.caNet), `${k.joursChauffeur} jours-chauffeur · ${k.courses} courses`],
        ['Encaissé', f(k.verse), k.tauxEncaissement == null ? 'aucun CA' : `${k.tauxEncaissement} % du CA net`],
        ['Non versé estimé', f(k.nonVerseEstime), `${k.joursNonVerses} jour(s) sans versement`],
        ['Résultat sur encaissé', f(k.resultatSurEncaisse), `coûts estimés ${f(k.couts.total)}`],
        ['CA net / jour-chauffeur', f(k.caNetParJourChauffeur), `${k.chauffeursActifs} chauffeurs actifs`],
        ['Utilisation des voitures', k.joursChauffeurParVoitureJour == null ? '-' : String(k.joursChauffeurParVoitureJour).replace('.', ','), `${k.vehiculesPlanifies} voiture(s) planifiée(s) sur ${k.vehiculesFlotte} · objectif 2`],
      ];
      const cw = (LW - 8) / 3, ch = 22;
      saut(ch * 2 + 6);
      cartes.forEach((c, i) => {
        const x = M + (i % 3) * (cw + 4), yy = y + Math.floor(i / 3) * (ch + 4);
        const navy = i === 0;
        doc.setFillColor(...(navy ? [11, 18, 32] : [243, 245, 243])); doc.roundedRect(x, yy, cw, ch, 3, 3, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...(navy ? [160, 175, 195] : [120, 128, 136])); doc.text(this._txt(c[0].toUpperCase()), x + 4, yy + 6);
        const rouge = (i === 2 && k.nonVerseEstime > 0) || (i === 3 && k.resultatSurEncaisse < 0);
        doc.setFontSize(13); doc.setTextColor(...(navy ? [255, 255, 255] : rouge ? [220, 38, 38] : [23, 24, 26])); doc.text(this._txt(c[1]), x + 4, yy + 13.5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(...(navy ? [170, 185, 205] : [120, 128, 136])); doc.text(this._txt(c[2]), x + 4, yy + 18.8);
      });
      y += ch * 2 + 10;
      para(`CA brut ${f(k.caBrut)} · commission Yango ${f(k.commission)} · charges déclarées ${f(k.charges)}` + (k.contraventionsImpayees ? ` · ${k.contraventionsImpayees} amende(s) impayée(s) (${f(k.contraventionsMontant)})` : '') + ` · si tout était encaissé : ${f(k.resultatSiToutEncaisse)}`, { taille: 8.5, rgb: [120, 128, 136], apres: 6 });

      // --- analyse IA ---
      const texte = this._analyses[this._periode];
      if (texte) {
        const couleurs = [[0, 113, 227], [26, 158, 63], [201, 111, 0], [124, 58, 237], [100, 116, 139]];
        const themes = [/diagnostic/i, /va bien|positif|points? forts?/i, /attention|risque|alerte|faible/i, /recommand|action|priorit/i, /vérifier|verifier|donn/i];
        const lignes = String(texte).split(/\r?\n/);
        let premier = true, couleur = couleurs[0];
        for (const l of lignes) {
          const t = l.trim(); if (!t) continue;
          const h = t.match(/^#{1,3}\s+(.*)$/);
          if (h) {
            if (premier && /^#\s/.test(t)) { para(h[1], { taille: 9, rgb: [120, 128, 136], apres: 4 }); premier = false; continue; }
            premier = false;
            const idx = themes.findIndex(re => re.test(h[1]));
            couleur = couleurs[idx >= 0 ? idx : 0];
            y += 2; titre(h[1], couleur);
            continue;
          }
          premier = false;
          const li = t.match(/^[-*•]\s+(.*)$/) || t.match(/^\d+[.)]\s+(.*)$/);
          if (li) para(li[1], { puce: true, retrait: 7, apres: 1.8, puceRgb: couleur }); else para(t);
        }
        y += 4;
      } else {
        para("Aucune analyse IA n'a été lancée pour cette période : le rapport contient les indicateurs et le détail par chauffeur.", { taille: 9, rgb: [120, 128, 136], apres: 6 });
      }

      // --- par chauffeur ---
      const rows = (d.chauffeurs || []).filter(c => c.joursCA > 0 || c.joursPlanifies > 0)
        .sort((a, b) => (b.nonVerseEstime - a.nonVerseEstime) || ((a.taux || 0) - (b.taux || 0)));
      if (rows.length) {
        titre('Par chauffeur', [201, 111, 0]);
        doc.autoTable({
          startY: y,
          margin: { left: M, right: M, top: 38, bottom: 16 },
          head: [['Chauffeur', 'Jours', 'Courses', 'CA net', 'Versé', 'Taux', 'Non versé']],
          body: rows.map(c => [this._txt(c.nom), c.joursCA, c.courses || 0, f(c.caNet), f(c.verse), c.taux == null ? '-' : `${c.taux} %`, c.nonVerseEstime > 0 ? f(c.nonVerseEstime) : '-']),
          theme: 'plain',
          styles: { fontSize: 8.5, cellPadding: 2.4, textColor: [40, 44, 50], lineColor: [231, 234, 232], lineWidth: 0.2 },
          headStyles: { fillColor: [243, 245, 243], textColor: [100, 108, 116], fontStyle: 'bold', fontSize: 7.5 },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' }, 6: { halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' } },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 6 && data.cell.raw === '-') { data.cell.styles.textColor = [160, 168, 176]; data.cell.styles.fontStyle = 'normal'; }
            if (data.section === 'body' && data.column.index === 5) {
              const t = rows[data.row.index].taux;
              data.cell.styles.textColor = t == null ? [120, 128, 136] : t >= 90 ? [26, 158, 63] : t >= 70 ? [201, 111, 0] : [220, 38, 38];
            }
          },
          didDrawPage: () => { if (!pagesEntete.has(doc.internal.getCurrentPageInfo().pageNumber)) { const yy = y; entete(); y = yy; } },
        });
        y = doc.lastAutoTable.finalY + 6;
        para('Taux = versé / CA net Yango sur la période. Non versé = jours planifiés sans versement, valorisés au CA net du jour.', { taille: 7.8, rgb: [140, 148, 156], apres: 6 });
      }

      // --- questions / réponses ---
      const ech = this._echanges.filter(e => e.reponse);
      if (ech.length) {
        titre('Questions posées', [124, 58, 237]);
        ech.forEach(e => {
          para(e.question, { gras: true, rgb: [23, 24, 26], apres: 1.5 });
          String(e.reponse).split(/\r?\n/).forEach(l => {
            const t = l.trim(); if (!t) return;
            const li = t.match(/^[-*•]\s+(.*)$/) || t.match(/^\d+[.)]\s+(.*)$/);
            if (li) para(li[1], { puce: true, retrait: 7, apres: 1.5, puceRgb: [124, 58, 237] }); else para(t.replace(/^#+\s*/, ''));
          });
          y += 3;
        });
      }

      pied();
      doc.save(`pilote-analyse-${d.periode.du}_${d.periode.au}.pdf`);
      Toast.success('Rapport PDF exporté');
    } catch (e) {
      console.error('analyse: export PDF', e);
      Toast.error('Export PDF impossible : ' + (e.message || e));
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // Découpe l'analyse (titres ##) en sections illustrées ; le premier titre (# …) devient la légende.
  _sections(texte) {
    const themes = [
      { re: /diagnostic/i, c: '#0071e3', icon: 'solar:stethoscope-bold' },
      { re: /va bien|positif|points? forts?/i, c: '#1a9e3f', icon: 'solar:check-circle-bold' },
      { re: /attention|risque|alerte|faible/i, c: '#c96f00', icon: 'solar:danger-triangle-bold' },
      { re: /recommand|action|priorit/i, c: '#7c3aed', icon: 'solar:lightbulb-bolt-bold' },
      { re: /vérifier|verifier|donn/i, c: '#64748b', icon: 'solar:clipboard-check-bold' },
    ];
    const lignes = String(texte).split(/\r?\n/);
    let legende = '', courant = null; const secs = [];
    for (const l of lignes) {
      const h1 = l.match(/^#\s+(.*)$/);
      if (h1 && !courant && !secs.length) { legende = h1[1]; continue; }
      const h = l.match(/^#{1,3}\s+(.*)$/);
      if (h) { courant = { titre: h[1], corps: [] }; secs.push(courant); continue; }
      if (!courant) { courant = { titre: '', corps: [] }; secs.push(courant); }
      courant.corps.push(l);
    }
    // Un premier titre sans contenu (« ## Analyse de la période … ») sert de légende.
    if (!legende && secs.length && secs[0].titre && !secs[0].corps.join('').trim()) legende = secs.shift().titre;
    if (!secs.length) return `<div class="an-md">${this._md(texte)}</div>`;
    const html = secs.map((s, i) => {
      const th = themes.find(t => t.re.test(s.titre)) || { c: '#0071e3', icon: 'solar:document-text-bold' };
      const corps = this._md(s.corps.join('\n'));
      if (!corps.trim()) return '';
      return `<div class="an-sec" style="--c:${th.c};--i:${i}">${s.titre ? `<div class="an-sec-h"><span class="ic"><iconify-icon icon="${th.icon}"></iconify-icon></span><h3>${this._mdInline(s.titre)}</h3></div>` : ''}${corps}</div>`;
    }).join('');
    return (legende ? `<div class="an-cap"><iconify-icon icon="solar:calendar-bold"></iconify-icon>${this._mdInline(legende)}</div>` : '') + html;
  },

  _mdInline(s) { return this._esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); },

  // Markdown minimal (titres ##, listes -, gras **, paragraphes), texte échappé d'abord.
  _md(texte) {
    const inline = (s) => this._mdInline(s);
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
