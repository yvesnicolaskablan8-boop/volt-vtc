/**
 * PlusPage — « Autres services » : tout ce qui n'est pas quotidien,
 * présenté en grandes lignes très lisibles (public peu lettré :
 * une icône colorée, un libellé court, un chevron).
 * Contenu entièrement statique (aucune donnée utilisateur interpolée).
 */
const PlusPage = {
  async render(container) {
    const ligne = (route, icon, couleur, label, sousTitre) => `
      <button onclick="DriverRouter.navigate('${route}')" class="tap-scale" style="width:100%;display:flex;align-items:center;gap:16px;min-height:72px;padding:12px 16px;border-radius:1.25rem;border:1px solid var(--glass-border);background:var(--bg-card, rgba(255,255,255,0.04));cursor:pointer;font-family:inherit;margin-bottom:10px;text-align:left">
        <div style="width:52px;height:52px;border-radius:14px;background:${couleur};color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <iconify-icon icon="${icon}" style="font-size:1.7rem"></iconify-icon>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:1.05rem;font-weight:800;color:var(--text-primary)">${label}</div>
          ${sousTitre ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px">${sousTitre}</div>` : ''}
        </div>
        <iconify-icon icon="solar:alt-arrow-right-bold" style="font-size:1.3rem;color:var(--text-secondary);flex-shrink:0"></iconify-icon>
      </button>`;

    container.innerHTML = `
      <div style="font-size:1.35rem;font-weight:900;color:var(--text-primary);margin:4px 0 16px">Autres services</div>

      <div style="font-size:0.8rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin:4px 0 10px">Mon argent</div>
      ${ligne('versements', 'solar:history-bold-duotone', 'linear-gradient(135deg,#059669,#10b981)', 'Mes paiements', 'Payer et voir l’historique')}
      ${ligne('dettes', 'solar:hand-money-bold-duotone', 'linear-gradient(135deg,#ea580c,#f97316)', 'Mes dettes', 'Ce qu’il reste à payer')}
      ${ligne('contraventions', 'solar:document-text-bold-duotone', 'linear-gradient(135deg,#dc2626,#ef4444)', 'Mes amendes', 'Contraventions et contestations')}

      <div style="font-size:0.8rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin:18px 0 10px">Ma voiture</div>
      ${ligne('etat-lieux', 'solar:clipboard-check-bold-duotone', 'linear-gradient(135deg,#d97706,#f59e0b)', 'État de la voiture', 'Photos avant de commencer')}
      ${ligne('checklist', 'solar:checklist-minimalistic-bold-duotone', 'linear-gradient(135deg,#2563eb,#3b82f6)', 'Vérifier la voiture', 'Contrôle rapide du jour')}
      ${ligne('maintenance', 'solar:wrench-bold-duotone', 'linear-gradient(135deg,#6b7280,#9ca3af)', 'Entretien', 'Révisions et réparations')}
      ${ligne('trajets', 'solar:route-bold-duotone', 'linear-gradient(135deg,#0891b2,#06b6d4)', 'Mes trajets', 'Où j’ai roulé')}

      <div style="font-size:0.8rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin:18px 0 10px">Moi</div>
      ${ligne('classement', 'solar:cup-star-bold-duotone', 'linear-gradient(135deg,#ca8a04,#eab308)', 'Mon classement', 'Ma place parmi les chauffeurs')}
      ${ligne('documents', 'solar:folder-with-files-bold-duotone', 'linear-gradient(135deg,#7c3aed,#a855f7)', 'Mes documents', 'Permis, carte, assurance…')}
      ${ligne('contrat', 'solar:document-add-bold-duotone', 'linear-gradient(135deg,#475569,#64748b)', 'Mon contrat', '')}
      ${ligne('notifications', 'solar:bell-bold-duotone', 'linear-gradient(135deg,#db2777,#ec4899)', 'Notifications', '')}
      ${ligne('profil', 'solar:user-circle-bold-duotone', 'linear-gradient(135deg,#1d4ed8,#3b82f6)', 'Mon profil', 'Mes informations et mon code')}

      <div style="font-size:0.8rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin:18px 0 10px">Besoin d’aide ?</div>
      ${ligne('signalements', 'solar:danger-triangle-bold-duotone', 'linear-gradient(135deg,#dc2626,#ef4444)', 'Signaler un problème', 'Panne, accident, souci…')}
      ${ligne('support', 'solar:phone-calling-bold-duotone', 'linear-gradient(135deg,#16a34a,#22c55e)', 'Appeler le bureau', 'On vous répond')}
      <div style="height:12px"></div>
    `;
  }
};
