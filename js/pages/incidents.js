/**
 * IncidentsPage — Module Gestion des Incidents/Sinistres
 * Onglets: Tous, Ouverts, Résolus
 */
const IncidentsPage = {
  _activeTab: 'tous',
  _table: null,

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._pageTemplate();
    this._renderTab(this._activeTab);
    this._bindTabEvents();
  },

  destroy() {
    this._table = null;
  },

  // =================== TEMPLATES ===================

  _pageTemplate() {
    const incidents = Store.get('incidents') || [];
    const ouverts = incidents.filter(i => i.statut === 'ouvert' || i.statut === 'en_cours');
    const coutTotal = incidents.reduce((s, i) => s + (i.coutReel || i.coutEstime || 0), 0);

    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:#f97316;"></iconify-icon> Incidents & Sinistres</h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="IncidentsPage._addIncident()">
            <iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Déclarer un incident
          </button>
        </div>
      </div>

      <!-- Stats header -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:var(--space-lg);">
        <div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-secondary);border-left:4px solid #f97316;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Total incidents</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;">${incidents.length}</div>
        </div>
        <div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-secondary);border-left:4px solid #ef4444;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">En cours</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:#ef4444;">${ouverts.length}</div>
        </div>
        <div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-secondary);border-left:4px solid #f59e0b;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Coût total</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:#f59e0b;">${Utils.formatCurrency(coutTotal)}</div>
        </div>
        <div style="padding:14px;border-radius:var(--radius-md);background:var(--bg-secondary);border-left:4px solid #22c55e;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Résolus</div>
          <div style="font-size:var(--font-size-xl);font-weight:800;color:#22c55e;">${incidents.filter(i => i.statut === 'resolu' || i.statut === 'clos').length}</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="incident-tabs" style="display:flex;gap:0;margin-bottom:var(--space-lg);border-bottom:2px solid var(--border-color);overflow-x:auto;">
        <button class="incident-tab ${this._activeTab === 'tous' ? 'active' : ''}" data-tab="tous">
          <iconify-icon icon="solar:list-bold-duotone"></iconify-icon> Tous (${incidents.length})
        </button>
        <button class="incident-tab ${this._activeTab === 'ouverts' ? 'active' : ''}" data-tab="ouverts">
          <iconify-icon icon="solar:danger-circle-bold-duotone"></iconify-icon> Ouverts (${ouverts.length})
        </button>
        <button class="incident-tab ${this._activeTab === 'resolus' ? 'active' : ''}" data-tab="resolus">
          <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Résolus
        </button>
      </div>

      <div id="incident-tab-content"></div>

      <style>
        .incident-tab { background:none;border:none;padding:10px 20px;cursor:pointer;font-size:var(--font-size-sm);font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;gap:6px;white-space:nowrap;font-family:inherit; }
        .incident-tab:hover { color:var(--text-primary);background:var(--bg-secondary);border-radius:var(--radius-md) var(--radius-md) 0 0; }
        .incident-tab.active { color:#f97316;border-bottom-color:#f97316; }
        .incident-gravite { display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600; }
        .incident-gravite.mineur { background:rgba(59,130,246,0.12);color:#3b82f6; }
        .incident-gravite.moyen { background:rgba(245,158,11,0.12);color:#f59e0b; }
        .incident-gravite.grave { background:rgba(249,115,22,0.12);color:#f97316; }
        .incident-gravite.critique { background:rgba(239,68,68,0.12);color:#ef4444; }
      </style>
    `;
  },

  _bindTabEvents() {
    document.querySelectorAll('.incident-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        document.querySelectorAll('.incident-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderTab(this._activeTab);
      });
    });
  },

  _renderTab(tab) {
    const content = document.getElementById('incident-tab-content');
    if (!content) return;

    let incidents = Store.get('incidents') || [];

    if (tab === 'ouverts') {
      incidents = incidents.filter(i => i.statut === 'ouvert' || i.statut === 'en_cours');
    } else if (tab === 'resolus') {
      incidents = incidents.filter(i => i.statut === 'resolu' || i.statut === 'clos');
    }

    // Sort by date desc
    incidents.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];

    const typeLabels = { accident: 'Accident', panne: 'Panne', vol: 'Vol', agression: 'Agression', contravention: 'Contravention', autre: 'Autre' };
    const typeIcons = { accident: 'solar:crash-bold-duotone', panne: 'solar:engine-bold-duotone', vol: 'solar:lock-keyhole-unlocked-bold-duotone', agression: 'solar:shield-warning-bold-duotone', contravention: 'solar:document-text-bold-duotone', autre: 'solar:question-circle-bold-duotone' };
    const graviteLabels = { mineur: 'Mineur', moyen: 'Moyen', grave: 'Grave', critique: 'Critique' };

    if (incidents.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <iconify-icon icon="solar:shield-check-bold-duotone" style="font-size:3rem;color:var(--success);"></iconify-icon>
          <h3>Aucun incident ${tab === 'ouverts' ? 'en cours' : tab === 'resolus' ? 'résolu' : ''}</h3>
          <p style="color:var(--text-muted);">Les incidents déclarés apparaîtront ici.</p>
        </div>
      `;
      return;
    }

    Table.create({
      containerId: 'incident-tab-content',
      columns: [
        { label: 'Date', key: 'date', render: (i) => `<div><div style="font-weight:600;">${Utils.formatDate(i.date)}</div>${i.heure ? `<div style="font-size:10px;color:var(--text-muted);">${i.heure}</div>` : ''}</div>` },
        { label: 'Type', key: 'type', render: (i) => `<div style="display:flex;align-items:center;gap:6px;"><iconify-icon icon="${typeIcons[i.type] || typeIcons.autre}" style="color:#f97316;"></iconify-icon> ${typeLabels[i.type] || i.type}</div>` },
        { label: 'Chauffeur', key: 'chauffeurId', render: (i) => {
          const ch = chauffeurs.find(c => c.id === i.chauffeurId);
          return ch ? `<a href="#/chauffeurs/${ch.id}" style="color:var(--primary);text-decoration:none;">${ch.prenom} ${ch.nom}</a>` : i.chauffeurId;
        }},
        { label: 'Véhicule', key: 'vehiculeId', render: (i) => {
          if (!i.vehiculeId) return '<span style="color:var(--text-muted);">—</span>';
          const v = vehicules.find(x => x.id === i.vehiculeId);
          return v ? `${v.marque} ${v.modele}` : i.vehiculeId;
        }},
        { label: 'Gravité', key: 'gravite', render: (i) => `<span class="incident-gravite ${i.gravite}">${graviteLabels[i.gravite] || i.gravite}</span>` },
        { label: 'Statut', key: 'statut', render: (i) => Utils.statusBadge(i.statut) },
        { label: 'Coût', key: 'coutReel', render: (i) => {
          const cout = i.coutReel || i.coutEstime || 0;
          return cout > 0 ? `<span style="font-weight:600;">${Utils.formatCurrency(cout)}</span>` : '<span style="color:var(--text-muted);">—</span>';
        }, primary: true },
        { label: '', key: 'actions', render: (i) => `
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm btn-secondary" onclick="IncidentsPage._viewIncident('${i.id}')" title="Détail"><iconify-icon icon="solar:eye-bold-duotone"></iconify-icon></button>
            <button class="btn btn-sm btn-secondary" onclick="IncidentsPage._editIncident('${i.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
            <button class="btn btn-sm btn-danger" onclick="IncidentsPage._deleteIncident('${i.id}')" title="Supprimer"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
          </div>
        `}
      ],
      data: incidents,
      pageSize: 15
    });
  },

  // =================== CRUD ===================

  _addIncident() {
    const fields = this._formFields();
    Modal.form(
      '<iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:#f97316;"></iconify-icon> Déclarer un incident',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        Store.add('incidents', {
          id: Utils.generateId('INC'),
          ...values,
          coutEstime: parseFloat(values.coutEstime) || 0,
          coutReel: parseFloat(values.coutReel) || 0,
          assurancePriseEnCharge: values.assurancePriseEnCharge === 'true' || values.assurancePriseEnCharge === true,
          statut: 'ouvert',
          photos: [],
          dateCreation: new Date().toISOString(),
          dateModification: new Date().toISOString()
        });

        Modal.close();
        Toast.success('Incident déclaré avec succès');
        this.render();
      }
    );
  },

  _editIncident(id) {
    const incident = Store.findById('incidents', id);
    if (!incident) return;

    const fields = this._formFields(incident);
    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone" style="color:#f97316;"></iconify-icon> Modifier l\'incident',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        Store.update('incidents', id, {
          ...values,
          coutEstime: parseFloat(values.coutEstime) || 0,
          coutReel: parseFloat(values.coutReel) || 0,
          assurancePriseEnCharge: values.assurancePriseEnCharge === 'true' || values.assurancePriseEnCharge === true,
          dateModification: new Date().toISOString(),
          dateResolution: (values.statut === 'resolu' || values.statut === 'clos') && !incident.dateResolution ? new Date().toISOString().split('T')[0] : incident.dateResolution
        });

        Modal.close();
        Toast.success('Incident mis à jour');
        this.render();
      }
    );
  },

  _viewIncident(id) {
    const incident = Store.findById('incidents', id);
    if (!incident) return;

    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];
    const ch = chauffeurs.find(c => c.id === incident.chauffeurId);
    const v = vehicules.find(x => x.id === incident.vehiculeId);

    const typeLabels = { accident: 'Accident', panne: 'Panne', vol: 'Vol', agression: 'Agression', contravention: 'Contravention', autre: 'Autre' };
    const graviteLabels = { mineur: 'Mineur', moyen: 'Moyen', grave: 'Grave', critique: 'Critique' };
    const statutLabels = { ouvert: 'Ouvert', en_cours: 'En cours', resolu: 'Résolu', clos: 'Clos' };
    const graviteColors = { mineur: '#3b82f6', moyen: '#f59e0b', grave: '#f97316', critique: '#ef4444' };

    Modal.open({
      title: `<iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:${graviteColors[incident.gravite] || '#f97316'};"></iconify-icon> Incident — ${typeLabels[incident.type] || incident.type}`,
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:var(--font-size-sm);">
          <div><span class="text-muted">Date</span><br><strong>${Utils.formatDate(incident.date)}${incident.heure ? ' à ' + incident.heure : ''}</strong></div>
          <div><span class="text-muted">Gravité</span><br><span class="incident-gravite ${incident.gravite}">${graviteLabels[incident.gravite]}</span></div>
          <div><span class="text-muted">Chauffeur</span><br><strong>${ch ? ch.prenom + ' ' + ch.nom : '—'}</strong></div>
          <div><span class="text-muted">Véhicule</span><br><strong>${v ? v.marque + ' ' + v.modele + ' (' + v.immatriculation + ')' : '—'}</strong></div>
          <div><span class="text-muted">Statut</span><br>${Utils.statusBadge(incident.statut)}</div>
          <div><span class="text-muted">Lieu</span><br><strong>${incident.lieu || '—'}</strong></div>
          <div style="grid-column:1/-1;"><span class="text-muted">Description</span><br><div style="padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-top:4px;">${incident.description || '—'}</div></div>
          <div><span class="text-muted">Coût estimé</span><br><strong>${incident.coutEstime ? Utils.formatCurrency(incident.coutEstime) : '—'}</strong></div>
          <div><span class="text-muted">Coût réel</span><br><strong style="color:#f97316;">${incident.coutReel ? Utils.formatCurrency(incident.coutReel) : '—'}</strong></div>
          <div><span class="text-muted">Assurance</span><br><strong>${incident.assurancePriseEnCharge ? '✅ Prise en charge' : '❌ Non'}</strong></div>
          <div><span class="text-muted">Réf. assurance</span><br><strong>${incident.referenceAssurance || '—'}</strong></div>
          ${incident.notes ? `<div style="grid-column:1/-1;"><span class="text-muted">Notes</span><br><div style="padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-top:4px;">${incident.notes}</div></div>` : ''}
          ${incident.dateResolution ? `<div><span class="text-muted">Date résolution</span><br><strong>${Utils.formatDate(incident.dateResolution)}</strong></div>` : ''}
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="IncidentsPage._editIncident('${id}')"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>
        ${incident.statut === 'ouvert' ? `<button class="btn btn-primary" onclick="IncidentsPage._changeStatut('${id}', 'en_cours')"><iconify-icon icon="solar:play-bold-duotone"></iconify-icon> Prendre en charge</button>` : ''}
        ${incident.statut === 'en_cours' ? `<button class="btn btn-success" onclick="IncidentsPage._changeStatut('${id}', 'resolu')"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Résoudre</button>` : ''}
        <button class="btn btn-secondary" data-action="cancel">Fermer</button>
      `,
      size: 'large'
    });
  },

  _changeStatut(id, newStatut) {
    const update = { statut: newStatut, dateModification: new Date().toISOString() };
    if (newStatut === 'resolu' || newStatut === 'clos') {
      update.dateResolution = new Date().toISOString().split('T')[0];
    }
    Store.update('incidents', id, update);
    Modal.close();
    Toast.success(`Incident marqué comme "${newStatut === 'en_cours' ? 'en cours' : newStatut}"`);
    this.render();
  },

  _deleteIncident(id) {
    if (!confirm('Supprimer cet incident ?')) return;
    Store.delete('incidents', id);
    Toast.success('Incident supprimé');
    this.render();
  },

  // =================== FORM FIELDS ===================

  _formFields(existing) {
    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];

    return [
      { type: 'row-start' },
      { name: 'type', label: 'Type d\'incident', type: 'select', required: true, default: existing ? existing.type : '', options: [
        { value: 'accident', label: 'Accident' },
        { value: 'panne', label: 'Panne' },
        { value: 'vol', label: 'Vol' },
        { value: 'agression', label: 'Agression' },
        { value: 'contravention', label: 'Contravention' },
        { value: 'autre', label: 'Autre' }
      ]},
      { name: 'gravite', label: 'Gravité', type: 'select', required: true, default: existing ? existing.gravite : 'moyen', options: [
        { value: 'mineur', label: 'Mineur' },
        { value: 'moyen', label: 'Moyen' },
        { value: 'grave', label: 'Grave' },
        { value: 'critique', label: 'Critique' }
      ]},
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'date', label: 'Date', type: 'date', required: true, default: existing ? existing.date : new Date().toISOString().split('T')[0] },
      { name: 'heure', label: 'Heure', type: 'time', default: existing ? existing.heure : '' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, default: existing ? existing.chauffeurId : '', placeholder: 'Sélectionner...', options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { name: 'vehiculeId', label: 'Véhicule', type: 'select', default: existing ? existing.vehiculeId : '', placeholder: 'Aucun', options: [{ value: '', label: 'Aucun' }, ...vehicules.map(v => ({ value: v.id, label: `${v.marque} ${v.modele} (${v.immatriculation})` }))] },
      { type: 'row-end' },
      { name: 'lieu', label: 'Lieu', type: 'text', default: existing ? existing.lieu : '', placeholder: 'Adresse ou description du lieu...' },
      { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 3, default: existing ? existing.description : '', placeholder: 'Décrivez l\'incident en détail...' },
      { type: 'row-start' },
      { name: 'coutEstime', label: 'Coût estimé (FCFA)', type: 'number', min: 0, step: 100, default: existing ? existing.coutEstime : '' },
      { name: 'coutReel', label: 'Coût réel (FCFA)', type: 'number', min: 0, step: 100, default: existing ? existing.coutReel : '' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'assurancePriseEnCharge', label: 'Prise en charge assurance', type: 'select', default: existing ? String(existing.assurancePriseEnCharge) : 'false', options: [
        { value: 'false', label: 'Non' },
        { value: 'true', label: 'Oui' }
      ]},
      { name: 'referenceAssurance', label: 'Réf. assurance', type: 'text', default: existing ? existing.referenceAssurance : '', placeholder: 'Numéro de dossier...' },
      { type: 'row-end' },
      ...(existing ? [
        { name: 'statut', label: 'Statut', type: 'select', default: existing.statut, options: [
          { value: 'ouvert', label: 'Ouvert' },
          { value: 'en_cours', label: 'En cours' },
          { value: 'resolu', label: 'Résolu' },
          { value: 'clos', label: 'Clos' }
        ]}
      ] : []),
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, default: existing ? existing.notes : '', placeholder: 'Notes supplémentaires...' }
    ];
  }
};
