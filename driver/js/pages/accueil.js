/**
 * AccueilPage — Tableau de bord chauffeur
 */
const AccueilPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const data = await DriverStore.getDashboard();
    if (!data) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger le tableau de bord</p></div>';
      return;
    }

    const chauffeur = data.chauffeur || {};
    const prenom = chauffeur.prenom || 'Chauffeur';
    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    // Creneau du jour
    const creneauLabels = {
      matin: 'Matin (6h-14h)',
      apres_midi: 'Apres-midi (14h-22h)',
      journee: 'Journee (8h-20h)',
      nuit: 'Nuit (22h-6h)'
    };
    const creneau = data.creneauJour;
    const creneauText = creneau ? creneauLabels[creneau.type] || creneau.type : null;

    // Vehicule
    const v = data.vehicule;

    // Stats
    const stats = data.statsMois || {};

    // Score
    const score = data.scoreConduite || 0;
    const scoreClass = score >= 70 ? 'good' : score >= 50 ? 'medium' : 'bad';

    // Countdown deadline
    let countdownHTML = '';
    if (data.deadline && data.deadline.configured) {
      DriverCountdown.init(data.deadline);
      countdownHTML = DriverCountdown.renderWidget();
    }

    container.innerHTML = `
      <!-- Greeting -->
      <div class="greeting">
        <h2>Bonjour, ${prenom} !</h2>
        <p><i class="fas fa-calendar-day"></i> ${dateStr}</p>
      </div>

      <!-- Countdown deadline versement -->
      ${countdownHTML}

      <!-- Planning du jour -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-clock"></i> Aujourd'hui</span>
          ${creneau ? `<span class="badge ${creneau.type}">${creneauText}</span>` : '<span class="badge neutral">Pas de creneau</span>'}
        </div>
        ${creneau && creneau.notes ? `<p style="font-size:0.82rem;color:var(--text-secondary);font-style:italic">${creneau.notes}</p>` : ''}
      </div>

      <!-- KPIs -->
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Score conduite</div>
          <div class="kpi-value" style="color: ${score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'}">${score}/100</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Versements du mois</div>
          <div class="kpi-value small">${this._formatCurrency(stats.totalNet || 0)}</div>
        </div>
      </div>

      <!-- Vehicule -->
      ${v ? `
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-car"></i> Mon vehicule</span>
          <span class="card-icon cyan"><i class="fas fa-car"></i></span>
        </div>
        <div style="font-size:0.95rem;font-weight:600">${v.marque} ${v.modele}</div>
        <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px">
          ${v.immatriculation} ${v.kilometrage ? '• ' + v.kilometrage.toLocaleString('fr-FR') + ' km' : ''}
        </div>
      </div>
      ` : ''}

      <!-- Alertes actives -->
      ${data.alertesActives > 0 ? `
      <div class="card" style="border-left: 3px solid #ef4444">
        <div style="display:flex;align-items:center;gap:8px;color:#dc2626;font-weight:600;font-size:0.85rem">
          <i class="fas fa-bell"></i> ${data.alertesActives} signalement${data.alertesActives > 1 ? 's' : ''} en cours
        </div>
      </div>
      ` : ''}

      <!-- Actions rapides -->
      <div class="section-title">Actions rapides</div>
      <div class="action-grid">
        <button class="action-btn green" onclick="DriverRouter.navigate('versements')">
          <i class="fas fa-money-bill-wave"></i>
          Faire un versement
        </button>
        <button class="action-btn red" onclick="DriverRouter.navigate('signalements')">
          <i class="fas fa-exclamation-triangle"></i>
          Signaler un probleme
        </button>
        <button class="action-btn blue" onclick="AccueilPage._demanderAbsence()">
          <i class="fas fa-calendar-minus"></i>
          Demander une absence
        </button>
        <button class="action-btn cyan" onclick="DriverRouter.navigate('planning')">
          <i class="fas fa-calendar-alt"></i>
          Voir mon planning
        </button>
      </div>
    `;

    // Demarrer le timer du countdown apres le render
    if (data.deadline && data.deadline.configured) {
      DriverCountdown.startTimer();
    }
  },

  _formatCurrency(amount) {
    return amount.toLocaleString('fr-FR') + ' FCFA';
  },

  _demanderAbsence() {
    const formHTML = `
      <form class="driver-form" onsubmit="return false">
        <div class="form-group">
          <label>Type d'absence</label>
          <select name="type">
            <option value="repos">Repos</option>
            <option value="conge">Conge</option>
            <option value="maladie">Maladie</option>
            <option value="personnel">Personnel</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date de debut</label>
          <input type="date" name="dateDebut" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Date de fin</label>
          <input type="date" name="dateFin" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Motif (optionnel)</label>
          <textarea name="motif" rows="2" placeholder="Raison de l'absence..."></textarea>
        </div>
      </form>
    `;

    DriverModal.show('Demander une absence', formHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Envoyer', class: 'btn btn-primary', onclick: 'AccueilPage._submitAbsence()' }
    ]);
  },

  async _submitAbsence() {
    const values = DriverModal.getFormValues(['type', 'dateDebut', 'dateFin', 'motif']);

    if (!values.dateDebut || !values.dateFin) {
      DriverToast.show('Veuillez remplir les dates', 'error');
      return;
    }

    const result = await DriverStore.createAbsence(values);
    if (result && !result.error) {
      DriverModal.close();
      DriverToast.show('Demande d\'absence envoyee', 'success');
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  destroy() {
    DriverCountdown.stopTimer();
  }
};
