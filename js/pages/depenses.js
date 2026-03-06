/**
 * DepensesPage - Gestion des dépenses véhicules (admin)
 */
const DepensesPage = {
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    container.innerHTML = this._template(data);
    this._bindEvents(data);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _typeLabels: {
    carburant: 'Carburant',
    peage: 'Péage',
    lavage: 'Lavage',
    assurance: 'Assurance',
    reparation: 'Réparation',
    stationnement: 'Stationnement',
    autre: 'Autre'
  },

  _typeOptions: [
    { value: 'carburant', label: 'Carburant' },
    { value: 'peage', label: 'Péage' },
    { value: 'lavage', label: 'Lavage' },
    { value: 'assurance', label: 'Assurance' },
    { value: 'reparation', label: 'Réparation' },
    { value: 'stationnement', label: 'Stationnement' },
    { value: 'autre', label: 'Autre' }
  ],

  _getData() {
    const depenses = Store.get('depenses') || [];
    const vehicules = Store.get('vehicules') || [];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const monthDep = depenses.filter(d => {
      const dt = new Date(d.date);
      return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear;
    });

    const totalMois = monthDep.reduce((s, d) => s + (d.montant || 0), 0);
    const nbMois = monthDep.length;

    // Top type ce mois
    const typeTotals = {};
    monthDep.forEach(d => {
      typeTotals[d.typeDepense] = (typeTotals[d.typeDepense] || 0) + (d.montant || 0);
    });
    let topType = '-';
    let topTypeAmount = 0;
    Object.entries(typeTotals).forEach(([type, amount]) => {
      if (amount > topTypeAmount) {
        topType = this._typeLabels[type] || type;
        topTypeAmount = amount;
      }
    });

    // Moyenne par véhicule ce mois
    const vehiculesActifs = new Set(monthDep.map(d => d.vehiculeId));
    const moyVehicule = vehiculesActifs.size > 0 ? Math.round(totalMois / vehiculesActifs.size) : 0;

    return {
      depenses,
      vehicules,
      totalMois,
      nbMois,
      topType,
      moyVehicule
    };
  },

  _template(data) {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:wallet-2-bold-duotone" style="vertical-align:middle;margin-right:8px"></iconify-icon>Dépenses</h1>
        <div class="header-actions">
          <button class="btn btn-outline" id="btn-export-depenses">
            <iconify-icon icon="solar:file-download-bold"></iconify-icon> Exporter
          </button>
          <button class="btn btn-primary" id="btn-add-depense">
            <iconify-icon icon="solar:add-circle-bold"></iconify-icon> Ajouter
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid grid-4">
        <div class="kpi-card kpi-warning">
          <div class="kpi-icon"><iconify-icon icon="solar:wallet-2-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(data.totalMois)}</div>
          <div class="kpi-label">Total ce mois</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${data.nbMois}</div>
          <div class="kpi-label">Dépenses ce mois</div>
        </div>
        <div class="kpi-card kpi-danger">
          <div class="kpi-icon"><iconify-icon icon="solar:tag-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${data.topType}</div>
          <div class="kpi-label">Top catégorie</div>
        </div>
        <div class="kpi-card kpi-info">
          <div class="kpi-icon"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(data.moyVehicule)}</div>
          <div class="kpi-label">Moy. / véhicule</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar" style="margin-bottom:1rem">
        <select id="filter-vehicule" class="filter-select">
          <option value="">Tous les véhicules</option>
          ${data.vehicules.map(v => `<option value="${v.id}">${v.marque} ${v.modele} - ${v.immatriculation || ''}</option>`).join('')}
        </select>
        <select id="filter-type" class="filter-select">
          <option value="">Tous les types</option>
          ${this._typeOptions.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
        <input type="date" id="filter-from" class="filter-select" placeholder="Du">
        <input type="date" id="filter-to" class="filter-select" placeholder="Au">
      </div>

      <!-- Table -->
      <div id="depenses-table"></div>
    `;
  },

  _bindEvents(data) {
    const vehiculeMap = {};
    data.vehicules.forEach(v => vehiculeMap[v.id] = `${v.marque} ${v.modele}`);

    const renderTable = (items) => {
      Table.create({
        container: '#depenses-table',
        data: items,
        columns: [
          { label: 'Date', key: 'date', render: (v) => Utils.formatDate(v.date) },
          { label: 'Véhicule', key: 'vehiculeId', render: (v) => vehiculeMap[v.vehiculeId] || v.vehiculeId },
          { label: 'Type', key: 'typeDepense', render: (v) => this._typeLabels[v.typeDepense] || v.typeDepense },
          { label: 'Montant', key: 'montant', render: (v) => Utils.formatCurrency(v.montant || 0) },
          { label: 'Km', key: 'kilometrage', render: (v) => v.kilometrage ? Utils.formatNumber(v.kilometrage) + ' km' : '-' },
          { label: 'Commentaire', key: 'commentaire', render: (v) => v.commentaire || '-' },
          { label: 'Actions', key: 'actions', render: (v) => `
            <button class="btn-icon" title="Modifier" onclick="DepensesPage._edit('${v.id}')"><iconify-icon icon="solar:pen-bold"></iconify-icon></button>
            <button class="btn-icon btn-danger" title="Supprimer" onclick="DepensesPage._delete('${v.id}')"><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon></button>
          `}
        ],
        sortKey: 'date',
        sortDir: 'desc',
        pageSize: 15,
        emptyMessage: 'Aucune dépense enregistrée'
      });
    };

    renderTable(data.depenses);

    // Filters
    const applyFilters = () => {
      const vehicule = document.getElementById('filter-vehicule').value;
      const type = document.getElementById('filter-type').value;
      const from = document.getElementById('filter-from').value;
      const to = document.getElementById('filter-to').value;
      let filtered = data.depenses;
      if (vehicule) filtered = filtered.filter(d => d.vehiculeId === vehicule);
      if (type) filtered = filtered.filter(d => d.typeDepense === type);
      if (from) filtered = filtered.filter(d => d.date >= from);
      if (to) filtered = filtered.filter(d => d.date <= to);
      renderTable(filtered);
    };

    document.getElementById('filter-vehicule').addEventListener('change', applyFilters);
    document.getElementById('filter-type').addEventListener('change', applyFilters);
    document.getElementById('filter-from').addEventListener('change', applyFilters);
    document.getElementById('filter-to').addEventListener('change', applyFilters);

    // Add button
    document.getElementById('btn-add-depense').addEventListener('click', () => this._add(data.vehicules));

    // Export button
    document.getElementById('btn-export-depenses').addEventListener('click', () => this._export(data));
  },

  _add(vehicules) {
    Modal.form(
      '<iconify-icon icon="solar:wallet-2-bold-duotone" style="color:#f59e0b;"></iconify-icon> Nouvelle dépense',
      `<form id="form-depense" class="modal-form">
        <div class="form-group">
          <label>Véhicule *</label>
          <select name="vehiculeId" required>
            <option value="">Sélectionner...</option>
            ${vehicules.map(v => `<option value="${v.id}">${v.marque} ${v.modele} - ${v.immatriculation || ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Type de dépense *</label>
          <select name="typeDepense" required>
            ${this._typeOptions.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Montant (FCFA) *</label>
          <input type="number" name="montant" required min="1" placeholder="0">
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Kilométrage</label>
          <input type="number" name="kilometrage" min="0" placeholder="km au compteur">
        </div>
        <div class="form-group">
          <label>Commentaire</label>
          <textarea name="commentaire" rows="2" placeholder="Détails de la dépense..."></textarea>
        </div>
      </form>`,
      () => this._saveNew()
    );
  },

  _saveNew() {
    const form = document.getElementById('form-depense');
    const fd = new FormData(form);
    const vehiculeId = fd.get('vehiculeId');
    const montant = parseInt(fd.get('montant'));

    if (!vehiculeId || !montant) {
      Toast.show('Véhicule et montant requis', 'error');
      return;
    }

    const depense = {
      id: 'DEP-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      vehiculeId,
      typeDepense: fd.get('typeDepense'),
      montant,
      date: fd.get('date'),
      kilometrage: fd.get('kilometrage') ? parseInt(fd.get('kilometrage')) : null,
      commentaire: fd.get('commentaire') || '',
      dateCreation: new Date().toISOString()
    };

    Store.add('depenses', depense);
    Modal.close();
    Toast.show('Dépense ajoutée', 'success');
    this.render();
  },

  _edit(id) {
    const depenses = Store.get('depenses') || [];
    const d = depenses.find(x => x.id === id);
    if (!d) return;

    const vehicules = Store.get('vehicules') || [];

    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone" style="color:#3b82f6;"></iconify-icon> Modifier dépense',
      `<form id="form-depense-edit" class="modal-form">
        <div class="form-group">
          <label>Véhicule</label>
          <select name="vehiculeId">
            ${vehicules.map(v => `<option value="${v.id}" ${v.id === d.vehiculeId ? 'selected' : ''}>${v.marque} ${v.modele} - ${v.immatriculation || ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Type de dépense</label>
          <select name="typeDepense">
            ${this._typeOptions.map(t => `<option value="${t.value}" ${t.value === d.typeDepense ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Montant (FCFA)</label>
          <input type="number" name="montant" value="${d.montant || 0}" min="1">
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" name="date" value="${d.date || ''}">
        </div>
        <div class="form-group">
          <label>Kilométrage</label>
          <input type="number" name="kilometrage" value="${d.kilometrage || ''}" min="0">
        </div>
        <div class="form-group">
          <label>Commentaire</label>
          <textarea name="commentaire" rows="2">${d.commentaire || ''}</textarea>
        </div>
      </form>`,
      () => this._saveEdit(id)
    );
  },

  _saveEdit(id) {
    const form = document.getElementById('form-depense-edit');
    const fd = new FormData(form);
    const updates = {
      vehiculeId: fd.get('vehiculeId'),
      typeDepense: fd.get('typeDepense'),
      montant: parseInt(fd.get('montant')) || 0,
      date: fd.get('date'),
      kilometrage: fd.get('kilometrage') ? parseInt(fd.get('kilometrage')) : null,
      commentaire: fd.get('commentaire') || ''
    };

    Store.update('depenses', id, updates);
    Modal.close();
    Toast.show('Dépense mise à jour', 'success');
    this.render();
  },

  _delete(id) {
    if (!confirm('Supprimer cette dépense ?')) return;
    Store.delete('depenses', id);
    Toast.show('Dépense supprimée', 'success');
    this.render();
  },

  _export(data) {
    if (!data.depenses.length) {
      Toast.show('Aucune dépense à exporter', 'error');
      return;
    }

    const vehiculeMap = {};
    data.vehicules.forEach(v => vehiculeMap[v.id] = `${v.marque} ${v.modele}`);

    const headers = ['Date', 'Véhicule', 'Type', 'Montant (FCFA)', 'Kilométrage', 'Commentaire'];
    const rows = data.depenses
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(d => [
        d.date || '',
        vehiculeMap[d.vehiculeId] || d.vehiculeId,
        this._typeLabels[d.typeDepense] || d.typeDepense,
        d.montant || 0,
        d.kilometrage || '',
        (d.commentaire || '').replace(/"/g, '""')
      ]);

    let csv = '\uFEFF' + headers.join(';') + '\n';
    rows.forEach(r => {
      csv += r.map(v => `"${v}"`).join(';') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `depenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('Export CSV téléchargé', 'success');
  }
};
