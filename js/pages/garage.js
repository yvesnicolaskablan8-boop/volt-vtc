/**
 * GaragePage — Module Garage avec onglets (Maintenance, etc.)
 */
const GaragePage = {
  _charts: [],
  _activeTab: 'maintenance',

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._pageTemplate();
    this._renderTab(this._activeTab);
    this._bindTabEvents();
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _pageTemplate() {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:garage-bold-duotone"></iconify-icon> Garage</h1>
      </div>

      <!-- Onglets -->
      <div class="garage-tabs" style="display:flex;gap:0;margin-bottom:var(--space-lg);border-bottom:2px solid var(--border-color);">
        <button class="garage-tab active" data-tab="maintenance">
          <iconify-icon icon="solar:tuning-2-bold-duotone"></iconify-icon> Maintenance
        </button>
      </div>

      <!-- Contenu onglet -->
      <div id="garage-tab-content"></div>

      <style>
        .garage-tab { background:none;border:none;padding:10px 20px;cursor:pointer;font-size:var(--font-size-sm);font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;gap:6px; }
        .garage-tab:hover { color:var(--text-primary);background:var(--bg-secondary);border-radius:var(--radius-md) var(--radius-md) 0 0; }
        .garage-tab.active { color:var(--volt-orange);border-bottom-color:var(--volt-orange); }
        .maint-filter { background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:4px 12px;cursor:pointer;font-size:var(--font-size-xs);transition:all 0.2s; }
        .maint-filter.active { background:var(--volt-blue);color:white !important;border-color:var(--volt-blue); }
        .maint-filter:hover:not(.active) { background:var(--bg-secondary); }
        .maint-statut-badge { display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600; }
        .maint-statut-badge.en_retard { background:rgba(239,68,68,0.12);color:#ef4444; }
        .maint-statut-badge.urgent { background:rgba(245,158,11,0.12);color:#f59e0b; }
        .maint-statut-badge.a_venir { background:rgba(59,130,246,0.1);color:#3b82f6; }
        .maint-statut-badge.terminee { background:rgba(34,197,94,0.1);color:#22c55e; }
      </style>
    `;
  },

  _bindTabEvents() {
    document.querySelectorAll('.garage-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.garage-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeTab = tab.dataset.tab;
        // Détruire les charts avant de changer d'onglet
        this._charts.forEach(c => c.destroy());
        this._charts = [];
        this._renderTab(this._activeTab);
      });
    });
  },

  _renderTab(tab) {
    const content = document.getElementById('garage-tab-content');
    if (!content) return;

    if (tab === 'maintenance') {
      this._renderMaintenanceTab(content);
    }
  },

  // =================== ONGLET MAINTENANCE ===================

  _renderMaintenanceTab(container) {
    const vehicules = Store.get('vehicules').filter(v => v.statut === 'en_service');
    const chauffeurs = Store.get('chauffeurs');

    // Collecter toutes les maintenances de tous les vehicules
    const allMaintenances = [];
    vehicules.forEach(v => {
      if (!v.maintenancesPlanifiees || v.maintenancesPlanifiees.length === 0) return;
      const chauffeur = chauffeurs.find(c => c.vehiculeAssigne === v.id);
      v.maintenancesPlanifiees.forEach(m => {
        allMaintenances.push({
          ...m,
          vehiculeId: v.id,
          vehiculeLabel: `${v.marque} ${v.modele}`,
          immatriculation: v.immatriculation,
          kilometrage: v.kilometrage,
          chauffeurNom: chauffeur ? `${chauffeur.prenom} ${chauffeur.nom}` : null,
          chauffeurId: chauffeur ? chauffeur.id : null
        });
      });
    });

    // Trier par urgence
    const ordre = { en_retard: 0, urgent: 1, a_venir: 2, terminee: 3 };
    allMaintenances.sort((a, b) => (ordre[a.statut] || 9) - (ordre[b.statut] || 9));

    // Stats
    const countRetard = allMaintenances.filter(m => m.statut === 'en_retard').length;
    const countUrgent = allMaintenances.filter(m => m.statut === 'urgent').length;
    const countAVenir = allMaintenances.filter(m => m.statut === 'a_venir').length;
    const countComplete = allMaintenances.filter(m => m.statut === 'terminee').length;
    const totalCout = allMaintenances.filter(m => m.statut !== 'terminee').reduce((s, m) => s + (m.coutEstime || 0), 0);
    const vehiculesAvecMaint = new Set(allMaintenances.map(m => m.vehiculeId)).size;

    container.innerHTML = this._maintenanceTemplate(allMaintenances, {
      countRetard, countUrgent, countAVenir, countComplete, totalCout, vehiculesAvecMaint,
      totalVehicules: vehicules.length
    });
    this._bindMaintenanceEvents(allMaintenances);
    this._loadMaintenanceCharts(allMaintenances);
  },

  _maintenanceTemplate(maintenances, stats) {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-md);">
        <div class="badge ${stats.countRetard > 0 ? 'badge-danger' : stats.countUrgent > 0 ? 'badge-warning' : 'badge-success'}" style="padding:6px 12px;font-size:var(--font-size-sm);">
          ${stats.countRetard > 0 ? `<iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon> ${stats.countRetard} en retard` : stats.countUrgent > 0 ? `<iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> ${stats.countUrgent} urgentes` : '<iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Flotte OK'}
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card ${stats.countRetard > 0 ? 'red' : ''}">
          <div class="kpi-icon"><iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${stats.countRetard}</div>
          <div class="kpi-label">En retard</div>
        </div>
        <div class="kpi-card ${stats.countUrgent > 0 ? 'yellow' : ''}">
          <div class="kpi-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${stats.countUrgent}</div>
          <div class="kpi-label">Urgentes</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${stats.countAVenir}</div>
          <div class="kpi-label">&Agrave; venir</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatNumber(stats.totalCout)}<span style="font-size:var(--font-size-xs);color:var(--text-muted)"> FCFA</span></div>
          <div class="kpi-label">Co&ucirc;t estim&eacute; total</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-grid" style="margin-bottom:var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:pie-chart-2-bold-duotone"></iconify-icon> R&eacute;partition par statut</div>
          </div>
          <div class="chart-container" style="height:250px;">
            <canvas id="chart-maint-statut"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Par type de maintenance</div>
          </div>
          <div class="chart-container" style="height:250px;">
            <canvas id="chart-maint-type"></canvas>
          </div>
        </div>
      </div>

      <!-- Filtre -->
      <div class="card" style="margin-bottom:var(--space-md);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap;">
          <span style="font-size:var(--font-size-sm);font-weight:600;color:var(--text-muted);">Filtrer :</span>
          <button class="btn btn-sm maint-filter active" data-filter="all">Toutes (${maintenances.length})</button>
          <button class="btn btn-sm maint-filter" data-filter="en_retard" style="color:#ef4444;">En retard (${stats.countRetard})</button>
          <button class="btn btn-sm maint-filter" data-filter="urgent" style="color:#f59e0b;">Urgentes (${stats.countUrgent})</button>
          <button class="btn btn-sm maint-filter" data-filter="a_venir" style="color:#3b82f6;">&Agrave; venir (${stats.countAVenir})</button>
          <button class="btn btn-sm maint-filter" data-filter="terminee" style="color:#22c55e;">Termin&eacute;es (${stats.countComplete})</button>
        </div>
      </div>

      <!-- Tableau -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:list-bold-duotone"></iconify-icon> Toutes les maintenances (${maintenances.length})</span>
          <span style="font-size:var(--font-size-xs);color:var(--text-muted);">${stats.vehiculesAvecMaint}/${stats.totalVehicules} v&eacute;hicules concern&eacute;s</span>
        </div>
        <div id="maintenances-table"></div>
      </div>
    `;
  },

  _bindMaintenanceEvents(maintenances) {
    const typeLabels = {
      vidange: 'Vidange', revision: 'Revision', pneus: 'Pneus', freins: 'Freins',
      filtres: 'Filtres', climatisation: 'Climatisation', courroie: 'Courroie',
      controle_technique: 'Controle technique', batterie: 'Batterie',
      amortisseurs: 'Amortisseurs', echappement: 'Echappement',
      carrosserie: 'Carrosserie', autre: 'Autre'
    };

    const statutLabels = {
      en_retard: '<iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon> En retard',
      urgent: '<iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Urgent',
      a_venir: '<iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> A venir',
      terminee: '<iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Terminee'
    };

    let currentFilter = 'all';

    const renderTable = (filter) => {
      const filtered = filter === 'all' ? maintenances : maintenances.filter(m => m.statut === filter);

      Table.create({
        containerId: 'maintenances-table',
        columns: [
          {
            label: 'Statut', key: 'statut',
            render: (m) => `<span class="maint-statut-badge ${m.statut}">${statutLabels[m.statut] || m.statut}</span>`
          },
          {
            label: 'Type', key: 'type',
            render: (m) => `<span style="font-weight:600;">${typeLabels[m.type] || m.type}</span>${m.label ? `<br><span style="font-size:var(--font-size-xs);color:var(--text-muted);">${m.label}</span>` : ''}`
          },
          {
            label: 'Vehicule', key: 'vehiculeLabel',
            render: (m) => `<span style="font-weight:500;">${m.vehiculeLabel}</span><br><span style="font-size:var(--font-size-xs);color:var(--text-muted);">${m.immatriculation}</span>`
          },
          {
            label: 'Chauffeur', key: 'chauffeurNom',
            render: (m) => m.chauffeurNom
              ? `<a href="#/chauffeurs/${m.chauffeurId}" style="color:var(--volt-blue);text-decoration:none;">${m.chauffeurNom}</a>`
              : '<span style="color:var(--text-muted);font-style:italic;">Non assigne</span>'
          },
          {
            label: 'Echeance', key: 'prochaineDate',
            render: (m) => {
              let html = '';
              if (m.prochaineDate) {
                const jours = Math.ceil((new Date(m.prochaineDate) - new Date()) / 86400000);
                const color = jours < 0 ? '#ef4444' : jours <= 7 ? '#f59e0b' : 'var(--text-primary)';
                html += `<span style="color:${color};font-weight:500;">${Utils.formatDate(m.prochaineDate)}</span>`;
                if (jours < 0) html += `<br><span style="font-size:var(--font-size-xs);color:#ef4444;font-weight:600;">${Math.abs(jours)}j de retard</span>`;
                else if (jours === 0) html += `<br><span style="font-size:var(--font-size-xs);color:#f59e0b;font-weight:600;">Aujourd'hui</span>`;
                else if (jours <= 7) html += `<br><span style="font-size:var(--font-size-xs);color:#f59e0b;">dans ${jours}j</span>`;
              }
              if (m.prochainKm && m.kilometrage) {
                const diff = m.prochainKm - m.kilometrage;
                const color = diff < 0 ? '#ef4444' : diff <= 500 ? '#f59e0b' : 'var(--text-muted)';
                html += `${html ? '<br>' : ''}<span style="font-size:var(--font-size-xs);color:${color};">${m.prochainKm.toLocaleString('fr-FR')} km ${diff < 0 ? '(' + Math.abs(diff).toLocaleString('fr-FR') + ' km depasse)' : '(dans ' + diff.toLocaleString('fr-FR') + ' km)'}</span>`;
              }
              return html || '<span style="color:var(--text-muted);">-</span>';
            }
          },
          {
            label: 'Cout estime', key: 'coutEstime',
            render: (m) => m.coutEstime ? `${m.coutEstime.toLocaleString('fr-FR')} FCFA` : '-',
            value: (m) => m.coutEstime || 0
          },
          {
            label: 'Prestataire', key: 'prestataire',
            render: (m) => m.prestataire || '<span style="color:var(--text-muted);">-</span>'
          }
        ],
        data: filtered,
        pageSize: 15,
        onRowClick: (id) => {
          const maint = maintenances.find(m => m.id === id);
          if (maint) Router.navigate(`/vehicules/${maint.vehiculeId}`);
        },
        actions: (m) => `
          <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Router.navigate('/vehicules/${m.vehiculeId}')" title="Voir vehicule">
            <iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon>
          </button>
        `
      });
    };

    renderTable('all');

    // Filtres
    document.querySelectorAll('.maint-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.maint-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderTable(currentFilter);
      });
    });
  },

  _loadMaintenanceCharts(maintenances) {
    // Repartition par statut
    const statutCtx = document.getElementById('chart-maint-statut');
    if (statutCtx) {
      const countByStatut = {
        en_retard: maintenances.filter(m => m.statut === 'en_retard').length,
        urgent: maintenances.filter(m => m.statut === 'urgent').length,
        a_venir: maintenances.filter(m => m.statut === 'a_venir').length,
        terminee: maintenances.filter(m => m.statut === 'terminee').length
      };
      this._charts.push(new Chart(statutCtx, {
        type: 'doughnut',
        data: {
          labels: ['En retard', 'Urgentes', 'A venir', 'Terminees'],
          datasets: [{
            data: [countByStatut.en_retard, countByStatut.urgent, countByStatut.a_venir, countByStatut.terminee],
            backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } }
          }
        }
      }));
    }

    // Par type de maintenance
    const typeCtx = document.getElementById('chart-maint-type');
    if (typeCtx) {
      const typeLabels = {
        vidange: 'Vidange', revision: 'Revision', pneus: 'Pneus', freins: 'Freins',
        filtres: 'Filtres', climatisation: 'Clim.', courroie: 'Courroie',
        controle_technique: 'CT', batterie: 'Batterie', amortisseurs: 'Amort.',
        echappement: 'Echap.', carrosserie: 'Carros.', autre: 'Autre'
      };
      const typeCounts = {};
      maintenances.forEach(m => {
        const key = m.type || 'autre';
        typeCounts[key] = (typeCounts[key] || 0) + 1;
      });

      const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
      const labels = sortedTypes.map(([k]) => typeLabels[k] || k);
      const data = sortedTypes.map(([, v]) => v);

      const colors = sortedTypes.map(([type]) => {
        const ofType = maintenances.filter(m => m.type === type);
        if (ofType.some(m => m.statut === 'en_retard')) return '#ef4444';
        if (ofType.some(m => m.statut === 'urgent')) return '#f59e0b';
        return '#3b82f6';
      });

      this._charts.push(new Chart(typeCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Maintenances',
            data,
            backgroundColor: colors,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (item) => `${item.parsed.x} maintenance${item.parsed.x > 1 ? 's' : ''}`
              }
            }
          },
          scales: {
            x: { beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      }));
    }
  }
};
