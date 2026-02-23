/**
 * MaintenancePage — Page entretien vehicule pour la PWA chauffeur
 */
const MaintenancePage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const data = await DriverStore.getMaintenances();
    if (!data) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger les maintenances</p></div>';
      return;
    }

    const vehicule = data.vehicule;
    const maintenances = data.maintenances || [];

    // Trier par urgence : en_retard > urgent > a_venir > terminee
    const ordre = { en_retard: 0, urgent: 1, a_venir: 2, terminee: 3 };
    maintenances.sort((a, b) => (ordre[a.statut] || 9) - (ordre[b.statut] || 9));

    const typeLabels = {
      vidange: 'Vidange', revision: 'Revision generale', pneus: 'Pneus',
      freins: 'Freins', filtres: 'Filtres', climatisation: 'Climatisation',
      courroie: 'Courroie de distribution', controle_technique: 'Controle technique',
      batterie: 'Batterie', amortisseurs: 'Amortisseurs', echappement: 'Echappement',
      carrosserie: 'Carrosserie', autre: 'Autre entretien'
    };

    const typeIcons = {
      vidange: 'fa-oil-can', revision: 'fa-wrench', pneus: 'fa-tire',
      freins: 'fa-brake-warning', filtres: 'fa-filter', climatisation: 'fa-snowflake',
      courroie: 'fa-cog', controle_technique: 'fa-clipboard-check', batterie: 'fa-car-battery',
      amortisseurs: 'fa-car', echappement: 'fa-smog', carrosserie: 'fa-car-side',
      autre: 'fa-tools'
    };

    const statutBadges = {
      en_retard: { label: 'En retard', class: 'badge-retard', icon: 'fa-exclamation-circle' },
      urgent: { label: 'Urgent', class: 'badge-urgent', icon: 'fa-exclamation-triangle' },
      a_venir: { label: 'A venir', class: 'badge-avenir', icon: 'fa-clock' },
      terminee: { label: 'Terminee', class: 'badge-ok', icon: 'fa-check-circle' }
    };

    const countRetard = maintenances.filter(m => m.statut === 'en_retard').length;
    const countUrgent = maintenances.filter(m => m.statut === 'urgent').length;

    container.innerHTML = `
      <!-- Vehicule Info -->
      ${vehicule ? `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:40px;height:40px;border-radius:10px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-car" style="color:var(--primary);font-size:1.1rem;"></i>
          </div>
          <div style="flex:1;">
            <div style="font-size:0.95rem;font-weight:700;">${vehicule.marque} ${vehicule.modele}</div>
            <div style="font-size:0.78rem;color:var(--text-secondary);">
              ${vehicule.immatriculation}
              ${vehicule.kilometrage ? ' • ' + vehicule.kilometrage.toLocaleString('fr-FR') + ' km' : ''}
            </div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Alerte si retards -->
      ${countRetard > 0 ? `
      <div class="card" style="border-left:3px solid #ef4444;margin-bottom:12px;padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="fas fa-exclamation-circle" style="color:#ef4444;"></i>
          <div style="font-size:0.82rem;font-weight:600;color:#ef4444;">
            ${countRetard} maintenance${countRetard > 1 ? 's' : ''} en retard !
          </div>
        </div>
      </div>
      ` : countUrgent > 0 ? `
      <div class="card" style="border-left:3px solid #f59e0b;margin-bottom:12px;padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="fas fa-exclamation-triangle" style="color:#f59e0b;"></i>
          <div style="font-size:0.82rem;font-weight:600;color:#f59e0b;">
            ${countUrgent} maintenance${countUrgent > 1 ? 's' : ''} urgente${countUrgent > 1 ? 's' : ''}
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Liste maintenances -->
      ${maintenances.length === 0 ? `
        <div class="empty-state" style="padding:2rem 0;">
          <i class="fas fa-check-circle" style="color:#22c55e;"></i>
          <h3>Aucune maintenance planifiee</h3>
          <p style="font-size:0.82rem;color:var(--text-secondary);">Votre vehicule est a jour !</p>
        </div>
      ` : maintenances.map(m => {
        const typeLabel = typeLabels[m.type] || m.type;
        const typeIcon = typeIcons[m.type] || 'fa-wrench';
        const badge = statutBadges[m.statut] || statutBadges.a_venir;

        let echeanceHTML = '';
        if (m.prochaineDate) {
          const jours = Math.ceil((new Date(m.prochaineDate) - new Date()) / 86400000);
          echeanceHTML += `<div style="font-size:0.75rem;color:var(--text-secondary);"><i class="fas fa-calendar"></i> ${new Date(m.prochaineDate).toLocaleDateString('fr-FR')}`;
          if (jours > 0) echeanceHTML += ` (dans ${jours}j)`;
          else if (jours < 0) echeanceHTML += ` (${Math.abs(jours)}j de retard)`;
          else echeanceHTML += ' (aujourd\'hui)';
          echeanceHTML += '</div>';
        }
        if (m.prochainKm && vehicule && vehicule.kilometrage) {
          const diff = m.prochainKm - vehicule.kilometrage;
          echeanceHTML += `<div style="font-size:0.75rem;color:var(--text-secondary);"><i class="fas fa-road"></i> ${m.prochainKm.toLocaleString('fr-FR')} km`;
          if (diff > 0) echeanceHTML += ` (dans ${diff.toLocaleString('fr-FR')} km)`;
          else echeanceHTML += ` (depasse de ${Math.abs(diff).toLocaleString('fr-FR')} km)`;
          echeanceHTML += '</div>';
        }

        const borderColor = m.statut === 'en_retard' ? '#ef4444' :
                            m.statut === 'urgent' ? '#f59e0b' :
                            m.statut === 'terminee' ? '#22c55e' : 'var(--border-color)';

        return `
          <div class="card" style="margin-bottom:10px;border-left:3px solid ${borderColor};${m.statut === 'terminee' ? 'opacity:0.7;' : ''}">
            <div style="display:flex;align-items:flex-start;gap:10px;">
              <div style="width:36px;height:36px;border-radius:8px;background:${m.statut === 'en_retard' ? 'rgba(239,68,68,0.1)' : m.statut === 'urgent' ? 'rgba(245,158,11,0.1)' : m.statut === 'terminee' ? 'rgba(34,197,94,0.1)' : 'var(--bg-tertiary)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fas ${typeIcon}" style="color:${borderColor};font-size:0.85rem;"></i>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;">
                  <span style="font-size:0.88rem;font-weight:600;">${typeLabel}</span>
                  <span class="maint-badge ${badge.class}" style="font-size:0.65rem;padding:2px 8px;border-radius:12px;font-weight:600;white-space:nowrap;">
                    <i class="fas ${badge.icon}" style="font-size:0.55rem;margin-right:2px;"></i> ${badge.label}
                  </span>
                </div>
                ${echeanceHTML}
                ${m.prestataire ? `<div style="font-size:0.75rem;color:var(--text-secondary);"><i class="fas fa-store"></i> ${m.prestataire}</div>` : ''}
                ${m.coutEstime ? `<div style="font-size:0.75rem;color:var(--text-secondary);"><i class="fas fa-coins"></i> ${m.coutEstime.toLocaleString('fr-FR')} FCFA</div>` : ''}
                ${m.notes ? `<div style="font-size:0.72rem;color:var(--text-muted);font-style:italic;margin-top:4px;">${m.notes}</div>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}

      <!-- Bouton signaler probleme -->
      <div style="margin-top:16px;">
        <button class="btn btn-primary" style="width:100%;padding:12px;font-size:0.88rem;" onclick="MaintenancePage._showSignalForm()">
          <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i> Signaler un probleme
        </button>
      </div>

      <style>
        .maint-badge.badge-retard { background:rgba(239,68,68,0.15);color:#ef4444; }
        .maint-badge.badge-urgent { background:rgba(245,158,11,0.15);color:#f59e0b; }
        .maint-badge.badge-avenir { background:rgba(59,130,246,0.12);color:#3b82f6; }
        .maint-badge.badge-ok { background:rgba(34,197,94,0.12);color:#22c55e; }
      </style>
    `;
  },

  _showSignalForm() {
    const typeOptions = [
      { value: 'vidange', label: 'Vidange' },
      { value: 'freins', label: 'Freins' },
      { value: 'pneus', label: 'Pneus' },
      { value: 'batterie', label: 'Batterie' },
      { value: 'climatisation', label: 'Climatisation' },
      { value: 'moteur', label: 'Probleme moteur' },
      { value: 'voyant', label: 'Voyant allume' },
      { value: 'bruit', label: 'Bruit anormal' },
      { value: 'autre', label: 'Autre' }
    ];

    const formHTML = `
      <form class="driver-form" onsubmit="return false">
        <div class="form-group">
          <label>Type de probleme</label>
          <select name="type">
            ${typeOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea name="description" rows="3" placeholder="Decrivez le probleme constate..." required></textarea>
        </div>
        <div class="form-group">
          <label>Urgence</label>
          <select name="urgence">
            <option value="normale">Normale — peut attendre</option>
            <option value="haute">Haute — a traiter rapidement</option>
            <option value="critique">Critique — vehicule immobilise</option>
          </select>
        </div>
      </form>
    `;

    DriverModal.show('Signaler un probleme', formHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Envoyer', class: 'btn btn-primary', onclick: 'MaintenancePage._submitSignal()' }
    ]);
  },

  async _submitSignal() {
    const values = DriverModal.getFormValues(['type', 'description', 'urgence']);

    if (!values.description || !values.description.trim()) {
      DriverToast.show('Veuillez decrire le probleme', 'error');
      return;
    }

    const result = await DriverStore.signalMaintenanceProblem(values);
    if (result && !result.error) {
      DriverModal.close();
      DriverToast.show('Signalement envoye !', 'success');
    } else {
      DriverToast.show(result?.error || 'Erreur lors de l\'envoi', 'error');
    }
  },

  destroy() {
    // Nothing to cleanup
  }
};
