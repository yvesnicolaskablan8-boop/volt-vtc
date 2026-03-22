/**
 * ControleConduitePage — Controle de conduite : infractions vitesse, zones, statistiques
 */
const ControleConduitePage = {
  _activeTab: 'infractions',
  _charts: [],
  _map: null,

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
          <iconify-icon icon="solar:map-point-bold-duotone"></iconify-icon> Zones de vitesse
        </button>
        <button class="cc-tab ${this._activeTab === 'statistiques' ? 'active' : ''}" data-tab="statistiques">
          <iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Statistiques
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

        #cc-zones-map { height:350px;border-radius:14px;border:1px solid var(--border-color);margin-bottom:20px; }

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
        <div id="cc-infractions-table"></div>
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
        { label: 'Zone', key: 'zoneNom', render: (i) => i.zoneNom || '-' },
        { label: 'Vitesse / Limite', key: 'vitesse', render: (i) => '<span style="font-weight:700;color:#ef4444;">' + (i.vitesse || 0) + '</span> / <span style="color:var(--text-muted);">' + (i.vitesseMax || 0) + ' km/h</span>' },
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

      <!-- Map -->
      <div id="cc-zones-map"></div>

      <!-- Zone cards -->
      <div class="cc-zone-cards" id="cc-zone-cards">
        ${zones.length === 0 ? '<div class="empty-state" style="padding:40px;grid-column:1/-1;"><iconify-icon icon="solar:map-point-bold-duotone" style="font-size:3rem;color:var(--text-muted);"></iconify-icon><h3>Aucune zone</h3><p style="color:var(--text-muted);">Ajoutez des zones de vitesse pour le suivi automatique.</p></div>' : zones.map(z => '<div class="cc-zone-card"><div class="cc-zone-header"><div><div class="cc-zone-name">' + (z.nom || 'Zone sans nom') + '</div><span class="cc-type-badge cc-type-' + (z.type || 'personnalisee') + '">' + (typeLabels[z.type] || z.type || 'Personnalis\u00e9e') + '</span></div><button class="cc-toggle ' + (z.actif !== false ? 'active' : '') + '" title="' + (z.actif !== false ? 'Active' : 'Inactive') + '" onclick="ControleConduitePage._toggleZone(\'' + z.id + '\',' + (z.actif === false) + ')"></button></div><div class="cc-zone-meta"><div class="cc-zone-meta-item"><iconify-icon icon="solar:speedometer-bold-duotone"></iconify-icon> ' + (z.vitesseMax || 0) + ' km/h</div><div class="cc-zone-meta-item"><iconify-icon icon="solar:shield-bold-duotone"></iconify-icon> Tol\u00e9rance : ' + (z.tolerance || 0) + ' km/h</div><div class="cc-zone-meta-item"><iconify-icon icon="solar:ruler-bold-duotone"></iconify-icon> Rayon : ' + (z.rayon || 0) + ' m</div>' + (z.lat && z.lng ? '<div class="cc-zone-meta-item"><iconify-icon icon="solar:map-point-bold-duotone"></iconify-icon> ' + parseFloat(z.lat).toFixed(4) + ', ' + parseFloat(z.lng).toFixed(4) + '</div>' : '') + '</div><div class="cc-zone-actions"><button class="btn btn-sm btn-secondary" onclick="ControleConduitePage._editZone(\'' + z.id + '\')"><iconify-icon icon="solar:pen-bold"></iconify-icon> Modifier</button><button class="btn btn-sm btn-danger" onclick="ControleConduitePage._deleteZone(\'' + z.id + '\')"><iconify-icon icon="solar:trash-bin-minimalistic-bold"></iconify-icon> Supprimer</button></div></div>').join('')}
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
      // Default center: Dakar
      const defaultCenter = [14.6928, -17.4467];
      this._map = L.map('cc-zones-map').setView(defaultCenter, 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '\u00a9 OpenStreetMap',
        maxZoom: 18
      }).addTo(this._map);

      const bounds = [];
      zones.forEach(z => {
        if (z.lat && z.lng) {
          const lat = parseFloat(z.lat);
          const lng = parseFloat(z.lng);
          const rayon = z.rayon || 200;
          const color = z.actif !== false ? '#6366f1' : '#9ca3af';

          L.circle([lat, lng], {
            radius: rayon,
            color: color,
            fillColor: color,
            fillOpacity: 0.15,
            weight: 2
          }).addTo(this._map).bindPopup('<strong>' + (z.nom || 'Zone') + '</strong><br>' + (z.vitesseMax || 0) + ' km/h max');

          bounds.push([lat, lng]);
        }
      });

      if (bounds.length > 0) {
        this._map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      }

      // Fix Leaflet rendering in dynamic containers
      setTimeout(() => this._map.invalidateSize(), 300);
    } catch (e) {
      console.error('Erreur initialisation carte zones:', e);
    }
  },

  _openZoneForm(zone) {
    const isEdit = !!zone;
    const title = isEdit ? 'Modifier la zone' : 'Ajouter une zone';

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
      + '<input type="number" step="any" id="cc-zone-lat" class="form-control" value="' + (zone ? (zone.lat || '') : '') + '" placeholder="14.6928" /></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Longitude</label>'
      + '<input type="number" step="any" id="cc-zone-lng" class="form-control" value="' + (zone ? (zone.lng || '') : '') + '" placeholder="-17.4467" /></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;display:block;">Rayon (m)</label>'
      + '<input type="number" id="cc-zone-rayon" class="form-control" value="' + (zone ? (zone.rayon || '') : '200') + '" placeholder="200" /></div></div>'
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
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        rayon,
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
  }
};
