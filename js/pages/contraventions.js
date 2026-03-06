/**
 * ContraventionsPage - Gestion des contraventions chauffeurs (admin)
 */
const ContraventionsPage = {
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

  _getData() {
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

  _template(data) {
    const types = [
      { value: 'exces_vitesse', label: 'Exc\u00e8s de vitesse' },
      { value: 'stationnement', label: 'Stationnement' },
      { value: 'feu_rouge', label: 'Feu rouge' },
      { value: 'documents', label: 'Documents' },
      { value: 'telephone', label: 'T\u00e9l\u00e9phone au volant' },
      { value: 'autre', label: 'Autre' }
    ];
    const typeLabels = {};
    types.forEach(t => typeLabels[t.value] = t.label);

    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:document-text-bold-duotone" style="vertical-align:middle;margin-right:8px"></iconify-icon>Contraventions</h1>
        <div class="header-actions">
          <button class="btn btn-primary" id="btn-add-contravention">
            <iconify-icon icon="solar:add-circle-bold"></iconify-icon> Ajouter
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid grid-4">
        <div class="kpi-card kpi-danger">
          <div class="kpi-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(data.totalImpaye)}</div>
          <div class="kpi-label">Total impay\u00e9</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${data.nbMois}</div>
          <div class="kpi-label">Ce mois</div>
        </div>
        <div class="kpi-card kpi-success">
          <div class="kpi-icon"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${data.nbPayees}</div>
          <div class="kpi-label">Pay\u00e9es (mois)</div>
        </div>
        <div class="kpi-card kpi-warning">
          <div class="kpi-icon"><iconify-icon icon="solar:chat-round-dots-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${data.nbContestees}</div>
          <div class="kpi-label">Contest\u00e9es</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar" style="margin-bottom:1rem">
        <select id="filter-chauffeur" class="filter-select">
          <option value="">Tous les chauffeurs</option>
          ${data.chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
        </select>
        <select id="filter-statut" class="filter-select">
          <option value="">Tous les statuts</option>
          <option value="impayee">Impay\u00e9e</option>
          <option value="payee">Pay\u00e9e</option>
          <option value="contestee">Contest\u00e9e</option>
        </select>
      </div>

      <!-- Table -->
      <div id="contraventions-table"></div>
    `;
  },

  _bindEvents(data) {
    const chauffeurMap = {};
    data.chauffeurs.forEach(c => chauffeurMap[c.id] = `${c.prenom} ${c.nom}`);

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
        container: '#contraventions-table',
        data: items,
        columns: [
          { label: 'Chauffeur', key: 'chauffeurId', render: (v) => chauffeurMap[v.chauffeurId] || v.chauffeurId },
          { label: 'Date', key: 'date', render: (v) => Utils.formatDate(v.date) },
          { label: 'Type', key: 'type', render: (v) => typeLabels[v.type] || v.type },
          { label: 'Lieu', key: 'lieu', render: (v) => v.lieu || '-' },
          { label: 'Montant', key: 'montant', render: (v) => Utils.formatCurrency(v.montant || 0) },
          { label: 'Statut', key: 'statut', render: (v) => {
            let html = statusBadge(v.statut);
            if (v.motifContestation) {
              html += ` <span title="${v.motifContestation}" style="cursor:help;font-size:0.7rem;color:#94a3b8"><iconify-icon icon="solar:chat-round-dots-bold"></iconify-icon></span>`;
            }
            return html;
          }},
          { label: 'Actions', key: 'actions', render: (v) => {
            let btns = `<button class="btn-icon" title="Modifier" onclick="ContraventionsPage._edit('${v.id}')"><iconify-icon icon="solar:pen-bold"></iconify-icon></button>`;
            if (v.statut === 'impayee' || v.statut === 'contestee') {
              btns += ` <button class="btn-icon btn-success" title="Marquer pay\u00e9e" onclick="ContraventionsPage._markPaid('${v.id}')"><iconify-icon icon="solar:check-circle-bold"></iconify-icon></button>`;
            }
            btns += ` <button class="btn-icon btn-danger" title="Supprimer" onclick="ContraventionsPage._delete('${v.id}')"><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon></button>`;
            return btns;
          }}
        ],
        sortKey: 'date',
        sortDir: 'desc',
        pageSize: 15,
        emptyMessage: 'Aucune contravention'
      });
    };

    renderTable(data.contraventions);

    // Filters
    const applyFilters = () => {
      const chauffeur = document.getElementById('filter-chauffeur').value;
      const statut = document.getElementById('filter-statut').value;
      let filtered = data.contraventions;
      if (chauffeur) filtered = filtered.filter(c => c.chauffeurId === chauffeur);
      if (statut) filtered = filtered.filter(c => c.statut === statut);
      renderTable(filtered);
    };

    document.getElementById('filter-chauffeur').addEventListener('change', applyFilters);
    document.getElementById('filter-statut').addEventListener('change', applyFilters);

    // Add button
    document.getElementById('btn-add-contravention').addEventListener('click', () => this._add(data.chauffeurs));
  },

  _add(chauffeurs) {
    const typeOptions = [
      { value: 'exces_vitesse', label: 'Exc\u00e8s de vitesse' },
      { value: 'stationnement', label: 'Stationnement' },
      { value: 'feu_rouge', label: 'Feu rouge' },
      { value: 'documents', label: 'Documents' },
      { value: 'telephone', label: 'T\u00e9l\u00e9phone au volant' },
      { value: 'autre', label: 'Autre' }
    ];

    Modal.show({
      title: 'Nouvelle contravention',
      content: `
        <form id="form-contravention" class="modal-form">
          <div class="form-group">
            <label>Chauffeur *</label>
            <select name="chauffeurId" required>
              <option value="">S\u00e9lectionner...</option>
              ${chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Date *</label>
            <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label>Type *</label>
            <select name="type" required>
              ${typeOptions.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Lieu</label>
            <input type="text" name="lieu" placeholder="ex: Boulevard Latrille, Cocody">
          </div>
          <div class="form-group">
            <label>Montant (FCFA) *</label>
            <input type="number" name="montant" required min="1" placeholder="0">
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea name="description" rows="2" placeholder="D\u00e9tails de l'infraction..."></textarea>
          </div>
          <div class="form-group">
            <label>Commentaire admin</label>
            <textarea name="commentaire" rows="2" placeholder="Note interne..."></textarea>
          </div>
        </form>
      `,
      actions: [
        { label: 'Annuler', class: 'btn btn-outline', onclick: () => Modal.close() },
        { label: 'Enregistrer', class: 'btn btn-primary', onclick: () => this._saveNew() }
      ]
    });
  },

  async _saveNew() {
    const form = document.getElementById('form-contravention');
    const fd = new FormData(form);
    const chauffeurId = fd.get('chauffeurId');
    const montant = parseInt(fd.get('montant'));

    if (!chauffeurId || !montant) {
      Utils.toast('Chauffeur et montant requis', 'error');
      return;
    }

    const chauffeur = (Store.get('chauffeurs') || []).find(c => c.id === chauffeurId);

    const contravention = {
      id: 'CTR-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      chauffeurId,
      vehiculeId: chauffeur ? chauffeur.vehiculeAssigne : '',
      date: fd.get('date'),
      type: fd.get('type'),
      lieu: fd.get('lieu') || '',
      montant,
      description: fd.get('description') || '',
      commentaire: fd.get('commentaire') || '',
      statut: 'impayee',
      dateCreation: new Date().toISOString()
    };

    Store.add('contraventions', contravention);
    Modal.close();
    Utils.toast('Contravention ajout\u00e9e', 'success');
    this.render();
  },

  _edit(id) {
    const contraventions = Store.get('contraventions') || [];
    const c = contraventions.find(x => x.id === id);
    if (!c) return;

    const chauffeurs = Store.get('chauffeurs') || [];
    const typeOptions = [
      { value: 'exces_vitesse', label: 'Exc\u00e8s de vitesse' },
      { value: 'stationnement', label: 'Stationnement' },
      { value: 'feu_rouge', label: 'Feu rouge' },
      { value: 'documents', label: 'Documents' },
      { value: 'telephone', label: 'T\u00e9l\u00e9phone au volant' },
      { value: 'autre', label: 'Autre' }
    ];

    Modal.show({
      title: 'Modifier contravention',
      content: `
        <form id="form-contravention-edit" class="modal-form">
          <div class="form-group">
            <label>Chauffeur</label>
            <select name="chauffeurId">
              ${chauffeurs.map(ch => `<option value="${ch.id}" ${ch.id === c.chauffeurId ? 'selected' : ''}>${ch.prenom} ${ch.nom}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Date</label>
            <input type="date" name="date" value="${c.date || ''}">
          </div>
          <div class="form-group">
            <label>Type</label>
            <select name="type">
              ${typeOptions.map(t => `<option value="${t.value}" ${t.value === c.type ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Lieu</label>
            <input type="text" name="lieu" value="${c.lieu || ''}">
          </div>
          <div class="form-group">
            <label>Montant (FCFA)</label>
            <input type="number" name="montant" value="${c.montant || 0}" min="1">
          </div>
          <div class="form-group">
            <label>Statut</label>
            <select name="statut">
              <option value="impayee" ${c.statut === 'impayee' ? 'selected' : ''}>Impay\u00e9e</option>
              <option value="payee" ${c.statut === 'payee' ? 'selected' : ''}>Pay\u00e9e</option>
              <option value="contestee" ${c.statut === 'contestee' ? 'selected' : ''}>Contest\u00e9e</option>
            </select>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea name="description" rows="2">${c.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Commentaire admin</label>
            <textarea name="commentaire" rows="2">${c.commentaire || ''}</textarea>
          </div>
          ${c.motifContestation ? `
          <div class="form-group">
            <label>Motif de contestation (chauffeur)</label>
            <div style="padding:0.75rem;background:rgba(245,158,11,0.08);border-radius:0.5rem;font-size:0.85rem;color:#92400e">${c.motifContestation}</div>
          </div>
          ` : ''}
        </form>
      `,
      actions: [
        { label: 'Annuler', class: 'btn btn-outline', onclick: () => Modal.close() },
        { label: 'Sauvegarder', class: 'btn btn-primary', onclick: () => this._saveEdit(id) }
      ]
    });
  },

  _saveEdit(id) {
    const form = document.getElementById('form-contravention-edit');
    const fd = new FormData(form);
    const updates = {
      chauffeurId: fd.get('chauffeurId'),
      date: fd.get('date'),
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
    Modal.close();
    Utils.toast('Contravention mise \u00e0 jour', 'success');
    this.render();
  },

  _markPaid(id) {
    if (!confirm('Marquer cette contravention comme pay\u00e9e ?')) return;
    Store.update('contraventions', id, {
      statut: 'payee',
      datePaiement: new Date().toISOString()
    });
    Utils.toast('Contravention marqu\u00e9e comme pay\u00e9e', 'success');
    this.render();
  },

  _delete(id) {
    if (!confirm('Supprimer cette contravention ?')) return;
    Store.delete('contraventions', id);
    Utils.toast('Contravention supprim\u00e9e', 'success');
    this.render();
  }
};
