/**
 * DettesPage — Mes dettes (recettes + contraventions)
 */
const DettesPage = {
  _data: null,

  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
      this._data = await DriverStore.getDettes();
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;padding:2rem;color:#ef4444;">Erreur de chargement</div>';
      return;
    }

    if (!this._data) {
      container.innerHTML = '<div style="text-align:center;padding:2rem;color:#94a3b8;">Impossible de charger les dettes</div>';
      return;
    }

    const d = this._data;

    container.innerHTML = `
      <!-- Header -->
      <div style="margin-bottom:1.5rem;">
        <div style="font-size:0.75rem;color:#94a3b8;font-weight:500;text-transform:uppercase;letter-spacing:1px;">Suivi financier</div>
        <div style="font-size:1.5rem;font-weight:800;margin-top:4px;display:flex;align-items:center;gap:8px;">
          <iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#f59e0b;font-size:1.3rem;"></iconify-icon> Mes dettes
        </div>
      </div>

      <!-- KPI Cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:1.5rem;">
        <div style="padding:16px;border-radius:16px;background:linear-gradient(135deg,#f97316,#fb923c);color:white;">
          <div style="font-size:0.7rem;opacity:0.8;font-weight:600;">Dettes recettes</div>
          <div style="font-size:1.4rem;font-weight:800;margin-top:4px;">${this._fmt(d.totalRecettes)}</div>
          <div style="font-size:0.65rem;opacity:0.7;margin-top:2px;">${d.recettes.length} impaye${d.recettes.length > 1 ? 's' : ''}</div>
        </div>
        <div style="padding:16px;border-radius:16px;background:linear-gradient(135deg,#dc2626,#ef4444);color:white;">
          <div style="font-size:0.7rem;opacity:0.8;font-weight:600;">Dettes contraventions</div>
          <div style="font-size:1.4rem;font-weight:800;margin-top:4px;">${this._fmt(d.totalContraventions)}</div>
          <div style="font-size:0.65rem;opacity:0.7;margin-top:2px;">${d.contraventions.length} contravention${d.contraventions.length > 1 ? 's' : ''}</div>
        </div>
      </div>

      ${d.total > 0 ? `
        <div style="padding:12px 16px;border-radius:12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:0.75rem;color:#64748b;font-weight:600;">Total a regler</div>
            <div style="font-size:1.2rem;font-weight:800;color:#ef4444;">${this._fmt(d.total)}</div>
          </div>
          <button onclick="DettesPage._payerTout()" style="padding:10px 20px;border-radius:12px;background:#22c55e;color:white;border:none;font-weight:700;font-size:0.8rem;cursor:pointer;display:flex;align-items:center;gap:6px;">
            <iconify-icon icon="solar:hand-money-bold-duotone" style="font-size:1.1rem;"></iconify-icon> Tout regler
          </button>
        </div>
      ` : `
        <div style="text-align:center;padding:2rem;color:#22c55e;">
          <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:3rem;display:block;margin-bottom:8px;"></iconify-icon>
          <div style="font-weight:700;font-size:0.95rem;">Aucune dette</div>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">Vous etes a jour !</div>
        </div>
      `}

      <!-- Dettes recettes -->
      ${d.recettes.length > 0 ? `
        <div style="margin-bottom:1.5rem;">
          <div style="font-size:0.85rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#f59e0b;"></iconify-icon> Recettes impayees (${d.recettes.length})
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${d.recettes.map(r => this._renderItem(r, '#f59e0b')).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Dettes contraventions -->
      ${d.contraventions.length > 0 ? `
        <div style="margin-bottom:1.5rem;">
          <div style="font-size:0.85rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <iconify-icon icon="solar:shield-warning-bold-duotone" style="color:#ef4444;"></iconify-icon> Contraventions impayees (${d.contraventions.length})
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${d.contraventions.map(r => this._renderItem(r, '#ef4444')).join('')}
          </div>
        </div>
      ` : ''}
    `;
  },

  _renderItem(item, color) {
    const dateStr = item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const badge = item.implicit
      ? '<span style="font-size:8px;padding:1px 5px;border-radius:4px;background:rgba(245,158,11,0.1);color:#f59e0b;font-weight:700;">IMPAYE</span>'
      : item.type === 'contravention'
        ? '<span style="font-size:8px;padding:1px 5px;border-radius:4px;background:rgba(239,68,68,0.1);color:#ef4444;font-weight:700;">CONTRAVENTION</span>'
        : '';

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-radius:12px;background:var(--bg-secondary, white);border:1px solid var(--border-color, #e2e8f0);">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.8rem;font-weight:600;">${dateStr}</span>
            ${badge}
          </div>
          <div style="font-size:0.65rem;color:#94a3b8;margin-top:2px;">${item.label || ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <div style="font-size:0.85rem;font-weight:700;color:${color};">${this._fmt(item.manquant)}</div>
          <button onclick="DettesPage._payer('${item.id}','${item.date}',${item.manquant},${item.implicit || false},'${item.type}')" style="width:34px;height:34px;border-radius:10px;background:#22c55e;color:white;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;" title="Regler cette dette">
            <iconify-icon icon="solar:hand-money-bold-duotone" style="font-size:1rem;"></iconify-icon>
          </button>
        </div>
      </div>
    `;
  },

  _fmt(n) {
    return (n || 0).toLocaleString('fr-FR') + ' F';
  },

  async _payer(id, date, montant, isImplicit, type) {
    const dateStr = date ? new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
    const typeLabel = type === 'contravention' ? 'contravention' : 'recette';

    // Confirmation simple
    const confirmed = confirm(`Regler la dette ${typeLabel} du ${dateStr} de ${this._fmt(montant)} ?`);
    if (!confirmed) return;

    try {
      const res = await DriverStore.createVersement({
        date,
        montantBrut: montant,
        commentaire: `Reglement dette ${typeLabel} du ${dateStr}`,
        typeVersement: 'reglement_dette',
        isDettePayment: true,
        detteId: isImplicit ? null : id,
        isImplicit
      });

      if (res && !res.error) {
        if (typeof DriverToast !== 'undefined') DriverToast.show(`Dette reglee : ${this._fmt(montant)}`, 'success');
        // Re-render
        const container = document.getElementById('app-content');
        if (container) this.render(container);
      } else {
        if (typeof DriverToast !== 'undefined') DriverToast.show(res?.error || 'Erreur', 'error');
      }
    } catch (err) {
      console.error('Erreur paiement dette:', err);
      if (typeof DriverToast !== 'undefined') DriverToast.show('Erreur reseau', 'error');
    }
  },

  async _payerTout() {
    if (!this._data || this._data.total <= 0) return;
    const confirmed = confirm(`Regler toutes vos dettes pour un total de ${this._fmt(this._data.total)} ?`);
    if (!confirmed) return;

    try {
      const allItems = [...this._data.recettes, ...this._data.contraventions];
      let nbOk = 0;
      for (const item of allItems) {
        const res = await DriverStore.createVersement({
          date: item.date,
          montantBrut: item.manquant,
          commentaire: `Reglement dette ${item.type} du ${item.date}`,
          typeVersement: 'reglement_dette',
          isDettePayment: true,
          detteId: item.implicit ? null : item.id,
          isImplicit: item.implicit || false
        });
        if (res && !res.error) nbOk++;
      }
      if (typeof DriverToast !== 'undefined') DriverToast.show(`${nbOk} dette(s) reglee(s)`, 'success');
      const container = document.getElementById('app-content');
      if (container) this.render(container);
    } catch (err) {
      console.error('Erreur paiement global:', err);
      if (typeof DriverToast !== 'undefined') DriverToast.show('Erreur', 'error');
    }
  },

  destroy() {}
};
