/**
 * VehiculesPage - Vehicle management with CRUD and detail
 */
const VehiculesPage = {
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    const vehicules = Store.get('vehicules');
    container.innerHTML = this._listTemplate(vehicules);
    this._bindListEvents(vehicules);
  },

  renderDetail(id) {
    const container = document.getElementById('page-content');
    const vehicule = Store.findById('vehicules', id);
    if (!vehicule) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-car-burst"></i><h3>Véhicule non trouvé</h3></div>';
      return;
    }
    container.innerHTML = this._detailTemplate(vehicule);
    this._loadDetailCharts(vehicule);
    this._bindDetailEvents(vehicule);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
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
        <h1><i class="fas fa-car"></i> Véhicules</h1>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-vehicule"><i class="fas fa-plus"></i> Ajouter</button>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card"><div class="kpi-value">${stats.total}</div><div class="kpi-label">Total flotte</div></div>
        <div class="kpi-card green"><div class="kpi-value">${stats.enService}</div><div class="kpi-label">En service</div></div>
        <div class="kpi-card yellow"><div class="kpi-value">${stats.enMaintenance}</div><div class="kpi-label">En maintenance</div></div>
        <div class="kpi-card cyan">
          <div class="kpi-value">
            <span style="color:var(--volt-yellow)">${stats.electriques} <i class="fas fa-bolt" style="font-size:16px"></i></span>
            <span style="color:var(--text-muted);font-size:14px;margin:0 4px;">/</span>
            <span>${stats.thermiques} <i class="fas fa-gas-pump" style="font-size:14px"></i></span>
          </div>
          <div class="kpi-label">Électrique / Thermique</div>
        </div>
      </div>

      <div id="vehicules-table"></div>
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
              ? '<i class="fas fa-bolt" style="color:var(--volt-yellow);font-size:10px;margin-left:4px" title="Électrique"></i>'
              : '<i class="fas fa-gas-pump" style="color:var(--text-muted);font-size:9px;margin-left:4px" title="Thermique"></i>';
            return `<div><div style="font-weight:500">${v.marque} ${v.modele} ${energyIcon}</div><div style="font-size:11px;color:var(--text-muted)">${v.immatriculation} &bull; ${v.annee}</div></div>`;
          },
          value: (v) => `${v.marque} ${v.modele}`
        },
        {
          label: 'Énergie', key: 'typeEnergie',
          render: (v) => v.typeEnergie === 'electrique'
            ? '<span class="badge badge-warning"><i class="fas fa-bolt" style="font-size:8px"></i> Électrique</span>'
            : '<span class="badge badge-neutral"><i class="fas fa-gas-pump" style="font-size:8px"></i> Thermique</span>'
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
              return `${Utils.formatNumber(v.kilometrage)} km<br><span style="font-size:10px;color:var(--volt-yellow)"><i class="fas fa-battery-three-quarters"></i> ${v.niveauBatterie}% &bull; ~${autonomieRestante} km</span>`;
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
        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); VehiculesPage._edit('${v.id}')" title="Modifier"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); VehiculesPage._delete('${v.id}')" title="Supprimer"><i class="fas fa-trash"></i></button>
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
      ? '<span class="badge badge-warning"><i class="fas fa-bolt" style="font-size:8px"></i> Électrique</span>'
      : '<span class="badge badge-neutral"><i class="fas fa-gas-pump" style="font-size:8px"></i> Thermique</span>';

    const avatarBg = isEV ? 'var(--volt-yellow)' : 'var(--volt-blue)';
    const avatarIcon = isEV ? 'fa-charging-station' : 'fa-car';

    return `
      <div class="page-header">
        <h1>
          <a href="#/vehicules" style="color:var(--text-muted)"><i class="fas fa-arrow-left"></i></a>
          Fiche véhicule
        </h1>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="VehiculesPage._edit('${v.id}')"><i class="fas fa-edit"></i> Modifier</button>
          <button class="btn btn-warning" onclick="VehiculesPage._addMaintenance('${v.id}')"><i class="fas fa-wrench"></i> Maintenance</button>
        </div>
      </div>

      <div class="detail-header">
        <div class="avatar avatar-xl" style="background:${avatarBg}"><i class="fas ${avatarIcon}" style="font-size:28px"></i></div>
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
              <div class="detail-stat-value" style="color:var(--volt-yellow)">${v.niveauBatterie}%</div>
              <div class="detail-stat-label">Batterie</div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>

      ${isEV ? `
      <!-- Bloc spécifique Véhicule Électrique -->
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid var(--volt-yellow);background:rgba(250,204,21,0.04);">
        <div class="card-header"><span class="card-title"><i class="fas fa-bolt" style="color:var(--volt-yellow)"></i> Informations Véhicule Électrique</span></div>
        <div class="grid-4" style="gap:var(--space-md);">
          <div style="text-align:center;padding:var(--space-sm);">
            <div style="font-size:var(--font-size-2xl);font-weight:700;color:var(--volt-yellow);">${v.niveauBatterie}%</div>
            <div class="progress-bar" style="margin:8px 0;">
              <div class="progress-fill ${v.niveauBatterie < 20 ? 'red' : v.niveauBatterie < 40 ? 'yellow' : ''}" style="width:${v.niveauBatterie}%;background:${v.niveauBatterie < 20 ? 'var(--danger)' : 'var(--volt-yellow)'}"></div>
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

      <!-- Charts -->
      <div class="charts-grid" style="margin-top:var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-bar"></i> Répartition des coûts</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-vehicle-costs"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-line"></i> CA mensuel généré</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-vehicle-revenue"></canvas>
          </div>
        </div>
      </div>

      <!-- Maintenance history -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title">Historique maintenance</span>
          <button class="btn btn-sm btn-primary" onclick="VehiculesPage._addMaintenance('${v.id}')"><i class="fas fa-plus"></i> Ajouter</button>
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
  },

  _bindDetailEvents() {},

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
      { name: 'chauffeurAssigne', label: 'Chauffeur assigné', type: 'select', placeholder: 'Sélectionner...', options: chauffeurs.filter(c => c.statut === 'actif').map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) }
    ];
  },

  _add() {
    const fields = this._getFormFields();
    Modal.form('<i class="fas fa-car text-blue"></i> Nouveau véhicule', FormBuilder.build(fields), () => {
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
  },

  _edit(id) {
    const vehicule = Store.findById('vehicules', id);
    if (!vehicule) return;
    const fields = this._getFormFields();
    Modal.form('<i class="fas fa-car text-blue"></i> Modifier véhicule', FormBuilder.build(fields, vehicule), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      Store.update('vehicules', id, FormBuilder.getValues(body));
      Modal.close();
      Toast.success('Véhicule modifié');
      if (window.location.hash.includes(id)) this.renderDetail(id); else this.render();
    }, 'modal-lg');
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

  _addMaintenance(id) {
    const fields = [
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'type', label: 'Type', type: 'select', required: true, options: [
        { value: 'revision', label: 'Révision' },
        { value: 'pneus', label: 'Pneus' },
        { value: 'freins', label: 'Freins' },
        { value: 'carrosserie', label: 'Carrosserie' },
        { value: 'autre', label: 'Autre' }
      ]},
      { name: 'description', label: 'Description', type: 'text', required: true },
      { type: 'row-start' },
      { name: 'montant', label: 'Montant (FCFA)', type: 'number', min: 0, required: true },
      { name: 'kilometrage', label: 'Kilométrage', type: 'number', min: 0 },
      { type: 'row-end' }
    ];

    Modal.form('<i class="fas fa-wrench text-warning"></i> Nouvelle maintenance', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const vehicule = Store.findById('vehicules', id);
      const maintenance = { id: Utils.generateId('MNT'), ...values };
      vehicule.coutsMaintenance = vehicule.coutsMaintenance || [];
      vehicule.coutsMaintenance.push(maintenance);
      if (values.kilometrage) vehicule.kilometrage = Math.max(vehicule.kilometrage, values.kilometrage);
      Store.update('vehicules', id, { coutsMaintenance: vehicule.coutsMaintenance, kilometrage: vehicule.kilometrage });
      Modal.close();
      Toast.success('Maintenance ajoutée');
      this.renderDetail(id);
    });
  }
};
