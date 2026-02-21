/**
 * ChauffeursPage - Driver management with CRUD and detail view
 * Integrates Yango real-time data for active drivers
 */
const ChauffeursPage = {
  _charts: [],
  _table: null,
  _yangoDrivers: null,

  render() {
    const container = document.getElementById('page-content');
    const chauffeurs = Store.get('chauffeurs');
    container.innerHTML = this._listTemplate(chauffeurs);
    this._bindListEvents();
    this._loadYangoDrivers();
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

      <!-- Yango Drivers Section -->
      <div class="yango-section" id="yango-chauffeurs-section" style="margin-bottom: var(--space-lg);">
        <div class="yango-section-header">
          <div class="yango-section-title">
            <span>Chauffeurs Yango</span>
            <span class="yango-badge-live">EN SERVICE</span>
          </div>
          <div class="yango-section-actions">
            <span class="yango-last-update" id="yango-chauffeurs-update"></span>
            <button class="btn btn-sm yango-refresh-btn" onclick="ChauffeursPage._loadYangoDrivers()" id="yango-chauffeurs-refresh">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>
        <div class="grid-4" id="yango-chauffeurs-kpis">
          <div class="kpi-card yango-kpi">
            <div class="kpi-icon yango-icon-green"><i class="fas fa-users"></i></div>
            <div class="kpi-value" id="yc-total"><div class="yango-skeleton"></div></div>
            <div class="kpi-label">En service Yango</div>
          </div>
          <div class="kpi-card yango-kpi">
            <div class="kpi-icon yango-icon-green"><i class="fas fa-signal"></i></div>
            <div class="kpi-value" id="yc-online"><div class="yango-skeleton"></div></div>
            <div class="kpi-label">En ligne</div>
          </div>
          <div class="kpi-card yango-kpi">
            <div class="kpi-icon yango-icon-orange"><i class="fas fa-car"></i></div>
            <div class="kpi-value" id="yc-busy"><div class="yango-skeleton"></div></div>
            <div class="kpi-label">En course</div>
          </div>
          <div class="kpi-card yango-kpi">
            <div class="kpi-icon yango-icon-purple"><i class="fas fa-moon"></i></div>
            <div class="kpi-value" id="yc-offline"><div class="yango-skeleton"></div></div>
            <div class="kpi-label">Hors ligne</div>
          </div>
        </div>
        <div id="yango-chauffeurs-table" style="margin-top: var(--space-md);">
          <div class="yango-loading"><i class="fas fa-spinner fa-spin"></i> Chargement Yango...</div>
        </div>
      </div>

      <div class="card" style="margin-bottom: var(--space-md);">
        <div class="card-header"><span class="card-title"><i class="fas fa-database"></i> Chauffeurs Volt (base interne)</span></div>
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

  // =================== YANGO INTEGRATION ===================

  async _loadYangoDrivers() {
    const refreshBtn = document.getElementById('yango-chauffeurs-refresh');
    if (refreshBtn) { refreshBtn.classList.add('spinning'); refreshBtn.disabled = true; }

    try {
      const data = await Store.getYangoDrivers();
      if (!data || data.error) {
        this._showYangoDriversError(data?.details || data?.error || 'Erreur');
        return;
      }

      this._yangoDrivers = data.drivers || [];
      const drivers = this._yangoDrivers;

      // Update KPIs
      const total = data.total || drivers.length;
      const online = data.online || 0;
      const busy = data.busy || 0;
      const offline = total - online - busy;

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setVal('yc-total', total);
      setVal('yc-online', online);
      setVal('yc-busy', busy);
      setVal('yc-offline', offline);

      // Render table
      const container = document.getElementById('yango-chauffeurs-table');
      if (container && drivers.length > 0) {
        const statusOrder = { en_ligne: 0, occupe: 1, hors_ligne: 2 };
        const sorted = [...drivers].sort((a, b) => (statusOrder[a.statut] || 2) - (statusOrder[b.statut] || 2));

        container.innerHTML = `
          <table class="data-table">
            <thead>
              <tr>
                <th>Chauffeur</th>
                <th>Telephone</th>
                <th>Statut</th>
                <th>Vehicule</th>
                <th>Balance</th>
                <th>Derniere activite</th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map(d => {
                const statusConfig = {
                  en_ligne: { label: 'En ligne', class: 'yango-status-online' },
                  occupe: { label: 'En course', class: 'yango-status-busy' },
                  hors_ligne: { label: 'Hors ligne', class: 'yango-status-offline' }
                };
                const status = statusConfig[d.statut] || statusConfig.hors_ligne;
                const lastUpdate = d.derniereMaj
                  ? new Date(d.derniereMaj).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
                  : '--';
                const balVal = parseFloat(d.balance || 0);
                const balClass = balVal >= 0 ? 'yango-balance-positive' : 'yango-balance-negative';
                const vehicule = d.vehicule
                  ? `${d.vehicule.marque} ${d.vehicule.modele} <span class="text-muted">${d.vehicule.immatriculation}</span>`
                  : '<span class="text-muted">--</span>';

                return `
                  <tr>
                    <td class="primary">
                      <div style="display:flex;align-items:center;gap:8px;">
                        <div class="avatar-sm">${(d.nom?.[0] || d.prenom?.[0] || '?').toUpperCase()}</div>
                        <div>
                          <div style="font-weight:500">${d.prenom} ${d.nom}</div>
                        </div>
                      </div>
                    </td>
                    <td>${d.telephone || '--'}</td>
                    <td>
                      <span class="yango-status ${status.class}">
                        <i class="fas fa-circle"></i> ${status.label}
                      </span>
                    </td>
                    <td>${vehicule}</td>
                    <td class="tabular-nums ${balClass}">${balVal.toLocaleString('fr-FR')} F</td>
                    <td class="text-muted" style="font-size:var(--font-size-xs);">${lastUpdate}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      } else if (container) {
        container.innerHTML = '<div class="yango-empty"><i class="fas fa-user-check"></i><span>Aucun chauffeur en service</span></div>';
      }

      // Update timestamp
      const updateEl = document.getElementById('yango-chauffeurs-update');
      if (updateEl) {
        const now = new Date();
        updateEl.textContent = `Maj: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      }
    } catch (err) {
      console.error('Yango drivers load error:', err);
      this._showYangoDriversError('Impossible de charger les chauffeurs Yango');
    } finally {
      if (refreshBtn) { refreshBtn.classList.remove('spinning'); refreshBtn.disabled = false; }
    }
  },

  _showYangoDriversError(msg) {
    ['yc-total', 'yc-online', 'yc-busy', 'yc-offline'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '--';
    });
    const container = document.getElementById('yango-chauffeurs-table');
    if (container) {
      container.innerHTML = `
        <div class="yango-error">
          <i class="fas fa-exclamation-triangle"></i>
          <span>${msg}</span>
          <button class="btn btn-sm btn-secondary" onclick="ChauffeursPage._loadYangoDrivers()" style="margin-top:8px;">
            <i class="fas fa-redo"></i> Reessayer
          </button>
        </div>
      `;
    }
  },

  // CRUD operations
  _getFormFields() {
    const vehicules = Store.get('vehicules');
    return [
      { type: 'row-start' },
      { name: 'prenom', label: 'Prénom', type: 'text', required: true },
      { name: 'nom', label: 'Nom', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'email', label: 'Email', type: 'email', required: true },
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
      { name: 'noteInterne', label: 'Note interne', type: 'textarea', rows: 2 }
    ];
  },

  _add() {
    const fields = this._getFormFields();
    const formHtml = FormBuilder.build(fields);

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
  },

  _edit(id) {
    const chauffeur = Store.findById('chauffeurs', id);
    if (!chauffeur) return;

    const fields = this._getFormFields();
    const formHtml = FormBuilder.build(fields, chauffeur);

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
  }
};
