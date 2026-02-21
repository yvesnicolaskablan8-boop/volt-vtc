/**
 * VersementsPage — Declaration et historique des versements
 */
const VersementsPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const versements = await DriverStore.getVersements();
    if (!versements) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger les versements</p></div>';
      return;
    }

    // Stats du mois en cours
    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7);
    const versMois = versements.filter(v => v.date && v.date.startsWith(monthStr));
    const totalBrut = versMois.reduce((s, v) => s + (v.montantBrut || 0), 0);
    const totalCommission = versMois.reduce((s, v) => s + (v.commission || 0), 0);
    const totalNet = versMois.reduce((s, v) => s + (v.montantNet || 0), 0);

    const monthNames = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];

    container.innerHTML = `
      <!-- Resume du mois -->
      <div class="stats-summary">
        <div class="stats-summary-title"><i class="fas fa-chart-bar"></i> ${monthNames[now.getMonth()]} ${now.getFullYear()}</div>
        <div class="stats-row">
          <span class="stats-label">Total brut</span>
          <span class="stats-value">${this._formatCurrency(totalBrut)}</span>
        </div>
        <div class="stats-row">
          <span class="stats-label">Commission (20%)</span>
          <span class="stats-value" style="color:#ef4444">-${this._formatCurrency(totalCommission)}</span>
        </div>
        <div class="stats-row">
          <span class="stats-label">Net</span>
          <span class="stats-value highlight">${this._formatCurrency(totalNet)}</span>
        </div>
      </div>

      <!-- Bouton nouveau -->
      <button class="btn btn-success btn-block btn-lg" onclick="VersementsPage._nouveauVersement()">
        <i class="fas fa-plus-circle"></i> Nouveau versement
      </button>

      <!-- Liste -->
      <div class="section-title">Historique</div>
      <div id="versements-list">
        ${versements.length === 0
          ? '<div class="empty-state"><i class="fas fa-inbox"></i><p>Aucun versement</p></div>'
          : versements.map(v => this._renderVersement(v)).join('')
        }
      </div>
    `;
  },

  _renderVersement(v) {
    const statusLabels = {
      en_attente: 'En attente',
      valide: 'Valide',
      retard: 'En retard',
      partiel: 'Partiel'
    };
    const date = v.date ? new Date(v.date).toLocaleDateString('fr-FR') : '--';

    return `
      <div class="list-item">
        <div class="list-item-icon card-icon ${v.statut === 'valide' ? 'green' : v.statut === 'retard' ? 'red' : 'yellow'}">
          <i class="fas fa-money-bill-wave"></i>
        </div>
        <div class="list-item-content">
          <div class="list-item-title">${this._formatCurrency(v.montantBrut || 0)}</div>
          <div class="list-item-subtitle">${date} ${v.periode ? '• ' + v.periode : ''}</div>
          <div class="list-item-meta">
            <span class="badge ${v.statut}">${statusLabels[v.statut] || v.statut}</span>
            ${v.nombreCourses ? `<span style="font-size:0.72rem;color:var(--text-muted)">${v.nombreCourses} courses</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;min-width:70px">
          <div style="font-size:0.72rem;color:var(--text-muted)">Net</div>
          <div style="font-size:0.85rem;font-weight:700;color:#22c55e">${this._formatCurrency(v.montantNet || 0)}</div>
        </div>
      </div>
    `;
  },

  _nouveauVersement() {
    // Calculer le numero de semaine
    const now = new Date();
    const oneJan = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);

    const formHTML = `
      <form class="driver-form" onsubmit="return false">
        <div class="form-group">
          <label>Periode</label>
          <input type="text" name="periode" placeholder="ex: Semaine ${weekNum}" value="Semaine ${weekNum}">
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" name="date" required value="${now.toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Montant brut (FCFA)</label>
          <input type="number" name="montantBrut" required min="1" placeholder="0" inputmode="numeric"
                 oninput="VersementsPage._calcCommission(this.value)">
        </div>
        <div id="commission-preview" style="font-size:0.82rem;color:var(--text-secondary);margin:-8px 0 12px;padding:0 4px"></div>
        <div class="form-group">
          <label>Nombre de courses</label>
          <input type="number" name="nombreCourses" min="0" placeholder="0" inputmode="numeric">
        </div>
        <div class="form-group">
          <label>Commentaire (optionnel)</label>
          <textarea name="commentaire" rows="2" placeholder="Note supplementaire..."></textarea>
        </div>
      </form>
    `;

    DriverModal.show('Nouveau versement', formHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Soumettre', class: 'btn btn-success', onclick: 'VersementsPage._submitVersement()' }
    ]);
  },

  _calcCommission(val) {
    const el = document.getElementById('commission-preview');
    if (!el) return;
    const brut = parseInt(val) || 0;
    const commission = Math.round(brut * 0.20);
    const net = brut - commission;
    if (brut > 0) {
      el.textContent = `Commission: ${commission.toLocaleString('fr-FR')} FCFA • Net: ${net.toLocaleString('fr-FR')} FCFA`;
    } else {
      el.textContent = '';
    }
  },

  async _submitVersement() {
    const values = DriverModal.getFormValues(['date', 'periode', 'montantBrut', 'nombreCourses', 'commentaire']);

    const montant = parseInt(values.montantBrut);
    if (!montant || montant <= 0) {
      DriverToast.show('Montant brut requis', 'error');
      return;
    }

    const result = await DriverStore.createVersement({
      date: values.date,
      periode: values.periode,
      montantBrut: montant,
      nombreCourses: parseInt(values.nombreCourses) || 0,
      commentaire: values.commentaire
    });

    if (result && !result.error) {
      DriverModal.close();
      DriverToast.show('Versement soumis avec succes', 'success');
      // Reload
      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  _formatCurrency(amount) {
    return amount.toLocaleString('fr-FR') + ' FCFA';
  },

  destroy() {}
};
