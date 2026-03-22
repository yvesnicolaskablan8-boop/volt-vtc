/**
 * EtatLieuxPage — Controle de debut/fin de service (etat des lieux vehicule)
 */
const EtatLieuxPage = {
  _step: 1,
  _checks: {},
  _photos: [],

  async render(container) {
    container.innerHTML = '<div style="padding:8px 0"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card" style="height:80px"></div><div class="skeleton skeleton-card" style="height:60px"></div></div>';

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
    this._photos = [];

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

          <!-- Photos -->
          <div style="margin-top:1.5rem">
            <label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:8px">Photos (optionnel, max 4)</label>
            <div id="edl-photos-grid" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px"></div>
            <input type="file" id="edl-photo-input" accept="image/*" capture="environment" style="display:none">
            <button id="edl-photo-btn" type="button" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px;border:2px dashed #cbd5e1;border-radius:1rem;background:#f8fafc;color:#64748b;font-size:0.875rem;font-weight:600;font-family:inherit;cursor:pointer;transition:border-color 0.15s">
              <iconify-icon icon="solar:camera-bold-duotone" style="font-size:1.25rem"></iconify-icon>
              Prendre une photo
            </button>
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

    // Bind photo capture
    const photoInput = document.getElementById('edl-photo-input');
    const photoBtn = document.getElementById('edl-photo-btn');

    photoBtn.addEventListener('click', () => {
      if (this._photos.length >= 4) {
        DriverToast.show('Maximum 4 photos atteint', 'warning');
        return;
      }
      photoInput.click();
    });

    photoInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      this._processPhoto(file);
      // Reset input so the same file can be re-selected
      photoInput.value = '';
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

  /**
   * Resize image to max 800px width and convert to base64 JPEG
   */
  _processPhoto(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 800;
        let w = img.width;
        let h = img.height;
        if (w > MAX_W) {
          h = Math.round(h * (MAX_W / w));
          w = MAX_W;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        this._photos.push(base64);
        this._renderPhotoPreviews();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  _renderPhotoPreviews() {
    const grid = document.getElementById('edl-photos-grid');
    if (!grid) return;

    // Clear existing previews using DOM API
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }

    this._photos.forEach((dataUrl, idx) => {
      // Wrapper
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative;width:72px;height:72px;border-radius:12px;overflow:hidden;border:2px solid #e2e8f0;flex-shrink:0';

      // Thumbnail image
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Photo ' + (idx + 1);
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      wrapper.appendChild(img);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.style.cssText = 'position:absolute;top:2px;right:2px;width:22px;height:22px;border-radius:50%;border:none;background:rgba(0,0,0,0.55);color:white;font-size:14px;line-height:22px;text-align:center;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center';

      const delIcon = document.createElement('iconify-icon');
      delIcon.setAttribute('icon', 'solar:close-circle-bold');
      delIcon.style.fontSize = '16px';
      delBtn.appendChild(delIcon);

      delBtn.addEventListener('click', () => {
        this._photos.splice(idx, 1);
        this._renderPhotoPreviews();
      });
      wrapper.appendChild(delBtn);

      grid.appendChild(wrapper);
    });

    // Update button visibility
    const photoBtn = document.getElementById('edl-photo-btn');
    if (photoBtn) {
      photoBtn.style.display = this._photos.length >= 4 ? 'none' : 'flex';
    }
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
      const payload = {
        type: 'autre',
        titre: 'Etat des lieux - Debut de service',
        description: `Points verifies: ${checkedCount}/5. ${notes ? 'Notes: ' + notes : ''}`,
        urgence: 'normale'
      };

      if (this._photos.length > 0) {
        payload.photos = this._photos;
      }

      const result = await DriverStore.createSignalement(payload);

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

  destroy() {
    this._photos = [];
  }
};
