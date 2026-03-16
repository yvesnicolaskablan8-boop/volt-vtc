/**
 * TachesDriverPage — Mes Taches (chauffeur)
 * Le chauffeur voit les taches qui lui sont assignees et peut les demarrer/terminer
 */
const TachesDriverPage = {
  async render(container) {
    container.innerHTML = '<div style="text-align:center;padding:3rem;"><div class="spinner"></div><p style="margin-top:1rem;color:#94a3b8;">Chargement des taches...</p></div>';

    const data = await DriverStore.getTaches();
    if (data.error) {
      container.innerHTML = '<div style="text-align:center;padding:3rem;color:#ef4444;"><iconify-icon icon="solar:danger-triangle-bold-duotone" style="font-size:2rem"></iconify-icon><p>Erreur : ' + data.error + '</p></div>';
      return;
    }

    const taches = Array.isArray(data) ? data : [];
    const aFaire = taches.filter(t => t.statut === 'a_faire');
    const enCours = taches.filter(t => t.statut === 'en_cours');
    const terminees = taches.filter(t => t.statut === 'terminee');

    if (taches.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:3rem;">
          <iconify-icon icon="solar:checklist-bold-duotone" style="font-size:3rem;color:#22c55e;"></iconify-icon>
          <h3 style="margin-top:1rem;font-size:1.1rem;font-weight:700;">Aucune tache</h3>
          <p style="color:#94a3b8;font-size:0.85rem;">Vous n'avez pas de taches assignees pour le moment.</p>
        </div>
      `;
      return;
    }

    // Sort: urgentes first, then by echeance
    const sorted = [...taches].sort((a, b) => {
      const pOrd = { urgente: 0, haute: 1, normale: 2, basse: 3 };
      if (a.statut === 'terminee' && b.statut !== 'terminee') return 1;
      if (a.statut !== 'terminee' && b.statut === 'terminee') return -1;
      const pa = pOrd[a.priorite] ?? 2;
      const pb = pOrd[b.priorite] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.dateEcheance || '9999').localeCompare(b.dateEcheance || '9999');
    });

    const prioriteColors = { basse: '#3b82f6', normale: '#22c55e', haute: '#f97316', urgente: '#ef4444' };
    const prioriteLabels = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };
    const typeLabels = { maintenance: 'Maintenance', administratif: 'Administratif', livraison: 'Livraison', controle: 'Controle', autre: 'Autre' };
    const today = new Date().toISOString().split('T')[0];

    container.innerHTML = `
      <div style="margin-bottom:1.5rem;">
        <div style="display:flex;gap:8px;margin-bottom:1rem;">
          <div style="flex:1;padding:12px;border-radius:16px;background:rgba(249,115,22,0.08);text-align:center;">
            <div style="font-size:1.5rem;font-weight:800;color:#f97316;">${aFaire.length}</div>
            <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;">A faire</div>
          </div>
          <div style="flex:1;padding:12px;border-radius:16px;background:rgba(59,130,246,0.08);text-align:center;">
            <div style="font-size:1.5rem;font-weight:800;color:#3b82f6;">${enCours.length}</div>
            <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;">En cours</div>
          </div>
          <div style="flex:1;padding:12px;border-radius:16px;background:rgba(34,197,94,0.08);text-align:center;">
            <div style="font-size:1.5rem;font-weight:800;color:#22c55e;">${terminees.length}</div>
            <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;">Terminees</div>
          </div>
        </div>
      </div>

      <div id="driver-taches-list">
        ${sorted.map(t => {
          const pColor = prioriteColors[t.priorite] || '#6b7280';
          const isLate = t.dateEcheance && t.dateEcheance < today && t.statut !== 'terminee';
          const isDone = t.statut === 'terminee';
          return `
            <div style="margin-bottom:12px;padding:16px;border-radius:16px;background:${isDone ? 'rgba(34,197,94,0.04)' : 'var(--bg-card, #fff)'};border:1px solid ${isDone ? 'rgba(34,197,94,0.15)' : isLate ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.06)'};${isDone ? 'opacity:0.7;' : ''}">
              <div style="display:flex;align-items:start;justify-content:space-between;gap:8px;">
                <div style="flex:1;">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
                    <span style="padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;background:${pColor}1a;color:${pColor};">${prioriteLabels[t.priorite]}</span>
                    <span style="padding:2px 8px;border-radius:8px;font-size:10px;font-weight:600;background:rgba(99,102,241,0.1);color:#6366f1;">${typeLabels[t.type] || t.type}</span>
                    ${isLate ? '<span style="padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;background:rgba(239,68,68,0.12);color:#ef4444;">En retard</span>' : ''}
                    ${isDone ? '<span style="padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;background:rgba(34,197,94,0.12);color:#22c55e;">Terminee</span>' : ''}
                  </div>
                  <div style="font-weight:700;font-size:0.95rem;${isDone ? 'text-decoration:line-through;color:#94a3b8;' : ''}">${t.titre}</div>
                  ${t.description ? `<div style="font-size:0.8rem;color:#6b7280;margin-top:4px;line-height:1.4;">${t.description}</div>` : ''}
                  ${t.dateEcheance ? `<div style="font-size:0.75rem;color:${isLate ? '#ef4444' : '#94a3b8'};margin-top:6px;display:flex;align-items:center;gap:4px;"><iconify-icon icon="solar:calendar-date-bold-duotone" style="font-size:12px"></iconify-icon> Echeance : ${t.dateEcheance}</div>` : ''}
                  ${t.commentaireAdmin ? `<div style="font-size:0.75rem;color:#6366f1;margin-top:4px;padding:6px 8px;border-radius:8px;background:rgba(99,102,241,0.06);"><iconify-icon icon="solar:chat-round-dots-bold-duotone" style="font-size:10px"></iconify-icon> ${t.commentaireAdmin}</div>` : ''}
                </div>
              </div>
              ${!isDone ? `
              <div style="display:flex;gap:8px;margin-top:12px;">
                ${t.statut === 'a_faire' ? `<button onclick="TachesDriverPage._updateStatut('${t.id}', 'en_cours')" style="flex:1;padding:10px;border-radius:12px;border:none;background:linear-gradient(135deg,#3b82f6,#60a5fa);color:white;font-weight:700;font-size:0.8rem;cursor:pointer;font-family:inherit;">
                  <iconify-icon icon="solar:play-bold-duotone"></iconify-icon> Demarrer
                </button>` : ''}
                ${t.statut === 'en_cours' ? `<button onclick="TachesDriverPage._updateStatut('${t.id}', 'terminee')" style="flex:1;padding:10px;border-radius:12px;border:none;background:linear-gradient(135deg,#22c55e,#4ade80);color:white;font-weight:700;font-size:0.8rem;cursor:pointer;font-family:inherit;">
                  <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Terminer
                </button>` : ''}
              </div>` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <style>
        #driver-taches-list button:active { transform: scale(0.97); }
      </style>
    `;
  },

  async _updateStatut(id, statut) {
    const result = await DriverStore.updateTacheStatut(id, statut);
    if (result.error) {
      if (typeof DriverToast !== 'undefined') DriverToast.error(result.error);
      return;
    }
    if (typeof DriverToast !== 'undefined') {
      DriverToast.success(statut === 'terminee' ? 'Tache terminee !' : 'Tache demarree');
    }
    // Re-render
    const container = document.getElementById('page-container');
    if (container) this.render(container);
  }
};
