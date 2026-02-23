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
 */
const AlertesPage = {
  _charts: [],
  _currentFilter: 'all',

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._loadAlerts();
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _template() {
    return `
      <div class="page-header">
        <h1><i class="fas fa-bell"></i> Centre d'Alertes</h1>
        <div class="page-actions">
          <button class="btn btn-sm btn-secondary" id="btn-refresh-alerts"><i class="fas fa-sync-alt"></i> Actualiser</button>
          <button class="btn btn-sm btn-secondary" id="btn-export-alerts"><i class="fas fa-file-pdf"></i> Exporter PDF</button>
        </div>
      </div>

      <!-- Bandeau notifications -->
      <div id="notif-stats-banner" style="margin-bottom:var(--space-lg);display:none;"></div>

      <!-- KPIs -->
      <div class="grid-4" id="alerts-kpis" style="margin-bottom:var(--space-lg);"></div>

      <!-- Filtres par catégorie -->
      <div class="card" style="margin-bottom:var(--space-lg);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;align-items:center;" id="alert-filters">
          <button class="btn btn-sm btn-primary alert-filter active" data-filter="all"><i class="fas fa-list"></i> Toutes</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="critique"><i class="fas fa-exclamation-circle"></i> Critiques</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="urgent"><i class="fas fa-exclamation-triangle"></i> Urgentes</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="attention"><i class="fas fa-info-circle"></i> Attention</button>
          <span style="flex:1;"></span>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="documents"><i class="fas fa-id-card"></i> Documents</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="vehicules"><i class="fas fa-car"></i> Véhicules</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="versements"><i class="fas fa-money-bill"></i> Versements</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="conduite"><i class="fas fa-tachometer-alt"></i> Conduite</button>
          <button class="btn btn-sm btn-secondary alert-filter" data-filter="finance"><i class="fas fa-calculator"></i> Finance</button>
        </div>
      </div>

      <!-- Liste des alertes -->
      <div id="alerts-list"></div>

      <!-- Charts -->
      <div class="charts-grid" style="margin-top:var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header"><div class="chart-title"><i class="fas fa-chart-pie"></i> Répartition par catégorie</div></div>
          <div class="chart-container" style="height:280px;"><canvas id="chart-alerts-category"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-header"><div class="chart-title"><i class="fas fa-chart-bar"></i> Répartition par niveau</div></div>
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
        this._renderAlertsList(this._generateAllAlerts());
      });
    });
  },

  _loadAlerts() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];

    const alerts = this._generateAllAlerts();
    this._renderKPIs(alerts);
    this._renderAlertsList(alerts);
    this._renderCharts(alerts);
    this._loadNotifStats();
  },

  async _loadNotifStats() {
    const banner = document.getElementById('notif-stats-banner');
    if (!banner) return;

    try {
      const token = Auth.getToken ? Auth.getToken() : localStorage.getItem('volt_token');
      const res = await fetch((Store._apiBase || '/api') + '/notifications/stats', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const stats = await res.json();

      const total = stats.mois?.total || 0;
      const sms = stats.mois?.sms || 0;
      const echecs = stats.mois?.echecs || 0;
      const aujourd_hui = stats.aujourd_hui || 0;

      if (total === 0 && aujourd_hui === 0) {
        banner.style.display = 'none';
        return;
      }

      banner.style.display = 'block';
      banner.innerHTML = `
        <div class="card" style="border-left:4px solid var(--primary);background:linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));">
          <div style="display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap;">
            <div style="width:40px;height:40px;border-radius:50%;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--primary);">
              <i class="fas fa-paper-plane"></i>
            </div>
            <div style="flex:1;min-width:200px;">
              <div style="font-weight:600;font-size:var(--font-size-sm);">Notifications ce mois</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:2px;">
                <strong>${total}</strong> envoyees &bull; <strong>${sms}</strong> SMS (~${stats.mois?.coutEstimeSMS || 0}$) &bull; <strong>${echecs}</strong> echec(s) &bull; <strong>${aujourd_hui}</strong> aujourd'hui
              </div>
            </div>
            <a href="#/parametres" class="btn btn-sm btn-secondary" onclick="setTimeout(()=>{const tabs=document.querySelectorAll('#settings-tabs .tab');tabs.forEach(t=>{if(t.dataset.tab==='notifications-settings'){t.click();}});},200);">
              <i class="fas fa-cog"></i> Configurer
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
            icon: 'fa-id-card',
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
            icon: 'fa-id-card',
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
            icon: 'fa-id-card',
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
          icon: 'fa-car',
          date: todayStr
        });
      }
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
            icon: 'fa-wrench',
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
            icon: 'fa-wrench',
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
            icon: 'fa-wrench',
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
            icon: 'fa-battery-empty',
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
            icon: 'fa-battery-quarter',
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
          icon: 'fa-calendar-check',
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
            icon: 'fa-shield-halved',
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
            icon: 'fa-shield-halved',
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
            icon: 'fa-shield-halved',
            date: v.dateExpirationAssurance
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
        icon: 'fa-money-bill-transfer',
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
        icon: 'fa-money-bill-transfer',
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
        icon: 'fa-clock',
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
          icon: 'fa-tachometer-alt',
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
          icon: 'fa-tachometer-alt',
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
        icon: 'fa-file-invoice',
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
        icon: 'fa-file-invoice',
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
          icon: 'fa-bullseye',
          date: todayStr
        });
      }
    });

    // Sort: critique first, then urgent, then attention
    const niveauOrder = { critique: 0, urgent: 1, attention: 2 };
    alerts.sort((a, b) => (niveauOrder[a.niveau] || 3) - (niveauOrder[b.niveau] || 3));

    return alerts;
  },

  // =================== RENDERING ===================

  _renderKPIs(alerts) {
    const critiques = alerts.filter(a => a.niveau === 'critique').length;
    const urgentes = alerts.filter(a => a.niveau === 'urgent').length;
    const attention = alerts.filter(a => a.niveau === 'attention').length;

    document.getElementById('alerts-kpis').innerHTML = `
      <div class="kpi-card red">
        <div class="kpi-icon"><i class="fas fa-exclamation-circle"></i></div>
        <div class="kpi-value" style="color:var(--danger);">${critiques}</div>
        <div class="kpi-label">Alertes critiques</div>
        <div class="kpi-trend down"><i class="fas fa-fire"></i> Action immédiate requise</div>
      </div>
      <div class="kpi-card yellow">
        <div class="kpi-icon"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="kpi-value" style="color:var(--warning);">${urgentes}</div>
        <div class="kpi-label">Alertes urgentes</div>
        <div class="kpi-trend down"><i class="fas fa-clock"></i> À traiter cette semaine</div>
      </div>
      <div class="kpi-card cyan">
        <div class="kpi-icon"><i class="fas fa-info-circle"></i></div>
        <div class="kpi-value">${attention}</div>
        <div class="kpi-label">Points d'attention</div>
        <div class="kpi-trend"><i class="fas fa-eye"></i> À surveiller</div>
      </div>
      <div class="kpi-card ${alerts.length === 0 ? 'green' : ''}">
        <div class="kpi-icon"><i class="fas fa-bell"></i></div>
        <div class="kpi-value">${alerts.length}</div>
        <div class="kpi-label">Total alertes</div>
        ${alerts.length === 0 ? '<div class="kpi-trend up"><i class="fas fa-check"></i> Tout est en ordre !</div>' : ''}
      </div>
    `;
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
          <i class="fas fa-check-circle" style="font-size:48px;color:var(--success);margin-bottom:var(--space-md);"></i>
          <h3 style="margin-bottom:var(--space-sm);">Aucune alerte ${this._currentFilter !== 'all' ? 'dans cette catégorie' : ''}</h3>
          <p style="color:var(--text-muted);">${this._currentFilter === 'all' ? 'Tout est en ordre ! Continuez ainsi.' : 'Pas d\'alerte pour ce filtre.'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(alert => {
      const niveauConfig = {
        critique: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', icon: 'fa-exclamation-circle', label: 'CRITIQUE' },
        urgent: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', icon: 'fa-exclamation-triangle', label: 'URGENT' },
        attention: { color: '#22d3ee', bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.3)', icon: 'fa-info-circle', label: 'ATTENTION' }
      };
      const cfg = niveauConfig[alert.niveau] || niveauConfig.attention;

      const catConfig = {
        documents: { icon: 'fa-id-card', label: 'Documents' },
        vehicules: { icon: 'fa-car', label: 'Véhicules' },
        versements: { icon: 'fa-money-bill-transfer', label: 'Versements' },
        conduite: { icon: 'fa-tachometer-alt', label: 'Conduite' },
        finance: { icon: 'fa-calculator', label: 'Finance' }
      };
      const catCfg = catConfig[alert.categorie] || { icon: 'fa-bell', label: alert.categorie };

      return `
        <div class="card" style="margin-bottom:var(--space-sm);padding:var(--space-md);border-left:4px solid ${cfg.color};background:${cfg.bg};border-color:${cfg.border};">
          <div style="display:flex;align-items:flex-start;gap:var(--space-md);">
            <!-- Icône niveau -->
            <div style="width:42px;height:42px;border-radius:var(--radius-sm);background:${cfg.color}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fas ${alert.icon || cfg.icon}" style="color:${cfg.color};font-size:16px;"></i>
            </div>

            <!-- Contenu -->
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:4px;flex-wrap:wrap;">
                <span style="font-size:9px;font-weight:700;color:${cfg.color};background:${cfg.color}22;padding:2px 8px;border-radius:10px;letter-spacing:0.5px;">${cfg.label}</span>
                <span style="font-size:9px;font-weight:600;color:var(--text-muted);background:var(--bg-tertiary);padding:2px 8px;border-radius:10px;"><i class="fas ${catCfg.icon}" style="font-size:8px;margin-right:4px;"></i>${catCfg.label}</span>
              </div>
              <div style="font-weight:600;font-size:var(--font-size-sm);margin-bottom:4px;">${alert.titre}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);line-height:1.5;">${alert.description}</div>
            </div>

            <!-- Action -->
            ${alert.actionRoute ? `
              <a href="${alert.actionRoute}" class="btn btn-sm btn-secondary" style="flex-shrink:0;white-space:nowrap;">
                ${alert.action} <i class="fas fa-arrow-right" style="font-size:10px;margin-left:4px;"></i>
              </a>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  _renderCharts(alerts) {
    // By category
    const catCounts = {};
    alerts.forEach(a => { catCounts[a.categorie] = (catCounts[a.categorie] || 0) + 1; });
    const catLabels = { documents: 'Documents', vehicules: 'Véhicules', versements: 'Versements', conduite: 'Conduite', finance: 'Finance' };
    const catColors = { documents: '#3b82f6', vehicules: '#f59e0b', versements: '#ef4444', conduite: '#8b5cf6', finance: '#22c55e' };
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
            borderColor: '#111827', borderWidth: 2,
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
