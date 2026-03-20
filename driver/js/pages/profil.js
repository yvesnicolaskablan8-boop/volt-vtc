/**
 * ProfilPage — Profil chauffeur, vehicule, score de conduite
 */
const ProfilPage = {
  async render(container) {
    container.innerHTML = '<div style="padding:8px 0"><div class="skeleton skeleton-circle" style="width:96px;height:96px;margin:2rem auto 1rem"></div><div class="skeleton skeleton-line w-50" style="height:20px;margin:0 auto 8px"></div><div class="skeleton skeleton-line w-30" style="height:14px;margin:0 auto 16px"></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px"><div class="skeleton" style="height:90px;border-radius:1.25rem"></div><div class="skeleton" style="height:90px;border-radius:1.25rem"></div><div class="skeleton" style="height:90px;border-radius:1.25rem"></div></div></div>';

    // Tenter de charger le profil (avec retry automatique)
    let profil = null, vehicule = null, gpsData = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      [profil, vehicule, gpsData] = await Promise.all([
        DriverStore.getProfil(),
        DriverStore.getVehicule(),
        DriverStore.getGps()
      ]);
      if (profil) break;
      if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
    }

    if (!profil) {
      // Fallback: utiliser les donnees locales du chauffeur
      const localChauffeur = DriverAuth.getChauffeur();
      if (localChauffeur) {
        profil = localChauffeur;
      } else {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-exclamation-circle"></i>
            <p>Impossible de charger le profil</p>
            <button onclick="ProfilPage.render(document.getElementById('app-content'))" style="margin-top:12px;padding:10px 24px;border-radius:0.75rem;background:#3b82f6;color:white;border:none;font-weight:600;cursor:pointer">Reessayer</button>
          </div>`;
        return;
      }
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

    // Anciennete
    const anciennete = profil.dateDebutContrat
      ? (() => {
          const d = new Date(profil.dateDebutContrat);
          const diff = Math.floor((new Date() - d) / (1000 * 60 * 60 * 24 * 30));
          return diff < 12 ? diff + ' mois' : Math.floor(diff / 12) + ' an' + (Math.floor(diff / 12) > 1 ? 's' : '');
        })()
      : '--';

    container.innerHTML = `
      <!-- Profile Header Card -->
      <div style="display:flex;flex-direction:column;align-items:center;padding:2rem 0 1.5rem">
        <div style="width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#a855f7,#3b82f6);background-size:200% 200%;animation:gradientShift 3s ease infinite;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:800;color:white;margin-bottom:1rem;box-shadow:0 8px 24px rgba(59,130,246,0.3)">${initials.toUpperCase()}</div>
        <h2 style="font-size:1.5rem;font-weight:900;color:var(--text-primary);margin-bottom:4px">${profil.prenom} ${profil.nom}</h2>
        <div style="display:flex;align-items:center;gap:6px;font-size:0.85rem;color:#64748b;margin-bottom:8px">
          <iconify-icon icon="solar:phone-bold-duotone" style="font-size:1rem;color:#3b82f6"></iconify-icon>
          ${profil.telephone || '--'}
        </div>
        <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:2rem;background:${profil.statut === 'actif' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};color:${profil.statut === 'actif' ? '#16a34a' : '#ef4444'};font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">
          <span style="width:8px;height:8px;border-radius:50%;background:${profil.statut === 'actif' ? '#22c55e' : '#ef4444'}"></span>
          ${profil.statut || 'actif'}
        </div>
      </div>

      <!-- Stats Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:1.5rem">
        <div style="text-align:center;padding:1rem;border-radius:1.25rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);box-shadow:var(--shadow-elevated)">
          <div style="width:40px;height:40px;border-radius:0.75rem;background:rgba(59,130,246,0.08);color:#3b82f6;display:flex;align-items:center;justify-content:center;margin:0 auto 8px">
            <iconify-icon icon="solar:graph-up-bold-duotone" style="font-size:1.25rem"></iconify-icon>
          </div>
          <div style="font-size:1.25rem;font-weight:800;color:${scoreGlobal >= 70 ? '#22c55e' : scoreGlobal >= 50 ? '#f59e0b' : '#ef4444'}">${scoreGlobal}</div>
          <div style="font-size:0.65rem;color:#94a3b8;font-weight:600;text-transform:uppercase">Score</div>
        </div>
        <div style="text-align:center;padding:1rem;border-radius:1.25rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);box-shadow:var(--shadow-elevated)">
          <div style="width:40px;height:40px;border-radius:0.75rem;background:rgba(139,92,246,0.08);color:#8b5cf6;display:flex;align-items:center;justify-content:center;margin:0 auto 8px">
            <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:1.25rem"></iconify-icon>
          </div>
          <div style="font-size:1.25rem;font-weight:800;color:#0f172a">${anciennete}</div>
          <div style="font-size:0.65rem;color:#94a3b8;font-weight:600;text-transform:uppercase">Anciennete</div>
        </div>
        <div style="text-align:center;padding:1rem;border-radius:1.25rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);box-shadow:var(--shadow-elevated)">
          <div style="width:40px;height:40px;border-radius:0.75rem;background:rgba(249,115,22,0.08);color:#f97316;display:flex;align-items:center;justify-content:center;margin:0 auto 8px">
            <iconify-icon icon="solar:wheel-bold-duotone" style="font-size:1.25rem"></iconify-icon>
          </div>
          <div style="font-size:1.25rem;font-weight:800;color:#0f172a">${vehicule ? vehicule.immatriculation || 'Oui' : '--'}</div>
          <div style="font-size:0.65rem;color:#94a3b8;font-weight:600;text-transform:uppercase">Vehicule</div>
        </div>
      </div>

      <!-- Score de conduite -->
      <div style="border-radius:1.5rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);padding:1.25rem;margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
          <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(34,197,94,0.08);color:#22c55e;display:flex;align-items:center;justify-content:center">
            <iconify-icon icon="solar:chart-2-bold-duotone" style="font-size:1.2rem"></iconify-icon>
          </div>
          <div style="font-weight:800;font-size:0.95rem;color:#0f172a">Score de conduite</div>
        </div>
        <div style="display:flex;align-items:center;gap:1.5rem;margin-bottom:${scores.length > 0 ? '1rem' : '0'}">
          <div style="width:80px;height:80px;border-radius:50%;background:${scoreGlobal >= 70 ? 'rgba(34,197,94,0.1)' : scoreGlobal >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="font-size:2rem;font-weight:900;color:${scoreGlobal >= 70 ? '#22c55e' : scoreGlobal >= 50 ? '#f59e0b' : '#ef4444'}">${scoreGlobal}</span>
          </div>
          <div style="flex:1">
            <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:4px">sur 100</div>
            <div style="height:8px;border-radius:4px;background:#f1f5f9;overflow:hidden">
              <div style="height:100%;width:${scoreGlobal}%;border-radius:4px;background:${scoreGlobal >= 70 ? '#22c55e' : scoreGlobal >= 50 ? '#f59e0b' : '#ef4444'};transition:width 0.5s"></div>
            </div>
          </div>
        </div>
        ${scores.length > 0 ? `
          <div style="display:flex;flex-direction:column;gap:10px">
            ${scores.map(s => {
              const color = s.value >= 70 ? '#22c55e' : s.value >= 50 ? '#f59e0b' : '#ef4444';
              return `
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:0.75rem;color:#64748b;width:80px;font-weight:600">${s.label}</span>
                  <div style="flex:1;height:6px;border-radius:3px;background:#f1f5f9;overflow:hidden">
                    <div style="height:100%;width:${s.value}%;border-radius:3px;background:${color}"></div>
                  </div>
                  <span style="font-size:0.75rem;font-weight:700;color:${color};width:28px;text-align:right">${s.value}</span>
                </div>
              `;
            }).join('')}
          </div>
        ` : '<div style="font-size:0.82rem;color:#94a3b8;text-align:center">Pas de donnees GPS</div>'}
      </div>

      <!-- Mes badges -->
      <div id="profil-badges-section"></div>

      <!-- Informations personnelles -->
      <div style="border-radius:1.5rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);padding:1.25rem;margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
          <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(59,130,246,0.08);color:#3b82f6;display:flex;align-items:center;justify-content:center">
            <iconify-icon icon="solar:user-id-bold-duotone" style="font-size:1.2rem"></iconify-icon>
          </div>
          <div style="font-weight:800;font-size:0.95rem;color:#0f172a">Informations personnelles</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid #f1f5f9">
            <span style="font-size:0.8rem;color:#94a3b8;font-weight:500">Telephone</span>
            <span style="font-size:0.85rem;font-weight:700;color:#0f172a">${profil.telephone || '--'}</span>
          </div>
          ${profil.email ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid #f1f5f9">
            <span style="font-size:0.8rem;color:#94a3b8;font-weight:500">Email</span>
            <span style="font-size:0.85rem;font-weight:700;color:#0f172a">${profil.email}</span>
          </div>
          ` : ''}
          ${profil.dateDebutContrat ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid #f1f5f9">
            <span style="font-size:0.8rem;color:#94a3b8;font-weight:500">Debut contrat</span>
            <span style="font-size:0.85rem;font-weight:700;color:#0f172a">${new Date(profil.dateDebutContrat).toLocaleDateString('fr-FR')}</span>
          </div>
          ` : ''}
          ${profil.dateFinContrat ? `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:0.8rem;color:#94a3b8;font-weight:500">Fin contrat</span>
            <span style="font-size:0.85rem;font-weight:700;color:#0f172a">${new Date(profil.dateFinContrat).toLocaleDateString('fr-FR')}</span>
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Vehicule assigne -->
      <div style="border-radius:1.5rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);padding:1.25rem;margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
          <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(6,182,212,0.08);color:#06b6d4;display:flex;align-items:center;justify-content:center">
            <iconify-icon icon="solar:wheel-bold-duotone" style="font-size:1.2rem"></iconify-icon>
          </div>
          <div style="font-weight:800;font-size:0.95rem;color:#0f172a">Vehicule assigne</div>
        </div>
        ${vehicule ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div style="padding:12px;border-radius:1rem;background:#f8fafc">
              <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px">Marque</div>
              <div style="font-size:0.9rem;font-weight:700;color:#0f172a">${vehicule.marque || '--'}</div>
            </div>
            <div style="padding:12px;border-radius:1rem;background:#f8fafc">
              <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px">Modele</div>
              <div style="font-size:0.9rem;font-weight:700;color:#0f172a">${vehicule.modele || '--'}</div>
            </div>
            <div style="padding:12px;border-radius:1rem;background:#f8fafc">
              <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px">Immatriculation</div>
              <div style="font-size:0.9rem;font-weight:700;color:#0f172a">${vehicule.immatriculation || '--'}</div>
            </div>
            <div style="padding:12px;border-radius:1rem;background:#f8fafc">
              <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px">Kilometrage</div>
              <div style="font-size:0.9rem;font-weight:700;color:#0f172a">${vehicule.kilometrage ? vehicule.kilometrage.toLocaleString('fr-FR') + ' km' : '--'}</div>
            </div>
            ${vehicule.typeEnergie ? `
            <div style="padding:12px;border-radius:1rem;background:#f8fafc">
              <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px">Energie</div>
              <div style="font-size:0.9rem;font-weight:700;color:#0f172a">${vehicule.typeEnergie}</div>
            </div>` : ''}
            ${vehicule.couleur ? `
            <div style="padding:12px;border-radius:1rem;background:#f8fafc">
              <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px">Couleur</div>
              <div style="font-size:0.9rem;font-weight:700;color:#0f172a">${vehicule.couleur}</div>
            </div>` : ''}
          </div>
        ` : `
          <div style="text-align:center;padding:1.5rem 0">
            <iconify-icon icon="solar:car-broken" style="font-size:2.5rem;color:#cbd5e1;display:block;margin-bottom:8px"></iconify-icon>
            <div style="font-size:0.85rem;color:#94a3b8;font-weight:500">Aucun vehicule assigne</div>
          </div>
        `}
      </div>

      <!-- Documents -->
      ${profil.documents && profil.documents.length > 0 ? `
      <div style="border-radius:1.5rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);padding:1.25rem;margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
          <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(245,158,11,0.08);color:#f59e0b;display:flex;align-items:center;justify-content:center">
            <iconify-icon icon="solar:document-bold-duotone" style="font-size:1.2rem"></iconify-icon>
          </div>
          <div style="font-weight:800;font-size:0.95rem;color:#0f172a">Documents</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${profil.documents.map(doc => {
            const expired = doc.dateExpiration && new Date(doc.dateExpiration) < new Date();
            const statusColor = expired ? '#ef4444' : doc.statut === 'valide' ? '#22c55e' : '#f59e0b';
            const statusBg = expired ? 'rgba(239,68,68,0.08)' : doc.statut === 'valide' ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)';
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-radius:1rem;background:#f8fafc">
                <div>
                  <div style="font-size:0.85rem;font-weight:700;color:#0f172a">${doc.nom || doc.type || 'Document'}</div>
                  ${doc.dateExpiration ? `<div style="font-size:0.7rem;color:#94a3b8;margin-top:2px">Expire: ${new Date(doc.dateExpiration).toLocaleDateString('fr-FR')}</div>` : ''}
                </div>
                <span style="padding:4px 12px;border-radius:2rem;background:${statusBg};color:${statusColor};font-size:0.7rem;font-weight:700">${expired ? 'Expire' : doc.statut || 'Valide'}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Preferences -->
      <div style="border-radius:1.5rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);padding:1.25rem;margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
          <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(99,102,241,0.08);color:#6366f1;display:flex;align-items:center;justify-content:center">
            <iconify-icon icon="solar:settings-bold-duotone" style="font-size:1.2rem"></iconify-icon>
          </div>
          <div style="font-weight:800;font-size:0.95rem;color:#0f172a">Preferences</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-radius:1rem;background:#f8fafc">
          <div style="display:flex;align-items:center;gap:10px">
            <iconify-icon icon="solar:moon-bold-duotone" style="font-size:1.2rem;color:#6366f1"></iconify-icon>
            <span style="font-size:0.88rem;font-weight:600;color:#0f172a">Mode sombre</span>
          </div>
          <button class="dark-mode-toggle ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'active' : ''}" onclick="ProfilPage._toggleDarkMode(this)" id="dark-mode-btn"></button>
        </div>
      </div>

      <!-- Actions -->
      <div style="margin-bottom:1.5rem">
        <h3 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:1rem">Actions</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button onclick="DriverRouter.navigate('classement')" style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);box-shadow:var(--shadow-elevated);cursor:pointer;font-family:inherit;width:100%;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
            <div style="width:40px;height:40px;border-radius:0.75rem;background:rgba(245,158,11,0.08);color:#f59e0b;display:flex;align-items:center;justify-content:center">
              <iconify-icon icon="solar:cup-star-bold-duotone" style="font-size:1.25rem"></iconify-icon>
            </div>
            <span style="font-size:0.9rem;font-weight:700;color:#0f172a">Voir le classement</span>
          </button>

          <button onclick="ProfilPage._changerPin()" style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);box-shadow:var(--shadow-elevated);cursor:pointer;font-family:inherit;width:100%;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
            <div style="width:40px;height:40px;border-radius:0.75rem;background:rgba(59,130,246,0.08);color:#3b82f6;display:flex;align-items:center;justify-content:center">
              <iconify-icon icon="solar:key-bold-duotone" style="font-size:1.25rem"></iconify-icon>
            </div>
            <span style="font-size:0.9rem;font-weight:700;color:#0f172a">Changer mon PIN</span>
          </button>

          <button onclick="DriverRouter.navigate('contrat')" style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);box-shadow:var(--shadow-elevated);cursor:pointer;font-family:inherit;width:100%;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
            <div style="width:40px;height:40px;border-radius:0.75rem;background:rgba(249,115,22,0.08);color:#f97316;display:flex;align-items:center;justify-content:center">
              <iconify-icon icon="solar:document-text-bold-duotone" style="font-size:1.25rem"></iconify-icon>
            </div>
            <span style="font-size:0.9rem;font-weight:700;color:#0f172a">Mon contrat</span>
          </button>

          <button onclick="DriverRouter.navigate('documents')" style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);box-shadow:var(--shadow-elevated);cursor:pointer;font-family:inherit;width:100%;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
            <div style="width:40px;height:40px;border-radius:0.75rem;background:rgba(245,158,11,0.08);color:#f59e0b;display:flex;align-items:center;justify-content:center">
              <iconify-icon icon="solar:document-bold-duotone" style="font-size:1.25rem"></iconify-icon>
            </div>
            <span style="font-size:0.9rem;font-weight:700;color:#0f172a">Mes documents</span>
          </button>

          <button onclick="ProfilPage._deconnexion()" style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.1);cursor:pointer;font-family:inherit;width:100%;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
            <div style="width:40px;height:40px;border-radius:0.75rem;background:rgba(239,68,68,0.08);color:#ef4444;display:flex;align-items:center;justify-content:center">
              <iconify-icon icon="solar:logout-2-bold-duotone" style="font-size:1.25rem"></iconify-icon>
            </div>
            <span style="font-size:0.9rem;font-weight:700;color:#ef4444">Deconnexion</span>
          </button>
        </div>
      </div>

      <div style="height:20px"></div>
    `;

    // Charger les badges
    this._loadBadges();
  },

  async _loadBadges() {
    const container = document.getElementById('profil-badges-section');
    if (!container) return;

    try {
      const data = await DriverStore.getObjectifs();
      if (!data) { container.style.display = 'none'; return; }

      // All possible badges
      const allBadgeDefs = [
        { id: 'premier_versement', nom: 'Premier versement', description: 'Premier versement effectue', icon: 'solar:star-bold-duotone' },
        { id: 'score_80', nom: 'Conducteur exemplaire', description: 'Score de conduite superieur a 80', icon: 'solar:medal-ribbons-star-bold-duotone' },
        { id: '10_jours', nom: 'Regularite', description: '10 jours travailles ce mois', icon: 'solar:fire-bold-duotone' },
        { id: '20_jours', nom: 'Assidu', description: '20 jours travailles ce mois', icon: 'solar:cup-bold-duotone' },
        { id: 'ponctuel', nom: 'Ponctuel', description: 'Aucun retard de versement', icon: 'solar:clock-circle-bold-duotone' },
      ];

      const earnedIds = new Set((data.badges || []).map(b => b.id));

      const badgesHTML = allBadgeDefs.map(def => {
        const earned = earnedIds.has(def.id);
        return `
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:60px" title="${def.description}">
            <div style="width:48px;height:48px;border-radius:50%;background:${earned ? 'rgba(59,130,246,0.1)' : '#f1f5f9'};display:flex;align-items:center;justify-content:center;${earned ? '' : 'opacity:0.4;filter:grayscale(100%);'}">
              <iconify-icon icon="${def.icon}" style="font-size:1.5rem;color:${earned ? '#3b82f6' : '#94a3b8'}"></iconify-icon>
            </div>
            <span style="font-size:0.6rem;font-weight:600;color:${earned ? '#0f172a' : '#94a3b8'};text-align:center;line-height:1.2">${def.nom}</span>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div style="border-radius:1.5rem;background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border);padding:1.25rem;margin-bottom:1rem">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
            <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(245,158,11,0.08);color:#f59e0b;display:flex;align-items:center;justify-content:center">
              <iconify-icon icon="solar:medal-ribbons-star-bold-duotone" style="font-size:1.2rem"></iconify-icon>
            </div>
            <div style="font-weight:800;font-size:0.95rem;color:#0f172a">Mes badges</div>
            <span style="margin-left:auto;font-size:0.72rem;font-weight:600;color:#94a3b8">${earnedIds.size}/${allBadgeDefs.length}</span>
          </div>
          <div style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:12px">
            ${badgesHTML}
          </div>
        </div>
      `;
    } catch (e) {
      console.warn('Erreur chargement badges:', e);
      container.style.display = 'none';
    }
  },

  _toggleDarkMode(btn) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('pilote_theme', newTheme);
    btn.classList.toggle('active', newTheme === 'dark');
    DriverToast.show(newTheme === 'dark' ? 'Mode sombre active' : 'Mode clair active', 'success');
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
