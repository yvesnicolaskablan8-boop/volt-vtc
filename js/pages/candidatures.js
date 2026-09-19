/**
 * CandidaturesPage — le recrutement, du formulaire du site à la fiche chauffeur.
 *
 * Les candidatures déposées sur pilote.tech arrivent dans la table `leads`
 * (collection `candidatures`). Avant cette page, personne ne les voyait : elles
 * restaient en statut « nouveau » dans la base. Ici on les traite :
 *   nouveau → contacté → entretien → essai → embauché   (ou refusé)
 * Chaque changement est consigné dans `suivi` (qui, quand, quoi). « Embaucher »
 * ouvre la création de la fiche chauffeur, pré-remplie.
 *
 * Tout le contenu venant du candidat est échappé (Utils.escHtml).
 */
const CandidaturesPage = {
  _filtre: 'actives',      // 'actives' | un statut | 'toutes'
  _ouvert: null,           // id de la candidature dont le suivi est déplié

  ETAPES: [
    { cle: 'nouveau',   label: 'Nouveau',   couleur: '#EF4444', icone: 'solar:bell-bing-bold' },
    { cle: 'contacte',  label: 'Contacté',  couleur: '#E8930C', icone: 'solar:phone-calling-bold' },
    { cle: 'entretien', label: 'Entretien', couleur: '#2563eb', icone: 'solar:users-group-two-rounded-bold' },
    { cle: 'essai',     label: 'Essai',     couleur: '#7c3aed', icone: 'solar:wheel-bold' },
    { cle: 'embauche',  label: 'Embauché',  couleur: '#0a9d78', icone: 'solar:check-circle-bold' },
    { cle: 'refuse',    label: 'Refusé',    couleur: '#7C8FAC', icone: 'solar:close-circle-bold' }
  ],

  // ---- Données ---------------------------------------------------------------
  _toutes() {
    return (Store.get('candidatures') || [])
      .filter(c => !c.type || c.type === 'chauffeur')
      .map(c => ({ ...c, statut: this._statutConnu(c.statut) }))
      .sort((a, b) => String(b.dateCreation || '').localeCompare(String(a.dateCreation || '')));
  },
  _statutConnu(s) { return this.ETAPES.some(e => e.cle === s) ? s : 'nouveau'; },
  _etape(cle) { return this.ETAPES.find(e => e.cle === cle) || this.ETAPES[0]; },
  _estActive(c) { return c.statut !== 'embauche' && c.statut !== 'refuse'; },

  /** Candidatures qui attendent une action : lu par le tableau de bord, les alertes et la cloche. */
  aTraiter() { return this._toutes().filter(c => c.statut === 'nouveau'); },

  _anciennete(iso) {
    const t = new Date(iso).getTime();
    if (!t) return '';
    const min = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (min < 60) return `il y a ${min || 1} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const j = Math.round(h / 24);
    return j < 31 ? `il y a ${j} jour${j > 1 ? 's' : ''}` : Utils.formatDate(String(iso).slice(0, 10));
  },

  _auteur() {
    const s = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
    return s ? `${s.prenom || ''} ${s.nom || ''}`.trim() || 'Administrateur' : 'Administrateur';
  },

  /** Numéro pour wa.me : chiffres seuls, indicatif 225 ajouté si absent. */
  _numeroWhatsApp(tel) {
    let n = String(tel || '').replace(/\D/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    if (n.length === 10) n = '225' + n;
    return n;
  },

  // ---- Rendu -----------------------------------------------------------------
  render() {
    const container = document.getElementById('page-content');
    container.replaceChildren();
    container.insertAdjacentHTML('beforeend', this._template());
    this._peindre();
    container.addEventListener('click', this._surClic);
    // Les candidatures font partie du second chargement : on relit la base à l'ouverture.
    Store.rechargerCollection('candidatures').then(() => { if (document.getElementById('cd-liste')) this._peindre(); });
    try { localStorage.setItem('pilote_candidatures_vues', new Date().toISOString()); } catch (_) {}
    this._peindrePush();
  },

  // Alerte sur cet appareil à chaque candidature, même application fermée.
  async _peindrePush() {
    const b = document.getElementById('cd-push');
    if (!b || typeof App === 'undefined' || !App.pushActif) return;
    const actif = await App.pushActif();
    if (!document.getElementById('cd-push')) return;
    b.classList.toggle('appel', actif);
    const t = b.querySelector('span'); if (t) t.textContent = actif ? 'Alertes actives sur cet appareil' : 'Être prévenu sur cet appareil';
    b.title = actif ? 'Cliquez pour renvoyer une notification d’essai' : 'Recevoir une notification à chaque nouvelle candidature, même application fermée';
  },

  async _activerPush() {
    const b = document.getElementById('cd-push');
    if (b) b.disabled = true;
    try {
      const r = await App.activerPush();
      if (r.ok) Toast.success(r.message); else Toast.warning(r.message);
    } catch (e) { Toast.error('Activation impossible : ' + e.message); }
    if (b) b.disabled = false;
    this._peindrePush();
  },

  destroy() {
    const container = document.getElementById('page-content');
    if (container) container.removeEventListener('click', this._surClic);
  },

  _template() {
    return `
      <style>
        .cd-tete{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:18px;}
        .cd-sur{font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--text-muted);}
        .cd-tete h1{margin:4px 0 4px;font-size:30px;letter-spacing:-.02em;line-height:1.1;}
        .cd-tete p{margin:0;color:var(--text-muted);font-size:14px;max-width:620px;line-height:1.5;}
        .cd-filtres{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
        .cd-f{--c:#64748b;border:1px solid var(--border-color);background:var(--bg-primary,#fff);border-radius:99px;padding:8px 14px;font-weight:700;font-size:13px;color:var(--text-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .15s ease;}
        .cd-f b{font-weight:900;color:var(--c);} .cd-f:hover{border-color:var(--c);}
        .cd-f.on{background:var(--c);border-color:var(--c);color:#fff;} .cd-f.on b{color:#fff;}
        .cd-liste{display:flex;flex-direction:column;gap:12px;}
        .cd-carte{--c:#64748b;background:var(--bg-primary,#fff);border:1px solid var(--border-color);border-left:4px solid var(--c);border-radius:18px;padding:16px 18px;box-shadow:var(--shadow-card,0 2px 10px rgba(0,0,0,.04));}
        .cd-haut{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
        .cd-av{width:46px;height:46px;border-radius:15px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);}
        .cd-id{flex:1;min-width:210px;}
        .cd-nom{font-size:16.5px;font-weight:800;color:var(--text-primary);display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
        .cd-badge{font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:99px;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);white-space:nowrap;}
        .cd-meta{font-size:12.5px;color:var(--text-muted);margin-top:3px;display:flex;gap:12px;flex-wrap:wrap;font-weight:600;}
        .cd-meta span{display:inline-flex;align-items:center;gap:4px;}
        .cd-notes{margin-top:10px;font-size:13px;line-height:1.55;color:var(--text-secondary);white-space:pre-line;background:var(--bg-tertiary);border-radius:12px;padding:10px 12px;}
        .cd-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center;}
        .cd-b{border:1px solid var(--border-color);background:var(--bg-primary,#fff);color:var(--text-primary);border-radius:11px;padding:8px 13px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;transition:all .15s ease;}
        .cd-b:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(0,0,0,.07);}
        .cd-b.appel{background:#0a9d78;border-color:#0a9d78;color:#fff;} .cd-b.wa{background:#25D366;border-color:#25D366;color:#fff;}
        .cd-b.suite{background:var(--pilote-blue,#2563eb);border-color:var(--pilote-blue,#2563eb);color:#fff;} .cd-b.non{color:#b91c1c;}
        .cd-b iconify-icon{font-size:16px;} .cd-pousse{flex:1;}
        .cd-suivi{margin-top:12px;border-top:1px dashed var(--border-color);padding-top:12px;}
        .cd-ligne{display:flex;gap:10px;font-size:12.5px;padding:4px 0;color:var(--text-secondary);} .cd-ligne time{color:var(--text-muted);white-space:nowrap;font-weight:600;min-width:118px;}
        .cd-note-saisie{display:flex;gap:8px;margin-top:8px;} .cd-note-saisie input{flex:1;}
        .cd-vide{text-align:center;padding:46px 20px;color:var(--text-muted);background:var(--bg-primary,#fff);border:1px dashed var(--border-color);border-radius:18px;}
        .cd-vide iconify-icon{font-size:44px;color:#0a9d78;display:block;margin:0 auto 10px;}
        @media(max-width:640px){ .cd-tete h1{font-size:24px;} .cd-b{flex:1;justify-content:center;} .cd-pousse{display:none;} }
      </style>
      <div class="cd-tete">
        <div><span class="cd-sur">PILOTE / RECRUTEMENT</span><h1>Candidatures</h1>
          <p>Les chauffeurs qui postulent sur pilote.tech arrivent ici. Un candidat rappelé dans l'heure a bien plus de chances de rejoindre la flotte.</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="cd-b" id="cd-push" data-cd-push="1"><iconify-icon icon="solar:bell-bing-bold"></iconify-icon><span>Être prévenu sur cet appareil</span></button>
          <a class="cd-b" href="https://pilote.tech/candidature" target="_blank" rel="noopener"><iconify-icon icon="solar:link-round-angle-bold"></iconify-icon>Voir le formulaire du site</a>
        </div>
      </div>
      <div class="cd-filtres" id="cd-filtres"></div>
      <div class="cd-liste" id="cd-liste"></div>`;
  },

  _peindre() {
    const toutes = this._toutes();
    const filtres = document.getElementById('cd-filtres');
    const liste = document.getElementById('cd-liste');
    if (!filtres || !liste) return;

    const compte = (cle) => toutes.filter(c => c.statut === cle).length;
    const puces = [
      { cle: 'actives', label: 'En cours', n: toutes.filter(c => this._estActive(c)).length, couleur: '#2563eb' },
      ...this.ETAPES.map(e => ({ cle: e.cle, label: e.label, n: compte(e.cle), couleur: e.couleur })),
      { cle: 'toutes', label: 'Toutes', n: toutes.length, couleur: '#64748b' }
    ];
    filtres.replaceChildren();
    filtres.insertAdjacentHTML('beforeend', puces.map(p =>
      `<button type="button" class="cd-f${this._filtre === p.cle ? ' on' : ''}" style="--c:${p.couleur}" data-cd-filtre="${p.cle}">${Utils.escHtml(p.label)} <b>${p.n}</b></button>`).join(''));

    const visibles = toutes.filter(c => this._filtre === 'toutes' ? true : this._filtre === 'actives' ? this._estActive(c) : c.statut === this._filtre);
    liste.replaceChildren();
    if (!visibles.length) {
      liste.insertAdjacentHTML('beforeend', `<div class="cd-vide"><iconify-icon icon="solar:inbox-in-bold-duotone"></iconify-icon>${toutes.length ? 'Aucune candidature à cette étape.' : 'Aucune candidature pour le moment. Elles apparaîtront ici dès qu’un chauffeur postulera sur le site.'}</div>`);
      return;
    }
    liste.insertAdjacentHTML('beforeend', visibles.map(c => this._carte(c)).join(''));
  },

  _carte(c) {
    const e = this._etape(c.statut);
    const esc = (s) => Utils.escHtml(String(s == null ? '' : s));
    const nom = `${c.prenom || ''} ${c.nom || ''}`.trim() || 'Candidat';
    const initiales = ((c.prenom || '?')[0] + ((c.nom || '')[0] || '')).toUpperCase();
    const tel = String(c.telephone || '');
    const wa = this._numeroWhatsApp(tel);
    const message = encodeURIComponent(`Bonjour ${c.prenom || ''}, ici Pilote. Nous avons bien reçu votre candidature de chauffeur salarié. Êtes-vous disponible pour un court échange téléphonique ?`);
    const i = this.ETAPES.findIndex(x => x.cle === c.statut);
    const suivante = (i >= 0 && i < 3) ? this.ETAPES[i + 1] : null;         // nouveau → contacté → entretien → essai
    const suivi = Array.isArray(c.suivi) ? c.suivi : [];
    const ouvert = this._ouvert === c.id;
    const retard = c.statut === 'nouveau' && (Date.now() - new Date(c.dateCreation).getTime()) > 4 * 3600000;

    const actions = [];
    if (tel) actions.push(`<a class="cd-b appel" href="tel:${esc(tel.replace(/[^\d+]/g, ''))}" data-cd-trace="appel" data-id="${esc(c.id)}"><iconify-icon icon="solar:phone-bold"></iconify-icon>Appeler</a>`);
    if (wa) actions.push(`<a class="cd-b wa" href="https://wa.me/${esc(wa)}?text=${message}" target="_blank" rel="noopener" data-cd-trace="whatsapp" data-id="${esc(c.id)}"><iconify-icon icon="ic:baseline-whatsapp"></iconify-icon>WhatsApp</a>`);
    if (suivante) actions.push(`<button type="button" class="cd-b suite" data-cd-statut="${suivante.cle}" data-id="${esc(c.id)}"><iconify-icon icon="solar:arrow-right-bold"></iconify-icon>Passer à « ${esc(suivante.label)} »</button>`);
    if (this._estActive(c)) actions.push(`<button type="button" class="cd-b suite" style="background:#0a9d78;border-color:#0a9d78" data-cd-embaucher="${esc(c.id)}"><iconify-icon icon="solar:user-plus-bold"></iconify-icon>Embaucher</button>`);
    actions.push('<span class="cd-pousse"></span>');
    actions.push(`<button type="button" class="cd-b" data-cd-suivi="${esc(c.id)}"><iconify-icon icon="solar:notes-bold"></iconify-icon>Suivi${suivi.length ? ` (${suivi.length})` : ''}</button>`);
    if (this._estActive(c)) actions.push(`<button type="button" class="cd-b non" data-cd-statut="refuse" data-id="${esc(c.id)}"><iconify-icon icon="solar:close-circle-bold"></iconify-icon>Refuser</button>`);
    else actions.push(`<button type="button" class="cd-b" data-cd-statut="nouveau" data-id="${esc(c.id)}"><iconify-icon icon="solar:restart-bold"></iconify-icon>Rouvrir</button>`);
    if (c.statut === 'embauche' && c.chauffeurId) actions.push(`<a class="cd-b" href="#/chauffeurs/${esc(c.chauffeurId)}"><iconify-icon icon="solar:user-id-bold"></iconify-icon>Fiche chauffeur</a>`);

    const lignes = suivi.slice().reverse().map(s => `<div class="cd-ligne"><time>${esc(new Date(s.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</time><span><b>${esc(s.par || '')}</b> — ${esc(s.action || '')}${s.note ? ` : ${esc(s.note)}` : ''}</span></div>`).join('');

    return `<article class="cd-carte" style="--c:${e.couleur}" id="cd-${esc(c.id)}">
      <div class="cd-haut">
        <div class="cd-av">${esc(initiales)}</div>
        <div class="cd-id">
          <div class="cd-nom">${esc(nom)} <span class="cd-badge"><iconify-icon icon="${e.icone}" style="vertical-align:-2px"></iconify-icon> ${esc(e.label)}</span>${retard ? '<span class="cd-badge" style="--c:#EF4444">À rappeler : plus de 4 h</span>' : ''}</div>
          <div class="cd-meta">
            ${tel ? `<span><iconify-icon icon="solar:phone-linear"></iconify-icon>${esc(tel)}</span>` : ''}
            ${c.ville ? `<span><iconify-icon icon="solar:map-point-linear"></iconify-icon>${esc(c.ville)}</span>` : ''}
            <span><iconify-icon icon="solar:clock-circle-linear"></iconify-icon>Reçue ${esc(this._anciennete(c.dateCreation))}</span>
          </div>
        </div>
      </div>
      ${c.notes ? `<div class="cd-notes">${esc(c.notes)}</div>` : ''}
      <div class="cd-actions">${actions.join('')}</div>
      ${ouvert ? `<div class="cd-suivi">${lignes || '<div class="cd-ligne">Aucune action consignée pour l’instant.</div>'}
        <div class="cd-note-saisie"><input type="text" class="form-control" id="cd-note-${esc(c.id)}" placeholder="Ajouter une note (rappel prévu, impression, documents à fournir…)" maxlength="300"><button type="button" class="cd-b suite" data-cd-note="${esc(c.id)}">Ajouter</button></div></div>` : ''}
    </article>`;
  },

  // ---- Actions ---------------------------------------------------------------
  _surClic(ev) {
    const self = CandidaturesPage;
    const cible = ev.target.closest('[data-cd-filtre],[data-cd-statut],[data-cd-suivi],[data-cd-note],[data-cd-embaucher],[data-cd-trace],[data-cd-push]');
    if (!cible) return;
    if (cible.dataset.cdPush) { self._activerPush(); return; }
    if (cible.dataset.cdFiltre) { self._filtre = cible.dataset.cdFiltre; self._peindre(); return; }
    if (cible.dataset.cdSuivi) { self._ouvert = self._ouvert === cible.dataset.cdSuivi ? null : cible.dataset.cdSuivi; self._peindre(); return; }
    if (cible.dataset.cdNote) {
      const champ = document.getElementById('cd-note-' + cible.dataset.cdNote);
      const texte = champ ? champ.value.trim() : '';
      if (!texte) { Toast.warning('Écrivez la note avant de l’ajouter.'); return; }
      self._consigner(cible.dataset.cdNote, 'Note', texte); return;
    }
    if (cible.dataset.cdEmbaucher) { self._embaucher(cible.dataset.cdEmbaucher); return; }
    if (cible.dataset.cdStatut) { self._changerStatut(cible.dataset.id, cible.dataset.cdStatut); return; }
    // Appel / WhatsApp : le lien s'ouvre normalement, on consigne seulement l'action.
    if (cible.dataset.cdTrace) { self._consigner(cible.dataset.id, cible.dataset.cdTrace === 'appel' ? 'Appel lancé' : 'Message WhatsApp ouvert', '', true); }
  },

  _consigner(id, action, note, discret) {
    const c = (Store.get('candidatures') || []).find(x => x.id === id);
    if (!c) return;
    const suivi = (Array.isArray(c.suivi) ? c.suivi : []).concat([{ date: new Date().toISOString(), par: this._auteur(), action, note: note || '' }]);
    const maj = { suivi, majLe: new Date().toISOString() };
    // Un premier contact fait sortir la candidature de « nouveau ».
    if (discret && this._statutConnu(c.statut) === 'nouveau') maj.statut = 'contacte';
    Store.update('candidatures', id, maj);
    if (!discret) { this._ouvert = id; Toast.success('Note ajoutée au suivi.'); }
    this._peindre();
    this._rafraichirCompteurs();
  },

  _changerStatut(id, statut) {
    const c = (Store.get('candidatures') || []).find(x => x.id === id);
    if (!c) return;
    const appliquer = () => {
      const e = this._etape(statut);
      const suivi = (Array.isArray(c.suivi) ? c.suivi : []).concat([{ date: new Date().toISOString(), par: this._auteur(), action: `Passé à « ${e.label} »`, note: '' }]);
      Store.update('candidatures', id, { statut, suivi, majLe: new Date().toISOString() });
      Toast.success(`${c.prenom || 'Candidat'} : ${e.label.toLowerCase()}.`);
      this._peindre();
      this._rafraichirCompteurs();
    };
    if (statut === 'refuse') Modal.confirm('Refuser cette candidature', `La candidature de <strong>${Utils.escHtml(`${c.prenom || ''} ${c.nom || ''}`.trim())}</strong> sera classée « Refusé ». Vous pourrez la rouvrir plus tard.`, appliquer);
    else appliquer();
  },

  /** Ouvre la création de la fiche chauffeur, pré-remplie ; la candidature passera « Embauché » une fois la fiche créée. */
  _embaucher(id) {
    const c = (Store.get('candidatures') || []).find(x => x.id === id);
    if (!c) return;
    const prefill = {
      prenom: c.prenom || '', nom: c.nom || '', telephone: c.telephone || '', email: c.email || '',
      adresse: c.ville || '', typeContrat: 'salarie', statut: 'actif',
      dateDebutContrat: new Date().toISOString().slice(0, 10),
      noteInterne: `Candidature reçue le ${Utils.formatDate(String(c.dateCreation || '').slice(0, 10))} via pilote.tech.${c.notes ? '\n' + c.notes : ''}`
    };
    try { sessionStorage.setItem('pilote_chauffeur_prefill', JSON.stringify({ candidatureId: id, prefill })); } catch (_) {}
    if (typeof Router !== 'undefined' && Router.navigate) Router.navigate('/chauffeurs');
    else window.location.hash = '#/chauffeurs';
  },

  /** Appelée par la page Chauffeurs quand la fiche issue d'une candidature vient d'être créée. */
  marquerEmbauche(candidatureId, chauffeur) {
    const c = (Store.get('candidatures') || []).find(x => x.id === candidatureId);
    if (!c) return;
    const suivi = (Array.isArray(c.suivi) ? c.suivi : []).concat([{ date: new Date().toISOString(), par: this._auteur(), action: 'Embauché — fiche chauffeur créée', note: `${chauffeur.prenom || ''} ${chauffeur.nom || ''}`.trim() }]);
    Store.update('candidatures', candidatureId, { statut: 'embauche', chauffeurId: chauffeur.id, suivi, majLe: new Date().toISOString() });
    this._rafraichirCompteurs();
  },

  _rafraichirCompteurs() {
    try { if (typeof Header !== 'undefined' && Header._refreshWidgets) Header._refreshWidgets(); } catch (_) {}
  }
};
