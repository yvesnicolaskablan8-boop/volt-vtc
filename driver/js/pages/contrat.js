/**
 * ContratPage — Affichage du contrat de travail du chauffeur
 */
const ContratPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const profil = await DriverStore.getProfil();

    if (!profil) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger le profil</p></div>';
      return;
    }

    const nom = `${profil.prenom || '____'} ${profil.nom || '____'}`.trim();
    const telephone = profil.telephone || '____';
    const dateDebut = profil.dateDebutContrat ? new Date(profil.dateDebutContrat).toLocaleDateString('fr-FR') : '____';

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

    container.innerHTML = `
      <!-- En-tete contrat -->
      <div style="text-align:center;padding:1.5rem 0 1rem">
        <div style="width:64px;height:64px;border-radius:1rem;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;box-shadow:0 4px 16px rgba(249,115,22,0.3)">
          <iconify-icon icon="solar:document-text-bold-duotone" style="font-size:2rem;color:white"></iconify-icon>
        </div>
        <h2 style="font-size:1.15rem;font-weight:900;color:#0f172a;margin-bottom:4px">CONTRAT DE TRAVAIL</h2>
        <div style="font-size:0.75rem;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">CDI — Chauffeur VTC Flotte Electrique</div>
      </div>

      <!-- Bandeau employeur -->
      <div style="border-radius:1.25rem;background:linear-gradient(135deg,#0f172a,#1e293b);padding:1.25rem;margin-bottom:1rem;color:white">
        <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.5);margin-bottom:8px;font-weight:700">Employeur</div>
        <div style="font-size:1rem;font-weight:800;margin-bottom:4px">MAURALEX SARL</div>
        <div style="font-size:0.75rem;color:rgba(255,255,255,0.7)">Societe a Responsabilite Limitee — Abidjan, Cote d'Ivoire</div>
      </div>

      <!-- Infos salarie -->
      ${section('solar:user-id-bold-duotone', '#3b82f6', 'Le Salarie',
        row('Nom complet', `<strong>${nom}</strong>`, true) +
        row('Telephone', telephone) +
        (profil.email ? row('Email', profil.email) : '') +
        row('Date debut', dateDebut, true)
      )}

      <!-- Article 1-4 : Conditions -->
      ${section('solar:document-bold-duotone', '#8b5cf6', 'Art. 1-4 — Conditions du contrat', `
        <div style="margin-bottom:8px"><strong>Type :</strong> CDI regi par le Code du Travail ivoirien</div>
        <div style="margin-bottom:8px"><strong>Poste :</strong> Chauffeur VTC au sein de la flotte electrique, operant sur la plateforme Yango</div>
        <div style="margin-bottom:8px"><strong>Periode d'essai :</strong> 3 mois, renouvelable une fois (6 mois max)</div>
        <div style="margin-bottom:8px"><strong>Lieu :</strong> District Autonome d'Abidjan et peripheries</div>
        <div><strong>Horaires :</strong> 6 jours/semaine, repos par roulement. Obligations de ponctualite, disponibilite sur la plateforme, restitution du vehicule en bon etat, respect des horaires de recharge.</div>
      `)}

      <!-- Article 5-7 : Remuneration -->
      ${section('solar:wallet-bold-duotone', '#22c55e', 'Art. 5-7 — Remuneration', `
        <div style="padding:1rem;border-radius:1rem;background:rgba(34,197,94,0.06);margin-bottom:12px">
          <div style="font-size:0.7rem;text-transform:uppercase;color:#16a34a;font-weight:700;margin-bottom:4px">Salaire fixe journalier</div>
          <div style="font-size:1.5rem;font-weight:900;color:#16a34a">10 000 FCFA<span style="font-size:0.75rem;font-weight:500;color:#64748b"> / jour</span></div>
        </div>
        <div style="padding:1rem;border-radius:1rem;background:rgba(249,115,22,0.06);margin-bottom:12px">
          <div style="font-size:0.7rem;text-transform:uppercase;color:#f97316;font-weight:700;margin-bottom:4px">Prime de performance</div>
          <div style="font-size:1.1rem;font-weight:800;color:#f97316">50% du surplus</div>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px">au-dela de 65 000 FCFA de recette journaliere</div>
        </div>
        <div style="font-size:0.78rem;color:#64748b;padding:8px 12px;border-left:3px solid #e2e8f0;margin-bottom:8px">
          <strong>Exemple :</strong> Recette 65 000 = salaire 10 000 FCFA<br>
          Recette 100 000 = salaire 10 000 + prime 17 500 = <strong>27 500 FCFA</strong>
        </div>
        <div style="margin-bottom:8px"><strong>Objectif journalier minimum :</strong> 65 000 FCFA</div>
        <div style="margin-bottom:8px"><strong>Versement :</strong> quotidien en fin de service, prime le jour meme apres verification Yango Pro</div>
        <div style="font-size:0.78rem;color:#94a3b8">Sanctions progressives en cas de non-atteinte repetee (avertissement oral, ecrit, mise en demeure). Exemptions pour panne, accident, maladie justifiee, force majeure.</div>
      `)}

      <!-- Article 8-10 : Obligations -->
      ${section('solar:shield-check-bold-duotone', '#f59e0b', 'Art. 8-10 — Obligations du salarie', `
        <div style="margin-bottom:10px"><strong>Vehicule :</strong></div>
        <ul style="margin:0 0 10px 16px;padding:0;list-style:disc">
          <li>Usage professionnel uniquement</li>
          <li>Restitution propre et rechargee</li>
          <li>Signalement immediat de tout incident</li>
          <li>Interdiction de sous-location ou pret</li>
          <li>Respect du Code de la Route</li>
          <li>Note de qualite minimale sur Yango</li>
        </ul>
        <div style="margin-bottom:8px"><strong>Recharge :</strong> a la charge de l'Employeur. Retenue possible en cas de consommation hors circuits autorises.</div>
        <div><strong>Presentation :</strong> soignee, comportement courtois et professionnel envers les passagers.</div>
      `)}

      <!-- Article 11-12 : Responsabilite -->
      ${section('solar:danger-triangle-bold-duotone', '#ef4444', 'Art. 11-12 — Responsabilite et sanctions', `
        <div style="margin-bottom:8px">En cas de faute averee (exces de vitesse, conduite sous influence, usage non autorise), la franchise d'assurance et frais non couverts peuvent etre mis a la charge du salarie.</div>
        <div><strong>Confidentialite :</strong> clause applicable pendant et apres le contrat.</div>
      `)}

      <!-- Article 13 : Protection sociale -->
      ${section('solar:heart-pulse-bold-duotone', '#06b6d4', 'Art. 13 — Protection sociale', `
        <div style="margin-bottom:8px">Immatriculation a la <strong>CNPS</strong> (Caisse Nationale de Prevoyance Sociale).</div>
        <div style="margin-bottom:8px">Cotisations patronales (~18%) a la charge de l'Employeur.</div>
        <div><strong>Couverture :</strong> accident du travail, maladie professionnelle, retraite.</div>
      `)}

      <!-- Article 14-15 : Rupture -->
      ${section('solar:close-circle-bold-duotone', '#64748b', 'Art. 14-15 — Rupture du contrat', `
        <div style="margin-bottom:10px"><strong>Preavis :</strong></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="padding:10px;border-radius:0.75rem;background:#f8fafc;text-align:center">
            <div style="font-size:0.7rem;color:#94a3b8;font-weight:600">Moins de 1 an</div>
            <div style="font-size:1rem;font-weight:800;color:#0f172a">8 jours</div>
          </div>
          <div style="padding:10px;border-radius:0.75rem;background:#f8fafc;text-align:center">
            <div style="font-size:0.7rem;color:#94a3b8;font-weight:600">1 a 5 ans</div>
            <div style="font-size:1rem;font-weight:800;color:#0f172a">1 mois</div>
          </div>
        </div>
        <div style="padding:10px;border-radius:0.75rem;background:#f8fafc;text-align:center;margin-bottom:12px">
          <div style="font-size:0.7rem;color:#94a3b8;font-weight:600">Plus de 5 ans</div>
          <div style="font-size:1rem;font-weight:800;color:#0f172a">2 mois</div>
        </div>
        <div style="margin-bottom:8px">Faute grave = rupture immediate sans preavis.</div>
        <div>Indemnite de licenciement selon le Code du Travail ivoirien (hors faute grave).</div>
      `)}

      <!-- Article 16-18 : Dispositions generales -->
      ${section('solar:scale-bold-duotone', '#6366f1', 'Art. 16-18 — Dispositions generales', `
        <div style="margin-bottom:8px">Droit ivoirien applicable, juridictions d'Abidjan competentes.</div>
        <div style="margin-bottom:8px">Toute modification se fait par avenant ecrit et signe des deux parties.</div>
        <div>Contrat etabli en deux exemplaires originaux.</div>
      `)}

      <!-- Acceptation du contrat -->
      ${profil.contratAccepte ? `
        <div style="border-radius:1.25rem;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);padding:1.5rem;margin-bottom:1rem;text-align:center">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(34,197,94,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
            <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:2rem;color:#22c55e"></iconify-icon>
          </div>
          <div style="font-size:1rem;font-weight:800;color:#16a34a;margin-bottom:4px">Contrat accepte</div>
          <div style="font-size:0.78rem;color:#64748b">
            Accepte le ${profil.contratAccepteLe ? new Date(profil.contratAccepteLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}
          </div>
        </div>
      ` : `
        <div style="border-radius:1.25rem;background:white;border:1px solid #f1f5f9;box-shadow:0 1px 6px rgba(0,0,0,0.04);padding:1.5rem;margin-bottom:1rem">
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:1.25rem">
            <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(249,115,22,0.08);color:#f97316;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">
              <iconify-icon icon="solar:pen-new-round-bold-duotone" style="font-size:1.2rem"></iconify-icon>
            </div>
            <div>
              <div style="font-weight:800;font-size:0.95rem;color:#0f172a;margin-bottom:4px">Signature electronique</div>
              <div style="font-size:0.78rem;color:#64748b;line-height:1.6">En cliquant sur le bouton ci-dessous, je confirme avoir lu et accepte les termes et conditions du present contrat de travail.</div>
            </div>
          </div>
          <label id="contrat-checkbox-label" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:1rem;background:#f8fafc;cursor:pointer;margin-bottom:1rem">
            <input type="checkbox" id="contrat-checkbox" style="width:20px;height:20px;margin-top:2px;accent-color:#f97316;flex-shrink:0">
            <span style="font-size:0.78rem;color:#334155;line-height:1.5">Je declare avoir pris connaissance de l'integralite du contrat et en accepter toutes les clauses.</span>
          </label>
          <button id="btn-accepter-contrat" disabled onclick="ContratPage._accepter()" style="width:100%;padding:14px;border-radius:1rem;background:#d1d5db;color:white;font-size:0.95rem;font-weight:800;border:none;cursor:not-allowed;font-family:inherit;transition:all 0.3s">
            <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:1.1rem;vertical-align:middle;margin-right:6px"></iconify-icon>
            Accepter le contrat
          </button>
        </div>
      `}

      <div style="height:2rem"></div>
    `;

    // Bind checkbox → bouton
    if (!profil.contratAccepte) {
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

    // Confirmation
    DriverModal.show(
      'Confirmer l\'acceptation',
      `<div style="text-align:center;padding:0.5rem 0">
        <iconify-icon icon="solar:document-text-bold-duotone" style="font-size:3rem;color:#f97316;display:block;margin-bottom:12px"></iconify-icon>
        <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.6">
          Vous etes sur le point d'accepter votre contrat de travail.<br>
          <strong>Cette action est definitive.</strong>
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
      DriverToast.show('Contrat accepte avec succes !', 'success');
      // Re-render la page pour afficher le statut accepte
      const container = document.getElementById('app-content');
      if (container) this.render(container);
    } else {
      DriverToast.show(result?.error || 'Erreur lors de l\'acceptation', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:1.1rem;vertical-align:middle;margin-right:6px"></iconify-icon> Accepter le contrat';
      }
    }
  },

  destroy() {}
};
