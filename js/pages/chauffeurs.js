/**
 * ChauffeursPage - Driver management with CRUD and detail view
 * Shows only internal Volt drivers (no Yango data)
 */
const ChauffeursPage = {
  _charts: [],
  _table: null,

  render() {
    const container = document.getElementById('page-content');
    const chauffeurs = Store.get('chauffeurs');
    container.innerHTML = this._listTemplate(chauffeurs);
    this._bindListEvents();
  },

  renderDetail(id) {
    const container = document.getElementById('page-content');
    const chauffeur = Store.findById('chauffeurs', id);
    if (!chauffeur) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-user-slash"></i><h3>Chauffeur non trouvé</h3></div>';
      return;
    }
    container.innerHTML = this._detailTemplate(chauffeur);
    this._loadDetailCharts(chauffeur);
    this._bindDetailEvents(chauffeur);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _listTemplate(chauffeurs) {
    const stats = {
      total: chauffeurs.length,
      actifs: chauffeurs.filter(c => c.statut === 'actif').length,
      suspendus: chauffeurs.filter(c => c.statut === 'suspendu').length,
      inactifs: chauffeurs.filter(c => c.statut === 'inactif').length
    };

    return `
      <div class="page-header">
        <h1><i class="fas fa-id-card"></i> Chauffeurs</h1>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-chauffeur"><i class="fas fa-plus"></i> Ajouter</button>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom: var(--space-lg);">
        <div class="kpi-card"><div class="kpi-value">${stats.total}</div><div class="kpi-label">Total Volt</div></div>
        <div class="kpi-card green"><div class="kpi-value">${stats.actifs}</div><div class="kpi-label">Actifs</div></div>
        <div class="kpi-card yellow"><div class="kpi-value">${stats.suspendus}</div><div class="kpi-label">Suspendus</div></div>
        <div class="kpi-card red"><div class="kpi-value">${stats.inactifs}</div><div class="kpi-label">Inactifs</div></div>
      </div>

      <div id="chauffeurs-table"></div>
    `;
  },

  _bindListEvents() {
    const chauffeurs = Store.get('chauffeurs');
    const vehicules = Store.get('vehicules');

    this._table = Table.create({
      containerId: 'chauffeurs-table',
      columns: [
        {
          label: 'Chauffeur', key: 'nom', primary: true,
          render: (c) => {
            const color = Utils.getAvatarColor(c.id);
            return `<div class="flex items-center gap-sm">
              <div class="avatar avatar-sm" style="background:${color}">${Utils.getInitials(c.prenom, c.nom)}</div>
              <div><div style="font-weight:500">${c.prenom} ${c.nom}</div><div style="font-size:11px;color:var(--text-muted)">${c.email}</div></div>
            </div>`;
          },
          value: (c) => `${c.nom} ${c.prenom}`
        },
        { label: 'Téléphone', key: 'telephone' },
        {
          label: 'Véhicule', key: 'vehiculeAssigne',
          render: (c) => {
            if (!c.vehiculeAssigne) return '<span class="text-muted">Non assigné</span>';
            const v = vehicules.find(x => x.id === c.vehiculeAssigne);
            return v ? `${v.marque} ${v.modele}` : c.vehiculeAssigne;
          }
        },
        {
          label: 'Score', key: 'scoreConduite',
          render: (c) => `<div class="score-circle ${Utils.scoreClass(c.scoreConduite)}">${c.scoreConduite}</div>`
        },
        {
          label: 'Statut', key: 'statut',
          render: (c) => Utils.statusBadge(c.statut)
        },
        {
          label: 'Contrat', key: 'dateDebutContrat',
          render: (c) => Utils.formatDate(c.dateDebutContrat)
        }
      ],
      data: chauffeurs,
      pageSize: 10,
      onRowClick: (id) => Router.navigate(`/chauffeurs/${id}`),
      actions: (c) => `
        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); ChauffeursPage._edit('${c.id}')" title="Modifier"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); ChauffeursPage._delete('${c.id}')" title="Supprimer"><i class="fas fa-trash"></i></button>
      `
    });

    document.getElementById('btn-add-chauffeur').addEventListener('click', () => this._add());
  },

  _detailTemplate(c) {
    const vehicule = c.vehiculeAssigne ? Store.findById('vehicules', c.vehiculeAssigne) : null;
    const versements = Store.query('versements', v => v.chauffeurId === c.id);
    const courses = Store.query('courses', cr => cr.chauffeurId === c.id && cr.statut === 'terminee');
    const totalCA = courses.reduce((s, cr) => s + cr.montantTTC, 0);
    const totalVerse = versements.reduce((s, v) => s + v.montantVerse, 0);
    const color = Utils.getAvatarColor(c.id);

    return `
      <div class="page-header">
        <h1>
          <a href="#/chauffeurs" style="color:var(--text-muted)"><i class="fas fa-arrow-left"></i></a>
          Fiche chauffeur
        </h1>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="ChauffeursPage._edit('${c.id}')"><i class="fas fa-edit"></i> Modifier</button>
          <button class="btn btn-danger" onclick="ChauffeursPage._delete('${c.id}')"><i class="fas fa-trash"></i> Supprimer</button>
        </div>
      </div>

      <div class="detail-header">
        <div class="avatar avatar-xl" style="background:${color}">${Utils.getInitials(c.prenom, c.nom)}</div>
        <div class="detail-info">
          <h2>${c.prenom} ${c.nom} ${Utils.statusBadge(c.statut)}</h2>
          <p>${c.email} &bull; ${c.telephone}</p>
          <div class="detail-stats">
            <div class="detail-stat">
              <div class="detail-stat-value">${Utils.formatCurrency(totalCA)}</div>
              <div class="detail-stat-label">CA total</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value">${courses.length}</div>
              <div class="detail-stat-label">Courses</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value">${Utils.formatCurrency(totalVerse)}</div>
              <div class="detail-stat-label">Versé</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value score-circle ${Utils.scoreClass(c.scoreConduite)}" style="margin:0 auto">${c.scoreConduite}</div>
              <div class="detail-stat-label">Score conduite</div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <!-- Info card -->
        <div class="card">
          <div class="card-header"><span class="card-title">Informations</span></div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:var(--font-size-sm);">
            <div><span class="text-muted">Date de naissance</span><br><strong>${Utils.formatDate(c.dateNaissance)}</strong></div>
            <div><span class="text-muted">Adresse</span><br><strong>${c.adresse}</strong></div>
            <div><span class="text-muted">N° Permis</span><br><strong>${c.numeroPermis}</strong></div>
            <div><span class="text-muted">Début contrat</span><br><strong>${Utils.formatDate(c.dateDebutContrat)}</strong></div>
            <div><span class="text-muted">Véhicule</span><br><strong>${vehicule ? `${vehicule.marque} ${vehicule.modele} (${vehicule.immatriculation})` : 'Non assigné'}</strong></div>
            <div><span class="text-muted">Fin contrat</span><br><strong>${c.dateFinContrat ? Utils.formatDate(c.dateFinContrat) : 'En cours'}</strong></div>
          </div>
        </div>

        <!-- Liaison Yango -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-taxi" style="color:#FC4C02"></i> Liaison Yango</span>
            ${c.yangoDriverId
              ? '<span class="badge badge-success"><i class="fas fa-link"></i> Lié</span>'
              : '<span class="badge badge-warning"><i class="fas fa-unlink"></i> Non lié</span>'}
          </div>
          ${c.yangoDriverId ? `
            <div style="font-size:var(--font-size-sm);margin-bottom:8px;">
              <span class="text-muted">Yango ID :</span> <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:11px;">${c.yangoDriverId}</code>
              <button class="btn btn-sm btn-danger" style="margin-left:8px;" onclick="ChauffeursPage._unlinkYango('${c.id}')">
                <i class="fas fa-unlink"></i> Délier
              </button>
            </div>
          ` : `
            <div style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:10px;">
              Ce chauffeur n'est pas encore lié a un profil Yango. Cliquez ci-dessous pour rechercher et lier manuellement.
            </div>
            <button class="btn btn-primary btn-sm" onclick="ChauffeursPage._searchYangoDriver('${c.id}')">
              <i class="fas fa-search"></i> Rechercher sur Yango
            </button>
            <div id="yango-search-results" style="margin-top:10px;"></div>
          `}
        </div>

        <!-- Documents -->
        <div class="card">
          <div class="card-header"><span class="card-title">Documents</span></div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${(c.documents || []).map(doc => `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:8px; border-radius:var(--radius-sm); background:var(--bg-tertiary);">
                <div>
                  <div style="font-size:var(--font-size-sm); font-weight:500;">${doc.nom}</div>
                  <div style="font-size:var(--font-size-xs); color:var(--text-muted);">Expire : ${Utils.formatDate(doc.dateExpiration)}</div>
                </div>
                ${Utils.statusBadge(doc.statut)}
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-grid" style="margin-top:var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-radar"></i> Scores de conduite</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-driver-scores"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-line"></i> Historique versements</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-driver-payments"></canvas>
          </div>
        </div>
      </div>

      <!-- Recent courses -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title">Dernières courses</span>
        </div>
        <div id="driver-courses-table"></div>
      </div>
    `;
  },

  _loadDetailCharts(chauffeur) {
    this._charts = [];

    // Radar chart - driving scores
    const gpsData = Store.query('gps', g => g.chauffeurId === chauffeur.id);
    if (gpsData.length > 0) {
      const latest = gpsData.sort((a, b) => b.date.localeCompare(a.date))[0];
      const radarCtx = document.getElementById('chart-driver-scores');
      if (radarCtx) {
        this._charts.push(new Chart(radarCtx, {
          type: 'radar',
          data: {
            labels: ['Vitesse', 'Freinage', 'Accélération', 'Virages', 'Régularité'],
            datasets: [{
              label: 'Score',
              data: [latest.scoreVitesse, latest.scoreFreinage, latest.scoreAcceleration, latest.scoreVirage, latest.scoreRegularite],
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              borderWidth: 2,
              pointBackgroundColor: '#3b82f6',
              pointHoverRadius: 8,
              pointHoverBorderWidth: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const score = ctx.raw;
                    const qual = score > 80 ? 'Excellent' : score > 65 ? 'Bon' : score > 50 ? 'Moyen' : 'Faible';
                    return `${ctx.label}: ${score}/100 (${qual})`;
                  }
                }
              }
            },
            scales: {
              r: {
                beginAtZero: true,
                max: 100,
                ticks: { stepSize: 20, display: false },
                grid: { color: 'rgba(30, 41, 59, 0.5)' },
                angleLines: { color: 'rgba(30, 41, 59, 0.5)' },
                pointLabels: { color: '#94a3b8', font: { size: 12 } }
              }
            }
          }
        }));
      }
    }

    // Payment history chart
    const versements = Store.query('versements', v => v.chauffeurId === chauffeur.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12);

    const payCtx = document.getElementById('chart-driver-payments');
    if (payCtx && versements.length > 0) {
      const payChart = new Chart(payCtx, {
        type: 'line',
        data: {
          labels: versements.map(v => v.periode),
          datasets: [{
            label: 'Versé',
            data: versements.map(v => Math.round(v.montantVerse)),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            borderWidth: 2,
            pointHoverRadius: 7,
            pointHoverBorderWidth: 3
          }, {
            label: 'Commission',
            data: versements.map(v => Math.round(v.commission)),
            borderColor: '#facc15',
            borderWidth: 2,
            borderDash: [5, 5],
            pointHoverRadius: 7,
            pointHoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw;
                  const prev = ctx.dataIndex > 0 ? ctx.dataset.data[ctx.dataIndex - 1] : null;
                  let line = `${ctx.dataset.label}: ${Utils.formatCurrency(val)}`;
                  if (prev !== null) {
                    const diff = val - prev;
                    const pct = prev !== 0 ? ((diff / prev) * 100).toFixed(1) : '—';
                    const sign = diff >= 0 ? '+' : '';
                    line += ` (${sign}${Utils.formatCurrency(diff)}, ${sign}${pct}%)`;
                  }
                  return line;
                }
              }
            },
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) } }
          }
        }
      });
      this._charts.push(payChart);
    }

    // Recent courses table
    const recentCourses = Store.query('courses', cr => cr.chauffeurId === chauffeur.id)
      .sort((a, b) => new Date(b.dateHeure) - new Date(a.dateHeure))
      .slice(0, 50);

    Table.create({
      containerId: 'driver-courses-table',
      columns: [
        { label: 'Date', key: 'dateHeure', render: (c) => Utils.formatDate(c.dateHeure) },
        { label: 'Départ', key: 'depart', render: (c) => `<span style="max-width:150px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.depart}</span>` },
        { label: 'Arrivée', key: 'arrivee', render: (c) => `<span style="max-width:150px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.arrivee}</span>` },
        { label: 'Distance', key: 'distanceKm', render: (c) => `${c.distanceKm} km` },
        { label: 'Montant', key: 'montantTTC', render: (c) => Utils.formatCurrency(c.montantTTC, 2), primary: true },
        { label: 'Statut', key: 'statut', render: (c) => Utils.statusBadge(c.statut) }
      ],
      data: recentCourses,
      pageSize: 10
    });
  },

  _bindDetailEvents() {},

  // CRUD operations
  _getFormFields() {
    const vehicules = Store.get('vehicules');
    return [
      { type: 'row-start' },
      { name: 'prenom', label: 'Prénom', type: 'text', required: true },
      { name: 'nom', label: 'Nom', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'email', label: 'Email', type: 'email', required: false },
      { name: 'telephone', label: 'Téléphone', type: 'tel', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'dateNaissance', label: 'Date de naissance', type: 'date' },
      { name: 'numeroPermis', label: 'N° Permis', type: 'text' },
      { type: 'row-end' },
      { name: 'adresse', label: 'Adresse', type: 'text' },
      { type: 'row-start' },
      { name: 'dateDebutContrat', label: 'Début contrat', type: 'date', required: true },
      { name: 'statut', label: 'Statut', type: 'select', options: [
        { value: 'actif', label: 'Actif' },
        { value: 'inactif', label: 'Inactif' },
        { value: 'suspendu', label: 'Suspendu' }
      ]},
      { type: 'row-end' },
      { name: 'vehiculeAssigne', label: 'Véhicule assigné', type: 'select', placeholder: 'Sélectionner...', options: vehicules.map(v => ({ value: v.id, label: `${v.marque} ${v.modele} (${v.immatriculation})` })) },
      { type: 'divider' },
      { type: 'heading', label: 'Liaison Yango' },
      { name: 'yangoDriverId', label: 'Yango Driver ID', type: 'text', placeholder: 'Ex: abc123... (sera rempli auto par la sync ou manuellement)' },
      { name: 'noteInterne', label: 'Note interne', type: 'textarea', rows: 2 }
    ];
  },

  _add() {
    const fields = this._getFormFields();
    const formHtml = FormBuilder.build(fields);

    this._currentEditId = null; // Mode creation
    Modal.form('<i class="fas fa-user-plus text-blue"></i> Nouveau chauffeur', formHtml, () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;

      const values = FormBuilder.getValues(body);
      const chauffeur = {
        id: Utils.generateId('CHF'),
        ...values,
        dateFinContrat: null,
        photo: null,
        documents: [],
        scoreConduite: Utils.random(60, 95),
        dateCreation: new Date().toISOString()
      };

      Store.add('chauffeurs', chauffeur);
      Modal.close();
      Toast.success(`${chauffeur.prenom} ${chauffeur.nom} ajouté avec succès`);
      this.render();
    }, 'modal-lg');

    // Injecter le bouton "+ Créer véhicule" a coté du select vehiculeAssigne
    this._injectQuickVehicleButton();
    // Injecter le bouton "Rechercher sur Yango" a coté du champ yangoDriverId
    this._injectYangoSearchButton();
  },

  _edit(id) {
    const chauffeur = Store.findById('chauffeurs', id);
    if (!chauffeur) return;

    const fields = this._getFormFields();
    const formHtml = FormBuilder.build(fields, chauffeur);

    this._currentEditId = id; // Mode edition
    Modal.form('<i class="fas fa-user-edit text-blue"></i> Modifier chauffeur', formHtml, () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;

      const values = FormBuilder.getValues(body);
      Store.update('chauffeurs', id, values);
      Modal.close();
      Toast.success('Chauffeur modifié avec succès');

      // Re-render current view
      if (window.location.hash.includes(id)) {
        this.renderDetail(id);
      } else {
        this.render();
      }
    }, 'modal-lg');

    // Injecter le bouton "+ Créer véhicule" a coté du select vehiculeAssigne
    this._injectQuickVehicleButton();
    // Injecter le bouton "Rechercher sur Yango" a coté du champ yangoDriverId
    this._injectYangoSearchButton();
  },

  _delete(id) {
    const chauffeur = Store.findById('chauffeurs', id);
    if (!chauffeur) return;

    Modal.confirm(
      'Supprimer le chauffeur',
      `Êtes-vous sûr de vouloir supprimer <strong>${chauffeur.prenom} ${chauffeur.nom}</strong> ? Cette action est irréversible.`,
      () => {
        Store.delete('chauffeurs', id);
        Toast.success('Chauffeur supprimé');
        Router.navigate('/chauffeurs');
      }
    );
  },

  // ======== QUICK VEHICLE CREATION ========

  _injectQuickVehicleButton() {
    // Trouver le select vehiculeAssigne dans le modal ouvert
    setTimeout(() => {
      const select = document.querySelector('#modal-body [name="vehiculeAssigne"]');
      if (!select) return;

      // Verifier qu'on n'a pas deja ajoute le bouton
      if (select.parentElement.querySelector('.quick-add-vehicle-btn')) return;

      // Wrapper le select + bouton dans un flex container
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';

      select.parentElement.insertBefore(wrapper, select);
      wrapper.appendChild(select);
      select.style.flex = '1';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary quick-add-vehicle-btn';
      btn.style.cssText = 'white-space:nowrap;margin-top:0;height:38px;padding:0 12px;';
      btn.innerHTML = '<i class="fas fa-plus"></i> <i class="fas fa-car" style="font-size:11px;"></i>';
      btn.title = 'Créer un véhicule rapidement';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._quickAddVehicle();
      });
      wrapper.appendChild(btn);
    }, 50);
  },

  // ======== YANGO SEARCH IN FORM ========

  _injectYangoSearchButton() {
    setTimeout(() => {
      const input = document.querySelector('#modal-body [name="yangoDriverId"]');
      if (!input) return;

      // Verifier qu'on n'a pas deja ajoute le bouton
      if (input.parentElement.querySelector('.yango-search-form-btn')) return;

      // Wrapper l'input + bouton dans un flex container
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';

      input.parentElement.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      input.style.flex = '1';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary yango-search-form-btn';
      btn.style.cssText = 'white-space:nowrap;margin-top:0;height:38px;padding:0 12px;';
      btn.innerHTML = '<i class="fas fa-search"></i> Yango';
      btn.title = 'Rechercher un chauffeur sur Yango';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._searchYangoInForm();
      });
      wrapper.appendChild(btn);

      // Ajouter le container de résultats sous le wrapper
      const resultsDiv = document.createElement('div');
      resultsDiv.id = 'yango-form-search-results';
      resultsDiv.style.cssText = 'margin-top:4px;';
      wrapper.parentElement.insertBefore(resultsDiv, wrapper.nextSibling);
    }, 60);
  },

  async _searchYangoInForm() {
    const container = document.getElementById('yango-form-search-results');
    if (!container) return;

    // Récupérer nom + telephone du formulaire pour le scoring de pertinence
    const body = document.getElementById('modal-body');
    const prenom = (body.querySelector('[name="prenom"]')?.value || '').trim();
    const nom = (body.querySelector('[name="nom"]')?.value || '').trim();
    const telephone = (body.querySelector('[name="telephone"]')?.value || '').trim();

    container.innerHTML = '<div style="padding:8px;font-size:var(--font-size-xs);color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Recherche des chauffeurs Yango...</div>';

    try {
      const res = await Store.getYangoDriversForLinking();
      if (!res || !res.drivers) {
        container.innerHTML = '<div style="color:#ef4444;font-size:var(--font-size-xs);"><i class="fas fa-exclamation-triangle"></i> Impossible de charger les chauffeurs Yango</div>';
        return;
      }

      const drivers = res.drivers;
      const searchName = `${prenom} ${nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const searchPhone = telephone.replace(/\D/g, '').slice(-10);

      // Scoring identique a _searchYangoDriver
      const scored = drivers.map(d => {
        let score = 0;
        const yName = `${d.prenom} ${d.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const yPhone = (d.telephone || '').replace(/\D/g, '').slice(-10);

        if (searchName.length >= 3) {
          if (yName === searchName) score += 100;
          else if (`${d.nom} ${d.prenom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === searchName) score += 90;
          else {
            const searchWords = searchName.split(' ').filter(w => w.length >= 3);
            const yWords = yName.split(' ');
            for (const sw of searchWords) {
              if (yWords.some(yw => yw === sw)) score += 30;
            }
          }
        }

        if (searchPhone.length >= 8 && yPhone === searchPhone) score += 80;

        return { ...d, _score: score };
      });

      scored.sort((a, b) => b._score - a._score);

      const top = scored.slice(0, 20);
      const matchCount = scored.filter(d => d._score > 0).length;

      container.innerHTML = `
        <div style="margin-bottom:8px;">
          <input type="text" class="form-control" id="yango-form-filter-input" placeholder="Filtrer par nom..." style="font-size:var(--font-size-xs);padding:6px 10px;"
            oninput="ChauffeursPage._filterYangoFormResults()">
        </div>
        ${matchCount > 0 ? `<div style="font-size:var(--font-size-xs);color:#22c55e;margin-bottom:6px;"><i class="fas fa-star"></i> ${matchCount} correspondance(s) probable(s)</div>` : ''}
        ${(!prenom && !nom && !telephone) ? '<div style="font-size:var(--font-size-xs);color:var(--warning);margin-bottom:6px;"><i class="fas fa-info-circle"></i> Remplissez nom/téléphone pour un meilleur tri</div>' : ''}
        <div id="yango-form-drivers-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-sm);">
          ${this._renderYangoFormDriversList(top)}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${drivers.length} chauffeurs Yango au total</div>
      `;

      // Stocker pour le filtre
      this._yangoFormDriversCache = scored;
    } catch (err) {
      container.innerHTML = `<div style="color:#ef4444;font-size:var(--font-size-xs);"><i class="fas fa-exclamation-triangle"></i> Erreur: ${err.message}</div>`;
    }
  },

  _renderYangoFormDriversList(drivers) {
    if (drivers.length === 0) return '<div style="padding:12px;text-align:center;font-size:var(--font-size-xs);color:var(--text-muted);">Aucun résultat</div>';

    return drivers.map(d => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border-color);font-size:var(--font-size-xs);${d._score >= 80 ? 'background:rgba(34,197,94,0.06);' : ''}">
        <div style="flex:1;">
          <div style="font-weight:500;">
            ${d._score >= 80 ? '<i class="fas fa-star" style="color:#22c55e;font-size:9px;"></i> ' : ''}
            ${d.prenom} ${d.nom}
          </div>
          <div style="color:var(--text-muted);font-size:10px;">${d.telephone || 'Pas de tel'} &bull; ${d.workStatus || '?'}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="ChauffeursPage._linkYangoFromForm('${d.id}', '${(d.prenom + ' ' + d.nom).replace(/'/g, "\\'")}')">
          <i class="fas fa-link"></i> Lier
        </button>
      </div>
    `).join('');
  },

  _filterYangoFormResults() {
    const input = document.getElementById('yango-form-filter-input');
    const list = document.getElementById('yango-form-drivers-list');
    if (!input || !list || !this._yangoFormDriversCache) return;

    const query = input.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    let filtered = this._yangoFormDriversCache;

    if (query) {
      filtered = this._yangoFormDriversCache.filter(d => {
        const name = `${d.prenom} ${d.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const phone = d.telephone || '';
        return name.includes(query) || phone.includes(query);
      });
    }

    list.innerHTML = this._renderYangoFormDriversList(filtered.slice(0, 30));
  },

  _linkYangoFromForm(yangoId, yangoNom) {
    const input = document.querySelector('#modal-body [name="yangoDriverId"]');
    if (input) {
      input.value = yangoId;
      // Déclencher l'event change pour que FormBuilder le capte
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Remplacer la zone de résultats par un badge de confirmation
    const container = document.getElementById('yango-form-search-results');
    if (container) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius-sm);font-size:var(--font-size-xs);margin-top:4px;">
          <i class="fas fa-check-circle" style="color:#22c55e;"></i>
          <span>Lié à <strong>${yangoNom}</strong> (${yangoId})</span>
          <button type="button" class="btn btn-sm" style="margin-left:auto;padding:2px 8px;font-size:10px;" onclick="ChauffeursPage._unlinkYangoFromForm()">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    }

    Toast.success(`Chauffeur sera lié à ${yangoNom} sur Yango`);
  },

  _unlinkYangoFromForm() {
    const input = document.querySelector('#modal-body [name="yangoDriverId"]');
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const container = document.getElementById('yango-form-search-results');
    if (container) container.innerHTML = '';
  },

  _quickAddVehicle() {
    // Sauvegarder l'etat du formulaire chauffeur actuellement ouvert
    const chauffeurModal = document.getElementById('modal-body');
    const savedValues = chauffeurModal ? FormBuilder.getValues(chauffeurModal) : {};
    if (this._currentEditId) savedValues._editId = this._currentEditId;

    // Construire un formulaire vehicule simplifie
    const quickFields = [
      { type: 'row-start' },
      { name: 'marque', label: 'Marque', type: 'text', required: true, placeholder: 'Ex: Toyota' },
      { name: 'modele', label: 'Modèle', type: 'text', required: true, placeholder: 'Ex: Corolla' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'annee', label: 'Année', type: 'number', min: 2015, max: 2026, required: true, default: new Date().getFullYear() },
      { name: 'immatriculation', label: 'Immatriculation', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'couleur', label: 'Couleur', type: 'text', placeholder: 'Ex: Noir' },
      { name: 'typeEnergie', label: "Énergie", type: 'select', options: [
        { value: 'thermique', label: 'Thermique' },
        { value: 'electrique', label: 'Électrique' }
      ]},
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'typeAcquisition', label: 'Acquisition', type: 'select', options: [
        { value: 'leasing', label: 'Leasing' },
        { value: 'cash', label: 'Cash' }
      ]},
      { name: 'kilometrage', label: 'Kilométrage', type: 'number', min: 0, default: 0 },
      { type: 'row-end' }
    ];

    const quickFormHtml = FormBuilder.build(quickFields);

    // Ouvrir un second modal (on ferme d'abord le premier, puis on le rouvrira)
    Modal.close();

    setTimeout(() => {
      Modal.form('<i class="fas fa-car text-blue"></i> Création rapide véhicule', quickFormHtml, () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, quickFields)) return;

        const values = FormBuilder.getValues(body);
        const isEV = values.typeEnergie === 'electrique';
        const vehicule = {
          id: Utils.generateId('VEH'),
          ...values,
          vin: '',
          consommation: isEV ? 15 : 6.5,
          coutEnergie: isEV ? 120 : 800,
          kilometrageMensuel: 2500,
          dateDerniereRevision: null,
          prochainRevisionKm: (values.kilometrage || 0) + 10000,
          assureur: '',
          primeAnnuelle: 0,
          prixAchat: 0,
          mensualiteLeasing: 0,
          dureeLeasing: 0,
          apportInitial: 0,
          numeroPolice: '',
          dateExpirationAssurance: '',
          statut: 'en_service',
          coutsMaintenance: [],
          dateCreation: new Date().toISOString()
        };

        if (isEV) {
          vehicule.capaciteBatterie = 60;
          vehicule.autonomieKm = 350;
          vehicule.niveauBatterie = 100;
          vehicule.typeChargeur = 'CCS Combo 2';
          vehicule.puissanceChargeMax = 100;
          vehicule.tempsRechargeRapide = 30;
          vehicule.tempsRechargeNormale = 480;
          vehicule.dernierRecharge = new Date().toISOString().split('T')[0];
          vehicule.stationRechargeHabituelle = '';
        }

        Store.add('vehicules', vehicule);
        Modal.close();
        Toast.success(`${vehicule.marque} ${vehicule.modele} créé et sélectionné`);

        // Rouvrir le formulaire chauffeur avec le vehicule pre-selectionne
        savedValues.vehiculeAssigne = vehicule.id;
        this._reopenChauffeurForm(savedValues);
      }, 'modal-md');
    }, 200);
  },

  _reopenChauffeurForm(savedValues) {
    // Reconstruire les fields (avec le nouveau vehicule dans la liste)
    const fields = this._getFormFields();
    const formHtml = FormBuilder.build(fields, savedValues);

    const isEdit = savedValues._editId;
    const title = isEdit
      ? '<i class="fas fa-user-edit text-blue"></i> Modifier chauffeur'
      : '<i class="fas fa-user-plus text-blue"></i> Nouveau chauffeur';

    setTimeout(() => {
      Modal.form(title, formHtml, () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;

        const values = FormBuilder.getValues(body);
        delete values._editId;

        if (isEdit) {
          Store.update('chauffeurs', isEdit, values);
          Modal.close();
          Toast.success('Chauffeur modifié avec succès');
          if (window.location.hash.includes(isEdit)) {
            this.renderDetail(isEdit);
          } else {
            this.render();
          }
        } else {
          const chauffeur = {
            id: Utils.generateId('CHF'),
            ...values,
            dateFinContrat: null,
            photo: null,
            documents: [],
            scoreConduite: Utils.random(60, 95),
            dateCreation: new Date().toISOString()
          };
          Store.add('chauffeurs', chauffeur);
          Modal.close();
          Toast.success(`${chauffeur.prenom} ${chauffeur.nom} ajouté avec succès`);
          this.render();
        }
      }, 'modal-lg');

      this._injectQuickVehicleButton();
    }, 200);
  },

  // ======== YANGO LINKING ========

  async _searchYangoDriver(chauffeurId) {
    const container = document.getElementById('yango-search-results');
    if (!container) return;

    const chauffeur = Store.findById('chauffeurs', chauffeurId);
    if (!chauffeur) return;

    container.innerHTML = '<div style="padding:8px;font-size:var(--font-size-xs);color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Recherche des chauffeurs Yango...</div>';

    try {
      const res = await Store.getYangoDriversForLinking();
      if (!res || !res.drivers) {
        container.innerHTML = '<div style="color:#ef4444;font-size:var(--font-size-xs);"><i class="fas fa-exclamation-triangle"></i> Impossible de charger les chauffeurs Yango</div>';
        return;
      }

      const drivers = res.drivers;
      const searchName = `${chauffeur.prenom} ${chauffeur.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const searchPhone = (chauffeur.telephone || '').replace(/\D/g, '').slice(-10);

      // Trier par pertinence : d'abord ceux qui matchent le nom/telephone
      const scored = drivers.map(d => {
        let score = 0;
        const yName = `${d.prenom} ${d.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const yPhone = (d.telephone || '').replace(/\D/g, '').slice(-10);

        // Match exact nom
        if (yName === searchName) score += 100;
        // Match inverse
        else if (`${d.nom} ${d.prenom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === searchName) score += 90;
        // Match partiel (un des mots du nom)
        else {
          const searchWords = searchName.split(' ');
          const yWords = yName.split(' ');
          for (const sw of searchWords) {
            if (sw.length >= 3 && yWords.some(yw => yw === sw)) score += 30;
          }
        }

        // Match telephone
        if (searchPhone.length >= 8 && yPhone === searchPhone) score += 80;

        return { ...d, _score: score };
      });

      scored.sort((a, b) => b._score - a._score);

      // Afficher les 20 premiers (pertinents d'abord)
      const top = scored.slice(0, 20);
      const matchCount = scored.filter(d => d._score > 0).length;

      container.innerHTML = `
        <div style="margin-bottom:8px;">
          <input type="text" class="form-control" id="yango-search-input" placeholder="Filtrer par nom..." style="font-size:var(--font-size-xs);padding:6px 10px;"
            oninput="ChauffeursPage._filterYangoResults()">
        </div>
        ${matchCount > 0 ? `<div style="font-size:var(--font-size-xs);color:#22c55e;margin-bottom:6px;"><i class="fas fa-star"></i> ${matchCount} correspondance(s) probable(s)</div>` : ''}
        <div id="yango-drivers-list" style="max-height:250px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-sm);">
          ${this._renderYangoDriversList(top, chauffeurId)}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${drivers.length} chauffeurs Yango au total</div>
      `;

      // Stocker pour le filtre
      this._yangoDriversCache = scored;
      this._yangoLinkChauffeurId = chauffeurId;
    } catch (err) {
      container.innerHTML = `<div style="color:#ef4444;font-size:var(--font-size-xs);"><i class="fas fa-exclamation-triangle"></i> Erreur: ${err.message}</div>`;
    }
  },

  _renderYangoDriversList(drivers, chauffeurId) {
    if (drivers.length === 0) return '<div style="padding:12px;text-align:center;font-size:var(--font-size-xs);color:var(--text-muted);">Aucun resultat</div>';

    return drivers.map(d => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border-color);font-size:var(--font-size-xs);${d._score >= 80 ? 'background:rgba(34,197,94,0.06);' : ''}">
        <div style="flex:1;">
          <div style="font-weight:500;">
            ${d._score >= 80 ? '<i class="fas fa-star" style="color:#22c55e;font-size:9px;"></i> ' : ''}
            ${d.prenom} ${d.nom}
          </div>
          <div style="color:var(--text-muted);font-size:10px;">${d.telephone || 'Pas de tel'} &bull; ${d.workStatus || '?'}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="ChauffeursPage._linkYango('${chauffeurId}', '${d.id}', '${(d.prenom + ' ' + d.nom).replace(/'/g, "\\'")}')">
          <i class="fas fa-link"></i> Lier
        </button>
      </div>
    `).join('');
  },

  _filterYangoResults() {
    const input = document.getElementById('yango-search-input');
    const list = document.getElementById('yango-drivers-list');
    if (!input || !list || !this._yangoDriversCache) return;

    const query = input.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    let filtered = this._yangoDriversCache;

    if (query) {
      filtered = this._yangoDriversCache.filter(d => {
        const name = `${d.prenom} ${d.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const phone = d.telephone || '';
        return name.includes(query) || phone.includes(query);
      });
    }

    list.innerHTML = this._renderYangoDriversList(filtered.slice(0, 30), this._yangoLinkChauffeurId);
  },

  async _linkYango(chauffeurId, yangoId, yangoNom) {
    Store.update('chauffeurs', chauffeurId, { yangoDriverId: yangoId });
    Toast.success(`Chauffeur lié a ${yangoNom} sur Yango`);
    this.renderDetail(chauffeurId);
  },

  async _unlinkYango(chauffeurId) {
    Modal.confirm(
      'Délier le profil Yango',
      'Voulez-vous supprimer la liaison avec le profil Yango ? Le chauffeur ne sera plus synchronisé automatiquement.',
      () => {
        Store.update('chauffeurs', chauffeurId, { yangoDriverId: '' });
        Toast.success('Liaison Yango supprimée');
        this.renderDetail(chauffeurId);
      }
    );
  }
};
