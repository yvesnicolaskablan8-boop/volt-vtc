/**
 * ContratPage — Affichage du contrat de travail du chauffeur
 */
const ContratPage = {
  async render(container) {
    container.innerHTML = '<div style="padding:8px 0"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card" style="height:80px"></div><div class="skeleton skeleton-card" style="height:60px"></div></div>';

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
      <!-- En-tête contrat -->
      <div style="text-align:center;padding:1.5rem 0 1rem">
        <div style="width:64px;height:64px;border-radius:1rem;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;box-shadow:0 4px 16px rgba(249,115,22,0.3)">
          <iconify-icon icon="solar:document-text-bold-duotone" style="font-size:2rem;color:white"></iconify-icon>
        </div>
        <h2 style="font-size:1.15rem;font-weight:900;color:#0f172a;margin-bottom:4px">CONTRAT DE TRAVAIL</h2>
        <div style="font-size:0.75rem;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">CDI \u2014 Chauffeur VTC Flotte \u00c9lectrique</div>
      </div>

      <!-- Bandeau employeur -->
      <div style="border-radius:1.25rem;background:linear-gradient(135deg,#0f172a,#1e293b);padding:1.25rem;margin-bottom:1rem;color:white">
        <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.5);margin-bottom:8px;font-weight:700">Employeur</div>
        <div style="font-size:1rem;font-weight:800;margin-bottom:4px">MAURALEX SARL</div>
        <div style="font-size:0.75rem;color:rgba(255,255,255,0.7)">Soci\u00e9t\u00e9 \u00e0 Responsabilit\u00e9 Limit\u00e9e \u2014 Abidjan, C\u00f4te d\u2019Ivoire</div>
      </div>

      <!-- Infos salarié -->
      ${section('solar:user-id-bold-duotone', '#3b82f6', 'Le Salari\u00e9',
        row('Nom complet', `<strong>${nom}</strong>`, true) +
        row('T\u00e9l\u00e9phone', telephone) +
        (profil.email ? row('Email', profil.email) : '') +
        row('Date d\u00e9but', dateDebut, true)
      )}

      <!-- Article 1-4 : Conditions -->
      ${section('solar:document-bold-duotone', '#8b5cf6', 'Art. 1-4 \u2014 Conditions du contrat', `
        <div style="margin-bottom:8px"><strong>Type :</strong> CDI r\u00e9gi par le Code du Travail ivoirien</div>
        <div style="margin-bottom:8px"><strong>Poste :</strong> Chauffeur VTC au sein de la flotte \u00e9lectrique, op\u00e9rant sur la plateforme Yango</div>
        <div style="margin-bottom:8px"><strong>P\u00e9riode d\u2019essai :</strong> 3 mois, renouvelable une fois (6 mois max)</div>
        <div style="margin-bottom:8px"><strong>Lieu :</strong> District Autonome d\u2019Abidjan et p\u00e9riph\u00e9ries</div>
        <div style="margin-bottom:8px"><strong>Organisation :</strong> Chaque v\u00e9hicule est assign\u00e9 \u00e0 deux chauffeurs qui se relaient. Le service fonctionne 7 jours sur 7.</div>
        <div><strong>Horaires :</strong> Le planning est d\u00e9fini par roulement entre les deux chauffeurs du v\u00e9hicule. Chaque chauffeur est r\u00e9mun\u00e9r\u00e9 en fonction de son nombre de jours effectivement travaill\u00e9s. Obligations de ponctualit\u00e9, disponibilit\u00e9 sur la plateforme Yango via MAURALEX, restitution du v\u00e9hicule en bon \u00e9tat, respect des horaires de recharge.</div>
      `)}

      <!-- Article 5-7 : Rémunération -->
      ${section('solar:wallet-bold-duotone', '#22c55e', 'Art. 5-7 \u2014 R\u00e9mun\u00e9ration', `
        <div style="padding:1rem;border-radius:1rem;background:rgba(34,197,94,0.06);margin-bottom:12px">
          <div style="font-size:0.7rem;text-transform:uppercase;color:#16a34a;font-weight:700;margin-bottom:4px">Salaire fixe journalier</div>
          <div style="font-size:1.5rem;font-weight:900;color:#16a34a">10 000 FCFA<span style="font-size:0.75rem;font-weight:500;color:#64748b"> / jour</span></div>
        </div>
        <div style="padding:1rem;border-radius:1rem;background:rgba(249,115,22,0.06);margin-bottom:12px">
          <div style="font-size:0.7rem;text-transform:uppercase;color:#f97316;font-weight:700;margin-bottom:4px">Prime de performance</div>
          <div style="font-size:1.1rem;font-weight:800;color:#f97316">50% du surplus</div>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px">au-del\u00e0 de 65 000 FCFA de recette journali\u00e8re</div>
        </div>
        <div style="font-size:0.78rem;color:#64748b;padding:8px 12px;border-left:3px solid #e2e8f0;margin-bottom:8px">
          <strong>Exemple :</strong> Recette 65 000 = salaire 10 000 FCFA<br>
          Recette 100 000 = salaire 10 000 + prime 17 500 = <strong>27 500 FCFA</strong>
        </div>
        <div style="margin-bottom:8px"><strong>Objectif journalier minimum :</strong> 65 000 FCFA</div>
        <div style="margin-bottom:8px"><strong>R\u00e9mun\u00e9ration au jour travaill\u00e9 :</strong> Le salaire et la prime sont calcul\u00e9s uniquement sur les jours effectivement travaill\u00e9s par le chauffeur.</div>
        <div style="margin-bottom:8px"><strong>Versement :</strong> quotidien en fin de service, prime le jour m\u00eame apr\u00e8s v\u00e9rification Yango Pro</div>
        <div style="font-size:0.78rem;color:#94a3b8">Sanctions progressives en cas de non-atteinte r\u00e9p\u00e9t\u00e9e (avertissement oral, \u00e9crit, mise en demeure). Exemptions pour panne, accident, maladie justifi\u00e9e, force majeure.</div>
      `)}

      <!-- Article 8-10 : Obligations -->
      ${section('solar:shield-check-bold-duotone', '#f59e0b', 'Art. 8-10 \u2014 Obligations du salari\u00e9', `
        <div style="margin-bottom:10px"><strong>V\u00e9hicule :</strong></div>
        <ul style="margin:0 0 10px 16px;padding:0;list-style:disc">
          <li>Usage professionnel uniquement</li>
          <li>Restitution propre et recharg\u00e9e</li>
          <li>Signalement imm\u00e9diat de tout incident</li>
          <li>Interdiction de sous-location ou pr\u00eat</li>
          <li>Respect du Code de la Route</li>
          <li>Note de qualit\u00e9 minimale sur Yango</li>
        </ul>
        <div style="margin-bottom:8px"><strong>Recharge :</strong> \u00e0 la charge de l\u2019Employeur. Retenue possible en cas de consommation hors circuits autoris\u00e9s.</div>
        <div><strong>Pr\u00e9sentation :</strong> soign\u00e9e, comportement courtois et professionnel envers les passagers.</div>
      `)}

      <!-- Article 11-12 : Responsabilité -->
      ${section('solar:danger-triangle-bold-duotone', '#ef4444', 'Art. 11-12 \u2014 Responsabilit\u00e9 et sanctions', `
        <div style="margin-bottom:8px">En cas de faute av\u00e9r\u00e9e (exc\u00e8s de vitesse, conduite sous influence, usage non autoris\u00e9), la franchise d\u2019assurance et frais non couverts peuvent \u00eatre mis \u00e0 la charge du salari\u00e9.</div>
        <div><strong>Confidentialit\u00e9 :</strong> clause applicable pendant et apr\u00e8s le contrat.</div>
      `)}

      <!-- Article 13 : Protection sociale -->
      ${section('solar:heart-pulse-bold-duotone', '#06b6d4', 'Art. 13 \u2014 Protection sociale', `
        <div style="margin-bottom:8px">Immatriculation \u00e0 la <strong>CNPS</strong> (Caisse Nationale de Pr\u00e9voyance Sociale).</div>
        <div style="margin-bottom:8px">Cotisations patronales (~18%) \u00e0 la charge de l\u2019Employeur.</div>
        <div><strong>Couverture :</strong> accident du travail, maladie professionnelle, retraite.</div>
      `)}

      <!-- Article 14-15 : Rupture -->
      ${section('solar:close-circle-bold-duotone', '#64748b', 'Art. 14-15 \u2014 Rupture du contrat', `
        <div style="margin-bottom:10px"><strong>Pr\u00e9avis :</strong></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="padding:10px;border-radius:0.75rem;background:#f8fafc;text-align:center">
            <div style="font-size:0.7rem;color:#94a3b8;font-weight:600">Moins de 1 an</div>
            <div style="font-size:1rem;font-weight:800;color:#0f172a">8 jours</div>
          </div>
          <div style="padding:10px;border-radius:0.75rem;background:#f8fafc;text-align:center">
            <div style="font-size:0.7rem;color:#94a3b8;font-weight:600">1 \u00e0 5 ans</div>
            <div style="font-size:1rem;font-weight:800;color:#0f172a">1 mois</div>
          </div>
        </div>
        <div style="padding:10px;border-radius:0.75rem;background:#f8fafc;text-align:center;margin-bottom:12px">
          <div style="font-size:0.7rem;color:#94a3b8;font-weight:600">Plus de 5 ans</div>
          <div style="font-size:1rem;font-weight:800;color:#0f172a">2 mois</div>
        </div>
        <div style="margin-bottom:8px">Faute grave = rupture imm\u00e9diate sans pr\u00e9avis.</div>
        <div>Indemnit\u00e9 de licenciement selon le Code du Travail ivoirien (hors faute grave).</div>
      `)}

      <!-- Article 16-18 : Dispositions générales -->
      ${section('solar:scale-bold-duotone', '#6366f1', 'Art. 16-18 \u2014 Dispositions g\u00e9n\u00e9rales', `
        <div style="margin-bottom:8px">Droit ivoirien applicable, juridictions d\u2019Abidjan comp\u00e9tentes.</div>
        <div style="margin-bottom:8px">Toute modification se fait par avenant \u00e9crit et sign\u00e9 des deux parties.</div>
        <div>Contrat \u00e9tabli en deux exemplaires originaux.</div>
      `)}

      <!-- Acceptation du contrat -->
      ${profil.contratAccepte ? `
        <div style="border-radius:1.25rem;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);padding:1.5rem;margin-bottom:1rem;text-align:center">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(34,197,94,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
            <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:2rem;color:#22c55e"></iconify-icon>
          </div>
          <div style="font-size:1rem;font-weight:800;color:#16a34a;margin-bottom:4px">Contrat accept\u00e9</div>
          <div style="font-size:0.78rem;color:#64748b">
            Accept\u00e9 le ${profil.contratAccepteLe ? new Date(profil.contratAccepteLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}
          </div>
        </div>
      ` : `
        <div style="border-radius:1.25rem;background:white;border:1px solid #f1f5f9;box-shadow:0 1px 6px rgba(0,0,0,0.04);padding:1.5rem;margin-bottom:1rem">
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:1.25rem">
            <div style="width:36px;height:36px;border-radius:0.75rem;background:rgba(249,115,22,0.08);color:#f97316;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">
              <iconify-icon icon="solar:pen-new-round-bold-duotone" style="font-size:1.2rem"></iconify-icon>
            </div>
            <div>
              <div style="font-weight:800;font-size:0.95rem;color:#0f172a;margin-bottom:4px">Signature \u00e9lectronique</div>
              <div style="font-size:0.78rem;color:#64748b;line-height:1.6">En cliquant sur le bouton ci-dessous, je confirme avoir lu et accept\u00e9 les termes et conditions du pr\u00e9sent contrat de travail.</div>
            </div>
          </div>
          <label id="contrat-checkbox-label" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:1rem;background:#f8fafc;cursor:pointer;margin-bottom:1rem">
            <input type="checkbox" id="contrat-checkbox" style="width:20px;height:20px;margin-top:2px;accent-color:#f97316;flex-shrink:0">
            <span style="font-size:0.78rem;color:#334155;line-height:1.5">Je d\u00e9clare avoir pris connaissance de l\u2019int\u00e9gralit\u00e9 du contrat et en accepter toutes les clauses.</span>
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
      // Re-render la page pour afficher le statut accepté
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
