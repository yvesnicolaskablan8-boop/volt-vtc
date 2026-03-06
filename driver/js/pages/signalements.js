/**
 * SignalementsPage — Signalement de problemes (panne, accident, amende...)
 */
const SignalementsPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const signalements = await DriverStore.getSignalements();
    if (!signalements) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger les signalements</p></div>';
      return;
    }

    // Separer actifs et resolus
    const actifs = signalements.filter(s => s.statut === 'ouvert' || s.statut === 'en_cours');
    const resolus = signalements.filter(s => s.statut === 'resolu' || s.statut === 'ferme');

    container.innerHTML = `
      <!-- Boutons signalement rapide 1-clic -->
      <div style="display:flex;gap:10px;margin-bottom:1.25rem">
        <button onclick="SignalementsPage._quickReport('panne')" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:1rem;border-radius:1.25rem;border:none;background:rgba(245,158,11,0.1);cursor:pointer;font-family:inherit;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform=''">
          <span style="font-size:1.5rem">🚗</span>
          <span style="font-size:0.7rem;font-weight:700;color:#f59e0b">Panne</span>
        </button>
        <button onclick="SignalementsPage._quickReport('accident')" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:1rem;border-radius:1.25rem;border:none;background:rgba(239,68,68,0.1);cursor:pointer;font-family:inherit;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform=''">
          <span style="font-size:1.5rem">💥</span>
          <span style="font-size:0.7rem;font-weight:700;color:#ef4444">Accident</span>
        </button>
        <button onclick="SignalementsPage._quickReport('agression')" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:1rem;border-radius:1.25rem;border:none;background:rgba(220,38,38,0.1);cursor:pointer;font-family:inherit;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform=''">
          <span style="font-size:1.5rem">🚨</span>
          <span style="font-size:0.7rem;font-weight:700;color:#dc2626">Urgence</span>
        </button>
      </div>

      <!-- Bouton signaler (formulaire complet) -->
      <button class="btn btn-danger btn-block btn-lg" onclick="SignalementsPage._nouveauSignalement()" style="margin-bottom:1.25rem">
        <i class="fas fa-exclamation-triangle"></i> Signaler un probleme
      </button>

      <!-- Actifs -->
      ${actifs.length > 0 ? `
        <div class="section-title">En cours (${actifs.length})</div>
        ${actifs.map(s => this._renderSignalement(s)).join('')}
      ` : ''}

      <!-- Resolus -->
      ${resolus.length > 0 ? `
        <div class="section-title">Resolus</div>
        ${resolus.map(s => this._renderSignalement(s)).join('')}
      ` : ''}

      ${signalements.length === 0 ? `
        <div class="empty-state" style="margin-top:2rem">
          <i class="fas fa-check-circle" style="color:#22c55e"></i>
          <p>Aucun signalement</p>
        </div>
      ` : ''}
    `;
  },

  _renderSignalement(s) {
    const typeIcons = {
      panne: 'fa-wrench',
      accident: 'fa-car-crash',
      amende: 'fa-file-invoice-dollar',
      pneu: 'fa-circle',
      vol: 'fa-mask',
      agression: 'fa-user-shield',
      autre: 'fa-question-circle'
    };
    const typeLabels = {
      panne: 'Panne',
      accident: 'Accident',
      amende: 'Amende',
      pneu: 'Pneu',
      vol: 'Vol',
      agression: 'Agression',
      autre: 'Autre'
    };
    const statusLabels = {
      ouvert: 'Ouvert',
      en_cours: 'En cours',
      resolu: 'Resolu',
      ferme: 'Ferme'
    };
    const urgenceLabels = {
      normale: 'Normale',
      haute: 'Haute',
      critique: 'Critique'
    };

    const icon = typeIcons[s.type] || 'fa-question-circle';
    const isActive = s.statut === 'ouvert' || s.statut === 'en_cours';
    const iconColor = isActive ? 'red' : 'green';
    const date = s.dateSignalement ? new Date(s.dateSignalement).toLocaleDateString('fr-FR') : '--';

    return `
      <div class="list-item">
        <div class="list-item-icon card-icon ${iconColor}">
          <i class="fas ${icon}"></i>
        </div>
        <div class="list-item-content">
          <div class="list-item-title">${s.titre || typeLabels[s.type] || 'Signalement'}</div>
          <div class="list-item-subtitle">${date} • ${typeLabels[s.type] || s.type}</div>
          ${s.description ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px">${s.description}</div>` : ''}
          <div class="list-item-meta">
            <span class="badge ${s.statut}">${statusLabels[s.statut] || s.statut}</span>
            <span class="badge urgence-${s.urgence}">${urgenceLabels[s.urgence] || s.urgence}</span>
          </div>
          ${s.commentaireAdmin ? `
            <div style="margin-top:6px;padding:8px;background:var(--bg-tertiary);border-radius:8px;font-size:0.78rem">
              <strong style="color:var(--text-primary)"><i class="fas fa-user-shield"></i> Admin :</strong>
              <span style="color:var(--text-secondary)">${s.commentaireAdmin}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  _nouveauSignalement() {
    const types = [
      { value: 'panne', icon: 'fa-wrench', label: 'Panne' },
      { value: 'accident', icon: 'fa-car-crash', label: 'Accident' },
      { value: 'amende', icon: 'fa-file-invoice-dollar', label: 'Amende' },
      { value: 'pneu', icon: 'fa-circle', label: 'Pneu' },
      { value: 'vol', icon: 'fa-mask', label: 'Vol' },
      { value: 'autre', icon: 'fa-question-circle', label: 'Autre' }
    ];

    const formHTML = `
      <form class="driver-form" onsubmit="return false">
        <div class="form-group">
          <label>Type de probleme</label>
          <div class="type-grid">
            ${types.map(t => `
              <button type="button" class="type-btn" data-type="${t.value}" onclick="SignalementsPage._selectType(this)">
                <i class="fas ${t.icon}"></i>
                ${t.label}
              </button>
            `).join('')}
          </div>
          <input type="hidden" name="type" value="">
        </div>
        <div class="form-group">
          <label>Titre</label>
          <input type="text" name="titre" required placeholder="Decrivez en quelques mots...">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea name="description" rows="3" placeholder="Details du probleme..."></textarea>
        </div>
        <div class="form-group">
          <label>Urgence</label>
          <select name="urgence">
            <option value="normale">Normale</option>
            <option value="haute">Haute</option>
            <option value="critique">Critique</option>
          </select>
        </div>
        <div class="form-group">
          <label>Localisation (optionnel)</label>
          <input type="text" name="localisation" placeholder="Ou s'est passe le probleme ?">
        </div>
      </form>
    `;

    DriverModal.show('Signaler un probleme', formHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Envoyer', class: 'btn btn-danger', onclick: 'SignalementsPage._submitSignalement()' }
    ]);
  },

  _selectType(btn) {
    // Deselect all
    btn.parentElement.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    // Set hidden input
    const hiddenInput = btn.closest('form').querySelector('[name="type"]');
    if (hiddenInput) hiddenInput.value = btn.getAttribute('data-type');
  },

  async _submitSignalement() {
    const values = DriverModal.getFormValues(['type', 'titre', 'description', 'urgence', 'localisation']);

    if (!values.type) {
      DriverToast.show('Selectionnez un type de probleme', 'error');
      return;
    }
    if (!values.titre) {
      DriverToast.show('Titre requis', 'error');
      return;
    }

    // Capturer la position GPS si disponible
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      values.position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (e) {
      // Position non disponible — pas grave
    }

    const result = await DriverStore.createSignalement(values);
    if (result && !result.error) {
      DriverModal.close();
      DriverToast.show('Signalement envoye', 'success');
      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  // Signalement rapide en 1 clic avec geolocalisation auto
  _quickReport(type) {
    const typeLabels = {
      panne: 'Panne vehicule',
      accident: 'Accident',
      agression: 'Urgence / Agression'
    };
    const urgenceMap = {
      panne: 'haute',
      accident: 'critique',
      agression: 'critique'
    };

    // Capturer la position pendant qu'on montre le modal
    let capturedPosition = null;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          capturedPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          // Mettre a jour l'affichage position dans le modal
          const posEl = document.getElementById('quick-report-position');
          if (posEl) {
            posEl.textContent = `${capturedPosition.lat.toFixed(4)}, ${capturedPosition.lng.toFixed(4)}`;
            posEl.style.color = '#22c55e';
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    const titre = typeLabels[type] || type;
    const urgence = urgenceMap[type] || 'haute';

    const modalHTML = `
      <div style="text-align:center;padding:0.5rem 0">
        <div style="font-size:3rem;margin-bottom:12px">${type === 'panne' ? '🚗' : type === 'accident' ? '💥' : '🚨'}</div>
        <h3 style="font-size:1.1rem;font-weight:800;color:var(--text-primary);margin-bottom:8px">${titre}</h3>
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:0.8rem;color:var(--text-muted);margin-bottom:16px">
          <iconify-icon icon="solar:map-point-bold" style="font-size:1rem;color:#3b82f6"></iconify-icon>
          Position : <span id="quick-report-position" style="font-weight:600;color:#f59e0b">Capture en cours...</span>
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary)">Urgence : <strong style="color:#ef4444">${urgence}</strong></p>
        <textarea id="quick-report-desc" rows="2" placeholder="Details rapides (optionnel)..." style="width:100%;margin-top:12px;padding:10px;border-radius:10px;border:1px solid var(--border-color);font-family:inherit;font-size:0.85rem;resize:none;background:var(--bg-tertiary);color:var(--text-primary)"></textarea>
      </div>
    `;

    DriverModal.show('Signalement rapide', modalHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Confirmer & Envoyer', class: 'btn btn-danger', onclick: `SignalementsPage._submitQuickReport('${type}')` }
    ]);

    // Stocker la reference pour soumission
    this._quickReportPosition = () => capturedPosition;
    this._quickReportType = type;
  },

  async _submitQuickReport(type) {
    const typeLabels = {
      panne: 'Panne vehicule',
      accident: 'Accident',
      agression: 'Urgence / Agression'
    };
    const urgenceMap = {
      panne: 'haute',
      accident: 'critique',
      agression: 'critique'
    };

    const desc = document.getElementById('quick-report-desc')?.value.trim() || '';
    const position = this._quickReportPosition ? this._quickReportPosition() : null;

    const data = {
      type: type === 'agression' ? 'agression' : type,
      titre: typeLabels[type] || type,
      description: desc,
      urgence: urgenceMap[type] || 'haute'
    };
    if (position) {
      data.position = position;
      data.localisation = `GPS: ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
    }

    const result = await DriverStore.createSignalement(data);
    if (result && !result.error) {
      DriverModal.close();
      DriverToast.show('Signalement envoye !', 'success');
      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  destroy() {}
};
