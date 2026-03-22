/**
 * ContratPage — Affichage dynamique du contrat de travail du chauffeur
 * Les termes du contrat sont lus depuis les settings (API)
 */
const ContratPage = {
  async render(container) {
    // Skeleton loading
    container.innerHTML = `
      <div style="padding:8px 0">
        <div class="skeleton" style="height:120px;border-radius:1.25rem;margin-bottom:1rem"></div>
        <div class="skeleton" style="height:80px;border-radius:1.25rem;margin-bottom:1rem"></div>
        <div class="skeleton" style="height:200px;border-radius:1.25rem;margin-bottom:1rem"></div>
        <div class="skeleton" style="height:160px;border-radius:1.25rem;margin-bottom:1rem"></div>
        <div class="skeleton" style="height:140px;border-radius:1.25rem;margin-bottom:1rem"></div>
        <div class="skeleton" style="height:100px;border-radius:1.25rem;margin-bottom:1rem"></div>
      </div>
    `;

    const data = await DriverStore.getContrat();

    if (!data || !data.chauffeur) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger le contrat</p></div>';
      return;
    }

    const { contrat, entreprise, chauffeur } = data;
    const c = contrat || {};
    const ent = entreprise || {};

    const nom = `${chauffeur.prenom || '____'} ${chauffeur.nom || '____'}`.trim();
    const telephone = chauffeur.telephone || '____';
    const dateDebut = chauffeur.dateDebutContrat ? new Date(chauffeur.dateDebutContrat).toLocaleDateString('fr-FR') : '____';
    const dateFin = chauffeur.dateFinContrat ? new Date(chauffeur.dateFinContrat).toLocaleDateString('fr-FR') : null;

    // Detecter si le contrat a ete mis a jour depuis la derniere acceptation
    const settingsVersion = c.version || 1;
    const chauffeurVersion = chauffeur.contratVersion || 0;
    const needsRevalidation = chauffeur.contratAccepte && chauffeurVersion < settingsVersion;

    // Helpers
    const section = (icon, color, title, content) => `
      <div style="border-radius:1.25rem;background:white;border:1px solid #f1f5f9;box-shadow:0 1px 6px rgba(0,0,0,0.04);padding:1.25rem;margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
          <div style="width:36px;height:36px;border-radius:0.75rem;background:${color}12;color:${color};display:flex;align-items:center;justify-content:center">
            <iconify-icon icon="${icon}" style="font-size:1.2rem"></iconify-icon>
          </div>
          <div style="font-weight:800;font-size:0.95rem;color:#0f172a">${title}</div>
        </div>
        <div style="font-size:0.82rem;line-height:1.7;color:#334155">${content}</div>
      </div>
    `;

    const row = (label, value, bold) => `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <span style="font-size:0.78rem;color:#94a3b8;font-weight:500;flex-shrink:0">${label}</span>
        <span style="font-size:0.82rem;font-weight:${bold ? '700' : '600'};color:#0f172a;text-align:right;margin-left:12px">${value}</span>
      </div>
    `;

    const line = (label, value) => value ? `<div style="margin-bottom:8px"><strong>${label} :</strong> ${value}</div>` : '';

    // Formatter le salaire
    const formatMontant = (n) => {
      if (!n) return null;
      return Number(n).toLocaleString('fr-FR') + ' FCFA';
    };

    // Construire les articles dynamiquement
    const employeurNom = ent.nom || c.employeur || 'L\u2019Employeur';

    // --- Bandeau mise a jour contrat ---
    const updateBanner = needsRevalidation ? `
      <div style="border-radius:1.25rem;background:rgba(249,115,22,0.08);border:1.5px solid rgba(249,115,22,0.25);padding:1rem 1.25rem;margin-bottom:1rem;display:flex;align-items:flex-start;gap:12px">
        <iconify-icon icon="solar:danger-triangle-bold-duotone" style="font-size:1.5rem;color:#f97316;flex-shrink:0;margin-top:2px"></iconify-icon>
        <div>
          <div style="font-weight:800;font-size:0.9rem;color:#ea580c;margin-bottom:4px">Le contrat a \u00e9t\u00e9 mis \u00e0 jour</div>
          <div style="font-size:0.78rem;color:#9a3412;line-height:1.5">Veuillez relire le contrat et accepter la nouvelle version pour continuer.</div>
        </div>
      </div>
    ` : '';

    // --- Article Conditions ---
    let conditionsContent = '';
    conditionsContent += line('Type', c.typeContrat);
    conditionsContent += line('Poste', c.poste);
    conditionsContent += line('P\u00e9riode d\u2019essai', c.periodeEssai);
    conditionsContent += line('Lieu', c.lieuTravail);
    conditionsContent += line('Organisation', c.organisation);
    conditionsContent += line('Horaires', c.horaires);

    // --- Article Remuneration ---
    let remuContent = '';
    if (c.salaireJournalier) {
      remuContent += `
        <div style="padding:1rem;border-radius:1rem;background:rgba(34,197,94,0.06);margin-bottom:12px">
          <div style="font-size:0.7rem;text-transform:uppercase;color:#16a34a;font-weight:700;margin-bottom:4px">Salaire fixe journalier</div>
          <div style="font-size:1.5rem;font-weight:900;color:#16a34a">${formatMontant(c.salaireJournalier)}<span style="font-size:0.75rem;font-weight:500;color:#64748b"> / jour</span></div>
        </div>
      `;
    }
    if (c.bonusPerformance) {
      remuContent += `
        <div style="padding:1rem;border-radius:1rem;background:rgba(249,115,22,0.06);margin-bottom:12px">
          <div style="font-size:0.7rem;text-transform:uppercase;color:#f97316;font-weight:700;margin-bottom:4px">Prime de performance</div>
          <div style="font-size:0.88rem;font-weight:700;color:#f97316;line-height:1.6">${c.bonusPerformance}</div>
        </div>
      `;
    }
    if (c.objectifMinimum) {
      remuContent += `<div style="margin-bottom:8px"><strong>Objectif journalier minimum :</strong> ${formatMontant(c.objectifMinimum)}</div>`;
    }

    // --- Article Obligations ---
    let obligationsContent = c.obligations || '';

    // --- Article Responsabilites ---
    let responsabilitesContent = c.responsabilites || '';

    // --- Article Protection sociale ---
    let protectionContent = c.protectionSociale || '';

    // --- Article Resiliation ---
    let resiliationContent = c.clauseResiliation || '';

    // --- Article Clauses particulieres ---
    let clausesContent = c.clausesParticulieres || '';

    // --- Amendements ---
    const amendements = (c.amendements && c.amendements.length > 0) ? c.amendements : [];

    // Determiner si le chauffeur doit accepter (pas accepte OU version perimee)
    const mustAccept = !chauffeur.contratAccepte || needsRevalidation;

    container.innerHTML = `
      <!-- En-tete contrat -->
      <div style="text-align:center;padding:1.5rem 0 1rem">
        <div style="width:64px;height:64px;border-radius:1rem;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;box-shadow:0 4px 16px rgba(249,115,22,0.3)">
          <iconify-icon icon="solar:document-text-bold-duotone" style="font-size:2rem;color:white"></iconify-icon>
        </div>
        <h2 style="font-size:1.15rem;font-weight:900;color:#0f172a;margin-bottom:4px">CONTRAT DE TRAVAIL</h2>
        <div style="font-size:0.75rem;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">${c.typeContrat || 'CDI'} \u2014 ${c.poste || 'Chauffeur VTC'}</div>
        <div style="font-size:0.65rem;color:#cbd5e1;margin-top:6px">Version ${settingsVersion}${c.derniereMaj ? ' \u2014 Mise \u00e0 jour le ' + c.derniereMaj : ''}</div>
      </div>

      ${updateBanner}

      <!-- Bandeau employeur -->
      <div style="border-radius:1.25rem;background:linear-gradient(135deg,#0f172a,#1e293b);padding:1.25rem;margin-bottom:1rem;color:white">
        <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.5);margin-bottom:8px;font-weight:700">Employeur</div>
        <div style="font-size:1rem;font-weight:800;margin-bottom:4px">${employeurNom}</div>
        ${ent.adresse ? `<div style="font-size:0.75rem;color:rgba(255,255,255,0.7)">${ent.adresse}</div>` : ''}
        ${ent.telephone ? `<div style="font-size:0.75rem;color:rgba(255,255,255,0.5);margin-top:4px">${ent.telephone}</div>` : ''}
      </div>

      <!-- Infos salarie -->
      ${section('solar:user-id-bold-duotone', '#3b82f6', 'Le Salari\u00e9',
        row('Nom complet', `<strong>${nom}</strong>`, true) +
        row('T\u00e9l\u00e9phone', telephone) +
        (chauffeur.email ? row('Email', chauffeur.email) : '') +
        row('Date d\u00e9but', dateDebut, true) +
        (dateFin ? row('Date fin', dateFin) : '')
      )}

      <!-- Article 1-4 : Conditions -->
      ${conditionsContent ? section('solar:document-bold-duotone', '#8b5cf6', 'Art. 1-4 \u2014 Conditions du contrat', conditionsContent) : ''}

      <!-- Article 5-7 : Remuneration -->
      ${remuContent ? section('solar:wallet-bold-duotone', '#22c55e', 'Art. 5-7 \u2014 R\u00e9mun\u00e9ration', remuContent) : ''}

      <!-- Article 8-10 : Obligations -->
      ${obligationsContent ? section('solar:shield-check-bold-duotone', '#f59e0b', 'Art. 8-10 \u2014 Obligations du salari\u00e9', `<div style="white-space:pre-line">${obligationsContent}</div>`) : ''}

      <!-- Article 11-12 : Responsabilite -->
      ${responsabilitesContent ? section('solar:danger-triangle-bold-duotone', '#ef4444', 'Art. 11-12 \u2014 Responsabilit\u00e9 et sanctions', `<div style="white-space:pre-line">${responsabilitesContent}</div>`) : ''}

      <!-- Article 13 : Protection sociale -->
      ${protectionContent ? section('solar:heart-pulse-bold-duotone', '#06b6d4', 'Art. 13 \u2014 Protection sociale', `<div style="white-space:pre-line">${protectionContent}</div>`) : ''}

      <!-- Article 14-15 : Rupture -->
      ${resiliationContent ? section('solar:close-circle-bold-duotone', '#64748b', 'Art. 14-15 \u2014 Rupture du contrat', `<div style="white-space:pre-line">${resiliationContent}</div>`) : ''}

      <!-- Article 16-18 : Clauses particulieres -->
      ${clausesContent ? section('solar:scale-bold-duotone', '#6366f1', 'Art. 16-18 \u2014 Dispositions g\u00e9n\u00e9rales', `<div style="white-space:pre-line">${clausesContent}</div>`) : ''}

      <!-- Historique des amendements -->
      ${amendements.length > 0 ? `
        <div style="border-radius:1.25rem;background:rgba(255,255,255,0.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.25);box-shadow:0 4px 24px rgba(0,0,0,0.06);padding:1.25rem;margin-bottom:1rem">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
            <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(99,102,241,0.08);color:#6366f1;display:flex;align-items:center;justify-content:center">
              <iconify-icon icon="solar:history-bold-duotone" style="font-size:1.2rem"></iconify-icon>
            </div>
            <div style="font-weight:800;font-size:0.95rem;color:#0f172a">Historique des amendements</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${amendements.map(a => `
              <div style="padding:12px;border-radius:1rem;background:#f8fafc;border-left:3px solid #6366f1">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <span style="font-size:0.75rem;font-weight:700;color:#6366f1">${a.date || '--'}</span>
                  ${a.auteur ? `<span style="font-size:0.7rem;color:#94a3b8">${a.auteur}</span>` : ''}
                </div>
                <div style="font-size:0.8rem;color:#334155;line-height:1.5">${a.description || ''}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Acceptation du contrat -->
      ${(!mustAccept && chauffeur.contratAccepte) ? `
        <div style="border-radius:1.25rem;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);padding:1.5rem;margin-bottom:1rem;text-align:center">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(34,197,94,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
            <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:2rem;color:#22c55e"></iconify-icon>
          </div>
          <div style="font-size:1rem;font-weight:800;color:#16a34a;margin-bottom:4px">Contrat accept\u00e9</div>
          <div style="font-size:0.78rem;color:#64748b">
            Accept\u00e9 le ${chauffeur.contratAccepteLe ? new Date(chauffeur.contratAccepteLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}
          </div>
          <div style="font-size:0.68rem;color:#94a3b8;margin-top:4px">Version ${chauffeurVersion}</div>
        </div>
      ` : `
        <div style="border-radius:1.25rem;background:white;border:1px solid #f1f5f9;box-shadow:0 1px 6px rgba(0,0,0,0.04);padding:1.5rem;margin-bottom:1rem">
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:1.25rem">
            <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(249,115,22,0.08);color:#f97316;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">
              <iconify-icon icon="solar:pen-new-round-bold-duotone" style="font-size:1.2rem"></iconify-icon>
            </div>
            <div>
              <div style="font-weight:800;font-size:0.95rem;color:#0f172a;margin-bottom:4px">${needsRevalidation ? 'Nouvelle version \u00e0 accepter' : 'Signature \u00e9lectronique'}</div>
              <div style="font-size:0.78rem;color:#64748b;line-height:1.6">${needsRevalidation
                ? 'Le contrat a \u00e9t\u00e9 modifi\u00e9 depuis votre derni\u00e8re acceptation. Veuillez relire et accepter la version ' + settingsVersion + '.'
                : 'En cliquant sur le bouton ci-dessous, je confirme avoir lu et accept\u00e9 les termes et conditions du pr\u00e9sent contrat de travail.'}</div>
            </div>
          </div>
          <label id="contrat-checkbox-label" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:1rem;background:#f8fafc;cursor:pointer;margin-bottom:1rem">
            <input type="checkbox" id="contrat-checkbox" style="width:20px;height:20px;margin-top:2px;accent-color:#f97316;flex-shrink:0">
            <span style="font-size:0.78rem;color:#334155;line-height:1.5">Je d\u00e9clare avoir pris connaissance de l\u2019int\u00e9gralit\u00e9 du contrat et en accepter toutes les clauses.</span>
          </label>
          <button id="btn-accepter-contrat" disabled onclick="ContratPage._accepter()" style="width:100%;padding:14px;border-radius:1rem;background:#d1d5db;color:white;font-size:0.95rem;font-weight:800;border:none;cursor:not-allowed;font-family:inherit;transition:all 0.3s">
            <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:1.1rem;vertical-align:middle;margin-right:6px"></iconify-icon>
            ${needsRevalidation ? 'Accepter la nouvelle version' : 'Accepter le contrat'}
          </button>
        </div>
      `}

      <div style="height:2rem"></div>
    `;

    // Bind checkbox -> bouton
    if (mustAccept || !chauffeur.contratAccepte) {
      const checkbox = document.getElementById('contrat-checkbox');
      const btn = document.getElementById('btn-accepter-contrat');
      if (checkbox && btn) {
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            btn.disabled = false;
            btn.style.background = 'linear-gradient(135deg,#f97316,#ea580c)';
            btn.style.cursor = 'pointer';
            btn.style.boxShadow = '0 4px 16px rgba(249,115,22,0.3)';
          } else {
            btn.disabled = true;
            btn.style.background = '#d1d5db';
            btn.style.cursor = 'not-allowed';
            btn.style.boxShadow = 'none';
          }
        });
      }
    }
  },

  async _accepter() {
    const btn = document.getElementById('btn-accepter-contrat');
    if (!btn) return;

    DriverModal.show(
      'Confirmer l\u2019acceptation',
      `<div style="text-align:center;padding:0.5rem 0">
        <iconify-icon icon="solar:document-text-bold-duotone" style="font-size:3rem;color:#f97316;display:block;margin-bottom:12px"></iconify-icon>
        <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.6">
          Vous \u00eates sur le point d\u2019accepter votre contrat de travail.<br>
          <strong>Cette action est d\u00e9finitive.</strong>
        </p>
      </div>`,
      [
        { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
        { label: 'Je confirme', class: 'btn btn-primary', onclick: 'ContratPage._confirmerAcceptation()' }
      ]
    );
  },

  async _confirmerAcceptation() {
    DriverModal.close();

    const btn = document.getElementById('btn-accepter-contrat');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
    }

    const result = await DriverStore.accepterContrat();

    if (result && result.success) {
      DriverToast.show('Contrat accept\u00e9 avec succ\u00e8s !', 'success');
      const container = document.getElementById('app-content');
      if (container) this.render(container);
    } else {
      DriverToast.show(result?.error || 'Erreur lors de l\u2019acceptation', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:1.1rem;vertical-align:middle;margin-right:6px"></iconify-icon> Accepter le contrat';
      }
    }
  },

  destroy() {}
};
