/**
 * AlertesPage - Système d'alertes intelligentes
 *
 * Détecte automatiquement et affiche les alertes pour :
 * 1. Documents expirés ou à renouveler (permis, carte VTC, assurance)
 * 2. Révisions véhicules imminentes (kilométrage proche)
 * 3. Assurances véhicules expirant bientôt
 * 4. Versements en retard ou partiels
 * 5. Scores de conduite faibles (< 60)
 * 6. Chauffeurs sans véhicule assigné
 * 7. Factures impayées ou en retard
 * 8. Budgets dépassés
 * 9. Objectif CA Yango non atteint (vérifié sur la veille)
 */
const AlertesPage = {
  _charts: [],
  _currentFilter: 'all',

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._loadAlerts();
    document.body.classList.add('alertes-focus'); // masque la barre latérale sur la page Alertes
  },

  destroy() {
    document.body.classList.remove('alertes-focus');
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _goBack() {
    if (window.history.length > 1) window.history.back();
    else if (typeof Router !== 'undefined') Router.navigate('/dashboard');
  },

  // Résolution d'une alerte directement depuis la page, sans changer de page.
  _resolveInline(type, chauffeurId) {
    if (type === 'redevance') {
      const ch = (Store.get('chauffeurs') || []).find(c => c.id === chauffeurId);
      if (!ch) { Toast.error('Chauffeur introuvable'); return; }
      const nom = `${ch.prenom || ''} ${ch.nom || ''}`.trim();
      const fields = [{ name: 'redevanceQuotidienne', label: 'Recette quotidienne (FCFA / jour)', type: 'number', min: 0, step: 500, required: true, placeholder: 'Montant journalier à verser' }];
      const formHtml = FormBuilder.build(fields, ch);
      Modal.form(`<iconify-icon icon="solar:wallet-money-bold-duotone" class="text-blue"></iconify-icon> Redevance — ${Utils.escHtml(nom)}`, formHtml, () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);
        const val = Number(values.redevanceQuotidienne) || 0;
        if (val <= 0) { Toast.error('Saisis un montant supérieur à 0'); return; }
        Store.update('chauffeurs', chauffeurId, { redevanceQuotidienne: val });
        Modal.close();
        Toast.success('Redevance configurée pour ' + nom);
        AlertesPage._loadAlerts(); // régénère la liste : l'alerte disparaît
      });
    } else if (type === 'salarie') {
      const ch = (Store.get('chauffeurs') || []).find(c => c.id === chauffeurId);
      if (!ch) { Toast.error('Chauffeur introuvable'); return; }
      const nom = `${ch.prenom || ''} ${ch.nom || ''}`.trim();
      const fields = [
        { name: 'salaireMensuel', label: 'Salaire mensuel net (FCFA)', type: 'number', min: 0, step: 10000, placeholder: 'Ex : 200000' },
        { name: 'objectifCaJour', label: 'Objectif CA / jour (FCFA)', type: 'number', min: 0, step: 5000, placeholder: 'Ex : 75000' }
      ];
      const formHtml = FormBuilder.build(fields, ch);
      Modal.form(`<iconify-icon icon="solar:wallet-money-bold-duotone" class="text-blue"></iconify-icon> Paramètres salarié — ${Utils.escHtml(nom)}`, formHtml, () => {
        const body = document.getElementById('modal-body');
        const values = FormBuilder.getValues(body);
        const sal = Number(values.salaireMensuel) || 0;
        const obj = Number(values.objectifCaJour) || 0;
        if (sal <= 0 && obj <= 0) { Toast.error('Saisis au moins un montant'); return; }
        Store.update('chauffeurs', chauffeurId, { salaireMensuel: sal, objectifCaJour: obj });
        Modal.close();
        Toast.success('Paramètres salarié enregistrés pour ' + nom);
        AlertesPage._loadAlerts();
      });
    } else if (type === 'objectif') {
      const alert = (this._allAlerts || []).find(a => a.inlineType === 'objectif' && a.chauffeurId === chauffeurId);
      if (!alert) { Toast.error('Alerte introuvable'); return; }
      const ch = (Store.get('chauffeurs') || []).find(c => c.id === chauffeurId);
      const nom = ch ? `${ch.prenom || ''} ${ch.nom || ''}`.trim() : 'Chauffeur';
      const isSalarie = ch && ch.typeContrat === 'salarie';
      // Champ pré-rempli avec le manque (montant de l'alerte), toujours éditable.
      const sugg = Math.max(0, Number(alert.manque) || 0);
      let hint = 'recette manquante';
      if (isSalarie) {
        // Repère salarié : la perte cash réelle ≈ coût du jour (salaire/22 + charges) − CA
        // (le manque d'objectif = CA non généré, pas de l'argent perdu).
        const salaireJour = ch.salaireMensuel > 0 ? Math.round(ch.salaireMensuel / 22) : 0;
        const chargeJour = (Store.get('charges') || []).filter(x => x.chauffeurId === chauffeurId && x.date === alert.date).reduce((s, x) => s + (Number(x.montant) || 0), 0);
        const perteReelle = Math.max(0, salaireJour + chargeJour - (Number(alert.ca) || 0));
        hint = `salarié : perte cash estimée ≈ ${Utils.formatCurrency(perteReelle)} (coût jour − CA), ajuste`;
      }
      const fields = [
        { name: 'traitement', label: 'Traitement du manque', type: 'select', required: true, options: [
          { value: 'perte', label: 'Passer en perte (non imputé au chauffeur)' },
          { value: 'dette', label: 'Imputer en dette au chauffeur' }
        ] },
        { name: 'montant', label: `Montant de la perte / dette (FCFA) — ${hint}`, type: 'number', min: 0, step: 500 },
        { name: 'motif', label: 'Motif', type: 'select', required: true, options: [
          { value: 'performance', label: 'Manque de performance du chauffeur' },
          { value: 'accident', label: 'Accident' },
          { value: 'panne', label: 'Panne / véhicule immobilisé' },
          { value: 'autre', label: 'Autre' }
        ] },
        { name: 'commentaire', label: 'Commentaire (optionnel)', type: 'text', placeholder: 'Précision sur la situation…' }
      ];
      const formHtml = FormBuilder.build(fields, { traitement: 'perte', montant: sugg, motif: 'performance' });
      Modal.form(`<iconify-icon icon="solar:target-bold-duotone" class="text-blue"></iconify-icon> Justifier — ${Utils.escHtml(nom)}`, formHtml, () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);
        const perte = (values.traitement || 'perte') === 'perte';
        const montant = Math.max(0, Number(values.montant) || 0);
        const motifLabel = { performance: 'Manque de performance', accident: 'Accident', panne: 'Panne / véhicule', autre: 'Autre' }[values.motif] || values.motif || '';
        Store.add('versements', {
          id: Utils.generateId('VRS'),
          chauffeurId,
          date: alert.date,
          dateService: alert.date,
          vehiculeId: ch ? (ch.vehiculeAssigne || null) : null,
          montantBrut: Number(alert.ca) || 0,
          montantVerse: 0,
          montantNet: 0,
          nombreCourses: 0,
          commission: 0,
          manquant: montant,
          traitementManquant: perte ? 'perte' : 'dette',
          statut: perte ? 'perte' : 'partiel',
          reference: 'OBJ-' + alert.date,
          commentaire: `Objectif CA non atteint (${alert.pct}%) — ${motifLabel}${values.commentaire ? ' : ' + values.commentaire : ''}`,
          dateCreation: new Date().toISOString()
        });
        Modal.close();
        Toast.success(`Justifié — ${Utils.formatCurrency(montant)} en ${perte ? 'perte' : 'dette'}`);
        AlertesPage._allAlerts = (AlertesPage._allAlerts || []).filter(a => !(a.inlineType === 'objectif' && a.chauffeurId === chauffeurId));
        AlertesPage._persistSeverity(AlertesPage._allAlerts);
        AlertesPage._renderKPIs(AlertesPage._allAlerts);
        AlertesPage._renderAlertsList(AlertesPage._allAlerts);
      });
    }
  },

  _template() {
    return `
      <style>
        body.alertes-focus .sidebar { display: none !important; }
        body.alertes-focus .main-content { margin-left: 0 !important; }
        body.alertes-focus #sidebar-toggle { display: none !important; }
      </style>
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          <button onclick="AlertesPage._goBack()" style="flex-shrink:0;display:inline-flex;align-items:center;gap:8px;background:var(--pilote-blue);color:#fff;border:none;font-weight:700;font-size:14px;padding:10px 20px;border-radius:12px;cursor:pointer;box-shadow:0 6px 16px rgba(93,135,255,.35);"><iconify-icon icon="solar:arrow-left-linear" style="font-size:19px;"></iconify-icon> Retour</button>
          <h1 style="margin:0;"><iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon> Centre d'Alertes</h1>
        </div>
        <div class="page-actions">
          <button class="btn btn-sm btn-secondary" id="btn-refresh-alerts"><iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Actualiser</button>
          <button class="btn btn-sm btn-secondary" id="btn-export-alerts"><iconify-icon icon="solar:file-bold-duotone"></iconify-icon> Exporter PDF</button>
        </div>
      </div>

      <!-- Bandeau notifications -->
      <div id="notif-stats-banner" style="margin-bottom:var(--space-lg);display:none;"></div>

      <!-- KPIs -->
      <div class="grid-4" id="alerts-kpis" style="margin-bottom:var(--space-lg);"></div>

      <!-- Filtres par catégorie -->
      <div class="card" style="margin-bottom:var(--space-lg);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;align-items:center;" id="alert-filters">
          <button class="btn btn-sm btn-primary alert-filter active" data-filter="all"><iconify-icon icon="solar:list-bold-duotone"></iconify-icon> Toutes</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="critique"><iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon> Critiques</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="urgent"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Urgentes</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="attention"><iconify-icon icon="solar:info-circle-bold-duotone"></iconify-icon> Attention</button>
          <span style="flex:1;"></span>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="documents"><iconify-icon icon="solar:user-id-bold-duotone"></iconify-icon> Documents</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="vehicules"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon> Véhicules</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="versements"><iconify-icon icon="solar:money-bag-bold-duotone"></iconify-icon> Versements</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="conduite"><iconify-icon icon="solar:spedometer-max-bold-duotone"></iconify-icon> Conduite</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="finance"><iconify-icon icon="solar:calculator-bold-duotone"></iconify-icon> Finance</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="yango"><iconify-icon icon="solar:bus-bold-duotone"></iconify-icon> Yango</button>
        </div>
      </div>

      <!-- Bandeau alertes ignorées -->
      <div id="ignored-banner" style="margin-bottom:var(--space-sm);"></div>

      <!-- Liste des alertes -->
      <div id="alerts-list"></div>

      <!-- Charts -->
      <div class="charts-grid" style="margin-top:var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:pie-chart-2-bold-duotone"></iconify-icon> Répartition par catégorie</div></div>
          <div class="chart-container" style="height:280px;"><canvas id="chart-alerts-category"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Répartition par niveau</div></div>
          <div class="chart-container" style="height:280px;"><canvas id="chart-alerts-level"></canvas></div>
        </div>
      </div>
    `;
  },

  _bindEvents() {
    document.getElementById('btn-refresh-alerts').addEventListener('click', () => {
      this._loadAlerts();
      Toast.success('Alertes actualisées');
    });

    document.getElementById('btn-export-alerts').addEventListener('click', () => this._exportPDF());

    document.querySelectorAll('.alert-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.alert-filter').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
          b.classList.remove('active');
        });
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
        btn.classList.add('active');
        this._currentFilter = btn.dataset.filter;
        this._renderAlertsList(this._allAlerts || this._generateAllAlerts());
      });
    });
  },

  _loadAlerts() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];

    const alerts = this._generateAllAlerts();
    this._allAlerts = alerts;
    this._persistSeverity(alerts);
    this._renderKPIs(alerts);
    this._renderAlertsList(alerts);
    this._renderIgnoredBanner();
    this._renderCharts(alerts);
    this._loadNotifStats();

    // Load Yango objectif alerts asynchronously
    this._checkYangoObjectifs();
  },

  async _loadNotifStats() {
    const banner = document.getElementById('notif-stats-banner');
    if (!banner) return;

    try {
      const notifs = Store.get('notifications') || [];
      const now = new Date();
      const moisDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const aujourdHuiDebut = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const moisNotifs = notifs.filter(n => n.created_at >= moisDebut);

      const total = moisNotifs.length;
      const sms = moisNotifs.filter(n => n.canal === 'sms').length;
      const echecs = moisNotifs.filter(n => n.statut === 'echec').length;
      const aujourd_hui = notifs.filter(n => n.created_at >= aujourdHuiDebut).length;

      if (total === 0 && aujourd_hui === 0) {
        banner.style.display = 'none';
        return;
      }

      banner.style.display = 'block';
      banner.innerHTML = `
        <div class="card" style="border-left:4px solid var(--primary);background:linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));">
          <div style="display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap;">
            <div style="width:40px;height:40px;border-radius:50%;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--primary);">
              <iconify-icon icon="solar:plain-bold-duotone"></iconify-icon>
            </div>
            <div style="flex:1;min-width:200px;">
              <div style="font-weight:600;font-size:var(--font-size-sm);">Notifications ce mois</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:2px;">
                <strong>${total}</strong> envoyees &bull; <strong>${sms}</strong> SMS (~${stats.mois?.coutEstimeSMS || 0}$) &bull; <strong>${echecs}</strong> echec(s) &bull; <strong>${aujourd_hui}</strong> aujourd'hui
              </div>
            </div>
            <a href="#/parametres" class="btn btn-sm btn-secondary" onclick="setTimeout(()=>{const tabs=document.querySelectorAll('#settings-tabs .tab');tabs.forEach(t=>{if(t.dataset.tab==='notifications-settings'){t.click();}});},200);">
              <iconify-icon icon="solar:settings-bold-duotone"></iconify-icon> Configurer
            </a>
          </div>
        </div>
      `;
    } catch (e) {
      banner.style.display = 'none';
    }
  },

  // =================== GENERATION DES ALERTES ===================

  _generateAllAlerts() {
    const alerts = [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Versements (chargés ici pour les alertes dette dans la boucle chauffeurs)
    const allVersements = Store.get('versements') || [];

    // 1. Documents chauffeurs
    const chauffeurs = Store.get('chauffeurs') || [];
    chauffeurs.forEach(ch => {
      if (ch.statut === 'inactif') return;
      const nom = `${ch.prenom} ${ch.nom}`;

      (ch.documents || []).forEach(doc => {
        if (!doc.dateExpiration) return;
        const expDate = new Date(doc.dateExpiration);
        const daysUntil = Math.ceil((expDate - now) / 86400000);

        if (daysUntil < 0) {
          alerts.push({
            id: `DOC-${ch.id}-${doc.type}`,
            categorie: 'documents',
            niveau: 'critique',
            titre: `${doc.nom} expiré`,
            description: `${nom} — ${doc.nom} expiré depuis ${Math.abs(daysUntil)} jours (${Utils.formatDate(doc.dateExpiration)})`,
            chauffeurId: ch.id,
            action: 'Renouveler le document',
            actionRoute: `#/chauffeurs/${ch.id}`,
            icon: 'solar:user-id-bold-duotone',
            date: doc.dateExpiration
          });
        } else if (daysUntil <= 30) {
          alerts.push({
            id: `DOC-${ch.id}-${doc.type}`,
            categorie: 'documents',
            niveau: 'urgent',
            titre: `${doc.nom} expire bientôt`,
            description: `${nom} — ${doc.nom} expire dans ${daysUntil} jours (${Utils.formatDate(doc.dateExpiration)})`,
            chauffeurId: ch.id,
            action: 'Planifier le renouvellement',
            actionRoute: `#/chauffeurs/${ch.id}`,
            icon: 'solar:user-id-bold-duotone',
            date: doc.dateExpiration
          });
        } else if (daysUntil <= 90) {
          alerts.push({
            id: `DOC-${ch.id}-${doc.type}`,
            categorie: 'documents',
            niveau: 'attention',
            titre: `${doc.nom} à renouveler`,
            description: `${nom} — ${doc.nom} expire dans ${daysUntil} jours (${Utils.formatDate(doc.dateExpiration)})`,
            chauffeurId: ch.id,
            action: 'Voir la fiche chauffeur',
            actionRoute: `#/chauffeurs/${ch.id}`,
            icon: 'solar:user-id-bold-duotone',
            date: doc.dateExpiration
          });
        }
      });

      // Chauffeur sans véhicule
      if (ch.statut === 'actif' && !ch.vehiculeAssigne) {
        alerts.push({
          id: `NOVEH-${ch.id}`,
          categorie: 'vehicules',
          niveau: 'attention',
          titre: 'Chauffeur sans véhicule',
          description: `${nom} est actif mais n'a aucun véhicule assigné`,
          chauffeurId: ch.id,
          action: 'Assigner un véhicule',
          actionRoute: `#/chauffeurs/${ch.id}`,
          icon: 'solar:wheel-bold-duotone',
          date: todayStr
        });
      }

      // Chauffeur actif en LOCATION sans redevance quotidienne.
      // Les salariés (payés au mois) ne doivent aucune recette : pas d'alerte pour eux.
      if (ch.statut === 'actif' && (ch.typeContrat || 'location') !== 'salarie' && (!ch.redevanceQuotidienne || ch.redevanceQuotidienne <= 0)) {
        alerts.push({
          id: `NOREDEV-${ch.id}`,
          categorie: 'versements',
          niveau: 'attention',
          titre: 'Redevance non définie',
          description: `${nom} est actif mais n'a pas de redevance quotidienne configurée. Il ne sera pas comptabilisé dans les versements attendus.`,
          chauffeurId: ch.id,
          action: 'Configurer la redevance',
          inlineType: 'redevance',
          actionRoute: `#/chauffeurs/${ch.id}`,
          icon: 'solar:wallet-money-bold-duotone',
          date: todayStr
        });
      }

      // Chauffeur salarié actif : paramètres du modèle salariat manquants (salaire / objectif CA).
      if (ch.statut === 'actif' && ch.typeContrat === 'salarie') {
        const manquants = [];
        if (!ch.salaireMensuel || ch.salaireMensuel <= 0) manquants.push('salaire mensuel');
        if (!ch.objectifCaJour || ch.objectifCaJour <= 0) manquants.push('objectif CA/jour');
        if (manquants.length) {
          alerts.push({
            id: `SALPARAM-${ch.id}`,
            categorie: 'versements',
            niveau: 'attention',
            titre: 'Paramètres salarié incomplets',
            description: `${nom} est salarié mais n'a pas configuré son ${manquants.join(' ni son ')}. Nécessaire pour suivre son objectif et sa rentabilité.`,
            chauffeurId: ch.id,
            action: 'Configurer',
            inlineType: 'salarie',
            actionRoute: `#/chauffeurs/${ch.id}`,
            icon: 'solar:wallet-money-bold-duotone',
            date: todayStr
          });
        }
      }

      // Dette élevée
      if (ch.statut === 'actif' && ch.redevanceQuotidienne > 0) {
        const detteTotale = allVersements
          .filter(v => v.chauffeurId === ch.id && v.traitementManquant === 'dette' && v.manquant > 0)
          .reduce((s, v) => s + v.manquant, 0);
        if (detteTotale > 0) {
          const ratio = detteTotale / ch.redevanceQuotidienne;
          let niveau = null;
          if (ratio >= 5) niveau = 'critique';
          else if (ratio >= 3) niveau = 'urgent';
          else if (ratio >= 1) niveau = 'attention';
          if (niveau) {
            alerts.push({
              id: `DETTE-${ch.id}`,
              categorie: 'versements',
              niveau,
              titre: 'Dette \u00e9lev\u00e9e',
              description: `${nom} a une dette cumul\u00e9e de ${detteTotale.toLocaleString('fr-FR')} FCFA (${Math.round(ratio)} jour${ratio >= 2 ? 's' : ''} de redevance).`,
              chauffeurId: ch.id,
              action: 'Encaisser la dette',
              actionRoute: '#/versements',
              icon: 'solar:wallet-money-bold-duotone',
              date: todayStr
            });
          }
        }
      }

      // Documents chauffeur (champs date directe)
      const docFieldsChauffeur = [
        { field: 'dateExpirationPermis', label: 'Permis de conduire', labelCourt: 'Permis' },
        { field: 'dateExpirationVTC', label: 'Carte VTC', labelCourt: 'Carte VTC' },
        { field: 'dateExpirationVisite', label: 'Visite médicale', labelCourt: 'Visite médicale' }
      ];
      docFieldsChauffeur.forEach(({ field, label, labelCourt }) => {
        if (!ch[field]) return;
        const expDate = new Date(ch[field]);
        const daysUntil = Math.ceil((expDate - now) / 86400000);
        if (daysUntil < 0) {
          alerts.push({
            id: Utils.generateId('ALR'),
            type: 'document',
            categorie: 'documents',
            niveau: 'critique',
            titre: `${labelCourt} expiré — ${nom}`,
            description: `Le ${label.toLowerCase()} de ${nom} a expiré le ${Utils.formatDate(ch[field])} (il y a ${Math.abs(daysUntil)} jours)`,
            date: new Date().toISOString(),
            source: 'chauffeurs',
            sourceId: ch.id,
            chauffeurId: ch.id,
            action: 'Voir la fiche chauffeur',
            actionRoute: `#/chauffeurs/${ch.id}`,
            icon: 'solar:user-id-bold-duotone'
          });
        } else if (daysUntil <= 30) {
          alerts.push({
            id: Utils.generateId('ALR'),
            type: 'document',
            categorie: 'documents',
            niveau: 'urgent',
            titre: `${labelCourt} expire bientôt — ${nom}`,
            description: `Le ${label.toLowerCase()} de ${nom} expire le ${Utils.formatDate(ch[field])} (dans ${daysUntil} jours)`,
            date: new Date().toISOString(),
            source: 'chauffeurs',
            sourceId: ch.id,
            chauffeurId: ch.id,
            action: 'Planifier le renouvellement',
            actionRoute: `#/chauffeurs/${ch.id}`,
            icon: 'solar:user-id-bold-duotone'
          });
        }
      });
    });

    // 2. Véhicules
    const vehicules = Store.get('vehicules') || [];
    vehicules.forEach(v => {
      const label = `${v.marque} ${v.modele} (${v.immatriculation})`;

      // Révision imminente
      if (v.prochainRevisionKm && v.kilometrage) {
        const kmRestant = v.prochainRevisionKm - v.kilometrage;
        if (kmRestant <= 0) {
          alerts.push({
            id: `REV-${v.id}`,
            categorie: 'vehicules',
            niveau: 'critique',
            titre: 'Révision dépassée',
            description: `${label} — Révision prévue à ${Utils.formatNumber(v.prochainRevisionKm)} km, kilométrage actuel : ${Utils.formatNumber(v.kilometrage)} km (dépassé de ${Utils.formatNumber(Math.abs(kmRestant))} km)`,
            vehiculeId: v.id,
            action: 'Planifier la révision',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:tuning-2-bold-duotone',
            date: todayStr
          });
        } else if (kmRestant <= 2000) {
          alerts.push({
            id: `REV-${v.id}`,
            categorie: 'vehicules',
            niveau: 'urgent',
            titre: 'Révision imminente',
            description: `${label} — Révision dans ${Utils.formatNumber(kmRestant)} km (à ${Utils.formatNumber(v.prochainRevisionKm)} km)`,
            vehiculeId: v.id,
            action: 'Planifier la révision',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:tuning-2-bold-duotone',
            date: todayStr
          });
        } else if (kmRestant <= 5000) {
          alerts.push({
            id: `REV-${v.id}`,
            categorie: 'vehicules',
            niveau: 'attention',
            titre: 'Révision à prévoir',
            description: `${label} — Révision dans ${Utils.formatNumber(kmRestant)} km`,
            vehiculeId: v.id,
            action: 'Voir la fiche véhicule',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:tuning-2-bold-duotone',
            date: todayStr
          });
        }
      }

      // Batterie faible (véhicules électriques)
      if (v.typeEnergie === 'electrique' && v.niveauBatterie != null) {
        if (v.niveauBatterie <= 15) {
          alerts.push({
            id: `BATT-${v.id}`,
            categorie: 'vehicules',
            niveau: 'critique',
            titre: 'Batterie critique',
            description: `${label} — Niveau batterie : ${v.niveauBatterie}%. Recharge urgente nécessaire ! Autonomie restante : ~${Math.round(v.niveauBatterie / 100 * (v.autonomieKm || 0))} km`,
            vehiculeId: v.id,
            action: 'Planifier une recharge',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:battery-charge-minimalistic-bold-duotone',
            date: todayStr
          });
        } else if (v.niveauBatterie <= 30) {
          alerts.push({
            id: `BATT-${v.id}`,
            categorie: 'vehicules',
            niveau: 'urgent',
            titre: 'Batterie faible',
            description: `${label} — Niveau batterie : ${v.niveauBatterie}%. Recharge recommandée. Autonomie restante : ~${Math.round(v.niveauBatterie / 100 * (v.autonomieKm || 0))} km`,
            vehiculeId: v.id,
            action: 'Voir le véhicule',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:battery-low-bold-duotone',
            date: todayStr
          });
        }
      }

      // Maintenances planifiées
      (v.maintenancesPlanifiees || []).forEach(m => {
        if (m.statut === 'complete') return;
        const typeLabels = {
          vidange: 'Vidange', revision: 'Révision', pneus: 'Pneus', freins: 'Freins',
          filtres: 'Filtres', climatisation: 'Climatisation', courroie: 'Courroie',
          controle_technique: 'Contrôle technique', batterie: 'Batterie',
          amortisseurs: 'Amortisseurs', echappement: 'Échappement',
          carrosserie: 'Carrosserie', autre: 'Entretien'
        };
        const typeLabel = typeLabels[m.type] || m.label || m.type;

        let detail = '';
        let niveau = 'attention';

        if (m.statut === 'en_retard') {
          niveau = 'critique';
          if (m.prochainKm && v.kilometrage) {
            const kmDepasse = v.kilometrage - m.prochainKm;
            detail += `Dépassé de ${Utils.formatNumber(kmDepasse)} km`;
          }
          if (m.prochaineDate) {
            const jours = Math.ceil((new Date() - new Date(m.prochaineDate)) / 86400000);
            if (detail) detail += ' / ';
            detail += `${jours} jour(s) de retard`;
          }
        } else if (m.statut === 'urgent') {
          niveau = 'urgent';
          if (m.prochainKm && v.kilometrage) {
            const kmR = m.prochainKm - v.kilometrage;
            detail += `Dans ${Utils.formatNumber(kmR)} km`;
          }
          if (m.prochaineDate) {
            const jours = Math.ceil((new Date(m.prochaineDate) - new Date()) / 86400000);
            if (detail) detail += ' / ';
            detail += `dans ${jours} jour(s)`;
          }
        } else {
          return; // Pas d'alerte pour statut a_venir
        }

        alerts.push({
          id: `MPL-${v.id}-${m.id}`,
          categorie: 'vehicules',
          niveau,
          titre: `${typeLabel} ${m.statut === 'en_retard' ? 'en retard' : 'imminente'}`,
          description: `${label} — ${typeLabel}${m.label && m.label !== m.type ? ' (' + m.label + ')' : ''} : ${detail}${m.coutEstime ? '. Coût estimé : ' + Utils.formatCurrency(m.coutEstime) : ''}`,
          vehiculeId: v.id,
          action: 'Voir le véhicule',
          actionRoute: `#/vehicules/${v.id}`,
          icon: 'solar:calendar-mark-bold-duotone',
          date: m.prochaineDate || todayStr
        });
      });

      // Assurance véhicule
      if (v.dateExpirationAssurance) {
        const expDate = new Date(v.dateExpirationAssurance);
        const daysUntil = Math.ceil((expDate - now) / 86400000);
        if (daysUntil < 0) {
          alerts.push({
            id: `ASSV-${v.id}`,
            categorie: 'vehicules',
            niveau: 'critique',
            titre: 'Assurance expirée',
            description: `${label} — Assurance expirée depuis ${Math.abs(daysUntil)} jours. Véhicule non couvert !`,
            vehiculeId: v.id,
            action: 'Renouveler l\'assurance',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:shield-bold-duotone',
            date: v.dateExpirationAssurance
          });
        } else if (daysUntil <= 30) {
          alerts.push({
            id: `ASSV-${v.id}`,
            categorie: 'vehicules',
            niveau: 'urgent',
            titre: 'Assurance expire bientôt',
            description: `${label} — Assurance expire dans ${daysUntil} jours (${Utils.formatDate(v.dateExpirationAssurance)})`,
            vehiculeId: v.id,
            action: 'Contacter l\'assureur',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:shield-bold-duotone',
            date: v.dateExpirationAssurance
          });
        } else if (daysUntil <= 60) {
          alerts.push({
            id: `ASSV-${v.id}`,
            categorie: 'vehicules',
            niveau: 'attention',
            titre: 'Assurance à renouveler',
            description: `${label} — Assurance expire dans ${daysUntil} jours`,
            vehiculeId: v.id,
            action: 'Voir le véhicule',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:shield-bold-duotone',
            date: v.dateExpirationAssurance
          });
        }
      }

      // Contrôle technique véhicule
      if (v.dateExpirationControleTech) {
        const expDate = new Date(v.dateExpirationControleTech);
        const daysUntil = Math.ceil((expDate - now) / 86400000);
        if (daysUntil < 0) {
          alerts.push({
            id: Utils.generateId('ALR'),
            type: 'document',
            categorie: 'vehicules',
            niveau: 'critique',
            titre: `Contrôle technique expiré`,
            description: `${label} — Contrôle technique expiré depuis ${Math.abs(daysUntil)} jours (${Utils.formatDate(v.dateExpirationControleTech)})`,
            date: new Date().toISOString(),
            source: 'vehicules',
            sourceId: v.id,
            vehiculeId: v.id,
            action: 'Planifier le contrôle technique',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:shield-bold-duotone'
          });
        } else if (daysUntil <= 30) {
          alerts.push({
            id: Utils.generateId('ALR'),
            type: 'document',
            categorie: 'vehicules',
            niveau: 'urgent',
            titre: `Contrôle technique expire bientôt`,
            description: `${label} — Contrôle technique expire dans ${daysUntil} jours (${Utils.formatDate(v.dateExpirationControleTech)})`,
            date: new Date().toISOString(),
            source: 'vehicules',
            sourceId: v.id,
            vehiculeId: v.id,
            action: 'Planifier le contrôle technique',
            actionRoute: `#/vehicules/${v.id}`,
            icon: 'solar:shield-bold-duotone'
          });
        }
      }
    });

    // 3. Versements en retard
    const versements = Store.get('versements') || [];
    const retards = versements.filter(v => v.statut === 'retard');
    const partiels = versements.filter(v => v.statut === 'partiel');
    const enAttente = versements.filter(v => v.statut === 'en_attente');

    // Group late payments by driver
    const retardsByDriver = {};
    retards.forEach(v => {
      if (!retardsByDriver[v.chauffeurId]) retardsByDriver[v.chauffeurId] = [];
      retardsByDriver[v.chauffeurId].push(v);
    });

    Object.entries(retardsByDriver).forEach(([chId, vrs]) => {
      const ch = chauffeurs.find(c => c.id === chId);
      const nom = ch ? `${ch.prenom} ${ch.nom}` : chId;
      const totalDu = vrs.reduce((s, v) => s + v.commission - v.montantVerse, 0);
      alerts.push({
        id: `VRSRET-${chId}`,
        categorie: 'versements',
        niveau: vrs.length >= 3 ? 'critique' : 'urgent',
        titre: `${vrs.length} versement${vrs.length > 1 ? 's' : ''} en retard`,
        description: `${nom} — ${vrs.length} semaine${vrs.length > 1 ? 's' : ''} impayée${vrs.length > 1 ? 's' : ''}, total dû : ${Utils.formatCurrency(totalDu)}`,
        chauffeurId: chId,
        action: 'Voir les versements',
        actionRoute: '#/versements',
        icon: 'solar:transfer-horizontal-bold-duotone',
        date: vrs[vrs.length - 1].date
      });
    });

    // Partial payments
    const partielsByDriver = {};
    partiels.forEach(v => {
      if (!partielsByDriver[v.chauffeurId]) partielsByDriver[v.chauffeurId] = [];
      partielsByDriver[v.chauffeurId].push(v);
    });

    Object.entries(partielsByDriver).forEach(([chId, vrs]) => {
      const ch = chauffeurs.find(c => c.id === chId);
      const nom = ch ? `${ch.prenom} ${ch.nom}` : chId;
      const solde = vrs.reduce((s, v) => s + v.commission - v.montantVerse, 0);
      alerts.push({
        id: `VRSPAR-${chId}`,
        categorie: 'versements',
        niveau: 'attention',
        titre: `Versements partiels`,
        description: `${nom} — ${vrs.length} versement${vrs.length > 1 ? 's' : ''} partiel${vrs.length > 1 ? 's' : ''}, solde restant : ${Utils.formatCurrency(solde)}`,
        chauffeurId: chId,
        action: 'Voir les versements',
        actionRoute: '#/versements',
        icon: 'solar:transfer-horizontal-bold-duotone',
        date: vrs[vrs.length - 1].date
      });
    });

    // Pending payments
    if (enAttente.length > 0) {
      alerts.push({
        id: 'VRSATT',
        categorie: 'versements',
        niveau: 'attention',
        titre: `${enAttente.length} versement${enAttente.length > 1 ? 's' : ''} en attente de validation`,
        description: `${enAttente.length} versement${enAttente.length > 1 ? 's' : ''} à valider pour un total de ${Utils.formatCurrency(enAttente.reduce((s, v) => s + v.commission, 0))}`,
        action: 'Valider les versements',
        actionRoute: '#/versements',
        icon: 'solar:clock-circle-bold-duotone',
        date: todayStr
      });
    }

    // 4. Scores de conduite faibles
    const gps = Store.get('gps') || [];
    chauffeurs.filter(c => c.statut === 'actif').forEach(ch => {
      // Get latest GPS data
      const latestGps = gps.filter(g => g.chauffeurId === ch.id).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (latestGps && latestGps.scoreGlobal < 60) {
        alerts.push({
          id: `GPS-${ch.id}`,
          categorie: 'conduite',
          niveau: latestGps.scoreGlobal < 45 ? 'critique' : 'urgent',
          titre: 'Score de conduite faible',
          description: `${ch.prenom} ${ch.nom} — Score global : ${latestGps.scoreGlobal}/100. ${latestGps.analyseIA ? latestGps.analyseIA.resume : ''}`,
          chauffeurId: ch.id,
          action: 'Voir l\'analyse GPS',
          actionRoute: '#/gps-conduite',
          icon: 'solar:spedometer-max-bold-duotone',
          date: latestGps.date
        });
      } else if (latestGps && latestGps.scoreGlobal < 70) {
        alerts.push({
          id: `GPS-${ch.id}`,
          categorie: 'conduite',
          niveau: 'attention',
          titre: 'Score de conduite à surveiller',
          description: `${ch.prenom} ${ch.nom} — Score global : ${latestGps.scoreGlobal}/100`,
          chauffeurId: ch.id,
          action: 'Voir l\'analyse GPS',
          actionRoute: '#/gps-conduite',
          icon: 'solar:spedometer-max-bold-duotone',
          date: latestGps.date
        });
      }
    });

    // 5. Factures impayées
    const factures = Store.get('factures') || [];
    const facturesRetard = factures.filter(f => f.statut === 'en_retard');
    const facturesAttente = factures.filter(f => f.statut === 'en_attente');

    if (facturesRetard.length > 0) {
      const totalRetard = facturesRetard.reduce((s, f) => s + (f.montantTTC || f.montant || 0), 0);
      alerts.push({
        id: 'FACRET',
        categorie: 'finance',
        niveau: 'urgent',
        titre: `${facturesRetard.length} facture${facturesRetard.length > 1 ? 's' : ''} en retard de paiement`,
        description: `${facturesRetard.length} facture${facturesRetard.length > 1 ? 's' : ''} impayée${facturesRetard.length > 1 ? 's' : ''} pour un total de ${Utils.formatCurrency(totalRetard)}`,
        action: 'Voir les factures',
        actionRoute: '#/comptabilite',
        icon: 'solar:file-text-bold-duotone',
        date: todayStr
      });
    }

    if (facturesAttente.length > 0) {
      const totalAttente = facturesAttente.reduce((s, f) => s + (f.montantTTC || f.montant || 0), 0);
      alerts.push({
        id: 'FACATT',
        categorie: 'finance',
        niveau: 'attention',
        titre: `${facturesAttente.length} facture${facturesAttente.length > 1 ? 's' : ''} en attente`,
        description: `Montant total en attente : ${Utils.formatCurrency(totalAttente)}`,
        action: 'Voir les factures',
        actionRoute: '#/comptabilite',
        icon: 'solar:file-text-bold-duotone',
        date: todayStr
      });
    }

    // 6. Budgets dépassés
    const budgets = Store.get('budgets') || [];
    const comptaOps = Store.get('comptabilite') || [];
    const thisMonthOps = comptaOps.filter(o => {
      const d = new Date(o.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && o.type === 'depense';
    });

    budgets.filter(b => b.type === 'depense').forEach(b => {
      const spent = thisMonthOps.filter(o => o.categorie === b.categorie).reduce((s, o) => s + o.montant, 0);
      const monthlyBudget = (b.montantPrevu || 0) / 12;
      if (monthlyBudget > 0 && spent > monthlyBudget) {
        const depassement = spent - monthlyBudget;
        const pct = Math.round(spent / monthlyBudget * 100);
        const catLabels = { carburant: 'Carburant', recharge_electrique: 'Recharge EV', maintenance: 'Maintenance', assurance: 'Assurance', leasing: 'Leasing', salaires: 'Salaires', loyer_bureau: 'Loyer', telecoms: 'Télécom', fournitures: 'Fournitures', marketing: 'Marketing', taxes_impots: 'Taxes/Impôts' };
        alerts.push({
          id: `BDG-${b.categorie}`,
          categorie: 'finance',
          niveau: pct > 150 ? 'critique' : 'urgent',
          titre: `Budget dépassé : ${catLabels[b.categorie] || b.categorie}`,
          description: `Dépensé ${Utils.formatCurrency(spent)} sur ${Utils.formatCurrency(monthlyBudget)} prévu (${pct}%). Dépassement : ${Utils.formatCurrency(depassement)}`,
          action: 'Voir le budget',
          actionRoute: '#/comptabilite',
          icon: 'solar:target-bold-duotone',
          date: todayStr
        });
      }
    });

    // Sort: critique first, then urgent, then attention
    const niveauOrder = { critique: 0, urgent: 1, attention: 2 };
    alerts.sort((a, b) => (niveauOrder[a.niveau] || 3) - (niveauOrder[b.niveau] || 3));

    const ignored = this._getIgnoredIds();
    return alerts.filter(a => !ignored.has(a.id));
  },

  // =================== ALERTES YANGO (async) ===================

  async _checkYangoObjectifs() {
    const chauffeurs = (Store.get('chauffeurs') || []).filter(c =>
      c.statut === 'actif' && c.yangoDriverId && c.objectifCA > 0
    );
    if (chauffeurs.length === 0) return;

    // Jours déjà justifiés : une justification crée un versement marqué reference « OBJ-… ».
    const justifiedSet = new Set(
      (Store.get('versements') || [])
        .filter(v => v.reference && String(v.reference).startsWith('OBJ'))
        .map(v => `${v.chauffeurId}|${v.date}`)
    );

    const ignoredSet = this._getIgnoredIds();

    // Check yesterday (completed day)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const dateLabel = yesterday.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    const yangoAlerts = [];
    const results = await Promise.allSettled(
      chauffeurs.map(c => Store.getYangoDriverStats(c.yangoDriverId, yesterdayStr))
    );

    results.forEach((result, i) => {
      const c = chauffeurs[i];
      if (result.status !== 'fulfilled' || !result.value || result.value.error) return;

      const stats = result.value;
      const objectif = c.objectifCA;
      const ca = stats.totalCA || 0;
      const pct = Math.round((ca / objectif) * 100);

      if (ca < objectif) {
        if (justifiedSet.has(`${c.id}|${yesterdayStr}`)) return; // déjà justifié
        if (ignoredSet.has(`YOBJ-${c.id}`)) return; // ignorée
        const nom = `${c.prenom} ${c.nom}`;
        const niveau = pct < 50 ? 'critique' : pct < 80 ? 'urgent' : 'attention';
        yangoAlerts.push({
          id: `YOBJ-${c.id}`,
          categorie: 'yango',
          niveau,
          titre: `Objectif CA non atteint (${pct}%)`,
          description: `${nom} — CA Yango du ${dateLabel} : ${Utils.formatCurrency(ca)} sur ${Utils.formatCurrency(objectif)} (${stats.nbCourses} courses). Manque ${Utils.formatCurrency(objectif - ca)}.`,
          chauffeurId: c.id,
          action: 'Justifier',
          inlineType: 'objectif',
          ca, objectif, manque: objectif - ca, pct,
          actionRoute: `#/chauffeurs/${c.id}`,
          icon: 'solar:target-bold-duotone',
          date: yesterdayStr
        });
      }
    });

    if (yangoAlerts.length > 0) {
      // Merge with existing alerts and re-render
      const niveauOrder = { critique: 0, urgent: 1, attention: 2 };
      const byId = new Map(this._allAlerts.map(a => [a.id, a]));
      yangoAlerts.forEach(a => byId.set(a.id, a));
      this._allAlerts = [...byId.values()];
      this._allAlerts.sort((a, b) => (niveauOrder[a.niveau] || 3) - (niveauOrder[b.niveau] || 3));
      this._persistSeverity(this._allAlerts);

      this._charts.forEach(c => c.destroy());
      this._charts = [];
      this._renderKPIs(this._allAlerts);
      this._renderAlertsList(this._allAlerts);
      this._renderCharts(this._allAlerts);
    }
  },

  // =================== RENDERING ===================

  _renderKPIs(alerts) {
    const critiques = alerts.filter(a => a.niveau === 'critique').length;
    const urgentes = alerts.filter(a => a.niveau === 'urgent').length;
    const attention = alerts.filter(a => a.niveau === 'attention').length;

    document.getElementById('alerts-kpis').innerHTML = `
      <div class="kpi-card red" onclick="AlertesPage._filterBy('critique')" style="cursor:pointer;">
        <div class="kpi-icon"><iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon></div>
        <div class="kpi-value" style="color:var(--danger);">${critiques}</div>
        <div class="kpi-label">Alertes critiques</div>
        <div class="kpi-trend down"><iconify-icon icon="solar:fire-bold-duotone"></iconify-icon> Action immédiate requise</div>
      </div>
      <div class="kpi-card yellow" onclick="AlertesPage._filterBy('urgent')" style="cursor:pointer;">
        <div class="kpi-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
        <div class="kpi-value" style="color:var(--warning);">${urgentes}</div>
        <div class="kpi-label">Alertes urgentes</div>
        <div class="kpi-trend down"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> À traiter cette semaine</div>
      </div>
      <div class="kpi-card cyan" onclick="AlertesPage._filterBy('attention')" style="cursor:pointer;">
        <div class="kpi-icon"><iconify-icon icon="solar:info-circle-bold-duotone"></iconify-icon></div>
        <div class="kpi-value">${attention}</div>
        <div class="kpi-label">Points d'attention</div>
        <div class="kpi-trend"><iconify-icon icon="solar:eye-bold"></iconify-icon> À surveiller</div>
      </div>
      <div class="kpi-card ${alerts.length === 0 ? 'green' : ''}" onclick="AlertesPage._filterBy('all')" style="cursor:pointer;">
        <div class="kpi-icon"><iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon></div>
        <div class="kpi-value">${alerts.length}</div>
        <div class="kpi-label">Total alertes</div>
        ${alerts.length === 0 ? '<div class="kpi-trend up"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tout est en ordre !</div>' : ''}
      </div>
    `;
  },

  // ----- Alertes ignorées (uniquement les non sévères / niveau « attention ») -----
  // Stockées en local (pas de colonne DB), filtrées de la liste, des KPI et de la sévérité.
  _getIgnoredIds() {
    try { return new Set(JSON.parse(localStorage.getItem('pilote_ignored_alerts') || '[]')); }
    catch (e) { return new Set(); }
  },
  _ignoreAlert(id) {
    const s = this._getIgnoredIds(); s.add(id);
    try { localStorage.setItem('pilote_ignored_alerts', JSON.stringify([...s])); } catch (e) {}
    this._allAlerts = (this._allAlerts || []).filter(a => a.id !== id);
    this._persistSeverity(this._allAlerts);
    this._renderKPIs(this._allAlerts);
    this._renderAlertsList(this._allAlerts);
    this._renderIgnoredBanner();
    Toast.success('Alerte ignorée');
  },
  _restoreIgnored() {
    try { localStorage.removeItem('pilote_ignored_alerts'); } catch (e) {}
    this._loadAlerts();
    Toast.success('Alertes ignorées réaffichées');
  },
  _renderIgnoredBanner() {
    const el = document.getElementById('ignored-banner');
    if (!el) return;
    el.replaceChildren();
    const n = this._getIgnoredIds().size;
    if (n > 0) el.insertAdjacentHTML('beforeend', `<div class="card" style="padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:var(--font-size-sm);"><span style="color:var(--text-muted);"><iconify-icon icon="solar:eye-closed-bold"></iconify-icon> ${n} alerte${n > 1 ? 's' : ''} ignorée${n > 1 ? 's' : ''}</span><button type="button" class="btn btn-sm btn-secondary" onclick="AlertesPage._restoreIgnored()">Réafficher</button></div>`);
  },

  // Met en cache le niveau d'alerte le plus élevé pour colorer le bouton « Alertes » de la barre latérale.
  _persistSeverity(alerts) {
    let sev = '';
    if (alerts.some(a => a.niveau === 'critique')) sev = 'critique';
    else if (alerts.some(a => a.niveau === 'urgent')) sev = 'urgent';
    else if (alerts.some(a => a.niveau === 'attention')) sev = 'attention';
    try { localStorage.setItem('pilote_alert_severity', sev); } catch (e) {}
    if (typeof Sidebar !== 'undefined' && Sidebar.applyAlertSeverity) Sidebar.applyAlertSeverity();
  },

  _filterBy(level) {
    this._currentFilter = level;
    document.querySelectorAll('.alert-filter').forEach(b => {
      const on = b.dataset.filter === level;
      b.classList.toggle('btn-primary', on);
      b.classList.toggle('btn-secondary', !on);
      b.classList.toggle('active', on);
    });
    this._renderAlertsList(this._allAlerts || this._generateAllAlerts());
    const list = document.getElementById('alerts-list');
    if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _renderAlertsList(alerts) {
    const container = document.getElementById('alerts-list');
    let filtered = alerts;

    if (this._currentFilter !== 'all') {
      if (['critique', 'urgent', 'attention'].includes(this._currentFilter)) {
        filtered = alerts.filter(a => a.niveau === this._currentFilter);
      } else {
        filtered = alerts.filter(a => a.categorie === this._currentFilter);
      }
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:var(--space-2xl);">
          <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:48px;color:var(--success);margin-bottom:var(--space-md);"></iconify-icon>
          <h3 style="margin-bottom:var(--space-sm);">Aucune alerte ${this._currentFilter !== 'all' ? 'dans cette catégorie' : ''}</h3>
          <p style="color:var(--text-muted);">${this._currentFilter === 'all' ? 'Tout est en ordre ! Continuez ainsi.' : 'Pas d\'alerte pour ce filtre.'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(alert => {
      const niveauConfig = {
        critique: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', icon: 'solar:danger-circle-bold-duotone', label: 'CRITIQUE' },
        urgent: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', icon: 'solar:danger-triangle-bold-duotone', label: 'URGENT' },
        attention: { color: '#22d3ee', bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.3)', icon: 'solar:info-circle-bold-duotone', label: 'ATTENTION' }
      };
      const cfg = niveauConfig[alert.niveau] || niveauConfig.attention;

      const catConfig = {
        documents: { icon: 'solar:user-id-bold-duotone', label: 'Documents' },
        vehicules: { icon: 'solar:wheel-bold-duotone', label: 'Véhicules' },
        versements: { icon: 'solar:transfer-horizontal-bold-duotone', label: 'Versements' },
        conduite: { icon: 'solar:spedometer-max-bold-duotone', label: 'Conduite' },
        finance: { icon: 'solar:calculator-bold-duotone', label: 'Finance' },
        yango: { icon: 'solar:bus-bold-duotone', label: 'Yango' }
      };
      const catCfg = catConfig[alert.categorie] || { icon: 'solar:bell-bing-bold-duotone', label: alert.categorie };

      return `
        <div class="card" style="margin-bottom:var(--space-sm);padding:var(--space-md);border-left:4px solid ${cfg.color};background:${cfg.bg};border-color:${cfg.border};">
          <div style="display:flex;align-items:flex-start;gap:var(--space-md);">
            <!-- Icône niveau -->
            <div style="width:42px;height:42px;border-radius:var(--radius-sm);background:${cfg.color}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <iconify-icon icon="${alert.icon || cfg.icon}" style="color:${cfg.color};font-size:16px;"></iconify-icon>
            </div>

            <!-- Contenu -->
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:4px;flex-wrap:wrap;">
                <span style="font-size:9px;font-weight:700;color:${cfg.color};background:${cfg.color}22;padding:2px 8px;border-radius:10px;letter-spacing:0.5px;">${cfg.label}</span>
                <span style="font-size:9px;font-weight:600;color:var(--text-muted);background:var(--bg-tertiary);padding:2px 8px;border-radius:10px;"><iconify-icon icon="${catCfg.icon}" style="font-size:8px;margin-right:4px;"></iconify-icon>${catCfg.label}</span>
              </div>
              <div style="font-weight:600;font-size:var(--font-size-sm);margin-bottom:4px;">${alert.titre}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);line-height:1.5;">${alert.description}</div>
            </div>

            <!-- Actions -->
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
              ${alert.inlineType ? `
                <button type="button" class="btn btn-sm btn-secondary" style="white-space:nowrap;" onclick="AlertesPage._resolveInline('${alert.inlineType}','${alert.chauffeurId}')">
                  ${alert.action} <iconify-icon icon="solar:settings-bold" style="font-size:10px;margin-left:4px;"></iconify-icon>
                </button>
              ` : (alert.actionRoute ? `
                <a href="${alert.actionRoute}" class="btn btn-sm btn-secondary" style="white-space:nowrap;">
                  ${alert.action} <iconify-icon icon="solar:alt-arrow-right-bold" style="font-size:10px;margin-left:4px;"></iconify-icon>
                </a>
              ` : '')}
              ${alert.niveau === 'attention' ? `
                <button type="button" class="btn btn-sm btn-secondary" title="Ignorer cette alerte" onclick="AlertesPage._ignoreAlert('${alert.id}')" style="white-space:nowrap;"><iconify-icon icon="solar:eye-closed-bold"></iconify-icon></button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  _renderCharts(alerts) {
    // By category
    const catCounts = {};
    alerts.forEach(a => { catCounts[a.categorie] = (catCounts[a.categorie] || 0) + 1; });
    const catLabels = { documents: 'Documents', vehicules: 'Véhicules', versements: 'Versements', conduite: 'Conduite', finance: 'Finance', yango: 'Yango' };
    const catColors = { documents: '#3b82f6', vehicules: '#f59e0b', versements: '#ef4444', conduite: '#8b5cf6', finance: '#22c55e', yango: '#FC4C02' };
    const catEntries = Object.entries(catCounts);

    const ctx1 = document.getElementById('chart-alerts-category');
    if (ctx1 && catEntries.length > 0) {
      const totalAlerts = alerts.length;
      this._charts.push(new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: catEntries.map(([k]) => catLabels[k] || k),
          datasets: [{
            data: catEntries.map(([, v]) => v),
            backgroundColor: catEntries.map(([k]) => catColors[k] || '#64748b'),
            borderColor: Utils.chartBorderColor(), borderWidth: 2,
            hoverOffset: 12
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '55%',
          plugins: {
            legend: { position: 'right', labels: { font: { size: 11 }, padding: 8 } },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.parsed;
                  const pct = totalAlerts > 0 ? ((value / totalAlerts) * 100).toFixed(1) : 0;
                  return `${label} : ${value} alerte${value > 1 ? 's' : ''} (${pct}%)`;
                }
              }
            }
          },
        },
        plugins: [Utils.doughnutCenterPlugin(`${totalAlerts}`, 'alertes')]
      }));
    }

    // By level
    const critiques = alerts.filter(a => a.niveau === 'critique').length;
    const urgentes = alerts.filter(a => a.niveau === 'urgent').length;
    const attention = alerts.filter(a => a.niveau === 'attention').length;

    const ctx2 = document.getElementById('chart-alerts-level');
    if (ctx2) {
      this._charts.push(new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: ['Critiques', 'Urgentes', 'Attention'],
          datasets: [{
            data: [critiques, urgentes, attention],
            backgroundColor: ['#ef4444', '#f59e0b', '#22d3ee'],
            hoverBackgroundColor: ['#dc2626', '#d97706', '#06b6d4'],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.parsed.y;
                  return `${label} : ${value} alerte${value > 1 ? 's' : ''}`;
                }
              }
            }
          },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      }));
    }
  },

  _exportPDF() {
    const alerts = this._generateAllAlerts();
    const headers = ['Niveau', 'Catégorie', 'Titre', 'Description', 'Action'];
    const rows = alerts.map(a => [
      a.niveau.toUpperCase(),
      { documents: 'Documents', vehicules: 'Véhicules', versements: 'Versements', conduite: 'Conduite', finance: 'Finance' }[a.categorie] || a.categorie,
      a.titre,
      a.description.substring(0, 80) + (a.description.length > 80 ? '...' : ''),
      a.action || ''
    ]);

    Utils.exportPDF('Centre d\'Alertes', headers, rows, { subtitle: `${alerts.length} alertes au ${new Date().toLocaleDateString('fr-FR')}` });
    Toast.success('Alertes exportées en PDF');
  }
};
