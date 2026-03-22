/**
 * ControleConduitePage — Controle de conduite : infractions vitesse, zones, statistiques
 */
const ControleConduitePage = {
  _activeTab: 'infractions',
  _charts: [],
  _map: null,

  _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  },

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindTabEvents();
    this._renderTab(this._activeTab);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
  },

  // ======================== TEMPLATE ========================

  _template() {
    return `
      <div class="d-wrap"><div class="d-bg">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:14px;">
        <div>
          <div style="font-size:14px;color:#9ca3af;font-weight:500;">Suivi</div>
          <div style="font-size:28px;font-weight:800;color:var(--text-primary);letter-spacing:-.6px;margin-top:2px;display:flex;align-items:center;gap:12px;">
            <iconify-icon icon="solar:shield-check-bold-duotone" style="color:#6366f1;"></iconify-icon> Contr\u00f4le de conduite
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="cc-tabs" style="display:flex;gap:0;margin-bottom:var(--space-lg);border-bottom:2px solid var(--border-color);overflow-x:auto;">
        <button class="cc-tab ${this._activeTab === 'infractions' ? 'active' : ''}" data-tab="infractions">
          <iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Infractions
        </button>
        <button class="cc-tab ${this._activeTab === 'zones' ? 'active' : ''}" data-tab="zones">
          <iconify-icon icon="solar:map-point-bold-duotone"></iconify-icon> Zones de radars
        </button>
        <button class="cc-tab ${this._activeTab === 'statistiques' ? 'active' : ''}" data-tab="statistiques">
          <iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Statistiques
        </button>
        <button class="cc-tab ${this._activeTab === 'contraventions' ? 'active' : ''}" data-tab="contraventions">
          <iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> Contraventions
        </button>
      </div>

      <div id="cc-tab-content"></div>

      <style>
        .cc-tab { background:none;border:none;padding:10px 20px;cursor:pointer;font-size:var(--font-size-sm);font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;gap:6px;white-space:nowrap;font-family:inherit; }
        .cc-tab:hover { color:var(--text-primary); }
        .cc-tab.active { color:#6366f1;border-bottom-color:#6366f1; }

        .cc-kpi-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px; }
        @media(max-width:900px) { .cc-kpi-grid { grid-template-columns:repeat(2,1fr); } }
        @media(max-width:500px) { .cc-kpi-grid { grid-template-columns:1fr; } }

        .cc-kpi { background:var(--bg-primary);border:1px solid var(--border-color);border-radius:16px;padding:18px;transition:all .2s; }
        .cc-kpi:hover { transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.06); }
        .cc-kpi-top { display:flex;align-items:center;gap:10px;margin-bottom:10px; }
        .cc-kpi-icon { width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.2rem; }
        .cc-kpi-label { font-size:12px;font-weight:600;color:var(--text-muted); }
        .cc-kpi-val { font-size:1.5rem;font-weight:800;color:var(--text-primary); }
        .cc-kpi-sub { font-size:11px;color:var(--text-muted);margin-top:2px; }

        .cc-cat-badge { display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700; }
        .cc-cat-1 { background:rgba(234,179,8,.15);color:#ca8a04; }
        .cc-cat-2 { background:rgba(249,115,22,.15);color:#ea580c; }
        .cc-cat-3 { background:rgba(239,68,68,.15);color:#dc2626; }
        .cc-cat-4 { background:rgba(127,29,29,.2);color:#7f1d1d; }

        .cc-stat-badge { display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700; }
        .cc-stat-detectee { background:rgba(249,115,22,.15);color:#ea580c; }
        .cc-stat-confirmee { background:rgba(59,130,246,.15);color:#2563eb; }
        .cc-stat-convertie { background:rgba(34,197,94,.15);color:#16a34a; }
        .cc-stat-annulee { background:rgba(107,114,128,.15);color:#6b7280; }

        .cc-zone-cards { display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-bottom:20px; }
        .cc-zone-card { background:var(--bg-primary);border:1px solid var(--border-color);border-radius:16px;padding:18px;transition:all .2s; }
        .cc-zone-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.06); }
        .cc-zone-header { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px; }
        .cc-zone-name { font-weight:700;font-size:15px;color:var(--text-primary); }
        .cc-zone-meta { display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--text-muted); }
        .cc-zone-meta-item { display:flex;align-items:center;gap:4px; }
        .cc-zone-actions { display:flex;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color); }

        .cc-type-badge { display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700; }
        .cc-type-ville { background:rgba(59,130,246,.12);color:#2563eb; }
        .cc-type-autoroute { background:rgba(99,102,241,.12);color:#6366f1; }
        .cc-type-zone_scolaire { background:rgba(234,179,8,.12);color:#ca8a04; }
        .cc-type-zone_travaux { background:rgba(249,115,22,.12);color:#ea580c; }
        .cc-type-personnalisee { background:rgba(107,114,128,.12);color:#6b7280; }

        .cc-toggle { position:relative;width:40px;height:22px;border-radius:11px;background:var(--border-color);cursor:pointer;transition:background .2s;border:none; }
        .cc-toggle.active { background:#22c55e; }
        .cc-toggle::after { content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2); }
        .cc-toggle.active::after { transform:translateX(18px); }

        #cc-zones-map { height:420px;border-radius:16px;border:none;margin-bottom:20px;box-shadow:0 4px 24px rgba(0,0,0,.15),0 0 0 1px rgba(99,102,241,.1);overflow:hidden; }

        .cc-stats-grid { display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px; }
        @media(max-width:768px) { .cc-stats-grid { grid-template-columns:1fr; } }
        .cc-chart-card { background:var(--bg-primary);border:1px solid var(--border-color);border-radius:16px;padding:18px; }
        .cc-chart-title { font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:12px; }

        .cc-top-list { list-style:none;padding:0;margin:0; }
        .cc-top-list li { display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color); }
        .cc-top-list li:last-child { border-bottom:none; }
        .cc-top-rank { width:24px;height:24px;border-radius:50%;background:rgba(99,102,241,.1);color:#6366f1;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-right:10px; }
        .cc-top-name { font-weight:600;font-size:13px;color:var(--text-primary); }
        .cc-top-count { font-weight:700;font-size:13px;color:var(--text-muted); }

        .cc-filter-row { display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px; }
        .cc-filter-select { padding:6px 12px;border-radius:11px;border:1px solid var(--border-color);background:var(--bg-secondary);font-size:12px;font-weight:500;color:var(--text-primary);font-family:inherit; }
      </style>

      </div></div>
    `;
  },

  // ======================== TAB EVENTS ========================

  _bindTabEvents() {
    document.querySelectorAll('.cc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        document.querySelectorAll('.cc-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Cleanup before switching
        this._charts.forEach(c => c.destroy());
        this._charts = [];
        if (this._map) { this._map.remove(); this._map = null; }
        this._renderTab(this._activeTab);
      });
    });
  },

  _renderTab(tab) {
    const content = document.getElementById('cc-tab-content');
    if (!content) return;

    if (tab === 'infractions') this._renderInfractions(content);
    else if (tab === 'zones') this._renderZones(content);
    else if (tab === 'statistiques') this._renderStats(content);
    else if (tab === 'contraventions') this._renderContraventions(content);
  },

  // ======================== HELPERS ========================

  _getChauffeurName(id) {
    const chauffeurs = Store.get('chauffeurs') || [];
    const c = chauffeurs.find(x => x.id === id);
    return c ? `${c.prenom || ''} ${c.nom || ''}`.trim() : 'Inconnu';
  },

  _getCategoryLabel(cat) {
    const map = { cat1: 'Cat.1', cat2: 'Cat.2', cat3: 'Cat.3', cat4: 'Cat.4' };
    return map[cat] || cat;
  },

  _getCategoryInfo(cat) {
    const map = {
      cat1: { label: 'Cat.1 (+1-5 km/h)', cls: 'cc-cat-1', amende: 2000 },
      cat2: { label: 'Cat.2 (+6-10 km/h)', cls: 'cc-cat-2', amende: 3000 },
      cat3: { label: 'Cat.3 (+11-20 km/h)', cls: 'cc-cat-3', amende: 5000 },
      cat4: { label: 'Cat.4 (+20 km/h)', cls: 'cc-cat-4', amende: 10000 }
    };
    return map[cat] || { label: cat, cls: 'cc-cat-1', amende: 0 };
  },

  _getStatusBadge(statut) {
    const map = {
      detectee: '<span class="cc-stat-badge cc-stat-detectee">D\u00e9tect\u00e9e</span>',
      confirmee: '<span class="cc-stat-badge cc-stat-confirmee">Confirm\u00e9e</span>',
      convertie: '<span class="cc-stat-badge cc-stat-convertie">Convertie</span>',
      annulee: '<span class="cc-stat-badge cc-stat-annulee">Annul\u00e9e</span>'
    };
    return map[statut] || statut;
  },

  _getTypeLabel(type) {
    const map = {
      ville: 'Ville',
      autoroute: 'Autoroute',
      zone_scolaire: 'Zone scolaire',
      zone_travaux: 'Zone travaux',
      personnalisee: 'Personnalis\u00e9e'
    };
    return map[type] || type;
  },

  // ======================== TAB 1: INFRACTIONS ========================

  _renderInfractions(content) {
    const infractions = Store.get('infractionsVitesse') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    // Month infractions
    const monthInf = infractions.filter(i => {
      const d = new Date(i.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const totalMonth = monthInf.length;
    const totalAmende = monthInf.reduce((s, i) => s + (i.amende || 0), 0);

    // Top chauffeur
    const chauffeurCounts = {};
    monthInf.forEach(i => {
      if (i.chauffeurId) chauffeurCounts[i.chauffeurId] = (chauffeurCounts[i.chauffeurId] || 0) + 1;
    });
    let topChauffeur = '-';
    let topChauffeurCount = 0;
    Object.entries(chauffeurCounts).forEach(([id, count]) => {
      if (count > topChauffeurCount) {
        topChauffeurCount = count;
        topChauffeur = this._getChauffeurName(id);
      }
    });

    // Most frequent category
    const catCounts = {};
    monthInf.forEach(i => {
      if (i.categorie) catCounts[i.categorie] = (catCounts[i.categorie] || 0) + 1;
    });
    let topCat = '-';
    let topCatCount = 0;
    Object.entries(catCounts).forEach(([cat, count]) => {
      if (count > topCatCount) {
        topCatCount = count;
        topCat = this._getCategoryLabel(cat);
      }
    });

    content.innerHTML = `
      <!-- KPI Cards -->
      <div class="cc-kpi-grid">
        <div class="cc-kpi">
          <div class="cc-kpi-top">
            <div class="cc-kpi-icon" style="background:rgba(239,68,68,.1);color:#ef4444;"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
            <div class="cc-kpi-label">Infractions du mois</div>
          </div>
          <div class="cc-kpi-val">${totalMonth}</div>
        </div>
        <div class="cc-kpi">
          <div class="cc-kpi-top">
            <div class="cc-kpi-icon" style="background:rgba(249,115,22,.1);color:#f97316;"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
            <div class="cc-kpi-label">Montant amendes du mois</div>
          </div>
          <div class="cc-kpi-val" style="color:#f97316;">${Utils.formatCurrency(totalAmende)}</div>
        </div>
        <div class="cc-kpi">
          <div class="cc-kpi-top">
            <div class="cc-kpi-icon" style="background:rgba(99,102,241,.1);color:#6366f1;"><iconify-icon icon="solar:user-bold-duotone"></iconify-icon></div>
            <div class="cc-kpi-label">Chauffeur le plus infracteur</div>
          </div>
          <div class="cc-kpi-val" style="font-size:1rem;">${topChauffeur}</div>
          ${topChauffeurCount > 0 ? `<div class="cc-kpi-sub">${topChauffeurCount} infraction${topChauffeurCount > 1 ? 's' : ''}</div>` : ''}
        </div>
        <div class="cc-kpi">
          <div class="cc-kpi-top">
            <div class="cc-kpi-icon" style="background:rgba(234,179,8,.1);color:#eab308;"><iconify-icon icon="solar:tag-bold-duotone"></iconify-icon></div>
            <div class="cc-kpi-label">Cat\u00e9gorie la plus fr\u00e9quente</div>
          </div>
          <div class="cc-kpi-val" style="font-size:1rem;">${topCat}</div>
          ${topCatCount > 0 ? `<div class="cc-kpi-sub">${topCatCount} infraction${topCatCount > 1 ? 's' : ''}</div>` : ''}
        </div>
      </div>

      <!-- Filters -->
      <div class="d-card" style="padding:12px 16px;margin-bottom:16px;">
        <div class="cc-filter-row">
          <select id="cc-filter-chauffeur" class="cc-filter-select">
            <option value="">Tous les chauffeurs</option>
            ${chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
          </select>
          <input type="date" id="cc-filter-date-start" class="cc-filter-select" title="Date d\u00e9but" />
          <input type="date" id="cc-filter-date-end" class="cc-filter-select" title="Date fin" />
          <select id="cc-filter-categorie" class="cc-filter-select">
            <option value="">Toutes les cat\u00e9gories</option>
            <option value="cat1">Cat.1 (+1-5 km/h)</option>
            <option value="cat2">Cat.2 (+6-10 km/h)</option>
            <option value="cat3">Cat.3 (+11-20 km/h)</option>
            <option value="cat4">Cat.4 (+20 km/h)</option>
          </select>
          <select id="cc-filter-statut" class="cc-filter-select">
            <option value="">Tous les statuts</option>
            <option value="detectee">D\u00e9tect\u00e9e</option>
            <option value="confirmee">Confirm\u00e9e</option>
            <option value="convertie">Convertie</option>
            <option value="annulee">Annul\u00e9e</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="d-card" style="overflow-x:auto;">
        <div id="cc-infractions-table" style="overflow-x:auto;-webkit-overflow-scrolling:touch;"></div>
      </div>
    `;

    this._renderInfractionsTable(infractions);
    this._bindInfractionFilters(infractions);
  },

  _renderInfractionsTable(infractions) {
    // Apply filters
    let data = [...infractions];
    const fc = document.getElementById('cc-filter-chauffeur');
    const fds = document.getElementById('cc-filter-date-start');
    const fde = document.getElementById('cc-filter-date-end');
    const fcat = document.getElementById('cc-filter-categorie');
    const fst = document.getElementById('cc-filter-statut');

    if (fc && fc.value) data = data.filter(i => i.chauffeurId === fc.value);
    if (fds && fds.value) data = data.filter(i => i.date >= fds.value);
    if (fde && fde.value) data = data.filter(i => i.date <= fde.value);
    if (fcat && fcat.value) data = data.filter(i => i.categorie === fcat.value);
    if (fst && fst.value) data = data.filter(i => i.statut === fst.value);

    // Sort by date desc
    data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (data.length === 0) {
      const el = document.getElementById('cc-infractions-table');
      if (el) el.innerHTML = '<div class="empty-state" style="padding:40px;"><iconify-icon icon="solar:shield-check-bold-duotone" style="font-size:3rem;color:var(--success);"></iconify-icon><h3>Aucune infraction</h3><p style="color:var(--text-muted);">Les infractions de vitesse appara\u00eetront ici.</p></div>';
      return;
    }

    Table.create({
      containerId: 'cc-infractions-table',
      data,
      columns: [
        { label: 'Date / Heure', key: 'date', render: (i) => {
          const dateStr = Utils.formatDate(i.date);
          return dateStr + (i.heure ? '<br><span style="font-size:10px;color:var(--text-muted);">' + i.heure + '</span>' : '');
        }},
        { label: 'Chauffeur', key: 'chauffeurId', primary: true, render: (i) => '<strong>' + ControleConduitePage._getChauffeurName(i.chauffeurId) + '</strong>' },
        { label: 'Zone / Lieu', key: 'zoneNom', render: (i) => {
          let html = '<div style="font-weight:600;">' + (i.zoneNom || '-') + '</div>';
          if (i.position && i.position.lat && i.position.lng) {
            html += '<a href="https://www.google.com/maps?q=' + i.position.lat + ',' + i.position.lng + '" target="_blank" style="font-size:10px;color:#3b82f6;text-decoration:none;" onclick="event.stopPropagation();">'
              + '<iconify-icon icon="solar:map-point-bold" style="font-size:10px;"></iconify-icon> '
              + parseFloat(i.position.lat).toFixed(4) + ', ' + parseFloat(i.position.lng).toFixed(4) + '</a>';
          }
          return html;
        }},
        { label: 'Vitesse / Limite', key: 'vitesse', render: (i) => '<span style="font-weight:700;color:#ef4444;">' + (i.vitesse || i.vitesseEnregistree || 0) + '</span> / <span style="color:var(--text-muted);">' + (i.vitesseMax || i.vitesseLimite || 0) + ' km/h</span>' },
        { label: 'D\u00e9passement', key: 'depassement', render: (i) => {
          const dep = (i.vitesse || 0) - (i.vitesseMax || 0);
          return '<span style="font-weight:700;color:#ef4444;">+' + (dep > 0 ? dep : 0) + ' km/h</span>';
        }},
        { label: 'Cat\u00e9gorie', key: 'categorie', render: (i) => {
          const info = ControleConduitePage._getCategoryInfo(i.categorie);
          return '<span class="cc-cat-badge ' + info.cls + '">' + info.label + '</span>';
        }},
        { label: 'Amende', key: 'amende', render: (i) => '<strong>' + Utils.formatCurrency(i.amende || 0) + '</strong>' },
        { label: 'Statut', key: 'statut', render: (i) => ControleConduitePage._getStatusBadge(i.statut) },
        { label: 'Actions', key: 'actions', render: (i) => {
          let btns = '';
          if (i.statut === 'detectee') {
            btns += '<button class="btn-icon" title="Confirmer" style="color:#2563eb;" onclick="ControleConduitePage._confirmer(\'' + i.id + '\')"><iconify-icon icon="solar:check-circle-bold"></iconify-icon></button>';
            btns += '<button class="btn-icon" title="Convertir en contravention" style="color:#16a34a;" onclick="ControleConduitePage._convertir(\'' + i.id + '\')"><iconify-icon icon="solar:document-add-bold"></iconify-icon></button>';
            btns += '<button class="btn-icon" title="Annuler" style="color:#6b7280;" onclick="ControleConduitePage._annuler(\'' + i.id + '\')"><iconify-icon icon="solar:close-circle-bold"></iconify-icon></button>';
          } else if (i.statut === 'confirmee') {
            btns += '<button class="btn-icon" title="Convertir en contravention" style="color:#16a34a;" onclick="ControleConduitePage._convertir(\'' + i.id + '\')"><iconify-icon icon="solar:document-add-bold"></iconify-icon></button>';
            btns += '<button class="btn-icon" title="Annuler" style="color:#6b7280;" onclick="ControleConduitePage._annuler(\'' + i.id + '\')"><iconify-icon icon="solar:close-circle-bold"></iconify-icon></button>';
          }
          if (i.statut === 'convertie' && i.contraventionId) {
            btns += '<span style="font-size:10px;color:var(--text-muted);">CTR li\u00e9e</span>';
          }
          return btns || '<span style="color:var(--text-muted);">\u2014</span>';
        }}
      ],
      pageSize: 15,
      sortable: true
    });
  },

  _bindInfractionFilters(infractions) {
    const filterIds = ['cc-filter-chauffeur', 'cc-filter-date-start', 'cc-filter-date-end', 'cc-filter-categorie', 'cc-filter-statut'];
    filterIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this._renderInfractionsTable(infractions));
    });
  },

  // ---- Infraction Actions ----

  _confirmer(id) {
    const infractions = Store.get('infractionsVitesse') || [];
    const inf = infractions.find(i => i.id === id);
    if (!inf) return;

    Store.update('infractionsVitesse', id, { statut: 'confirmee' });
    Toast.success('Infraction confirm\u00e9e');
    this._renderTab('infractions');
  },

  _convertir(id) {
    const infractions = Store.get('infractionsVitesse') || [];
    const inf = infractions.find(i => i.id === id);
    if (!inf) return;

    Modal.confirm(
      'Convertir en contravention',
      'Voulez-vous cr\u00e9er une contravention de ' + Utils.formatCurrency(inf.amende || 0) + ' pour ' + this._getChauffeurName(inf.chauffeurId) + ' ?',
      () => {
        // Create contravention
        const contraventionId = 'CTR-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const contravention = {
          id: contraventionId,
          chauffeurId: inf.chauffeurId,
          vehiculeId: inf.vehiculeId || '',
          date: inf.date,
          heure: inf.heure || '',
          type: 'exces_vitesse',
          lieu: inf.zoneNom || '',
          montant: inf.amende || 0,
          description: 'Exc\u00e8s de vitesse : ' + (inf.vitesse || 0) + ' km/h (limite ' + (inf.vitesseMax || 0) + ' km/h) \u2014 ' + ControleConduitePage._getCategoryInfo(inf.categorie).label,
          commentaire: 'Contravention g\u00e9n\u00e9r\u00e9e depuis contr\u00f4le de conduite',
          statut: 'impayee',
          dateCreation: new Date().toISOString()
        };

        Store.add('contraventions', contravention);

        // Create debt versement
        if (inf.chauffeurId && (inf.amende || 0) > 0) {
          Store.add('versements', {
            id: Utils.generateId('VRS'),
            chauffeurId: inf.chauffeurId,
            date: inf.date,
            montantVerse: 0,
            montantAttendu: inf.amende,
            manquant: inf.amende,
            statut: 'manquant',
            traitementManquant: 'dette',
            reference: contraventionId,
            commentaire: 'Contravention \u2014 exc\u00e8s de vitesse',
            source: 'contravention',
            dateCreation: new Date().toISOString()
          });
        }

        // Update infraction
        Store.update('infractionsVitesse', id, { statut: 'convertie', contraventionId });
        Toast.success('Contravention cr\u00e9\u00e9e avec succ\u00e8s');
        this._renderTab('infractions');
      }
    );
  },

  _annuler(id) {
    Modal.confirm(
      'Annuler l\u2019infraction',
      '\u00cates-vous s\u00fbr de vouloir annuler cette infraction ?',
      () => {
        Store.update('infractionsVitesse', id, { statut: 'annulee' });
        Toast.success('Infraction annul\u00e9e');
        this._renderTab('infractions');
      }
    );
  },

  // ======================== TAB 2: ZONES DE VITESSE ========================

  _renderZones(content) {
    const zones = Store.get('zonesVitesse') || [];

    const typeLabels = {
      ville: 'Ville',
      autoroute: 'Autoroute',
      zone_scolaire: 'Zone scolaire',
      zone_travaux: 'Zone travaux',
      personnalisee: 'Personnalis\u00e9e'
    };

    content.innerHTML = `
      <!-- Header with add button -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-size:14px;font-weight:600;color:var(--text-muted);">${zones.length} zone${zones.length !== 1 ? 's' : ''} configur\u00e9e${zones.length !== 1 ? 's' : ''}</div>
        <button class="btn btn-primary" id="cc-add-zone">
          <iconify-icon icon="solar:add-circle-bold"></iconify-icon> Ajouter une zone
        </button>
      </div>

      <!-- Map legend + controls -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-muted);">
            <span style="width:10px;height:10px;border-radius:50%;background:#818cf8;display:inline-block;"></span> Radar actif
          </div>
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-muted);">
            <span style="width:10px;height:10px;border-radius:50%;background:#6b7280;display:inline-block;"></span> Radar inactif
          </div>
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-muted);">
            <span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;display:inline-block;"></span> Nouveau (cliquez sur la carte)
          </div>
        </div>
        <button class="btn btn-sm" id="cc-map-add-mode" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;font-size:12px;padding:6px 14px;border-radius:8px;cursor:pointer;">
          <iconify-icon icon="solar:map-point-add-bold"></iconify-icon> Placer un radar
        </button>
      </div>
      <div id="cc-zones-map" style="position:relative;">
        <div id="cc-map-hint" style="display:none;position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(245,158,11,0.95);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.3);">
          Cliquez sur la carte pour placer le radar
        </div>
      </div>

      <!-- Zone cards -->
      <div class="cc-zone-cards" id="cc-zone-cards">
        ${zones.length === 0 ? '<div class="empty-state" style="padding:40px;grid-column:1/-1;"><iconify-icon icon="solar:map-point-bold-duotone" style="font-size:3rem;color:var(--text-muted);"></iconify-icon><h3>Aucune zone</h3><p style="color:var(--text-muted);">Ajoutez des zones de vitesse pour le suivi automatique.</p></div>' : zones.map(z => '<div class="cc-zone-card"><div class="cc-zone-header"><div><div class="cc-zone-name">' + (z.nom || 'Zone sans nom') + '</div><span class="cc-type-badge cc-type-' + (z.type || 'personnalisee') + '">' + (typeLabels[z.type] || z.type || 'Personnalis\u00e9e') + '</span></div><button class="cc-toggle ' + (z.actif !== false ? 'active' : '') + '" title="' + (z.actif !== false ? 'Active' : 'Inactive') + '" onclick="ControleConduitePage._toggleZone(\'' + z.id + '\',' + (z.actif === false) + ')"></button></div><div class="cc-zone-meta"><div class="cc-zone-meta-item"><iconify-icon icon="solar:speedometer-bold-duotone"></iconify-icon> ' + (z.vitesseMax || 0) + ' km/h</div><div class="cc-zone-meta-item"><iconify-icon icon="solar:shield-bold-duotone"></iconify-icon> Tol\u00e9rance : ' + (z.tolerance || 0) + ' km/h</div><div class="cc-zone-meta-item"><iconify-icon icon="solar:ruler-bold-duotone"></iconify-icon> Rayon : ' + ((z.coordinates && z.coordinates.rayon) || z.rayon || 0) + ' m</div>' + ((z.coordinates && z.coordinates.lat && z.coordinates.lng) || (z.lat && z.lng) ? '<div class="cc-zone-meta-item"><iconify-icon icon="solar:map-point-bold-duotone"></iconify-icon> ' + parseFloat((z.coordinates && z.coordinates.lat) || z.lat).toFixed(4) + ', ' + parseFloat((z.coordinates && z.coordinates.lng) || z.lng).toFixed(4) + '</div>' : '') + '</div><div class="cc-zone-actions"><button class="btn btn-sm btn-secondary" onclick="ControleConduitePage._editZone(\'' + z.id + '\')"><iconify-icon icon="solar:pen-bold"></iconify-icon> Modifier</button><button class="btn btn-sm btn-danger" onclick="ControleConduitePage._deleteZone(\'' + z.id + '\')"><iconify-icon icon="solar:trash-bin-minimalistic-bold"></iconify-icon> Supprimer</button></div></div>').join('')}
      </div>
    `;

    // Add zone button
    document.getElementById('cc-add-zone').addEventListener('click', () => this._openZoneForm());

    // Init map
    this._initZonesMap(zones);
  },

  _initZonesMap(zones) {
    if (typeof L === 'undefined') return;

    try {
      // Default center: Abidjan
      const defaultCenter = [5.3600, -4.0083];
      this._map = L.map('cc-zones-map', { zoomControl: false }).setView(defaultCenter, 12);

      // Zoom control en bas à droite
      L.control.zoom({ position: 'bottomright' }).addTo(this._map);

      // Modern dark tile layer
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-mode');
      const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}{r}.png';
      L.tileLayer(tileUrl, {
        attribution: '\u00a9 OpenStreetMap \u00a9 CARTO',
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(this._map);

      const bounds = [];
      const radarGroup = L.layerGroup().addTo(this._map);

      zones.forEach(z => {
        const coord = z.coordinates || {};
        const lat = parseFloat(coord.lat || z.lat);
        const lng = parseFloat(coord.lng || z.lng);
        const rayon = coord.rayon || z.rayon || 200;
        if (lat && lng) {
          const isActive = z.actif !== false;
          const safeName = this._escapeHtml(z.nom || 'Zone');
          const safeType = this._escapeHtml(z.type || 'radar');

          // Detection zone (single circle, no glow for perf)
          L.circle([lat, lng], {
            radius: rayon,
            color: isActive ? 'rgba(220,38,38,0.6)' : 'rgba(107,114,128,0.4)',
            fillColor: isActive ? 'rgba(220,38,38,0.12)' : 'rgba(107,114,128,0.08)',
            fillOpacity: 1,
            weight: 1.5,
            dashArray: isActive ? null : '6,4'
          }).addTo(radarGroup).bindPopup(
            '<div style="font-family:system-ui;padding:6px 2px;min-width:180px;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
            '<div style="width:32px;height:32px;border-radius:8px;background:' + (isActive ? 'linear-gradient(135deg,#7c3aed,#a78bfa)' : '#6b7280') + ';display:flex;align-items:center;justify-content:center;">' +
            '<span style="font-size:16px;">📡</span></div>' +
            '<div><div style="font-weight:700;font-size:13px;">' + safeName + '</div>' +
            '<div style="font-size:11px;color:#9ca3af;">' + safeType + '</div></div></div>' +
            '<div style="display:flex;gap:12px;padding:6px 0;border-top:1px solid rgba(0,0,0,.08);">' +
            '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:700;color:' + (isActive ? '#7c3aed' : '#6b7280') + ';">' + (z.vitesseMax || 0) + '</div><div style="font-size:10px;color:#9ca3af;">km/h max</div></div>' +
            '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:700;color:' + (isActive ? '#22c55e' : '#ef4444') + ';">' + (isActive ? '●' : '○') + '</div><div style="font-size:10px;color:#9ca3af;">' + (isActive ? 'Actif' : 'Off') + '</div></div>' +
            '<div style="text-align:center;flex:1;"><div style="font-size:18px;font-weight:700;color:#f59e0b;">' + (rayon) + '</div><div style="font-size:10px;color:#9ca3af;">m rayon</div></div>' +
            '</div></div>'
          );

          // Center dot marker
          const radarIcon = L.divIcon({
            className: '',
            html: '<div style="width:14px;height:14px;border-radius:50%;background:' + (isActive ? 'linear-gradient(135deg,#dc2626,#ef4444)' : '#6b7280') + ';border:2px solid rgba(255,255,255,0.8);box-shadow:0 2px 8px rgba(0,0,0,.3),0 0 12px ' + (isActive ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.2)') + ';"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });
          L.marker([lat, lng], { icon: radarIcon }).addTo(radarGroup);

          bounds.push([lat, lng]);
        }
      });

      if (bounds.length > 0) {
        this._map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      }

      // Click to add radar mode
      this._addMode = false;
      this._tempMarker = null;

      const addBtn = document.getElementById('cc-map-add-mode');
      const hint = document.getElementById('cc-map-hint');

      if (addBtn) {
        addBtn.addEventListener('click', () => {
          this._addMode = !this._addMode;
          if (this._addMode) {
            addBtn.style.background = 'linear-gradient(135deg,#ef4444,#dc2626)';
            addBtn.textContent = 'Annuler';
            hint.style.display = 'block';
            this._map.getContainer().style.cursor = 'crosshair';
          } else {
            addBtn.style.background = 'linear-gradient(135deg,#f59e0b,#d97706)';
            addBtn.innerHTML = '<iconify-icon icon="solar:map-point-add-bold"></iconify-icon> Placer un radar';
            hint.style.display = 'none';
            this._map.getContainer().style.cursor = '';
            if (this._tempMarker) { this._map.removeLayer(this._tempMarker); this._tempMarker = null; }
          }
        });
      }

      this._map.on('click', (e) => {
        if (!this._addMode) return;

        // Remove previous temp marker
        if (this._tempMarker) this._map.removeLayer(this._tempMarker);

        // Add pulsing marker at clicked location
        this._tempMarker = L.circleMarker([e.latlng.lat, e.latlng.lng], {
          radius: 8,
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: 0.6,
          weight: 3
        }).addTo(this._map);

        // Exit add mode
        this._addMode = false;
        const addBtn2 = document.getElementById('cc-map-add-mode');
        const hint2 = document.getElementById('cc-map-hint');
        if (addBtn2) {
          addBtn2.style.background = 'linear-gradient(135deg,#f59e0b,#d97706)';
          addBtn2.innerHTML = '<iconify-icon icon="solar:map-point-add-bold"></iconify-icon> Placer un radar';
        }
        if (hint2) hint2.style.display = 'none';
        this._map.getContainer().style.cursor = '';

        // Open form pre-filled with coordinates
        this._openZoneForm(null, e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
      });

      // Fix Leaflet rendering in dynamic containers
      setTimeout(() => this._map.invalidateSize(), 300);
    } catch (e) {
      console.error('Erreur initialisation carte zones:', e);
    }
  },

  _openZoneForm(zone, prefillLat, prefillLng) {
    const isEdit = !!zone;
    const title = isEdit ? 'Modifier la zone' : 'Ajouter une zone';
    const defaultLat = prefillLat || (zone ? ((zone.coordinates && zone.coordinates.lat) || zone.lat || '') : '');
    const defaultLng = prefillLng || (zone ? ((zone.coordinates && zone.coordinates.lng) || zone.lng || '') : '');

    const formHtml = '<div style="display:flex;flex-direction:column;gap:14px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Nom *</label>'
      + '<input type="text" id="cc-zone-nom" class="form-control" value="' + (zone ? (zone.nom || '') : '') + '" placeholder="Nom de la zone" /></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Vitesse max (km/h) *</label>'
      + '<input type="number" id="cc-zone-vitesse" class="form-control" value="' + (zone ? (zone.vitesseMax || '') : '') + '" placeholder="50" /></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Tol\u00e9rance (km/h)</label>'
      + '<input type="number" id="cc-zone-tolerance" class="form-control" value="' + (zone ? (zone.tolerance || '') : '5') + '" placeholder="5" /></div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Latitude</label>'
      + '<input type="number" step="any" id="cc-zone-lat" class="form-control" value="' + defaultLat + '" placeholder="5.3600" /></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Longitude</label>'
      + '<input type="number" step="any" id="cc-zone-lng" class="form-control" value="' + defaultLng + '" placeholder="-4.0083" /></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Rayon (m)</label>'
      + '<input type="number" id="cc-zone-rayon" class="form-control" value="' + (zone ? ((zone.coordinates && zone.coordinates.rayon) || zone.rayon || '') : '200') + '" placeholder="200" /></div></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Type</label>'
      + '<select id="cc-zone-type" class="form-control">'
      + '<option value="ville"' + (zone && zone.type === 'ville' ? ' selected' : '') + '>Ville</option>'
      + '<option value="autoroute"' + (zone && zone.type === 'autoroute' ? ' selected' : '') + '>Autoroute</option>'
      + '<option value="zone_scolaire"' + (zone && zone.type === 'zone_scolaire' ? ' selected' : '') + '>Zone scolaire</option>'
      + '<option value="zone_travaux"' + (zone && zone.type === 'zone_travaux' ? ' selected' : '') + '>Zone travaux</option>'
      + '<option value="personnalisee"' + (zone && zone.type === 'personnalisee' ? ' selected' : '') + '>Personnalis\u00e9e</option>'
      + '</select></div></div>';

    Modal.form(title, formHtml, () => {
      const nom = document.getElementById('cc-zone-nom').value.trim();
      const vitesseMax = parseInt(document.getElementById('cc-zone-vitesse').value);
      const tolerance = parseInt(document.getElementById('cc-zone-tolerance').value) || 5;
      const lat = document.getElementById('cc-zone-lat').value;
      const lng = document.getElementById('cc-zone-lng').value;
      const rayon = parseInt(document.getElementById('cc-zone-rayon').value) || 200;
      const type = document.getElementById('cc-zone-type').value;

      if (!nom) { Toast.error('Le nom est requis'); return; }
      if (!vitesseMax || vitesseMax <= 0) { Toast.error('La vitesse max est requise'); return; }

      const data = {
        nom,
        vitesseMax,
        tolerance,
        coordinates: {
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          rayon
        },
        type,
        actif: zone ? zone.actif !== false : true
      };

      if (isEdit) {
        Store.update('zonesVitesse', zone.id, data);
        Toast.success('Zone modifi\u00e9e');
      } else {
        data.id = Utils.generateId('ZV');
        data.dateCreation = new Date().toISOString();
        Store.add('zonesVitesse', data);
        Toast.success('Zone ajout\u00e9e');
      }

      Modal.close();
      this._renderTab('zones');
    });
  },

  _editZone(id) {
    const zones = Store.get('zonesVitesse') || [];
    const zone = zones.find(z => z.id === id);
    if (zone) this._openZoneForm(zone);
  },

  _deleteZone(id) {
    Modal.confirm(
      'Supprimer la zone',
      '\u00cates-vous s\u00fbr de vouloir supprimer cette zone de vitesse ?',
      () => {
        Store.delete('zonesVitesse', id);
        Toast.success('Zone supprim\u00e9e');
        this._renderTab('zones');
      }
    );
  },

  _toggleZone(id, activate) {
    Store.update('zonesVitesse', id, { actif: activate });
    Toast.success(activate ? 'Zone activ\u00e9e' : 'Zone d\u00e9sactiv\u00e9e');
    this._renderTab('zones');
  },

  // ======================== TAB 3: STATISTIQUES ========================

  _renderStats(content) {
    const infractions = Store.get('infractionsVitesse') || [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recent = infractions.filter(i => new Date(i.date) >= thirtyDaysAgo);

    content.innerHTML = '<div class="cc-stats-grid">'
      + '<div class="cc-chart-card"><div class="cc-chart-title"><iconify-icon icon="solar:chart-bold-duotone" style="color:#6366f1;"></iconify-icon> Infractions par cat\u00e9gorie (30 jours)</div><canvas id="cc-chart-categories" height="250"></canvas></div>'
      + '<div class="cc-chart-card"><div class="cc-chart-title"><iconify-icon icon="solar:graph-up-bold-duotone" style="color:#f97316;"></iconify-icon> Infractions par jour (30 jours)</div><canvas id="cc-chart-daily" height="250"></canvas></div>'
      + '</div>'
      + '<div class="cc-stats-grid">'
      + '<div class="cc-chart-card"><div class="cc-chart-title"><iconify-icon icon="solar:users-group-two-rounded-bold-duotone" style="color:#ef4444;"></iconify-icon> Top 5 chauffeurs (30 jours)</div><ul class="cc-top-list" id="cc-top-chauffeurs"></ul></div>'
      + '<div class="cc-chart-card"><div class="cc-chart-title"><iconify-icon icon="solar:map-point-bold-duotone" style="color:#22c55e;"></iconify-icon> Top 5 zones (30 jours)</div><ul class="cc-top-list" id="cc-top-zones"></ul></div>'
      + '</div>';

    this._renderCategoryChart(recent);
    this._renderDailyChart(recent, thirtyDaysAgo, now);
    this._renderTopChauffeurs(recent);
    this._renderTopZones(recent);
  },

  _renderCategoryChart(recent) {
    const catCounts = { cat1: 0, cat2: 0, cat3: 0, cat4: 0 };
    recent.forEach(i => {
      if (catCounts[i.categorie] !== undefined) catCounts[i.categorie]++;
    });

    const ctx = document.getElementById('cc-chart-categories');
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Cat.1 (+1-5)', 'Cat.2 (+6-10)', 'Cat.3 (+11-20)', 'Cat.4 (+20)'],
        datasets: [{
          label: 'Infractions',
          data: [catCounts.cat1, catCounts.cat2, catCounts.cat3, catCounts.cat4],
          backgroundColor: ['rgba(234,179,8,.6)', 'rgba(249,115,22,.6)', 'rgba(239,68,68,.6)', 'rgba(127,29,29,.6)'],
          borderColor: ['#eab308', '#f97316', '#ef4444', '#7f1d1d'],
          borderWidth: 1,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
    this._charts.push(chart);
  },

  _renderDailyChart(recent, startDate, endDate) {
    // Build day labels + counts
    const days = [];
    const counts = [];
    const d = new Date(startDate);
    while (d <= endDate) {
      const key = d.toISOString().split('T')[0];
      days.push(key.slice(5)); // MM-DD
      counts.push(recent.filter(i => i.date === key).length);
      d.setDate(d.getDate() + 1);
    }

    const ctx = document.getElementById('cc-chart-daily');
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Infractions',
          data: counts,
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { ticks: { maxTicksLimit: 10 } }
        }
      }
    });
    this._charts.push(chart);
  },

  _renderTopChauffeurs(recent) {
    const counts = {};
    recent.forEach(i => {
      if (i.chauffeurId) counts[i.chauffeurId] = (counts[i.chauffeurId] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const el = document.getElementById('cc-top-chauffeurs');
    if (!el) return;

    if (sorted.length === 0) {
      el.innerHTML = '<li style="color:var(--text-muted);padding:20px;text-align:center;">Aucune donn\u00e9e</li>';
      return;
    }

    el.innerHTML = sorted.map(([id, count], idx) =>
      '<li><div style="display:flex;align-items:center;"><span class="cc-top-rank">' + (idx + 1) + '</span><span class="cc-top-name">' + this._getChauffeurName(id) + '</span></div><span class="cc-top-count">' + count + ' infraction' + (count > 1 ? 's' : '') + '</span></li>'
    ).join('');
  },

  _renderTopZones(recent) {
    const counts = {};
    recent.forEach(i => {
      const key = i.zoneNom || i.zoneId || 'Inconnue';
      counts[key] = (counts[key] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const el = document.getElementById('cc-top-zones');
    if (!el) return;

    if (sorted.length === 0) {
      el.innerHTML = '<li style="color:var(--text-muted);padding:20px;text-align:center;">Aucune donn\u00e9e</li>';
      return;
    }

    el.innerHTML = sorted.map(([name, count], idx) =>
      '<li><div style="display:flex;align-items:center;"><span class="cc-top-rank">' + (idx + 1) + '</span><span class="cc-top-name">' + name + '</span></div><span class="cc-top-count">' + count + ' infraction' + (count > 1 ? 's' : '') + '</span></li>'
    ).join('');
  },

  // ======================== TAB 4: CONTRAVENTIONS ========================

  _getContraventionsData() {
    const contraventions = Store.get('contraventions') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const monthContra = contraventions.filter(c => {
      const d = new Date(c.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const impayees = contraventions.filter(c => c.statut === 'impayee');
    const payees = monthContra.filter(c => c.statut === 'payee');
    const contestees = contraventions.filter(c => c.statut === 'contestee');
    const totalImpaye = impayees.reduce((s, c) => s + (c.montant || 0), 0);

    return {
      contraventions,
      chauffeurs,
      totalImpaye,
      nbMois: monthContra.length,
      nbPayees: payees.length,
      nbImpayees: impayees.length,
      nbContestees: contestees.length
    };
  },

  _renderContraventions(content) {
    const data = this._getContraventionsData();

    content.innerHTML = `
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-size:14px;font-weight:600;color:var(--text-muted);">${data.contraventions.length} contravention${data.contraventions.length !== 1 ? 's' : ''}</div>
        <button class="btn btn-primary" id="cc-btn-add-contravention">
          <iconify-icon icon="solar:add-circle-bold"></iconify-icon> Ajouter
        </button>
      </div>

      <!-- KPIs -->
      <div class="cc-kpi-grid">
        <div class="cc-kpi" id="cc-kpi-total-impaye" style="cursor:pointer;${data.totalImpaye > 0 ? 'border-color:rgba(239,68,68,.2);' : ''}">
          <div class="cc-kpi-top">
            <div class="cc-kpi-icon" style="background:rgba(239,68,68,.1);color:#ef4444;"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
            <div class="cc-kpi-label" style="color:#ef4444;">Total impay\u00e9</div>
          </div>
          <div class="cc-kpi-val" style="color:#ef4444;">${Utils.formatCurrency(data.totalImpaye)}</div>
        </div>
        <div class="cc-kpi">
          <div class="cc-kpi-top">
            <div class="cc-kpi-icon" style="background:rgba(99,102,241,.08);color:#6366f1;"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon></div>
            <div class="cc-kpi-label">Ce mois</div>
          </div>
          <div class="cc-kpi-val">${data.nbMois}</div>
        </div>
        <div class="cc-kpi">
          <div class="cc-kpi-top">
            <div class="cc-kpi-icon" style="background:rgba(16,185,129,.1);color:#10b981;"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div>
            <div class="cc-kpi-label">Pay\u00e9es (mois)</div>
          </div>
          <div class="cc-kpi-val" style="color:#10b981;">${data.nbPayees}</div>
        </div>
        <div class="cc-kpi">
          <div class="cc-kpi-top">
            <div class="cc-kpi-icon" style="background:rgba(245,158,11,.1);color:#f59e0b;"><iconify-icon icon="solar:chat-round-dots-bold-duotone"></iconify-icon></div>
            <div class="cc-kpi-label">Contest\u00e9es</div>
          </div>
          <div class="cc-kpi-val" style="color:#f59e0b;">${data.nbContestees}</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="d-card" style="padding:12px 16px;margin-bottom:16px;">
        <div class="cc-filter-row">
          <select id="cc-ctr-filter-chauffeur" class="cc-filter-select">
            <option value="">Tous les chauffeurs</option>
            ${data.chauffeurs.map(c => '<option value="' + c.id + '">' + c.prenom + ' ' + c.nom + '</option>').join('')}
          </select>
          <select id="cc-ctr-filter-statut" class="cc-filter-select">
            <option value="">Tous les statuts</option>
            <option value="impayee">Impay\u00e9e</option>
            <option value="payee">Pay\u00e9e</option>
            <option value="contestee">Contest\u00e9e</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="d-card" style="overflow-x:auto;">
        <div id="cc-contraventions-table" style="overflow-x:auto;-webkit-overflow-scrolling:touch;"></div>
      </div>
    `;

    this._bindContraventionsEvents(data);
  },

  _bindContraventionsEvents(data) {
    const chauffeurMap = {};
    data.chauffeurs.forEach(c => chauffeurMap[c.id] = c.prenom + ' ' + c.nom);

    const typeLabels = {
      exces_vitesse: 'Exc\u00e8s de vitesse',
      stationnement: 'Stationnement',
      feu_rouge: 'Feu rouge',
      documents: 'Documents',
      telephone: 'T\u00e9l\u00e9phone',
      autre: 'Autre'
    };

    const statusBadge = (statut) => {
      const map = {
        impayee: '<span class="badge badge-danger">Impay\u00e9e</span>',
        payee: '<span class="badge badge-success">Pay\u00e9e</span>',
        contestee: '<span class="badge badge-warning">Contest\u00e9e</span>'
      };
      return map[statut] || statut;
    };

    const renderTable = (items) => {
      Table.create({
        containerId: 'cc-contraventions-table',
        data: items,
        columns: [
          { label: 'Chauffeur', key: 'chauffeurId', render: (v) => {
            const nom = chauffeurMap[v.chauffeurId] || 'Inconnu';
            return '<div style="font-weight:600;font-size:12px;">' + nom + '</div>'
              + '<div style="font-size:10px;color:var(--text-muted);">' + Utils.formatDate(v.date) + (v.heure ? ' ' + v.heure : '') + '</div>'
              + (v.lieu ? '<div style="font-size:10px;color:var(--text-muted);">' + v.lieu + '</div>' : '');
          }},
          { label: 'Type', key: 'type', render: (v) => '<span style="font-size:12px;">' + (typeLabels[v.type] || v.type) + '</span>' },
          { label: 'Montant', key: 'montant', render: (v) => {
            return '<div style="font-weight:700;font-size:12px;">' + Utils.formatCurrency(v.montant || 0) + '</div>' + statusBadge(v.statut);
          }},
          { label: '', key: 'actions', sortable: false, render: (v) => {
            return '<div style="position:relative;display:inline-block;">'
              + '<button class="btn-icon" onclick="event.stopPropagation();ControleConduitePage._toggleActionMenu(\'' + v.id + '\')" style="font-size:18px;"><iconify-icon icon="solar:menu-dots-bold"></iconify-icon></button>'
              + '<div id="action-menu-' + v.id + '" style="display:none;position:absolute;right:0;top:100%;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.15);z-index:100;min-width:160px;padding:4px 0;">'
              + '<button onclick="event.stopPropagation();ControleConduitePage._editContravention(\'' + v.id + '\')" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border:none;background:none;color:var(--text-primary);font-size:13px;cursor:pointer;text-align:left;"><iconify-icon icon="solar:pen-bold" style="color:#3b82f6;"></iconify-icon> Modifier</button>'
              + (v.statut === 'impayee' || v.statut === 'contestee' ? ''
                + '<button onclick="event.stopPropagation();ControleConduitePage._markContraventionPaid(\'' + v.id + '\')" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border:none;background:none;color:var(--text-primary);font-size:13px;cursor:pointer;text-align:left;"><iconify-icon icon="solar:check-circle-bold" style="color:#22c55e;"></iconify-icon> Marquer payee</button>'
                + '<button onclick="event.stopPropagation();ControleConduitePage._payContraventionWave(\'' + v.id + '\')" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border:none;background:none;color:var(--text-primary);font-size:13px;cursor:pointer;text-align:left;"><iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#0D6EFD;"></iconify-icon> Payer via Wave</button>'
              : '')
              + '<button onclick="event.stopPropagation();ControleConduitePage._deleteContravention(\'' + v.id + '\')" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border:none;background:none;color:#ef4444;font-size:13px;cursor:pointer;text-align:left;"><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon> Supprimer</button>'
              + '</div></div>';
          }}
        ],
        sortKey: 'date',
        sortDir: 'desc',
        pageSize: 15,
        emptyMessage: 'Aucune contravention',
        onRowClick: (id) => ControleConduitePage._editContravention(id)
      });
    };

    renderTable(data.contraventions);

    // Filters
    const applyFilters = () => {
      const chauffeur = document.getElementById('cc-ctr-filter-chauffeur').value;
      const statut = document.getElementById('cc-ctr-filter-statut').value;
      let filtered = data.contraventions;
      if (chauffeur) filtered = filtered.filter(c => c.chauffeurId === chauffeur);
      if (statut) filtered = filtered.filter(c => c.statut === statut);
      renderTable(filtered);
    };

    const fc = document.getElementById('cc-ctr-filter-chauffeur');
    const fs = document.getElementById('cc-ctr-filter-statut');
    if (fc) fc.addEventListener('change', applyFilters);
    if (fs) fs.addEventListener('change', applyFilters);

    // KPI click
    const kpiEl = document.getElementById('cc-kpi-total-impaye');
    if (kpiEl) {
      kpiEl.addEventListener('click', () => {
        this._showContraventionsImpayeesDetail(data, chauffeurMap, typeLabels);
      });
    }

    // Add button
    const addBtn = document.getElementById('cc-btn-add-contravention');
    if (addBtn) addBtn.addEventListener('click', () => this._addContravention(data.chauffeurs));
  },

  _showContraventionsImpayeesDetail(data, chauffeurMap, typeLabels) {
    const impayees = data.contraventions.filter(c => c.statut === 'impayee');
    const total = impayees.reduce((s, c) => s + (c.montant || 0), 0);

    const byChauffeur = {};
    impayees.forEach(c => {
      const name = chauffeurMap[c.chauffeurId] || c.chauffeurId;
      if (!byChauffeur[name]) byChauffeur[name] = { items: [], total: 0 };
      byChauffeur[name].items.push(c);
      byChauffeur[name].total += (c.montant || 0);
    });

    let html = '<div style="margin-bottom:1rem;padding:1rem;border-radius:0.75rem;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-weight:700;color:#ef4444">' + impayees.length + ' contravention' + (impayees.length > 1 ? 's' : '') + ' impay\u00e9e' + (impayees.length > 1 ? 's' : '') + '</span>'
      + '<span style="font-weight:900;font-size:1.1rem;color:#ef4444">' + Utils.formatCurrency(total) + '</span>'
      + '</div></div>';

    Object.entries(byChauffeur).sort((a, b) => b[1].total - a[1].total).forEach(([name, group]) => {
      html += '<div style="margin-bottom:1rem"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;padding-bottom:0.25rem;border-bottom:1px solid #e2e8f0">'
        + '<span style="font-weight:800;font-size:0.9rem">' + name + '</span>'
        + '<span style="font-weight:700;color:#ef4444;font-size:0.85rem">' + Utils.formatCurrency(group.total) + '</span></div>'
        + group.items.map(c => '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0.5rem;font-size:0.82rem;border-radius:0.5rem;margin-bottom:2px;background:#f8fafc">'
          + '<span style="color:#64748b">' + Utils.formatDate(c.date) + ' \u00b7 ' + (typeLabels[c.type] || c.type) + (c.lieu ? ' \u00b7 ' + c.lieu : '') + '</span>'
          + '<span style="font-weight:700">' + Utils.formatCurrency(c.montant || 0) + '</span></div>').join('')
        + '</div>';
    });

    if (impayees.length === 0) {
      html = '<div style="text-align:center;padding:2rem;color:#94a3b8">Aucune contravention impay\u00e9e</div>';
    }

    Modal.form(
      '<iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:#ef4444"></iconify-icon> D\u00e9tail des contraventions impay\u00e9es',
      '<div style="max-height:60vh;overflow-y:auto">' + html + '</div>',
      null
    );
  },

  _contraventionTypeOptions: [
    { value: 'exces_vitesse', label: 'Exc\u00e8s de vitesse' },
    { value: 'stationnement', label: 'Stationnement' },
    { value: 'feu_rouge', label: 'Feu rouge' },
    { value: 'documents', label: 'Documents' },
    { value: 'telephone', label: 'T\u00e9l\u00e9phone au volant' },
    { value: 'autre', label: 'Autre' }
  ],

  _contraLineHtml(idx) {
    const colors = ['#ef4444', '#f97316', '#8b5cf6', '#3b82f6', '#06b6d4', '#22c55e'];
    const c = colors[idx % colors.length];
    return '<div class="contra-line" data-idx="' + idx + '" style="border-left:3px solid ' + c + ';background:linear-gradient(135deg,' + c + '08,transparent);border-radius:0 14px 14px 0;padding:16px 16px 16px 20px;margin-bottom:12px;position:relative;transition:all .2s;">'
      + (idx > 0 ? '<button type="button" onclick="this.closest(\'.contra-line\').remove();ControleConduitePage._updateContraLineCount()" style="position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:50%;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all .2s;" onmouseenter="this.style.background=\'#ef4444\';this.style.color=\'#fff\'" onmouseleave="this.style.background=\'rgba(239,68,68,.1)\';this.style.color=\'#ef4444\'"><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon></button>' : '')
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">'
      + '<div style="width:28px;height:28px;border-radius:8px;background:' + c + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;">'
      + '<iconify-icon icon="solar:document-text-bold"></iconify-icon></div>'
      + '<span style="font-size:13px;font-weight:700;color:' + c + ';">Infraction #' + (idx + 1) + '</span></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div><label style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Type d\'infraction *</label>'
      + '<select name="type_' + idx + '" required style="width:100%;font-size:13px;padding:10px 12px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-weight:500;appearance:auto;">'
      + this._contraventionTypeOptions.map(t => '<option value="' + t.value + '">' + t.label + '</option>').join('') + '</select></div>'
      + '<div><label style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Montant (FCFA) *</label>'
      + '<input type="number" name="montant_' + idx + '" required min="1" placeholder="25 000" style="width:100%;font-size:14px;font-weight:700;padding:10px 12px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box;"></div>'
      + '<div><label style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Lieu</label>'
      + '<input type="text" name="lieu_' + idx + '" placeholder="ex: Boulevard Latrille, Cocody" style="width:100%;font-size:13px;padding:10px 12px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box;"></div>'
      + '<div><label style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Description</label>'
      + '<input type="text" name="description_' + idx + '" placeholder="D\u00e9tails de l\'infraction..." style="width:100%;font-size:13px;padding:10px 12px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box;"></div>'
      + '</div></div>';
  },

  _updateContraLineCount() {
    const container = document.getElementById('cc-contra-lines-container');
    if (!container) return;
    const count = container.querySelectorAll('.contra-line').length;
    const badge = document.getElementById('cc-contra-count-badge');
    if (badge) badge.textContent = count;
  },

  _addContravention(chauffeurs, preselectedChauffeurId) {
    Modal.form(
      '<iconify-icon icon="solar:document-text-bold-duotone" style="color:#ef4444;"></iconify-icon> D\u00e9claration de contraventions',
      '<form id="cc-form-contravention" class="modal-form" style="padding:0;">'
        + '<div style="background:linear-gradient(135deg,#ef4444,#f97316);border-radius:14px;padding:20px;margin-bottom:20px;color:#fff;">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">'
        + '<iconify-icon icon="solar:danger-triangle-bold-duotone" style="font-size:24px;"></iconify-icon>'
        + '<span style="font-size:16px;font-weight:800;">Nouvelle d\u00e9claration</span></div>'
        + '<div style="font-size:12px;opacity:.8;">Renseignez le chauffeur concern\u00e9 et ajoutez une ou plusieurs infractions</div></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">'
        + '<div><label style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:4px;">'
        + '<iconify-icon icon="solar:user-bold-duotone" style="color:#6366f1;"></iconify-icon> Chauffeur *</label>'
        + '<select name="chauffeurId" id="cc-contra-chauffeur-select" required style="width:100%;font-size:13px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-weight:600;">'
        + '<option value="">S\u00e9lectionner un chauffeur...</option>'
        + chauffeurs.map(c => '<option value="' + c.id + '" data-vehicule="' + (c.vehiculeAssigne || '') + '" ' + (c.id === preselectedChauffeurId ? 'selected' : '') + '>' + c.prenom + ' ' + c.nom + '</option>').join('')
        + '</select></div>'
        + '<div><label style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:4px;">'
        + '<iconify-icon icon="solar:bus-bold-duotone" style="color:#14b8a6;"></iconify-icon> V\u00e9hicule</label>'
        + '<select name="vehiculeId" id="cc-contra-vehicule-select" style="width:100%;font-size:13px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-weight:600;">'
        + '<option value="">Aucun</option>'
        + (Store.get('vehicules') || []).map(v => '<option value="' + v.id + '">' + v.immatriculation + (v.marque ? ' \u2014 ' + v.marque + ' ' + (v.modele || '') : '') + '</option>').join('')
        + '</select></div></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">'
        + '<div><label style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:4px;">'
        + '<iconify-icon icon="solar:calendar-bold-duotone" style="color:#f97316;"></iconify-icon> Date *</label>'
        + '<input type="date" name="date" required value="' + new Date().toISOString().split('T')[0] + '" style="width:100%;font-size:13px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-weight:600;box-sizing:border-box;"></div>'
        + '<div><label style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:4px;">'
        + '<iconify-icon icon="solar:clock-circle-bold-duotone" style="color:#3b82f6;"></iconify-icon> Heure</label>'
        + '<input type="time" name="heure" style="width:100%;font-size:13px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-weight:600;box-sizing:border-box;"></div></div>'
        + '<div style="margin-bottom:16px;"><label style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:4px;">'
        + '<iconify-icon icon="solar:map-point-bold-duotone" style="color:#22c55e;"></iconify-icon> Lieu</label>'
        + '<input type="text" name="lieu" placeholder="ex: Boulevard Latrille, Cocody" style="width:100%;font-size:13px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-weight:500;box-sizing:border-box;"></div>'
        + '<div style="margin-bottom:20px;"><label style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:4px;">'
        + '<iconify-icon icon="solar:chat-round-dots-bold-duotone" style="color:#8b5cf6;"></iconify-icon> Note interne (optionnel)</label>'
        + '<textarea name="commentaire" rows="2" placeholder="Commentaire pour l\'\u00e9quipe..." style="width:100%;font-size:13px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);resize:vertical;box-sizing:border-box;"></textarea></div>'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid var(--border-color);">'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + '<div style="width:32px;height:32px;border-radius:10px;background:#ef4444;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;">'
        + '<iconify-icon icon="solar:list-bold"></iconify-icon></div>'
        + '<div><div style="font-size:14px;font-weight:800;color:var(--text-primary);">Infractions</div>'
        + '<div style="font-size:11px;color:var(--text-muted);"><span id="cc-contra-count-badge">1</span> infraction(s)</div></div></div>'
        + '<button type="button" id="cc-btn-add-contra-line" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(99,102,241,.3);transition:all .2s;" onmouseenter="this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 4px 16px rgba(99,102,241,.4)\'" onmouseleave="this.style.transform=\'\';this.style.boxShadow=\'0 2px 8px rgba(99,102,241,.3)\'">'
        + '<iconify-icon icon="solar:add-circle-bold"></iconify-icon> Ajouter</button></div>'
        + '<div id="cc-contra-lines-container">' + this._contraLineHtml(0) + '</div>'
        + '</form>',
      () => this._saveNewContravention(),
      'modal-lg'
    );

    setTimeout(() => {
      const chSelect = document.getElementById('cc-contra-chauffeur-select');
      const vhSelect = document.getElementById('cc-contra-vehicule-select');
      if (chSelect && vhSelect) {
        const sel = chSelect.options[chSelect.selectedIndex];
        if (sel && sel.dataset.vehicule) vhSelect.value = sel.dataset.vehicule;
        chSelect.addEventListener('change', () => {
          const opt = chSelect.options[chSelect.selectedIndex];
          if (opt && opt.dataset.vehicule) vhSelect.value = opt.dataset.vehicule;
        });
      }

      const btn = document.getElementById('cc-btn-add-contra-line');
      if (btn) {
        btn.addEventListener('click', () => {
          const container = document.getElementById('cc-contra-lines-container');
          const idx = container.querySelectorAll('.contra-line').length;
          container.insertAdjacentHTML('beforeend', ControleConduitePage._contraLineHtml(idx));
          ControleConduitePage._updateContraLineCount();
          const newLine = container.lastElementChild;
          if (newLine) newLine.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    }, 100);
  },

  async _saveNewContravention() {
    const form = document.getElementById('cc-form-contravention');
    const fd = new FormData(form);
    const chauffeurId = fd.get('chauffeurId');
    const vehiculeId = fd.get('vehiculeId') || '';
    const date = fd.get('date');
    const heure = fd.get('heure') || '';
    const lieuGlobal = fd.get('lieu') || '';
    const commentaire = fd.get('commentaire') || '';

    if (!chauffeurId) {
      Toast.show('Chauffeur requis', 'error');
      return;
    }
    const lines = document.querySelectorAll('#cc-contra-lines-container .contra-line');
    let count = 0;

    lines.forEach((line) => {
      const idx = line.dataset.idx;
      const type = fd.get('type_' + idx);
      const montant = parseInt(fd.get('montant_' + idx));
      const lieuLine = fd.get('lieu_' + idx) || '';
      const description = fd.get('description_' + idx) || '';

      if (!type || !montant || montant <= 0) return;

      const contravention = {
        id: 'CTR-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        chauffeurId,
        vehiculeId,
        date,
        heure,
        type,
        lieu: lieuLine || lieuGlobal,
        montant,
        description,
        commentaire,
        statut: 'impayee',
        dateCreation: new Date().toISOString()
      };

      Store.add('contraventions', contravention);

      if (chauffeurId && montant > 0) {
        Store.add('versements', {
          id: Utils.generateId('VRS'),
          chauffeurId,
          date,
          montantVerse: 0,
          montantAttendu: montant,
          manquant: montant,
          statut: 'manquant',
          traitementManquant: 'dette',
          reference: contravention.id,
          commentaire: 'Contravention \u2014 ' + (type || 'amende'),
          source: 'contravention',
          dateCreation: new Date().toISOString()
        });
      }

      count++;
    });

    if (count === 0) {
      Toast.show('Au moins une infraction avec montant requis', 'error');
      return;
    }

    Modal.close();
    Toast.show(count + ' contravention' + (count > 1 ? 's' : '') + ' ajout\u00e9e' + (count > 1 ? 's' : ''), 'success');
    this._renderTab('contraventions');
  },

  _editContravention(id) {
    const contraventions = Store.get('contraventions') || [];
    const c = contraventions.find(x => x.id === id);
    if (!c) return;

    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];
    const typeOptions = this._contraventionTypeOptions;

    const inputStyle = 'width:100%;padding:10px 14px;border:1px solid var(--border-color);border-radius:10px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);transition:border-color .2s,box-shadow .2s;outline:none;';
    const labelStyle = 'display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--text-primary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px;';
    const sectionBase = 'border-radius:12px;padding:16px;margin-top:14px;border:none;';
    const sectionColors = {
      assignation: 'background:rgba(59,130,246,0.06);',
      infraction: 'background:rgba(245,158,11,0.06);',
      financier: 'background:rgba(16,185,129,0.06);',
      notes: 'background:rgba(139,92,246,0.06);'
    };
    const sectionTitleStyle = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;';

    const statutColor = c.statut === 'payee' ? '#10b981' : c.statut === 'contestee' ? '#f59e0b' : '#ef4444';
    const statutLabel = c.statut === 'payee' ? 'Pay\u00e9e' : c.statut === 'contestee' ? 'Contest\u00e9e' : 'Impay\u00e9e';

    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone" style="color:#3b82f6;font-size:20px;"></iconify-icon> Modifier contravention',
      '<form id="cc-form-contravention-edit">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:10px;background:' + statutColor + '12;border:1px solid ' + statutColor + '30;margin-bottom:4px;">'
        + '<div style="display:flex;align-items:center;gap:8px;"><div style="width:8px;height:8px;border-radius:50%;background:' + statutColor + ';"></div>'
        + '<span style="font-size:13px;font-weight:600;color:' + statutColor + ';">' + statutLabel + '</span></div>'
        + '<span style="font-size:18px;font-weight:700;color:var(--text-primary);">' + (Utils.formatMoney ? Utils.formatMoney(c.montant || 0) : (c.montant || 0).toLocaleString()) + ' FCFA</span></div>'
        + '<div style="' + sectionBase + sectionColors.assignation + '">'
        + '<div style="' + sectionTitleStyle + '"><iconify-icon icon="solar:user-bold-duotone" style="color:#3b82f6;font-size:15px;"></iconify-icon> Assignation</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + '<div><label style="' + labelStyle + '"><iconify-icon icon="solar:user-bold" style="font-size:13px;"></iconify-icon> Chauffeur <span style="color:#ef4444;">*</span></label>'
        + '<select name="chauffeurId" style="' + inputStyle + '">'
        + chauffeurs.map(ch => '<option value="' + ch.id + '" ' + (ch.id === c.chauffeurId ? 'selected' : '') + '>' + ch.prenom + ' ' + ch.nom + '</option>').join('') + '</select></div>'
        + '<div><label style="' + labelStyle + '"><iconify-icon icon="solar:wheel-bold" style="font-size:13px;"></iconify-icon> V\u00e9hicule</label>'
        + '<select name="vehiculeId" style="' + inputStyle + '"><option value="">\u2014 Aucun \u2014</option>'
        + vehicules.map(v => '<option value="' + v.id + '" ' + (v.id === c.vehiculeId ? 'selected' : '') + '>' + (v.immatriculation || '') + ' ' + (v.marque || '') + ' ' + (v.modele || '') + '</option>').join('')
        + '</select></div></div></div>'
        + '<div style="' + sectionBase + sectionColors.infraction + '">'
        + '<div style="' + sectionTitleStyle + '"><iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:#f59e0b;font-size:15px;"></iconify-icon> Infraction</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
        + '<div><label style="' + labelStyle + '">Date <span style="color:#ef4444;">*</span></label>'
        + '<input type="date" name="date" value="' + (c.date || '') + '" style="' + inputStyle + '"></div>'
        + '<div><label style="' + labelStyle + '">Heure</label>'
        + '<input type="time" name="heure" value="' + (c.heure || '') + '" style="' + inputStyle + '"></div>'
        + '<div><label style="' + labelStyle + '">Type</label>'
        + '<select name="type" style="' + inputStyle + '">'
        + typeOptions.map(t => '<option value="' + t.value + '" ' + (t.value === c.type ? 'selected' : '') + '>' + t.label + '</option>').join('') + '</select></div></div>'
        + '<div style="margin-top:12px;"><label style="' + labelStyle + '"><iconify-icon icon="solar:map-point-bold" style="font-size:13px;"></iconify-icon> Lieu</label>'
        + '<input type="text" name="lieu" value="' + (c.lieu || '') + '" placeholder="Lieu de l\'infraction" style="' + inputStyle + '"></div></div>'
        + '<div style="' + sectionBase + sectionColors.financier + '">'
        + '<div style="' + sectionTitleStyle + '"><iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#10b981;font-size:15px;"></iconify-icon> Financier</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + '<div><label style="' + labelStyle + '">Montant (FCFA) <span style="color:#ef4444;">*</span></label>'
        + '<input type="number" name="montant" value="' + (c.montant || 0) + '" min="1" style="' + inputStyle + '"></div>'
        + '<div><label style="' + labelStyle + '">Statut</label>'
        + '<select name="statut" style="' + inputStyle + '">'
        + '<option value="impayee" ' + (c.statut === 'impayee' ? 'selected' : '') + '>Impay\u00e9e</option>'
        + '<option value="payee" ' + (c.statut === 'payee' ? 'selected' : '') + '>Pay\u00e9e</option>'
        + '<option value="contestee" ' + (c.statut === 'contestee' ? 'selected' : '') + '>Contest\u00e9e</option>'
        + '</select></div></div></div>'
        + '<div style="' + sectionBase + sectionColors.notes + '">'
        + '<div style="' + sectionTitleStyle + '"><iconify-icon icon="solar:document-text-bold-duotone" style="color:#8b5cf6;font-size:15px;"></iconify-icon> Notes</div>'
        + '<div><label style="' + labelStyle + '">Description</label>'
        + '<textarea name="description" rows="2" placeholder="D\u00e9tails de la contravention..." style="' + inputStyle + 'resize:vertical;">' + (c.description || '') + '</textarea></div>'
        + '<div style="margin-top:12px;"><label style="' + labelStyle + '">Commentaire admin</label>'
        + '<textarea name="commentaire" rows="2" placeholder="Note interne..." style="' + inputStyle + 'resize:vertical;">' + (c.commentaire || '') + '</textarea></div></div>'
        + (c.motifContestation ? '<div style="margin-top:14px;padding:12px 14px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:12px;">'
          + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#92400e;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px;">'
          + '<iconify-icon icon="solar:chat-round-warning-bold-duotone" style="font-size:15px;color:#f59e0b;"></iconify-icon> Contestation chauffeur</div>'
          + '<div style="font-size:13px;color:#92400e;line-height:1.5;">' + c.motifContestation + '</div></div>' : '')
        + '<div class="statut-indicator" style="display:none;"></div>'
        + '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-color);display:flex;justify-content:flex-end;">'
        + '<button type="button" onclick="event.preventDefault();Modal.close();ControleConduitePage._deleteContravention(\'' + id + '\')" style="display:flex;align-items:center;gap:6px;background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;">'
        + '<iconify-icon icon="solar:trash-bin-trash-bold" style="font-size:15px;"></iconify-icon> Supprimer cette contravention</button></div>'
        + '</form>',
      () => this._saveEditContravention(id)
    );
  },

  _saveEditContravention(id) {
    const form = document.getElementById('cc-form-contravention-edit');
    const fd = new FormData(form);
    const updates = {
      chauffeurId: fd.get('chauffeurId'),
      vehiculeId: fd.get('vehiculeId') || null,
      date: fd.get('date'),
      heure: fd.get('heure') || '',
      type: fd.get('type'),
      lieu: fd.get('lieu') || '',
      montant: parseInt(fd.get('montant')) || 0,
      statut: fd.get('statut'),
      description: fd.get('description') || '',
      commentaire: fd.get('commentaire') || ''
    };

    if (updates.statut === 'payee') {
      updates.datePaiement = new Date().toISOString();
    }

    Store.update('contraventions', id, updates);

    if (updates.statut === 'payee') {
      const versements = Store.get('versements') || [];
      const dette = versements.find(v => v.reference === id && v.traitementManquant === 'dette');
      if (dette) {
        Store.update('versements', dette.id, {
          montantVerse: dette.montantAttendu || dette.manquant,
          manquant: 0,
          statut: 'valide',
          traitementManquant: null,
          commentaire: (dette.commentaire || '') + ' \u2014 R\u00e9gl\u00e9e'
        });
      }
    }

    Modal.close();
    Toast.show('Contravention mise \u00e0 jour', 'success');
    this._renderTab('contraventions');
  },

  _markContraventionPaid(id) {
    if (!confirm('Marquer cette contravention comme pay\u00e9e ?')) return;
    Store.update('contraventions', id, {
      statut: 'payee',
      datePaiement: new Date().toISOString()
    });

    const versements = Store.get('versements') || [];
    const dette = versements.find(v => v.reference === id && v.traitementManquant === 'dette');
    if (dette) {
      Store.update('versements', dette.id, {
        montantVerse: dette.montantAttendu || dette.manquant,
        manquant: 0,
        statut: 'valide',
        traitementManquant: null,
        commentaire: (dette.commentaire || '') + ' \u2014 R\u00e9gl\u00e9e'
      });
    }

    Toast.show('Contravention marqu\u00e9e comme pay\u00e9e', 'success');
    this._renderTab('contraventions');
  },

  _deleteContravention(id) {
    if (!confirm('Supprimer cette contravention ?')) return;
    Store.delete('contraventions', id);
    Toast.show('Contravention supprim\u00e9e', 'success');
    this._renderTab('contraventions');
  },

  _toggleActionMenu(id) {
    // Fermer tous les autres menus
    document.querySelectorAll('[id^="action-menu-"]').forEach(el => {
      if (el.id !== 'action-menu-' + id) el.style.display = 'none';
    });
    const menu = document.getElementById('action-menu-' + id);
    if (menu) {
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
    // Fermer au clic ailleurs
    const close = (e) => {
      if (!e.target.closest('[id^="action-menu-"]') && !e.target.closest('.btn-icon')) {
        document.querySelectorAll('[id^="action-menu-"]').forEach(el => el.style.display = 'none');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 10);
  },

  async _payContraventionWave(id) {
    const contraventions = Store.get('contraventions') || [];
    const c = contraventions.find(x => x.id === id);
    if (!c) return;

    const chauffeurs = Store.get('chauffeurs') || [];
    const ch = chauffeurs.find(x => x.id === c.chauffeurId);
    const name = ch ? (ch.prenom + ' ' + ch.nom) : c.chauffeurId;

    if (!confirm('Payer la contravention de ' + name + ' (' + Utils.formatCurrency(c.montant) + ') via Wave ?')) return;

    Toast.show('Redirection vers Wave...', 'info');

    try {
      const apiBase = Store._apiBase || '/api';
      const res = await fetch(apiBase + '/contraventions/wave/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('pilote_token') || '')
        },
        body: JSON.stringify({ contraventionId: id })
      });

      const data = await res.json();

      if (!res.ok) {
        Toast.show(data.error || 'Erreur Wave', 'error');
        return;
      }

      if (data.waveLaunchUrl) {
        window.open(data.waveLaunchUrl, '_blank');

        const versements = Store.get('versements') || [];
        const dette = versements.find(v => v.reference === id && v.traitementManquant === 'dette');
        if (dette) {
          Store.update('versements', dette.id, {
            montantVerse: dette.montantAttendu || dette.manquant,
            manquant: 0,
            statut: 'valide',
            traitementManquant: null,
            commentaire: (dette.commentaire || '') + ' \u2014 R\u00e9gl\u00e9e (Wave)'
          });
        }
      } else {
        Toast.show('URL de paiement non disponible', 'error');
      }
    } catch (err) {
      console.error('Wave checkout error:', err);
      Toast.show('Erreur de connexion', 'error');
    }
  }
};
