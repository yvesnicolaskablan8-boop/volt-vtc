/**
 * BonusPage — Prime mensuelle des chauffeurs salariés.
 *
 * Modèle en vigueur depuis le 14/09/2026 (deux vagues par voiture) : chaque
 * chauffeur vise un CA par vague (réglage « Objectif CA par chauffeur et par
 * vague »). Sur le mois, son objectif vaut cet objectif × ses jours planifiés.
 * S'il l'atteint, il touche la prime mensuelle (réglage « Prime mensuelle »).
 * Les deux valeurs se règlent dans Paramètres › Versements.
 */
const BonusPage = {
  _mois: null,          // 'YYYY-MM'
  _resultats: null,

  render() {
    if (!this._mois) this._mois = new Date().toISOString().slice(0, 7);
    const container = document.getElementById('page-content');
    container.replaceChildren();
    container.insertAdjacentHTML('beforeend', this._template());
    this._bind();
    this._calculer();
  },

  _decalerMois(n) {
    const [a, m] = this._mois.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    this._mois = d.toISOString().slice(0, 7);
    this.render();
  },

  _libelleMois() {
    const [a, m] = this._mois.split('-').map(Number);
    const nom = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  },

  _objectifs() {
    return ((typeof Store !== 'undefined' && Store.get ? (Store.get('settings') || {}) : {}).objectifs) || {};
  },

  _template() {
    const moisCourant = new Date().toISOString().slice(0, 7);
    const estMoisEnCours = this._mois === moisCourant;
    const o = this._objectifs();
    const parVague = Number(o.caJourChauffeur) > 0 ? Number(o.caJourChauffeur) : 60000;
    const prime = Number(o.primeMensuelle) > 0 ? Number(o.primeMensuelle) : 100000;
    return `
      <style>
        .pr-regle{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;font-size:13px;color:var(--text-secondary);}
        .pr-regle b{color:var(--text-primary);font-weight:800;}
        .pr-tab{width:100%;border-collapse:collapse;font-size:var(--font-size-sm);min-width:720px;}
        .pr-tab th{padding:9px 10px;text-align:left;font-size:var(--font-size-xs);color:var(--text-secondary);background:var(--bg-tertiary);font-weight:700;}
        .pr-tab th.r,.pr-tab td.r{text-align:right;}
        .pr-tab th.c,.pr-tab td.c{text-align:center;}
        .pr-tab td{padding:10px;border-bottom:1px solid var(--border-color);vertical-align:middle;}
        .pr-nom{font-weight:700;color:var(--text-primary);}
        .pr-sous{font-size:10.5px;color:var(--text-muted);font-weight:500;margin-top:1px;}
        .pr-jauge{position:relative;height:8px;border-radius:999px;background:var(--bg-tertiary);overflow:hidden;min-width:110px;margin-top:5px;}
        .pr-jauge i{position:absolute;inset:0 auto 0 0;border-radius:999px;transition:width .8s cubic-bezier(.2,.8,.2,1);}
        .pr-jauge i.ok{background:linear-gradient(90deg,#0a9d78,#30d158);}
        .pr-jauge i.mid{background:linear-gradient(90deg,#ff9f0a,#ffd60a);}
        .pr-jauge i.ko{background:linear-gradient(90deg,#dc2626,#ff6b6b);}
        .pr-taux{font-weight:800;font-variant-numeric:tabular-nums;}
        .pr-taux.ok{color:#0a9d78;} .pr-taux.mid{color:#c96f00;} .pr-taux.ko{color:#dc2626;}
        .pr-badge{display:inline-block;font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px;white-space:nowrap;}
        .pr-badge.verse{background:rgba(48,209,88,.16);color:#0a9d78;}
        .pr-badge.averser{background:rgba(255,159,10,.18);color:#b45309;}
        .pr-badge.retenu{background:rgba(239,68,68,.14);color:#b91c1c;}
        .pr-badge.non{background:var(--bg-tertiary);color:var(--text-muted);}
      </style>
      <div class="page-header">
        <h1><iconify-icon icon="solar:gift-bold-duotone"></iconify-icon> Prime mensuelle</h1>
      </div>

      <div class="card" style="margin-bottom:var(--space-lg);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn btn-sm btn-secondary" id="bn-prev"><iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon></button>
            <strong style="font-size:14px;">${this._libelleMois()}</strong>
            <button class="btn btn-sm btn-secondary" id="bn-next" ${estMoisEnCours ? 'disabled' : ''}><iconify-icon icon="solar:alt-arrow-right-bold"></iconify-icon></button>
            ${estMoisEnCours ? '<span class="d-tag orange" style="font-size:10px;">En cours</span>' : ''}
          </div>
          <button class="btn btn-sm btn-primary" id="bn-refresh"><iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Recalculer</button>
        </div>
        <div class="pr-regle" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color);">
          <span>Objectif par vague <b>${Utils.formatCurrency(parVague)}</b></span>
          <span>Prime si objectif atteint <b>${Utils.formatCurrency(prime)}</b></span>
          <span>Objectif du mois = objectif par vague × jours planifiés</span>
          <a href="#/parametres" style="color:var(--pilote-blue);font-weight:700;">Modifier</a>
        </div>
        ${estMoisEnCours ? '<div class="d-sub" style="margin-top:8px;">Mois en cours : les montants évoluent encore. Versez de préférence après la clôture du mois.</div>' : ''}
      </div>

      <div id="bn-content"><div class="d-sub" style="padding:20px 0;">Calcul en cours…</div></div>
    `;
  },

  _bind() {
    const p = document.getElementById('bn-prev');
    const n = document.getElementById('bn-next');
    const r = document.getElementById('bn-refresh');
    if (p) p.addEventListener('click', () => this._decalerMois(-1));
    if (n) n.addEventListener('click', () => this._decalerMois(1));
    if (r) r.addEventListener('click', () => this._calculer());
  },

  _calculer() {
    const box = document.getElementById('bn-content');
    if (!box) return;

    const chauffeurs = Store.get('chauffeurs') || [];
    const planning = Store.get('planning') || [];

    // Une dette en cours retient la prime : le chauffeur doit être à jour.
    const detteData = Utils.computeDebts({
      versements: Store.get('versements') || [], chauffeurs, planning,
      absences: Store.get('absences') || [],
      contraventions: Store.get('contraventions') || [],
      caJour: Store.get('caJour') || [],
      charges: Store.get('charges') || []
    });
    const dettesParChauffeur = {};
    (detteData.detteListRecettes || []).forEach(d => { dettesParChauffeur[d.chauffeurId] = d.total; });

    const resultats = Utils.computePrimeMois({
      mois: this._mois, chauffeurs, planning,
      caJour: Store.get('caJour') || [],
      objectifs: this._objectifs(),
      dettesParChauffeur
    });
    this._resultats = resultats;

    const dejaVersees = (Store.get('bonus') || []).filter(b => b.semaine === this._mois && b.statut === 'verse');
    const verseIds = new Set(dejaVersees.map(b => b.chauffeurId));

    const aVerser = resultats.filter(r => r.montant > 0 && !r.bloque && !verseIds.has(r.chauffeurId));
    const total = aVerser.reduce((s, r) => s + r.montant, 0);
    const totalVerse = dejaVersees.reduce((s, b) => s + (b.montant || 0), 0);
    const cls = (t) => t >= 100 ? 'ok' : t >= 75 ? 'mid' : 'ko';

    const lignes = resultats.map(r => {
      const estVerse = verseIds.has(r.chauffeurId);
      const badge = estVerse ? '<span class="pr-badge verse">VERSÉE</span>'
        : r.bloque ? '<span class="pr-badge retenu">RETENUE</span>'
        : r.montant > 0 ? '<span class="pr-badge averser">À VERSER</span>'
        : '<span class="pr-badge non">NON ACQUISE</span>';
      const c = cls(r.taux);
      return `<tr>
        <td><div class="pr-nom">${Utils.escHtml(r.nom)}</div><div class="pr-sous">${r.joursPlanifies} jour(s) planifié(s) · ${r.joursRoules} roulé(s)</div></td>
        <td class="r">${Utils.formatCurrency(r.caMois)}</td>
        <td class="r">${Utils.formatCurrency(r.objectifMois)}</td>
        <td><div class="pr-taux ${c}">${r.taux} %</div><div class="pr-jauge"><i class="${c}" data-w="${Math.min(100, r.taux)}"></i></div></td>
        <td style="font-size:var(--font-size-xs);color:var(--text-secondary);">${Utils.escHtml(r.raison || (r.acquise ? 'Objectif atteint' : '—'))}${r.fragile ? `<div style="margin-top:4px;color:#b45309;font-weight:700;">⚠ ${r.joursRoules} jours roulés pour ${r.joursPlanifies} planifiés : sur les jours roulés, l'objectif serait de ${Utils.formatCurrency(r.objectifSiRoules)} et ne serait pas atteint.</div>` : ''}</td>
        <td class="r" style="font-weight:800;color:${r.montant > 0 && !r.bloque ? '#0a9d78' : 'var(--text-muted)'};">${r.montant > 0 ? Utils.formatCurrency(r.montant) : '—'}</td>
        <td class="c">${badge}</td>
      </tr>`;
    }).join('');

    box.replaceChildren();
    box.insertAdjacentHTML('beforeend', `
      <div class="d-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px;">
        <div class="d-card"><div class="d-lbl">À verser</div><div class="d-val" style="color:#b45309;">${Utils.formatCurrency(total)}</div><div class="d-sub">${aVerser.length} chauffeur(s)</div></div>
        <div class="d-card"><div class="d-lbl">Déjà versées</div><div class="d-val" style="color:#0a9d78;">${Utils.formatCurrency(totalVerse)}</div><div class="d-sub">${dejaVersees.length} chauffeur(s)</div></div>
        <div class="d-card"><div class="d-lbl">Objectif atteint</div><div class="d-val">${resultats.filter(r => r.acquise).length} / ${resultats.length}</div><div class="d-sub">chauffeurs salariés</div></div>
        <div class="d-card"><div class="d-lbl">Retenues (dette)</div><div class="d-val" style="color:#b91c1c;">${resultats.filter(r => r.bloque).length}</div><div class="d-sub">primes bloquées</div></div>
      </div>

      ${resultats.some(r => r.fragile) ? `<div class="card" style="margin-bottom:14px;padding:12px 16px;border-left:4px solid #E8930C;background:rgba(232,147,12,.08);font-size:13px;line-height:1.55;">
        <b>${resultats.filter(r => r.fragile).length} prime(s) acquise(s) grâce à un planning incomplet.</b> L'objectif du mois est calculé sur les jours <b>planifiés</b>, alors que tout le CA compte, y compris celui des jours roulés hors planning. Complétez le planning des jours réellement travaillés, ou décidez d'une règle (objectif sur les jours roulés, nombre minimal de jours) avant de verser.
      </div>` : ''}
      ${aVerser.length > 0 ? `<button class="btn btn-primary" id="bn-verser" style="margin-bottom:14px;">
        <iconify-icon icon="solar:card-send-bold-duotone"></iconify-icon> Verser les ${aVerser.length} prime(s) (${Utils.formatCurrency(total)})
      </button>` : ''}

      <div class="card" style="padding:0;overflow-x:auto;">
        <table class="pr-tab">
          <thead><tr>
            <th>Chauffeur</th><th class="r">CA du mois</th><th class="r">Objectif</th><th>Atteinte</th>
            <th>Détail</th><th class="r">Prime</th><th class="c">Statut</th>
          </tr></thead>
          <tbody>${lignes || '<tr><td colspan="7" style="padding:18px;text-align:center;color:var(--text-muted);">Aucun chauffeur salarié actif</td></tr>'}</tbody>
        </table>
      </div>
    `);

    requestAnimationFrame(() => {
      box.querySelectorAll('.pr-jauge i[data-w]').forEach(b => { b.style.width = b.getAttribute('data-w') + '%'; });
    });

    const btn = document.getElementById('bn-verser');
    if (btn) btn.addEventListener('click', () => this._confirmerVersement(aVerser, total));
  },

  _confirmerVersement(aVerser, total) {
    Modal.open({
      title: '<iconify-icon icon="solar:card-send-bold-duotone" style="color:var(--pilote-blue)"></iconify-icon> Verser les primes',
      body: `<div style="font-size:var(--font-size-sm);line-height:1.7;">
        <p><strong>${aVerser.length} prime(s)</strong> pour un total de <strong style="color:#0a9d78;">${Utils.formatCurrency(total)}</strong> — ${this._libelleMois()}.</p>
        <div style="margin:12px 0;">
          <label style="font-weight:600;display:block;margin-bottom:6px;">Moyen de versement</label>
          <select id="bn-moyen" class="form-control">
            <option value="especes">Espèces (remis en main propre)</option>
            <option value="salaire">Ajouté au salaire du mois</option>
            <option value="yango">Recharge du solde Yango (automatique)</option>
          </select>
        </div>
        <p style="color:var(--text-muted);font-size:var(--font-size-xs);">Chaque prime n'est enregistrée qu'une fois par mois : relancer cette action ne versera pas deux fois.</p>
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
    if (btn) { btn.disabled = true; btn.textContent = 'Versement en cours…'; }

    let ok = 0; const echecs = [];
    for (const r of aVerser) {
      let reference = '';
      if (moyen === 'yango') {
        try {
          const res = await Store.yangoRecharge(r.chauffeurId, r.montant, `Prime ${this._mois}`);
          if (res && res.error) throw new Error(res.error);
          reference = (res && (res.id || res.transactionId)) || 'yango';
        } catch (e) {
          echecs.push(`${r.nom} : ${e.message}`);
          continue;
        }
      }
      Store.add('bonus', {
        id: `PRIME-${r.chauffeurId}-${this._mois}`,
        chauffeurId: r.chauffeurId,
        semaine: this._mois,               // clé de période (mois YYYY-MM)
        typeContrat: 'salarie',
        montant: r.montant,
        criteres: [`CA ${Utils.formatCurrency(r.caMois)} sur un objectif de ${Utils.formatCurrency(r.objectifMois)} (${r.joursPlanifies} jours × ${Utils.formatCurrency(r.objParVague)})`],
        base: { caMois: r.caMois, objectifMois: r.objectifMois, joursPlanifies: r.joursPlanifies, taux: r.taux },
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
      Toast.warning(`${ok} prime(s) versée(s), ${echecs.length} en échec`);
      console.warn('[Prime] échecs :', echecs);
    } else {
      Toast.success(`${ok} prime(s) versée(s)`);
    }
    this._calculer();
  }
};
