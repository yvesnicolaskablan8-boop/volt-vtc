/**
 * ChecklistPage — Inspection vehicule avant service
 */
const ChecklistPage = {
  _items: [
    { nom: 'pneus', label: 'Pneus', icon: 'solar:wheel-bold-duotone' },
    { nom: 'feux', label: 'Feux & clignotants', icon: 'solar:lightbulb-bolt-bold-duotone' },
    { nom: 'retroviseurs', label: 'Retroviseurs', icon: 'solar:mirror-left-bold-duotone' },
    { nom: 'proprete_interieur', label: 'Proprete interieur', icon: 'solar:armchair-bold-duotone' },
    { nom: 'proprete_exterieur', label: 'Proprete exterieur', icon: 'solar:car-wash-bold-duotone' },
    { nom: 'niveau_huile', label: 'Niveau d\'huile', icon: 'solar:gas-station-bold-duotone' },
    { nom: 'freins', label: 'Freins', icon: 'solar:stop-circle-bold-duotone' },
    { nom: 'ceintures', label: 'Ceintures securite', icon: 'solar:shield-check-bold-duotone' },
    { nom: 'climatisation', label: 'Climatisation', icon: 'solar:temperature-bold-duotone' },
    { nom: 'documents_bord', label: 'Documents de bord', icon: 'solar:document-bold-duotone' }
  ],

  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    // Verifier si checklist deja faite aujourd'hui
    const existing = await DriverStore.getChecklistToday();

    if (existing && existing.id) {
      // Checklist deja remplie — afficher le resume
      this._renderResult(container, existing);
      return;
    }

    // Formulaire d'inspection
    this._renderForm(container);
  },

  _renderForm(container) {
    container.innerHTML = `
      <div style="text-align:center;margin-bottom:1.5rem">
        <div style="width:64px;height:64px;border-radius:1.25rem;background:rgba(59,130,246,0.08);color:#3b82f6;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">
          <iconify-icon icon="solar:clipboard-check-bold-duotone" style="font-size:2rem"></iconify-icon>
        </div>
        <h2 style="font-size:1.25rem;font-weight:800;color:var(--text-primary)">Inspection vehicule</h2>
        <p style="font-size:0.82rem;color:var(--text-muted);margin-top:6px">Verifiez chaque element avant de commencer votre service</p>
      </div>

      <div id="checklist-items" style="display:flex;flex-direction:column;gap:10px;margin-bottom:1.25rem">
        ${this._items.map(item => `
          <div class="checklist-item" data-nom="${item.nom}" style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:var(--bg-secondary);border:1px solid var(--border-color)">
            <div style="width:40px;height:40px;border-radius:0.75rem;background:rgba(59,130,246,0.08);color:#3b82f6;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <iconify-icon icon="${item.icon}" style="font-size:1.2rem"></iconify-icon>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary)">${item.label}</div>
              <input type="text" placeholder="Commentaire..." class="checklist-comment" data-nom="${item.nom}" style="display:none;margin-top:8px;width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);font-family:inherit;font-size:0.8rem;background:var(--bg-tertiary);color:var(--text-primary)">
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button onclick="ChecklistPage._setStatus(this, '${item.nom}', 'ok')" class="check-btn" data-status="ok" style="width:38px;height:38px;border-radius:10px;border:2px solid #e2e8f0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s">
                <iconify-icon icon="solar:check-circle-bold" style="font-size:1.2rem;color:#cbd5e1"></iconify-icon>
              </button>
              <button onclick="ChecklistPage._setStatus(this, '${item.nom}', 'probleme')" class="check-btn" data-status="probleme" style="width:38px;height:38px;border-radius:10px;border:2px solid #e2e8f0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s">
                <iconify-icon icon="solar:close-circle-bold" style="font-size:1.2rem;color:#cbd5e1"></iconify-icon>
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Commentaire general -->
      <div style="margin-bottom:1.5rem">
        <label style="font-size:0.8rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:8px">Commentaire general (optionnel)</label>
        <textarea id="checklist-comment-general" rows="2" placeholder="Remarques supplementaires..." style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--border-color);font-family:inherit;font-size:0.85rem;resize:none;background:var(--bg-secondary);color:var(--text-primary)"></textarea>
      </div>

      <!-- Bouton valider -->
      <button onclick="ChecklistPage._submit()" id="checklist-submit-btn" style="width:100%;padding:1rem;border-radius:1.25rem;border:none;background:#3b82f6;color:white;font-size:1rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(59,130,246,0.3)">
        <iconify-icon icon="solar:check-circle-bold" style="font-size:1.1rem;vertical-align:middle;margin-right:6px"></iconify-icon>
        Valider l'inspection
      </button>

      <div style="height:20px"></div>
    `;
  },

  _statuses: {},

  _setStatus(btn, nom, status) {
    this._statuses[nom] = status;

    // Update UI
    const itemEl = btn.closest('.checklist-item');
    const buttons = itemEl.querySelectorAll('.check-btn');
    buttons.forEach(b => {
      const s = b.getAttribute('data-status');
      if (s === status) {
        if (status === 'ok') {
          b.style.borderColor = '#22c55e';
          b.style.background = 'rgba(34,197,94,0.1)';
          b.querySelector('iconify-icon').style.color = '#22c55e';
        } else {
          b.style.borderColor = '#ef4444';
          b.style.background = 'rgba(239,68,68,0.1)';
          b.querySelector('iconify-icon').style.color = '#ef4444';
        }
      } else {
        b.style.borderColor = '#e2e8f0';
        b.style.background = 'transparent';
        b.querySelector('iconify-icon').style.color = '#cbd5e1';
      }
    });

    // Montrer/cacher le champ commentaire si probleme
    const commentInput = itemEl.querySelector('.checklist-comment');
    if (commentInput) {
      commentInput.style.display = status === 'probleme' ? 'block' : 'none';
    }
  },

  async _submit() {
    // Construire les items
    const items = this._items.map(item => {
      const statut = this._statuses[item.nom] || 'non_verifie';
      const commentInput = document.querySelector(`.checklist-comment[data-nom="${item.nom}"]`);
      const commentaire = commentInput ? commentInput.value.trim() : '';
      return { nom: item.nom, statut, commentaire };
    });

    // Verifier qu'au moins un item est verifie
    const verified = items.filter(i => i.statut !== 'non_verifie');
    if (verified.length === 0) {
      DriverToast.show('Verifiez au moins un element', 'error');
      return;
    }

    const commentaireGeneral = document.getElementById('checklist-comment-general')?.value.trim() || '';
    const hasProblems = items.some(i => i.statut === 'probleme');

    const btn = document.getElementById('checklist-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';
    }

    const result = await DriverStore.submitChecklist({
      items,
      commentaireGeneral,
      resultat: hasProblems ? 'problemes_detectes' : 'ok'
    });

    if (result && !result.error) {
      DriverToast.show('Inspection enregistree !', 'success');
      this._renderResult(document.getElementById('app-content'), result);
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<iconify-icon icon="solar:check-circle-bold" style="font-size:1.1rem;vertical-align:middle;margin-right:6px"></iconify-icon> Valider l\'inspection';
      }
    }
  },

  _renderResult(container, checklist) {
    const isOk = checklist.resultat === 'ok';
    const items = checklist.items || [];
    const problems = items.filter(i => i.statut === 'probleme');
    const okCount = items.filter(i => i.statut === 'ok').length;
    const date = checklist.dateCreation ? new Date(checklist.dateCreation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--';

    const itemLabels = {};
    this._items.forEach(i => { itemLabels[i.nom] = i.label; });

    container.innerHTML = `
      <!-- Resultat -->
      <div style="text-align:center;padding:2rem 0 1.5rem">
        <div style="width:80px;height:80px;border-radius:50%;background:${isOk ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)'};display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">
          <iconify-icon icon="${isOk ? 'solar:check-circle-bold' : 'solar:danger-triangle-bold'}" style="font-size:2.5rem;color:${isOk ? '#22c55e' : '#f59e0b'}"></iconify-icon>
        </div>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-primary)">${isOk ? 'Vehicule OK' : 'Problemes detectes'}</h2>
        <p style="font-size:0.82rem;color:var(--text-muted);margin-top:6px">Inspection faite a ${date} &bull; ${okCount}/${items.length} elements OK</p>
      </div>

      <!-- Details -->
      <div style="border-radius:1.5rem;background:var(--bg-secondary);border:1px solid var(--border-color);padding:1.25rem;margin-bottom:1rem">
        <div style="display:flex;flex-direction:column;gap:10px">
          ${items.map(item => {
            const label = itemLabels[item.nom] || item.nom;
            const isProbleme = item.statut === 'probleme';
            const isNonVerifie = item.statut === 'non_verifie';
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:12px;background:${isProbleme ? 'rgba(239,68,68,0.06)' : isNonVerifie ? 'var(--bg-tertiary)' : 'rgba(34,197,94,0.04)'}">
                <div>
                  <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary)">${label}</span>
                  ${item.commentaire ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${item.commentaire}</div>` : ''}
                </div>
                <iconify-icon icon="${isProbleme ? 'solar:close-circle-bold' : isNonVerifie ? 'solar:minus-circle-bold' : 'solar:check-circle-bold'}"
                  style="font-size:1.3rem;color:${isProbleme ? '#ef4444' : isNonVerifie ? '#94a3b8' : '#22c55e'}"></iconify-icon>
              </div>`;
          }).join('')}
        </div>
        ${checklist.commentaireGeneral ? `
          <div style="margin-top:12px;padding:12px;border-radius:10px;background:var(--bg-tertiary);font-size:0.82rem;color:var(--text-secondary)">
            <strong>Note :</strong> ${checklist.commentaireGeneral}
          </div>
        ` : ''}
      </div>

      ${problems.length > 0 ? `
        <div style="display:flex;align-items:center;gap:10px;padding:14px;border-radius:1rem;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);margin-bottom:1rem">
          <iconify-icon icon="solar:info-circle-bold" style="font-size:1.2rem;color:#f59e0b;flex-shrink:0"></iconify-icon>
          <span style="font-size:0.82rem;color:var(--text-secondary)">Un signalement automatique a ete cree pour les problemes detectes.</span>
        </div>
      ` : ''}

      <div style="height:20px"></div>
    `;
  },

  destroy() {
    this._statuses = {};
  }
};
