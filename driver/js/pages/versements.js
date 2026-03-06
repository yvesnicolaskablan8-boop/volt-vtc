/**
 * VersementsPage — Versements et historique avec paiement Wave
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

    // Verifier si on revient d'un paiement Wave (params dans le hash)
    this._checkWaveReturn(versements);

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
      if (deadline.alreadyPaid) {
        deadlineBannerHTML = `
          <div style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:rgba(34,197,94,0.06);border:1.5px solid rgba(34,197,94,0.15);margin-bottom:1rem">
            <div style="width:44px;height:44px;border-radius:1rem;background:rgba(34,197,94,0.1);color:#22c55e;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <iconify-icon icon="solar:check-circle-bold" style="font-size:1.5rem"></iconify-icon>
            </div>
            <div>
              <div style="font-weight:800;font-size:0.9rem;color:#16a34a">Recette du jour versee</div>
              <div style="font-size:0.75rem;color:#64748b;margin-top:2px">Ton versement a bien ete enregistre</div>
            </div>
          </div>
        `;
      } else {
        const remaining = new Date(deadline.deadlineDate) - now;
        const dlDate = new Date(deadline.deadlineDate);
        const heureLimit = String(dlDate.getHours()).padStart(2, '0') + 'h' + String(dlDate.getMinutes()).padStart(2, '0');

        let bannerTitle, timeText;
        const bannerColor = remaining <= 0 ? '#ef4444' : remaining <= 24 * 3600000 ? '#ef4444' : remaining <= 48 * 3600000 ? '#f59e0b' : '#3b82f6';
        const bannerBg = remaining <= 0 ? 'rgba(239,68,68,0.06)' : remaining <= 24 * 3600000 ? 'rgba(239,68,68,0.06)' : remaining <= 48 * 3600000 ? 'rgba(245,158,11,0.06)' : 'rgba(59,130,246,0.06)';
        const bannerBorder = remaining <= 0 ? 'rgba(239,68,68,0.15)' : remaining <= 24 * 3600000 ? 'rgba(239,68,68,0.15)' : remaining <= 48 * 3600000 ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)';

        if (remaining <= 0) {
          bannerTitle = deadline.deadlineType === 'quotidien'
            ? `Recette non versee ! (limite : ${heureLimit})`
            : 'Deadline depassee !';
          const elapsed = Math.abs(remaining);
          const retH = Math.floor(elapsed / 3600000);
          const retM = Math.floor((elapsed % 3600000) / 60000);
          timeText = `Retard : ${retH}h ${String(retM).padStart(2, '0')}min`;
        } else {
          bannerTitle = deadline.deadlineType === 'quotidien'
            ? `Verse ta recette avant ${heureLimit}`
            : `Prochaine deadline : ${dlDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}`;
          timeText = this._formatCountdown(remaining);
        }

        deadlineBannerHTML = `
          <div style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:${bannerBg};border:1.5px solid ${bannerBorder};margin-bottom:1rem">
            <div style="width:44px;height:44px;border-radius:1rem;background:${bannerBg};color:${bannerColor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <iconify-icon icon="${remaining <= 0 ? 'solar:danger-bold' : 'solar:alarm-bold-duotone'}" style="font-size:1.5rem"></iconify-icon>
            </div>
            <div style="flex:1">
              <div style="font-weight:800;font-size:0.85rem;color:${bannerColor}">${bannerTitle}</div>
              <div style="font-size:0.8rem;color:#64748b;margin-top:2px;font-weight:700" id="versements-countdown">${timeText}</div>
            </div>
            ${deadline.penaliteActive && remaining <= 0 ? `
              <div style="padding:4px 10px;border-radius:2rem;background:rgba(239,68,68,0.1);color:#ef4444;font-size:0.7rem;font-weight:700">
                <iconify-icon icon="solar:tag-bold" style="font-size:0.8rem;vertical-align:middle"></iconify-icon>
                ${deadline.penaliteType === 'pourcentage' ? deadline.penaliteValeur + '%' : this._formatCurrency(deadline.penaliteValeur)}
              </div>
            ` : ''}
          </div>
        `;
      }
    }

    container.innerHTML = `
      <!-- Deadline banner -->
      ${deadlineBannerHTML}

      <!-- Resume du mois — Green gradient card -->
      <div style="border-radius:1.5rem;background:linear-gradient(135deg,#22c55e,#16a34a);padding:1.5rem;color:white;margin-bottom:1rem;box-shadow:0 8px 24px rgba(34,197,94,0.25)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:1rem;opacity:0.9">
          <iconify-icon icon="solar:chart-bold-duotone" style="font-size:1.2rem"></iconify-icon>
          <span style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">${monthNames[now.getMonth()]} ${now.getFullYear()}</span>
        </div>
        <div style="font-size:2rem;font-weight:900;margin-bottom:1rem">${this._formatCurrency(totalNet)}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem">
            <span style="opacity:0.8">Total brut</span>
            <span style="font-weight:700">${this._formatCurrency(totalBrut)}</span>
          </div>
          ${totalCommission > 0 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem">
            <span style="opacity:0.8">Frais Wave (1%)</span>
            <span style="font-weight:700;color:rgba(255,255,255,0.8)">assumes par Wave</span>
          </div>
          ` : ''}
          ${totalPenalites > 0 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem">
            <span style="opacity:0.8"><iconify-icon icon="solar:danger-triangle-bold" style="font-size:0.9rem;vertical-align:middle"></iconify-icon> Penalites</span>
            <span style="font-weight:700;color:#fde68a">-${this._formatCurrency(totalPenalites)}</span>
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Boutons de versement -->
      <div style="display:flex;gap:10px;margin-bottom:1.5rem">
        <!-- Bouton Wave -->
        <button onclick="VersementsPage._payerWave()" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:1rem;border-radius:1.25rem;border:none;background:linear-gradient(135deg,#1B98F5,#0D6EFD);color:white;font-size:0.9rem;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px rgba(13,110,253,0.3);transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform=''">
          <iconify-icon icon="solar:wallet-money-bold" style="font-size:1.3rem"></iconify-icon>
          Payer via Wave
        </button>
        <!-- Bouton classique -->
        <button onclick="VersementsPage._nouveauVersement()" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:1rem;border-radius:1.25rem;border:2px solid #e2e8f0;background:white;color:#334155;font-size:0.9rem;font-weight:800;cursor:pointer;font-family:inherit;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform=''">
          <iconify-icon icon="solar:add-circle-bold" style="font-size:1.3rem"></iconify-icon>
          Declarer
        </button>
      </div>

      <!-- Historique -->
      <h3 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:1rem">Historique</h3>
      <div id="versements-list" style="display:flex;flex-direction:column;gap:10px">
        ${versements.length === 0
          ? `<div style="text-align:center;padding:3rem 0">
               <iconify-icon icon="solar:wallet-broken" style="font-size:3rem;color:#cbd5e1;display:block;margin-bottom:12px"></iconify-icon>
               <div style="font-size:0.9rem;color:#94a3b8;font-weight:500">Aucun versement</div>
             </div>`
          : versements.map(v => this._renderVersement(v)).join('')
        }
      </div>
    `;

    // Timer live pour la banniere (pas si deja paye)
    if (deadline && deadline.configured && !deadline.alreadyPaid) {
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
        el.innerHTML = `Retard : ${retH}h ${String(retM).padStart(2, '0')}min`;
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
    const statusColors = {
      en_attente: { bg: 'rgba(245,158,11,0.08)', color: '#f59e0b' },
      valide: { bg: 'rgba(34,197,94,0.08)', color: '#22c55e' },
      retard: { bg: 'rgba(239,68,68,0.08)', color: '#ef4444' },
      partiel: { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6' }
    };
    const sc = statusColors[v.statut] || statusColors.en_attente;
    const date = v.date ? new Date(v.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '--';
    const iconName = v.moyenPaiement === 'wave'
      ? 'solar:wallet-money-bold'
      : v.statut === 'valide' ? 'solar:check-circle-bold'
      : v.statut === 'retard' ? 'solar:danger-triangle-bold'
      : 'solar:clock-circle-bold';

    // Badge Wave
    const waveBadge = v.moyenPaiement === 'wave'
      ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:2rem;background:rgba(13,110,253,0.08);color:#0D6EFD;font-size:0.6rem;font-weight:700;margin-left:4px">
           <iconify-icon icon="solar:wallet-money-bold" style="font-size:0.7rem"></iconify-icon> Wave
         </span>`
      : '';

    return `
      <div style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:white;border:1px solid #f1f5f9;box-shadow:0 1px 4px rgba(0,0,0,0.03)">
        <div style="width:44px;height:44px;border-radius:1rem;background:${v.moyenPaiement === 'wave' ? 'rgba(13,110,253,0.08)' : sc.bg};color:${v.moyenPaiement === 'wave' ? '#0D6EFD' : sc.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <iconify-icon icon="${iconName}" style="font-size:1.3rem"></iconify-icon>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
            <span style="font-size:0.9rem;font-weight:800;color:#0f172a">${this._formatCurrency(v.montantBrut || 0)}</span>
            <span style="font-size:0.85rem;font-weight:800;color:#22c55e">${this._formatCurrency(v.montantNet || 0)}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:0.72rem;color:#94a3b8;font-weight:500">${date} ${v.periode ? ' · ' + v.periode : ''}${v.nombreCourses ? ' · ' + v.nombreCourses + ' courses' : ''}</span>
            <span style="display:inline-flex;align-items:center;gap:3px">
              ${waveBadge}
              <span style="padding:2px 10px;border-radius:2rem;background:${sc.bg};color:${sc.color};font-size:0.65rem;font-weight:700">${statusLabels[v.statut] || v.statut}</span>
            </span>
          </div>
          ${v.enRetard && v.penaliteMontant > 0 ? `
            <div style="margin-top:4px;font-size:0.7rem;color:#ef4444;font-weight:600">
              <iconify-icon icon="solar:danger-triangle-bold" style="font-size:0.8rem;vertical-align:middle"></iconify-icon> Penalite: -${this._formatCurrency(v.penaliteMontant)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  // ===== Paiement Wave =====

  _payerWave() {
    const now = new Date();
    const oneJan = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);

    const formHTML = `
      <form class="driver-form" onsubmit="return false">
        <div style="display:flex;align-items:center;gap:12px;padding:1rem;border-radius:1rem;background:rgba(13,110,253,0.06);border:1.5px solid rgba(13,110,253,0.12);margin-bottom:1rem">
          <iconify-icon icon="solar:wallet-money-bold" style="font-size:2rem;color:#0D6EFD"></iconify-icon>
          <div>
            <div style="font-weight:800;font-size:0.9rem;color:#0D6EFD">Paiement via Wave</div>
            <div style="font-size:0.72rem;color:#64748b;margin-top:2px">Tu seras redirige vers Wave pour effectuer le paiement</div>
          </div>
        </div>
        <div class="form-group">
          <label>Periode</label>
          <input type="text" name="periode" placeholder="ex: Semaine ${weekNum}" value="Semaine ${weekNum}">
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" name="date" required value="${now.toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Montant a verser (FCFA)</label>
          <input type="number" name="montantBrut" required min="1" placeholder="0" inputmode="numeric">
        </div>
        <div class="form-group">
          <label>Commentaire (optionnel)</label>
          <textarea name="commentaire" rows="2" placeholder="Note supplementaire..."></textarea>
        </div>
        <div id="wave-recap" style="display:none;padding:1rem;border-radius:1rem;background:#f8fafc;border:1px solid #e2e8f0;margin-top:0.5rem">
          <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:8px">Recapitulatif</div>
          <div id="wave-recap-content"></div>
        </div>
      </form>
    `;

    DriverModal.show('Payer via Wave', formHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Payer avec Wave', class: 'btn btn-primary', onclick: 'VersementsPage._submitWave()', id: 'btn-wave-pay' }
    ]);

    // Calculer recapitulatif en temps reel
    setTimeout(() => {
      const montantInput = document.querySelector('#modal-content [name="montantBrut"]');
      if (montantInput) {
        montantInput.addEventListener('input', () => this._updateWaveRecap(montantInput.value));
      }
    }, 100);
  },

  _updateWaveRecap(val) {
    const montant = parseInt(val) || 0;
    const recap = document.getElementById('wave-recap');
    const content = document.getElementById('wave-recap-content');
    if (!recap || !content) return;

    if (montant <= 0) {
      recap.style.display = 'none';
      return;
    }

    recap.style.display = 'block';
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px">
        <span style="color:#64748b">Montant a verser</span>
        <span style="font-weight:700">${this._formatCurrency(montant)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px">
        <span style="color:#64748b">Frais Wave (1%)</span>
        <span style="font-weight:700;color:#94a3b8">inclus</span>
      </div>
      <div style="border-top:1px solid #e2e8f0;padding-top:6px;margin-top:6px;display:flex;justify-content:space-between;font-size:0.9rem">
        <span style="font-weight:800;color:#0f172a">Total preleve</span>
        <span style="font-weight:900;color:#22c55e">${this._formatCurrency(montant)}</span>
      </div>
      <div style="margin-top:8px;font-size:0.7rem;color:#94a3b8;text-align:center">
        <iconify-icon icon="solar:info-circle-bold" style="font-size:0.8rem;vertical-align:middle"></iconify-icon>
        Le montant de <strong>${this._formatCurrency(montant)}</strong> sera preleve via Wave
      </div>
    `;
  },

  async _submitWave() {
    const values = DriverModal.getFormValues(['date', 'periode', 'montantBrut', 'commentaire']);

    const montant = parseInt(values.montantBrut);
    if (!montant || montant <= 0) {
      DriverToast.show('Montant requis', 'error');
      return;
    }

    // Desactiver le bouton
    const btn = document.getElementById('btn-wave-pay');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirection...';
    }

    const result = await DriverStore.createWaveCheckout({
      montantBrut: montant,
      date: values.date,
      periode: values.periode,
      commentaire: values.commentaire
    });

    if (result && result.waveLaunchUrl) {
      DriverModal.close();
      DriverToast.show('Redirection vers Wave...', 'info');
      // Ouvrir Wave dans le navigateur (pas dans une webview)
      window.location.href = result.waveLaunchUrl;
    } else {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Payer avec Wave';
      }
      DriverToast.show(result?.error || 'Erreur lors de la creation du paiement Wave', 'error');
    }
  },

  // Verifier si on revient d'un paiement Wave
  _checkWaveReturn(versements) {
    const hash = window.location.hash;
    if (!hash.includes('wave=')) return;

    const params = new URLSearchParams(hash.split('?')[1] || '');
    const waveStatus = params.get('wave');
    const versementId = params.get('id');

    // Nettoyer l'URL
    window.location.hash = '#/versements';

    if (waveStatus === 'success') {
      DriverToast.show('Paiement Wave effectue avec succes !', 'success');
      // Verifier le statut aupres du serveur
      if (versementId) {
        setTimeout(async () => {
          const status = await DriverStore.getWaveStatus(versementId);
          if (status && status.statut === 'valide') {
            DriverToast.show('Versement confirme et valide !', 'success');
            this.render(document.getElementById('app-content'));
          }
        }, 2000);
      }
    } else if (waveStatus === 'error') {
      DriverToast.show('Le paiement Wave a echoue ou a ete annule', 'error');
    }
  },

  // ===== Versement classique (declaration manuelle) =====

  _nouveauVersement() {
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
          <label>Montant (FCFA)</label>
          <input type="number" name="montantBrut" required min="1" placeholder="0" inputmode="numeric">
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

  async _submitVersement() {
    const values = DriverModal.getFormValues(['date', 'periode', 'montantBrut', 'commentaire']);

    const montant = parseInt(values.montantBrut);
    if (!montant || montant <= 0) {
      DriverToast.show('Montant requis', 'error');
      return;
    }

    const result = await DriverStore.createVersement({
      date: values.date,
      periode: values.periode,
      montantBrut: montant,
      commentaire: values.commentaire
    });

    if (result && !result.error) {
      DriverModal.close();
      if (result.enRetard && result.penaliteMontant > 0) {
        DriverToast.show(`Versement enregistre (penalite: ${result.penaliteMontant.toLocaleString('fr-FR')} FCFA)`, 'warning');
      } else {
        DriverToast.show('Versement enregistre avec succes', 'success');
      }
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
