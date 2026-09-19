/**
 * PaiePage — État de paie mensuel des chauffeurs salariés.
 *
 * Pour chaque chauffeur : salaire fixe au prorata des jours de contrat dans le
 * mois, prime mensuelle acquise, retenue et ajustement décidés par
 * l'administrateur, net à payer, puis « payé » (moyen, référence, date). Une
 * ligne payée est figée. Le calcul est dans Utils.computePaieMois ; les
 * décisions et les paiements sont enregistrés dans la collection `paie`.
 *
 * C'est un document de GESTION : il ne remplace pas le bulletin de paie légal.
 */
const PaiePage = {
  _mois: null,
  _lignes: [],

  render() {
    if (!this._mois) this._mois = new Date().toISOString().slice(0, 7);
    const container = document.getElementById('page-content');
    container.replaceChildren();
    container.insertAdjacentHTML('beforeend', this._template());
    container.addEventListener('click', this._surClic);
    this._calculer();
    Store.rechargerCollection('paie').then(() => { if (document.getElementById('pa-contenu')) this._calculer(); });
  },

  destroy() {
    const container = document.getElementById('page-content');
    if (container) container.removeEventListener('click', this._surClic);
  },

  _decalerMois(n) {
    const [a, m] = this._mois.split('-').map(Number);
    this._mois = new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
    this.render();
  },

  _libelleMois(mois) {
    const [a, m] = (mois || this._mois).split('-').map(Number);
    const nom = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  },

  _template() {
    const enCours = this._mois === new Date().toISOString().slice(0, 7);
    return `
      <style>
        .pa-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px;}
        .pa-tab{width:100%;border-collapse:collapse;font-size:var(--font-size-sm);min-width:980px;}
        .pa-tab th{padding:10px;text-align:left;font-size:var(--font-size-xs);color:var(--text-secondary);background:var(--bg-tertiary);font-weight:700;white-space:nowrap;}
        .pa-tab th.r,.pa-tab td.r{text-align:right;} .pa-tab th.c,.pa-tab td.c{text-align:center;}
        .pa-tab td{padding:11px 10px;border-bottom:1px solid var(--border-color);vertical-align:middle;font-variant-numeric:tabular-nums;}
        .pa-tab tfoot td{font-weight:800;background:var(--bg-tertiary);border-bottom:none;}
        .pa-nom{font-weight:700;color:var(--text-primary);} .pa-sous{font-size:10.5px;color:var(--text-muted);font-weight:500;margin-top:2px;line-height:1.35;max-width:230px;}
        .pa-net{font-weight:900;font-size:14px;color:var(--text-primary);}
        .pa-badge{display:inline-block;font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px;white-space:nowrap;}
        .pa-badge.paye{background:rgba(48,209,88,.16);color:#0a9d78;} .pa-badge.apayer{background:rgba(255,159,10,.18);color:#b45309;}
        .pa-badge.prorata{background:rgba(37,99,235,.12);color:#1d4ed8;} .pa-dette{color:#b91c1c;font-weight:700;}
        .pa-act{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;}
        .pa-note{font-size:12px;color:var(--text-muted);line-height:1.55;margin-top:14px;}
      </style>
      <div class="page-header">
        <h1><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon> État de paie</h1>
      </div>
      <div class="card" style="margin-bottom:var(--space-lg);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn btn-sm btn-secondary" data-pa-mois="-1"><iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon></button>
            <strong style="font-size:14px;">${this._libelleMois()}</strong>
            <button class="btn btn-sm btn-secondary" data-pa-mois="1" ${enCours ? 'disabled' : ''}><iconify-icon icon="solar:alt-arrow-right-bold"></iconify-icon></button>
            ${enCours ? '<span class="d-tag orange" style="font-size:10px;">Mois en cours : montants provisoires</span>' : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-secondary" data-pa-pdf="etat"><iconify-icon icon="solar:file-download-bold-duotone"></iconify-icon> État de paie (PDF)</button>
            <a class="btn btn-sm btn-secondary" href="#/bonus"><iconify-icon icon="solar:gift-bold-duotone"></iconify-icon> Détail des primes</a>
          </div>
        </div>
        <div class="d-sub" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color);line-height:1.6;">
          Salaire fixe <b>au prorata des jours de contrat</b> dans le mois · prime mensuelle si l'objectif est atteint, avec le minimum de jours roulés, et qu'aucune dette n'est en cours ·
          la dette en cours est <b>signalée, jamais retenue d'office</b> : la retenue et l'ajustement sont vos décisions.
        </div>
      </div>
      <div id="pa-contenu"><div class="d-sub" style="padding:20px 0;">Calcul en cours…</div></div>`;
  },

  _calculer() {
    const box = document.getElementById('pa-contenu');
    if (!box) return;
    const chauffeurs = Store.get('chauffeurs') || [];
    const planning = Store.get('planning') || [];
    const objectifs = ((Store.get('settings') || {}).objectifs) || {};
    const detteData = Utils.computeDebts({
      versements: Store.get('versements') || [], chauffeurs, planning,
      absences: Store.get('absences') || [], contraventions: Store.get('contraventions') || [],
      caJour: Store.get('caJour') || [], charges: Store.get('charges') || []
    });
    const dettesParChauffeur = {};
    (detteData.detteListRecettes || []).forEach(d => { dettesParChauffeur[d.chauffeurId] = d.total; });
    const primes = Utils.computePrimeMois({ mois: this._mois, chauffeurs, planning, caJour: Store.get('caJour') || [], objectifs, dettesParChauffeur });
    const lignes = Utils.computePaieMois({
      mois: this._mois, chauffeurs, primes, primesVersees: Store.get('bonus') || [],
      dettesParChauffeur, enregistrements: Store.get('paie') || [],
      caJour: Store.get('caJour') || [], planning
    });
    this._lignes = lignes;

    const F = (n) => Utils.formatCurrency(Math.round(n || 0));
    const somme = (k, f) => lignes.filter(f || (() => true)).reduce((s, l) => s + (Number(l[k]) || 0), 0);
    const aPayer = lignes.filter(l => !l.paye);
    const esc = (s) => Utils.escHtml(String(s == null ? '' : s));

    const rangs = lignes.map(l => `<tr>
        <td><div class="pa-nom">${esc(l.nom)}</div>
          <div class="pa-sous">${l.joursRoules} jour${l.joursRoules > 1 ? 's' : ''} roulé${l.joursRoules > 1 ? 's' : ''} · ${l.joursPlanifies} planifié${l.joursPlanifies > 1 ? 's' : ''}</div>
          ${(!l.paye && l.sansActivite) ? `<div class="pa-sous pa-dette">${l.jamaisRoule ? 'aucune course enregistrée' : `aucune course depuis ${l.joursSansActivite} jours`}</div>` : ''}
          ${l.primeInfo ? `<div class="pa-sous">${esc(l.primeInfo)}</div>` : ''}</td>
        <td class="r">${F(l.salaireBase)}</td>
        <td class="c">${l.complet ? `${l.joursMois} j` : `<span class="pa-badge prorata">${l.joursContrat} / ${l.joursMois} j</span>`}</td>
        <td class="r">${F(l.salaireDu)}</td>
        <td class="r" style="color:${l.prime > 0 ? '#0a9d78' : 'var(--text-muted)'};font-weight:700;">${l.prime > 0 ? '+ ' + F(l.prime) : '—'}</td>
        <td class="r">${l.ajustement ? `${l.ajustement > 0 ? '+ ' : '− '}${F(Math.abs(l.ajustement))}` : '—'}</td>
        <td class="r">${l.retenue ? `− ${F(l.retenue)}` : '—'}${l.dette > 0 ? `<div class="pa-sous pa-dette">dette en cours ${F(l.dette)}</div>` : ''}</td>
        <td class="r"><span class="pa-net">${F(l.net)}</span>${l.motif ? `<div class="pa-sous">${esc(l.motif)}</div>` : ''}</td>
        <td class="c">${l.paye ? `<span class="pa-badge paye">PAYÉ</span><div class="pa-sous">${esc(l.payeLe ? Utils.formatDate(String(l.payeLe).slice(0, 10)) : '')}${l.moyenPaiement ? ' · ' + esc(l.moyenPaiement) : ''}</div>` : '<span class="pa-badge apayer">À PAYER</span>'}</td>
        <td><div class="pa-act">
          ${l.paye ? '' : `<button class="btn btn-sm btn-secondary" data-pa-ajuster="${esc(l.chauffeurId)}" title="Retenue, ajustement, motif"><iconify-icon icon="solar:pen-bold"></iconify-icon></button>`}
          <button class="btn btn-sm btn-secondary" data-pa-pdf="${esc(l.chauffeurId)}" title="Fiche de rémunération (PDF)"><iconify-icon icon="solar:file-text-bold"></iconify-icon></button>
          ${l.paye ? `<button class="btn btn-sm btn-secondary" data-pa-annuler="${esc(l.chauffeurId)}" title="Annuler le paiement"><iconify-icon icon="solar:undo-left-bold"></iconify-icon></button>`
            : `<button class="btn btn-sm btn-primary" data-pa-payer="${esc(l.chauffeurId)}">Payer</button>`}
        </div></td>
      </tr>`).join('');

    box.replaceChildren();
    box.insertAdjacentHTML('beforeend', `
      <div class="pa-kpis">
        <div class="d-card"><div class="d-lbl">Reste à payer</div><div class="d-val" style="color:#b45309;">${F(somme('net', l => !l.paye))}</div><div class="d-sub">${aPayer.length} chauffeur(s)</div></div>
        <div class="d-card"><div class="d-lbl">Déjà payé</div><div class="d-val" style="color:#0a9d78;">${F(somme('net', l => l.paye))}</div><div class="d-sub">${lignes.length - aPayer.length} chauffeur(s)</div></div>
        <div class="d-card"><div class="d-lbl">Salaires dus</div><div class="d-val">${F(somme('salaireDu'))}</div><div class="d-sub">${lignes.filter(l => !l.complet).length} au prorata</div></div>
        <div class="d-card"><div class="d-lbl">Primes</div><div class="d-val">${F(somme('prime'))}</div><div class="d-sub">${lignes.filter(l => l.prime > 0).length} acquise(s)</div></div>
        <div class="d-card"><div class="d-lbl">Masse du mois</div><div class="d-val">${F(somme('net'))}</div><div class="d-sub">net total</div></div>
      </div>
      ${(() => {
        const dormants = lignes.filter(l => !l.paye && l.sansActivite);
        if (!dormants.length) return '';
        return `<div class="card" style="margin-bottom:14px;padding:12px 16px;border-left:4px solid #EF4444;background:rgba(239,68,68,.06);font-size:13px;line-height:1.6;">
          <b>À vérifier avant de payer.</b>
          ${dormants.length ? `<div>• <b>${dormants.length} chauffeur(s)</b> sous contrat n'ont aucune course depuis plus de 7 jours (${dormants.map(l => esc(l.nom)).join(', ')}). Le salaire est calculé sur les jours de <b>contrat</b>, pas sur les jours travaillés : s'ils sont partis, renseignez la date de fin de contrat sur leur fiche ; sinon utilisez l'ajustement.</div>` : ''}
        </div>`;
      })()}
      ${aPayer.length > 1 ? `<button class="btn btn-primary" data-pa-payer="tous" style="margin-bottom:14px;"><iconify-icon icon="solar:card-send-bold-duotone"></iconify-icon> Payer les ${aPayer.length} chauffeurs (${F(somme('net', l => !l.paye))})</button>` : ''}
      <div class="card" style="padding:0;overflow-x:auto;">
        <table class="pa-tab">
          <thead><tr><th>Chauffeur</th><th class="r">Salaire mensuel</th><th class="c">Jours de contrat</th><th class="r">Salaire dû</th><th class="r">Prime</th><th class="r">Ajustement</th><th class="r">Retenue</th><th class="r">Net à payer</th><th class="c">Statut</th><th></th></tr></thead>
          <tbody>${rangs || '<tr><td colspan="10" style="padding:18px;text-align:center;color:var(--text-muted);">Aucun chauffeur salarié sous contrat ce mois-ci</td></tr>'}</tbody>
          ${lignes.length ? `<tfoot><tr><td>Total</td><td></td><td></td><td class="r">${F(somme('salaireDu'))}</td><td class="r">${F(somme('prime'))}</td><td class="r">${F(somme('ajustement'))}</td><td class="r">${F(somme('retenue'))}</td><td class="r">${F(somme('net'))}</td><td></td><td></td></tr></tfoot>` : ''}
        </table>
      </div>
      <p class="pa-note">Document de gestion interne. Il ne remplace pas le bulletin de paie légal : cotisations sociales (CNPS) et impôt sur salaire ne sont pas calculés ici.</p>`);
  },

  // ---- Actions ---------------------------------------------------------------
  _surClic(ev) {
    const self = PaiePage;
    const c = ev.target.closest('[data-pa-mois],[data-pa-ajuster],[data-pa-payer],[data-pa-annuler],[data-pa-pdf]');
    if (!c) return;
    if (c.dataset.paMois) { if (!c.disabled) self._decalerMois(Number(c.dataset.paMois)); return; }
    if (c.dataset.paAjuster) { self._ajuster(c.dataset.paAjuster); return; }
    if (c.dataset.paPayer) { self._payer(c.dataset.paPayer === 'tous' ? self._lignes.filter(l => !l.paye) : self._lignes.filter(l => l.chauffeurId === c.dataset.paPayer)); return; }
    if (c.dataset.paAnnuler) { self._annulerPaiement(c.dataset.paAnnuler); return; }
    if (c.dataset.paPdf) { c.dataset.paPdf === 'etat' ? self._pdfEtat() : self._pdfFiche(c.dataset.paPdf); }
  },

  _enregistrer(l, maj) {
    const id = `PAIE-${l.chauffeurId}-${l.mois}`;
    const existe = (Store.get('paie') || []).some(e => e.id === id);
    if (existe) Store.update('paie', id, maj);
    else Store.add('paie', {
      id, chauffeurId: l.chauffeurId, mois: l.mois, salaireBase: l.salaireBase, joursContrat: l.joursContrat, joursMois: l.joursMois,
      salaireDu: l.salaireDu, prime: l.prime, retenue: l.retenue, ajustement: l.ajustement, motif: l.motif || null, net: l.net,
      statut: 'a_payer', dateCreation: new Date().toISOString(), ...maj
    });
  },

  _ajuster(chauffeurId) {
    const l = this._lignes.find(x => x.chauffeurId === chauffeurId);
    if (!l || l.paye) return;
    const F = (n) => Utils.formatCurrency(Math.round(n || 0));
    Modal.open({
      title: `<iconify-icon icon="solar:pen-bold-duotone" style="color:var(--pilote-blue)"></iconify-icon> ${Utils.escHtml(l.nom)} — ${this._libelleMois()}`,
      body: `<div style="display:flex;flex-direction:column;gap:14px;font-size:var(--font-size-sm);">
          <div class="d-sub">Salaire dû ${F(l.salaireDu)}${l.prime ? ` + prime ${F(l.prime)}` : ''}.${l.dette > 0 ? ` <span style="color:#b91c1c;font-weight:700;">Dette en cours : ${F(l.dette)}.</span>` : ''}</div>
          <div><label style="font-weight:600;display:block;margin-bottom:6px;">Retenue (F) — avance déjà remise, remboursement convenu…</label>
            <input type="number" min="0" step="500" class="form-control" id="pa-retenue" value="${l.retenue || 0}"></div>
          <div><label style="font-weight:600;display:block;margin-bottom:6px;">Ajustement (F) — positif ou négatif</label>
            <input type="number" step="500" class="form-control" id="pa-ajust" value="${l.ajustement || 0}"></div>
          <div><label style="font-weight:600;display:block;margin-bottom:6px;">Motif (apparaît sur la fiche)</label>
            <input type="text" maxlength="160" class="form-control" id="pa-motif" value="${Utils.escHtml(l.motif || '')}" placeholder="Ex. : avance du 12/09, jours d'absence non rémunérés…"></div>
        </div>`,
      footer: `<button class="btn btn-primary" id="pa-ok">Enregistrer</button><button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>`
    });
    setTimeout(() => {
      const b = document.getElementById('pa-ok');
      if (!b) return;
      b.addEventListener('click', () => {
        const retenue = Math.max(0, Math.round(Number(document.getElementById('pa-retenue').value) || 0));
        const ajustement = Math.round(Number(document.getElementById('pa-ajust').value) || 0);
        const motif = document.getElementById('pa-motif').value.trim();
        if ((retenue || ajustement) && !motif) { Toast.warning('Indiquez le motif de la retenue ou de l’ajustement.'); return; }
        const net = l.salaireDu + l.prime + ajustement - retenue;
        this._enregistrer(l, { retenue, ajustement, motif: motif || null, net, salaireDu: l.salaireDu, prime: l.prime });
        Modal.close(); Toast.success('Décision enregistrée.'); this._calculer();
      });
    }, 60);
  },

  _payer(lignes) {
    if (!lignes.length) return;
    const F = (n) => Utils.formatCurrency(Math.round(n || 0));
    const total = lignes.reduce((s, l) => s + l.net, 0);
    Modal.open({
      title: '<iconify-icon icon="solar:card-send-bold-duotone" style="color:var(--pilote-blue)"></iconify-icon> Enregistrer le paiement',
      body: `<div style="font-size:var(--font-size-sm);line-height:1.7;">
          <p><strong>${lignes.length} chauffeur(s)</strong> — ${this._libelleMois()} — total <strong style="color:#0a9d78;">${F(total)}</strong>.</p>
          <div style="margin:12px 0;"><label style="font-weight:600;display:block;margin-bottom:6px;">Moyen de paiement</label>
            <select id="pa-moyen" class="form-control"><option value="wave">Wave</option><option value="virement">Virement bancaire</option><option value="especes">Espèces</option><option value="orange_money">Orange Money</option><option value="autre">Autre</option></select></div>
          <div><label style="font-weight:600;display:block;margin-bottom:6px;">Référence (facultatif)</label><input type="text" maxlength="80" class="form-control" id="pa-ref" placeholder="N° de transaction, de virement…"></div>
          <p style="color:var(--text-muted);font-size:var(--font-size-xs);margin-top:10px;">Cette action <b>consigne</b> le paiement ; elle n'envoie pas d'argent. La ligne est ensuite figée (annulable).</p>
        </div>`,
      footer: `<button class="btn btn-primary" id="pa-confirmer">Marquer payé</button><button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>`
    });
    setTimeout(() => {
      const b = document.getElementById('pa-confirmer');
      if (!b) return;
      b.addEventListener('click', () => {
        const moyen = document.getElementById('pa-moyen').value;
        const reference = document.getElementById('pa-ref').value.trim();
        const s = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
        const par = s ? `${s.prenom || ''} ${s.nom || ''}`.trim() : '';
        const maintenant = new Date().toISOString();
        lignes.forEach(l => {
          this._enregistrer(l, { statut: 'paye', payeLe: maintenant, payePar: par || null, moyenPaiement: moyen, referencePaiement: reference || null,
            salaireDu: l.salaireDu, prime: l.prime, retenue: l.retenue, ajustement: l.ajustement, net: l.net });
          // La prime payée avec le salaire est consignée une seule fois, comme sur la page Prime mensuelle.
          const idPrime = `PRIME-${l.chauffeurId}-${l.mois}`;
          if (l.prime > 0 && !(Store.get('bonus') || []).some(x => x.id === idPrime)) {
            Store.add('bonus', { id: idPrime, chauffeurId: l.chauffeurId, semaine: l.mois, typeContrat: 'salarie', montant: l.prime,
              criteres: ['Prime mensuelle payée avec le salaire'], base: {}, statut: 'verse', moyenVersement: 'salaire',
              referenceVersement: reference || '', dateVersement: maintenant, dateCreation: maintenant });
          }
        });
        Modal.close(); Toast.success(`${lignes.length} paiement(s) consigné(s).`); this._calculer();
      });
    }, 60);
  },

  _annulerPaiement(chauffeurId) {
    const l = this._lignes.find(x => x.chauffeurId === chauffeurId);
    if (!l || !l.paye) return;
    Modal.confirm('Annuler ce paiement', `La ligne de <strong>${Utils.escHtml(l.nom)}</strong> repassera « à payer » et sera recalculée.`, () => {
      Store.update('paie', `PAIE-${l.chauffeurId}-${l.mois}`, { statut: 'a_payer', payeLe: null, payePar: null, moyenPaiement: null, referencePaiement: null });
      Toast.info('Paiement annulé.'); this._calculer();
    });
  },

  // ---- PDF (polices standard : pas d'espace fine ni d'apostrophe courbe) -----
  _nb(n) { const v = Math.round(Number(n) || 0); return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'; },
  _txt(s) { return String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[   ]/g, ' ').replace(/…/g, '...').replace(/[–—]/g, '-'); },

  async _pdfEtat() {
    if (!this._lignes.length) { Toast.warning('Aucune ligne à exporter.'); return; }
    await LazyLibs.jspdf();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const ent = ((Store.get('settings') || {}).entreprise) || {};
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, 297, 24, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.text('PILOTE', 12, 11);
    doc.setFontSize(10); doc.text(this._txt(`État de paie - ${this._libelleMois()}`), 12, 18);
    doc.setFontSize(8); doc.text(this._txt(`${ent.nom || ''}   Édité le ${new Date().toLocaleDateString('fr-FR')}`), 285, 18, { align: 'right' });
    const cols = [['Chauffeur', 12, 'left'], ['Salaire mensuel', 92, 'right'], ['Jours', 108, 'right'], ['Salaire dû', 138, 'right'], ['Prime', 164, 'right'], ['Ajustement', 190, 'right'], ['Retenue', 214, 'right'], ['Net à payer', 244, 'right'], ['Statut', 250, 'left']];
    let y = 34;
    const entete = () => { doc.setFontSize(8); doc.setTextColor(100, 116, 139); cols.forEach(([t, x, al]) => doc.text(t, x, y, { align: al })); y += 2; doc.setDrawColor(203, 213, 225); doc.line(12, y, 285, y); y += 6; };
    entete();
    doc.setFontSize(9);
    this._lignes.forEach(l => {
      if (y > 190) { doc.addPage(); y = 20; entete(); doc.setFontSize(9); }
      doc.setTextColor(15, 23, 42);
      const v = [this._txt(l.nom), this._nb(l.salaireBase), `${l.joursContrat}/${l.joursMois}`, this._nb(l.salaireDu), l.prime ? this._nb(l.prime) : '-', l.ajustement ? this._nb(l.ajustement) : '-', l.retenue ? this._nb(l.retenue) : '-', this._nb(l.net), l.paye ? this._txt(`Payé ${l.moyenPaiement || ''}`) : 'À payer'];
      cols.forEach(([, x, al], i) => { doc.setFont(undefined, i === 7 ? 'bold' : 'normal'); doc.text(String(v[i]), x, y, { align: al }); });
      if (l.motif) { y += 4; doc.setFontSize(7.5); doc.setTextColor(100, 116, 139); doc.setFont(undefined, 'normal'); doc.text(this._txt(l.motif).slice(0, 110), 12, y); doc.setFontSize(9); }
      y += 7;
    });
    const tot = (k) => this._lignes.reduce((s, l) => s + (Number(l[k]) || 0), 0);
    doc.setDrawColor(15, 23, 42); doc.line(12, y - 3, 285, y - 3); doc.setFont(undefined, 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('TOTAL', 12, y + 2); doc.text(this._nb(tot('salaireDu')), 138, y + 2, { align: 'right' }); doc.text(this._nb(tot('prime')), 164, y + 2, { align: 'right' });
    doc.text(this._nb(tot('ajustement')), 190, y + 2, { align: 'right' }); doc.text(this._nb(tot('retenue')), 214, y + 2, { align: 'right' }); doc.text(this._nb(tot('net')), 244, y + 2, { align: 'right' });
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
    doc.text('Document de gestion interne. Ne remplace pas le bulletin de paie légal (cotisations CNPS et impôt sur salaire non calculés).', 12, 203);
    doc.save(`etat-de-paie-${this._mois}.pdf`);
  },

  async _pdfFiche(chauffeurId) {
    const l = this._lignes.find(x => x.chauffeurId === chauffeurId);
    if (!l) return;
    await LazyLibs.jspdf();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a5');
    const ent = ((Store.get('settings') || {}).entreprise) || {};
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, 148, 28, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.text('PILOTE', 12, 13);
    doc.setFontSize(10); doc.text('Fiche de rémunération', 12, 21);
    doc.setFontSize(9); doc.text(this._txt(this._libelleMois()), 136, 13, { align: 'right' });
    doc.setTextColor(100, 116, 139); doc.setFontSize(8);
    let y = 37;
    if (ent.nom) { doc.text(this._txt(ent.nom), 12, y); y += 4.5; }
    if (ent.adresse) { doc.text(this._txt(ent.adresse), 12, y); y += 4.5; }
    y += 3; doc.setTextColor(15, 23, 42); doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(this._txt(l.nom), 12, y); doc.setFont(undefined, 'normal');
    y += 5; doc.setFontSize(8.5); doc.setTextColor(100, 116, 139); doc.text('Chauffeur salarié', 12, y);
    y += 8; doc.setDrawColor(226, 232, 240); doc.line(12, y, 136, y); y += 8;
    const rang = (lib, val, gras, couleur) => { doc.setFontSize(9.5); doc.setTextColor(71, 85, 105); doc.setFont(undefined, 'normal'); doc.text(this._txt(lib), 12, y);
      doc.setTextColor(...(couleur || [15, 23, 42])); doc.setFont(undefined, gras ? 'bold' : 'normal'); doc.text(String(val), 136, y, { align: 'right' }); y += 7.5; };
    rang('Salaire mensuel', this._nb(l.salaireBase));
    rang(`Jours de contrat dans le mois`, `${l.joursContrat} / ${l.joursMois}`);
    rang('Jours avec courses Yango', String(l.joursRoules));
    rang('Salaire dû (prorata)', this._nb(l.salaireDu), true);
    rang('Prime mensuelle', l.prime ? '+ ' + this._nb(l.prime) : '-', false, l.prime ? [10, 157, 120] : null);
    if (l.ajustement) rang('Ajustement', (l.ajustement > 0 ? '+ ' : '- ') + this._nb(Math.abs(l.ajustement)));
    if (l.retenue) rang('Retenue', '- ' + this._nb(l.retenue), false, [185, 28, 28]);
    if (l.motif) { doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text(doc.splitTextToSize(this._txt('Motif : ' + l.motif), 124), 12, y); y += 8; }
    y += 1; doc.setFillColor(241, 245, 249); doc.roundedRect(12, y, 124, 14, 2, 2, 'F');
    doc.setFontSize(11); doc.setTextColor(15, 23, 42); doc.setFont(undefined, 'bold'); doc.text('NET À PAYER', 16, y + 9); doc.setFontSize(13); doc.text(this._nb(l.net), 132, y + 9.3, { align: 'right' });
    y += 22; doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(71, 85, 105);
    doc.text(this._txt(l.paye ? `Payé le ${Utils.formatDate(String(l.payeLe).slice(0, 10))} - ${l.moyenPaiement || ''}${l.referencePaiement ? ' - réf. ' + l.referencePaiement : ''}` : 'Paiement à venir'), 12, y);
    if (l.primeInfo) { y += 5; doc.text(doc.splitTextToSize(this._txt(l.primeInfo), 124), 12, y); }
    y = 176; doc.setDrawColor(203, 213, 225); doc.line(12, y, 62, y); doc.line(86, y, 136, y);
    doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text("Signature de l'employeur", 12, y + 4); doc.text('Signature du chauffeur', 86, y + 4);
    doc.setFontSize(7); doc.text(doc.splitTextToSize('Document de gestion interne. Ne remplace pas le bulletin de paie légal (cotisations CNPS et impôt sur salaire non calculés).', 124), 12, 196);
    doc.save(`fiche-${this._txt(l.nom).replace(/\s+/g, '-').toLowerCase()}-${l.mois}.pdf`);
  }
};
