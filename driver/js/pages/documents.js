/**
 * DocumentsPage — Documents & Alertes du chauffeur
 */
const DocumentsPage = {
  _filter: 'tous',

  async render(container) {
    container.innerHTML = '<div style="padding:8px 0"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card" style="height:80px"></div><div class="skeleton skeleton-card" style="height:60px"></div></div>';

    const [profil, vehicule] = await Promise.all([
      DriverStore.getProfil(),
      DriverStore.getVehicule()
    ]);

    const chauffeur = profil?.chauffeur || {};
    const docs = chauffeur.documents || [];
    const v = vehicule || {};

    // Count by status
    const critiques = docs.filter(d => d.statut === 'expire' || d.statut === 'a_renouveler');
    const valides = docs.filter(d => d.statut === 'valide');

    container.innerHTML = `
      <!-- Filter tabs -->
      <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:1.5rem;scrollbar-width:none">
        <button class="doc-filter active" data-filter="tous" onclick="DocumentsPage._setFilter('tous')"
          style="flex-shrink:0;padding:8px 16px;border-radius:999px;border:none;font-size:0.75rem;font-weight:700;cursor:pointer;font-family:inherit;background:#3b82f6;color:white">
          Tous (${docs.length})
        </button>
        <button class="doc-filter" data-filter="critique" onclick="DocumentsPage._setFilter('critique')"
          style="flex-shrink:0;padding:8px 16px;border-radius:999px;border:none;font-size:0.75rem;font-weight:700;cursor:pointer;font-family:inherit;background:#f1f5f9;color:#64748b">
          Critique (${critiques.length})
        </button>
        <button class="doc-filter" data-filter="valide" onclick="DocumentsPage._setFilter('valide')"
          style="flex-shrink:0;padding:8px 16px;border-radius:999px;border:none;font-size:0.75rem;font-weight:700;cursor:pointer;font-family:inherit;background:#f1f5f9;color:#64748b">
          Valide (${valides.length})
        </button>
      </div>

      <!-- Priority alerts -->
      ${critiques.length > 0 ? `
        <div style="margin-bottom:1.5rem">
          <h3 style="font-weight:800;color:#ef4444;display:flex;align-items:center;gap:8px;margin-bottom:1rem;font-size:0.95rem">
            <iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon>Priorite elevee
          </h3>
          ${critiques.map(d => this._renderAlert(d, chauffeur)).join('')}
        </div>
      ` : ''}

      <!-- All documents -->
      <div id="docs-list">
        <h3 style="font-weight:800;margin-bottom:1rem;font-size:0.95rem">Mes Documents</h3>
        <div id="docs-cards" style="display:flex;flex-direction:column;gap:12px">
          ${docs.length > 0
            ? docs.map(d => this._renderDoc(d)).join('')
            : '<div style="text-align:center;padding:2rem;color:#94a3b8;font-size:0.875rem"><iconify-icon icon="solar:document-bold-duotone" style="font-size:2rem;display:block;margin-bottom:8px"></iconify-icon>Aucun document enregistre</div>'
          }
        </div>
      </div>

      <!-- Vehicle documents section -->
      ${v.immatriculation ? `
        <div style="margin-top:2rem">
          <h3 style="font-weight:800;margin-bottom:1rem;font-size:0.95rem">Vehicule : ${v.marque || ''} ${v.modele || ''}</h3>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem;border-radius:1rem;background:white;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:40px;height:40px;border-radius:12px;background:rgba(245,158,11,0.1);color:#f59e0b;display:flex;align-items:center;justify-content:center">
                  <iconify-icon icon="solar:shield-star-bold-duotone" style="font-size:1.25rem"></iconify-icon>
                </div>
                <div>
                  <div style="font-size:0.875rem;font-weight:700">Assurance</div>
                  <div style="font-size:0.625rem;color:#94a3b8">${v.immatriculation}</div>
                </div>
              </div>
              <span style="font-size:10px;font-weight:700;color:#22c55e">VALIDE</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem;border-radius:1rem;background:white;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:40px;height:40px;border-radius:12px;background:rgba(245,158,11,0.1);color:#f59e0b;display:flex;align-items:center;justify-content:center">
                  <iconify-icon icon="solar:document-text-bold-duotone" style="font-size:1.25rem"></iconify-icon>
                </div>
                <div>
                  <div style="font-size:0.875rem;font-weight:700">Visite technique</div>
                  <div style="font-size:0.625rem;color:#94a3b8">${v.immatriculation}</div>
                </div>
              </div>
              <span style="font-size:10px;font-weight:700;color:#22c55e">VALIDE</span>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  },

  _renderAlert(doc, chauffeur) {
    const isExpire = doc.statut === 'expire';
    const daysLeft = doc.dateExpiration ? Math.ceil((new Date(doc.dateExpiration) - new Date()) / 86400000) : null;
    const delayText = daysLeft !== null
      ? (daysLeft <= 0 ? 'Expire' : `Dans ${daysLeft}j`)
      : '';

    return `
      <div style="border-radius:1.5rem;border:1px solid ${isExpire ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'};background:${isExpire ? 'rgba(239,68,68,0.03)' : 'rgba(245,158,11,0.03)'};padding:1rem;margin-bottom:12px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div style="font-weight:700;font-size:0.9rem">${doc.nom}</div>
            <div style="font-size:0.75rem;color:#64748b;margin-top:4px">Echeance : ${doc.dateExpiration ? new Date(doc.dateExpiration).toLocaleDateString('fr-FR', {day:'numeric',month:'short',year:'numeric'}) : 'N/A'}</div>
          </div>
          <span style="padding:4px 8px;border-radius:999px;background:${isExpire ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)'};color:${isExpire ? '#ef4444' : '#f59e0b'};font-size:10px;font-weight:700;text-transform:uppercase">${delayText}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid ${isExpire ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)'};margin-top:12px;padding-top:12px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:32px;height:32px;border-radius:999px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#64748b">${(chauffeur.prenom || 'C')[0]}${(chauffeur.nom || 'H')[0]}</div>
            <span style="font-size:0.75rem;font-weight:500">${chauffeur.prenom || ''} ${chauffeur.nom || ''}</span>
          </div>
          <span style="font-size:0.75rem;font-weight:700;color:#3b82f6;cursor:pointer" onclick="DocumentsPage._uploadDoc('${doc.type}')">Renouveler</span>
        </div>
      </div>
    `;
  },

  _renderDoc(doc) {
    const statusColors = {
      valide: '#22c55e',
      expire: '#ef4444',
      a_renouveler: '#f59e0b',
      en_attente: '#3b82f6'
    };
    const statusLabels = {
      valide: 'VALIDE',
      expire: 'EXPIRE',
      a_renouveler: 'A RENOUVELER',
      en_attente: 'EN ATTENTE'
    };
    const color = statusColors[doc.statut] || '#94a3b8';
    const label = statusLabels[doc.statut] || doc.statut;
    const icon = doc.statut === 'valide' ? 'solar:check-circle-bold' : 'solar:danger-bold';

    const hasFile = !!doc.dateUpload;

    return `
      <div class="doc-card" data-statut="${doc.statut}" style="display:flex;align-items:center;justify-content:space-between;padding:1rem;border-radius:1rem;background:var(--bg-secondary, white);border:1px solid var(--border-color, #e2e8f0);box-shadow:0 1px 3px rgba(0,0,0,0.04)">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;border-radius:12px;background:${color}15;color:${color};display:flex;align-items:center;justify-content:center">
            <iconify-icon icon="solar:document-bold-duotone" style="font-size:1.25rem"></iconify-icon>
          </div>
          <div>
            <div style="font-size:0.875rem;font-weight:700">${doc.nom}</div>
            <div style="font-size:0.625rem;color:#94a3b8">${doc.dateExpiration ? 'Expire le ' + new Date(doc.dateExpiration).toLocaleDateString('fr-FR') : ''}</div>
            ${hasFile ? `<div style="font-size:0.6rem;color:#22c55e;font-weight:600;margin-top:2px;display:flex;align-items:center;gap:3px"><iconify-icon icon="solar:check-circle-bold" style="font-size:0.7rem"></iconify-icon> Fichier televerse</div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${hasFile ? `<button onclick="DocumentsPage._viewDoc('${doc.type}')" style="width:36px;height:36px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;display:flex;align-items:center;justify-content:center;cursor:pointer" title="Voir le fichier">
            <iconify-icon icon="solar:eye-bold-duotone" style="font-size:1.1rem;color:#8b5cf6"></iconify-icon>
          </button>` : ''}
          <button onclick="DocumentsPage._uploadDoc('${doc.type}')" style="width:36px;height:36px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;display:flex;align-items:center;justify-content:center;cursor:pointer" title="Televerser un fichier">
            <iconify-icon icon="solar:camera-bold-duotone" style="font-size:1.1rem;color:#3b82f6"></iconify-icon>
          </button>
          <iconify-icon icon="${icon}" style="color:${color};font-size:1.1rem"></iconify-icon>
        </div>
      </div>
    `;
  },

  _uploadDoc(type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        if (typeof DriverToast !== 'undefined') DriverToast.show('Fichier trop volumineux (max 5 Mo)', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        try {
          const res = await DriverStore.uploadDocument(type, base64, file.type, file.name);
          if (res && res.success) {
            if (typeof DriverToast !== 'undefined') DriverToast.show('Document televerse !', 'success');
            // Re-render the page
            const container = document.getElementById('app-content');
            if (container) DocumentsPage.render(container);
          } else {
            if (typeof DriverToast !== 'undefined') DriverToast.show(res?.error || 'Erreur lors du telechargement', 'error');
          }
        } catch (err) {
          console.error('Upload error:', err);
          if (typeof DriverToast !== 'undefined') DriverToast.show('Erreur reseau', 'error');
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  _setFilter(filter) {
    this._filter = filter;
    // Update active button styling
    document.querySelectorAll('.doc-filter').forEach(btn => {
      if (btn.dataset.filter === filter) {
        btn.style.background = '#3b82f6';
        btn.style.color = 'white';
      } else {
        btn.style.background = '#f1f5f9';
        btn.style.color = '#64748b';
      }
    });
    // Filter document cards
    document.querySelectorAll('.doc-card').forEach(card => {
      const statut = card.dataset.statut;
      if (filter === 'tous') {
        card.style.display = '';
      } else if (filter === 'critique') {
        card.style.display = (statut === 'expire' || statut === 'a_renouveler') ? '' : 'none';
      } else if (filter === 'valide') {
        card.style.display = (statut === 'valide') ? '' : 'none';
      }
    });
  },

  async _viewDoc(type) {
    try {
      if (typeof DriverToast !== 'undefined') DriverToast.show('Chargement...', 'info');
      const res = await DriverStore.getDocumentFile(type);
      if (!res || !res.fichierData) {
        if (typeof DriverToast !== 'undefined') DriverToast.show('Fichier introuvable', 'error');
        return;
      }
      const byteChars = atob(res.fichierData);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: res.fichierType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      if (res.fichierType && res.fichierType.startsWith('image/')) {
        // Show image in overlay modal
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
          <div style="position:relative;max-width:90vw;max-height:90vh;">
            <button onclick="this.closest('div[style*=fixed]').remove()" style="position:absolute;top:-12px;right:-12px;width:32px;height:32px;border-radius:50%;background:#ef4444;color:white;border:none;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1">&times;</button>
            <img src="${url}" style="max-width:90vw;max-height:85vh;border-radius:12px;object-fit:contain;" onload="URL.revokeObjectURL(this.src)">
            <div style="text-align:center;margin-top:8px;color:white;font-size:0.75rem;font-weight:600">${res.fichierNom || type}</div>
          </div>
        `;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
      } else {
        // PDF or other: open in new tab
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (err) {
      console.error('View doc error:', err);
      if (typeof DriverToast !== 'undefined') DriverToast.show('Erreur lors du chargement', 'error');
    }
  },

  destroy() {}
};
