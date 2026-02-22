/**
 * VersementsPage — Versements et historique
 */
const VersementsPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    // Fetch versements et deadline en parallele
    const [versements, deadline] = await Promise.all([
      DriverStore.getVersements(),
      DriverStore.getDeadline()
    ]);

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
    const totalPenalites = versMois.reduce((s, v) => s + (v.penaliteMontant || 0), 0);

    const monthNames = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];

    // Deadline banner
    let deadlineBannerHTML = '';
    if (deadline && deadline.configured) {
      const remaining = new Date(deadline.deadlineDate) - now;
      const statusClass = remaining <= 0 ? 'expired' : remaining <= 24 * 3600000 ? 'critical' : remaining <= 48 * 3600000 ? 'warning' : 'safe';
      const dlDate = new Date(deadline.deadlineDate);
      const heureLimit = String(dlDate.getHours()).padStart(2, '0') + 'h' + String(dlDate.getMinutes()).padStart(2, '0');

      let bannerTitle, timeText;
      if (remaining <= 0) {
        bannerTitle = deadline.deadlineType === 'quotidien'
          ? `Recette non versee ! (limite : ${heureLimit})`
          : 'Deadline depassee !';
        const elapsed = Math.abs(remaining);
        const retH = Math.floor(elapsed / 3600000);
        const retM = Math.floor((elapsed % 3600000) / 60000);
        timeText = `<i class="fas fa-exclamation-triangle"></i> Retard : ${retH}h ${String(retM).padStart(2, '0')}min`;
      } else {
        bannerTitle = deadline.deadlineType === 'quotidien'
          ? `Verse ta recette avant ${heureLimit}`
          : `Prochaine deadline : ${dlDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}`;
        timeText = this._formatCountdown(remaining);
      }

      deadlineBannerHTML = `
        <div class="deadline-banner ${statusClass}">
          <div class="deadline-banner-icon"><i class="fas ${remaining <= 0 ? 'fa-exclamation-circle' : 'fa-clock'}"></i></div>
          <div class="deadline-banner-text">
            <div class="deadline-banner-title">${bannerTitle}</div>
            <div class="deadline-banner-time" id="versements-countdown">${timeText}</div>
          </div>
          ${deadline.penaliteActive && remaining <= 0 ? `
            <div class="deadline-banner-penalty">
              <i class="fas fa-coins"></i>
              ${deadline.penaliteType === 'pourcentage' ? deadline.penaliteValeur + '%' : this._formatCurrency(deadline.penaliteValeur)}
            </div>
          ` : ''}
        </div>
      `;
    }

    container.innerHTML = `
      <!-- Deadline banner -->
      ${deadlineBannerHTML}

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
        ${totalPenalites > 0 ? `
        <div class="stats-row">
          <span class="stats-label"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i> Penalites</span>
          <span class="stats-value" style="color:#ef4444">-${this._formatCurrency(totalPenalites)}</span>
        </div>
        ` : ''}
        <div class="stats-row">
          <span class="stats-label">Net</span>
          <span class="stats-value highlight">${this._formatCurrency(totalNet)}</span>
        </div>
      </div>

      <!-- Bouton nouveau -->
      <button class="btn btn-success btn-block btn-lg" onclick="VersementsPage._nouveauVersement()">
        <i class="fas fa-plus-circle"></i> Faire un versement
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

    // Timer live pour la banniere
    if (deadline && deadline.configured) {
      this._deadlineDate = new Date(deadline.deadlineDate);
      this._deadlineType = deadline.deadlineType || 'quotidien';
      this._startBannerTimer();
    }
  },

  _bannerInterval: null,

  _startBannerTimer() {
    if (this._bannerInterval) clearInterval(this._bannerInterval);
    this._bannerInterval = setInterval(() => {
      const el = document.getElementById('versements-countdown');
      if (!el) { clearInterval(this._bannerInterval); return; }
      const remaining = this._deadlineDate - new Date();
      if (remaining <= 0) {
        const elapsed = Math.abs(remaining);
        const retH = Math.floor(elapsed / 3600000);
        const retM = Math.floor((elapsed % 3600000) / 60000);
        el.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Retard : ${retH}h ${String(retM).padStart(2, '0')}min`;
      } else {
        el.innerHTML = this._formatCountdown(remaining);
      }
    }, 1000);
  },

  _formatCountdown(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (d > 0) return `${d}j ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
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
            ${v.enRetard && v.penaliteMontant > 0 ? `<span class="badge retard-penalty"><i class="fas fa-coins"></i> -${this._formatCurrency(v.penaliteMontant)}</span>` : ''}
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

    DriverModal.show('Faire un versement', formHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Valider', class: 'btn btn-success', onclick: 'VersementsPage._submitVersement()' }
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
      if (result.enRetard && result.penaliteMontant > 0) {
        DriverToast.show(`Versement enregistre (penalite: ${result.penaliteMontant.toLocaleString('fr-FR')} FCFA)`, 'warning');
      } else {
        DriverToast.show('Versement enregistre avec succes', 'success');
      }
      // Reload
      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  _formatCurrency(amount) {
    return amount.toLocaleString('fr-FR') + ' FCFA';
  },

  destroy() {
    if (this._bannerInterval) { clearInterval(this._bannerInterval); this._bannerInterval = null; }
  }
};
