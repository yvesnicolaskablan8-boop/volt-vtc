/**
 * SimulateurPage — Projection salariat + doublures.
 *
 * Part des vraies voitures et des vrais chauffeurs enregistres dans Pilote,
 * simule un mois complet de planification (binome titulaire/doublure, repos
 * decales, 6 jours consecutifs maximum) et en tire la projection financiere
 * jusqu'au benefice net, comparee au modele de location actuel.
 */
const SimulateurPage = {
  _mois: null,
  _params: null,
  _onglet: null,

  _defauts() {
    return { objectifCA: 70000, commission: 18, energie: 4000, entretien: 100000,
             location: 750000, salaire: 200000, charges: 18, recetteDoublure: 35000,
             fraisStructure: 300000, bonusHebdo: 15000, provision: 50000,
             tauxImpot: 25, refRecette: 35000, doublureSalariee: false };
  },

  render() {
    const container = document.getElementById('page-content');
    if (!this._mois) { const n = new Date(); this._mois = `${n.getFullYear()}-${n.getMonth()}`; }
    if (!this._onglet) {
      let o = null;
      try { o = localStorage.getItem('pilote_simulateur_onglet'); } catch (e) {}
      this._onglet = ['finance', 'jour', 'cal', 'effectif'].includes(o) ? o : 'finance';
    }
    if (!this._params) {
      let sauve = null;
      try { sauve = JSON.parse(localStorage.getItem('pilote_simulateur') || 'null'); } catch (e) {}
      this._params = Object.assign(this._defauts(), sauve || {});
      // Valeurs reelles de la flotte si elles existent
      const chs = (Store.get('chauffeurs') || []).filter(c => c.statut !== 'inactif');
      const avecRecette = chs.find(c => c.redevanceQuotidienne > 0);
      if (avecRecette && !sauve) {
        this._params.recetteDoublure = avecRecette.redevanceQuotidienne;
        this._params.refRecette = avecRecette.redevanceQuotidienne;
      }
      const avecSalaire = chs.find(c => c.salaireMensuel > 0);
      if (avecSalaire && !sauve) this._params.salaire = avecSalaire.salaireMensuel;
      const avecObjectif = chs.find(c => c.objectifCaJour > 0);
      if (avecObjectif && !sauve) this._params.objectifCA = avecObjectif.objectifCaJour;
    }
    container.innerHTML = this._template();
    this._bind();
    this._calculer();
  },

  _sauver() {
    try { localStorage.setItem('pilote_simulateur', JSON.stringify(this._params)); } catch (e) {}
  },

  /** Constitue les binomes a partir des vehicules et chauffeurs reels. */
  _equipes() {
    const vehicules = (Store.get('vehicules') || []).filter(v => v.statut !== 'inactif' && v.statut !== 'vendu');
    const chauffeurs = (Store.get('chauffeurs') || []).filter(c => c.statut !== 'inactif');
    const chById = {}; chauffeurs.forEach(c => { chById[c.id] = c; });

    const titulaires = [], utilises = new Set();
    vehicules.forEach((v, i) => {
      const ch = chById[v.chauffeurAssigne];
      if (ch) utilises.add(ch.id);
      const repos1 = (ch && (ch.jourRepos === 0 || ch.jourRepos)) ? Number(ch.jourRepos) : i % 7;
      // Les salaries ont DEUX jours de repos par semaine. Tant que la colonne
      // jour_repos_2 n'existe pas en base, on applique un second jour par defaut
      // decale de 3 jours. Sans ce defaut la simulation ne compterait qu'un seul
      // repos et surestimerait le CA d'environ 20 %.
      const aRepos2 = !!(ch && (ch.jourRepos2 === 0 || ch.jourRepos2));
      titulaires.push({
        id: ch ? ch.id : 'VIDE-' + v.id,
        nom: ch ? `${ch.prenom} ${ch.nom}` : `(sans titulaire) ${v.immatriculation || ''}`.trim(),
        repos: repos1,
        repos2: aRepos2 ? Number(ch.jourRepos2) : (repos1 + 3) % 7,
        repos2Defaut: !aRepos2,
        vehicule: v.immatriculation || `${v.marque || ''} ${v.modele || ''}`.trim() || v.id,
        reel: !!ch
      });
    });

    // Doublures : celles designees sur les vehicules, puis les chauffeurs sans voiture
    const doublures = [];
    vehicules.forEach(v => {
      const d = chById[v.doublureId];
      if (d && !utilises.has(d.id)) { utilises.add(d.id); doublures.push({ id: d.id, nom: `${d.prenom} ${d.nom}` }); }
    });
    chauffeurs.forEach(c => {
      if (utilises.has(c.id)) return;
      if (c.vehiculeAssigne) return;
      utilises.add(c.id);
      doublures.push({ id: c.id, nom: `${c.prenom} ${c.nom}` });
    });
    return { titulaires, doublures };
  },

  _template() {
    const now = new Date();
    const ongletActif = this._onglet || 'finance';
    let opts = '';
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${d.getMonth()}`;
      opts += `<option value="${val}" ${val === this._mois ? 'selected' : ''}>${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</option>`;
    }
    const p = this._params;
    const curseur = (id, label, min, max, step, aide) => `
      <div style="margin-bottom:12px;">
        <label style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);font-weight:600;margin-bottom:4px;">
          <span>${label}</span><output id="sim-o-${id}" style="font-weight:800;color:var(--pilote-blue);"></output>
        </label>
        <input type="range" id="sim-${id}" min="${min}" max="${max}" step="${step}" value="${p[id]}" style="width:100%;accent-color:var(--pilote-blue);">
        ${aide ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;line-height:1.4;">${aide}</div>` : ''}
      </div>`;

    return `
      <style>
        .sim-onglets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--space-md);}
        .sim-onglet{display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border-radius:10px;
          border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-secondary);
          font-size:var(--font-size-sm);font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;}
        .sim-onglet:hover{border-color:var(--pilote-blue);color:var(--pilote-blue);}
        .sim-onglet.actif{background:var(--pilote-blue);border-color:var(--pilote-blue);color:#fff;}
        .sim-panneau{display:none;}
        .sim-panneau.actif{display:block;}
        @media (min-width:1100px){
          .sim-hypotheses{position:sticky;top:12px;max-height:calc(100vh - 90px);overflow-y:auto;}
        }
        @media (max-width:1099px){
          .sim-colonnes{grid-template-columns:1fr !important;}
        }
      </style>
      <div class="page-header">
        <h1><iconify-icon icon="solar:calculator-minimalistic-bold-duotone"></iconify-icon> Simulateur salariat</h1>
        <div class="page-actions">
          <select id="sim-mois" class="form-control" style="width:auto;font-size:var(--font-size-xs);padding:5px 9px;">${opts}</select>
        </div>
      </div>

      <div class="d-sub" style="margin-bottom:var(--space-md);">
        Simulation d'un mois complet à partir de vos véhicules et chauffeurs réels : binôme titulaire/doublure,
        jours de repos décalés, 6 jours consécutifs maximum. Modifiez les hypothèses, tout se recalcule.
      </div>

      <div class="d-grid sim-colonnes" style="grid-template-columns:minmax(280px,340px) 1fr;gap:var(--space-lg);align-items:start;">
        <div class="card sim-hypotheses" style="padding:var(--space-md);">
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:12px;">Hypothèses</div>
          ${curseur('objectifCA', 'Objectif CA / jour', 20000, 120000, 1000)}
          ${curseur('commission', 'Commission Yango (%)', 0, 30, 1)}
          ${curseur('salaire', 'Salaire mensuel net', 100000, 400000, 10000)}
          ${curseur('charges', 'Charges patronales (%)', 0, 30, 1, 'CNPS et cotisations, en plus du net.')}
          <div style="margin-bottom:12px;">
            <label style="font-size:var(--font-size-xs);font-weight:600;display:block;margin-bottom:4px;">Statut des doublures</label>
            <select id="sim-doublureSalariee" class="form-control" style="font-size:var(--font-size-xs);padding:5px 8px;">
              <option value="0" ${!p.doublureSalariee ? 'selected' : ''}>Locataires — versent une recette</option>
              <option value="1" ${p.doublureSalariee ? 'selected' : ''}>Salariées — comme les titulaires</option>
            </select>
          </div>
          ${curseur('recetteDoublure', 'Recette versée par une doublure / jour', 0, 60000, 1000, 'Seulement les jours de remplacement, et seulement si elle est locataire.')}
          ${curseur('energie', 'Énergie / jour', 0, 15000, 500)}
          ${curseur('entretien', 'Entretien + assurance / voiture', 0, 300000, 10000)}
          ${curseur('location', 'Location du véhicule / mois', 0, 1200000, 25000)}
          ${curseur('fraisStructure', 'Frais de structure / mois', 0, 2000000, 50000, 'Bureau, gestion, comptable, frais bancaires.')}
          ${curseur('bonusHebdo', 'Bonus hebdo / salarié', 0, 50000, 2500)}
          ${curseur('provision', 'Provision sinistres / voiture', 0, 300000, 10000, 'Casse, franchises, pannes majeures.')}
          ${curseur('tauxImpot', 'Impôts & taxes (%)', 0, 40, 1, 'À confirmer avec votre comptable.')}
          ${curseur('refRecette', 'Comparaison — recette de votre modèle ACTUEL', 0, 60000, 1000, 'Ne concerne pas les doublures : sert à chiffrer ce que rapporte votre location actuelle.')}
          <button class="btn btn-sm btn-secondary" id="sim-reset" style="width:100%;margin-top:6px;">Rétablir les valeurs par défaut</button>
        </div>

        <div>
          <div id="sim-kpis" class="d-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:var(--space-md);"></div>
          <div id="sim-alerte"></div>
          <div class="sim-onglets" id="sim-onglets">
            <button class="sim-onglet${ongletActif === 'finance' ? ' actif' : ''}" data-onglet="finance"><iconify-icon icon="solar:chart-square-bold-duotone"></iconify-icon> Finances</button>
            <button class="sim-onglet${ongletActif === 'jour' ? ' actif' : ''}" data-onglet="jour"><iconify-icon icon="solar:sun-2-bold-duotone"></iconify-icon> Au jour le jour</button>
            <button class="sim-onglet${ongletActif === 'cal' ? ' actif' : ''}" data-onglet="cal"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Calendrier</button>
            <button class="sim-onglet${ongletActif === 'effectif' ? ' actif' : ''}" data-onglet="effectif"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon> Effectif</button>
          </div>

          <div class="sim-panneau${ongletActif === 'finance' ? ' actif' : ''}" data-panneau="finance">
            <div class="card" style="padding:var(--space-md);">
              <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px;">Projection financière</div>
              <div id="sim-finance"></div>
            </div>
          </div>

          <div class="sim-panneau${ongletActif === 'jour' ? ' actif' : ''}" data-panneau="jour">
            <div class="card" style="padding:var(--space-md);">
              <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px;">Au jour le jour</div>
              <div id="sim-jour"></div>
            </div>
          </div>

          <div class="sim-panneau${ongletActif === 'cal' ? ' actif' : ''}" data-panneau="cal">
          <div class="card" style="padding:var(--space-md);">
            <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px;">Calendrier du mois</div>
            <div id="sim-cal" style="overflow-x:auto;"></div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:var(--font-size-xs);margin-top:10px;align-items:center;">
              <span><span style="display:inline-block;width:13px;height:13px;border-radius:4px;background:#dbeafe;vertical-align:-2px;margin-right:5px;"></span>Titulaire</span>
              <span><span style="display:inline-block;width:13px;height:13px;border-radius:4px;background:#fef3c7;vertical-align:-2px;margin-right:5px;"></span>Doublure</span>
              <span><span style="display:inline-block;width:13px;height:13px;border-radius:4px;background:#f1f5f9;vertical-align:-2px;margin-right:5px;"></span>Voiture à l'arrêt</span>
            </div>
          </div>
          </div>

          <div class="sim-panneau${ongletActif === 'effectif' ? ' actif' : ''}" data-panneau="effectif">
            <div class="card" style="padding:var(--space-md);">
              <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px;">Effectif</div>
              <div id="sim-effectif" style="overflow-x:auto;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _bind() {
    const ids = ['objectifCA','commission','salaire','charges','recetteDoublure','energie','entretien',
                 'location','fraisStructure','bonusHebdo','provision','tauxImpot','refRecette'];
    ids.forEach(id => {
      const el = document.getElementById('sim-' + id);
      if (el) el.addEventListener('input', () => {
        this._params[id] = parseFloat(el.value) || 0;
        this._sauver(); this._calculer();
      });
    });
    const ds = document.getElementById('sim-doublureSalariee');
    if (ds) ds.addEventListener('change', () => {
      this._params.doublureSalariee = ds.value === '1'; this._sauver(); this._calculer();
    });
    const m = document.getElementById('sim-mois');
    if (m) m.addEventListener('change', () => { this._mois = m.value; this._calculer(); });
    const r = document.getElementById('sim-reset');
    if (r) r.addEventListener('click', () => { this._params = this._defauts(); this._sauver(); this.render(); });

    // Onglets : on bascule l'affichage sans recalculer, les panneaux sont deja remplis.
    const barre = document.getElementById('sim-onglets');
    if (barre) barre.addEventListener('click', (e) => {
      const btn = e.target.closest('.sim-onglet');
      if (!btn) return;
      const cible = btn.dataset.onglet;
      this._onglet = cible;
      try { localStorage.setItem('pilote_simulateur_onglet', cible); } catch (err) {}
      barre.querySelectorAll('.sim-onglet').forEach(b => b.classList.toggle('actif', b.dataset.onglet === cible));
      document.querySelectorAll('.sim-panneau').forEach(pn => pn.classList.toggle('actif', pn.dataset.panneau === cible));
    });
  },

  _calculer() {
    const p = this._params;
    ['objectifCA','commission','salaire','charges','recetteDoublure','energie','entretien',
     'location','fraisStructure','bonusHebdo','provision','tauxImpot','refRecette'].forEach(id => {
      const o = document.getElementById('sim-o-' + id);
      if (o) o.textContent = (id === 'commission' || id === 'charges' || id === 'tauxImpot')
        ? p[id] + ' %' : Utils.formatCurrency(p[id]);
    });

    const [annee, mois] = this._mois.split('-').map(Number);
    const { titulaires, doublures } = this._equipes();

    if (titulaires.length === 0) {
      document.getElementById('sim-kpis').innerHTML = '';
      document.getElementById('sim-alerte').innerHTML = `<div style="padding:12px 14px;border-radius:10px;background:rgba(180,83,9,.08);border:1px solid rgba(180,83,9,.2);color:#b45309;font-size:var(--font-size-sm);margin-bottom:12px;">Aucun véhicule actif : ajoutez des véhicules et assignez-leur un chauffeur titulaire pour lancer la simulation.</div>`;
      document.getElementById('sim-finance').innerHTML = '';
      document.getElementById('sim-cal').innerHTML = '';
      document.getElementById('sim-effectif').innerHTML = '';
      return;
    }

    const sim = Utils.simulerPlanningMois({ annee, mois, titulaires, doublures });
    const fin = Utils.simulerFinanceMois({
      nbVehicules: titulaires.length,
      nbDoublures: sim.doublures.length,
      doublureSalariee: p.doublureSalariee,
      joursTitulaires: sim.joursTitulaires,
      joursDoublures: sim.joursDoublures,
      objectifCA: p.objectifCA, commission: p.commission, energie: p.energie,
      entretien: p.entretien, location: p.location, salaire: p.salaire, charges: p.charges,
      recetteDoublure: p.recetteDoublure, fraisStructure: p.fraisStructure,
      bonusHebdo: p.bonusHebdo, provision: p.provision, tauxImpot: p.tauxImpot,
      refRecette: p.refRecette, refJours: titulaires.length * Math.round(sim.nbJours * 6 / 7)
    });

    const F = (n) => Utils.formatCurrency(n);
    const aRecruter = sim.doublures.filter(d => d.aRecruter).length;
    const sansTitulaire = titulaires.filter(t => !t.reel).length;

    document.getElementById('sim-kpis').innerHTML = `
      <div class="d-card"><div class="d-lbl">Chauffeurs nécessaires</div>
        <div class="d-val">${titulaires.length + sim.doublures.length}</div>
        <div class="d-sub">${titulaires.length} titulaires + ${sim.doublures.length} doublure${sim.doublures.length > 1 ? 's' : ''}${aRecruter > 0 ? ` · ${aRecruter} à recruter` : ''}</div></div>
      <div class="d-card"><div class="d-lbl">Jours-voiture couverts</div>
        <div class="d-val" style="color:${sim.arrets === 0 ? '#15803d' : '#b91c1c'}">${titulaires.length * sim.nbJours - sim.arrets}/${titulaires.length * sim.nbJours}</div>
        <div class="d-sub">${sim.arrets === 0 ? 'aucune voiture à l\'arrêt' : sim.arrets + ' non couvert(s)'}</div></div>
      <div class="d-card"><div class="d-lbl">Résultat d'exploitation</div>
        <div class="d-val" style="color:${fin.exploitation >= 0 ? '#15803d' : '#b91c1c'}">${F(fin.exploitation)}</div>
        <div class="d-sub">avant structure et impôts</div></div>
      <div class="d-card"><div class="d-lbl">Bénéfice net</div>
        <div class="d-val" style="color:${fin.net >= 0 ? '#15803d' : '#b91c1c'}">${F(fin.net)}</div>
        <div class="d-sub">${F(fin.net / titulaires.length)} par voiture</div></div>`;

    let alertes = '';
    if (sansTitulaire > 0) alertes += `<div style="padding:10px 13px;border-radius:10px;background:rgba(180,83,9,.08);border:1px solid rgba(180,83,9,.2);color:#b45309;font-size:var(--font-size-sm);margin-bottom:10px;">${sansTitulaire} véhicule(s) sans chauffeur titulaire assigné — la simulation leur attribue un jour de repos par défaut.</div>`;
    const repos = titulaires.map(t => t.repos);
    const collisions = repos.length - new Set(repos).size;
    if (collisions > 0) alertes += `<div style="padding:10px 13px;border-radius:10px;background:rgba(180,83,9,.08);border:1px solid rgba(180,83,9,.2);color:#b45309;font-size:var(--font-size-sm);margin-bottom:10px;">${collisions} jour(s) de repos en double : plusieurs voitures se reposent le même jour, ce qui multiplie le nombre de doublures nécessaires. Décalez les jours de repos sur les fiches chauffeurs.</div>`;
    if (sim.arrets > 0) alertes += `<div style="padding:10px 13px;border-radius:10px;background:rgba(185,28,28,.08);border:1px solid rgba(185,28,28,.2);color:#b91c1c;font-size:var(--font-size-sm);margin-bottom:10px;">${sim.arrets} jour(s)-voiture non couvert(s) : la règle des 6 jours consécutifs bloque. Il faut une doublure de plus.</div>`;
    const sansRepos2 = titulaires.filter(t => t.repos2Defaut).length;
    if (sansRepos2 > 0) alertes += `<div style="padding:10px 13px;border-radius:10px;background:rgba(37,99,235,.07);border:1px solid rgba(37,99,235,.2);color:#1d4ed8;font-size:var(--font-size-sm);margin-bottom:10px;">Les salariés ont deux jours de repos par semaine. Pour ${sansRepos2} chauffeur(s), le second jour n'est pas encore renseigné : la simulation applique un jour par défaut, décalé de 3 jours du premier. Les totaux sont donc justes, mais les jours exacts sont à confirmer sur les fiches chauffeurs.</div>`;
    if (!alertes) alertes = `<div style="padding:10px 13px;border-radius:10px;background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.2);color:#15803d;font-size:var(--font-size-sm);margin-bottom:10px;">Chaque voiture roule tous les jours du mois, personne ne dépasse 6 jours consécutifs, et les repos sont décalés.</div>`;
    document.getElementById('sim-alerte').innerHTML = alertes;

    const l = (lib, val, couleur) => `<tr style="border-bottom:1px solid var(--border-color);"><td style="padding:6px 8px;">${lib}</td><td style="padding:6px 8px;text-align:right;font-weight:700;${couleur ? 'color:' + couleur : ''}">${val}</td></tr>`;
    const nbV = titulaires.length;
    const joursPossibles = nbV * sim.nbJours;
    const joursExploites = sim.joursTitulaires + sim.joursDoublures;
    const moyTit = nbV > 0 ? Math.round(sim.joursTitulaires / nbV) : 0;
    const moyDoub = nbV > 0 ? Math.round(sim.joursDoublures / nbV) : 0;
    const moyArr = sim.nbJours - moyTit - moyDoub;
    const pt = (couleur, txt) => `<div style="display:flex;align-items:baseline;gap:7px;margin-top:4px;"><span style="color:${couleur};font-weight:900;">&bull;</span><span>${txt}</span></div>`;
    const libCA = p.doublureSalariee
      ? `Jours-voiture conduits par un salarié (${fin.joursCA} × ${F(p.objectifCA)})`
      : `Jours-voiture conduits par les titulaires (${sim.joursTitulaires} × ${F(p.objectifCA)})`;
    document.getElementById('sim-finance').innerHTML = `
      <div style="padding:11px 13px;border-radius:10px;background:var(--bg-tertiary);font-size:var(--font-size-xs);line-height:1.55;margin-bottom:12px;">
        <div style="font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:9px;">Base de calcul</div>
        <div style="font-weight:800;">1 — Ce que vit UNE voiture sur le mois : ${sim.nbJours} jours à couvrir</div>
        ${pt('#15803d', `environ <strong>${moyTit} jours</strong> conduits par son titulaire salarié (il a 2 jours de repos par semaine)`)}
        ${moyDoub > 0 ? pt(p.doublureSalariee ? '#15803d' : '#2563eb', `environ <strong>${moyDoub} jours</strong> conduits par sa doublure`) : ''}
        ${moyArr > 0 ? pt('#b91c1c', `environ <strong>${moyArr} jours</strong> sans conducteur`) : ''}
        <div style="margin-top:3px;color:var(--text-muted);">${moyTit} + ${moyDoub}${moyArr > 0 ? ' + ' + moyArr : ''} = ${sim.nbJours} jours. Aucun chauffeur ne roule plus de ${sim.nbJours} jours.</div>
        <div style="font-weight:800;margin-top:11px;">2 — Le parc entier : on additionne les ${nbV} voiture${nbV > 1 ? 's' : ''}</div>
        <div style="color:var(--text-muted);margin-bottom:3px;">L'unité devient le <strong>jour-voiture</strong> : une voiture qui roule un jour.</div>
        ${pt('#15803d', `<strong>${sim.joursTitulaires} jours-voiture</strong> assurés par les titulaires → le CA vous revient (${F(p.objectifCA)}/j)`)}
        ${sim.joursDoublures > 0 ? pt(p.doublureSalariee ? '#15803d' : '#2563eb', `<strong>${sim.joursDoublures} jours-voiture</strong> assurés par les doublures → ${p.doublureSalariee ? `doublures salariées, le CA vous revient aussi (${F(p.objectifCA)}/j)` : `doublures locataires : elles gardent le CA et vous versent ${F(p.recetteDoublure)}/j`}`) : ''}
        ${sim.arrets > 0 ? pt('#b91c1c', `<strong>${sim.arrets} jours-voiture</strong> sans conducteur → aucune recette`) : ''}
        <div style="margin-top:7px;padding-top:7px;border-top:1px solid var(--border-color);"><strong>${joursExploites} jours-voiture exploités</strong> sur ${joursPossibles} possibles (${nbV} × ${sim.nbJours}) — parc utilisé à ${joursPossibles > 0 ? Math.round(joursExploites / joursPossibles * 100) : 0} %</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
        ${l(libCA, '+ ' + F(fin.caBrut))}
        ${l(`− Commission Yango (${p.commission} %)`, '− ' + F(fin.commission), '#b91c1c')}
        ${!p.doublureSalariee ? l(`Jours-voiture confiés aux doublures (${sim.joursDoublures} × ${F(p.recetteDoublure)})`, '+ ' + F(fin.recettesDoublures), '#15803d') : ''}
        ${l(`− Masse salariale chargée (${fin.nbSalaries} salariés)`, '− ' + F(fin.masse), '#b91c1c')}
        ${l('− Énergie', '− ' + F(fin.coutEnergie), '#b91c1c')}
        ${l(`− Entretien, assurance, location (${titulaires.length} voitures)`, '− ' + F(fin.coutFixe), '#b91c1c')}
        <tr style="background:var(--bg-tertiary);"><td style="padding:7px 8px;"><strong>= Résultat d'exploitation</strong></td><td style="padding:7px 8px;text-align:right;"><strong style="color:${fin.exploitation >= 0 ? '#15803d' : '#b91c1c'}">${F(fin.exploitation)}</strong></td></tr>
        ${l('− Frais de structure', '− ' + F(p.fraisStructure), '#b91c1c')}
        ${l(`− Bonus hebdomadaires (${fin.nbSalaries} × ${F(p.bonusHebdo)}/sem)`, '− ' + F(fin.bonus), '#b91c1c')}
        ${l('− Provision sinistres & réparations', '− ' + F(fin.provisions), '#b91c1c')}
        ${l('<strong>= Résultat avant impôt</strong>', '<strong>' + F(fin.avantImpot) + '</strong>')}
        ${l(`− Impôts & taxes (${p.tauxImpot} %)`, '− ' + F(fin.impot), '#b91c1c')}
        <tr style="background:var(--bg-tertiary);"><td style="padding:8px;"><strong>BÉNÉFICE NET</strong></td><td style="padding:8px;text-align:right;"><strong style="font-size:1.05rem;color:${fin.net >= 0 ? '#15803d' : '#b91c1c'}">${F(fin.net)}</strong></td></tr>
      </table>
      <div style="margin-top:12px;padding:11px 13px;border-radius:10px;background:${fin.ecart >= 0 ? 'rgba(22,163,74,.08)' : 'rgba(185,28,28,.08)'};border:1px solid ${fin.ecart >= 0 ? 'rgba(22,163,74,.2)' : 'rgba(185,28,28,.2)'};font-size:var(--font-size-sm);line-height:1.6;">
        <strong>Comparaison (résultat d'exploitation) :</strong> votre modèle de location actuel rapporterait <strong>${F(fin.referenceExploitation)}</strong>.
        Le salariat fait donc <strong>${fin.ecart >= 0 ? 'gagner' : 'perdre'} ${F(Math.abs(fin.ecart))}</strong> par mois.
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,0,0,.08);">
          <strong>Point de bascule : ${F(fin.seuilCA)} de CA par jour.</strong>
          ${p.objectifCA >= fin.seuilCA ? ` Votre objectif de ${F(p.objectifCA)} est au-dessus.` : ` Votre objectif de ${F(p.objectifCA)} est en dessous : la location reste plus rentable.`}
          <br><span style="opacity:.85;">Tant que le CA réel n'est pas mesuré (Yango Fleet → CA réel par chauffeur), ce seuil reste une hypothèse.</span>
        </div>
      </div>`;

    // --- Vue journalière : le mois ramené au jour ---
    const joursVoiture = titulaires.length * sim.nbJours - sim.arrets;
    const chargesTotales = fin.masse + fin.coutEnergie + fin.coutFixe + p.fraisStructure + fin.bonus + fin.provisions;
    const netJour = fin.net / sim.nbJours;
    const netJourVoiture = titulaires.length > 0 ? fin.net / sim.nbJours / titulaires.length : 0;
    const netParJourRoule = joursVoiture > 0 ? fin.net / joursVoiture : 0;
    const seuilJourVoiture = titulaires.length > 0 ? (chargesTotales / sim.nbJours) / titulaires.length : 0;
    const tuile = (lbl, val, sous, couleur) => `
      <div class="d-card" style="padding:12px;">
        <div class="d-lbl" style="font-size:11px;">${lbl}</div>
        <div style="font-size:1.25rem;font-weight:900;color:${couleur};margin-top:2px;">${F(val)}</div>
        <div class="d-sub">${sous}</div>
      </div>`;
    const vert = '#15803d', rouge = '#b91c1c';
    document.getElementById('sim-jour').innerHTML = `
      <div class="d-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;">
        ${tuile('Bénéfice net / jour', netJour, `sur ${sim.nbJours} jours`, netJour >= 0 ? vert : rouge)}
        ${tuile('Par voiture et par jour', netJourVoiture, `${titulaires.length} voiture${titulaires.length > 1 ? 's' : ''}`, netJourVoiture >= 0 ? vert : rouge)}
        ${tuile('Par jour réellement roulé', netParJourRoule, `${joursVoiture} jours-voiture`, netParJourRoule >= 0 ? vert : rouge)}
        ${tuile('Seuil de couverture', seuilJourVoiture, 'à couvrir / voiture / jour', 'var(--pilote-blue)')}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
        ${l('Produits encaissés par jour', '+ ' + F((fin.caNet + fin.recettesDoublures) / sim.nbJours), vert)}
        ${l('Charges totales par jour', '− ' + F(chargesTotales / sim.nbJours), rouge)}
        ${l("<strong>= Résultat d'exploitation / jour</strong>", '<strong>' + F(fin.exploitation / sim.nbJours) + '</strong>')}
        <tr style="background:var(--bg-tertiary);"><td style="padding:7px 8px;"><strong>= Bénéfice net / jour</strong></td><td style="padding:7px 8px;text-align:right;"><strong style="color:${netJour >= 0 ? vert : rouge}">${F(netJour)}</strong></td></tr>
      </table>
      <div class="d-sub" style="margin-top:8px;line-height:1.5;">
        Le <strong>seuil de couverture</strong> est ce que chaque voiture doit rapporter chaque jour pour payer
        l'ensemble des charges. En dessous, la journée coûte de l'argent.
      </div>`;

    const JJ = ['D','L','M','M','J','V','S'];
    const NOMS_J = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    const court = (nom) => { const m = String(nom || '').trim().split(/\s+/)[0]; return m.length > 8 ? m.slice(0, 8) : m; };
    let th = '<tr><th style="position:sticky;left:0;background:var(--bg-tertiary);z-index:2;padding:5px 9px;text-align:left;font-size:10px;min-width:165px;">Véhicule</th>';
    for (let j = 1; j <= sim.nbJours; j++) {
      const dow = new Date(annee, mois, j).getDay();
      th += `<th style="padding:3px 2px;font-size:9.5px;min-width:32px;background:${dow === 0 ? 'var(--border-color)' : 'var(--bg-tertiary)'};color:var(--text-secondary);">${j}<div style="font-weight:400;font-size:8.5px;">${JJ[dow]}</div></th>`;
    }
    th += '</tr>';
    let rows = '';
    titulaires.forEach((t, v) => {
      rows += `<tr><td style="position:sticky;left:0;background:var(--bg-secondary);z-index:1;padding:5px 9px;text-align:left;font-size:11px;font-weight:700;border-bottom:1px solid var(--border-color);">${Utils.escHtml(t.vehicule || ('Voiture ' + (v + 1)))}<div style="font-weight:400;font-size:9.5px;color:var(--text-muted);">${Utils.escHtml(t.nom)} · repos ${[t.repos, t.repos2].filter(x => x === 0 || x).map(x => NOMS_J[x]).join(' et ')}</div></td>`;
      for (let j = 0; j < sim.nbJours; j++) {
        const c = sim.grille[v][j];
        const bg = !c ? '#f1f5f9' : (c.role === 'titulaire' ? '#dbeafe' : '#fef3c7');
        const fg = !c ? '#94a3b8' : (c.role === 'titulaire' ? '#1e3a8a' : '#92400e');
        rows += `<td style="border:1px solid var(--border-color);padding:0;"><div title="${c ? Utils.escHtml(c.nom) : 'Voiture à l\'arrêt'}" style="background:${bg};color:${fg};padding:5px 2px;font-size:9.5px;font-weight:700;overflow:hidden;">${c ? Utils.escHtml(court(c.nom)) : '—'}</div></td>`;
      }
      rows += '</tr>';
    });
    document.getElementById('sim-cal').innerHTML = `<table style="border-collapse:collapse;font-size:11px;">${th}${rows}</table>`;

    const tous = [...sim.titulaires.map(t => ({ ...t, role: 'Titulaire (salarié)' })),
                  ...sim.doublures.map(d => ({ ...d, role: d.aRecruter ? 'Doublure — À RECRUTER' : (p.doublureSalariee ? 'Doublure (salariée)' : 'Doublure (locataire)') }))];
    document.getElementById('sim-effectif').innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);min-width:520px;">
        <tr style="background:var(--bg-tertiary);">
          <th style="padding:7px 8px;text-align:left;font-size:var(--font-size-xs);color:var(--text-secondary);">Chauffeur</th>
          <th style="padding:7px 8px;text-align:left;font-size:var(--font-size-xs);color:var(--text-secondary);">Rôle</th>
          <th style="padding:7px 8px;text-align:right;font-size:var(--font-size-xs);color:var(--text-secondary);">Jours</th>
          <th style="padding:7px 8px;text-align:right;font-size:var(--font-size-xs);color:var(--text-secondary);">Repos</th>
          <th style="padding:7px 8px;text-align:right;font-size:var(--font-size-xs);color:var(--text-secondary);">Max consécutifs</th>
        </tr>
        ${tous.map(x => { const mc = Utils.maxJoursConsecutifs(x.jours); return `<tr style="border-bottom:1px solid var(--border-color);">
          <td style="padding:6px 8px;font-weight:600;">${Utils.escHtml(x.nom)}</td>
          <td style="padding:6px 8px;${x.aRecruter ? 'color:#b91c1c;font-weight:700;' : ''}">${x.role}</td>
          <td style="padding:6px 8px;text-align:right;">${x.jours.length}</td>
          <td style="padding:6px 8px;text-align:right;">${sim.nbJours - x.jours.length}</td>
          <td style="padding:6px 8px;text-align:right;color:${mc > 6 ? '#b91c1c' : 'inherit'};">${mc}</td></tr>`; }).join('')}
      </table>`;
  }
};
