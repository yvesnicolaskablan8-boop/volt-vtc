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
      <!-- Bouton signaler -->
      <button class="btn btn-danger btn-block btn-lg" onclick="SignalementsPage._nouveauSignalement()">
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

    const result = await DriverStore.createSignalement(values);
    if (result && !result.error) {
      DriverModal.close();
      DriverToast.show('Signalement envoye', 'success');
      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  destroy() {}
};
