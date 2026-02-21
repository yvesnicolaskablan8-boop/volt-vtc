/**
 * VersementsPage - Payment tracking and validation
 */
const VersementsPage = {
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    container.innerHTML = this._template(data);
    this._loadCharts(data);
    this._bindEvents(data);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _getData() {
    const versements = Store.get('versements');
    const chauffeurs = Store.get('chauffeurs');
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const monthVers = versements.filter(v => {
      const d = new Date(v.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const totalCommission = monthVers.reduce((s, v) => s + v.commission, 0);
    const totalVerse = monthVers.reduce((s, v) => s + v.montantVerse, 0);
    const tauxRecouvrement = totalCommission > 0 ? (totalVerse / totalCommission) * 100 : 0;

    const byStatus = {
      valide: versements.filter(v => v.statut === 'valide').length,
      en_attente: versements.filter(v => v.statut === 'en_attente').length,
      retard: versements.filter(v => v.statut === 'retard').length,
      partiel: versements.filter(v => v.statut === 'partiel').length
    };

    // Weekly evolution (last 12 weeks)
    const weeklyEvo = [];
    for (let w = 11; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (w * 7 + now.getDay()));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekVers = versements.filter(v => {
        const d = new Date(v.date);
        return d >= weekStart && d <= weekEnd;
      });

      weeklyEvo.push({
        label: `S${Utils.getWeekNumber(weekStart)}`,
        total: weekVers.reduce((s, v) => s + v.montantVerse, 0)
      });
    }

    return { versements, chauffeurs, totalCommission, totalVerse, tauxRecouvrement, byStatus, weeklyEvo };
  },

  _template(d) {
    return `
      <div class="page-header">
        <h1><i class="fas fa-money-bill-transfer"></i> Versements</h1>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-versement"><i class="fas fa-plus"></i> Nouveau versement</button>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card">
          <div class="kpi-icon"><i class="fas fa-coins"></i></div>
          <div class="kpi-value">${Utils.formatCurrency(d.totalCommission)}</div>
          <div class="kpi-label">Commission attendue (mois)</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><i class="fas fa-check-circle"></i></div>
          <div class="kpi-value">${Utils.formatCurrency(d.totalVerse)}</div>
          <div class="kpi-label">Montant versé (mois)</div>
        </div>
        <div class="kpi-card ${d.tauxRecouvrement >= 80 ? 'cyan' : 'red'}">
          <div class="kpi-icon"><i class="fas fa-percentage"></i></div>
          <div class="kpi-value">${d.tauxRecouvrement.toFixed(1)}%</div>
          <div class="kpi-label">Taux de recouvrement</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-icon"><i class="fas fa-exclamation-triangle"></i></div>
          <div class="kpi-value">${d.byStatus.retard}</div>
          <div class="kpi-label">Versements en retard</div>
        </div>
      </div>

      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-pie"></i> Statut des versements</div>
          </div>
          <div class="chart-container" style="height:250px;">
            <canvas id="chart-versements-status"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-line"></i> Évolution hebdomadaire</div>
          </div>
          <div class="chart-container" style="height:250px;">
            <canvas id="chart-versements-weekly"></canvas>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div style="margin-top:var(--space-lg);">
        <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-md);flex-wrap:wrap;">
          <select class="form-control" id="filter-chauffeur" style="width:200px;">
            <option value="">Tous les chauffeurs</option>
            ${d.chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
          </select>
          <select class="form-control" id="filter-statut" style="width:160px;">
            <option value="">Tous statuts</option>
            <option value="valide">Validé</option>
            <option value="en_attente">En attente</option>
            <option value="retard">En retard</option>
            <option value="partiel">Partiel</option>
          </select>
        </div>
        <div id="versements-table"></div>
      </div>
    `;
  },

  _loadCharts(d) {
    this._charts = [];
    const statusLabels = ['Validé', 'En attente', 'En retard', 'Partiel'];
    const statusKeys = ['valide', 'en_attente', 'retard', 'partiel'];
    const totalVersements = statusKeys.reduce((s, k) => s + d.byStatus[k], 0);

    // Status donut — Click filters table + Center text + Enriched tooltips
    const statusCtx = document.getElementById('chart-versements-status');
    if (statusCtx) {
      this._charts.push(new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: statusLabels,
          datasets: [{
            data: statusKeys.map(k => d.byStatus[k]),
            backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6'],
            borderColor: '#111827',
            borderWidth: 2,
            hoverOffset: 12
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw;
                  const pct = totalVersements > 0 ? (val / totalVersements * 100).toFixed(1) : 0;
                  return `${ctx.label} : ${val} versements (${pct}%)`;
                }
              }
            }
          },
        },
        plugins: [Utils.doughnutCenterPlugin(
          () => totalVersements.toString(),
          'versements'
        )]
      }));
    }

    // Weekly evolution — Zoom/Pan + Enriched tooltips
    const weeklyCtx = document.getElementById('chart-versements-weekly');
    if (weeklyCtx) {
      this._charts.push(new Chart(weeklyCtx, {
        type: 'line',
        data: {
          labels: d.weeklyEvo.map(w => w.label),
          datasets: [{
            label: 'Montant verse',
            data: d.weeklyEvo.map(w => Math.round(w.total)),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            borderWidth: 2,
            pointHoverRadius: 8,
            pointHoverBorderWidth: 3,
            pointHoverBackgroundColor: '#22c55e',
            pointHoverBorderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => items.length ? `Semaine ${items[0].label}` : '',
                label: (ctx) => {
                  const val = Utils.formatCurrency(ctx.raw);
                  const idx = ctx.dataIndex;
                  const data = ctx.dataset.data;
                  if (idx > 0 && data[idx - 1] > 0) {
                    const variation = ((ctx.raw - data[idx - 1]) / data[idx - 1] * 100).toFixed(1);
                    return [`Verse : ${val}`, `${variation >= 0 ? '+' : ''}${variation}% vs semaine precedente`];
                  }
                  return `Verse : ${val}`;
                }
              }
            },
          },
          scales: { y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) } } }
        }
      }));
    }
  },

  _bindEvents(d) {
    const versements = d.versements.sort((a, b) => b.date.localeCompare(a.date));

    const renderTable = (data) => {
      Table.create({
        containerId: 'versements-table',
        columns: [
          {
            label: 'Chauffeur', key: 'chauffeurId', primary: true,
            render: (v) => {
              const c = d.chauffeurs.find(x => x.id === v.chauffeurId);
              return c ? `${c.prenom} ${c.nom}` : v.chauffeurId;
            },
            value: (v) => {
              const c = d.chauffeurs.find(x => x.id === v.chauffeurId);
              return c ? `${c.nom} ${c.prenom}` : '';
            }
          },
          { label: 'Période', key: 'periode' },
          { label: 'Date', key: 'date', render: (v) => Utils.formatDate(v.date) },
          { label: 'Brut', key: 'montantBrut', render: (v) => Utils.formatCurrency(v.montantBrut) },
          { label: 'Commission', key: 'commission', render: (v) => Utils.formatCurrency(v.commission) },
          { label: 'Versé', key: 'montantVerse', render: (v) => `<strong>${Utils.formatCurrency(v.montantVerse)}</strong>`, primary: true },
          { label: 'Courses', key: 'nombreCourses' },
          { label: 'Statut', key: 'statut', render: (v) => {
              let html = Utils.statusBadge(v.statut);
              if (v.soumisParChauffeur) {
                html += ' <span class="badge badge-info" style="font-size:0.65rem;"><i class="fas fa-mobile-alt"></i> Chauffeur</span>';
              }
              return html;
            }
          }
        ],
        data,
        pageSize: 15,
        actions: (v) => {
          let btns = '';
          if (v.statut === 'en_attente' || v.statut === 'retard') {
            btns += `<button class="btn btn-sm btn-success" onclick="VersementsPage._validate('${v.id}')" title="Valider"><i class="fas fa-check"></i></button> `;
          }
          btns += `<button class="btn btn-sm btn-secondary" onclick="VersementsPage._edit('${v.id}')" title="Modifier"><i class="fas fa-edit"></i></button>`;
          return btns;
        }
      });
    };

    renderTable(versements);

    // Filters
    const filterChauffeur = document.getElementById('filter-chauffeur');
    const filterStatut = document.getElementById('filter-statut');

    const applyFilters = () => {
      let filtered = [...versements];
      if (filterChauffeur.value) filtered = filtered.filter(v => v.chauffeurId === filterChauffeur.value);
      if (filterStatut.value) filtered = filtered.filter(v => v.statut === filterStatut.value);
      renderTable(filtered);
    };

    filterChauffeur.addEventListener('change', applyFilters);
    filterStatut.addEventListener('change', applyFilters);

    // Add button
    document.getElementById('btn-add-versement').addEventListener('click', () => this._add());
  },

  _add() {
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    const fields = [
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, placeholder: 'Sélectionner...', options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { type: 'row-start' },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'periode', label: 'Période (ex: 2025-S08)', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'montantBrut', label: 'Montant brut (FCFA)', type: 'number', min: 0, step: 0.01, required: true },
      { name: 'nombreCourses', label: 'Nombre de courses', type: 'number', min: 0, required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'montantVerse', label: 'Montant versé (FCFA)', type: 'number', min: 0, step: 0.01, required: true },
      { name: 'statut', label: 'Statut', type: 'select', options: [
        { value: 'valide', label: 'Validé' },
        { value: 'en_attente', label: 'En attente' },
        { value: 'retard', label: 'En retard' },
        { value: 'partiel', label: 'Partiel' }
      ]},
      { type: 'row-end' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2 }
    ];

    Modal.form('<i class="fas fa-money-bill-transfer text-blue"></i> Nouveau versement', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const chauffeur = Store.findById('chauffeurs', values.chauffeurId);

      const versement = {
        id: Utils.generateId('VRS'),
        ...values,
        vehiculeId: chauffeur ? chauffeur.vehiculeAssigne : null,
        commission: Math.round(values.montantBrut * 0.20 * 100) / 100,
        montantNet: Math.round(values.montantBrut * 0.80 * 100) / 100,
        dateValidation: values.statut === 'valide' ? new Date().toISOString() : null,
        dateCreation: new Date().toISOString()
      };

      Store.add('versements', versement);
      Modal.close();
      Toast.success('Versement enregistré');
      this.render();
    });
  },

  _edit(id) {
    const versement = Store.findById('versements', id);
    if (!versement) return;
    const chauffeurs = Store.get('chauffeurs');
    const fields = [
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { type: 'row-start' },
      { name: 'montantBrut', label: 'Montant brut (FCFA)', type: 'number', min: 0, step: 0.01 },
      { name: 'montantVerse', label: 'Montant versé (FCFA)', type: 'number', min: 0, step: 0.01 },
      { type: 'row-end' },
      { name: 'statut', label: 'Statut', type: 'select', options: [
        { value: 'valide', label: 'Validé' },
        { value: 'en_attente', label: 'En attente' },
        { value: 'retard', label: 'En retard' },
        { value: 'partiel', label: 'Partiel' }
      ]},
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2 }
    ];

    Modal.form('<i class="fas fa-edit text-blue"></i> Modifier versement', FormBuilder.build(fields, versement), () => {
      const body = document.getElementById('modal-body');
      const values = FormBuilder.getValues(body);
      values.commission = Math.round(values.montantBrut * 0.20 * 100) / 100;
      values.montantNet = Math.round(values.montantBrut * 0.80 * 100) / 100;
      if (values.statut === 'valide' && !versement.dateValidation) {
        values.dateValidation = new Date().toISOString();
      }
      Store.update('versements', id, values);
      Modal.close();
      Toast.success('Versement modifié');
      this.render();
    });
  },

  _validate(id) {
    Store.update('versements', id, {
      statut: 'valide',
      dateValidation: new Date().toISOString()
    });
    Toast.success('Versement validé');
    this.render();
    Header.refreshNotifications();
  }
};
