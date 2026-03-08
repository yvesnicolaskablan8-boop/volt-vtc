/**
 * VersementsPage - Payment tracking and validation
 */
const VersementsPage = {
  _charts: [],
  _selectedPeriod: null, // null = aujourd'hui, 'YYYY-MM-DD' = date spécifique

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    this._kpiData = data;
    container.innerHTML = this._template(data);
    this._loadCharts(data);
    this._bindEvents(data);
    this._bindPeriodSelector();
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _onPeriodChange(value) {
    this._selectedPeriod = value || null;
    this.destroy();
    this.render();
  },

  _resetToToday() {
    this._selectedPeriod = null;
    this.destroy();
    this.render();
  },

  _bindPeriodSelector() {
    const input = document.getElementById('versements-period');
    if (input) {
      input.addEventListener('change', () => this._onPeriodChange(input.value));
    }
  },

  _getData() {
    const versements = Store.get('versements');
    const chauffeurs = Store.get('chauffeurs');
    const now = new Date();
    const selectedDay = this._selectedPeriod || now.toISOString().split('T')[0];
    const sel = new Date(selectedDay);
    const thisMonth = sel.getMonth();
    const thisYear = sel.getFullYear();

    // Toujours filtrer par jour (selectedDay = aujourd'hui ou date choisie)
    const monthVers = versements.filter(v => v.date === selectedDay);

    const activeVers = monthVers.filter(v => v.statut !== 'supprime');
    const totalVerse = activeVers.filter(v => v.statut === 'valide' || v.statut === 'partiel').reduce((s, v) => s + (v.montantVerse || 0), 0);

    // Compter les statuts pour la période sélectionnée
    const byStatus = {
      valide: monthVers.filter(v => v.statut === 'valide').length,
      en_attente: monthVers.filter(v => v.statut === 'en_attente').length,
      retard: 0, // sera recalculé ci-dessous via le planning
      partiel: monthVers.filter(v => v.statut === 'partiel').length
    };

    // Calculer le montant attendu et les retards via le planning
    const planning = Store.get('planning') || [];
    const absences = Store.get('absences') || [];

    // Toujours filtrer sur le jour sélectionné
    const filterMinDate = selectedDay;
    const filterMaxDate = selectedDay;

    const scheduledDays = new Map();
    planning.filter(p => p.date >= filterMinDate && p.date <= filterMaxDate).forEach(p => {
      const key = `${p.chauffeurId}|${p.date}`;
      if (!scheduledDays.has(key)) scheduledDays.set(key, p);
    });

    let totalAttendu = 0;
    const detailProgrammes = [];
    const detailRetard = [];
    scheduledDays.forEach((p) => {
      const hasAbsence = absences.some(a => a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin);
      if (hasAbsence) return;
      const ch = chauffeurs.find(c => c.id === p.chauffeurId);
      if (!ch || ch.statut === 'inactif') return;
      const redevance = ch.redevanceQuotidienne || 0;
      if (redevance <= 0) return;
      detailProgrammes.push({ chauffeurId: p.chauffeurId, nom: ch.nom, prenom: ch.prenom, redevance, date: p.date });
      totalAttendu += redevance;
      const hasValidOrDismissed = versements.some(v => v.chauffeurId === p.chauffeurId && v.date === p.date && (v.statut === 'valide' || v.statut === 'supprime'));
      if (!hasValidOrDismissed) {
        byStatus.retard++;
        detailRetard.push({ chauffeurId: p.chauffeurId, nom: ch.nom, prenom: ch.prenom, redevance, date: p.date });
      }
    });

    const nbChauffeursProgrammes = new Set(detailProgrammes.map(d => d.chauffeurId)).size;
    const detailVerse = activeVers.filter(v => v.statut === 'valide' || v.statut === 'partiel').map(v => {
      const ch = chauffeurs.find(c => c.id === v.chauffeurId);
      return { chauffeurId: v.chauffeurId, nom: ch ? ch.nom : '?', prenom: ch ? ch.prenom : '?', montant: v.montantVerse || 0, date: v.date, statut: v.statut };
    });

    const tauxRecouvrement = totalAttendu > 0 ? (totalVerse / totalAttendu) * 100 : 0;

    const periodLabel = Utils.formatDate(selectedDay);

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
        total: weekVers.filter(v => v.statut !== 'supprime').reduce((s, v) => s + (v.montantVerse || 0), 0)
      });
    }

    return { versements, chauffeurs, totalAttendu, totalVerse, tauxRecouvrement, byStatus, weeklyEvo, periodLabel, selectedDay, detailProgrammes, detailRetard, detailVerse, nbChauffeursProgrammes };
  },

  _template(d) {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:transfer-horizontal-bold-duotone"></iconify-icon> Versements</h1>
        <div class="page-actions">
          <input type="date" id="versements-period" class="form-control" value="${this._selectedPeriod || new Date().toISOString().split('T')[0]}" style="width:155px;font-size:var(--font-size-xs);padding:4px 8px;">
          ${this._selectedPeriod ? `<button class="btn btn-sm btn-secondary" onclick="VersementsPage._resetToToday()" style="font-size:var(--font-size-xs);padding:4px 10px;">
            <iconify-icon icon="solar:restart-bold"></iconify-icon> Aujourd'hui
          </button>` : ''}
          <button class="btn btn-secondary" onclick="VersementsPage._exportPDF()"><iconify-icon icon="solar:document-bold-duotone"></iconify-icon> PDF</button>
          <button class="btn btn-secondary" onclick="VersementsPage._exportCSV()"><iconify-icon icon="solar:file-bold-duotone"></iconify-icon> CSV</button>
          <button class="btn btn-primary" id="btn-add-versement"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouveau versement</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:var(--space-md);margin-bottom:var(--space-lg);">
        <div class="kpi-card" style="cursor:pointer;" onclick="VersementsPage._showKpiDetail('attendu')" title="Cliquez pour voir le détail">
          <div class="kpi-icon"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(d.totalAttendu)}</div>
          <div class="kpi-label">Montant attendu — ${d.periodLabel}</div>
        </div>
        <div class="kpi-card green" style="cursor:pointer;" onclick="VersementsPage._showKpiDetail('verse')" title="Cliquez pour voir le détail">
          <div class="kpi-icon"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(d.totalVerse)}</div>
          <div class="kpi-label">Montant versé — ${d.periodLabel}</div>
        </div>
        <div class="kpi-card ${d.tauxRecouvrement >= 80 ? 'cyan' : 'red'}" style="cursor:pointer;" onclick="VersementsPage._showKpiDetail('taux')" title="Cliquez pour voir le détail">
          <div class="kpi-icon"><iconify-icon icon="solar:sale-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.tauxRecouvrement.toFixed(1)}%</div>
          <div class="kpi-label">Taux de recouvrement</div>
        </div>
        <div class="kpi-card blue" style="cursor:pointer;" onclick="VersementsPage._showKpiDetail('programmes')" title="Cliquez pour voir le détail">
          <div class="kpi-icon"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.nbChauffeursProgrammes}</div>
          <div class="kpi-label">Chauffeurs programmés</div>
        </div>
        <div class="kpi-card red" style="cursor:pointer;" onclick="VersementsPage._showKpiDetail('retard')" title="Cliquez pour voir le détail">
          <div class="kpi-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${d.byStatus.retard}</div>
          <div class="kpi-label">Versements en retard</div>
        </div>
      </div>

      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:pie-chart-2-bold-duotone"></iconify-icon> Statut des versements</div>
          </div>
          <div class="chart-container" style="height:250px;">
            <canvas id="chart-versements-status"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> Évolution hebdomadaire</div>
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
            borderColor: Utils.chartBorderColor(),
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
    const versements = d.versements.filter(v => v.statut !== 'en_attente').sort((a, b) => b.date.localeCompare(a.date));

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
          { label: 'Versé', key: 'montantVerse', render: (v) => v.statut === 'supprime' ? `<span style="text-decoration:line-through;color:var(--text-muted);">${Utils.formatCurrency(v.montantVerse)}</span>` : `<strong>${Utils.formatCurrency(v.montantVerse)}</strong>`, primary: true },
          { label: 'Courses', key: 'nombreCourses', render: (v) => `<span data-yango-courses="${v.id}">${v.nombreCourses > 0 ? `<span style="font-weight:600;">${v.nombreCourses}</span>` : '<iconify-icon icon="solar:refresh-bold" class="spin-icon" style="font-size:12px;color:var(--text-muted);"></iconify-icon>'}</span>` },
          { label: 'Statut', key: 'statut', render: (v) => {
              let html = Utils.statusBadge(v.statut);
              if (v.moyenPaiement === 'wave') {
                html += ' <span class="badge" style="font-size:0.65rem;background:rgba(13,110,253,0.1);color:#0D6EFD;"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon> Wave</span>';
              } else if (v.soumisParChauffeur) {
                html += ' <span class="badge badge-info" style="font-size:0.65rem;"><iconify-icon icon="solar:smartphone-bold-duotone"></iconify-icon> Chauffeur</span>';
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
            btns += `<button class="btn btn-sm btn-success" onclick="VersementsPage._validate('${v.id}')" title="Valider"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></button> `;
          }
          btns += `<button class="btn btn-sm btn-secondary" onclick="VersementsPage._edit('${v.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>`;
          if (v.statut === 'valide') {
            btns += ` <button class="btn btn-sm btn-outline" onclick="VersementsPage._exportReceipt('${v.id}')" title="Re\u00e7u PDF"><iconify-icon icon="solar:file-download-bold-duotone"></iconify-icon></button>`;
          }
          return btns;
        }
      });
    };

    renderTable(versements);
    this._loadYangoCourses(versements, d.chauffeurs);

    // Filters
    const filterChauffeur = document.getElementById('filter-chauffeur');
    const filterStatut = document.getElementById('filter-statut');

    const applyFilters = () => {
      let filtered = [...versements];
      if (filterChauffeur.value) filtered = filtered.filter(v => v.chauffeurId === filterChauffeur.value);
      if (filterStatut.value) filtered = filtered.filter(v => v.statut === filterStatut.value);
      renderTable(filtered);
      this._loadYangoCourses(filtered, d.chauffeurs);
    };

    filterChauffeur.addEventListener('change', applyFilters);
    filterStatut.addEventListener('change', applyFilters);

    // Add button
    document.getElementById('btn-add-versement').addEventListener('click', () => this._add());
  },

  async _loadYangoCourses(versements, chauffeurs) {
    // Regrouper par chauffeur+date pour éviter les appels dupliqués
    const calls = {};
    versements.forEach(v => {
      if (!v.date || !v.chauffeurId) return;
      const c = chauffeurs.find(x => x.id === v.chauffeurId);
      if (!c || !c.yangoDriverId) return;
      const key = `${c.yangoDriverId}_${v.date}`;
      if (!calls[key]) calls[key] = { yangoId: c.yangoDriverId, date: v.date, versementIds: [] };
      calls[key].versementIds.push(v.id);
    });

    // Lancer les appels en parallèle (max 5 simultanés)
    const entries = Object.values(calls);
    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          const stats = await Store.getYangoDriverStats(entry.yangoId, entry.date);
          return { ...entry, stats };
        })
      );

      results.forEach(r => {
        if (r.status !== 'fulfilled') return;
        const { versementIds, stats } = r.value;
        const nb = (stats && !stats.error) ? (stats.nbCourses || 0) : null;
        versementIds.forEach(id => {
          const cell = document.querySelector(`[data-yango-courses="${id}"]`);
          if (cell) {
            cell.innerHTML = nb !== null && nb > 0
              ? `<span style="font-weight:600;">${nb}</span>`
              : `<span style="color:var(--text-muted);">${nb === 0 ? '0' : '-'}</span>`;
          }
        });
      });
    }
  },

  _add() {
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    const session = Auth.getSession();
    const isAdmin = session && session.role === 'Administrateur';
    const statusOptions = [
      { value: 'valide', label: 'Validé' },
      { value: 'en_attente', label: 'En attente' },
      { value: 'retard', label: 'En retard' },
      { value: 'partiel', label: 'Partiel' },
      { value: 'supprime', label: 'Supprimer', disabled: !isAdmin }
    ];
    const fields = [
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, placeholder: 'Sélectionner...', options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { type: 'row-start' },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'periode', label: 'Période (ex: 2025-S08)', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'montantVerse', label: 'Montant versé (FCFA)', type: 'number', min: 0, step: 0.01, required: true },
      { name: 'statut', label: 'Statut', type: 'select', options: statusOptions },
      { type: 'row-end' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2 }
    ];

    Modal.form('<iconify-icon icon="solar:transfer-horizontal-bold-duotone" class="text-blue"></iconify-icon> Nouveau versement', FormBuilder.build(fields), async () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const chauffeur = Store.findById('chauffeurs', values.chauffeurId);

      // Récupérer les stats Yango (courses, CA) pour ce chauffeur à cette date
      let nombreCourses = 0;
      let montantBrut = values.montantVerse;
      if (chauffeur && chauffeur.yangoDriverId && values.date) {
        try {
          const stats = await Store.getYangoDriverStats(chauffeur.yangoDriverId, values.date);
          if (stats && !stats.error) {
            nombreCourses = stats.nbCourses || 0;
            montantBrut = stats.totalCA || values.montantVerse;
          }
        } catch (e) {
          console.warn('Versement: impossible de récupérer les stats Yango', e);
        }
      }

      const versement = {
        id: Utils.generateId('VRS'),
        ...values,
        vehiculeId: chauffeur ? chauffeur.vehiculeAssigne : null,
        montantBrut,
        nombreCourses,
        commission: 0,
        montantNet: values.montantVerse,
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
    const session = Auth.getSession();
    const isAdmin = session && session.role === 'Administrateur';
    const editStatusOptions = [
      { value: 'valide', label: 'Validé' },
      { value: 'en_attente', label: 'En attente' },
      { value: 'retard', label: 'En retard' },
      { value: 'partiel', label: 'Partiel' },
      { value: 'supprime', label: 'Supprimer', disabled: !isAdmin }
    ];
    const fields = [
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { type: 'row-start' },
      { name: 'montantVerse', label: 'Montant versé (FCFA)', type: 'number', min: 0, step: 0.01 },
      { name: 'statut', label: 'Statut', type: 'select', options: editStatusOptions },
      { type: 'row-end' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2 }
    ];

    Modal.form('<iconify-icon icon="solar:pen-bold-duotone" class="text-blue"></iconify-icon> Modifier versement', FormBuilder.build(fields, versement), () => {
      const body = document.getElementById('modal-body');
      const values = FormBuilder.getValues(body);
      values.montantBrut = values.montantVerse;
      values.montantNet = values.montantVerse;
      values.commission = 0;
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
    Toast.success('Versement valid\u00e9');
    this.render();
    Header.refreshNotifications();
  },

  // =================== KPI DETAIL MODALS ===================

  _showKpiDetail(type) {
    const d = this._kpiData;
    if (!d) return;
    let title = '';
    let html = '';

    const thStyle = 'padding:10px 12px;text-align:left;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);';
    const tdStyle = 'padding:10px 12px;border-bottom:1px solid var(--border-color);';

    switch(type) {
      case 'attendu': {
        title = '<iconify-icon icon="solar:wallet-money-bold-duotone" style="color:var(--volt-blue);"></iconify-icon> Détail — Montant attendu';
        const byDriver = {};
        d.detailProgrammes.forEach(p => {
          if (!byDriver[p.chauffeurId]) byDriver[p.chauffeurId] = { nom: p.nom, prenom: p.prenom, total: 0, jours: 0, redevance: p.redevance };
          byDriver[p.chauffeurId].total += p.redevance;
          byDriver[p.chauffeurId].jours++;
        });
        const rows = Object.values(byDriver).sort((a,b) => b.total - a.total);
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Basé sur le planning et la redevance quotidienne de chaque chauffeur pour <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}text-align:center;">Jours</th>
            <th style="${thStyle}text-align:right;">Redevance/jour</th>
            <th style="${thStyle}text-align:right;">Total</th>
          </tr></thead><tbody>
          ${rows.map(r => `<tr>
            <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
            <td style="${tdStyle}text-align:center;">${r.jours}</td>
            <td style="${tdStyle}text-align:right;">${Utils.formatCurrency(r.redevance)}</td>
            <td style="${tdStyle}text-align:right;font-weight:600;">${Utils.formatCurrency(r.total)}</td>
          </tr>`).join('')}
          </tbody>
          <tfoot><tr style="border-top:2px solid var(--border-color);">
            <td style="padding:10px 12px;font-weight:700;">Total</td>
            <td style="padding:10px 12px;text-align:center;font-weight:700;">${d.detailProgrammes.length} jour${d.detailProgrammes.length > 1 ? 's' : ''}</td>
            <td></td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;">${Utils.formatCurrency(d.totalAttendu)}</td>
          </tr></tfoot>
        </table>`;
        break;
      }
      case 'verse': {
        title = '<iconify-icon icon="solar:check-circle-bold-duotone" style="color:#22c55e;"></iconify-icon> Détail — Montant versé';
        const rows = [...d.detailVerse].sort((a,b) => b.montant - a.montant);
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Versements validés et partiels pour <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}">Date</th>
            <th style="${thStyle}text-align:right;">Montant</th>
            <th style="${thStyle}text-align:center;">Statut</th>
          </tr></thead><tbody>
          ${rows.length ? rows.map(r => `<tr>
            <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
            <td style="${tdStyle}">${Utils.formatDate(r.date)}</td>
            <td style="${tdStyle}text-align:right;font-weight:600;">${Utils.formatCurrency(r.montant)}</td>
            <td style="${tdStyle}text-align:center;">${Utils.statusBadge(r.statut)}</td>
          </tr>`).join('') : `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--text-muted);">Aucun versement pour cette période</td></tr>`}
          </tbody>
          ${rows.length ? `<tfoot><tr style="border-top:2px solid var(--border-color);">
            <td colspan="2" style="padding:10px 12px;font-weight:700;">${rows.length} versement${rows.length > 1 ? 's' : ''}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;">${Utils.formatCurrency(d.totalVerse)}</td>
            <td></td>
          </tr></tfoot>` : ''}
        </table>`;
        break;
      }
      case 'taux': {
        title = '<iconify-icon icon="solar:sale-bold-duotone" style="color:var(--volt-blue);"></iconify-icon> Détail — Taux de recouvrement';
        const byDriver = {};
        d.detailProgrammes.forEach(p => {
          if (!byDriver[p.chauffeurId]) byDriver[p.chauffeurId] = { nom: p.nom, prenom: p.prenom, attendu: 0, verse: 0 };
          byDriver[p.chauffeurId].attendu += p.redevance;
        });
        d.detailVerse.forEach(v => {
          if (!byDriver[v.chauffeurId]) byDriver[v.chauffeurId] = { nom: v.nom, prenom: v.prenom, attendu: 0, verse: 0 };
          byDriver[v.chauffeurId].verse += v.montant;
        });
        const rows = Object.values(byDriver).sort((a,b) => {
          const pctA = a.attendu > 0 ? a.verse / a.attendu : 0;
          const pctB = b.attendu > 0 ? b.verse / b.attendu : 0;
          return pctA - pctB;
        });
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Comparaison attendu vs versé par chauffeur — <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}text-align:right;">Attendu</th>
            <th style="${thStyle}text-align:right;">Versé</th>
            <th style="${thStyle}text-align:right;">Écart</th>
            <th style="${thStyle}text-align:right;">%</th>
          </tr></thead><tbody>
          ${rows.map(r => {
            const ecart = r.verse - r.attendu;
            const pct = r.attendu > 0 ? (r.verse / r.attendu * 100) : 0;
            const pctColor = pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
            return `<tr>
              <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
              <td style="${tdStyle}text-align:right;">${Utils.formatCurrency(r.attendu)}</td>
              <td style="${tdStyle}text-align:right;font-weight:600;">${Utils.formatCurrency(r.verse)}</td>
              <td style="${tdStyle}text-align:right;color:${ecart >= 0 ? '#22c55e' : '#ef4444'};">${ecart >= 0 ? '+' : ''}${Utils.formatCurrency(ecart)}</td>
              <td style="${tdStyle}text-align:right;font-weight:700;color:${pctColor};">${pct.toFixed(0)}%</td>
            </tr>`;
          }).join('')}
          </tbody>
          <tfoot><tr style="border-top:2px solid var(--border-color);">
            <td style="padding:10px 12px;font-weight:700;">Total</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;">${Utils.formatCurrency(d.totalAttendu)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;">${Utils.formatCurrency(d.totalVerse)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;color:${d.totalVerse - d.totalAttendu >= 0 ? '#22c55e' : '#ef4444'};">${d.totalVerse - d.totalAttendu >= 0 ? '+' : ''}${Utils.formatCurrency(d.totalVerse - d.totalAttendu)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;">${d.tauxRecouvrement.toFixed(1)}%</td>
          </tr></tfoot>
        </table>`;
        break;
      }
      case 'programmes': {
        title = '<iconify-icon icon="solar:users-group-rounded-bold-duotone" style="color:var(--volt-blue);"></iconify-icon> Chauffeurs programmés';
        const byDriver = {};
        d.detailProgrammes.forEach(p => {
          if (!byDriver[p.chauffeurId]) byDriver[p.chauffeurId] = { nom: p.nom, prenom: p.prenom, redevance: p.redevance, jours: 0 };
          byDriver[p.chauffeurId].jours++;
        });
        // Check which drivers have paid
        const paidDriverIds = new Set(d.detailVerse.map(v => v.chauffeurId));
        const retardDriverIds = new Set(d.detailRetard.map(r => r.chauffeurId));
        const rows = Object.entries(byDriver).sort((a,b) => a[1].nom.localeCompare(b[1].nom));
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Chauffeurs planifiés (hors absences/inactifs) — <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}text-align:center;">Jours</th>
            <th style="${thStyle}text-align:right;">Redevance/jour</th>
            <th style="${thStyle}text-align:right;">Total attendu</th>
            <th style="${thStyle}text-align:center;">Statut versement</th>
          </tr></thead><tbody>
          ${rows.map(([id, r]) => {
            const paid = paidDriverIds.has(id);
            const late = retardDriverIds.has(id);
            const badge = paid ? '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:rgba(34,197,94,0.1);color:#22c55e;">Versé</span>' : late ? '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:rgba(239,68,68,0.1);color:#ef4444;">Impayé</span>' : '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:rgba(107,114,128,0.1);color:#6b7280;">—</span>';
            return `<tr>
              <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
              <td style="${tdStyle}text-align:center;">${r.jours}</td>
              <td style="${tdStyle}text-align:right;">${Utils.formatCurrency(r.redevance)}</td>
              <td style="${tdStyle}text-align:right;font-weight:600;">${Utils.formatCurrency(r.redevance * r.jours)}</td>
              <td style="${tdStyle}text-align:center;">${badge}</td>
            </tr>`;
          }).join('')}
          </tbody>
          <tfoot><tr style="border-top:2px solid var(--border-color);">
            <td style="padding:10px 12px;font-weight:700;">${rows.length} chauffeur${rows.length > 1 ? 's' : ''}</td>
            <td style="padding:10px 12px;text-align:center;font-weight:700;">${d.detailProgrammes.length}</td>
            <td></td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;">${Utils.formatCurrency(d.totalAttendu)}</td>
            <td></td>
          </tr></tfoot>
        </table>`;
        break;
      }
      case 'retard': {
        title = '<iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:#ef4444;"></iconify-icon> Versements en retard';
        const rows = [...d.detailRetard].sort((a,b) => a.date.localeCompare(b.date));
        const totalDu = rows.reduce((s,r) => s + r.redevance, 0);
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Chauffeurs programmés n'ayant pas encore versé — <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}">Date</th>
            <th style="${thStyle}text-align:right;">Redevance due</th>
          </tr></thead><tbody>
          ${rows.length ? rows.map(r => `<tr>
            <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
            <td style="${tdStyle}">${Utils.formatDate(r.date)}</td>
            <td style="${tdStyle}text-align:right;font-weight:600;color:#ef4444;">${Utils.formatCurrency(r.redevance)}</td>
          </tr>`).join('') : `<tr><td colspan="3" style="padding:20px;text-align:center;color:var(--text-muted);">Aucun versement en retard 🎉</td></tr>`}
          </tbody>
          ${rows.length ? `<tfoot><tr style="border-top:2px solid var(--border-color);">
            <td colspan="2" style="padding:10px 12px;font-weight:700;">${rows.length} impayé${rows.length > 1 ? 's' : ''}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;color:#ef4444;">${Utils.formatCurrency(totalDu)}</td>
          </tr></tfoot>` : ''}
        </table>`;
        break;
      }
    }
    this._showKpiModal(title, html);
  },

  _showKpiModal(title, html) {
    const existing = document.getElementById('kpi-detail-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'kpi-detail-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:var(--radius-lg);padding:24px;max-width:800px;width:92%;max-height:82vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.1rem;">${title}</h3>
          <button onclick="document.getElementById('kpi-detail-overlay').remove()" style="background:var(--bg-tertiary);border:none;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;">&times;</button>
        </div>
        ${html}
      </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
    document.body.appendChild(overlay);
  },

  _exportReceipt(id) {
    const v = Store.findById('versements', id);
    if (!v) return;
    DashboardPage._generateReceiptPDF(v.chauffeurId, v.date, v.montantVerse, v.moyenPaiement, v.referencePaiement);
  },

  _exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const versements = Store.get('versements').filter(v => v.statut !== 'supprime');
    const chauffeurs = Store.get('chauffeurs');

    doc.setFontSize(18);
    doc.text('Rapport des Versements', 14, 22);
    doc.setFontSize(10);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);

    const rows = versements.slice(0, 50).map(v => {
      const ch = chauffeurs.find(c => c.id === v.chauffeurId);
      return [
        ch ? `${ch.prenom} ${ch.nom}` : v.chauffeurId,
        Utils.formatDate(v.date),
        Utils.formatCurrency(v.montantVerse),
        v.statut
      ];
    });

    doc.autoTable({
      head: [['Chauffeur', 'Date', 'Montant', 'Statut']],
      body: rows,
      startY: 36,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save('versements-volt.pdf');
    Toast.success('PDF exporté');
  },

  _exportCSV() {
    const versements = Store.get('versements').filter(v => v.statut !== 'supprime');
    const chauffeurs = Store.get('chauffeurs');

    let csv = 'Chauffeur,Date,Montant,Statut,Commentaire\n';
    versements.forEach(v => {
      const ch = chauffeurs.find(c => c.id === v.chauffeurId);
      const name = ch ? `${ch.prenom} ${ch.nom}` : v.chauffeurId;
      csv += `"${name}","${v.date}","${v.montantVerse}","${v.statut}","${(v.commentaire || '').replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'versements-volt.csv';
    a.click();
    URL.revokeObjectURL(url);
    Toast.success('CSV exporté');
  }
};
