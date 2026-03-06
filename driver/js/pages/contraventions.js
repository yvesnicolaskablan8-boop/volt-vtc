/**
 * ContraventionsDriverPage — Mes contraventions (PWA chauffeur)
 */
const ContraventionsDriverPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    this._checkWaveReturn();

    const contraventions = await DriverStore.getContraventions();

    if (!contraventions) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger les contraventions</p></div>';
      return;
    }

    const impayees = contraventions.filter(c => c.statut === 'impayee');
    const contestees = contraventions.filter(c => c.statut === 'contestee');
    const payees = contraventions.filter(c => c.statut === 'payee');
    const totalDu = impayees.reduce((s, c) => s + (c.montant || 0), 0);

    const typeLabels = {
      exces_vitesse: 'Exces de vitesse',
      stationnement: 'Stationnement',
      feu_rouge: 'Feu rouge',
      documents: 'Documents',
      telephone: 'Telephone',
      autre: 'Autre'
    };

    const typeIcons = {
      exces_vitesse: 'solar:speedometer-bold',
      stationnement: 'solar:parking-bold',
      feu_rouge: 'solar:traffic-light-bold',
      documents: 'solar:document-bold',
      telephone: 'solar:phone-calling-bold',
      autre: 'solar:warning-circle-bold'
    };

    // Carte resume
    let resumeHTML = '';
    if (impayees.length > 0) {
      resumeHTML = `
        <div style="border-radius:1.5rem;background:linear-gradient(135deg,#ef4444,#dc2626);padding:1.5rem;color:white;margin-bottom:1rem;box-shadow:0 8px 24px rgba(239,68,68,0.25)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:0.75rem;opacity:0.9">
            <iconify-icon icon="solar:danger-triangle-bold" style="font-size:1.2rem"></iconify-icon>
            <span style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Contraventions impayees</span>
          </div>
          <div style="font-size:2rem;font-weight:900;margin-bottom:0.5rem">${this._formatCurrency(totalDu)}</div>
          <div style="font-size:0.85rem;opacity:0.85">${impayees.length} contravention${impayees.length > 1 ? 's' : ''} en attente de paiement</div>
        </div>
      `;
    } else if (contraventions.length === 0) {
      resumeHTML = `
        <div style="border-radius:1.5rem;background:linear-gradient(135deg,#22c55e,#16a34a);padding:1.5rem;color:white;margin-bottom:1rem;box-shadow:0 8px 24px rgba(34,197,94,0.25)">
          <div style="display:flex;align-items:center;gap:12px">
            <iconify-icon icon="solar:check-circle-bold" style="font-size:2.5rem"></iconify-icon>
            <div>
              <div style="font-size:1.1rem;font-weight:900">Aucune contravention</div>
              <div style="font-size:0.82rem;opacity:0.85;margin-top:2px">Continuez a respecter le code de la route !</div>
            </div>
          </div>
        </div>
      `;
    } else {
      resumeHTML = `
        <div style="border-radius:1.5rem;background:linear-gradient(135deg,#22c55e,#16a34a);padding:1.5rem;color:white;margin-bottom:1rem;box-shadow:0 8px 24px rgba(34,197,94,0.25)">
          <div style="display:flex;align-items:center;gap:12px">
            <iconify-icon icon="solar:check-circle-bold" style="font-size:2.5rem"></iconify-icon>
            <div>
              <div style="font-size:1.1rem;font-weight:900">Tout est regle</div>
              <div style="font-size:0.82rem;opacity:0.85;margin-top:2px">${payees.length} contravention${payees.length > 1 ? 's' : ''} payee${payees.length > 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>
      `;
    }

    // Render items
    const renderItem = (c) => {
      const statusColors = {
        impayee: { bg: 'rgba(239,68,68,0.08)', color: '#ef4444', label: 'Impayee' },
        payee: { bg: 'rgba(34,197,94,0.08)', color: '#22c55e', label: 'Payee' },
        contestee: { bg: 'rgba(245,158,11,0.08)', color: '#f59e0b', label: 'Contestee' }
      };
      const sc = statusColors[c.statut] || statusColors.impayee;
      const date = c.date ? new Date(c.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '--';
      const icon = typeIcons[c.type] || 'solar:warning-circle-bold';

      return `
        <div style="display:flex;align-items:flex-start;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:white;border:1px solid #f1f5f9;box-shadow:0 1px 4px rgba(0,0,0,0.03);margin-bottom:10px">
          <div style="width:44px;height:44px;border-radius:1rem;background:${sc.bg};color:${sc.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <iconify-icon icon="${icon}" style="font-size:1.3rem"></iconify-icon>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:0.9rem;font-weight:800;color:#0f172a">${typeLabels[c.type] || c.type}</span>
              <span style="font-size:0.9rem;font-weight:800;color:${sc.color}">${this._formatCurrency(c.montant || 0)}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:0.72rem;color:#94a3b8;font-weight:500">${date}${c.lieu ? ' \u00b7 ' + c.lieu : ''}</span>
              <span style="padding:2px 10px;border-radius:2rem;background:${sc.bg};color:${sc.color};font-size:0.65rem;font-weight:700">${sc.label}</span>${c.moyenPaiement === 'wave' ? ' <span style="padding:2px 8px;border-radius:2rem;background:rgba(13,110,253,0.08);color:#0D6EFD;font-size:0.6rem;font-weight:700"><iconify-icon icon="solar:wallet-money-bold" style="font-size:0.65rem;vertical-align:middle"></iconify-icon> Wave</span>' : ''}
            </div>
            ${c.description ? `<div style="font-size:0.75rem;color:#64748b;margin-top:2px">${c.description}</div>` : ''}
            ${c.commentaire ? `<div style="font-size:0.72rem;color:#3b82f6;margin-top:4px;font-style:italic"><iconify-icon icon="solar:chat-round-dots-bold" style="font-size:0.75rem;vertical-align:middle"></iconify-icon> ${c.commentaire}</div>` : ''}
            ${c.motifContestation ? `<div style="font-size:0.72rem;color:#f59e0b;margin-top:4px;font-style:italic"><iconify-icon icon="solar:chat-round-line-bold" style="font-size:0.75rem;vertical-align:middle"></iconify-icon> Motif: ${c.motifContestation}</div>` : ''}
            ${c.statut === 'impayee' ? `
              <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
                <button onclick="ContraventionsDriverPage._payWave('${c.id}')" style="padding:6px 16px;border-radius:2rem;border:none;background:linear-gradient(135deg,#1B98F5,#0D6EFD);color:white;font-size:0.72rem;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 8px rgba(13,110,253,0.2)">
                  <iconify-icon icon="solar:wallet-money-bold" style="font-size:0.8rem;vertical-align:middle"></iconify-icon> Payer via Wave
                </button>
                <button onclick="ContraventionsDriverPage._contester('${c.id}')" style="padding:6px 16px;border-radius:2rem;border:1.5px solid #f59e0b;background:rgba(245,158,11,0.06);color:#f59e0b;font-size:0.72rem;font-weight:700;cursor:pointer;font-family:inherit">
                  <iconify-icon icon="solar:chat-round-dots-bold" style="font-size:0.8rem;vertical-align:middle"></iconify-icon> Contester
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    };

    // Impayees + Contestees
    const activeItems = [...impayees, ...contestees];
    const activeHTML = activeItems.length > 0
      ? activeItems.map(c => renderItem(c)).join('')
      : '';

    // Payees (section pliable)
    let payeesHTML = '';
    if (payees.length > 0) {
      payeesHTML = `
        <div style="margin-top:1.5rem">
          <div onclick="ContraventionsDriverPage._togglePayees()" style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;cursor:pointer">
            <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8">Payees (${payees.length})</span>
            <iconify-icon id="payees-chevron" icon="solar:alt-arrow-down-bold" style="font-size:1rem;color:#94a3b8;transition:transform 0.2s"></iconify-icon>
          </div>
          <div id="payees-list" style="display:none">
            ${payees.map(c => renderItem(c)).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      ${resumeHTML}

      ${activeItems.length > 0 ? `
        <h3 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:1rem">A payer</h3>
      ` : ''}
      ${activeHTML}
      ${payeesHTML}
    `;
  },

  _togglePayees() {
    const list = document.getElementById('payees-list');
    const chevron = document.getElementById('payees-chevron');
    if (!list) return;
    const visible = list.style.display !== 'none';
    list.style.display = visible ? 'none' : 'block';
    if (chevron) chevron.style.transform = visible ? '' : 'rotate(180deg)';
  },

  _contester(id) {
    const formHTML = `
      <form class="driver-form" onsubmit="return false">
        <div style="display:flex;align-items:center;gap:12px;padding:1rem;border-radius:1rem;background:rgba(245,158,11,0.06);border:1.5px solid rgba(245,158,11,0.12);margin-bottom:1rem">
          <iconify-icon icon="solar:chat-round-dots-bold" style="font-size:2rem;color:#f59e0b"></iconify-icon>
          <div>
            <div style="font-weight:800;font-size:0.9rem;color:#f59e0b">Contester cette contravention</div>
            <div style="font-size:0.72rem;color:#64748b;margin-top:2px">Explique pourquoi tu contestes cette amende</div>
          </div>
        </div>
        <div class="form-group">
          <label>Motif de contestation *</label>
          <textarea name="motif" rows="4" required placeholder="Explique la raison de ta contestation..."></textarea>
        </div>
      </form>
    `;

    DriverModal.show('Contester', formHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Envoyer', class: 'btn btn-primary', onclick: `ContraventionsDriverPage._submitContestation('${id}')` }
    ]);
  },

  async _submitContestation(id) {
    const motif = document.querySelector('#modal-content [name="motif"]');
    if (!motif || !motif.value.trim()) {
      DriverToast.show('Motif requis', 'error');
      return;
    }

    const result = await DriverStore.contesterContravention(id, motif.value.trim());
    if (result && !result.error) {
      DriverModal.close();
      DriverToast.show('Contestation envoyee', 'success');
      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  async _payWave(id) {
    const contraventions = await DriverStore.getContraventions();
    const c = contraventions ? contraventions.find(x => x.id === id) : null;
    if (!c) return;

    if (!confirm(`Payer cette contravention de ${this._formatCurrency(c.montant || 0)} via Wave ?`)) return;

    DriverToast.show('Redirection vers Wave...', 'info');

    const result = await DriverStore.createWaveContraventionCheckout(id);

    if (result && result.waveLaunchUrl) {
      window.location.href = result.waveLaunchUrl;
    } else {
      DriverToast.show(result?.error || 'Erreur Wave', 'error');
    }
  },

  _checkWaveReturn() {
    const hash = window.location.hash;
    if (!hash.includes('wave=')) return;

    const params = new URLSearchParams(hash.split('?')[1] || '');
    const waveStatus = params.get('wave');

    // Nettoyer l'URL
    window.location.hash = '#/contraventions';

    if (waveStatus === 'success') {
      DriverToast.show('Paiement Wave effectue avec succes !', 'success');
    } else if (waveStatus === 'error') {
      DriverToast.show('Le paiement Wave a echoue ou a ete annule', 'error');
    }
  },

  _formatCurrency(amount) {
    return amount.toLocaleString('fr-FR') + ' FCFA';
  },

  destroy() {}
};
