/**
 * SupportPage — Signaler un problème
 */
const SupportPage = {
  render(container) {
    const chauffeur = DriverAuth.getChauffeur() || {};

    container.innerHTML = `
      <!-- Emergency button section -->
      <div style="display:flex;flex-direction:column;align-items:center;padding:2rem 0 2.5rem">
        <div onclick="SupportPage._triggerEmergency()" style="width:128px;height:128px;border-radius:50%;background:rgba(239,68,68,0.05);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(239,68,68,0.1);cursor:pointer;transition:transform 0.15s;margin-bottom:1.5rem" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform=''">
          <div style="width:96px;height:96px;border-radius:50%;background:#ef4444;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(239,68,68,0.4)">
            <iconify-icon icon="solar:danger-bold" style="font-size:2.5rem;color:white"></iconify-icon>
          </div>
        </div>
        <h2 style="font-size:1.5rem;font-weight:900;color:#ef4444;text-transform:uppercase;letter-spacing:0.02em">Appel d'urgence</h2>
        <p style="margin-top:8px;text-align:center;font-size:0.875rem;font-weight:500;color:#64748b;max-width:280px;line-height:1.5">
          Maintenez le bouton presse pendant 3 secondes en cas de danger immediat.
        </p>
      </div>

      <!-- Quick contacts -->
      <div style="margin-bottom:2rem">
        <h3 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:1rem">Contacts rapides</h3>
        <div style="display:flex;flex-direction:column;gap:12px">
          <button onclick="SupportPage._callSupport()" style="display:flex;align-items:center;justify-content:space-between;padding:1.25rem;border-radius:1.5rem;background:white;border:1px solid #f1f5f9;box-shadow:0 1px 6px rgba(0,0,0,0.04);cursor:pointer;font-family:inherit;transition:transform 0.15s;width:100%" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
            <div style="display:flex;align-items:center;gap:16px">
              <div style="width:48px;height:48px;border-radius:1rem;background:rgba(59,130,246,0.08);color:#3b82f6;display:flex;align-items:center;justify-content:center">
                <iconify-icon icon="solar:headphones-round-bold-duotone" style="font-size:1.5rem"></iconify-icon>
              </div>
              <div style="text-align:left">
                <div style="font-weight:700;font-size:0.95rem;color:#0f172a">Support Volt 24/7</div>
                <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">Assistance technique et courses</div>
              </div>
            </div>
            <iconify-icon icon="solar:phone-bold-duotone" style="font-size:1.5rem;color:#3b82f6"></iconify-icon>
          </button>

          <button onclick="SupportPage._callMechanic()" style="display:flex;align-items:center;justify-content:space-between;padding:1.25rem;border-radius:1.5rem;background:white;border:1px solid #f1f5f9;box-shadow:0 1px 6px rgba(0,0,0,0.04);cursor:pointer;font-family:inherit;transition:transform 0.15s;width:100%" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
            <div style="display:flex;align-items:center;gap:16px">
              <div style="width:48px;height:48px;border-radius:1rem;background:rgba(249,115,22,0.08);color:#f97316;display:flex;align-items:center;justify-content:center">
                <iconify-icon icon="solar:settings-bold-duotone" style="font-size:1.5rem"></iconify-icon>
              </div>
              <div style="text-align:left">
                <div style="font-weight:700;font-size:0.95rem;color:#0f172a">Depannage / Mecanique</div>
                <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">En cas de panne ou crevaison</div>
              </div>
            </div>
            <iconify-icon icon="solar:phone-bold-duotone" style="font-size:1.5rem;color:#f97316"></iconify-icon>
          </button>
        </div>
      </div>

      <!-- Signaler un probleme -->
      <button onclick="DriverRouter.navigate('signalements')" style="width:100%;display:flex;align-items:center;justify-content:center;gap:12px;padding:1rem;border-radius:1rem;border:2px solid #e2e8f0;background:white;color:#0f172a;font-size:0.9rem;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:1.5rem;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
        <iconify-icon icon="solar:flag-bold-duotone" style="font-size:1.25rem;color:#f59e0b"></iconify-icon>
        Signaler un probleme
      </button>

      <!-- FAQ Section -->
      <div style="border-radius:1.5rem;background:#0f172a;padding:1.5rem;color:white">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <iconify-icon icon="solar:chat-square-dots-bold-duotone" style="font-size:1.5rem;color:#3b82f6"></iconify-icon>
          <h3 style="font-weight:800;font-size:1rem">FAQ Chauffeur</h3>
        </div>
        <p style="font-size:0.75rem;color:#94a3b8;line-height:1.6;margin-bottom:1rem">
          Retrouvez les reponses aux questions les plus frequentes sur les versements, les bonus et le reglement interieur.
        </p>

        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1rem">
          ${this._renderFaqItem('Comment faire un versement ?', 'Rendez-vous dans l\'onglet Finances et cliquez sur "Faire un versement".')}
          ${this._renderFaqItem('Quand dois-je verser ma recette ?', 'Chaque jour avant 23h59. Un retard entraine des penalites automatiques.')}
          ${this._renderFaqItem('Comment obtenir un bonus ?', 'Maintenez un score de conduite superieur a 70/100 et une activite Yango de 10h/jour.')}
        </div>

        <button onclick="DriverRouter.navigate('messagerie')" style="width:100%;padding:12px;border-radius:1rem;border:none;background:rgba(255,255,255,0.1);color:white;font-size:0.875rem;font-weight:700;cursor:pointer;font-family:inherit;transition:background 0.15s">
          Contacter le support
        </button>
      </div>
    `;
  },

  _renderFaqItem(question, answer) {
    return `
      <details style="border-radius:8px;overflow:hidden">
        <summary style="padding:10px 12px;background:rgba(255,255,255,0.06);border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between">
          ${question}
          <iconify-icon icon="solar:alt-arrow-down-linear" style="font-size:0.9rem;opacity:0.5"></iconify-icon>
        </summary>
        <div style="padding:8px 12px;font-size:0.75rem;color:#94a3b8;line-height:1.5">
          ${answer}
        </div>
      </details>
    `;
  },

  _triggerEmergency() {
    DriverModal.show('Appel d\'urgence', `
      <div style="text-align:center;padding:1rem 0">
        <iconify-icon icon="solar:danger-bold" style="font-size:3rem;color:#ef4444;margin-bottom:12px;display:block"></iconify-icon>
        <p style="font-weight:700;font-size:1rem;margin-bottom:8px">Confirmer l'appel d'urgence ?</p>
        <p style="font-size:0.8rem;color:#64748b">Un appel sera passe au support Volt et votre position sera partagee.</p>
      </div>
    `, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Confirmer', class: 'btn btn-danger', onclick: 'SupportPage._confirmEmergency()' }
    ]);
  },

  _confirmEmergency() {
    DriverModal.close();
    // Appeler le support
    window.location.href = 'tel:+2250700000000';
  },

  _callSupport() {
    window.location.href = 'tel:+2250700000000';
  },

  _callMechanic() {
    window.location.href = 'tel:+2250700000001';
  },

  destroy() {}
};
