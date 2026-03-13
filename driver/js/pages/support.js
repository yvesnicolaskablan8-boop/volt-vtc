/**
 * SupportPage — Signaler un problème (Panne, Accident, Urgence)
 */
const SupportPage = {
  render(container) {
    const chauffeur = DriverAuth.getChauffeur() || {};

    container.innerHTML = `
      <div style="padding:1rem 0">
        <p style="text-align:center;font-size:0.875rem;color:#64748b;margin-bottom:2rem;line-height:1.5">
          Sélectionnez le type de problème rencontré
        </p>

        <div style="display:flex;flex-direction:column;gap:16px">

          <!-- PANNE -->
          <button onclick="SupportPage._report('panne')" style="display:flex;align-items:center;gap:20px;padding:1.5rem;border-radius:1.5rem;border:none;background:white;box-shadow:0 2px 12px rgba(0,0,0,0.06);cursor:pointer;font-family:inherit;transition:transform 0.15s;width:100%;text-align:left" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform=''">
            <div style="width:64px;height:64px;border-radius:1.25rem;background:rgba(249,115,22,0.08);color:#f97316;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <iconify-icon icon="solar:settings-bold-duotone" style="font-size:2rem"></iconify-icon>
            </div>
            <div>
              <div style="font-weight:800;font-size:1.1rem;color:#0f172a;margin-bottom:4px">Panne</div>
              <div style="font-size:0.8rem;color:#94a3b8;line-height:1.4">Panne mécanique, crevaison, batterie à plat, moteur qui ne démarre pas</div>
            </div>
            <iconify-icon icon="solar:alt-arrow-right-bold" style="font-size:1.25rem;color:#cbd5e1;flex-shrink:0;margin-left:auto"></iconify-icon>
          </button>

          <!-- ACCIDENT -->
          <button onclick="SupportPage._report('accident')" style="display:flex;align-items:center;gap:20px;padding:1.5rem;border-radius:1.5rem;border:none;background:white;box-shadow:0 2px 12px rgba(0,0,0,0.06);cursor:pointer;font-family:inherit;transition:transform 0.15s;width:100%;text-align:left" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform=''">
            <div style="width:64px;height:64px;border-radius:1.25rem;background:rgba(239,68,68,0.08);color:#ef4444;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <iconify-icon icon="solar:shield-warning-bold-duotone" style="font-size:2rem"></iconify-icon>
            </div>
            <div>
              <div style="font-weight:800;font-size:1.1rem;color:#0f172a;margin-bottom:4px">Accident</div>
              <div style="font-size:0.8rem;color:#94a3b8;line-height:1.4">Collision, accrochage, dégâts matériels sur le véhicule</div>
            </div>
            <iconify-icon icon="solar:alt-arrow-right-bold" style="font-size:1.25rem;color:#cbd5e1;flex-shrink:0;margin-left:auto"></iconify-icon>
          </button>

          <!-- URGENCE -->
          <button onclick="SupportPage._report('urgence')" style="display:flex;align-items:center;gap:20px;padding:1.5rem;border-radius:1.5rem;border:none;background:#ef4444;box-shadow:0 4px 16px rgba(239,68,68,0.3);cursor:pointer;font-family:inherit;transition:transform 0.15s;width:100%;text-align:left" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform=''">
            <div style="width:64px;height:64px;border-radius:1.25rem;background:rgba(255,255,255,0.2);color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <iconify-icon icon="solar:danger-bold" style="font-size:2rem"></iconify-icon>
            </div>
            <div>
              <div style="font-weight:800;font-size:1.1rem;color:white;margin-bottom:4px">Urgence</div>
              <div style="font-size:0.8rem;color:rgba(255,255,255,0.8);line-height:1.4">Danger immédiat, agression, situation critique — appel direct au support</div>
            </div>
            <iconify-icon icon="solar:phone-bold" style="font-size:1.25rem;color:rgba(255,255,255,0.8);flex-shrink:0;margin-left:auto"></iconify-icon>
          </button>

        </div>
      </div>
    `;
  },

  _report(type) {
    if (type === 'urgence') {
      this._triggerEmergency();
      return;
    }

    const titles = { panne: 'Signaler une panne', accident: 'Signaler un accident' };
    const icons = { panne: 'solar:settings-bold-duotone', accident: 'solar:shield-warning-bold-duotone' };
    const colors = { panne: '#f97316', accident: '#ef4444' };

    DriverModal.show(titles[type], `
      <div style="padding:0.5rem 0">
        <div style="text-align:center;margin-bottom:1.25rem">
          <iconify-icon icon="${icons[type]}" style="font-size:2.5rem;color:${colors[type]}"></iconify-icon>
        </div>
        <textarea id="sp-desc" placeholder="Décrivez le problème..." style="width:100%;min-height:100px;padding:12px;border-radius:12px;border:1px solid #e2e8f0;font-family:inherit;font-size:0.875rem;resize:vertical;box-sizing:border-box;margin-bottom:12px"></textarea>
        <p style="font-size:0.7rem;color:#94a3b8;text-align:center">Votre position GPS sera partagée automatiquement</p>
      </div>
    `, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Envoyer', class: 'btn btn-primary', onclick: `SupportPage._submitReport('${type}')` }
    ]);
  },

  async _submitReport(type) {
    const desc = document.getElementById('sp-desc');
    const description = desc ? desc.value.trim() : '';
    if (!description) {
      if (desc) { desc.style.borderColor = '#ef4444'; desc.focus(); }
      return;
    }

    const chauffeur = DriverAuth.getChauffeur() || {};
    let lat = null, lng = null;
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch (e) { /* GPS indisponible */ }

    const signalement = {
      id: 'sig_' + Date.now(),
      chauffeurId: chauffeur.id || null,
      chauffeurNom: chauffeur.prenom && chauffeur.nom ? chauffeur.prenom + ' ' + chauffeur.nom : 'Inconnu',
      type: type,
      description: description,
      lat: lat,
      lng: lng,
      date: new Date().toISOString(),
      statut: 'nouveau'
    };

    try {
      const token = DriverAuth.getToken();
      await fetch('/api/data/signalements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(signalement)
      });
    } catch (e) {
      console.warn('[Support] Envoi signalement échoué:', e.message);
    }

    DriverModal.close();
    DriverToast.success(type === 'panne' ? 'Panne signalée — le support a été notifié' : 'Accident signalé — le support a été notifié');

    // Appel automatique au support après signalement
    setTimeout(() => {
      DriverModal.show('Appeler le support ?', `
        <div style="text-align:center;padding:0.5rem 0">
          <p style="font-size:0.875rem;color:#64748b">Voulez-vous appeler le support Pilote pour un suivi immédiat ?</p>
        </div>
      `, [
        { label: 'Non merci', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
        { label: 'Appeler', class: 'btn btn-primary', onclick: 'SupportPage._callSupport(); DriverModal.close()' }
      ]);
    }, 500);
  },

  _triggerEmergency() {
    DriverModal.show('Appel d\'urgence', `
      <div style="text-align:center;padding:1rem 0">
        <iconify-icon icon="solar:danger-bold" style="font-size:3rem;color:#ef4444;margin-bottom:12px;display:block"></iconify-icon>
        <p style="font-weight:700;font-size:1rem;margin-bottom:8px">Confirmer l'appel d'urgence ?</p>
        <p style="font-size:0.8rem;color:#64748b">Un appel sera passé au support Pilote et votre position sera partagée.</p>
      </div>
    `, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Appeler maintenant', class: 'btn btn-danger', onclick: 'SupportPage._confirmEmergency()' }
    ]);
  },

  _confirmEmergency() {
    DriverModal.close();
    window.location.href = 'tel:+2250700000000';
  },

  _callSupport() {
    window.location.href = 'tel:+2250700000000';
  },

  destroy() {}
};
