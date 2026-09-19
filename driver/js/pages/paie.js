/**
 * PaiePage — « Ma paie » : ce que je vais toucher ce mois-ci, et ce qui m'a déjà
 * été payé. Écran volontairement simple (gros chiffres, peu de texte).
 * Le bureau fait foi : dès qu'il a enregistré une ligne pour le mois, ce sont
 * ses montants qui s'affichent. Tout texte venant de la base est échappé.
 */
const PaiePage = {
  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _f(n) { return Math.round(Number(n) || 0).toLocaleString('fr-FR') + ' F'; },
  _nomMois(mois) {
    const [a, m] = String(mois).split('-').map(Number);
    const t = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  },
  _moyen(m) { return ({ wave: 'Wave', virement: 'virement', especes: 'espèces', orange_money: 'Orange Money', autre: 'autre moyen' })[m] || m || ''; },

  async render(container) {
    container.replaceChildren();
    container.insertAdjacentHTML('beforeend', '<div style="padding:8px 0"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card" style="height:90px"></div></div>');
    let d = null;
    try { d = await DriverStore.getPaie(); } catch (e) { d = null; }
    container.replaceChildren();
    if (!d || d.erreur) {
      container.insertAdjacentHTML('beforeend', '<div style="text-align:center;padding:2rem;color:#94a3b8;">Impossible de charger votre paie. Réessayez dans un instant.</div>');
      return;
    }
    if (!d.estSalarie) {
      container.insertAdjacentHTML('beforeend', '<div style="text-align:center;padding:2rem;color:#94a3b8;">Cette page concerne les chauffeurs salariés.</div>');
      return;
    }

    const l = d.ligne;                                   // ligne enregistrée par le bureau (ou null)
    const paye = !!(l && l.statut === 'paye');
    const salaire = l ? Number(l.salaireDu) || 0 : d.salaireDu;
    const primeBureau = l ? Number(l.prime) || 0 : null;
    const primeHorsSalaire = !!(d.primeVersee && d.primeVersee.moyenVersement !== 'salaire');
    const prime = primeBureau !== null ? primeBureau : (primeHorsSalaire ? 0 : (d.primeAcquise ? d.montantPrime : 0));
    const retenue = l ? Number(l.retenue) || 0 : 0;
    const ajustement = l ? Number(l.ajustement) || 0 : 0;
    const net = l ? Number(l.net) || 0 : (salaire + prime);
    const prorata = d.joursContrat < d.joursMois;

    const rang = (icone, fond, couleur, titre, sous, montant, couleurMontant) => `
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:1.1rem;background:var(--bg-card, #fff);border:1px solid var(--glass-border, #eef2f7);margin-bottom:10px;">
        <div style="width:46px;height:46px;border-radius:13px;background:${fond};color:${couleur};display:flex;align-items:center;justify-content:center;flex-shrink:0"><iconify-icon icon="${icone}" style="font-size:1.5rem"></iconify-icon></div>
        <div style="flex:1;min-width:0"><div style="font-size:1rem;font-weight:800;color:var(--text-primary)">${titre}</div>${sous ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;line-height:1.35">${sous}</div>` : ''}</div>
        <div style="font-size:1.05rem;font-weight:900;white-space:nowrap;color:${couleurMontant || 'var(--text-primary)'}">${montant}</div>
      </div>`;

    // Prime : où j'en suis
    let sousPrime;
    if (!d.primeActive) sousPrime = 'La prime n’est pas active en ce moment.';
    else if (primeHorsSalaire) sousPrime = `Déjà remise (${this._esc(this._moyen(d.primeVersee.moyenVersement) || 'à part')}) : ${this._f(d.primeVersee.montant)}.`;
    else if (d.joursPlanifies === 0) sousPrime = 'Aucun jour au planning ce mois-ci pour l’instant.';
    else if (d.primeAcquise) sousPrime = `Objectif du mois atteint (${d.tauxPrime} %). Versée avec le salaire si vous n’avez aucune dette.`;
    else sousPrime = `${d.tauxPrime} % de l’objectif du mois. Encore ${this._f(Math.max(0, d.objectifMois - d.caMois))} pour la décrocher.`;
    const barre = (d.primeActive && d.joursPlanifies > 0 && !primeHorsSalaire)
      ? `<div style="height:8px;border-radius:99px;background:#e5e7eb;overflow:hidden;margin:-2px 16px 12px"><div style="height:100%;width:${Math.min(100, d.tauxPrime)}%;border-radius:99px;background:${d.primeAcquise ? '#30d158' : '#ffb340'}"></div></div>` : '';

    const historique = (d.historique || []).map(h => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 4px;border-bottom:1px solid var(--glass-border, #eef2f7);">
        <div><div style="font-weight:800;color:var(--text-primary)">${this._esc(this._nomMois(h.mois))}</div>
          <div style="font-size:0.78rem;color:var(--text-secondary)">Payé${h.payeLe ? ' le ' + new Date(h.payeLe).toLocaleDateString('fr-FR') : ''}${h.moyenPaiement ? ' · ' + this._esc(this._moyen(h.moyenPaiement)) : ''}</div></div>
        <div style="font-weight:900;color:#0a9d78">${this._f(h.net)}</div>
      </div>`).join('');

    container.insertAdjacentHTML('beforeend', `
      <div style="margin:4px 0 14px">
        <div style="font-size:0.75rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px">${this._esc(this._nomMois(d.mois))}</div>
        <div style="font-size:1.45rem;font-weight:900;color:var(--text-primary);margin-top:2px">Ma paie</div>
      </div>

      <div style="padding:20px;border-radius:1.4rem;background:linear-gradient(135deg,#0b1f3a,#123a6b);color:#fff;margin-bottom:14px;box-shadow:0 14px 30px rgba(11,31,58,.25)">
        <div style="font-size:0.72rem;letter-spacing:.14em;text-transform:uppercase;opacity:.75;font-weight:700">${paye ? 'Payé' : 'À recevoir ce mois-ci'}</div>
        <div style="font-size:2.1rem;font-weight:900;line-height:1.1;margin-top:6px">${this._f(net)}</div>
        <div style="font-size:0.85rem;opacity:.85;margin-top:8px;line-height:1.4">${paye
          ? `Payé le ${l.payeLe ? new Date(l.payeLe).toLocaleDateString('fr-FR') : ''}${l.moyenPaiement ? ' par ' + this._esc(this._moyen(l.moyenPaiement)) : ''}${l.referencePaiement ? ' · réf. ' + this._esc(l.referencePaiement) : ''}.`
          : 'Estimation. Le montant final est confirmé par le bureau à la fin du mois.'}</div>
      </div>

      ${rang('solar:wallet-money-bold-duotone', '#eff6ff', '#1e40af', 'Salaire fixe',
        prorata ? `${d.joursContrat} jours de contrat sur ${d.joursMois} ce mois-ci (salaire complet : ${this._f(d.salaireBase)}).` : 'Mois complet.', this._f(salaire))}
      ${rang('solar:gift-bold-duotone', '#ecfdf5', '#047857', `Prime du mois`, sousPrime, prime > 0 ? '+ ' + this._f(prime) : '—', prime > 0 ? '#0a9d78' : 'var(--text-secondary)')}
      ${barre}
      ${ajustement ? rang('solar:pen-bold-duotone', '#f1f5f9', '#334155', 'Ajustement', this._esc(l.motif || ''), (ajustement > 0 ? '+ ' : '− ') + this._f(Math.abs(ajustement))) : ''}
      ${retenue ? rang('solar:minus-circle-bold-duotone', '#fee2e2', '#b91c1c', 'Retenue', this._esc(l.motif || ''), '− ' + this._f(retenue), '#b91c1c') : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0 16px">
        <div style="padding:14px;border-radius:1.1rem;background:var(--bg-card,#fff);border:1px solid var(--glass-border,#eef2f7)"><div style="font-size:0.75rem;color:var(--text-secondary);font-weight:700">Jours roulés</div><div style="font-size:1.3rem;font-weight:900;color:var(--text-primary);margin-top:2px">${d.joursRoules}</div></div>
        <div style="padding:14px;border-radius:1.1rem;background:var(--bg-card,#fff);border:1px solid var(--glass-border,#eef2f7)"><div style="font-size:0.75rem;color:var(--text-secondary);font-weight:700">Recette du mois</div><div style="font-size:1.3rem;font-weight:900;color:var(--text-primary);margin-top:2px">${this._f(d.caMois)}</div></div>
      </div>

      ${historique ? `<div style="font-size:0.8rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin:6px 0 4px">Mois précédents</div>${historique}` : ''}
      <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.5;margin:16px 2px 8px">Une question sur votre paie ? Appelez le bureau depuis « Autres services ».</div>
    `);
  }
};
