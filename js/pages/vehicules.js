/**
 * VehiculesPage - Vehicle management with CRUD and detail
 * Shows only internal internal vehicles (no Yango data)
 */
const VehiculesPage = {
  _charts: [],
  _carburantChart: null,
  _activeListTab: 'flotte',

  render() {
    const container = document.getElementById('page-content');
    const vehicules = Store.get('vehicules');
    container.innerHTML = this._listTemplate(vehicules);
    this._bindListEvents(vehicules);
    this._bindListTabEvents();
  },

  renderDetail(id) {
    const container = document.getElementById('page-content');
    const vehicule = Store.findById('vehicules', id);
    if (!vehicule) {
      container.innerHTML = '<div class="empty-state"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon><h3>Véhicule non trouvé</h3></div>';
      return;
    }
    container.innerHTML = this._detailTemplate(vehicule);
    this._loadDetailCharts(vehicule);
    this._bindDetailEvents(vehicule);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
    if (this._carburantChart) {
      this._carburantChart.destroy();
      this._carburantChart = null;
    }
    if (this._yangoRefreshInterval) {
      clearInterval(this._yangoRefreshInterval);
      this._yangoRefreshInterval = null;
    }
    // Cleanup garage charts
    if (typeof GaragePage !== 'undefined') GaragePage.destroy();
  },

  _bindListTabEvents() {
    document.querySelectorAll('.garage-tab[data-ltab]').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeListTab = tab.dataset.ltab;
        document.querySelectorAll('.garage-tab[data-ltab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderListTab(this._activeListTab);
      });
    });
  },

  _renderListTab(tab) {
    const content = document.getElementById('vehicules-list-tab-content');
    const actions = document.getElementById('vehicules-page-actions');
    if (!content) return;

    // Cleanup garage charts before switching
    if (typeof GaragePage !== 'undefined') GaragePage.destroy();

    if (tab === 'flotte') {
      // Re-render full list view
      this.render();
      return;
    }

    // Delegate to GaragePage for garage tabs
    if (typeof GaragePage !== 'undefined') {
      // Update actions for garage
      if (actions) {
        actions.innerHTML = `
          <button class="btn btn-sm btn-outline" onclick="GaragePage._updateKmModal()" title="Mettre a jour le kilometrage">
            <iconify-icon icon="solar:route-bold-duotone"></iconify-icon> Maj km
          </button>
        `;
      }
      GaragePage._activeTab = tab;
      content.innerHTML = '<div id="garage-tab-content"></div>';
      GaragePage._renderTab(tab);
      // GaragePage renders into #garage-tab-content
    }
  },

  _listTemplate(vehicules) {
    const stats = {
      total: vehicules.length,
      enService: vehicules.filter(v => v.statut === 'en_service').length,
      enMaintenance: vehicules.filter(v => v.statut === 'en_maintenance').length,
      electriques: vehicules.filter(v => v.typeEnergie === 'electrique').length,
      thermiques: vehicules.filter(v => v.typeEnergie !== 'electrique').length
    };

    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon> Véhicules & Garage</h1>
        <div class="page-actions" id="vehicules-page-actions">
          <button class="btn btn-primary" id="btn-add-vehicule"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Ajouter</button>
        </div>
      </div>

      <!-- Onglets Flotte / Garage -->
      <div class="garage-tabs" style="display:flex;gap:0;margin-bottom:var(--space-lg);border-bottom:2px solid var(--border-color);overflow-x:auto;">
        <button class="garage-tab ${this._activeListTab === 'flotte' ? 'active' : ''}" data-ltab="flotte">
          <iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon> Flotte
        </button>
        <button class="garage-tab ${this._activeListTab === 'maintenance' ? 'active' : ''}" data-ltab="maintenance">
          <iconify-icon icon="solar:tuning-2-bold-duotone"></iconify-icon> Maintenance
        </button>
        <button class="garage-tab ${this._activeListTab === 'reparations' ? 'active' : ''}" data-ltab="reparations">
          <iconify-icon icon="solar:wrench-bold-duotone"></iconify-icon> Réparations
        </button>
        <button class="garage-tab ${this._activeListTab === 'ct' ? 'active' : ''}" data-ltab="ct">
          <iconify-icon icon="solar:clipboard-check-bold-duotone"></iconify-icon> CT
        </button>
        <button class="garage-tab ${this._activeListTab === 'assurances' ? 'active' : ''}" data-ltab="assurances">
          <iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon> Assurances
        </button>
        <button class="garage-tab ${this._activeListTab === 'tco' ? 'active' : ''}" data-ltab="tco">
          <iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> TCO
        </button>
      </div>

      <div id="vehicules-list-tab-content">
        <div class="grid-4" style="margin-bottom:var(--space-lg);">
          <div class="kpi-card"><div class="kpi-icon"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon></div><div class="kpi-value">${stats.total}</div><div class="kpi-label">Total flotte</div></div>
          <div class="kpi-card green"><div class="kpi-icon"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${stats.enService}</div><div class="kpi-label">En service</div></div>
          <div class="kpi-card yellow"><div class="kpi-icon"><iconify-icon icon="solar:wrench-bold-duotone"></iconify-icon></div><div class="kpi-value">${stats.enMaintenance}</div><div class="kpi-label">En maintenance</div></div>
          <div class="kpi-card cyan">
            <div class="kpi-icon"><iconify-icon icon="solar:bolt-bold-duotone"></iconify-icon></div>
            <div class="kpi-value">
              <span style="color:var(--pilote-yellow)">${stats.electriques} <iconify-icon icon="solar:bolt-bold-duotone" style="font-size:16px"></iconify-icon></span>
              <span style="color:var(--text-muted);font-size:14px;margin:0 4px;">/</span>
              <span>${stats.thermiques} <iconify-icon icon="solar:gas-station-bold-duotone" style="font-size:14px"></iconify-icon></span>
            </div>
            <div class="kpi-label">Électrique / Thermique</div>
          </div>
        </div>

        <div id="vehicules-table"></div>
      </div>
    `;
  },

  _bindListEvents(vehicules) {
    const chauffeurs = Store.get('chauffeurs');

    Table.create({
      containerId: 'vehicules-table',
      columns: [
        {
          label: 'Véhicule', key: 'marque', primary: true,
          render: (v) => {
            const isEV = v.typeEnergie === 'electrique';
            const energyIcon = isEV
              ? '<iconify-icon icon="solar:bolt-bold-duotone" style="color:var(--pilote-yellow);font-size:10px;margin-left:4px" title="Électrique"></iconify-icon>'
              : '<iconify-icon icon="solar:gas-station-bold-duotone" style="color:var(--text-muted);font-size:9px;margin-left:4px" title="Thermique"></iconify-icon>';
            return `<div><div style="font-weight:500">${v.marque} ${v.modele} ${energyIcon}</div><div style="font-size:11px;color:var(--text-muted)">${v.immatriculation} &bull; ${v.annee}</div></div>`;
          },
          value: (v) => `${v.marque} ${v.modele}`
        },
        {
          label: 'Énergie', key: 'typeEnergie',
          render: (v) => v.typeEnergie === 'electrique'
            ? '<span class="badge badge-warning"><iconify-icon icon="solar:bolt-bold-duotone" style="font-size:8px"></iconify-icon> Électrique</span>'
            : '<span class="badge badge-neutral"><iconify-icon icon="solar:gas-station-bold-duotone" style="font-size:8px"></iconify-icon> Thermique</span>'
        },
        {
          label: 'Acquisition', key: 'typeAcquisition',
          render: (v) => `<span class="badge ${v.typeAcquisition === 'leasing' ? 'badge-info' : 'badge-success'}">${v.typeAcquisition === 'leasing' ? 'Leasing' : 'Cash'}</span>`
        },
        {
          label: 'Kilométrage', key: 'kilometrage',
          render: (v) => {
            if (v.typeEnergie === 'electrique') {
              const autonomieRestante = Math.round((v.niveauBatterie || 0) / 100 * (v.autonomieKm || 0));
              return `${Utils.formatNumber(v.kilometrage)} km<br><span style="font-size:10px;color:var(--pilote-yellow)"><iconify-icon icon="solar:battery-full-bold-duotone"></iconify-icon> ${v.niveauBatterie}% &bull; ~${autonomieRestante} km</span>`;
            }
            return `${Utils.formatNumber(v.kilometrage)} km`;
          }
        },
        {
          label: 'Chauffeur', key: 'chauffeurAssigne',
          render: (v) => {
            if (!v.chauffeurAssigne) return '<span class="text-muted">-</span>';
            const c = chauffeurs.find(x => x.id === v.chauffeurAssigne);
            return c ? `${c.prenom} ${c.nom}` : '-';
          }
        },
        {
          label: 'Statut', key: 'statut',
          render: (v) => Utils.statusBadge(v.statut)
        }
      ],
      data: vehicules,
      pageSize: 10,
      onRowClick: (id) => Router.navigate(`/vehicules/${id}`),
      actions: (v) => `
        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); VehiculesPage._edit('${v.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); VehiculesPage._delete('${v.id}')" title="Supprimer"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
      `
    });

    document.getElementById('btn-add-vehicule').addEventListener('click', () => this._add());
  },

  _detailTemplate(v) {
    const chauffeur = v.chauffeurAssigne ? Store.findById('chauffeurs', v.chauffeurAssigne) : null;
    const courses = Store.query('courses', c => c.vehiculeId === v.id && c.statut === 'terminee');
    const totalCA = courses.reduce((s, c) => s + c.montantTTC, 0);
    const totalKm = courses.reduce((s, c) => s + c.distanceKm, 0);
    const totalMaintenance = (v.coutsMaintenance || []).reduce((s, m) => s + m.montant, 0);
    const isEV = v.typeEnergie === 'electrique';

    const kmRevision = v.prochainRevisionKm - v.kilometrage;
    const progressRevision = Math.max(0, Math.min(100, ((v.kilometrage - (v.prochainRevisionKm - 10000)) / 10000) * 100));

    // EV specific calculations
    const autonomieRestante = isEV ? Math.round((v.niveauBatterie || 0) / 100 * (v.autonomieKm || 0)) : 0;
    const coutKm = isEV
      ? ((v.consommation || 15) / 100) * (v.coutEnergie || 120) // FCFA/km electrique
      : ((v.consommation || 7) / 100) * (v.coutEnergie || 800); // FCFA/km thermique

    const energyBadge = isEV
      ? '<span class="badge badge-warning"><iconify-icon icon="solar:bolt-bold-duotone" style="font-size:8px"></iconify-icon> Électrique</span>'
      : '<span class="badge badge-neutral"><iconify-icon icon="solar:gas-station-bold-duotone" style="font-size:8px"></iconify-icon> Thermique</span>';

    const avatarBg = isEV ? 'var(--pilote-yellow)' : 'var(--pilote-blue)';
    const avatarIcon = isEV ? 'solar:bolt-circle-bold-duotone' : 'solar:wheel-bold-duotone';

    return `
      <div class="page-header">
        <h1>
          <a href="#/vehicules" style="color:var(--text-muted)"><iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon></a>
          Fiche véhicule
        </h1>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="VehiculesPage._edit('${v.id}')"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>
          <button class="btn btn-primary" onclick="VehiculesPage._addPlanifiedMaintenance('${v.id}')"><iconify-icon icon="solar:calendar-mark-bold-duotone"></iconify-icon> Planifier</button>
          <button class="btn btn-warning" onclick="VehiculesPage._addMaintenance('${v.id}')"><iconify-icon icon="solar:tuning-2-bold-duotone"></iconify-icon> Maintenance</button>
        </div>
      </div>

      <div class="detail-header">
        <div class="avatar avatar-xl" style="background:${avatarBg}"><iconify-icon icon="${avatarIcon}" style="font-size:28px"></iconify-icon></div>
        <div class="detail-info">
          <h2>${v.marque} ${v.modele} ${Utils.statusBadge(v.statut)} ${energyBadge}</h2>
          <p>${v.immatriculation} &bull; ${v.couleur} &bull; ${v.annee} &bull;
            <span class="badge ${v.typeAcquisition === 'leasing' ? 'badge-info' : 'badge-success'}">${v.typeAcquisition === 'leasing' ? 'Leasing' : 'Cash'}</span>
          </p>
          <div class="detail-stats">
            <div class="detail-stat">
              <div class="detail-stat-value">${Utils.formatNumber(v.kilometrage)}</div>
              <div class="detail-stat-label">km</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value">${Utils.formatCurrency(totalCA)}</div>
              <div class="detail-stat-label">CA généré</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value">${courses.length}</div>
              <div class="detail-stat-label">Courses</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value">${Utils.formatCurrency(totalMaintenance)}</div>
              <div class="detail-stat-label">Maintenance</div>
            </div>
            ${isEV ? `
            <div class="detail-stat">
              <div class="detail-stat-value" style="color:var(--pilote-yellow)">${v.niveauBatterie}%</div>
              <div class="detail-stat-label">Batterie</div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>

      ${isEV ? `
      <!-- Bloc spécifique Véhicule Électrique -->
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid var(--pilote-yellow);background:rgba(250,204,21,0.04);">
        <div class="card-header"><span class="card-title"><iconify-icon icon="solar:bolt-bold-duotone" style="color:var(--pilote-yellow)"></iconify-icon> Informations Véhicule Électrique</span></div>
        <div class="grid-4" style="gap:var(--space-md);">
          <div style="text-align:center;padding:var(--space-sm);">
            <div style="font-size:var(--font-size-2xl);font-weight:700;color:var(--pilote-yellow);">${v.niveauBatterie}%</div>
            <div class="progress-bar" style="margin:8px 0;">
              <div class="progress-fill ${v.niveauBatterie < 20 ? 'red' : v.niveauBatterie < 40 ? 'yellow' : ''}" style="width:${v.niveauBatterie}%;background:${v.niveauBatterie < 20 ? 'var(--danger)' : 'var(--pilote-yellow)'}"></div>
            </div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Niveau batterie (${v.capaciteBatterie} kWh)</div>
          </div>
          <div style="text-align:center;padding:var(--space-sm);">
            <div style="font-size:var(--font-size-2xl);font-weight:700;">${autonomieRestante} <span style="font-size:14px;">km</span></div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px;">Autonomie restante</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">sur ${v.autonomieKm} km WLTP</div>
          </div>
          <div style="text-align:center;padding:var(--space-sm);">
            <div style="font-size:var(--font-size-2xl);font-weight:700;">${v.tempsRechargeRapide} <span style="font-size:14px;">min</span></div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px;">Charge rapide (10-80%)</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${v.puissanceChargeMax} kW max &bull; ${v.typeChargeur}</div>
          </div>
          <div style="text-align:center;padding:var(--space-sm);">
            <div style="font-size:var(--font-size-2xl);font-weight:700;color:var(--success);">${Math.round(coutKm)} <span style="font-size:14px;">FCFA/km</span></div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px;">Coût énergie</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${v.consommation} kWh/100km &bull; ${v.coutEnergie} FCFA/kWh</div>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-lg);margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border-primary);font-size:var(--font-size-sm);">
          <div><span class="text-muted">Dernière recharge</span> <strong>${Utils.formatDate(v.dernierRecharge)}</strong></div>
          <div><span class="text-muted">Station habituelle</span> <strong>${v.stationRechargeHabituelle || '-'}</strong></div>
          <div><span class="text-muted">Charge normale</span> <strong>${Math.round((v.tempsRechargeNormale || 0) / 60)}h (7 kW)</strong></div>
        </div>
      </div>
      ` : ''}

      <div class="grid-3">
        <div class="card">
          <div class="card-header"><span class="card-title">Informations</span></div>
          <div style="display:flex;flex-direction:column;gap:10px;font-size:var(--font-size-sm);">
            <div><span class="text-muted">VIN</span><br><strong style="font-size:11px">${v.vin}</strong></div>
            <div><span class="text-muted">Chauffeur assigné</span><br><strong>${chauffeur ? `${chauffeur.prenom} ${chauffeur.nom}` : 'Aucun'}</strong></div>
            <div><span class="text-muted">Km mensuel moyen</span><br><strong>${Utils.formatNumber(v.kilometrageMensuel)} km/mois</strong></div>
            <div><span class="text-muted">Énergie</span><br><strong>${isEV ? `Électrique (${v.consommation} kWh/100km)` : `Thermique (${v.consommation} L/100km)`}</strong></div>
            <div><span class="text-muted">Coût énergie au km</span><br><strong>${Math.round(coutKm)} FCFA/km</strong></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Finances</span></div>
          <div style="display:flex;flex-direction:column;gap:10px;font-size:var(--font-size-sm);">
            <div><span class="text-muted">Prix d'achat</span><br><strong>${Utils.formatCurrency(v.prixAchat)}</strong></div>
            ${v.typeAcquisition === 'leasing' ? `
              <div><span class="text-muted">Mensualité leasing</span><br><strong>${Utils.formatCurrency(v.mensualiteLeasing)}/mois</strong></div>
              <div><span class="text-muted">Durée / Apport</span><br><strong>${v.dureeLeasing} mois / ${Utils.formatCurrency(v.apportInitial)}</strong></div>
            ` : `
              <div><span class="text-muted">Type</span><br><strong>Achat comptant</strong></div>
            `}
            <div><span class="text-muted">Assurance</span><br><strong>${v.assureur} - ${Utils.formatCurrency(v.primeAnnuelle)}/an</strong></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Prochaine révision</span></div>
          <div style="text-align:center;padding:var(--space-md) 0;">
            <div style="font-size:var(--font-size-2xl);font-weight:700;color:${kmRevision < 2000 ? 'var(--danger)' : kmRevision < 5000 ? 'var(--warning)' : 'var(--text-primary)'}">${Utils.formatNumber(kmRevision)} km</div>
            <div class="text-muted mb-md">restants avant révision</div>
            <div class="progress-bar">
              <div class="progress-fill ${kmRevision < 2000 ? 'red' : kmRevision < 5000 ? 'yellow' : ''}" style="width:${progressRevision}%"></div>
            </div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:8px;">
              Dernière : ${Utils.formatDate(v.dateDerniereRevision)} &bull; Prochaine à ${Utils.formatNumber(v.prochainRevisionKm)} km
            </div>
          </div>
        </div>
      </div>

      <!-- Liaison Yango -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:bus-bold-duotone" style="color:#FC4C02"></iconify-icon> Liaison Yango</span>
          ${v.yangoVehicleId
            ? '<span class="badge badge-success"><iconify-icon icon="solar:link-bold-duotone"></iconify-icon> Lié</span>'
            : '<span class="badge badge-warning"><iconify-icon icon="solar:link-broken-bold-duotone"></iconify-icon> Non lié</span>'}
        </div>
        ${v.yangoVehicleId ? `
          <div style="font-size:var(--font-size-sm);margin-bottom:8px;">
            <span class="text-muted">Yango Vehicle ID :</span> <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:11px;">${v.yangoVehicleId}</code>
            <button class="btn btn-sm btn-danger" style="margin-left:8px;" onclick="VehiculesPage._unlinkYangoVehicle('${v.id}')">
              <iconify-icon icon="solar:link-broken-bold-duotone"></iconify-icon> Délier
            </button>
          </div>
        ` : `
          <div style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:10px;">
            Ce véhicule n'est pas encore lié à un véhicule Yango. Cliquez ci-dessous pour rechercher et lier manuellement.
          </div>
          <button class="btn btn-primary btn-sm" onclick="VehiculesPage._searchYangoVehicle('${v.id}')">
            <iconify-icon icon="solar:magnifer-bold-duotone"></iconify-icon> Rechercher sur Yango
          </button>
          <div id="yango-vehicle-search-results" style="margin-top:10px;"></div>
        `}
      </div>

      <!-- CA Yango (only if assigned chauffeur is linked) -->
      ${(chauffeur && chauffeur.yangoDriverId) ? `
      <div class="card" id="yango-ca-card" style="margin-top:var(--space-lg);border-top:3px solid #FC4C02;">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:wallet-bold-duotone" style="color:#FC4C02"></iconify-icon> CA Yango — ${chauffeur.prenom} ${chauffeur.nom}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="date" id="yango-ca-date" class="form-control"
              style="width:auto;font-size:12px;padding:4px 8px;min-height:auto;"
              value="${new Date().toISOString().split('T')[0]}"
              max="${new Date().toISOString().split('T')[0]}">
            <span id="yango-ca-live" style="font-size:9px;padding:2px 8px;background:#FC4C02;color:#fff;border-radius:10px;font-weight:700;">EN DIRECT</span>
          </div>
        </div>
        <div id="yango-ca-content" class="card-body">
          <div style="text-align:center;padding:var(--space-md);color:var(--text-muted);font-size:var(--font-size-xs);">
            <iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement des données Yango...
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Charts -->
      <div class="charts-grid" style="margin-top:var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Répartition des coûts</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-vehicle-costs"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> CA mensuel généré</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-vehicle-revenue"></canvas>
          </div>
        </div>
      </div>

      <!-- Maintenances planifiées -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:calendar-mark-bold-duotone" style="color:var(--primary);margin-right:6px;"></iconify-icon> Maintenances planifiées</span>
          <button class="btn btn-sm btn-primary" onclick="VehiculesPage._addPlanifiedMaintenance('${v.id}')"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Planifier</button>
        </div>
        ${this._renderPlanifiedMaintenances(v)}
      </div>

      <!-- Carburant / Énergie -->
      ${this._renderCarburantSection(v)}

      <!-- Maintenance history -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title">Historique maintenance</span>
          <button class="btn btn-sm btn-primary" onclick="VehiculesPage._addMaintenance('${v.id}')"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Ajouter</button>
        </div>
        <div id="maintenance-table"></div>
      </div>
    `;
  },

  _loadDetailCharts(v) {
    this._charts = [];
    const courses = Store.query('courses', c => c.vehiculeId === v.id && c.statut === 'terminee');

    // Cost breakdown chart
    const isEVChart = v.typeEnergie === 'electrique';
    const maintenanceTotal = (v.coutsMaintenance || []).reduce((s, m) => s + m.montant, 0);
    const assuranceAnnuelle = v.primeAnnuelle;
    const acquisitionMensuel = v.typeAcquisition === 'leasing' ? v.mensualiteLeasing * 12 : v.prixAchat / 5;
    const energieEstimee = (v.kilometrageMensuel * 12 * (v.consommation || (isEVChart ? 15 : 6.5)) / 100) * (v.coutEnergie || (isEVChart ? 120 : 800));
    const energyLabel = isEVChart ? 'Recharge' : 'Carburant';

    const costsCtx = document.getElementById('chart-vehicle-costs');
    if (costsCtx) {
      const costsData = [Math.round(acquisitionMensuel), Math.round(assuranceAnnuelle), Math.round(maintenanceTotal), Math.round(energieEstimee)];
      const costsTotal = costsData.reduce((a, b) => a + b, 0);
      this._charts.push(new Chart(costsCtx, {
        type: 'doughnut',
        data: {
          labels: ['Acquisition', 'Assurance', 'Maintenance', energyLabel],
          datasets: [{
            data: costsData,
            backgroundColor: ['#3b82f6', '#facc15', '#ef4444', isEVChart ? '#22c55e' : '#22d3ee'],
            borderColor: '#111827',
            borderWidth: 2,
            hoverOffset: 12
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
          plugins: {
            legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = costsTotal > 0 ? ((ctx.raw / costsTotal) * 100).toFixed(1) : 0;
                  return `${ctx.label}: ${Utils.formatCurrency(ctx.raw)} (${pct}%)`;
                }
              }
            }
          }
        },
        plugins: [Utils.doughnutCenterPlugin(Utils.formatCurrency(costsTotal), 'Coût total annuel')]
      }));
    }

    // Monthly revenue chart
    const now = new Date();
    const monthlyRev = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const rev = courses
        .filter(c => {
          const d = new Date(c.dateHeure);
          return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
        })
        .reduce((s, c) => s + c.montantTTC, 0);
      monthlyRev.push({ month: Utils.getMonthShort(m.getMonth()), revenue: Math.round(rev) });
    }

    const revCtx = document.getElementById('chart-vehicle-revenue');
    if (revCtx) {
      this._charts.push(new Chart(revCtx, {
        type: 'bar',
        data: {
          labels: monthlyRev.map(m => m.month),
          datasets: [{
            label: 'CA',
            data: monthlyRev.map(m => m.revenue),
            backgroundColor: '#3b82f6',
            hoverBackgroundColor: '#60a5fa',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => `Mois : ${items[0].label}`,
                label: (ctx) => `CA généré : ${Utils.formatCurrency(ctx.raw)}`,
                afterLabel: (ctx) => {
                  const idx = ctx.dataIndex;
                  if (idx > 0) {
                    const prev = monthlyRev[idx - 1].revenue;
                    const curr = monthlyRev[idx].revenue;
                    const diff = curr - prev;
                    const sign = diff >= 0 ? '+' : '';
                    return `Variation : ${sign}${Utils.formatCurrency(diff)}`;
                  }
                  return '';
                }
              }
            }
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) } }
          }
        }
      }));
    }

    // Maintenance table
    Table.create({
      containerId: 'maintenance-table',
      columns: [
        { label: 'Date', key: 'date', render: (m) => Utils.formatDate(m.date) },
        { label: 'Type', key: 'type', render: (m) => `<span class="badge badge-info">${m.type}</span>` },
        { label: 'Description', key: 'description', primary: true },
        { label: 'Kilométrage', key: 'kilometrage', render: (m) => `${Utils.formatNumber(m.kilometrage)} km` },
        { label: 'Montant', key: 'montant', render: (m) => Utils.formatCurrency(m.montant), primary: true }
      ],
      data: (v.coutsMaintenance || []).sort((a, b) => b.date.localeCompare(a.date)),
      pageSize: 10
    });

    // Load carburant chart
    this._loadCarburantChart(v.id);
  },

  _bindDetailEvents(vehicule) {
    // CA Yango: resolve vehicle → chauffeur → yangoDriverId
    const chauffeur = vehicule.chauffeurAssigne ? Store.findById('chauffeurs', vehicule.chauffeurAssigne) : null;
    if (chauffeur && chauffeur.yangoDriverId) {
      // Load Yango CA on page load
      this._loadYangoCA(vehicule.id);

      // Wire date picker change
      const dateInput = document.getElementById('yango-ca-date');
      if (dateInput) {
        dateInput.addEventListener('change', () => this._loadYangoCA(vehicule.id));
      }

      // Auto-refresh every 2 min when viewing today
      this._yangoRefreshInterval = setInterval(() => {
        const input = document.getElementById('yango-ca-date');
        const today = new Date().toISOString().split('T')[0];
        if (input && input.value === today) {
          this._loadYangoCA(vehicule.id);
        }
      }, 120000);
    }
  },

  async _loadYangoCA(vehiculeId) {
    const vehicule = Store.findById('vehicules', vehiculeId);
    if (!vehicule) return;
    const chauffeur = vehicule.chauffeurAssigne ? Store.findById('chauffeurs', vehicule.chauffeurAssigne) : null;
    if (!chauffeur || !chauffeur.yangoDriverId) return;

    const container = document.getElementById('yango-ca-content');
    if (!container) return;

    const dateInput = document.getElementById('yango-ca-date');
    const today = new Date().toISOString().split('T')[0];
    const selectedDate = dateInput ? dateInput.value : today;
    const isToday = selectedDate === today;

    // Show/hide live badge
    const liveBadge = document.getElementById('yango-ca-live');
    if (liveBadge) liveBadge.style.display = isToday ? '' : 'none';

    container.innerHTML = '<div style="text-align:center;padding:var(--space-md);color:var(--text-muted);font-size:var(--font-size-xs);"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement...</div>';

    const stats = await Store.getYangoDriverStats(chauffeur.yangoDriverId, isToday ? null : selectedDate);

    if (!stats || stats.error) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-md);color:var(--danger);font-size:var(--font-size-xs);"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> ${stats?.details || stats?.error || 'Erreur'}</div>`;
      return;
    }

    container.innerHTML = `
      <div class="grid-4" style="gap:var(--space-sm);">
        <div style="text-align:center;padding:var(--space-sm);">
          <div style="font-size:var(--font-size-xl);font-weight:700;color:#FC4C02;">${Utils.formatCurrency(stats.totalCA)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">CA Total</div>
        </div>
        <div style="text-align:center;padding:var(--space-sm);">
          <div style="font-size:var(--font-size-lg);font-weight:600;color:#22c55e;">${Utils.formatCurrency(stats.totalCash)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:money-bag-bold-duotone" style="font-size:9px"></iconify-icon> Espèces</div>
        </div>
        <div style="text-align:center;padding:var(--space-sm);">
          <div style="font-size:var(--font-size-lg);font-weight:600;color:#3b82f6;">${Utils.formatCurrency(stats.totalCard)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:card-bold-duotone" style="font-size:9px"></iconify-icon> Carte</div>
        </div>
        <div style="text-align:center;padding:var(--space-sm);">
          <div style="font-size:var(--font-size-lg);font-weight:600;">${stats.nbCourses}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:bus-bold-duotone" style="font-size:9px"></iconify-icon> Courses</div>
        </div>
      </div>
      <div style="display:flex;justify-content:center;gap:var(--space-md);margin-top:var(--space-sm);padding-top:var(--space-sm);border-top:1px solid var(--border-color);font-size:var(--font-size-xs);color:var(--text-muted);">
        ${isToday ? '<span><iconify-icon icon="solar:record-circle-bold-duotone" style="color:#FC4C02;font-size:6px;vertical-align:middle"></iconify-icon> Temps réel</span>' : `<span><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> ${Utils.formatDate(selectedDate)}</span>`}
        <span>Maj: ${new Date(stats.derniereMaj).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</span>
      </div>
    `;
  },

  _getFormFields() {
    const chauffeurs = Store.get('chauffeurs');
    return [
      { type: 'row-start' },
      { name: 'marque', label: 'Marque', type: 'text', required: true },
      { name: 'modele', label: 'Modèle', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'annee', label: 'Année', type: 'number', min: 2015, max: 2026, required: true },
      { name: 'immatriculation', label: 'Immatriculation', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'couleur', label: 'Couleur', type: 'text' },
      { name: 'vin', label: 'N° VIN', type: 'text' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'typeEnergie', label: "Type d'énergie", type: 'select', required: true, options: [
        { value: 'thermique', label: 'Thermique' },
        { value: 'electrique', label: 'Électrique' }
      ]},
      { name: 'consommation', label: 'Consommation (L/100km ou kWh/100km)', type: 'number', min: 0, step: 0.1 },
      { type: 'row-end' },
      { type: 'heading', label: 'Batterie & Recharge (véhicule électrique)' },
      { type: 'row-start' },
      { name: 'capaciteBatterie', label: 'Capacité batterie (kWh)', type: 'number', min: 0, step: 0.1 },
      { name: 'autonomieKm', label: 'Autonomie WLTP (km)', type: 'number', min: 0 },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'niveauBatterie', label: 'Niveau batterie actuel (%)', type: 'number', min: 0, max: 100 },
      { name: 'puissanceChargeMax', label: 'Puissance charge max (kW)', type: 'number', min: 0 },
      { type: 'row-end' },
      { type: 'heading', label: 'Acquisition' },
      { type: 'row-start' },
      { name: 'typeAcquisition', label: "Type d'acquisition", type: 'select', required: true, options: [{ value: 'leasing', label: 'Leasing' }, { value: 'cash', label: 'Cash' }] },
      { name: 'prixAchat', label: "Prix d'achat (FCFA)", type: 'number', min: 0, step: 100 },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'mensualiteLeasing', label: 'Mensualité leasing (FCFA)', type: 'number', min: 0 },
      { name: 'dureeLeasing', label: 'Durée leasing (mois)', type: 'number', min: 0 },
      { type: 'row-end' },
      { name: 'apportInitial', label: 'Apport initial (FCFA)', type: 'number', min: 0 },
      { type: 'heading', label: 'Opérationnel' },
      { type: 'row-start' },
      { name: 'kilometrage', label: 'Kilométrage actuel', type: 'number', min: 0 },
      { name: 'statut', label: 'Statut', type: 'select', options: [
        { value: 'en_service', label: 'En service' },
        { value: 'en_maintenance', label: 'En maintenance' },
        { value: 'hors_service', label: 'Hors service' }
      ]},
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'assureur', label: 'Assureur', type: 'text' },
      { name: 'primeAnnuelle', label: 'Prime annuelle (FCFA)', type: 'number', min: 0 },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'chauffeurAssigne', label: 'Chauffeur assigné', type: 'select', placeholder: 'Sélectionner...', options: chauffeurs.filter(c => c.statut === 'actif').map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { name: 'parcId', label: 'Parc', type: 'select', placeholder: 'Aucun parc', options: (Store.get('parcs') || []).map(p => ({ value: p.id, label: p.nom })) },
      { type: 'row-end' },
      { type: 'divider' },
      { type: 'heading', label: 'Liaison Yango' },
      { name: 'yangoVehicleId', label: 'Yango Vehicle ID', type: 'text', placeholder: 'Ex: abc123... (rempli auto par la recherche ou manuellement)' }
    ];
  },

  _add() {
    const fields = this._getFormFields();
    Modal.form('<iconify-icon icon="solar:wheel-bold-duotone" class="text-blue"></iconify-icon> Nouveau véhicule', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const isEV = values.typeEnergie === 'electrique';
      const vehicule = {
        id: Utils.generateId('VEH'),
        ...values,
        kilometrageMensuel: 2500,
        dateDerniereRevision: null,
        prochainRevisionKm: (values.kilometrage || 0) + 10000,
        numeroPolice: '',
        dateExpirationAssurance: '',
        coutsMaintenance: [],
        typeEnergie: values.typeEnergie || 'thermique',
        consommation: values.consommation || (isEV ? 15 : 6.5),
        coutEnergie: isEV ? 120 : 800,
        dateCreation: new Date().toISOString()
      };
      // Add EV-specific defaults
      if (isEV) {
        vehicule.capaciteBatterie = values.capaciteBatterie || 60;
        vehicule.autonomieKm = values.autonomieKm || 350;
        vehicule.niveauBatterie = values.niveauBatterie || 100;
        vehicule.typeChargeur = 'CCS Combo 2';
        vehicule.puissanceChargeMax = values.puissanceChargeMax || 100;
        vehicule.tempsRechargeRapide = 30;
        vehicule.tempsRechargeNormale = 480;
        vehicule.dernierRecharge = new Date().toISOString().split('T')[0];
        vehicule.stationRechargeHabituelle = '';
      }
      Store.add('vehicules', vehicule);
      Modal.close();
      Toast.success(`${vehicule.marque} ${vehicule.modele} ajouté`);
      this.render();
    }, 'modal-lg');

    // Injecter le bouton "Rechercher sur Yango" à côté du champ yangoVehicleId
    this._injectYangoVehicleSearchButton();
  },

  _edit(id) {
    const vehicule = Store.findById('vehicules', id);
    if (!vehicule) return;
    const fields = this._getFormFields();
    Modal.form('<iconify-icon icon="solar:wheel-bold-duotone" class="text-blue"></iconify-icon> Modifier véhicule', FormBuilder.build(fields, vehicule), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      Store.update('vehicules', id, FormBuilder.getValues(body));
      Modal.close();
      Toast.success('Véhicule modifié');
      if (window.location.hash.includes(id)) this.renderDetail(id); else this.render();
    }, 'modal-lg');

    // Injecter le bouton "Rechercher sur Yango" à côté du champ yangoVehicleId
    this._injectYangoVehicleSearchButton();
  },

  _delete(id) {
    const v = Store.findById('vehicules', id);
    if (!v) return;
    Modal.confirm('Supprimer le véhicule', `Supprimer <strong>${v.marque} ${v.modele}</strong> (${v.immatriculation}) ?`, () => {
      Store.delete('vehicules', id);
      Toast.success('Véhicule supprimé');
      Router.navigate('/vehicules');
    });
  },

  // =================== TYPES MAINTENANCE ===================
  _maintenanceTypes: [
    { value: 'vidange', label: 'Vidange' },
    { value: 'revision', label: 'Révision' },
    { value: 'pneus', label: 'Pneus' },
    { value: 'freins', label: 'Freins' },
    { value: 'filtres', label: 'Filtres' },
    { value: 'climatisation', label: 'Climatisation' },
    { value: 'courroie', label: 'Courroie' },
    { value: 'controle_technique', label: 'Contrôle technique' },
    { value: 'batterie', label: 'Batterie' },
    { value: 'amortisseurs', label: 'Amortisseurs' },
    { value: 'echappement', label: 'Échappement' },
    { value: 'carrosserie', label: 'Carrosserie' },
    { value: 'autre', label: 'Autre' }
  ],

  _addMaintenance(id) {
    const fields = [
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'type', label: 'Type', type: 'select', required: true, options: this._maintenanceTypes },
      { name: 'description', label: 'Description', type: 'text', required: true },
      { type: 'row-start' },
      { name: 'montant', label: 'Montant (FCFA)', type: 'number', min: 0, required: true },
      { name: 'kilometrage', label: 'Kilométrage', type: 'number', min: 0 },
      { type: 'row-end' }
    ];

    Modal.form('<iconify-icon icon="solar:tuning-2-bold-duotone" class="text-warning"></iconify-icon> Nouvelle maintenance', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const vehicule = Store.findById('vehicules', id);
      if (!vehicule) { Toast.error('Véhicule introuvable'); Modal.close(); return; }
      const maintenance = { id: Utils.generateId('MNT'), ...values };
      vehicule.coutsMaintenance = vehicule.coutsMaintenance || [];
      vehicule.coutsMaintenance.push(maintenance);
      if (values.kilometrage) vehicule.kilometrage = Math.max(vehicule.kilometrage, values.kilometrage);
      Store.update('vehicules', id, { coutsMaintenance: vehicule.coutsMaintenance, kilometrage: vehicule.kilometrage });
      Modal.close();
      Toast.success('Maintenance ajoutée');
      this.renderDetail(id);
    });
  },

  // =================== MAINTENANCES PLANIFIEES ===================

  _maintenanceStatutBadge(statut) {
    const config = {
      a_venir: { label: 'À venir', class: 'badge-success' },
      urgent: { label: 'Urgent', class: 'badge-warning' },
      en_retard: { label: 'En retard', class: 'badge-danger' },
      complete: { label: 'Complété', class: 'badge-neutral' }
    };
    const c = config[statut] || config.a_venir;
    return `<span class="badge ${c.class}">${c.label}</span>`;
  },

  _getTypeLabel(type) {
    const found = this._maintenanceTypes.find(t => t.value === type);
    return found ? found.label : type;
  },

  _renderPlanifiedMaintenances(v) {
    const maintenances = (v.maintenancesPlanifiees || []).sort((a, b) => {
      const order = { en_retard: 0, urgent: 1, a_venir: 2, complete: 3 };
      return (order[a.statut] || 2) - (order[b.statut] || 2);
    });

    if (maintenances.length === 0) {
      return `
        <div style="text-align:center;padding:var(--space-xl);color:var(--text-muted);">
          <iconify-icon icon="solar:calendar-mark-bold-duotone" style="font-size:32px;margin-bottom:var(--space-sm);opacity:0.3;"></iconify-icon>
          <p style="margin:0;">Aucune maintenance planifiée</p>
          <p style="font-size:var(--font-size-xs);margin-top:4px;">Cliquez sur "Planifier" pour anticiper les entretiens</p>
        </div>
      `;
    }

    return `
      <div style="overflow-x:auto;">
        <table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th>Type</th>
              <th>Déclencheur</th>
              <th>Prochaine échéance</th>
              <th>Statut</th>
              <th>Coût estimé</th>
              <th>Prestataire</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${maintenances.map(m => {
              const echeance = [];
              if (m.prochainKm) echeance.push(`${Utils.formatNumber(m.prochainKm)} km`);
              if (m.prochaineDate) echeance.push(Utils.formatDate(m.prochaineDate));

              // Calcul restant pour affichage
              let restant = '';
              if (m.statut !== 'complete') {
                if (m.prochainKm && v.kilometrage) {
                  const kmR = m.prochainKm - v.kilometrage;
                  restant += kmR > 0 ? `${Utils.formatNumber(kmR)} km restants` : `Dépassé de ${Utils.formatNumber(Math.abs(kmR))} km`;
                }
                if (m.prochaineDate) {
                  const jours = Math.ceil((new Date(m.prochaineDate) - new Date()) / 86400000);
                  if (restant) restant += ' / ';
                  restant += jours > 0 ? `${jours}j restants` : `${Math.abs(jours)}j de retard`;
                }
              }

              return `
                <tr>
                  <td>
                    <div style="font-weight:500;">${this._getTypeLabel(m.type)}</div>
                    ${m.label && m.label !== m.type ? `<div style="font-size:var(--font-size-xs);color:var(--text-muted);">${m.label}</div>` : ''}
                  </td>
                  <td>
                    <span class="badge badge-info" style="font-size:10px;">
                      ${m.declencheur === 'km' ? `Tous les ${Utils.formatNumber(m.intervalleKm)} km` : ''}
                      ${m.declencheur === 'temps' ? `Tous les ${m.intervalleMois} mois` : ''}
                      ${m.declencheur === 'les_deux' ? `${Utils.formatNumber(m.intervalleKm)} km / ${m.intervalleMois} mois` : ''}
                    </span>
                  </td>
                  <td>
                    <div>${echeance.join(' / ')}</div>
                    ${restant ? `<div style="font-size:var(--font-size-xs);color:${m.statut === 'en_retard' ? 'var(--danger)' : m.statut === 'urgent' ? 'var(--warning)' : 'var(--text-muted)'};font-weight:500;">${restant}</div>` : ''}
                  </td>
                  <td>${this._maintenanceStatutBadge(m.statut)}</td>
                  <td>${m.coutEstime ? Utils.formatCurrency(m.coutEstime) : '-'}</td>
                  <td>${m.prestataire || '-'}</td>
                  <td style="text-align:right;">
                    ${m.statut !== 'complete' ? `
                      <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); VehiculesPage._completePlanifiedMaintenance('${v.id}', '${m.id}')" title="Compléter">
                        <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon>
                      </button>
                    ` : ''}
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); VehiculesPage._editPlanifiedMaintenance('${v.id}', '${m.id}')" title="Modifier">
                      <iconify-icon icon="solar:pen-bold-duotone"></iconify-icon>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); VehiculesPage._deletePlanifiedMaintenance('${v.id}', '${m.id}')" title="Supprimer">
                      <iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _addPlanifiedMaintenance(vehiculeId) {
    const vehicule = Store.findById('vehicules', vehiculeId);
    if (!vehicule) return;

    const today = new Date().toISOString().split('T')[0];
    const fields = [
      { type: 'row-start' },
      { name: 'type', label: 'Type d\'entretien', type: 'select', required: true, options: this._maintenanceTypes },
      { name: 'label', label: 'Libellé (optionnel)', type: 'text', placeholder: 'Ex: Vidange + filtre huile' },
      { type: 'row-end' },
      { type: 'heading', label: 'Déclencheur' },
      { name: 'declencheur', label: 'Planifier selon', type: 'select', required: true, options: [
        { value: 'km', label: 'Kilométrage' },
        { value: 'temps', label: 'Temps (mois)' },
        { value: 'les_deux', label: 'Les deux (km et temps)' }
      ]},
      { type: 'row-start' },
      { name: 'intervalleKm', label: 'Intervalle (km)', type: 'number', min: 100, step: 500, placeholder: '10000' },
      { name: 'intervalleMois', label: 'Intervalle (mois)', type: 'number', min: 1, max: 60, placeholder: '6' },
      { type: 'row-end' },
      { type: 'heading', label: 'Dernier entretien de ce type' },
      { type: 'row-start' },
      { name: 'dernierKm', label: 'Km au dernier entretien', type: 'number', min: 0, value: vehicule.kilometrage || 0 },
      { name: 'derniereDate', label: 'Date du dernier entretien', type: 'date', value: today },
      { type: 'row-end' },
      { type: 'heading', label: 'Informations complémentaires' },
      { type: 'row-start' },
      { name: 'coutEstime', label: 'Coût estimé (FCFA)', type: 'number', min: 0, step: 1000 },
      { name: 'prestataire', label: 'Prestataire / Garage', type: 'text' },
      { type: 'row-end' },
      { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Commentaires ou instructions...' }
    ];

    Modal.form('<iconify-icon icon="solar:calendar-mark-bold-duotone" class="text-blue"></iconify-icon> Planifier une maintenance', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      const values = FormBuilder.getValues(body);

      if (!values.type || !values.declencheur) {
        Toast.error('Type et déclencheur requis');
        return;
      }

      // Validation selon déclencheur
      if ((values.declencheur === 'km' || values.declencheur === 'les_deux') && !values.intervalleKm) {
        Toast.error('Intervalle km requis pour ce déclencheur');
        return;
      }
      if ((values.declencheur === 'temps' || values.declencheur === 'les_deux') && !values.intervalleMois) {
        Toast.error('Intervalle mois requis pour ce déclencheur');
        return;
      }

      // Auto-calcul prochaines échéances
      const dernierKm = values.dernierKm || vehicule.kilometrage || 0;
      const derniereDate = values.derniereDate || today;
      let prochainKm = null;
      let prochaineDate = null;

      if (values.declencheur === 'km' || values.declencheur === 'les_deux') {
        prochainKm = dernierKm + (parseInt(values.intervalleKm) || 0);
      }
      if (values.declencheur === 'temps' || values.declencheur === 'les_deux') {
        const d = new Date(derniereDate);
        d.setMonth(d.getMonth() + (parseInt(values.intervalleMois) || 6));
        prochaineDate = d.toISOString().split('T')[0];
      }

      // Determiner le statut initial
      let statut = 'a_venir';
      if (prochainKm && vehicule.kilometrage >= prochainKm) statut = 'en_retard';
      else if (prochainKm && (prochainKm - vehicule.kilometrage) <= 500) statut = 'urgent';
      if (prochaineDate) {
        const jours = Math.ceil((new Date(prochaineDate) - new Date()) / 86400000);
        if (jours < 0) statut = 'en_retard';
        else if (jours <= 7 && statut !== 'en_retard') statut = 'urgent';
      }

      const maintenance = {
        id: Utils.generateId('MPL'),
        type: values.type,
        label: values.label || '',
        declencheur: values.declencheur,
        intervalleKm: parseInt(values.intervalleKm) || null,
        intervalleMois: parseInt(values.intervalleMois) || null,
        dernierKm,
        derniereDate,
        prochainKm,
        prochaineDate,
        coutEstime: parseInt(values.coutEstime) || null,
        prestataire: values.prestataire || '',
        notes: values.notes || '',
        statut,
        dateCreation: new Date().toISOString()
      };

      const current = vehicule.maintenancesPlanifiees || [];
      current.push(maintenance);
      Store.update('vehicules', vehiculeId, { maintenancesPlanifiees: current });

      Modal.close();
      Toast.success(`Maintenance planifiée : ${this._getTypeLabel(values.type)}`);
      this.renderDetail(vehiculeId);
    }, 'modal-lg');
  },

  _editPlanifiedMaintenance(vehiculeId, maintenanceId) {
    const vehicule = Store.findById('vehicules', vehiculeId);
    if (!vehicule) return;
    const maintenances = vehicule.maintenancesPlanifiees || [];
    const m = maintenances.find(x => x.id === maintenanceId);
    if (!m) return;

    const fields = [
      { type: 'row-start' },
      { name: 'type', label: 'Type d\'entretien', type: 'select', required: true, options: this._maintenanceTypes },
      { name: 'label', label: 'Libellé', type: 'text' },
      { type: 'row-end' },
      { name: 'declencheur', label: 'Planifier selon', type: 'select', required: true, options: [
        { value: 'km', label: 'Kilométrage' },
        { value: 'temps', label: 'Temps (mois)' },
        { value: 'les_deux', label: 'Les deux' }
      ]},
      { type: 'row-start' },
      { name: 'intervalleKm', label: 'Intervalle (km)', type: 'number', min: 100, step: 500 },
      { name: 'intervalleMois', label: 'Intervalle (mois)', type: 'number', min: 1, max: 60 },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'dernierKm', label: 'Dernier km', type: 'number', min: 0 },
      { name: 'derniereDate', label: 'Dernière date', type: 'date' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'coutEstime', label: 'Coût estimé (FCFA)', type: 'number', min: 0 },
      { name: 'prestataire', label: 'Prestataire', type: 'text' },
      { type: 'row-end' },
      { name: 'notes', label: 'Notes', type: 'textarea' }
    ];

    Modal.form('<iconify-icon icon="solar:pen-bold-duotone" class="text-blue"></iconify-icon> Modifier maintenance planifiée', FormBuilder.build(fields, m), () => {
      const body = document.getElementById('modal-body');
      const values = FormBuilder.getValues(body);

      // Recalcul
      const dernierKm = values.dernierKm || m.dernierKm || 0;
      const derniereDate = values.derniereDate || m.derniereDate;
      let prochainKm = null;
      let prochaineDate = null;
      const declencheur = values.declencheur || m.declencheur;

      if (declencheur === 'km' || declencheur === 'les_deux') {
        prochainKm = dernierKm + (parseInt(values.intervalleKm) || m.intervalleKm || 0);
      }
      if (declencheur === 'temps' || declencheur === 'les_deux') {
        const d = new Date(derniereDate);
        d.setMonth(d.getMonth() + (parseInt(values.intervalleMois) || m.intervalleMois || 6));
        prochaineDate = d.toISOString().split('T')[0];
      }

      // Recalcul statut
      let statut = 'a_venir';
      if (prochainKm && vehicule.kilometrage >= prochainKm) statut = 'en_retard';
      else if (prochainKm && (prochainKm - vehicule.kilometrage) <= 500) statut = 'urgent';
      if (prochaineDate) {
        const jours = Math.ceil((new Date(prochaineDate) - new Date()) / 86400000);
        if (jours < 0) statut = 'en_retard';
        else if (jours <= 7 && statut !== 'en_retard') statut = 'urgent';
      }

      Object.assign(m, {
        type: values.type || m.type,
        label: values.label || '',
        declencheur,
        intervalleKm: parseInt(values.intervalleKm) || m.intervalleKm,
        intervalleMois: parseInt(values.intervalleMois) || m.intervalleMois,
        dernierKm,
        derniereDate,
        prochainKm,
        prochaineDate,
        coutEstime: parseInt(values.coutEstime) || m.coutEstime,
        prestataire: values.prestataire || '',
        notes: values.notes || '',
        statut
      });

      Store.update('vehicules', vehiculeId, { maintenancesPlanifiees: maintenances });
      Modal.close();
      Toast.success('Maintenance planifiée modifiée');
      this.renderDetail(vehiculeId);
    }, 'modal-lg');
  },

  _completePlanifiedMaintenance(vehiculeId, maintenanceId) {
    const vehicule = Store.findById('vehicules', vehiculeId);
    if (!vehicule) return;
    const maintenances = vehicule.maintenancesPlanifiees || [];
    const m = maintenances.find(x => x.id === maintenanceId);
    if (!m) return;

    const today = new Date().toISOString().split('T')[0];
    const fields = [
      { type: 'heading', label: `Compléter : ${this._getTypeLabel(m.type)}${m.label ? ' — ' + m.label : ''}` },
      { type: 'row-start' },
      { name: 'date', label: 'Date réelle', type: 'date', required: true, value: today },
      { name: 'kilometrage', label: 'Km réel', type: 'number', min: 0, required: true, value: vehicule.kilometrage || 0 },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'montant', label: 'Montant réel (FCFA)', type: 'number', min: 0, required: true, value: m.coutEstime || 0 },
      { name: 'prestataire', label: 'Prestataire', type: 'text', value: m.prestataire || '' },
      { type: 'row-end' },
      { name: 'description', label: 'Description', type: 'text', required: true, value: m.label || this._getTypeLabel(m.type) }
    ];

    Modal.form('<iconify-icon icon="solar:check-circle-bold-duotone" class="text-success"></iconify-icon> Compléter la maintenance', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      const values = FormBuilder.getValues(body);

      if (!values.date || !values.montant) {
        Toast.error('Date et montant requis');
        return;
      }

      // 1. Ajouter dans l'historique coutsMaintenance
      const histMaintenance = {
        id: Utils.generateId('MNT'),
        date: values.date,
        type: m.type,
        description: values.description || m.label || this._getTypeLabel(m.type),
        montant: parseInt(values.montant) || 0,
        kilometrage: parseInt(values.kilometrage) || vehicule.kilometrage
      };
      const coutsMaintenance = vehicule.coutsMaintenance || [];
      coutsMaintenance.push(histMaintenance);

      // 2. Recalculer le cycle suivant dans la planification
      const kmReel = parseInt(values.kilometrage) || vehicule.kilometrage;
      const dateReelle = values.date;

      m.dernierKm = kmReel;
      m.derniereDate = dateReelle;

      if (m.declencheur === 'km' || m.declencheur === 'les_deux') {
        m.prochainKm = kmReel + (m.intervalleKm || 10000);
      }
      if (m.declencheur === 'temps' || m.declencheur === 'les_deux') {
        const d = new Date(dateReelle);
        d.setMonth(d.getMonth() + (m.intervalleMois || 6));
        m.prochaineDate = d.toISOString().split('T')[0];
      }

      // Remettre le statut à "a_venir" (nouveau cycle)
      m.statut = 'a_venir';

      // 3. Mettre à jour le km du véhicule si plus élevé
      const newKm = Math.max(vehicule.kilometrage, kmReel);

      Store.update('vehicules', vehiculeId, {
        coutsMaintenance,
        maintenancesPlanifiees: maintenances,
        kilometrage: newKm
      });

      Modal.close();
      Toast.success(`${this._getTypeLabel(m.type)} complétée — prochain cycle planifié`);
      this.renderDetail(vehiculeId);
    });
  },

  _deletePlanifiedMaintenance(vehiculeId, maintenanceId) {
    const vehicule = Store.findById('vehicules', vehiculeId);
    if (!vehicule) return;
    const m = (vehicule.maintenancesPlanifiees || []).find(x => x.id === maintenanceId);
    if (!m) return;

    Modal.confirm(
      'Supprimer la maintenance planifiée',
      `Supprimer la planification <strong>${this._getTypeLabel(m.type)}</strong>${m.label ? ' (' + m.label + ')' : ''} ?`,
      () => {
        const updated = (vehicule.maintenancesPlanifiees || []).filter(x => x.id !== maintenanceId);
        Store.update('vehicules', vehiculeId, { maintenancesPlanifiees: updated });
        Toast.success('Maintenance planifiée supprimée');
        this.renderDetail(vehiculeId);
      }
    );
  },

  // ========================= CARBURANT / ÉNERGIE =========================

  _renderCarburantSection(vehicule) {
    const depenses = Store.get('depenses') || [];
    const carburant = depenses.filter(d => d.vehiculeId === vehicule.id && (d.typeDepense === 'carburant' || d.typeDepense === 'recharge'));
    const isEV = vehicule.typeEnergie === 'electrique';

    // Last 6 months
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      const monthCarb = carburant.filter(c => {
        const d = new Date(c.date);
        return d >= m && d <= monthEnd;
      });
      months.push({
        label: Utils.getMonthShort(m.getMonth()),
        total: monthCarb.reduce((s, c) => s + (c.montant || 0), 0),
        litres: monthCarb.reduce((s, c) => s + (c.quantite || 0), 0)
      });
    }

    const totalCarburant = carburant.reduce((s, c) => s + (c.montant || 0), 0);
    const totalLitres = carburant.reduce((s, c) => s + (c.quantite || 0), 0);
    const avgConsommation = vehicule.kilometrage > 0 && totalLitres > 0
      ? (totalLitres / (vehicule.kilometrage / 100)).toFixed(1)
      : vehicule.consommation || 0;

    return `
      <div class="card" style="margin-top:var(--space-md);">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:gas-station-bold-duotone"></iconify-icon> ${isEV ? 'Recharges' : 'Carburant'}</span>
          <button class="btn btn-sm btn-primary" onclick="VehiculesPage._addCarburant('${vehicule.id}')">
            <iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> ${isEV ? 'Recharge' : 'Plein'}
          </button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
          <div style="text-align:center;padding:12px;border-radius:var(--radius-sm);background:var(--bg-tertiary);">
            <div style="font-size:var(--font-size-lg);font-weight:700;color:var(--pilote-blue);">${Utils.formatCurrency(totalCarburant)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Total dépensé</div>
          </div>
          <div style="text-align:center;padding:12px;border-radius:var(--radius-sm);background:var(--bg-tertiary);">
            <div style="font-size:var(--font-size-lg);font-weight:700;color:var(--success);">${totalLitres.toFixed(1)} ${isEV ? 'kWh' : 'L'}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Total ${isEV ? 'rechargé' : 'consommé'}</div>
          </div>
          <div style="text-align:center;padding:12px;border-radius:var(--radius-sm);background:var(--bg-tertiary);">
            <div style="font-size:var(--font-size-lg);font-weight:700;color:var(--warning);">${avgConsommation} ${isEV ? 'kWh' : 'L'}/100km</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Consommation moy.</div>
          </div>
        </div>
        <div style="height:200px;">
          <canvas id="chart-carburant"></canvas>
        </div>
        ${carburant.length > 0 ? `
          <div style="margin-top:12px;">
            <div style="font-size:var(--font-size-xs);font-weight:600;color:var(--text-secondary);margin-bottom:8px;">Derniers pleins</div>
            ${carburant.sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5).map(c => `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);font-size:var(--font-size-xs);">
                <span>${Utils.formatDate(c.date)}</span>
                <span>${(c.quantite || 0).toFixed(1)} ${isEV ? 'kWh' : 'L'}</span>
                <span style="font-weight:600;">${Utils.formatCurrency(c.montant || 0)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  _loadCarburantChart(vehiculeId) {
    const ctx = document.getElementById('chart-carburant');
    if (!ctx) return;

    const depenses = Store.get('depenses') || [];
    const vehicule = Store.findById('vehicules', vehiculeId);
    const isEV = vehicule && vehicule.typeEnergie === 'electrique';
    const carburant = depenses.filter(d => d.vehiculeId === vehiculeId && (d.typeDepense === 'carburant' || d.typeDepense === 'recharge'));

    const now = new Date();
    const labels = [];
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      labels.push(Utils.getMonthShort(m.getMonth()));
      const monthTotal = carburant.filter(c => {
        const d = new Date(c.date);
        return d >= m && d <= monthEnd;
      }).reduce((s, c) => s + (c.montant || 0), 0);
      data.push(monthTotal);
    }

    if (this._carburantChart) this._carburantChart.destroy();
    this._carburantChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: isEV ? 'Recharges' : 'Carburant',
          data,
          backgroundColor: isEV ? 'rgba(34, 197, 94, 0.7)' : 'rgba(245, 158, 11, 0.7)',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => Utils.formatCurrency(v) } } }
      }
    });
  },

  _addCarburant(vehiculeId) {
    const vehicule = Store.findById('vehicules', vehiculeId);
    const isEV = vehicule && vehicule.typeEnergie === 'electrique';

    const fields = [
      { name: 'date', label: 'Date', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
      { type: 'row-start' },
      { name: 'quantite', label: isEV ? 'kWh rechargés' : 'Litres', type: 'number', min: 0, step: 0.1, required: true },
      { name: 'montant', label: 'Coût (FCFA)', type: 'number', min: 0, required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'kilometrage', label: 'Kilométrage actuel', type: 'number', min: 0, default: vehicule ? vehicule.kilometrage : 0 },
      { name: 'station', label: isEV ? 'Station de charge' : 'Station service', type: 'text', placeholder: 'Nom de la station' },
      { type: 'row-end' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ];

    Modal.form(`<iconify-icon icon="solar:gas-station-bold-duotone" class="text-blue"></iconify-icon> ${isEV ? 'Nouvelle recharge' : 'Nouveau plein'}`, FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);

      Store.add('depenses', {
        id: Utils.generateId('DEP'),
        vehiculeId,
        typeDepense: isEV ? 'recharge' : 'carburant',
        date: values.date,
        montant: values.montant,
        quantite: values.quantite,
        station: values.station,
        notes: values.notes,
        dateCreation: new Date().toISOString()
      });

      // Update vehicle km
      if (values.kilometrage && vehicule) {
        Store.update('vehicules', vehiculeId, { kilometrage: values.kilometrage });
      }

      Modal.close();
      Toast.success(isEV ? 'Recharge enregistrée' : 'Plein enregistré');
      this.renderDetail(vehiculeId);
    });
  },

  // =================== YANGO VEHICLE LINKING ===================

  async _searchYangoVehicle(vehiculeId) {
    const container = document.getElementById('yango-vehicle-search-results');
    if (!container) return;

    const vehicule = Store.findById('vehicules', vehiculeId);
    if (!vehicule) return;

    container.innerHTML = '<div style="padding:8px;font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Recherche des véhicules Yango...</div>';

    try {
      const res = await Store.getYangoVehiclesForLinking();
      if (!res || !res.vehicles) {
        container.innerHTML = '<div style="color:#ef4444;font-size:var(--font-size-xs);"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Impossible de charger les véhicules Yango</div>';
        return;
      }

      const vehicles = res.vehicles;
      const searchPlate = (vehicule.immatriculation || '').replace(/[\s\-\.]/g, '').toUpperCase();
      const searchName = `${vehicule.marque} ${vehicule.modele}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Score par pertinence : immatriculation d'abord, puis marque/modele
      const scored = vehicles.map(v => {
        let score = 0;
        const yPlate = (v.immatriculation || '').replace(/[\s\-\.]/g, '').toUpperCase();
        const yName = `${v.marque} ${v.modele}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Match exact immatriculation
        if (searchPlate.length >= 3 && yPlate === searchPlate) score += 100;
        // Match partiel immatriculation
        else if (searchPlate.length >= 3 && yPlate.includes(searchPlate)) score += 70;
        else if (searchPlate.length >= 3 && searchPlate.includes(yPlate) && yPlate.length >= 3) score += 50;

        // Match marque/modele
        if (yName === searchName) score += 60;
        else {
          const searchWords = searchName.split(' ');
          const yWords = yName.split(' ');
          for (const sw of searchWords) {
            if (sw.length >= 3 && yWords.some(yw => yw === sw)) score += 20;
          }
        }

        return { ...v, _score: score };
      });

      scored.sort((a, b) => b._score - a._score);

      const top = scored.slice(0, 20);
      const matchCount = scored.filter(v => v._score > 0).length;

      container.innerHTML = `
        <div style="margin-bottom:8px;">
          <input type="text" class="form-control" id="yango-vehicle-search-input" placeholder="Filtrer par immatriculation ou marque..." style="font-size:var(--font-size-xs);padding:6px 10px;"
            oninput="VehiculesPage._filterYangoVehicleResults()">
        </div>
        ${matchCount > 0 ? `<div style="font-size:var(--font-size-xs);color:#22c55e;margin-bottom:6px;"><iconify-icon icon="solar:star-bold-duotone"></iconify-icon> ${matchCount} correspondance(s) probable(s)</div>` : ''}
        <div id="yango-vehicles-list" style="max-height:250px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-sm);">
          ${this._renderYangoVehiclesList(top, vehiculeId)}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${vehicles.length} véhicules Yango au total</div>
      `;

      this._yangoVehiclesCache = scored;
      this._yangoLinkVehiculeId = vehiculeId;
    } catch (err) {
      container.innerHTML = `<div style="color:#ef4444;font-size:var(--font-size-xs);"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Erreur: ${err.message}</div>`;
    }
  },

  _renderYangoVehiclesList(vehicles, vehiculeId) {
    if (vehicles.length === 0) return '<div style="padding:12px;text-align:center;font-size:var(--font-size-xs);color:var(--text-muted);">Aucun résultat</div>';

    return vehicles.map(v => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border-color);font-size:var(--font-size-xs);${v._score >= 70 ? 'background:rgba(34,197,94,0.06);' : ''}">
        <div style="flex:1;">
          <div style="font-weight:500;">
            ${v._score >= 70 ? '<iconify-icon icon="solar:star-bold-duotone" style="color:#22c55e;font-size:9px;"></iconify-icon> ' : ''}
            ${v.marque} ${v.modele}
          </div>
          <div style="color:var(--text-muted);font-size:10px;">${v.immatriculation || 'Pas de plaque'} &bull; ${v.couleur || '?'} &bull; ${v.annee || '?'}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="VehiculesPage._linkYangoVehicle('${vehiculeId}', '${v.id}', '${(v.marque + ' ' + v.modele + ' ' + v.immatriculation).replace(/'/g, "\\'")}')">
          <iconify-icon icon="solar:link-bold-duotone"></iconify-icon> Lier
        </button>
      </div>
    `).join('');
  },

  _filterYangoVehicleResults() {
    const input = document.getElementById('yango-vehicle-search-input');
    const list = document.getElementById('yango-vehicles-list');
    if (!input || !list || !this._yangoVehiclesCache) return;

    const query = input.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    let filtered = this._yangoVehiclesCache;

    if (query) {
      filtered = this._yangoVehiclesCache.filter(v => {
        const name = `${v.marque} ${v.modele}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const plate = (v.immatriculation || '').toLowerCase();
        return name.includes(query) || plate.includes(query);
      });
    }

    list.innerHTML = this._renderYangoVehiclesList(filtered.slice(0, 30), this._yangoLinkVehiculeId);
  },

  async _linkYangoVehicle(vehiculeId, yangoId, yangoLabel) {
    Store.update('vehicules', vehiculeId, { yangoVehicleId: yangoId });
    Toast.success(`Véhicule lié à ${yangoLabel} sur Yango`);
    this.renderDetail(vehiculeId);
  },

  async _unlinkYangoVehicle(vehiculeId) {
    Modal.confirm(
      'Délier le véhicule Yango',
      'Voulez-vous supprimer la liaison avec le véhicule Yango ?',
      () => {
        Store.update('vehicules', vehiculeId, { yangoVehicleId: '' });
        Toast.success('Liaison Yango supprimée');
        this.renderDetail(vehiculeId);
      }
    );
  },

  // ======== YANGO SEARCH IN VEHICLE FORM ========

  _injectYangoVehicleSearchButton() {
    setTimeout(() => {
      const input = document.querySelector('#modal-body [name="yangoVehicleId"]');
      if (!input) return;

      if (input.parentElement.querySelector('.yango-search-form-btn')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-outline yango-search-form-btn';
      btn.style.cssText = 'margin-left:8px;padding:4px 10px;font-size:11px;';
      btn.innerHTML = '<iconify-icon icon="solar:magnifer-bold-duotone"></iconify-icon> Rechercher';
      btn.addEventListener('click', () => this._openYangoVehicleSearchInForm());

      input.parentElement.style.display = 'flex';
      input.parentElement.style.alignItems = 'center';
      input.style.flex = '1';
      input.parentElement.appendChild(btn);

      // Container pour les résultats
      const resultsDiv = document.createElement('div');
      resultsDiv.id = 'yango-vehicle-form-search-results';
      resultsDiv.style.marginTop = '4px';
      input.parentElement.parentElement.appendChild(resultsDiv);
    }, 200);
  },

  async _openYangoVehicleSearchInForm() {
    const container = document.getElementById('yango-vehicle-form-search-results');
    if (!container) return;

    container.innerHTML = '<div style="padding:8px;font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement...</div>';

    try {
      const res = await Store.getYangoVehiclesForLinking();
      if (!res || !res.vehicles) {
        container.innerHTML = '<div style="color:#ef4444;font-size:var(--font-size-xs);">Impossible de charger les véhicules Yango</div>';
        return;
      }

      this._yangoFormVehiclesCache = res.vehicles;
      container.innerHTML = `
        <div style="margin-bottom:6px;">
          <input type="text" class="form-control" id="yango-vehicle-form-filter" placeholder="Filtrer par immatriculation ou marque..." style="font-size:var(--font-size-xs);padding:4px 8px;"
            oninput="VehiculesPage._filterYangoFormVehicleResults()">
        </div>
        <div id="yango-vehicle-form-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-sm);">
          ${this._renderYangoFormVehiclesList(res.vehicles.slice(0, 20))}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${res.vehicles.length} véhicules Yango</div>
      `;
    } catch (err) {
      container.innerHTML = `<div style="color:#ef4444;font-size:var(--font-size-xs);">Erreur: ${err.message}</div>`;
    }
  },

  _renderYangoFormVehiclesList(vehicles) {
    if (vehicles.length === 0) return '<div style="padding:8px;text-align:center;font-size:var(--font-size-xs);color:var(--text-muted);">Aucun résultat</div>';
    return vehicles.map(v => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-bottom:1px solid var(--border-color);font-size:var(--font-size-xs);">
        <div style="flex:1;">
          <span style="font-weight:500;">${v.marque} ${v.modele}</span>
          <span style="color:var(--text-muted);margin-left:4px;">${v.immatriculation || ''}</span>
        </div>
        <button type="button" class="btn btn-sm btn-primary" style="padding:2px 8px;font-size:10px;" onclick="VehiculesPage._linkYangoFromVehicleForm('${v.id}', '${(v.marque + ' ' + v.modele + ' ' + (v.immatriculation || '')).replace(/'/g, "\\'")}')">
          <iconify-icon icon="solar:link-bold-duotone"></iconify-icon> Lier
        </button>
      </div>
    `).join('');
  },

  _filterYangoFormVehicleResults() {
    const input = document.getElementById('yango-vehicle-form-filter');
    const list = document.getElementById('yango-vehicle-form-list');
    if (!input || !list || !this._yangoFormVehiclesCache) return;

    const query = input.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    let filtered = this._yangoFormVehiclesCache;

    if (query) {
      filtered = this._yangoFormVehiclesCache.filter(v => {
        const name = `${v.marque} ${v.modele}`.toLowerCase();
        const plate = (v.immatriculation || '').toLowerCase();
        return name.includes(query) || plate.includes(query);
      });
    }

    list.innerHTML = this._renderYangoFormVehiclesList(filtered.slice(0, 30));
  },

  _linkYangoFromVehicleForm(yangoId, yangoLabel) {
    const input = document.querySelector('#modal-body [name="yangoVehicleId"]');
    if (input) {
      input.value = yangoId;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const container = document.getElementById('yango-vehicle-form-search-results');
    if (container) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius-sm);font-size:var(--font-size-xs);margin-top:4px;">
          <iconify-icon icon="solar:check-circle-bold-duotone" style="color:#22c55e;"></iconify-icon>
          <span>Lié à <strong>${yangoLabel}</strong></span>
          <button type="button" class="btn btn-sm" style="margin-left:auto;padding:2px 8px;font-size:10px;" onclick="VehiculesPage._unlinkYangoFromVehicleForm()">
            <iconify-icon icon="solar:close-circle-bold"></iconify-icon>
          </button>
        </div>
      `;
    }

    Toast.success(`Véhicule sera lié à ${yangoLabel}`);
  },

  _unlinkYangoFromVehicleForm() {
    const input = document.querySelector('#modal-body [name="yangoVehicleId"]');
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const container = document.getElementById('yango-vehicle-form-search-results');
    if (container) container.innerHTML = '';
    Toast.show('Liaison Yango retirée', 'info');
  }
};
