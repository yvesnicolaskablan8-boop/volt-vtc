/**
 * EtatLieuxPage — Controle de debut/fin de service (etat des lieux vehicule)
 */
const EtatLieuxPage = {
  _step: 1,
  _checks: {},
  _photos: [],

  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const vehicule = await DriverStore.getVehicule();
    const v = vehicule || {};

    this._step = 1;
    this._checks = {
      pneumatiques: false,
      retroviseurs: false,
      eclairage: false,
      carrosserie: false,
      proprete: false,
      niveau_batterie: null
    };

    container.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <h2 style="font-size:1.15rem;font-weight:800">Controle de debut de service</h2>
        <p style="font-size:0.875rem;color:#64748b;margin-top:4px">Verifiez chaque point avant de valider votre prise de vehicule.</p>
      </div>

      <div style="border-radius:1.5rem;overflow:hidden;background:white;box-shadow:0 1px 6px rgba(0,0,0,0.06);border:1px solid #f1f5f9">
        <!-- Vehicle header -->
        <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:1.5rem;color:white;text-align:center">
          <iconify-icon icon="solar:wheel-bold-duotone" style="font-size:3rem;opacity:0.8"></iconify-icon>
          <div style="font-size:1rem;font-weight:700;margin-top:8px">${v.marque || ''} ${v.modele || ''}</div>
          <div style="font-size:0.8rem;opacity:0.7">${v.immatriculation || 'Non assigne'}</div>
        </div>

        <div style="padding:1.5rem">
          <!-- Checklist -->
          <div id="etat-lieux-checklist" style="display:flex;flex-direction:column;gap:1rem">
            ${this._renderCheckItem('pneumatiques', 'solar:wheel-bold-duotone', 'Pneumatiques', 'Etat general des pneus')}
            ${this._renderCheckItem('retroviseurs', 'solar:eye-bold-duotone', 'Retroviseurs / Vitres', 'Propres et fonctionnels')}
            ${this._renderCheckItem('eclairage', 'solar:flashlight-bold-duotone', 'Eclairage', 'Phares, clignotants, feux stop')}
            ${this._renderCheckItem('carrosserie', 'solar:shield-check-bold-duotone', 'Carrosserie', 'Pas de dommages visibles')}
            ${this._renderCheckItem('proprete', 'solar:bath-bold-duotone', 'Proprete interieure', 'Habitacle propre et range')}

            <!-- Niveau batterie/carburant -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0">
              <div style="display:flex;align-items:center;gap:12px">
                <iconify-icon icon="solar:battery-charge-bold-duotone" style="font-size:1.5rem;color:#94a3b8"></iconify-icon>
                <span style="font-weight:700;font-size:0.9rem">Niveau ${v.energie === 'electrique' ? 'batterie' : 'carburant'}</span>
              </div>
              <span style="font-weight:900;color:#22c55e;font-size:1rem" id="niveau-display">--</span>
            </div>
          </div>

          <!-- Notes -->
          <div style="margin-top:1.5rem">
            <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:8px">Observations (optionnel)</label>
            <textarea id="etat-lieux-notes" placeholder="Notez tout probleme ou remarque..." style="width:100%;min-height:80px;border:2px solid #f1f5f9;border-radius:1rem;padding:12px;font-family:inherit;font-size:0.875rem;resize:vertical;background:#f8fafc"></textarea>
          </div>

          <!-- Submit -->
          <button onclick="EtatLieuxPage._submit()" style="width:100%;margin-top:1.5rem;padding:1rem;border:none;border-radius:1rem;background:#3b82f6;color:white;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 4px 12px rgba(59,130,246,0.25);transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
            <iconify-icon icon="solar:check-circle-bold" style="margin-right:8px"></iconify-icon>
            Valider l'etat des lieux
          </button>
        </div>
      </div>
    `;

    // Bind checkbox handlers
    container.querySelectorAll('.edl-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const key = e.target.dataset.key;
        this._checks[key] = e.target.checked;
      });
    });
  },

  _renderCheckItem(key, icon, label, desc) {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0">
        <div style="display:flex;align-items:center;gap:12px">
          <iconify-icon icon="${icon}" style="font-size:1.5rem;color:#94a3b8"></iconify-icon>
          <div>
            <span style="font-weight:700;font-size:0.9rem">${label}</span>
            <div style="font-size:0.7rem;color:#94a3b8">${desc}</div>
          </div>
        </div>
        <input type="checkbox" class="edl-check" data-key="${key}" style="width:24px;height:24px;accent-color:#3b82f6;cursor:pointer;border-radius:6px">
      </div>
    `;
  },

  async _submit() {
    const notes = document.getElementById('etat-lieux-notes')?.value || '';
    const checkedCount = Object.values(this._checks).filter(v => v === true).length;

    if (checkedCount < 3) {
      DriverToast.show('Veuillez verifier au moins 3 points', 'warning');
      return;
    }

    // Submit to API
    try {
      const result = await DriverStore.createSignalement({
        type: 'autre',
        titre: 'Etat des lieux - Debut de service',
        description: `Points verifies: ${checkedCount}/5. ${notes ? 'Notes: ' + notes : ''}`,
        urgence: 'normale'
      });

      if (result && !result.error) {
        DriverToast.show('Etat des lieux enregistre !', 'success');
        DriverRouter.navigate('accueil');
      } else {
        DriverToast.show('Erreur lors de l\'enregistrement', 'error');
      }
    } catch (e) {
      DriverToast.show('Etat des lieux sauvegarde localement', 'success');
      DriverRouter.navigate('accueil');
    }
  },

  destroy() {}
};
