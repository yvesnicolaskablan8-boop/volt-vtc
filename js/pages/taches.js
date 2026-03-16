/**
 * TachesPage — Module Gestion des Taches (admin uniquement)
 * L'admin cree des taches et les assigne aux utilisateurs du panneau d'administration
 */
const TachesPage = {
  _activeTab: 'tous',
  _table: null,

  _isAdmin() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    return s && s.role === 'Administrateur';
  },

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
          ${this._isAdmin() ? `<button class="btn btn-primary" onclick="TachesPage._addTache()">
            <iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouvelle tache
          </button>` : ''}
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
        ${this._isAdmin() ? (() => {
          const recurrentes = taches.filter(t => t.recurrenceActif && t.recurrence && t.recurrence !== 'aucune');
          return `<button class="tache-tab ${this._activeTab === 'recurrentes' ? 'active' : ''}" data-tab="recurrentes" style="color:#6366f1;">
            <iconify-icon icon="solar:restart-bold-duotone"></iconify-icon> Recurrentes (${recurrentes.length})
          </button>`;
        })() : ''}
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
    } else if (tab === 'recurrentes') {
      taches = taches.filter(t => t.recurrenceActif && t.recurrence && t.recurrence !== 'aucune');
    }

    // Sort: urgentes first, then by echeance
    taches.sort((a, b) => {
      const pOrd = { urgente: 0, haute: 1, normale: 2, basse: 3 };
      const pa = pOrd[a.priorite] ?? 2;
      const pb = pOrd[b.priorite] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.dateEcheance || '9999').localeCompare(b.dateEcheance || '9999');
    });

    const users = Store.get('users') || [];
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
          const recLabels = { quotidien: 'Quotidien', hebdomadaire: 'Hebdo', mensuel: 'Mensuel' };
          const isRec = t.recurrenceActif && t.recurrence && t.recurrence !== 'aucune';
          const isInstance = !!t.recurrenceParentId;
          return `<div>
            <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
              ${t.titre}
              ${isRec ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:rgba(99,102,241,.12);color:#6366f1;"><iconify-icon icon="solar:restart-bold-duotone" style="font-size:12px;"></iconify-icon>${recLabels[t.recurrence] || ''}</span>` : ''}
              ${isInstance ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:rgba(34,197,94,.12);color:#22c55e;"><iconify-icon icon="solar:copy-bold-duotone" style="font-size:12px;"></iconify-icon>Auto</span>` : ''}
            </div>
            ${t.description ? `<div style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.description}</div>` : ''}
            ${isLate ? '<span style="font-size:10px;color:#ef4444;font-weight:600;">En retard</span>' : ''}
          </div>`;
        }},
        { label: 'Type', key: 'type', render: (t) => `<span class="tache-type">${typeLabels[t.type] || t.type}</span>` },
        { label: 'Assigne a', key: 'assigneA', render: (t) => {
          if (!t.assigneA) return '<span style="color:var(--text-muted);">Non assigne</span>';
          const u = users.find(x => x.id === t.assigneA);
          return u ? `<strong>${u.nom || u.login}</strong>` : (t.assigneANom || t.assigneA);
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
        { label: '', key: 'actions', render: (t) => {
          const adm = TachesPage._isAdmin();
          return `<div style="display:flex;gap:4px;flex-wrap:nowrap;">
            ${t.statut === 'a_faire' ? `<button class="btn btn-sm btn-primary" onclick="TachesPage._changeStatut('${t.id}', 'en_cours')" title="Demarrer"><iconify-icon icon="solar:play-bold-duotone"></iconify-icon></button>` : ''}
            ${t.statut === 'en_cours' ? `<button class="btn btn-sm btn-success" onclick="TachesPage._changeStatut('${t.id}', 'terminee')" title="Tache effectuee"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="TachesPage._viewTache('${t.id}')" title="Detail"><iconify-icon icon="solar:eye-bold-duotone"></iconify-icon></button>
            ${adm ? `<button class="btn btn-sm btn-secondary" onclick="TachesPage._editTache('${t.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>` : ''}
            ${adm && t.recurrenceActif ? `<button class="btn btn-sm btn-secondary" onclick="TachesPage._toggleRecurrence('${t.id}')" title="Arreter la recurrence" style="color:#f59e0b;"><iconify-icon icon="solar:stop-bold-duotone"></iconify-icon></button>` : ''}
            ${adm ? `<button class="btn btn-sm btn-danger" onclick="TachesPage._deleteTache('${t.id}')" title="Supprimer"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>` : ''}
          </div>`;
        }}
      ],
      data: taches,
      pageSize: 15
    });
  },

  // =================== CRUD ===================

  _addTache() {
    if (!this._isAdmin()) { Toast.error('Seul un administrateur peut creer des taches'); return; }
    const fields = this._formFields();
    Modal.form(
      '<iconify-icon icon="solar:checklist-bold-duotone" style="color:#6366f1;"></iconify-icon> Nouvelle tache',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        const session = typeof Auth !== 'undefined' ? Auth.getSession() : {};
        const users = Store.get('users') || [];
        const assignedUser = users.find(u => u.id === values.assigneA);

        // Recuperer les valeurs de recurrence
        const recData = this._getRecurrenceValues(body);

        Store.add('taches', {
          id: Utils.generateId('TCH'),
          ...values,
          assigneANom: assignedUser ? (assignedUser.nom || assignedUser.login) : '',
          statut: 'a_faire',
          creePar: session.userId || '',
          creeParNom: session.nom || session.login || '',
          dateCreation: new Date().toISOString(),
          dateModification: new Date().toISOString(),
          ...recData
        });

        Modal.close();
        Toast.success(recData.recurrenceActif ? 'Tache recurrente creee avec succes' : 'Tache creee avec succes');
        this.render();
      }
    );
    this._bindRecurrenceUI();
  },

  _editTache(id) {
    if (!this._isAdmin()) { Toast.error('Seul un administrateur peut modifier les taches'); return; }
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

        const users = Store.get('users') || [];
        const assignedUser = users.find(u => u.id === values.assigneA);

        // Recuperer les valeurs de recurrence (sauf si instance generee)
        const recData = !tache.recurrenceParentId ? this._getRecurrenceValues(body) : {};

        Store.update('taches', id, {
          ...values,
          assigneANom: assignedUser ? (assignedUser.nom || assignedUser.login) : '',
          dateModification: new Date().toISOString(),
          dateTerminaison: (values.statut === 'terminee' && !tache.dateTerminaison) ? new Date().toISOString() : tache.dateTerminaison,
          ...recData
        });

        Modal.close();
        Toast.success('Tache mise a jour');
        this.render();
      }
    );
    this._bindRecurrenceUI(tache);
  },

  _viewTache(id) {
    const tache = Store.findById('taches', id);
    if (!tache) return;

    const users = Store.get('users') || [];
    const assigned = users.find(u => u.id === tache.assigneA);

    const typeLabels = { maintenance: 'Maintenance', administratif: 'Administratif', livraison: 'Livraison', controle: 'Controle', autre: 'Autre' };
    const prioriteLabels = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };
    const statutLabels = { a_faire: 'A faire', en_cours: 'En cours', terminee: 'Terminee', annulee: 'Annulee' };
    const statutColors = { a_faire: '#f59e0b', en_cours: '#3b82f6', terminee: '#22c55e', annulee: '#6b7280' };

    Modal.open({
      title: `<iconify-icon icon="solar:checklist-bold-duotone" style="color:#6366f1;"></iconify-icon> ${tache.titre}`,
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:var(--font-size-sm);">
          <div><span class="text-muted">Type</span><br><span class="tache-type">${typeLabels[tache.type] || tache.type}</span></div>
          <div><span class="text-muted">Priorite</span><br><span class="tache-priorite ${tache.priorite}">${prioriteLabels[tache.priorite] || tache.priorite}</span></div>
          <div><span class="text-muted">Assigne a</span><br><strong>${assigned ? (assigned.nom || assigned.login) : (tache.assigneANom || 'Non assigne')}</strong></div>
          <div><span class="text-muted">Statut</span><br><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${statutColors[tache.statut]}1f;color:${statutColors[tache.statut]};">${statutLabels[tache.statut]}</span></div>
          <div><span class="text-muted">Echeance</span><br><strong>${tache.dateEcheance ? Utils.formatDate(tache.dateEcheance) : '—'}</strong></div>
          <div><span class="text-muted">Creee par</span><br><strong>${tache.creeParNom || '—'}</strong></div>
          ${tache.description ? `<div style="grid-column:1/-1;"><span class="text-muted">Description</span><br><div style="padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-top:4px;">${tache.description}</div></div>` : ''}
          ${tache.commentaire ? `<div style="grid-column:1/-1;"><span class="text-muted">Commentaire</span><br><div style="padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-top:4px;">${tache.commentaire}</div></div>` : ''}
          ${(() => {
            const recLabels = { quotidien: 'Tous les jours', hebdomadaire: 'Chaque semaine', mensuel: 'Chaque mois' };
            const jourLabels = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
            const isRec = tache.recurrenceActif && tache.recurrence && tache.recurrence !== 'aucune';
            const isInstance = !!tache.recurrenceParentId;
            if (!isRec && !isInstance) return '';
            let detail = '';
            if (isRec) {
              detail = `<div style="grid-column:1/-1;padding:10px;background:rgba(99,102,241,.08);border-radius:var(--radius-sm);border-left:3px solid #6366f1;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <iconify-icon icon="solar:restart-bold-duotone" style="color:#6366f1;font-size:18px;"></iconify-icon>
                  <strong style="color:#6366f1;">Tache recurrente</strong>
                </div>
                <div style="font-size:12px;color:var(--text-muted);">
                  Frequence : <strong>${recLabels[tache.recurrence]}</strong>
                  ${tache.recurrence === 'hebdomadaire' && tache.joursSemaine ? ' — ' + tache.joursSemaine.map(j => jourLabels[j]).join(', ') : ''}
                  ${tache.recurrence === 'mensuel' && tache.jourMois ? ' — le ' + tache.jourMois + ' du mois' : ''}
                  ${tache.prochaineExecution ? '<br>Prochaine generation : <strong>' + Utils.formatDate(tache.prochaineExecution) + '</strong>' : ''}
                </div>
              </div>`;
            }
            if (isInstance) {
              detail = `<div style="grid-column:1/-1;padding:10px;background:rgba(34,197,94,.08);border-radius:var(--radius-sm);border-left:3px solid #22c55e;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <iconify-icon icon="solar:copy-bold-duotone" style="color:#22c55e;font-size:18px;"></iconify-icon>
                  <strong style="color:#22c55e;">Generee automatiquement</strong>
                </div>
                <div style="font-size:12px;color:var(--text-muted);">Cette tache a ete creee automatiquement par une tache recurrente.</div>
              </div>`;
            }
            return detail;
          })()}
          <div><span class="text-muted">Creee le</span><br><strong>${tache.dateCreation ? Utils.formatDate(tache.dateCreation.split('T')[0]) : '—'}</strong></div>
          ${tache.dateTerminaison ? `<div><span class="text-muted">Terminee le</span><br><strong>${Utils.formatDate(tache.dateTerminaison.split('T')[0])}</strong></div>` : ''}
        </div>
      `,
      footer: `
        ${this._isAdmin() ? `<button class="btn btn-secondary" onclick="TachesPage._editTache('${id}')"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>` : ''}
        ${tache.statut === 'a_faire' ? `<button class="btn btn-primary" onclick="TachesPage._changeStatut('${id}', 'en_cours')"><iconify-icon icon="solar:play-bold-duotone"></iconify-icon> Demarrer</button>` : ''}
        ${tache.statut === 'en_cours' ? `<button class="btn btn-success" onclick="TachesPage._changeStatut('${id}', 'terminee')"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tache effectuee</button>` : ''}
        ${tache.statut === 'a_faire' ? `<button class="btn btn-success" onclick="TachesPage._changeStatut('${id}', 'terminee')"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tache effectuee</button>` : ''}
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
    const labels = { en_cours: 'en cours', terminee: 'effectuee', annulee: 'annulee' };
    Toast.success('Tache marquee comme "' + (labels[newStatut] || newStatut) + '"');
    this.render();
  },

  _deleteTache(id) {
    if (!this._isAdmin()) { Toast.error('Seul un administrateur peut supprimer les taches'); return; }
    if (!confirm('Supprimer cette tache ?')) return;
    Store.delete('taches', id);
    Toast.success('Tache supprimee');
    this.render();
  },

  // =================== FORM ===================

  _bindRecurrenceUI(existing) {
    setTimeout(() => {
      const sel = document.querySelector('[name="recurrence"]');
      if (!sel) return;
      sel.addEventListener('change', () => TachesPage._onRecurrenceChange());
      // Masquer jourMois par defaut si pas mensuel
      const val = sel.value;
      const jourMoisInput = document.querySelector('[name="jourMois"]');
      const jourMoisContainer = jourMoisInput ? jourMoisInput.closest('.form-group') : null;
      if (jourMoisContainer) jourMoisContainer.style.display = val === 'mensuel' ? '' : 'none';
      const joursDiv = document.getElementById('field-joursSemaine');
      if (joursDiv) {
        const parent = joursDiv.closest('.form-group');
        if (parent) parent.style.display = val === 'hebdomadaire' ? '' : 'none';
      }
    }, 100);
  },

  _toggleRecurrence(id) {
    if (!this._isAdmin()) return;
    const tache = Store.findById('taches', id);
    if (!tache) return;
    const newState = !tache.recurrenceActif;
    if (!newState && !confirm('Arreter la recurrence de cette tache ? Les taches deja generees seront conservees.')) return;
    Store.update('taches', id, {
      recurrenceActif: newState,
      dateModification: new Date().toISOString()
    });
    Toast.success(newState ? 'Recurrence reactivee' : 'Recurrence arretee');
    this.render();
  },

  _onRecurrenceChange() {
    const sel = document.querySelector('[name="recurrence"]');
    if (!sel) return;
    const val = sel.value;
    const joursDiv = document.getElementById('field-joursSemaine');
    const jourMoisGroup = document.querySelector('[name="jourMois"]');
    const jourMoisContainer = jourMoisGroup ? jourMoisGroup.closest('.form-group') : null;

    if (joursDiv) {
      joursDiv.style.display = val === 'hebdomadaire' ? 'flex' : 'none';
      const parent = joursDiv.closest('.form-group');
      if (parent) parent.style.display = val === 'hebdomadaire' ? '' : 'none';
    }
    if (jourMoisContainer) jourMoisContainer.style.display = val === 'mensuel' ? '' : 'none';
  },

  _toggleJourSemaine(label, jour) {
    const cb = label.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    if (cb.checked) {
      label.style.borderColor = '#6366f1';
      label.style.background = 'rgba(99,102,241,.12)';
      label.style.color = '#6366f1';
    } else {
      label.style.borderColor = 'var(--border-color)';
      label.style.background = 'var(--bg-secondary)';
      label.style.color = 'var(--text-muted)';
    }
  },

  _getRecurrenceValues(body) {
    const recurrence = body.querySelector('[name="recurrence"]');
    if (!recurrence || recurrence.value === 'aucune') {
      return { recurrence: 'aucune', recurrenceActif: false, joursSemaine: [], jourMois: null, prochaineExecution: '' };
    }

    const val = recurrence.value;
    let joursSemaine = [];
    let jourMois = null;
    let prochaineExecution = '';

    if (val === 'hebdomadaire') {
      const checks = body.querySelectorAll('#field-joursSemaine input[type="checkbox"]:checked');
      checks.forEach(c => joursSemaine.push(parseInt(c.value)));
      if (joursSemaine.length === 0) joursSemaine = [1]; // Lundi par defaut
    }

    if (val === 'mensuel') {
      const jm = body.querySelector('[name="jourMois"]');
      jourMois = jm ? parseInt(jm.value) || 1 : 1;
    }

    // Calculer prochaine execution
    const today = new Date();
    if (val === 'quotidien') {
      const next = new Date(today);
      next.setDate(next.getDate() + 1);
      prochaineExecution = next.toISOString().split('T')[0];
    } else if (val === 'hebdomadaire') {
      const dow = today.getDay();
      const sorted = [...joursSemaine].sort((a, b) => a - b);
      let found = false;
      for (const j of sorted) {
        if (j > dow) {
          const next = new Date(today);
          next.setDate(next.getDate() + (j - dow));
          prochaineExecution = next.toISOString().split('T')[0];
          found = true;
          break;
        }
      }
      if (!found) {
        const next = new Date(today);
        next.setDate(next.getDate() + (7 - dow + sorted[0]));
        prochaineExecution = next.toISOString().split('T')[0];
      }
    } else if (val === 'mensuel') {
      const next = new Date(today);
      if (next.getDate() >= jourMois) {
        next.setMonth(next.getMonth() + 1);
      }
      const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(jourMois, maxDay));
      prochaineExecution = next.toISOString().split('T')[0];
    }

    return { recurrence: val, recurrenceActif: true, joursSemaine, jourMois, prochaineExecution };
  },

  _formFields(existing) {
    const users = Store.get('users') || [];

    return [
      { name: 'titre', label: 'Titre de la tache', type: 'text', required: true, default: existing ? existing.titre : '', placeholder: 'Ex: Preparer les documents comptables...' },
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
      { name: 'assigneA', label: 'Assigner a', type: 'select', default: existing ? existing.assigneA : '', placeholder: 'Selectionner un utilisateur...', options: [{ value: '', label: 'Non assigne' }, ...users.map(u => ({ value: u.id, label: u.nom || u.login }))] },
      { name: 'dateEcheance', label: 'Date d\'echeance', type: 'date', default: existing ? existing.dateEcheance : '' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3, default: existing ? existing.description : '', placeholder: 'Decrivez la tache en detail...' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2, default: existing ? existing.commentaire : '', placeholder: 'Note ou commentaire...' },
      ...(existing ? [
        { name: 'statut', label: 'Statut', type: 'select', default: existing.statut, options: [
          { value: 'a_faire', label: 'A faire' },
          { value: 'en_cours', label: 'En cours' },
          { value: 'terminee', label: 'Terminee' },
          { value: 'annulee', label: 'Annulee' }
        ]}
      ] : []),
      // Recurrence (admin seulement, pas pour les instances generees)
      ...(this._isAdmin() && !(existing && existing.recurrenceParentId) ? [
        { type: 'divider' },
        { type: 'heading', label: 'Recurrence' },
        { name: 'recurrence', label: 'Repetition', type: 'select', default: existing ? (existing.recurrence || 'aucune') : 'aucune', options: [
          { value: 'aucune', label: 'Aucune (tache unique)' },
          { value: 'quotidien', label: 'Tous les jours' },
          { value: 'hebdomadaire', label: 'Chaque semaine' },
          { value: 'mensuel', label: 'Chaque mois' }
        ]},
        { type: 'html', html: `<div class="form-group"><label class="form-label">Jours de la semaine</label><div id="field-joursSemaine" style="display:${existing && existing.recurrence === 'hebdomadaire' ? 'flex' : 'none'};gap:6px;flex-wrap:wrap;">
            ${['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((j, i) => {
              const checked = existing && existing.joursSemaine && existing.joursSemaine.includes(i);
              return `<label style="display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid ${checked ? '#6366f1' : 'var(--border-color)'};background:${checked ? 'rgba(99,102,241,.12)' : 'var(--bg-secondary)'};color:${checked ? '#6366f1' : 'var(--text-muted)'};transition:all .2s;" onclick="TachesPage._toggleJourSemaine(this,${i})">
                <input type="checkbox" name="jour_${i}" value="${i}" ${checked ? 'checked' : ''} style="display:none;">
                ${j}
              </label>`;
            }).join('')}
          </div></div>` },
        { name: 'jourMois', label: 'Jour du mois', type: 'number', min: 1, max: 31, default: existing ? (existing.jourMois || 1) : 1 }
      ] : [])
    ];
  }
};
