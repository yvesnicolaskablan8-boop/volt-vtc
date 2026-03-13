/**
 * GaragePage — Module Garage avec onglets (Maintenance, Reparations, CT, Assurances, TCO)
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
        <div class="page-actions" style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-outline" onclick="GaragePage._updateKmModal()" title="Mettre \u00e0 jour le kilom\u00e9trage">
            <iconify-icon icon="solar:route-bold-duotone"></iconify-icon> Maj km
          </button>
        </div>
      </div>

      <div class="garage-tabs" style="display:flex;gap:0;margin-bottom:var(--space-lg);border-bottom:2px solid var(--border-color);overflow-x:auto;">
        <button class="garage-tab ${this._activeTab === 'maintenance' ? 'active' : ''}" data-tab="maintenance">
          <iconify-icon icon="solar:tuning-2-bold-duotone"></iconify-icon> Maintenance
        </button>
        <button class="garage-tab ${this._activeTab === 'reparations' ? 'active' : ''}" data-tab="reparations">
          <iconify-icon icon="solar:wrench-bold-duotone"></iconify-icon> R&eacute;parations
        </button>
        <button class="garage-tab ${this._activeTab === 'ct' ? 'active' : ''}" data-tab="ct">
          <iconify-icon icon="solar:clipboard-check-bold-duotone"></iconify-icon> Contr&ocirc;le technique
        </button>
        <button class="garage-tab ${this._activeTab === 'assurances' ? 'active' : ''}" data-tab="assurances">
          <iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon> Assurances
        </button>
        <button class="garage-tab ${this._activeTab === 'tco' ? 'active' : ''}" data-tab="tco">
          <iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> TCO
        </button>
      </div>

      <div id="garage-tab-content"></div>

      <style>
        .garage-tab { background:none;border:none;padding:10px 20px;cursor:pointer;font-size:var(--font-size-sm);font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;gap:6px;white-space:nowrap; }
        .garage-tab:hover { color:var(--text-primary);background:var(--bg-secondary);border-radius:var(--radius-md) var(--radius-md) 0 0; }
        .garage-tab.active { color:var(--pilote-orange);border-bottom-color:var(--pilote-orange); }
        .maint-filter { background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:4px 12px;cursor:pointer;font-size:var(--font-size-xs);transition:all 0.2s; }
        .maint-filter.active { background:var(--pilote-blue);color:white !important;border-color:var(--pilote-blue); }
        .maint-filter:hover:not(.active) { background:var(--bg-secondary); }
        .maint-statut-badge { display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600; }
        .maint-statut-badge.en_retard, .maint-statut-badge.expire { background:rgba(239,68,68,0.12);color:#ef4444; }
        .maint-statut-badge.urgent, .maint-statut-badge.bientot { background:rgba(245,158,11,0.12);color:#f59e0b; }
        .maint-statut-badge.a_venir, .maint-statut-badge.valide { background:rgba(59,130,246,0.1);color:#3b82f6; }
        .maint-statut-badge.terminee, .maint-statut-badge.favorable, .maint-statut-badge.a_jour { background:rgba(34,197,94,0.1);color:#22c55e; }
        .maint-statut-badge.en_cours { background:rgba(59,130,246,0.1);color:#3b82f6; }
        .maint-statut-badge.defavorable, .maint-statut-badge.contre_visite { background:rgba(239,68,68,0.12);color:#ef4444; }
      </style>
    `;
  },

  _bindTabEvents() {
    document.querySelectorAll('.garage-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.garage-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeTab = tab.dataset.tab;
        this._charts.forEach(c => c.destroy());
        this._charts = [];
        this._renderTab(this._activeTab);
      });
    });
  },

  _renderTab(tab) {
    const content = document.getElementById('garage-tab-content');
    if (!content) return;
    if (tab === 'maintenance') this._renderMaintenanceTab(content);
    else if (tab === 'reparations') this._renderReparationsTab(content);
    else if (tab === 'ct') this._renderCTTab(content);
    else if (tab === 'assurances') this._renderAssurancesTab(content);
    else if (tab === 'tco') this._renderTCOTab(content);
  },

  _vLabel(v) { return `${v.marque} ${v.modele} (${v.immatriculation})`; },

  // =================== ONGLET MAINTENANCE ===================

  _renderMaintenanceTab(container) {
    const vehicules = Store.get('vehicules').filter(v => v.statut === 'en_service');
    const chauffeurs = Store.get('chauffeurs');
    const allMaintenances = [];
    vehicules.forEach(v => {
      if (!v.maintenancesPlanifiees || v.maintenancesPlanifiees.length === 0) return;
      const chauffeur = chauffeurs.find(c => c.vehiculeAssigne === v.id);
      v.maintenancesPlanifiees.forEach(m => {
        allMaintenances.push({ ...m, vehiculeId: v.id, vehiculeLabel: `${v.marque} ${v.modele}`, immatriculation: v.immatriculation, kilometrage: v.kilometrage, chauffeurNom: chauffeur ? `${chauffeur.prenom} ${chauffeur.nom}` : null, chauffeurId: chauffeur ? chauffeur.id : null });
      });
    });
    const ordre = { en_retard: 0, urgent: 1, a_venir: 2, terminee: 3 };
    allMaintenances.sort((a, b) => (ordre[a.statut] || 9) - (ordre[b.statut] || 9));
    const countRetard = allMaintenances.filter(m => m.statut === 'en_retard').length;
    const countUrgent = allMaintenances.filter(m => m.statut === 'urgent').length;
    const countAVenir = allMaintenances.filter(m => m.statut === 'a_venir').length;
    const countComplete = allMaintenances.filter(m => m.statut === 'terminee').length;
    const totalCout = allMaintenances.filter(m => m.statut !== 'terminee').reduce((s, m) => s + (m.coutEstime || 0), 0);
    const vehiculesAvecMaint = new Set(allMaintenances.map(m => m.vehiculeId)).size;

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-md);">
        <div class="badge ${countRetard > 0 ? 'badge-danger' : countUrgent > 0 ? 'badge-warning' : 'badge-success'}" style="padding:6px 12px;font-size:var(--font-size-sm);">
          ${countRetard > 0 ? `<iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon> ${countRetard} en retard` : countUrgent > 0 ? `<iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> ${countUrgent} urgentes` : '<iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Flotte OK'}
        </div>
      </div>
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card ${countRetard > 0 ? 'red' : ''}"><div class="kpi-icon"><iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${countRetard}</div><div class="kpi-label">En retard</div></div>
        <div class="kpi-card ${countUrgent > 0 ? 'yellow' : ''}"><div class="kpi-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div><div class="kpi-value">${countUrgent}</div><div class="kpi-label">Urgentes</div></div>
        <div class="kpi-card cyan"><div class="kpi-icon"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${countAVenir}</div><div class="kpi-label">&Agrave; venir</div></div>
        <div class="kpi-card green"><div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div><div class="kpi-value">${Utils.formatNumber(totalCout)}<span style="font-size:var(--font-size-xs);color:var(--text-muted)"> FCFA</span></div><div class="kpi-label">Co&ucirc;t estim&eacute;</div></div>
      </div>
      <div class="charts-grid" style="margin-bottom:var(--space-lg);">
        <div class="chart-card"><div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:pie-chart-2-bold-duotone"></iconify-icon> Par statut</div></div><div class="chart-container" style="height:250px;"><canvas id="chart-maint-statut"></canvas></div></div>
        <div class="chart-card"><div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Par type</div></div><div class="chart-container" style="height:250px;"><canvas id="chart-maint-type"></canvas></div></div>
      </div>
      <div class="card" style="margin-bottom:var(--space-md);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap;">
          <span style="font-size:var(--font-size-sm);font-weight:600;color:var(--text-muted);">Filtrer :</span>
          <button class="btn btn-sm maint-filter active" data-filter="all">Toutes (${allMaintenances.length})</button>
          <button class="btn btn-sm maint-filter" data-filter="en_retard" style="color:#ef4444;">En retard (${countRetard})</button>
          <button class="btn btn-sm maint-filter" data-filter="urgent" style="color:#f59e0b;">Urgentes (${countUrgent})</button>
          <button class="btn btn-sm maint-filter" data-filter="a_venir" style="color:#3b82f6;">&Agrave; venir (${countAVenir})</button>
          <button class="btn btn-sm maint-filter" data-filter="terminee" style="color:#22c55e;">Termin&eacute;es (${countComplete})</button>
        </div>
      </div>
      <div class="card"><div class="card-header"><span class="card-title"><iconify-icon icon="solar:list-bold-duotone"></iconify-icon> Maintenances (${allMaintenances.length})</span><span style="font-size:var(--font-size-xs);color:var(--text-muted);">${vehiculesAvecMaint}/${vehicules.length} v&eacute;hicules</span></div><div id="maintenances-table"></div></div>
    `;
    this._bindMaintenanceEvents(allMaintenances);
    this._loadMaintenanceCharts(allMaintenances);
  },

  _bindMaintenanceEvents(maintenances) {
    const typeLabels = { vidange:'Vidange', revision:'Revision', pneus:'Pneus', freins:'Freins', filtres:'Filtres', climatisation:'Climatisation', courroie:'Courroie', controle_technique:'CT', batterie:'Batterie', amortisseurs:'Amortisseurs', echappement:'Echappement', carrosserie:'Carrosserie', autre:'Autre' };
    const statutLabels = { en_retard:'<iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon> En retard', urgent:'<iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Urgent', a_venir:'<iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> A venir', terminee:'<iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Terminee' };
    const renderTable = (filter) => {
      const filtered = filter === 'all' ? maintenances : maintenances.filter(m => m.statut === filter);
      Table.create({
        containerId: 'maintenances-table', data: filtered, pageSize: 15,
        columns: [
          { label:'Statut', key:'statut', render:(m) => `<span class="maint-statut-badge ${m.statut}">${statutLabels[m.statut] || m.statut}</span>` },
          { label:'Type', key:'type', render:(m) => `<span style="font-weight:600;">${typeLabels[m.type] || m.type}</span>${m.label ? `<br><span style="font-size:var(--font-size-xs);color:var(--text-muted);">${m.label}</span>` : ''}` },
          { label:'V\u00e9hicule', key:'vehiculeLabel', render:(m) => `<span style="font-weight:500;">${m.vehiculeLabel}</span><br><span style="font-size:var(--font-size-xs);color:var(--text-muted);">${m.immatriculation}</span>` },
          { label:'Chauffeur', key:'chauffeurNom', render:(m) => m.chauffeurNom ? `<a href="#/chauffeurs/${m.chauffeurId}" style="color:var(--pilote-blue);text-decoration:none;">${m.chauffeurNom}</a>` : '<span style="color:var(--text-muted);font-style:italic;">-</span>' },
          { label:'\u00c9ch\u00e9ance', key:'prochaineDate', render:(m) => { let h=''; if(m.prochaineDate){ const j=Math.ceil((new Date(m.prochaineDate)-new Date())/86400000); const c=j<0?'#ef4444':j<=7?'#f59e0b':'var(--text-primary)'; h+=`<span style="color:${c};font-weight:500;">${Utils.formatDate(m.prochaineDate)}</span>`; if(j<0)h+=`<br><span style="font-size:var(--font-size-xs);color:#ef4444;font-weight:600;">${Math.abs(j)}j retard</span>`; else if(j<=7)h+=`<br><span style="font-size:var(--font-size-xs);color:#f59e0b;">dans ${j}j</span>`; } return h||'-'; } },
          { label:'Co\u00fbt', key:'coutEstime', render:(m) => m.coutEstime ? `${m.coutEstime.toLocaleString('fr-FR')} F` : '-', value:(m) => m.coutEstime||0 }
        ],
        onRowClick:(id) => { const m=maintenances.find(x=>x.id===id); if(m) Router.navigate(`/vehicules/${m.vehiculeId}`); },
        actions:(m) => `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();Router.navigate('/vehicules/${m.vehiculeId}')" title="Voir"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon></button>`
      });
    };
    renderTable('all');
    document.querySelectorAll('.maint-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.maint-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTable(btn.dataset.filter);
      });
    });
  },

  _loadMaintenanceCharts(maintenances) {
    const ctx1 = document.getElementById('chart-maint-statut');
    if (ctx1) {
      const c = { en_retard: maintenances.filter(m=>m.statut==='en_retard').length, urgent: maintenances.filter(m=>m.statut==='urgent').length, a_venir: maintenances.filter(m=>m.statut==='a_venir').length, terminee: maintenances.filter(m=>m.statut==='terminee').length };
      this._charts.push(new Chart(ctx1, { type:'doughnut', data:{ labels:['En retard','Urgentes','A venir','Terminees'], datasets:[{ data:[c.en_retard,c.urgent,c.a_venir,c.terminee], backgroundColor:['#ef4444','#f59e0b','#3b82f6','#22c55e'], borderWidth:0 }] }, options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, padding:12 } } } } }));
    }
    const ctx2 = document.getElementById('chart-maint-type');
    if (ctx2) {
      const tl = { vidange:'Vidange',revision:'Revision',pneus:'Pneus',freins:'Freins',filtres:'Filtres',climatisation:'Clim.',courroie:'Courroie',controle_technique:'CT',batterie:'Batterie',amortisseurs:'Amort.',echappement:'Echap.',carrosserie:'Carros.',autre:'Autre' };
      const tc = {}; maintenances.forEach(m => { const k=m.type||'autre'; tc[k]=(tc[k]||0)+1; });
      const sorted = Object.entries(tc).sort((a,b) => b[1]-a[1]);
      const colors = sorted.map(([t]) => { const of2=maintenances.filter(m=>m.type===t); if(of2.some(m=>m.statut==='en_retard'))return '#ef4444'; if(of2.some(m=>m.statut==='urgent'))return '#f59e0b'; return '#3b82f6'; });
      this._charts.push(new Chart(ctx2, { type:'bar', data:{ labels:sorted.map(([k])=>tl[k]||k), datasets:[{ label:'Maintenances', data:sorted.map(([,v])=>v), backgroundColor:colors, borderRadius:4 }] }, options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{ legend:{display:false} }, scales:{ x:{beginAtZero:true,ticks:{stepSize:1}} } } }));
    }
  },

  // =================== ONGLET REPARATIONS ===================

  _renderReparationsTab(container) {
    const reparations = Store.get('reparations') || [];
    const vehicules = Store.get('vehicules') || [];
    const now = new Date();
    const moisActuel = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const repMois = reparations.filter(r => (r.date||'').startsWith(moisActuel));
    const totalMois = repMois.reduce((s,r) => s + (r.coutReel||0), 0);
    const enCours = reparations.filter(r => r.statut === 'en_cours').length;
    // Duree moyenne immobilisation
    const avecDuree = reparations.filter(r => r.date && r.dateFinImmobilisation);
    const dureeMoy = avecDuree.length > 0 ? Math.round(avecDuree.reduce((s,r) => s + Math.ceil((new Date(r.dateFinImmobilisation) - new Date(r.date)) / 86400000), 0) / avecDuree.length) : 0;

    const typeLabels = { mecanique:'M\u00e9canique', carrosserie:'Carrosserie', electricite:'\u00c9lectricit\u00e9', pneumatique:'Pneumatique', climatisation:'Climatisation', freinage:'Freinage', transmission:'Transmission', autre:'Autre' };
    const vOpts = vehicules.map(v => `<option value="${v.id}">${this._vLabel(v)}</option>`).join('');
    const tOpts = Object.entries(typeLabels).map(([k,v]) => `<option value="${k}">${v}</option>`).join('');

    container.innerHTML = `
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card orange"><div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div><div class="kpi-value">${Utils.formatNumber(totalMois)}<span style="font-size:var(--font-size-xs);color:var(--text-muted)"> FCFA</span></div><div class="kpi-label">Co\u00fbt ce mois</div></div>
        <div class="kpi-card cyan"><div class="kpi-icon"><iconify-icon icon="solar:wrench-bold-duotone"></iconify-icon></div><div class="kpi-value">${repMois.length}</div><div class="kpi-label">Interventions ce mois</div></div>
        <div class="kpi-card ${enCours > 0 ? 'yellow' : ''}"><div class="kpi-icon"><iconify-icon icon="solar:hourglass-bold-duotone"></iconify-icon></div><div class="kpi-value">${enCours}</div><div class="kpi-label">En cours</div></div>
        <div class="kpi-card"><div class="kpi-icon"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${dureeMoy}<span style="font-size:var(--font-size-xs);color:var(--text-muted)"> j</span></div><div class="kpi-label">Dur\u00e9e moy. immob.</div></div>
      </div>
      <div class="card" style="margin-bottom:var(--space-md);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap;">
          <select id="rep-filter-vehicule" class="form-control" style="width:200px;font-size:var(--font-size-xs);"><option value="">Tous les v\u00e9hicules</option>${vOpts}</select>
          <select id="rep-filter-type" class="form-control" style="width:150px;font-size:var(--font-size-xs);"><option value="">Tous les types</option>${tOpts}</select>
          <button class="btn btn-primary btn-sm" onclick="GaragePage._addReparation()"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Ajouter</button>
        </div>
      </div>
      <div class="card"><div class="card-header"><span class="card-title"><iconify-icon icon="solar:wrench-bold-duotone"></iconify-icon> R\u00e9parations (${reparations.length})</span></div><div id="reparations-table"></div></div>
    `;
    this._renderRepTable(reparations, vehicules, typeLabels);
    document.getElementById('rep-filter-vehicule').addEventListener('change', () => this._filterRep(reparations, vehicules, typeLabels));
    document.getElementById('rep-filter-type').addEventListener('change', () => this._filterRep(reparations, vehicules, typeLabels));
  },

  _filterRep(reparations, vehicules, typeLabels) {
    const fv = document.getElementById('rep-filter-vehicule').value;
    const ft = document.getElementById('rep-filter-type').value;
    let filtered = reparations;
    if (fv) filtered = filtered.filter(r => r.vehiculeId === fv);
    if (ft) filtered = filtered.filter(r => r.type === ft);
    this._renderRepTable(filtered, vehicules, typeLabels);
  },

  _renderRepTable(data, vehicules, typeLabels) {
    Table.create({
      containerId: 'reparations-table', data: data.sort((a,b) => (b.date||'').localeCompare(a.date||'')), pageSize: 15,
      columns: [
        { label:'Date', key:'date', render:(r) => Utils.formatDate(r.date) },
        { label:'V\u00e9hicule', key:'vehiculeId', render:(r) => { const v=vehicules.find(x=>x.id===r.vehiculeId); return v ? `<span style="font-weight:500;">${v.marque} ${v.modele}</span><br><span style="font-size:var(--font-size-xs);color:var(--text-muted);">${v.immatriculation}</span>` : r.vehiculeId; } },
        { label:'Type', key:'type', render:(r) => `<span style="font-weight:600;">${typeLabels[r.type]||r.type}</span>` },
        { label:'Description', key:'description', render:(r) => `<span style="max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.description}</span>` },
        { label:'Prestataire', key:'prestataire', render:(r) => r.prestataire || '-' },
        { label:'Co\u00fbt estim\u00e9', key:'coutEstime', render:(r) => r.coutEstime ? `${r.coutEstime.toLocaleString('fr-FR')} F` : '-', value:(r)=>r.coutEstime||0 },
        { label:'Co\u00fbt r\u00e9el', key:'coutReel', render:(r) => `<span style="font-weight:600;color:${r.coutReel > (r.coutEstime||Infinity) ? '#ef4444' : 'var(--text-primary)'};">${r.coutReel.toLocaleString('fr-FR')} F</span>`, value:(r)=>r.coutReel||0 },
        { label:'Statut', key:'statut', render:(r) => `<span class="maint-statut-badge ${r.statut}">${r.statut === 'en_cours' ? 'En cours' : 'Termin\u00e9e'}</span>` }
      ],
      actions:(r) => `
        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();GaragePage._editReparation('${r.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();GaragePage._deleteReparation('${r.id}')" title="Supprimer" style="color:#ef4444;"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
      `
    });
  },

  _addReparation() {
    const vehicules = Store.get('vehicules') || [];
    const vOpts = vehicules.map(v => `<option value="${v.id}">${this._vLabel(v)}</option>`).join('');
    const typeLabels = { mecanique:'M\u00e9canique', carrosserie:'Carrosserie', electricite:'\u00c9lectricit\u00e9', pneumatique:'Pneumatique', climatisation:'Climatisation', freinage:'Freinage', transmission:'Transmission', autre:'Autre' };
    const tOpts = Object.entries(typeLabels).map(([k,v]) => `<option value="${k}">${v}</option>`).join('');
    Modal.form(
      '<iconify-icon icon="solar:wrench-bold-duotone"></iconify-icon> Nouvelle r\u00e9paration',
      `<form id="form-rep" class="modal-form">
        <div class="form-group"><label>V\u00e9hicule *</label><select name="vehiculeId" class="form-control" required><option value="">Choisir...</option>${vOpts}</select></div>
        <div class="form-row"><div class="form-group"><label>Date intervention *</label><input type="date" name="date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required></div><div class="form-group"><label>Fin immobilisation</label><input type="date" name="dateFinImmobilisation" class="form-control"></div></div>
        <div class="form-row"><div class="form-group"><label>Type *</label><select name="type" class="form-control" required>${tOpts}</select></div><div class="form-group"><label>Statut</label><select name="statut" class="form-control"><option value="terminee">Termin\u00e9e</option><option value="en_cours">En cours</option></select></div></div>
        <div class="form-group"><label>Description *</label><textarea name="description" class="form-control" rows="2" required></textarea></div>
        <div class="form-group"><label>Prestataire</label><input type="text" name="prestataire" class="form-control" placeholder="Nom du garage..."></div>
        <div class="form-row"><div class="form-group"><label>Co\u00fbt estim\u00e9 (FCFA)</label><input type="number" name="coutEstime" class="form-control" min="0"></div><div class="form-group"><label>Co\u00fbt r\u00e9el (FCFA) *</label><input type="number" name="coutReel" class="form-control" min="0" required></div></div>
        <div class="form-row"><div class="form-group"><label>Kilom\u00e9trage</label><input type="number" name="kilometrage" class="form-control" min="0"></div><div class="form-group"><label>Pi\u00e8ces utilis\u00e9es</label><input type="text" name="pieces" class="form-control" placeholder="Filtre, plaquettes..."></div></div>
        <div class="form-group"><label>Commentaire</label><textarea name="commentaire" class="form-control" rows="2"></textarea></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-rep'));
        const item = {
          id: 'REP-' + Math.random().toString(36).substr(2,6).toUpperCase(),
          vehiculeId: fd.get('vehiculeId'), date: fd.get('date'), dateFinImmobilisation: fd.get('dateFinImmobilisation') || '',
          type: fd.get('type'), description: fd.get('description'), prestataire: fd.get('prestataire') || '',
          coutEstime: parseFloat(fd.get('coutEstime')) || 0, coutReel: parseFloat(fd.get('coutReel')) || 0,
          pieces: fd.get('pieces') || '', kilometrage: parseInt(fd.get('kilometrage')) || 0,
          commentaire: fd.get('commentaire') || '', statut: fd.get('statut'),
          dateCreation: new Date().toISOString()
        };
        Store.add('reparations', item);
        Modal.close(); Toast.show('R\u00e9paration ajout\u00e9e', 'success');
        this._renderReparationsTab(document.getElementById('garage-tab-content'));
      }
    );
  },

  _editReparation(id) {
    const r = (Store.get('reparations') || []).find(x => x.id === id);
    if (!r) return;
    const vehicules = Store.get('vehicules') || [];
    const vOpts = vehicules.map(v => `<option value="${v.id}" ${v.id===r.vehiculeId?'selected':''}>${this._vLabel(v)}</option>`).join('');
    const types = { mecanique:'M\u00e9canique', carrosserie:'Carrosserie', electricite:'\u00c9lectricit\u00e9', pneumatique:'Pneumatique', climatisation:'Climatisation', freinage:'Freinage', transmission:'Transmission', autre:'Autre' };
    const tOpts = Object.entries(types).map(([k,v]) => `<option value="${k}" ${k===r.type?'selected':''}>${v}</option>`).join('');
    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier r\u00e9paration',
      `<form id="form-rep-edit" class="modal-form">
        <div class="form-group"><label>V\u00e9hicule *</label><select name="vehiculeId" class="form-control" required>${vOpts}</select></div>
        <div class="form-row"><div class="form-group"><label>Date *</label><input type="date" name="date" class="form-control" value="${r.date||''}" required></div><div class="form-group"><label>Fin immobilisation</label><input type="date" name="dateFinImmobilisation" class="form-control" value="${r.dateFinImmobilisation||''}"></div></div>
        <div class="form-row"><div class="form-group"><label>Type *</label><select name="type" class="form-control" required>${tOpts}</select></div><div class="form-group"><label>Statut</label><select name="statut" class="form-control"><option value="terminee" ${r.statut==='terminee'?'selected':''}>Termin\u00e9e</option><option value="en_cours" ${r.statut==='en_cours'?'selected':''}>En cours</option></select></div></div>
        <div class="form-group"><label>Description *</label><textarea name="description" class="form-control" rows="2" required>${r.description||''}</textarea></div>
        <div class="form-group"><label>Prestataire</label><input type="text" name="prestataire" class="form-control" value="${r.prestataire||''}"></div>
        <div class="form-row"><div class="form-group"><label>Co\u00fbt estim\u00e9</label><input type="number" name="coutEstime" class="form-control" value="${r.coutEstime||''}" min="0"></div><div class="form-group"><label>Co\u00fbt r\u00e9el *</label><input type="number" name="coutReel" class="form-control" value="${r.coutReel||''}" min="0" required></div></div>
        <div class="form-row"><div class="form-group"><label>Kilom\u00e9trage</label><input type="number" name="kilometrage" class="form-control" value="${r.kilometrage||''}" min="0"></div><div class="form-group"><label>Pi\u00e8ces</label><input type="text" name="pieces" class="form-control" value="${r.pieces||''}"></div></div>
        <div class="form-group"><label>Commentaire</label><textarea name="commentaire" class="form-control" rows="2">${r.commentaire||''}</textarea></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-rep-edit'));
        Store.update('reparations', id, {
          vehiculeId: fd.get('vehiculeId'), date: fd.get('date'), dateFinImmobilisation: fd.get('dateFinImmobilisation') || '',
          type: fd.get('type'), description: fd.get('description'), prestataire: fd.get('prestataire') || '',
          coutEstime: parseFloat(fd.get('coutEstime')) || 0, coutReel: parseFloat(fd.get('coutReel')) || 0,
          pieces: fd.get('pieces') || '', kilometrage: parseInt(fd.get('kilometrage')) || 0,
          commentaire: fd.get('commentaire') || '', statut: fd.get('statut')
        });
        Modal.close(); Toast.show('R\u00e9paration modifi\u00e9e', 'success');
        this._renderReparationsTab(document.getElementById('garage-tab-content'));
      }
    );
  },

  _deleteReparation(id) {
    if (!confirm('Supprimer cette r\u00e9paration ?')) return;
    Store.delete('reparations', id);
    Toast.show('R\u00e9paration supprim\u00e9e', 'success');
    this._renderReparationsTab(document.getElementById('garage-tab-content'));
  },

  // =================== ONGLET CONTROLE TECHNIQUE ===================

  _renderCTTab(container) {
    const cts = Store.get('controlesTechniques') || [];
    const vehicules = Store.get('vehicules') || [];
    const today = new Date().toISOString().split('T')[0];
    const dans30j = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];

    // Statut CT par vehicule : dernier CT pour chaque vehicule
    const lastCTMap = {};
    cts.forEach(ct => {
      if (!lastCTMap[ct.vehiculeId] || ct.date > lastCTMap[ct.vehiculeId].date) lastCTMap[ct.vehiculeId] = ct;
    });

    let expired = 0, soon = 0, ok = 0, noCT = 0;
    vehicules.filter(v => v.statut === 'en_service').forEach(v => {
      const last = lastCTMap[v.id];
      if (!last) { noCT++; return; }
      if (last.dateExpiration < today) expired++;
      else if (last.dateExpiration <= dans30j) soon++;
      else ok++;
    });

    const vOpts = vehicules.map(v => `<option value="${v.id}">${this._vLabel(v)}</option>`).join('');

    container.innerHTML = `
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card ${expired > 0 ? 'red' : ''}"><div class="kpi-icon"><iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${expired}</div><div class="kpi-label">CT expir\u00e9s</div></div>
        <div class="kpi-card ${soon > 0 ? 'yellow' : ''}"><div class="kpi-icon"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${soon}</div><div class="kpi-label">Expire &lt; 30j</div></div>
        <div class="kpi-card green"><div class="kpi-icon"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${ok}</div><div class="kpi-label">&Agrave; jour</div></div>
        <div class="kpi-card"><div class="kpi-icon"><iconify-icon icon="solar:question-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${noCT}</div><div class="kpi-label">Sans CT</div></div>
      </div>

      <!-- Statut par vehicule -->
      <div class="card" style="margin-bottom:var(--space-lg);">
        <div class="card-header"><span class="card-title"><iconify-icon icon="solar:clipboard-check-bold-duotone"></iconify-icon> Statut CT par v\u00e9hicule</span>
          <button class="btn btn-primary btn-sm" onclick="GaragePage._addCT()"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Enregistrer un CT</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;padding:var(--space-sm);">
          ${vehicules.filter(v => v.statut === 'en_service').map(v => {
            const last = lastCTMap[v.id];
            let statut = 'Aucun CT', badge = 'expire', expDate = '-';
            if (last) {
              expDate = Utils.formatDate(last.dateExpiration);
              if (last.dateExpiration < today) { statut = 'Expir\u00e9'; badge = 'expire'; }
              else if (last.dateExpiration <= dans30j) { statut = 'Bient\u00f4t'; badge = 'bientot'; }
              else { statut = '\u00c0 jour'; badge = 'a_jour'; }
            }
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:var(--radius-sm);background:var(--bg-tertiary);">
              <div><span style="font-weight:500;">${v.marque} ${v.modele}</span> <span style="color:var(--text-muted);font-size:var(--font-size-xs);">${v.immatriculation}</span></div>
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:var(--font-size-xs);color:var(--text-muted);">Exp: ${expDate}</span>
                <span class="maint-statut-badge ${badge}">${statut}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Historique -->
      <div class="card"><div class="card-header"><span class="card-title">Historique des passages (${cts.length})</span></div><div id="ct-table"></div></div>
    `;

    Table.create({
      containerId: 'ct-table', data: cts.sort((a,b) => (b.date||'').localeCompare(a.date||'')), pageSize: 15,
      columns: [
        { label:'Date', key:'date', render:(c) => Utils.formatDate(c.date) },
        { label:'V\u00e9hicule', key:'vehiculeId', render:(c) => { const v=vehicules.find(x=>x.id===c.vehiculeId); return v ? `${v.marque} ${v.modele} <span style="color:var(--text-muted);font-size:var(--font-size-xs);">${v.immatriculation}</span>` : c.vehiculeId; } },
        { label:'R\u00e9sultat', key:'resultat', render:(c) => `<span class="maint-statut-badge ${c.resultat}">${c.resultat === 'favorable' ? 'Favorable' : c.resultat === 'defavorable' ? 'D\u00e9favorable' : 'Contre-visite'}</span>` },
        { label:'Centre', key:'centre', render:(c) => c.centre || '-' },
        { label:'Co\u00fbt', key:'cout', render:(c) => c.cout ? `${c.cout.toLocaleString('fr-FR')} F` : '-', value:(c)=>c.cout||0 },
        { label:'Expiration', key:'dateExpiration', render:(c) => { const exp=c.dateExpiration; if(!exp)return'-'; const color=exp<today?'#ef4444':exp<=dans30j?'#f59e0b':'var(--text-primary)'; return `<span style="color:${color};font-weight:500;">${Utils.formatDate(exp)}</span>`; } },
        { label:'Contre-visite', key:'contreVisiteDate', render:(c) => c.contreVisiteDate ? `${Utils.formatDate(c.contreVisiteDate)} ${c.contreVisiteResultat ? '('+c.contreVisiteResultat+')' : ''}` : '-' }
      ],
      actions:(c) => `
        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();GaragePage._editCT('${c.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();GaragePage._deleteCT('${c.id}')" title="Supprimer" style="color:#ef4444;"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
      `
    });
  },

  _addCT() {
    const vehicules = Store.get('vehicules') || [];
    const vOpts = vehicules.map(v => `<option value="${v.id}">${this._vLabel(v)}</option>`).join('');
    Modal.form(
      '<iconify-icon icon="solar:clipboard-check-bold-duotone"></iconify-icon> Enregistrer un CT',
      `<form id="form-ct" class="modal-form">
        <div class="form-group"><label>V\u00e9hicule *</label><select name="vehiculeId" class="form-control" required><option value="">Choisir...</option>${vOpts}</select></div>
        <div class="form-row"><div class="form-group"><label>Date du passage *</label><input type="date" name="date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required></div><div class="form-group"><label>Date d'expiration *</label><input type="date" name="dateExpiration" class="form-control" required></div></div>
        <div class="form-row"><div class="form-group"><label>R\u00e9sultat *</label><select name="resultat" class="form-control" required><option value="favorable">Favorable</option><option value="defavorable">D\u00e9favorable</option><option value="contre_visite">Contre-visite</option></select></div><div class="form-group"><label>Co\u00fbt (FCFA)</label><input type="number" name="cout" class="form-control" min="0"></div></div>
        <div class="form-group"><label>Centre de CT</label><input type="text" name="centre" class="form-control" placeholder="Nom du centre..."></div>
        <div class="form-group"><label>Observations</label><textarea name="observations" class="form-control" rows="2"></textarea></div>
        <div class="form-row"><div class="form-group"><label>Date contre-visite</label><input type="date" name="contreVisiteDate" class="form-control"></div><div class="form-group"><label>R\u00e9sultat contre-visite</label><select name="contreVisiteResultat" class="form-control"><option value="">-</option><option value="favorable">Favorable</option><option value="defavorable">D\u00e9favorable</option></select></div></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-ct'));
        Store.add('controlesTechniques', {
          id: 'CT-' + Math.random().toString(36).substr(2,6).toUpperCase(),
          vehiculeId: fd.get('vehiculeId'), date: fd.get('date'), dateExpiration: fd.get('dateExpiration'),
          resultat: fd.get('resultat'), centre: fd.get('centre') || '', cout: parseFloat(fd.get('cout')) || 0,
          observations: fd.get('observations') || '', contreVisiteDate: fd.get('contreVisiteDate') || '',
          contreVisiteResultat: fd.get('contreVisiteResultat') || '', dateCreation: new Date().toISOString()
        });
        Modal.close(); Toast.show('CT enregistr\u00e9', 'success');
        this._renderCTTab(document.getElementById('garage-tab-content'));
      }
    );
  },

  _editCT(id) {
    const c = (Store.get('controlesTechniques') || []).find(x => x.id === id);
    if (!c) return;
    const vehicules = Store.get('vehicules') || [];
    const vOpts = vehicules.map(v => `<option value="${v.id}" ${v.id===c.vehiculeId?'selected':''}>${this._vLabel(v)}</option>`).join('');
    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier CT',
      `<form id="form-ct-edit" class="modal-form">
        <div class="form-group"><label>V\u00e9hicule *</label><select name="vehiculeId" class="form-control" required>${vOpts}</select></div>
        <div class="form-row"><div class="form-group"><label>Date *</label><input type="date" name="date" class="form-control" value="${c.date||''}" required></div><div class="form-group"><label>Expiration *</label><input type="date" name="dateExpiration" class="form-control" value="${c.dateExpiration||''}" required></div></div>
        <div class="form-row"><div class="form-group"><label>R\u00e9sultat *</label><select name="resultat" class="form-control" required><option value="favorable" ${c.resultat==='favorable'?'selected':''}>Favorable</option><option value="defavorable" ${c.resultat==='defavorable'?'selected':''}>D\u00e9favorable</option><option value="contre_visite" ${c.resultat==='contre_visite'?'selected':''}>Contre-visite</option></select></div><div class="form-group"><label>Co\u00fbt</label><input type="number" name="cout" class="form-control" value="${c.cout||''}" min="0"></div></div>
        <div class="form-group"><label>Centre</label><input type="text" name="centre" class="form-control" value="${c.centre||''}"></div>
        <div class="form-group"><label>Observations</label><textarea name="observations" class="form-control" rows="2">${c.observations||''}</textarea></div>
        <div class="form-row"><div class="form-group"><label>Date contre-visite</label><input type="date" name="contreVisiteDate" class="form-control" value="${c.contreVisiteDate||''}"></div><div class="form-group"><label>R\u00e9sultat CV</label><select name="contreVisiteResultat" class="form-control"><option value="">-</option><option value="favorable" ${c.contreVisiteResultat==='favorable'?'selected':''}>Favorable</option><option value="defavorable" ${c.contreVisiteResultat==='defavorable'?'selected':''}>D\u00e9favorable</option></select></div></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-ct-edit'));
        Store.update('controlesTechniques', id, {
          vehiculeId: fd.get('vehiculeId'), date: fd.get('date'), dateExpiration: fd.get('dateExpiration'),
          resultat: fd.get('resultat'), centre: fd.get('centre') || '', cout: parseFloat(fd.get('cout')) || 0,
          observations: fd.get('observations') || '', contreVisiteDate: fd.get('contreVisiteDate') || '',
          contreVisiteResultat: fd.get('contreVisiteResultat') || ''
        });
        Modal.close(); Toast.show('CT modifi\u00e9', 'success');
        this._renderCTTab(document.getElementById('garage-tab-content'));
      }
    );
  },

  _deleteCT(id) {
    if (!confirm('Supprimer ce contr\u00f4le technique ?')) return;
    Store.delete('controlesTechniques', id);
    Toast.show('CT supprim\u00e9', 'success');
    this._renderCTTab(document.getElementById('garage-tab-content'));
  },

  // =================== ONGLET ASSURANCES ===================

  _renderAssurancesTab(container) {
    const vehicules = Store.get('vehicules') || [];
    const enService = vehicules.filter(v => v.statut === 'en_service');
    const today = new Date().toISOString().split('T')[0];
    const dans30j = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];

    let expired = 0, soon = 0, ok = 0, noAssurance = 0, primeTotal = 0;
    enService.forEach(v => {
      primeTotal += v.primeAnnuelle || 0;
      if (!v.dateExpirationAssurance) { noAssurance++; return; }
      if (v.dateExpirationAssurance < today) expired++;
      else if (v.dateExpirationAssurance <= dans30j) soon++;
      else ok++;
    });

    container.innerHTML = `
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card ${expired > 0 ? 'red' : ''}"><div class="kpi-icon"><iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${expired}</div><div class="kpi-label">Expir\u00e9es</div></div>
        <div class="kpi-card ${soon > 0 ? 'yellow' : ''}"><div class="kpi-icon"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${soon}</div><div class="kpi-label">Expire &lt; 30j</div></div>
        <div class="kpi-card green"><div class="kpi-icon"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div><div class="kpi-value">${ok}</div><div class="kpi-label">&Agrave; jour</div></div>
        <div class="kpi-card orange"><div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div><div class="kpi-value">${Utils.formatNumber(primeTotal)}<span style="font-size:var(--font-size-xs);color:var(--text-muted)"> FCFA</span></div><div class="kpi-label">Primes annuelles</div></div>
      </div>
      <div class="card"><div class="card-header"><span class="card-title"><iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon> Assurances v\u00e9hicules (${enService.length})</span></div><div id="assurances-table"></div></div>
    `;

    Table.create({
      containerId: 'assurances-table', data: enService.sort((a,b) => { const da = a.dateExpirationAssurance||'9999'; const db = b.dateExpirationAssurance||'9999'; return da.localeCompare(db); }), pageSize: 20,
      columns: [
        { label:'V\u00e9hicule', key:'id', render:(v) => `<span style="font-weight:500;">${v.marque} ${v.modele}</span><br><span style="font-size:var(--font-size-xs);color:var(--text-muted);">${v.immatriculation}</span>` },
        { label:'Assureur', key:'assureur', render:(v) => v.assureur || '<span style="color:var(--text-muted);">-</span>' },
        { label:'N\u00b0 Police', key:'numeroPolice', render:(v) => v.numeroPolice || '-' },
        { label:'Prime annuelle', key:'primeAnnuelle', render:(v) => v.primeAnnuelle ? `${v.primeAnnuelle.toLocaleString('fr-FR')} F` : '-', value:(v)=>v.primeAnnuelle||0 },
        { label:'Expiration', key:'dateExpirationAssurance', render:(v) => {
          if (!v.dateExpirationAssurance) return '<span class="maint-statut-badge expire">Non renseign\u00e9</span>';
          const color = v.dateExpirationAssurance < today ? '#ef4444' : v.dateExpirationAssurance <= dans30j ? '#f59e0b' : 'var(--text-primary)';
          return `<span style="color:${color};font-weight:500;">${Utils.formatDate(v.dateExpirationAssurance)}</span>`;
        }},
        { label:'Statut', key:'_statut', render:(v) => {
          if (!v.dateExpirationAssurance) return '<span class="maint-statut-badge expire">Aucune</span>';
          if (v.dateExpirationAssurance < today) return '<span class="maint-statut-badge expire">Expir\u00e9e</span>';
          if (v.dateExpirationAssurance <= dans30j) return '<span class="maint-statut-badge bientot">Bient\u00f4t</span>';
          return '<span class="maint-statut-badge a_jour">\u00c0 jour</span>';
        }}
      ],
      actions:(v) => `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();GaragePage._editAssurance('${v.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>`
    });
  },

  _editAssurance(vehiculeId) {
    const v = (Store.get('vehicules') || []).find(x => x.id === vehiculeId);
    if (!v) return;
    Modal.form(
      `<iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon> Assurance - ${v.marque} ${v.modele}`,
      `<form id="form-assurance" class="modal-form">
        <div class="form-group"><label>Assureur</label><input type="text" name="assureur" class="form-control" value="${v.assureur||''}" placeholder="Nom de l'assureur"></div>
        <div class="form-group"><label>N\u00b0 Police</label><input type="text" name="numeroPolice" class="form-control" value="${v.numeroPolice||''}"></div>
        <div class="form-row"><div class="form-group"><label>Prime annuelle (FCFA)</label><input type="number" name="primeAnnuelle" class="form-control" value="${v.primeAnnuelle||''}" min="0"></div><div class="form-group"><label>Date d'expiration</label><input type="date" name="dateExpirationAssurance" class="form-control" value="${v.dateExpirationAssurance||''}"></div></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-assurance'));
        Store.update('vehicules', vehiculeId, {
          assureur: fd.get('assureur') || '', numeroPolice: fd.get('numeroPolice') || '',
          primeAnnuelle: parseFloat(fd.get('primeAnnuelle')) || 0,
          dateExpirationAssurance: fd.get('dateExpirationAssurance') || ''
        });
        Modal.close(); Toast.show('Assurance mise \u00e0 jour', 'success');
        this._renderAssurancesTab(document.getElementById('garage-tab-content'));
      }
    );
  },

  // =================== ONGLET TCO ===================

  _renderTCOTab(container) {
    const vehicules = Store.get('vehicules') || [];
    const reparations = Store.get('reparations') || [];
    const depenses = Store.get('depenses') || [];
    const contraventions = Store.get('contraventions') || [];
    const enService = vehicules.filter(v => v.statut === 'en_service');

    // Calcul TCO par vehicule
    const tcoData = enService.map(v => {
      const achat = v.prixAchat || 0;
      const assurance = v.primeAnnuelle || 0;
      const maintCout = (v.coutsMaintenance || []).reduce((s,m) => s + (m.cout || 0), 0);
      const repCout = reparations.filter(r => r.vehiculeId === v.id).reduce((s,r) => s + (r.coutReel || 0), 0);
      const depCout = depenses.filter(d => d.vehiculeId === v.id).reduce((s,d) => s + (d.montant || 0), 0);
      const ctrCout = contraventions.filter(c => c.vehiculeId === v.id).reduce((s,c) => s + (c.montant || 0), 0);
      const totalTCO = achat + assurance + maintCout + repCout + depCout + ctrCout;
      const km = v.kilometrage || 1;
      const coutKm = totalTCO / km;

      return {
        id: v.id, label: `${v.marque} ${v.modele}`, immatriculation: v.immatriculation,
        achat, assurance, maintenance: maintCout, reparations: repCout, depenses: depCout, contraventions: ctrCout,
        totalTCO, km, coutKm
      };
    }).sort((a,b) => b.totalTCO - a.totalTCO);

    const totalFlotte = tcoData.reduce((s,t) => s + t.totalTCO, 0);
    const moyVehicule = tcoData.length > 0 ? Math.round(totalFlotte / tcoData.length) : 0;
    const moyKm = tcoData.length > 0 ? (tcoData.reduce((s,t) => s + t.coutKm, 0) / tcoData.length) : 0;
    const topVehicule = tcoData[0];

    container.innerHTML = `
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card orange"><div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div><div class="kpi-value">${Utils.formatNumber(totalFlotte)}<span style="font-size:var(--font-size-xs);color:var(--text-muted)"> FCFA</span></div><div class="kpi-label">Co\u00fbt total flotte</div></div>
        <div class="kpi-card cyan"><div class="kpi-icon"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon></div><div class="kpi-value">${Utils.formatNumber(moyVehicule)}<span style="font-size:var(--font-size-xs);color:var(--text-muted)"> FCFA</span></div><div class="kpi-label">Moy. par v\u00e9hicule</div></div>
        <div class="kpi-card"><div class="kpi-icon"><iconify-icon icon="solar:route-bold-duotone"></iconify-icon></div><div class="kpi-value">${moyKm.toFixed(0)}<span style="font-size:var(--font-size-xs);color:var(--text-muted)"> F/km</span></div><div class="kpi-label">Co\u00fbt moyen/km</div></div>
        <div class="kpi-card ${topVehicule ? 'red' : ''}"><div class="kpi-icon"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon></div><div class="kpi-value" style="font-size:var(--font-size-md);">${topVehicule ? topVehicule.label : '-'}</div><div class="kpi-label">Plus co\u00fbteux</div></div>
      </div>

      <div class="chart-card" style="margin-bottom:var(--space-lg);">
        <div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> TCO par v\u00e9hicule</div></div>
        <div class="chart-container" style="height:${Math.max(250, tcoData.length * 40)}px;"><canvas id="chart-tco"></canvas></div>
      </div>

      <div class="card"><div class="card-header"><span class="card-title"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> D\u00e9tail TCO</span></div><div id="tco-table"></div></div>
    `;

    // Chart TCO empile
    const ctx = document.getElementById('chart-tco');
    if (ctx && tcoData.length > 0) {
      const labels = tcoData.map(t => `${t.label} (${t.immatriculation})`);
      this._charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label:'Achat', data:tcoData.map(t=>t.achat), backgroundColor:'#6366f1', borderRadius:2 },
            { label:'Assurance', data:tcoData.map(t=>t.assurance), backgroundColor:'#3b82f6', borderRadius:2 },
            { label:'Maintenance', data:tcoData.map(t=>t.maintenance), backgroundColor:'#22c55e', borderRadius:2 },
            { label:'R\u00e9parations', data:tcoData.map(t=>t.reparations), backgroundColor:'#f59e0b', borderRadius:2 },
            { label:'D\u00e9penses', data:tcoData.map(t=>t.depenses), backgroundColor:'#ef4444', borderRadius:2 },
            { label:'Contraventions', data:tcoData.map(t=>t.contraventions), backgroundColor:'#ec4899', borderRadius:2 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: { legend: { position:'bottom', labels:{ font:{size:11}, padding:12 } }, tooltip:{ callbacks:{ label:(item) => `${item.dataset.label}: ${item.parsed.x.toLocaleString('fr-FR')} FCFA` } } },
          scales: { x: { stacked:true, beginAtZero:true, ticks:{ callback:(v) => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000)+'K' : v } }, y: { stacked:true } }
        }
      }));
    }

    // Table TCO
    Table.create({
      containerId: 'tco-table', data: tcoData, pageSize: 20,
      columns: [
        { label:'V\u00e9hicule', key:'label', render:(t) => `<span style="font-weight:500;">${t.label}</span><br><span style="font-size:var(--font-size-xs);color:var(--text-muted);">${t.immatriculation}</span>` },
        { label:'Achat', key:'achat', render:(t) => t.achat ? `${t.achat.toLocaleString('fr-FR')} F` : '-', value:(t)=>t.achat },
        { label:'Maintenance', key:'maintenance', render:(t) => t.maintenance ? `${t.maintenance.toLocaleString('fr-FR')} F` : '-', value:(t)=>t.maintenance },
        { label:'R\u00e9par.', key:'reparations', render:(t) => t.reparations ? `${t.reparations.toLocaleString('fr-FR')} F` : '-', value:(t)=>t.reparations },
        { label:'Assurance', key:'assurance', render:(t) => t.assurance ? `${t.assurance.toLocaleString('fr-FR')} F` : '-', value:(t)=>t.assurance },
        { label:'D\u00e9penses', key:'depenses', render:(t) => t.depenses ? `${t.depenses.toLocaleString('fr-FR')} F` : '-', value:(t)=>t.depenses },
        { label:'Contrav.', key:'contraventions', render:(t) => t.contraventions ? `${t.contraventions.toLocaleString('fr-FR')} F` : '-', value:(t)=>t.contraventions },
        { label:'Total TCO', key:'totalTCO', render:(t) => `<span style="font-weight:700;color:var(--pilote-orange);">${t.totalTCO.toLocaleString('fr-FR')} F</span>`, value:(t)=>t.totalTCO },
        { label:'F/km', key:'coutKm', render:(t) => {
          const avg = moyKm;
          const color = t.coutKm > avg * 1.5 ? '#ef4444' : t.coutKm > avg * 1.2 ? '#f59e0b' : '#22c55e';
          return `<span style="font-weight:600;color:${color};">${t.coutKm.toFixed(0)} F</span>`;
        }, value:(t)=>t.coutKm },
        { label:'', key:'_reco', render:(t) => {
          const avg = moyKm;
          if (t.coutKm > avg * 1.5) return '<span class="maint-statut-badge expire" title="Co\u00fbt/km &gt; 150% de la moyenne">\u00c0 remplacer</span>';
          if (t.coutKm > avg * 1.2) return '<span class="maint-statut-badge bientot" title="Co\u00fbt/km &gt; 120% de la moyenne">Surveiller</span>';
          return '<span class="maint-statut-badge a_jour">Rentable</span>';
        }}
      ]
    });
  },

  // =================== KM UPDATE ===================

  _updateKmModal() {
    const vehicules = Store.get('vehicules') || [];
    const enService = vehicules.filter(v => v.statut === 'en_service');
    const rows = enService.map(v => {
      const linked = v.yangoVehicleId ? '<iconify-icon icon="solar:link-bold-duotone" style="color:#22c55e;" title="Li\u00e9 \u00e0 Yango"></iconify-icon>' : '<iconify-icon icon="solar:link-broken-bold-duotone" style="color:var(--text-muted);" title="Non li\u00e9"></iconify-icon>';
      return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-color);">
        <div style="flex:1;">
          <span style="font-weight:500;">${v.marque} ${v.modele}</span>
          <span style="font-size:var(--font-size-xs);color:var(--text-muted);margin-left:6px;">${v.immatriculation}</span>
          ${linked}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" class="form-control km-input" data-id="${v.id}" value="${v.kilometrage || 0}" min="0" style="width:120px;font-size:var(--font-size-sm);text-align:right;">
          <span style="font-size:var(--font-size-xs);color:var(--text-muted);">km</span>
        </div>
      </div>`;
    }).join('');

    Modal.form(
      '<iconify-icon icon="solar:route-bold-duotone"></iconify-icon> Mettre \u00e0 jour les kilom\u00e9trages',
      `<div id="km-form" style="max-height:500px;overflow-y:auto;">${rows}</div>`,
      () => {
        const inputs = document.querySelectorAll('.km-input');
        let updated = 0;
        inputs.forEach(input => {
          const id = input.dataset.id;
          const km = parseInt(input.value) || 0;
          const v = vehicules.find(x => x.id === id);
          if (v && km !== (v.kilometrage || 0)) {
            Store.update('vehicules', id, { kilometrage: km });
            updated++;
          }
        });
        Modal.close();
        if (updated > 0) {
          Toast.show(`${updated} kilom\u00e9trage(s) mis \u00e0 jour`, 'success');
          this.render();
        } else {
          Toast.show('Aucun changement', 'info');
        }
      }
    );
  }
};
