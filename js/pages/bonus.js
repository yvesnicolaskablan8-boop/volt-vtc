/**
 * BonusPage — Bonus hebdomadaires : calcul, validation et versement.
 *
 * Le bonus recompense ce qui rapporte vraiment au parc :
 *  - location : la recette effectivement versee (pas le volume de courses,
 *    qui ne rapporte que 3 % au parc) ;
 *  - salarie : le CA hebdomadaire par paliers, car le salaire fixe supprime
 *    l'interet a produire.
 */
const BonusPage = {
  _lundi: null,
  _resultats: null,

  render() {
    if (!this._lundi) this._lundi = Utils.todayISO(Utils.lundiDeLaSemaine(new Date()));
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bind();
    this._calculer();
  },

  _decalerSemaine(n) {
    const d = new Date(this._lundi);
    d.setDate(d.getDate() + n * 7);
    this._lundi = Utils.todayISO(d);
    this.render();
  },

  _libelleSemaine() {
    const d = new Date(this._lundi);
    const fin = new Date(d);
    fin.setDate(fin.getDate() + 6);
    const f = (x) => x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `${f(d)} — ${f(fin)}`;
  },

  _template() {
    const lundiCourant = Utils.todayISO(Utils.lundiDeLaSemaine(new Date()));
    const estSemaineEnCours = this._lundi === lundiCourant;
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:gift-bold-duotone"></iconify-icon> Bonus hebdomadaires</h1>
      </div>

      <div class="card" style="margin-bottom:var(--space-lg);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn btn-sm btn-secondary" id="bn-prev"><iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon></button>
            <strong style="font-size:14px;">Semaine du ${this._libelleSemaine()}</strong>
            <button class="btn btn-sm btn-secondary" id="bn-next" ${estSemaineEnCours ? 'disabled' : ''}><iconify-icon icon="solar:alt-arrow-right-bold"></iconify-icon></button>
            ${estSemaineEnCours ? '<span class="d-tag orange" style="font-size:10px;">En cours</span>' : ''}
          </div>
          <button class="btn btn-sm btn-primary" id="bn-refresh"><iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Recalculer</button>
        </div>
        ${estSemaineEnCours ? '<div class="d-sub" style="margin-top:8px;">Semaine non terminee : les montants peuvent encore evoluer. Versez de preference le lundi suivant.</div>' : ''}
      </div>

      <div id="bn-content"><div class="d-sub" style="padding:20px 0;">Calcul en cours...</div></div>
    `;
  },

  _bind() {
    const p = document.getElementById('bn-prev');
    const n = document.getElementById('bn-next');
    const r = document.getElementById('bn-refresh');
    if (p) p.addEventListener('click', () => this._decalerSemaine(-1));
    if (n) n.addEventListener('click', () => this._decalerSemaine(1));
    if (r) r.addEventListener('click', () => this._calculer());
  },

  async _calculer() {
    const box = document.getElementById('bn-content');
    if (!box) return;

    const chauffeurs = Store.get('chauffeurs') || [];
    const planning = Store.get('planning') || [];
    const versements = Store.get('versements') || [];

    // Dettes en cours par chauffeur (une dette retient le bonus)
    const detteData = Utils.computeDebts({
      versements, chauffeurs, planning,
      absences: Store.get('absences') || [],
      contraventions: Store.get('contraventions') || []
    });
    const dettesParChauffeur = {};
    (detteData.detteListRecettes || []).forEach(d => { dettesParChauffeur[d.chauffeurId] = d.total; });

    // CA hebdomadaire : necessaire uniquement s'il y a des salaries
    const salaries = chauffeurs.filter(c => c.typeContrat === 'salarie' && c.statut !== 'inactif');
    const caParChauffeur = {};
    let avertissementCa = '';
    if (salaries.length > 0) {
      box.innerHTML = '<div class="d-sub" style="padding:20px 0;">Recuperation du CA Yango de la semaine...</div>';
      const rapport = await Store.getYangoCaReport(21, 10);
      if (rapport && !rapport.error && Array.isArray(rapport.chauffeurs)) {
        const jours = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(this._lundi);
          d.setDate(d.getDate() + i);
          jours.push(Utils.todayISO(d));
        }
        rapport.chauffeurs.forEach(r => {
          const ch = chauffeurs.find(c => c.yangoDriverId === r.yangoDriverId);
          if (!ch) return;
          caParChauffeur[ch.id] = (r.parJour || [])
            .filter(j => jours.includes(j.date))
            .reduce((s, j) => s + (j.ca || 0), 0);
        });
      } else {
        avertissementCa = "Le CA Yango n'a pas pu etre recupere : les bonus des chauffeurs salaries sont calcules sur un CA de 0.";
      }
    }

    const resultats = Utils.computeBonusSemaine({
      lundi: this._lundi, chauffeurs, planning, versements, caParChauffeur, dettesParChauffeur,
      regles: (Store.get('settings') || {}).bonus
    });
    this._resultats = resultats;

    const dejaVerses = (Store.get('bonus') || []).filter(b => b.semaine === this._lundi && b.statut === 'verse');
    const verseIds = new Set(dejaVerses.map(b => b.chauffeurId));

    const aVerser = resultats.filter(r => r.montant > 0 && !r.bloque && !verseIds.has(r.chauffeurId));
    const total = aVerser.reduce((s, r) => s + r.montant, 0);
    const totalVerse = dejaVerses.reduce((s, b) => s + (b.montant || 0), 0);

    const lignes = resultats.map(r => {
      const estVerse = verseIds.has(r.chauffeurId);
      const statut = estVerse
        ? '<span style="background:#dcfce7;color:#15803d;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;">VERSE</span>'
        : r.bloque
          ? '<span style="background:#fee2e2;color:#b91c1c;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;">RETENU</span>'
          : r.montant > 0
            ? '<span style="background:#fef3c7;color:#b45309;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;">A VERSER</span>'
            : '<span style="background:#f1f5f9;color:#64748b;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;">NON ACQUIS</span>';
      const detail = r.criteres.length > 0 ? r.criteres.join(' · ') : (r.raison || '—');
      return `<tr style="border-bottom:1px solid var(--border-color);">
        <td style="padding:9px 10px;font-weight:600;">${Utils.escHtml(r.nom)}
          <div style="font-size:10px;color:var(--text-muted);font-weight:500;">${r.typeContrat === 'salarie' ? 'Salarie' : 'Location'}</div></td>
        <td style="padding:9px 10px;font-size:var(--font-size-xs);color:var(--text-secondary);">${Utils.escHtml(detail)}</td>
        <td style="padding:9px 10px;text-align:right;font-weight:800;color:${r.montant > 0 && !r.bloque ? '#15803d' : 'var(--text-muted)'};">${r.montant > 0 ? Utils.formatCurrency(r.montant) : '—'}</td>
        <td style="padding:9px 10px;text-align:center;">${statut}</td>
      </tr>`;
    }).join('');

    box.innerHTML = `
      ${avertissementCa ? `<div style="padding:10px 12px;border-radius:8px;background:rgba(180,83,9,.08);border:1px solid rgba(180,83,9,.2);color:#b45309;font-size:var(--font-size-sm);margin-bottom:12px;">${avertissementCa}</div>` : ''}
      <div class="d-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px;">
        <div class="d-card"><div class="d-lbl">A verser</div><div class="d-val" style="color:#b45309;">${Utils.formatCurrency(total)}</div><div class="d-sub">${aVerser.length} chauffeur(s)</div></div>
        <div class="d-card"><div class="d-lbl">Deja verse</div><div class="d-val" style="color:#15803d;">${Utils.formatCurrency(totalVerse)}</div><div class="d-sub">${dejaVerses.length} chauffeur(s)</div></div>
        <div class="d-card"><div class="d-lbl">Retenus (dette)</div><div class="d-val" style="color:#b91c1c;">${resultats.filter(r => r.bloque).length}</div><div class="d-sub">bonus bloques</div></div>
      </div>

      ${aVerser.length > 0 ? `<button class="btn btn-primary" id="bn-verser" style="margin-bottom:14px;">
        <iconify-icon icon="solar:card-send-bold-duotone"></iconify-icon> Verser les ${aVerser.length} bonus (${Utils.formatCurrency(total)})
      </button>` : ''}

      <div class="card" style="padding:0;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);min-width:620px;">
          <thead><tr style="background:var(--bg-tertiary);">
            <th style="padding:9px 10px;text-align:left;font-size:var(--font-size-xs);color:var(--text-secondary);">Chauffeur</th>
            <th style="padding:9px 10px;text-align:left;font-size:var(--font-size-xs);color:var(--text-secondary);">Detail</th>
            <th style="padding:9px 10px;text-align:right;font-size:var(--font-size-xs);color:var(--text-secondary);">Bonus</th>
            <th style="padding:9px 10px;text-align:center;font-size:var(--font-size-xs);color:var(--text-secondary);">Statut</th>
          </tr></thead>
          <tbody>${lignes || '<tr><td colspan="4" style="padding:18px;text-align:center;color:var(--text-muted);">Aucun chauffeur programme cette semaine</td></tr>'}</tbody>
        </table>
      </div>
    `;

    const btn = document.getElementById('bn-verser');
    if (btn) btn.addEventListener('click', () => this._confirmerVersement(aVerser, total));
  },

  _confirmerVersement(aVerser, total) {
    Modal.open({
      title: '<iconify-icon icon="solar:card-send-bold-duotone" style="color:var(--pilote-blue)"></iconify-icon> Verser les bonus',
      body: `<div style="font-size:var(--font-size-sm);line-height:1.7;">
        <p><strong>${aVerser.length} bonus</strong> pour un total de <strong style="color:#15803d;">${Utils.formatCurrency(total)}</strong> — semaine du ${this._libelleSemaine()}.</p>
        <div style="margin:12px 0;">
          <label style="font-weight:600;display:block;margin-bottom:6px;">Moyen de versement</label>
          <select id="bn-moyen" class="form-control">
            <option value="yango">Recharge du solde Yango (automatique)</option>
            <option value="especes">Especes (remis en main propre)</option>
            <option value="recette">Deduit de la prochaine recette</option>
          </select>
        </div>
        <p style="color:var(--text-muted);font-size:var(--font-size-xs);">Chaque bonus est enregistre une seule fois par semaine : relancer cette action ne versera pas deux fois.</p>
      </div>`,
      footer: `<button class="btn btn-primary" id="bn-confirm">Confirmer le versement</button><button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>`
    });
    setTimeout(() => {
      const b = document.getElementById('bn-confirm');
      if (b) b.addEventListener('click', () => this._verser(aVerser));
    }, 60);
  },

  async _verser(aVerser) {
    const moyen = document.getElementById('bn-moyen')?.value || 'especes';
    const btn = document.getElementById('bn-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Versement en cours...'; }

    let ok = 0, echecs = [];
    for (const r of aVerser) {
      let reference = '';
      if (moyen === 'yango') {
        try {
          const res = await Store.yangoRecharge(r.chauffeurId, r.montant, `Bonus semaine du ${this._lundi}`);
          if (res && res.error) throw new Error(res.error);
          reference = (res && (res.id || res.transactionId)) || 'yango';
        } catch (e) {
          echecs.push(`${r.nom} : ${e.message}`);
          continue;
        }
      }
      Store.add('bonus', {
        id: `BON-${r.chauffeurId}-${this._lundi}`,
        chauffeurId: r.chauffeurId,
        semaine: this._lundi,
        typeContrat: r.typeContrat,
        montant: r.montant,
        criteres: r.criteres,
        base: r.base,
        statut: 'verse',
        moyenVersement: moyen,
        referenceVersement: reference,
        dateVersement: new Date().toISOString(),
        dateCreation: new Date().toISOString()
      });
      ok++;
    }

    Modal.close();
    if (echecs.length > 0) {
      Toast.warning(`${ok} bonus verses, ${echecs.length} en echec`);
      console.warn('[Bonus] echecs:', echecs);
    } else {
      Toast.success(`${ok} bonus verses`);
    }
    this._calculer();
  }
};
