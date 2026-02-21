/**
 * ProfilPage — Profil chauffeur, vehicule, score de conduite
 */
const ProfilPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const [profil, vehicule, gpsData] = await Promise.all([
      DriverStore.getProfil(),
      DriverStore.getVehicule(),
      DriverStore.getGps()
    ]);

    if (!profil) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger le profil</p></div>';
      return;
    }

    // Initiales
    const initials = (profil.prenom || '').charAt(0) + (profil.nom || '').charAt(0);

    // Score de conduite
    const lastGps = gpsData && gpsData.length > 0 ? gpsData[0] : null;
    const scoreGlobal = lastGps ? lastGps.scoreGlobal : profil.scoreConduite || 0;
    const scoreClass = scoreGlobal >= 70 ? 'good' : scoreGlobal >= 50 ? 'medium' : 'bad';

    // Sous-scores
    const scores = lastGps ? [
      { label: 'Vitesse', value: lastGps.scoreVitesse || 0 },
      { label: 'Freinage', value: lastGps.scoreFreinage || 0 },
      { label: 'Acceleration', value: lastGps.scoreAcceleration || 0 },
      { label: 'Virage', value: lastGps.scoreVirage || 0 },
      { label: 'Regularite', value: lastGps.scoreRegularite || 0 }
    ] : [];

    container.innerHTML = `
      <!-- Profile Header -->
      <div class="profile-header">
        <div class="profile-avatar">${initials.toUpperCase()}</div>
        <div class="profile-name">${profil.prenom} ${profil.nom}</div>
        <div class="profile-info">
          <i class="fas fa-phone"></i> ${profil.telephone || '--'}
          ${profil.email ? ` • <i class="fas fa-envelope"></i> ${profil.email}` : ''}
        </div>
        <div class="profile-info" style="margin-top:4px">
          <span class="badge ${profil.statut === 'actif' ? 'success' : 'danger'}">${profil.statut || 'actif'}</span>
        </div>
      </div>

      <!-- Score de conduite -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-tachometer-alt"></i> Score de conduite</span>
        </div>
        <div class="score-circle ${scoreClass}">${scoreGlobal}</div>
        <div style="text-align:center;font-size:0.78rem;color:var(--text-muted);margin-bottom:16px">sur 100</div>
        ${scores.length > 0 ? scores.map(s => {
          const sc = s.value >= 70 ? 'good' : s.value >= 50 ? 'medium' : 'bad';
          return `
            <div class="score-bar">
              <span class="score-bar-label">${s.label}</span>
              <div class="score-bar-track">
                <div class="score-bar-fill ${sc}" style="width:${s.value}%"></div>
              </div>
              <span class="score-bar-value">${s.value}</span>
            </div>
          `;
        }).join('') : '<div style="font-size:0.82rem;color:var(--text-muted);text-align:center">Pas de donnees GPS</div>'}
      </div>

      <!-- Vehicule assigne -->
      ${vehicule ? `
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-car"></i> Vehicule assigne</span>
          <span class="card-icon cyan"><i class="fas fa-car"></i></span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem">
          <div><span style="color:var(--text-muted)">Marque</span><br><strong>${vehicule.marque}</strong></div>
          <div><span style="color:var(--text-muted)">Modele</span><br><strong>${vehicule.modele}</strong></div>
          <div><span style="color:var(--text-muted)">Immatriculation</span><br><strong>${vehicule.immatriculation}</strong></div>
          <div><span style="color:var(--text-muted)">Kilometrage</span><br><strong>${vehicule.kilometrage ? vehicule.kilometrage.toLocaleString('fr-FR') + ' km' : '--'}</strong></div>
          ${vehicule.typeEnergie ? `<div><span style="color:var(--text-muted)">Energie</span><br><strong>${vehicule.typeEnergie}</strong></div>` : ''}
          ${vehicule.couleur ? `<div><span style="color:var(--text-muted)">Couleur</span><br><strong>${vehicule.couleur}</strong></div>` : ''}
        </div>
      </div>
      ` : `
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-car"></i> Vehicule</span>
        </div>
        <div style="font-size:0.85rem;color:var(--text-muted);text-align:center;padding:1rem">Aucun vehicule assigne</div>
      </div>
      `}

      <!-- Documents -->
      ${profil.documents && profil.documents.length > 0 ? `
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-file-alt"></i> Documents</span>
        </div>
        ${profil.documents.map(doc => {
          const expired = doc.dateExpiration && new Date(doc.dateExpiration) < new Date();
          return `
            <div class="doc-item">
              <div>
                <div class="doc-name">${doc.nom || doc.type || 'Document'}</div>
                ${doc.dateExpiration ? `<div class="doc-expiry">Expire: ${new Date(doc.dateExpiration).toLocaleDateString('fr-FR')}</div>` : ''}
              </div>
              <span class="badge ${expired ? 'danger' : doc.statut === 'valide' ? 'success' : 'warning'}">${expired ? 'Expire' : doc.statut || 'Valide'}</span>
            </div>
          `;
        }).join('')}
      </div>
      ` : ''}

      <!-- Contrat -->
      ${profil.dateDebutContrat ? `
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-file-contract"></i> Contrat</span>
        </div>
        <div style="font-size:0.85rem">
          <div style="margin-bottom:4px"><span style="color:var(--text-muted)">Debut :</span> <strong>${new Date(profil.dateDebutContrat).toLocaleDateString('fr-FR')}</strong></div>
          ${profil.dateFinContrat ? `<div><span style="color:var(--text-muted)">Fin :</span> <strong>${new Date(profil.dateFinContrat).toLocaleDateString('fr-FR')}</strong></div>` : ''}
        </div>
      </div>
      ` : ''}

      <!-- Actions -->
      <div class="section-title">Actions</div>
      <button class="btn btn-outline btn-block" onclick="ProfilPage._changerPin()" style="margin-bottom:10px">
        <i class="fas fa-key"></i> Changer mon PIN
      </button>
      <button class="btn btn-danger btn-block" onclick="ProfilPage._deconnexion()">
        <i class="fas fa-sign-out-alt"></i> Deconnexion
      </button>

      <div style="height:20px"></div>
    `;
  },

  _changerPin() {
    const formHTML = `
      <form class="driver-form" onsubmit="return false">
        <div class="form-group">
          <label>Nouveau PIN (4 a 6 chiffres)</label>
          <input type="password" name="newPin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="****" required>
        </div>
        <div class="form-group">
          <label>Confirmer le PIN</label>
          <input type="password" name="confirmPin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="****" required>
        </div>
      </form>
    `;

    DriverModal.show('Changer mon PIN', formHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Changer', class: 'btn btn-primary', onclick: 'ProfilPage._submitPin()' }
    ]);
  },

  async _submitPin() {
    const values = DriverModal.getFormValues(['newPin', 'confirmPin']);

    if (!values.newPin || values.newPin.length < 4) {
      DriverToast.show('Le PIN doit contenir 4 a 6 chiffres', 'error');
      return;
    }

    if (values.newPin !== values.confirmPin) {
      DriverToast.show('Les PIN ne correspondent pas', 'error');
      return;
    }

    try {
      const user = DriverAuth.getUser();
      const apiBase = window.location.hostname === 'localhost'
        ? 'http://localhost:3001/api/driver/auth'
        : 'https://volt-vtc-production.up.railway.app/api/driver/auth';

      const res = await fetch(apiBase + '/set-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + DriverAuth.getToken()
        },
        body: JSON.stringify({
          userId: user.id,
          pin: values.newPin
        })
      });

      const data = await res.json();
      if (data.success) {
        DriverModal.close();
        DriverToast.show('PIN modifie avec succes', 'success');
      } else {
        DriverToast.show(data.error || 'Erreur', 'error');
      }
    } catch (e) {
      DriverToast.show('Erreur reseau', 'error');
    }
  },

  _deconnexion() {
    DriverModal.show('Deconnexion', '<p style="font-size:0.9rem;color:var(--text-secondary)">Voulez-vous vraiment vous deconnecter ?</p>', [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Deconnexion', class: 'btn btn-danger', onclick: 'DriverAuth.logout(); DriverModal.close();' }
    ]);
  },

  destroy() {}
};
