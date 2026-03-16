/**
 * TachesPage — Module Gestion des Taches
 * L'admin cree des taches et les assigne aux chauffeurs
 */
const TachesPage = {
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
    const taches = Store.get('taches') || [];
    const aFaire = taches.filter(t => t.statut === 'a_faire');
    const enCours = taches.filter(t => t.statut === 'en_cours');
    const terminees = taches.filter(t => t.statut === 'terminee');
    const urgentes = taches.filter(t => t.priorite === 'urgente' && t.statut !== 'terminee' && t.statut !== 'annulee');

    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:checklist-bold-duotone" style="color:#6366f1;"></iconify-icon> Gestion des taches</h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="TachesPage._addTache()">
            <iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouvelle tache
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="d-grid d-g4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:checklist-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${taches.length}</div>
          <div class="kpi-label">Total taches</div>
        </div>
        <div class="kpi-card orange">
          <div class="kpi-icon"><iconify-icon icon="solar:hourglass-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${aFaire.length}</div>
          <div class="kpi-label">A faire</div>
        </div>
        <div class="kpi-card blue">
          <div class="kpi-icon"><iconify-icon icon="solar:play-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${enCours.length}</div>
          <div class="kpi-label">En cours</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${terminees.length}</div>
          <div class="kpi-label">Terminees</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tache-tabs" style="display:flex;gap:0;margin-bottom:var(--space-lg);border-bottom:2px solid var(--border-color);overflow-x:auto;">
        <button class="tache-tab ${this._activeTab === 'tous' ? 'active' : ''}" data-tab="tous">
          <iconify-icon icon="solar:list-bold-duotone"></iconify-icon> Toutes (${taches.length})
        </button>
        <button class="tache-tab ${this._activeTab === 'a_faire' ? 'active' : ''}" data-tab="a_faire">
          <iconify-icon icon="solar:hourglass-bold-duotone"></iconify-icon> A faire (${aFaire.length})
        </button>
        <button class="tache-tab ${this._activeTab === 'en_cours' ? 'active' : ''}" data-tab="en_cours">
          <iconify-icon icon="solar:play-circle-bold-duotone"></iconify-icon> En cours (${enCours.length})
        </button>
        <button class="tache-tab ${this._activeTab === 'terminees' ? 'active' : ''}" data-tab="terminees">
          <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Terminees (${terminees.length})
        </button>
        ${urgentes.length > 0 ? `
        <button class="tache-tab ${this._activeTab === 'urgentes' ? 'active' : ''}" data-tab="urgentes" style="color:#ef4444;">
          <iconify-icon icon="solar:danger-bold-duotone"></iconify-icon> Urgentes (${urgentes.length})
        </button>` : ''}
      </div>

      <div id="tache-tab-content"></div>

      <style>
        .tache-tab { background:none;border:none;padding:10px 20px;cursor:pointer;font-size:var(--font-size-sm);font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;gap:6px;white-space:nowrap;font-family:inherit; }
        .tache-tab:hover { color:var(--text-primary);background:var(--bg-secondary);border-radius:var(--radius-md) var(--radius-md) 0 0; }
        .tache-tab.active { color:#6366f1;border-bottom-color:#6366f1; }
        .tache-priorite { display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600; }
        .tache-priorite.basse { background:rgba(59,130,246,0.12);color:#3b82f6; }
        .tache-priorite.normale { background:rgba(34,197,94,0.12);color:#22c55e; }
        .tache-priorite.haute { background:rgba(249,115,22,0.12);color:#f97316; }
        .tache-priorite.urgente { background:rgba(239,68,68,0.12);color:#ef4444; }
        .tache-type { display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:rgba(99,102,241,0.12);color:#6366f1; }
      </style>
    `;
  },

  _bindTabEvents() {
    document.querySelectorAll('.tache-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        document.querySelectorAll('.tache-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderTab(this._activeTab);
      });
    });
  },

  _renderTab(tab) {
    const content = document.getElementById('tache-tab-content');
    if (!content) return;

    let taches = Store.get('taches') || [];

    if (tab === 'a_faire') {
      taches = taches.filter(t => t.statut === 'a_faire');
    } else if (tab === 'en_cours') {
      taches = taches.filter(t => t.statut === 'en_cours');
    } else if (tab === 'terminees') {
      taches = taches.filter(t => t.statut === 'terminee' || t.statut === 'annulee');
    } else if (tab === 'urgentes') {
      taches = taches.filter(t => t.priorite === 'urgente' && t.statut !== 'terminee' && t.statut !== 'annulee');
    }

    // Sort: urgentes first, then by echeance
    taches.sort((a, b) => {
      const pOrd = { urgente: 0, haute: 1, normale: 2, basse: 3 };
      const pa = pOrd[a.priorite] ?? 2;
      const pb = pOrd[b.priorite] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.dateEcheance || '9999').localeCompare(b.dateEcheance || '9999');
    });

    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];
    const typeLabels = { maintenance: 'Maintenance', administratif: 'Administratif', livraison: 'Livraison', controle: 'Controle', autre: 'Autre' };
    const prioriteLabels = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };
    const statutLabels = { a_faire: 'A faire', en_cours: 'En cours', terminee: 'Terminee', annulee: 'Annulee' };

    if (taches.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <iconify-icon icon="solar:checklist-bold-duotone" style="font-size:3rem;color:var(--success);"></iconify-icon>
          <h3>Aucune tache ${tab === 'a_faire' ? 'en attente' : tab === 'en_cours' ? 'en cours' : tab === 'terminees' ? 'terminee' : tab === 'urgentes' ? 'urgente' : ''}</h3>
          <p style="color:var(--text-muted);">Les taches creees apparaitront ici.</p>
        </div>
      `;
      return;
    }

    Table.create({
      containerId: 'tache-tab-content',
      columns: [
        { label: 'Tache', key: 'titre', primary: true, render: (t) => {
          const isLate = t.dateEcheance && t.dateEcheance < new Date().toISOString().split('T')[0] && t.statut !== 'terminee' && t.statut !== 'annulee';
          return `<div>
            <div style="font-weight:600;">${t.titre}</div>
            ${t.description ? `<div style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.description}</div>` : ''}
            ${isLate ? '<span style="font-size:10px;color:#ef4444;font-weight:600;">En retard</span>' : ''}
          </div>`;
        }},
        { label: 'Type', key: 'type', render: (t) => `<span class="tache-type">${typeLabels[t.type] || t.type}</span>` },
        { label: 'Assigne a', key: 'assigneA', render: (t) => {
          const ch = chauffeurs.find(c => c.id === t.assigneA);
          return ch ? `<a href="#/chauffeurs/${ch.id}" style="color:var(--primary);text-decoration:none;">${ch.prenom} ${ch.nom}</a>` : (t.assigneA || '<span style="color:var(--text-muted);">Non assigne</span>');
        }},
        { label: 'Priorite', key: 'priorite', render: (t) => `<span class="tache-priorite ${t.priorite}">${prioriteLabels[t.priorite] || t.priorite}</span>` },
        { label: 'Echeance', key: 'dateEcheance', render: (t) => {
          if (!t.dateEcheance) return '<span style="color:var(--text-muted);">—</span>';
          const isLate = t.dateEcheance < new Date().toISOString().split('T')[0] && t.statut !== 'terminee' && t.statut !== 'annulee';
          return `<span style="${isLate ? 'color:#ef4444;font-weight:600;' : ''}">${Utils.formatDate(t.dateEcheance)}</span>`;
        }},
        { label: 'Statut', key: 'statut', render: (t) => {
          const colors = { a_faire: '#f59e0b', en_cours: '#3b82f6', terminee: '#22c55e', annulee: '#6b7280' };
          const c = colors[t.statut] || '#6b7280';
          return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${c}1f;color:${c};">${statutLabels[t.statut] || t.statut}</span>`;
        }},
        { label: '', key: 'actions', render: (t) => `
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm btn-secondary" onclick="TachesPage._viewTache('${t.id}')" title="Detail"><iconify-icon icon="solar:eye-bold-duotone"></iconify-icon></button>
            <button class="btn btn-sm btn-secondary" onclick="TachesPage._editTache('${t.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
            <button class="btn btn-sm btn-danger" onclick="TachesPage._deleteTache('${t.id}')" title="Supprimer"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
          </div>
        `}
      ],
      data: taches,
      pageSize: 15
    });
  },

  // =================== CRUD ===================

  _addTache() {
    const fields = this._formFields();
    Modal.form(
      '<iconify-icon icon="solar:checklist-bold-duotone" style="color:#6366f1;"></iconify-icon> Nouvelle tache',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        const session = typeof Auth !== 'undefined' ? Auth.getSession() : {};

        Store.add('taches', {
          id: Utils.generateId('TCH'),
          ...values,
          statut: 'a_faire',
          assigneParId: session.userId || '',
          assigneParNom: session.nom || session.login || '',
          dateCreation: new Date().toISOString(),
          dateModification: new Date().toISOString()
        });

        Modal.close();
        Toast.success('Tache creee avec succes');
        this.render();
      }
    );
  },

  _editTache(id) {
    const tache = Store.findById('taches', id);
    if (!tache) return;

    const fields = this._formFields(tache);
    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone" style="color:#6366f1;"></iconify-icon> Modifier la tache',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        Store.update('taches', id, {
          ...values,
          dateModification: new Date().toISOString(),
          dateTerminaison: (values.statut === 'terminee' && !tache.dateTerminaison) ? new Date().toISOString() : tache.dateTerminaison
        });

        Modal.close();
        Toast.success('Tache mise a jour');
        this.render();
      }
    );
  },

  _viewTache(id) {
    const tache = Store.findById('taches', id);
    if (!tache) return;

    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];
    const ch = chauffeurs.find(c => c.id === tache.assigneA);
    const v = vehicules.find(x => x.id === tache.vehiculeId);

    const typeLabels = { maintenance: 'Maintenance', administratif: 'Administratif', livraison: 'Livraison', controle: 'Controle', autre: 'Autre' };
    const prioriteLabels = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };
    const prioriteColors = { basse: '#3b82f6', normale: '#22c55e', haute: '#f97316', urgente: '#ef4444' };
    const statutLabels = { a_faire: 'A faire', en_cours: 'En cours', terminee: 'Terminee', annulee: 'Annulee' };
    const statutColors = { a_faire: '#f59e0b', en_cours: '#3b82f6', terminee: '#22c55e', annulee: '#6b7280' };

    Modal.open({
      title: `<iconify-icon icon="solar:checklist-bold-duotone" style="color:#6366f1;"></iconify-icon> ${tache.titre}`,
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:var(--font-size-sm);">
          <div><span class="text-muted">Type</span><br><span class="tache-type">${typeLabels[tache.type] || tache.type}</span></div>
          <div><span class="text-muted">Priorite</span><br><span class="tache-priorite ${tache.priorite}">${prioriteLabels[tache.priorite] || tache.priorite}</span></div>
          <div><span class="text-muted">Assigne a</span><br><strong>${ch ? ch.prenom + ' ' + ch.nom : 'Non assigne'}</strong></div>
          <div><span class="text-muted">Vehicule</span><br><strong>${v ? v.marque + ' ' + v.modele : '—'}</strong></div>
          <div><span class="text-muted">Statut</span><br><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${statutColors[tache.statut]}1f;color:${statutColors[tache.statut]};">${statutLabels[tache.statut]}</span></div>
          <div><span class="text-muted">Echeance</span><br><strong>${tache.dateEcheance ? Utils.formatDate(tache.dateEcheance) : '—'}</strong></div>
          ${tache.description ? `<div style="grid-column:1/-1;"><span class="text-muted">Description</span><br><div style="padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-top:4px;">${tache.description}</div></div>` : ''}
          ${tache.commentaireAdmin ? `<div style="grid-column:1/-1;"><span class="text-muted">Commentaire admin</span><br><div style="padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-top:4px;">${tache.commentaireAdmin}</div></div>` : ''}
          ${tache.commentaireChauffeur ? `<div style="grid-column:1/-1;"><span class="text-muted">Commentaire chauffeur</span><br><div style="padding:8px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:var(--radius-sm);margin-top:4px;">${tache.commentaireChauffeur}</div></div>` : ''}
          <div><span class="text-muted">Creee par</span><br><strong>${tache.assigneParNom || '—'}</strong></div>
          <div><span class="text-muted">Creee le</span><br><strong>${tache.dateCreation ? Utils.formatDate(tache.dateCreation.split('T')[0]) : '—'}</strong></div>
          ${tache.dateTerminaison ? `<div><span class="text-muted">Terminee le</span><br><strong>${Utils.formatDate(tache.dateTerminaison.split('T')[0])}</strong></div>` : ''}
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="TachesPage._editTache('${id}')"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>
        ${tache.statut === 'a_faire' ? `<button class="btn btn-primary" onclick="TachesPage._changeStatut('${id}', 'en_cours')"><iconify-icon icon="solar:play-bold-duotone"></iconify-icon> Demarrer</button>` : ''}
        ${tache.statut === 'en_cours' ? `<button class="btn btn-success" onclick="TachesPage._changeStatut('${id}', 'terminee')"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Terminer</button>` : ''}
        <button class="btn btn-secondary" data-action="cancel">Fermer</button>
      `,
      size: 'large'
    });
  },

  _changeStatut(id, newStatut) {
    const update = { statut: newStatut, dateModification: new Date().toISOString() };
    if (newStatut === 'terminee') {
      update.dateTerminaison = new Date().toISOString();
    }
    Store.update('taches', id, update);
    Modal.close();
    Toast.success('Tache marquee comme "' + (newStatut === 'en_cours' ? 'en cours' : newStatut === 'terminee' ? 'terminee' : newStatut) + '"');
    this.render();
  },

  _deleteTache(id) {
    if (!confirm('Supprimer cette tache ?')) return;
    Store.delete('taches', id);
    Toast.success('Tache supprimee');
    this.render();
  },

  // =================== FORM ===================

  _formFields(existing) {
    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];

    return [
      { name: 'titre', label: 'Titre de la tache', type: 'text', required: true, default: existing ? existing.titre : '', placeholder: 'Ex: Verifier les freins...' },
      { type: 'row-start' },
      { name: 'type', label: 'Type', type: 'select', required: true, default: existing ? existing.type : 'autre', options: [
        { value: 'maintenance', label: 'Maintenance' },
        { value: 'administratif', label: 'Administratif' },
        { value: 'livraison', label: 'Livraison' },
        { value: 'controle', label: 'Controle' },
        { value: 'autre', label: 'Autre' }
      ]},
      { name: 'priorite', label: 'Priorite', type: 'select', required: true, default: existing ? existing.priorite : 'normale', options: [
        { value: 'basse', label: 'Basse' },
        { value: 'normale', label: 'Normale' },
        { value: 'haute', label: 'Haute' },
        { value: 'urgente', label: 'Urgente' }
      ]},
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'assigneA', label: 'Assigner a', type: 'select', default: existing ? existing.assigneA : '', placeholder: 'Selectionner un chauffeur...', options: [{ value: '', label: 'Non assigne' }, ...chauffeurs.map(c => ({ value: c.id, label: c.prenom + ' ' + c.nom }))] },
      { name: 'vehiculeId', label: 'Vehicule (optionnel)', type: 'select', default: existing ? existing.vehiculeId : '', placeholder: 'Aucun', options: [{ value: '', label: 'Aucun' }, ...vehicules.map(v => ({ value: v.id, label: v.marque + ' ' + v.modele + ' (' + v.immatriculation + ')' }))] },
      { type: 'row-end' },
      { name: 'dateEcheance', label: 'Date d\'echeance', type: 'date', default: existing ? existing.dateEcheance : '' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3, default: existing ? existing.description : '', placeholder: 'Decrivez la tache en detail...' },
      { name: 'commentaireAdmin', label: 'Note admin', type: 'textarea', rows: 2, default: existing ? existing.commentaireAdmin : '', placeholder: 'Note visible uniquement par l\'admin...' },
      ...(existing ? [
        { name: 'statut', label: 'Statut', type: 'select', default: existing.statut, options: [
          { value: 'a_faire', label: 'A faire' },
          { value: 'en_cours', label: 'En cours' },
          { value: 'terminee', label: 'Terminee' },
          { value: 'annulee', label: 'Annulee' }
        ]}
      ] : [])
    ];
  }
};
