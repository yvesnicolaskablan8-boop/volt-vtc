/**
 * ComptabilitePage - Module comptabilité complet et accessible
 * Conçu pour être utilisable par un non-comptable
 *
 * Fonctionnalités :
 * 1. Vue d'ensemble financière (résumé simplifié)
 * 2. Enregistrement des recettes et dépenses
 * 3. Journal des opérations
 * 4. Compte de résultat simplifié
 * 5. Suivi de trésorerie
 * 6. Gestion des factures (clients/fournisseurs)
 * 7. Budget prévisionnel vs réel
 * 8. Export comptable
 */
const ComptabilitePage = {
  _charts: [],
  _currentTab: 'overview',
  _yangoStats: null,
  _todayCommission: null,

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._renderTab(this._currentTab);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
    this._todayCommission = null;
  },

  _template() {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:calculator-bold-duotone"></iconify-icon> Comptabilité</h1>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="ComptabilitePage._exportPDF()"><iconify-icon icon="solar:document-bold-duotone"></iconify-icon> PDF</button>
          <button class="btn btn-secondary" onclick="ComptabilitePage._exportCSV()"><iconify-icon icon="solar:file-bold-duotone"></iconify-icon> CSV</button>
          <button class="btn btn-success" id="btn-add-recette"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Encaissement</button>
          <button class="btn btn-danger" id="btn-add-depense"><iconify-icon icon="solar:minus-circle-bold-duotone"></iconify-icon> Décaissement</button>
        </div>
      </div>

      <!-- Navigation onglets -->
      <div class="tabs" id="compta-tabs">
        <div class="tab active" data-tab="overview"><iconify-icon icon="solar:home-bold-duotone"></iconify-icon> Vue d'ensemble</div>
        <div class="tab" data-tab="journal"><iconify-icon icon="solar:book-bold-duotone"></iconify-icon> Journal</div>
        <div class="tab" data-tab="resultat"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> Résultat</div>
        <div class="tab" data-tab="tresorerie"><iconify-icon icon="solar:wallet-bold-duotone"></iconify-icon> Trésorerie</div>
        <div class="tab" data-tab="factures"><iconify-icon icon="solar:file-text-bold-duotone"></iconify-icon> Factures</div>
        <div class="tab" data-tab="depenses"><iconify-icon icon="solar:wallet-2-bold-duotone"></iconify-icon> Dépenses</div>
        <div class="tab" data-tab="budget"><iconify-icon icon="solar:target-bold-duotone"></iconify-icon> Budget</div>
        <div class="tab" data-tab="categories"><iconify-icon icon="solar:tag-bold-duotone"></iconify-icon> Catégories</div>
      </div>

      <!-- Contenu dynamique -->
      <div id="compta-content"></div>
    `;
  },

  _bindEvents() {
    document.querySelectorAll('#compta-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#compta-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._currentTab = tab.dataset.tab;
        this._renderTab(this._currentTab);
      });
    });

    document.getElementById('btn-add-recette').addEventListener('click', () => this._addOperation('recette'));
    document.getElementById('btn-add-depense').addEventListener('click', () => this._addOperation('depense'));
  },

  _renderTab(tab) {
    this._charts.forEach(c => c.destroy());
    this._charts = [];

    const ct = document.getElementById('compta-content');
    switch (tab) {
      case 'overview': ct.innerHTML = this._renderOverview(); this._loadOverviewCharts(); break;
      case 'journal': ct.innerHTML = this._renderJournal(); this._bindJournalEvents(); break;
      case 'resultat': ct.innerHTML = this._renderResultat(); this._loadResultatCharts(); break;
      case 'tresorerie': ct.innerHTML = this._renderTresorerie(); this._loadTresorerieCharts(); break;
      case 'factures': ct.innerHTML = this._renderFactures(); this._bindFacturesEvents(); break;
      case 'depenses': ct.innerHTML = this._renderDepenses(); this._bindDepensesEvents(); break;
      case 'budget': ct.innerHTML = this._renderBudget(); this._loadBudgetCharts(); break;
      case 'categories': ct.innerHTML = this._renderCategories(); break;
    }
  },

  // ========================= HELPERS =========================

  _getOperations() { return Store.get('comptabilite') || []; },
  _getFactures() { return Store.get('factures') || []; },
  _getBudgets() { return Store.get('budgets') || []; },

  _thisMonthOps(ops) {
    const now = new Date();
    return ops.filter(o => {
      const d = new Date(o.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  },

  _monthOps(ops, year, month) {
    return ops.filter(o => {
      const d = new Date(o.date);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  },

  // ========================= VUE D'ENSEMBLE =========================

  _renderOverview() {
    const ops = this._getOperations();
    const now = new Date();
    const monthOps = this._thisMonthOps(ops);

    const recettes = monthOps.filter(o => o.type === 'recette');
    const depenses = monthOps.filter(o => o.type === 'depense');
    const totalRecettes = recettes.reduce((s, o) => s + o.montant, 0);
    const totalDepenses = depenses.reduce((s, o) => s + o.montant, 0);
    const resultat = totalRecettes - totalDepenses;

    // Solde total (toutes opérations)
    const soldeTotal = ops.reduce((s, o) => s + (o.type === 'recette' ? o.montant : -o.montant), 0);

    // Last month for comparison
    const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const lastMonthOps = this._monthOps(ops, ly, lm);
    const lmRecettes = lastMonthOps.filter(o => o.type === 'recette').reduce((s, o) => s + o.montant, 0);
    const lmDepenses = lastMonthOps.filter(o => o.type === 'depense').reduce((s, o) => s + o.montant, 0);
    const trendRecettes = lmRecettes > 0 ? ((totalRecettes - lmRecettes) / lmRecettes * 100) : 0;
    const trendDepenses = lmDepenses > 0 ? ((totalDepenses - lmDepenses) / lmDepenses * 100) : 0;

    // Unpaid invoices
    const factures = this._getFactures();
    const impayees = factures.filter(f => f.statut !== 'payee');
    const totalImpaye = impayees.reduce((s, f) => s + (f.montantTTC || f.montant || 0), 0);

    // Top depenses categories this month
    const catDepenses = {};
    depenses.forEach(o => {
      catDepenses[o.categorie] = (catDepenses[o.categorie] || 0) + o.montant;
    });

    return `
      <!-- KPIs financiers simplifiés -->
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card green">
          <div class="kpi-icon"><iconify-icon icon="solar:arrow-down-bold"></iconify-icon></div>
          <div class="kpi-value" style="color:var(--success)">${Utils.formatCurrency(totalRecettes)}</div>
          <div class="kpi-label">Encaissements du mois</div>
          <div class="kpi-trend ${trendRecettes >= 0 ? 'up' : 'down'}">
            <iconify-icon icon="solar:arrow-${trendRecettes >= 0 ? 'up' : 'down'}-bold"></iconify-icon> ${Math.abs(trendRecettes).toFixed(1)}% vs mois dernier
          </div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-icon"><iconify-icon icon="solar:arrow-up-bold"></iconify-icon></div>
          <div class="kpi-value" style="color:var(--danger)">${Utils.formatCurrency(totalDepenses)}</div>
          <div class="kpi-label">Décaissements du mois</div>
          <div class="kpi-trend ${trendDepenses <= 0 ? 'up' : 'down'}">
            <iconify-icon icon="solar:arrow-${trendDepenses <= 0 ? 'down' : 'up'}-bold"></iconify-icon> ${Math.abs(trendDepenses).toFixed(1)}% vs mois dernier
          </div>
        </div>
        <div class="kpi-card ${resultat >= 0 ? 'green' : 'red'}">
          <div class="kpi-icon"><iconify-icon icon="solar:scale-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(resultat)}</div>
          <div class="kpi-label">${resultat >= 0 ? 'Bénéfice du mois' : 'Perte du mois'}</div>
          <div class="kpi-trend ${resultat >= 0 ? 'up' : 'down'}">
            <iconify-icon icon="solar:${resultat >= 0 ? 'emoji-funny-circle-bold-duotone' : 'sad-circle-bold-duotone'}"></iconify-icon> ${resultat >= 0 ? 'Positif' : 'Négatif'}
          </div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><iconify-icon icon="solar:money-bag-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(soldeTotal)}</div>
          <div class="kpi-label">Solde de trésorerie</div>
          ${totalImpaye > 0 ? `<div class="kpi-trend down"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> ${Utils.formatCurrency(totalImpaye)} impayé</div>` : '<div class="kpi-trend up"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tout est à jour</div>'}
        </div>
      </div>

      <!-- Commission Partenaire Yango -->
      <div class="yango-section" id="compta-yango-section" style="margin-bottom:var(--space-lg);">
        <div class="yango-section-header">
          <div class="yango-section-title">
            <iconify-icon icon="solar:hand-money-bold-duotone" style="color:#FC4C02"></iconify-icon>
            <span>Commission Partenaire</span>
            <span class="yango-badge-live">REVENU</span>
          </div>
          <div class="yango-section-actions" style="display:flex;align-items:center;gap:8px;">
            <input type="date" id="cy-date-from" style="padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-xs);" />
            <span style="color:var(--text-muted);font-size:var(--font-size-xs);">au</span>
            <input type="date" id="cy-date-to" style="padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-xs);" />
            <button class="btn btn-sm yango-refresh-btn" onclick="ComptabilitePage._loadYangoCommission()" id="compta-yango-refresh">
              <iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon>
            </button>
          </div>
        </div>
        <div class="grid-2" id="compta-yango-kpis">
          <div class="kpi-card yango-kpi" style="border-top-color:rgba(34, 197, 94, 0.5) !important;">
            <div class="kpi-icon yango-icon-green"><iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon></div>
            <div class="kpi-value" id="cy-comm-mois" style="color:var(--success)"><div class="yango-skeleton"></div></div>
            <div class="kpi-label" id="cy-comm-mois-label">Commission du mois</div>
          </div>
          <div class="kpi-card yango-kpi" style="border-top-color:rgba(34, 197, 94, 0.5) !important;">
            <div class="kpi-icon yango-icon-green"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
            <div class="kpi-value" id="cy-comm-jour" style="color:var(--success)"><div class="yango-skeleton"></div></div>
            <div class="kpi-label" id="cy-comm-jour-label">Commission aujourd'hui</div>
          </div>
        </div>
        <div style="margin-top:var(--space-sm);padding:8px 12px;border-radius:var(--radius-sm);background:var(--bg-tertiary);font-size:var(--font-size-xs);color:var(--text-muted);display:flex;align-items:center;gap:8px;">
          <iconify-icon icon="solar:info-circle-bold-duotone" style="color:#FC4C02"></iconify-icon>
          Commission partenaire reversée par Yango, calculée automatiquement a partir des transactions réelles.
        </div>
      </div>

      <!-- Guide rapide pour non-comptable -->
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid var(--volt-blue);background:linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));">
        <div style="display:flex;align-items:center;gap:var(--space-md);">
          <div style="width:48px;height:48px;border-radius:50%;background:var(--volt-blue-glow);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--volt-blue);"><iconify-icon icon="solar:lightbulb-bold-duotone"></iconify-icon></div>
          <div style="flex:1;">
            <h3 style="font-size:var(--font-size-base);margin-bottom:4px;">Comment ça marche ?</h3>
            <p style="font-size:var(--font-size-sm);line-height:1.6;">
              <strong style="color:var(--success);">Encaissement</strong> = argent qui rentre (versements chauffeurs, paiements clients, <strong>commission Yango</strong>)<br>
              <strong style="color:var(--danger);">Décaissement</strong> = argent qui sort (carburant, maintenance, salaires, loyers, assurance)<br>
              <strong style="color:var(--volt-blue);">Bénéfice</strong> = Encaissements − Décaissements. Si positif, vous gagnez de l'argent !
            </p>
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Encaissements vs Décaissements (6 mois)</div>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="chart-compta-overview"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:pie-chart-2-bold-duotone"></iconify-icon> Répartition des dépenses du mois</div>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="chart-compta-depenses"></canvas>
          </div>
        </div>
      </div>

      <!-- Dernières opérations -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title">Dernières opérations</span>
          <button class="btn btn-sm btn-secondary" onclick="document.querySelector('[data-tab=journal]').click()">Voir tout</button>
        </div>
        <div id="compta-recent-ops"></div>
      </div>
    `;
  },

  _loadOverviewCharts() {
    // Init date pickers and load Yango commission data
    this._initYangoDatePickers();
    this._loadYangoCommission();

    const ops = this._getOperations();
    const now = new Date();

    // 6 month comparison
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mOps = this._monthOps(ops, d.getFullYear(), d.getMonth());
      months.push({
        label: Utils.getMonthShort(d.getMonth()),
        recettes: mOps.filter(o => o.type === 'recette').reduce((s, o) => s + o.montant, 0),
        depenses: mOps.filter(o => o.type === 'depense').reduce((s, o) => s + o.montant, 0)
      });
    }

    const overCtx = document.getElementById('chart-compta-overview');
    if (overCtx) {
      this._charts.push(new Chart(overCtx, {
        type: 'bar',
        data: {
          labels: months.map(m => m.label),
          datasets: [
            { label: 'Encaissements', data: months.map(m => Math.round(m.recettes)), backgroundColor: '#22c55e', hoverBackgroundColor: '#16a34a', borderRadius: 4 },
            { label: 'Décaissements', data: months.map(m => Math.round(m.depenses)), backgroundColor: '#ef4444', hoverBackgroundColor: '#dc2626', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                title: (items) => items[0] ? `Mois : ${items[0].label}` : '',
                label: (ctx) => {
                  const value = ctx.raw;
                  const datasetIndex = ctx.datasetIndex;
                  const index = ctx.dataIndex;
                  const prev = index > 0 ? ctx.dataset.data[index - 1] : null;
                  let variation = '';
                  if (prev !== null && prev > 0) {
                    const pct = ((value - prev) / prev * 100).toFixed(1);
                    variation = ` (${pct >= 0 ? '+' : ''}${pct}%)`;
                  }
                  return `${ctx.dataset.label}: ${Utils.formatCurrency(value)}${variation}`;
                }
              }
            }
          },
          scales: { y: { beginAtZero: true, ticks: { callback: v => Utils.formatCurrency(v) } } }
        }
      }));
    }

    // Dépenses par catégorie
    const monthOps = this._thisMonthOps(ops).filter(o => o.type === 'depense');
    const catMap = {};
    monthOps.forEach(o => { catMap[o.categorie] = (catMap[o.categorie] || 0) + o.montant; });
    const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const catLabels = { carburant: 'Carburant', maintenance: 'Maintenance', assurance: 'Assurance', leasing: 'Leasing', salaire: 'Salaires', loyer: 'Loyer/Bureau', impots: 'Impôts/Taxes', telephone: 'Télécom', divers: 'Divers', marketing: 'Marketing', fournitures: 'Fournitures' };
    const catColors = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#22d3ee', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#64748b'];

    const depCtx = document.getElementById('chart-compta-depenses');
    if (depCtx && cats.length > 0) {
      const depensesData = cats.map(([, v]) => Math.round(v));
      const depensesTotal = depensesData.reduce((s, v) => s + v, 0);
      this._charts.push(new Chart(depCtx, {
        type: 'doughnut',
        data: {
          labels: cats.map(([k]) => catLabels[k] || k),
          datasets: [{
            data: depensesData,
            backgroundColor: catColors.slice(0, cats.length),
            borderColor: Utils.chartBorderColor(),
            borderWidth: 2,
            hoverOffset: 12
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: {
            legend: { position: 'right', labels: { font: { size: 11 }, padding: 8 } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const value = ctx.raw;
                  const pct = depensesTotal > 0 ? ((value / depensesTotal) * 100).toFixed(1) : 0;
                  return `${ctx.label}: ${Utils.formatCurrency(value)} (${pct}%)`;
                }
              }
            }
          }
        },
        plugins: [Utils.doughnutCenterPlugin(Utils.formatCurrency(depensesTotal), 'Total dépenses')]
      }));
    }

    // Recent ops table
    const recent = ops.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    Table.create({
      containerId: 'compta-recent-ops',
      columns: [
        { label: 'Date', key: 'date', render: o => Utils.formatDate(o.date) },
        { label: 'Type', key: 'type', render: o => o.type === 'recette' ? '<span class="badge badge-success"><iconify-icon icon="solar:arrow-down-bold" style="font-size:8px"></iconify-icon> Encaissement</span>' : '<span class="badge badge-danger"><iconify-icon icon="solar:arrow-up-bold" style="font-size:8px"></iconify-icon> Décaissement</span>' },
        { label: 'Catégorie', key: 'categorie', render: o => `<span class="badge badge-info">${this._catLabel(o.categorie)}</span>` },
        { label: 'Description', key: 'description', primary: true },
        { label: 'Montant', key: 'montant', render: o => `<strong class="${o.type === 'recette' ? 'text-success' : 'text-danger'}">${o.type === 'recette' ? '+' : '-'}${Utils.formatCurrency(o.montant)}</strong>`, primary: true },
        { label: 'Réf.', key: 'reference' }
      ],
      data: recent,
      pageSize: 8
    });
  },

  // ========================= JOURNAL =========================

  _renderJournal() {
    const ops = this._getOperations().sort((a, b) => b.date.localeCompare(a.date));
    return `
      <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-md);flex-wrap:wrap;align-items:center;">
        <select class="form-control" id="journal-type" style="width:180px;">
          <option value="">Tous types</option>
          <option value="recette">Encaissements</option>
          <option value="depense">Décaissements</option>
        </select>
        <select class="form-control" id="journal-cat" style="width:180px;">
          <option value="">Toutes catégories</option>
          ${this._getCategoriesOptions()}
        </select>
        <select class="form-control" id="journal-month" style="width:180px;">
          <option value="">Tous les mois</option>
          ${Array.from({ length: 12 }, (_, i) => {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            return `<option value="${d.getFullYear()}-${d.getMonth()}">${Utils.getMonthName(d.getMonth())} ${d.getFullYear()}</option>`;
          }).join('')}
        </select>
        <div style="flex:1;"></div>
        <button class="btn btn-sm btn-secondary" id="journal-export-csv"><iconify-icon icon="solar:file-bold-duotone"></iconify-icon> Exporter CSV</button>
        <button class="btn btn-sm btn-secondary" id="journal-export-pdf"><iconify-icon icon="solar:file-bold-duotone"></iconify-icon> Exporter PDF</button>
      </div>
      <div id="journal-table"></div>
    `;
  },

  _bindJournalEvents() {
    const ops = this._getOperations().sort((a, b) => b.date.localeCompare(a.date));

    const renderTable = (data) => {
      Table.create({
        containerId: 'journal-table',
        columns: [
          { label: 'Date', key: 'date', render: o => Utils.formatDate(o.date) },
          { label: 'Type', key: 'type', render: o => o.type === 'recette' ? '<span class="badge badge-success">Encaissement</span>' : '<span class="badge badge-danger">Décaissement</span>' },
          { label: 'Catégorie', key: 'categorie', render: o => `<span class="badge badge-info">${this._catLabel(o.categorie)}</span>` },
          { label: 'Description', key: 'description', primary: true },
          { label: 'Montant', key: 'montant', render: o => `<strong class="${o.type === 'recette' ? 'text-success' : 'text-danger'}">${o.type === 'recette' ? '+' : '-'}${Utils.formatCurrency(o.montant)}</strong>`, primary: true },
          { label: 'Référence', key: 'reference' },
          { label: 'Mode', key: 'modePaiement', render: o => o.modePaiement || '-' }
        ],
        data,
        pageSize: 20,
        actions: (o) => `
          <button class="btn btn-sm btn-secondary" onclick="ComptabilitePage._editOperation('${o.id}')"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
          <button class="btn btn-sm btn-danger" onclick="ComptabilitePage._deleteOperation('${o.id}')"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
        `
      });
    };

    renderTable(ops);

    const filter = () => {
      let filtered = [...ops];
      const type = document.getElementById('journal-type').value;
      const cat = document.getElementById('journal-cat').value;
      const month = document.getElementById('journal-month').value;
      if (type) filtered = filtered.filter(o => o.type === type);
      if (cat) filtered = filtered.filter(o => o.categorie === cat);
      if (month) {
        const [y, m] = month.split('-').map(Number);
        filtered = filtered.filter(o => { const d = new Date(o.date); return d.getFullYear() === y && d.getMonth() === m; });
      }
      renderTable(filtered);
    };

    ['journal-type', 'journal-cat', 'journal-month'].forEach(id => {
      document.getElementById(id).addEventListener('change', filter);
    });

    document.getElementById('journal-export-csv').addEventListener('click', () => {
      const data = this._getOperations().sort((a, b) => b.date.localeCompare(a.date));
      Utils.exportCSV(
        ['Date', 'Type', 'Catégorie', 'Description', 'Montant', 'Référence', 'Mode paiement'],
        data.map(o => [Utils.formatDate(o.date), o.type === 'recette' ? 'Encaissement' : 'Décaissement', this._catLabel(o.categorie), o.description, o.type === 'recette' ? o.montant : -o.montant, o.reference, o.modePaiement || '']),
        `volt-journal-${new Date().toISOString().split('T')[0]}.csv`
      );
      Toast.success('Journal exporté en CSV');
    });

    document.getElementById('journal-export-pdf').addEventListener('click', () => {
      const data = this._getOperations().sort((a, b) => b.date.localeCompare(a.date));
      Utils.exportPDF('Journal comptable',
        ['Date', 'Type', 'Catégorie', 'Description', 'Montant', 'Réf.'],
        data.map(o => [Utils.formatDate(o.date), o.type === 'recette' ? 'Encaissement' : 'Décaissement', this._catLabel(o.categorie), o.description, `${o.type === 'recette' ? '+' : '-'}${Utils.formatCurrency(o.montant)}`, o.reference])
      );
      Toast.success('Journal exporté en PDF');
    });
  },

  // ========================= COMPTE DE RESULTAT =========================

  _renderResultat() {
    const ops = this._getOperations();
    const now = new Date();
    const year = now.getFullYear();

    // Annual data
    const yearOps = ops.filter(o => new Date(o.date).getFullYear() === year);
    const recettes = yearOps.filter(o => o.type === 'recette');
    const depenses = yearOps.filter(o => o.type === 'depense');

    // Recettes par catégorie
    const recByCat = {};
    recettes.forEach(o => { recByCat[o.categorie] = (recByCat[o.categorie] || 0) + o.montant; });

    // Depenses par catégorie
    const depByCat = {};
    depenses.forEach(o => { depByCat[o.categorie] = (depByCat[o.categorie] || 0) + o.montant; });

    const totalRec = recettes.reduce((s, o) => s + o.montant, 0);
    const totalDep = depenses.reduce((s, o) => s + o.montant, 0);
    const resultat = totalRec - totalDep;
    const marge = totalRec > 0 ? (resultat / totalRec * 100) : 0;

    return `
      <div class="grid-3" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card green">
          <div class="kpi-value">${Utils.formatCurrency(totalRec)}</div>
          <div class="kpi-label">Total encaissements ${year}</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-value">${Utils.formatCurrency(totalDep)}</div>
          <div class="kpi-label">Total décaissements ${year}</div>
        </div>
        <div class="kpi-card ${resultat >= 0 ? 'green' : 'red'}">
          <div class="kpi-value">${Utils.formatCurrency(resultat)}</div>
          <div class="kpi-label">Résultat net (marge: ${marge.toFixed(1)}%)</div>
        </div>
      </div>

      <!-- Compte de résultat simplifié -->
      <div class="grid-2" style="margin-bottom:var(--space-lg);">
        <div class="card" style="border-left:4px solid var(--success);">
          <div class="card-header"><span class="card-title" style="color:var(--success)"><iconify-icon icon="solar:arrow-down-bold"></iconify-icon> Encaissements (ce que vous recevez)</span></div>
          ${Object.entries(recByCat).sort((a, b) => b[1] - a[1]).map(([cat, total]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:var(--font-size-sm);">
              <span>${this._catLabel(cat)}</span>
              <strong class="text-success">${Utils.formatCurrency(total)}</strong>
            </div>
          `).join('')}
          <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:var(--font-size-base);font-weight:700;">
            <span>TOTAL ENCAISSEMENTS</span>
            <span class="text-success">${Utils.formatCurrency(totalRec)}</span>
          </div>
        </div>

        <div class="card" style="border-left:4px solid var(--danger);">
          <div class="card-header"><span class="card-title" style="color:var(--danger)"><iconify-icon icon="solar:arrow-up-bold"></iconify-icon> Décaissements (ce que vous payez)</span></div>
          ${Object.entries(depByCat).sort((a, b) => b[1] - a[1]).map(([cat, total]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:var(--font-size-sm);">
              <span>${this._catLabel(cat)}</span>
              <strong class="text-danger">${Utils.formatCurrency(total)}</strong>
            </div>
          `).join('')}
          <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:var(--font-size-base);font-weight:700;">
            <span>TOTAL DÉCAISSEMENTS</span>
            <span class="text-danger">${Utils.formatCurrency(totalDep)}</span>
          </div>
        </div>
      </div>

      <!-- Résultat final -->
      <div class="card" style="border-left:4px solid ${resultat >= 0 ? 'var(--success)' : 'var(--danger)'};text-align:center;padding:var(--space-xl);">
        <h2 style="color:${resultat >= 0 ? 'var(--success)' : 'var(--danger)'};">
          <iconify-icon icon="solar:${resultat >= 0 ? 'cup-star-bold-duotone' : 'danger-triangle-bold-duotone'}"></iconify-icon>
          Résultat net : ${Utils.formatCurrency(resultat)}
        </h2>
        <p style="margin-top:var(--space-sm);">${resultat >= 0
          ? 'Votre entreprise est bénéficiaire. Continuez ainsi !'
          : 'Votre entreprise est déficitaire. Analysez vos dépenses pour identifier des économies possibles.'}</p>
      </div>

      <div class="charts-grid" style="margin-top:var(--space-lg);">
        <div class="chart-card full-width">
          <div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> Évolution du résultat mensuel ${year}</div></div>
          <div class="chart-container" style="height:300px;"><canvas id="chart-resultat-evo"></canvas></div>
        </div>
      </div>
    `;
  },

  _loadResultatCharts() {
    const ops = this._getOperations();
    const now = new Date();
    const year = now.getFullYear();

    const monthly = [];
    for (let m = 0; m <= now.getMonth(); m++) {
      const mOps = this._monthOps(ops, year, m);
      const rec = mOps.filter(o => o.type === 'recette').reduce((s, o) => s + o.montant, 0);
      const dep = mOps.filter(o => o.type === 'depense').reduce((s, o) => s + o.montant, 0);
      monthly.push({ label: Utils.getMonthShort(m), recettes: rec, depenses: dep, resultat: rec - dep });
    }

    const ctx = document.getElementById('chart-resultat-evo');
    if (ctx) {
      this._charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: monthly.map(m => m.label),
          datasets: [
            { label: 'Encaissements', data: monthly.map(m => Math.round(m.recettes)), backgroundColor: 'rgba(34, 197, 94, 0.7)', borderRadius: 4, order: 2 },
            { label: 'Décaissements', data: monthly.map(m => Math.round(m.depenses)), backgroundColor: 'rgba(239, 68, 68, 0.7)', borderRadius: 4, order: 2 },
            { label: 'Résultat', data: monthly.map(m => Math.round(m.resultat)), type: 'line', borderColor: '#3b82f6', borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#3b82f6', fill: false, order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: {
              callbacks: {
                title: (items) => items[0] ? `Mois : ${items[0].label}` : '',
                label: (ctx) => {
                  const value = ctx.raw;
                  const index = ctx.dataIndex;
                  const prev = index > 0 ? ctx.dataset.data[index - 1] : null;
                  let variation = '';
                  if (prev !== null && prev !== 0) {
                    const pct = ((value - prev) / Math.abs(prev) * 100).toFixed(1);
                    variation = ` (${pct >= 0 ? '+' : ''}${pct}%)`;
                  }
                  return `${ctx.dataset.label}: ${Utils.formatCurrency(value)}${variation}`;
                }
              }
            },
          },
          scales: { y: { ticks: { callback: v => Utils.formatCurrency(v) } } }
        }
      }));
    }
  },

  // ========================= TRESORERIE =========================

  _renderTresorerie() {
    const ops = this._getOperations().sort((a, b) => a.date.localeCompare(b.date));
    // Cumulative balance over time
    let balance = 0;
    const balances = [];
    ops.forEach(o => {
      balance += o.type === 'recette' ? o.montant : -o.montant;
      balances.push({ date: o.date, balance, type: o.type, montant: o.montant });
    });

    // By payment mode
    const byMode = {};
    ops.forEach(o => {
      const mode = o.modePaiement || 'non_specifie';
      if (!byMode[mode]) byMode[mode] = { recettes: 0, depenses: 0 };
      if (o.type === 'recette') byMode[mode].recettes += o.montant;
      else byMode[mode].depenses += o.montant;
    });

    return `
      <div class="grid-2" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card cyan" style="text-align:center;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:8px;">SOLDE ACTUEL</div>
          <div class="kpi-value" style="font-size:var(--font-size-3xl);color:${balance >= 0 ? 'var(--success)' : 'var(--danger)'}">${Utils.formatCurrency(balance)}</div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Par mode de paiement</span></div>
          ${Object.entries(byMode).map(([mode, data]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-color);font-size:var(--font-size-sm);">
              <span class="badge badge-info">${this._modeLabel(mode)}</span>
              <div>
                <span class="text-success">${Utils.formatCurrency(data.recettes)}</span>
                <span class="text-muted" style="margin:0 4px;">/</span>
                <span class="text-danger">${Utils.formatCurrency(data.depenses)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:graph-bold-duotone"></iconify-icon> Évolution de la trésorerie</div></div>
        <div class="chart-container" style="height:350px;"><canvas id="chart-tresorerie-evo"></canvas></div>
      </div>
    `;
  },

  _loadTresorerieCharts() {
    const ops = this._getOperations().sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    const points = [];
    const seen = {};

    ops.forEach(o => {
      balance += o.type === 'recette' ? o.montant : -o.montant;
      const day = o.date.slice(0, 10);
      seen[day] = balance;
    });

    const dates = Object.keys(seen).sort();
    const balanceData = dates.map(d => Math.round(seen[d]));
    const ctx = document.getElementById('chart-tresorerie-evo');
    if (ctx && dates.length > 0) {
      this._charts.push(new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates.map(d => d.slice(5)),
          datasets: [{
            label: 'Solde', data: balanceData,
            borderColor: '#22d3ee', backgroundColor: 'rgba(34, 211, 238, 0.1)',
            fill: true, borderWidth: 2, pointRadius: 2,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#22d3ee',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => items[0] ? `Date : ${items[0].label}` : '',
                label: (ctx) => {
                  const value = ctx.raw;
                  const index = ctx.dataIndex;
                  const prev = index > 0 ? ctx.dataset.data[index - 1] : null;
                  let variation = '';
                  if (prev !== null) {
                    const diff = value - prev;
                    variation = ` (${diff >= 0 ? '+' : ''}${Utils.formatCurrency(diff)})`;
                  }
                  return `Solde: ${Utils.formatCurrency(value)}${variation}`;
                }
              }
            },
          },
          scales: { y: { ticks: { callback: v => Utils.formatCurrency(v) } } }
        }
      }));
    }
  },

  // ========================= FACTURES =========================

  _renderFactures() {
    const factures = this._getFactures().sort((a, b) => (b.dateEmission || b.date || '').localeCompare(a.dateEmission || a.date || ''));
    const stats = {
      total: factures.length,
      payee: factures.filter(f => f.statut === 'payee').length,
      en_attente: factures.filter(f => f.statut === 'en_attente').length,
      en_retard: factures.filter(f => f.statut === 'en_retard').length,
      montantDu: factures.filter(f => f.statut !== 'payee').reduce((s, f) => s + (f.montantTTC || f.montant || 0), 0)
    };

    return `
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card"><div class="kpi-value">${stats.total}</div><div class="kpi-label">Total factures</div></div>
        <div class="kpi-card green"><div class="kpi-value">${stats.payee}</div><div class="kpi-label">Payées</div></div>
        <div class="kpi-card yellow"><div class="kpi-value">${stats.en_attente}</div><div class="kpi-label">En attente</div></div>
        <div class="kpi-card red"><div class="kpi-value">${Utils.formatCurrency(stats.montantDu)}</div><div class="kpi-label">Montant dû</div></div>
      </div>

      <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-md);">
        <button class="btn btn-primary" id="btn-add-facture"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouvelle facture</button>
        <select class="form-control" id="facture-filter" style="width:180px;">
          <option value="">Tous statuts</option>
          <option value="payee">Payées</option>
          <option value="en_attente">En attente</option>
          <option value="en_retard">En retard</option>
        </select>
      </div>
      <div id="factures-table"></div>
    `;
  },

  _bindFacturesEvents() {
    const factures = this._getFactures().sort((a, b) => (b.dateEmission || b.date || '').localeCompare(a.dateEmission || a.date || ''));

    const renderTable = (data) => {
      Table.create({
        containerId: 'factures-table',
        columns: [
          { label: 'N° Facture', key: 'numero', primary: true },
          { label: 'Date', key: 'dateEmission', render: f => Utils.formatDate(f.dateEmission || f.date) },
          { label: 'Client/Fournisseur', key: 'client', render: f => f.client || f.tiers || '-', primary: true },
          { label: 'Type', key: 'typeFacture', render: f => f.typeFacture === 'client' ? '<span class="badge badge-success">Client</span>' : '<span class="badge badge-warning">Fournisseur</span>' },
          { label: 'Description', key: 'description' },
          { label: 'Montant TTC', key: 'montantTTC', render: f => Utils.formatCurrency(f.montantTTC || f.montant || 0), primary: true },
          { label: 'Échéance', key: 'dateEcheance', render: f => Utils.formatDate(f.dateEcheance || f.echeance) },
          { label: 'Statut', key: 'statut', render: f => Utils.statusBadge(f.statut === 'payee' ? 'valide' : f.statut === 'en_attente' ? 'en_attente' : 'retard') }
        ],
        data,
        pageSize: 15,
        actions: f => {
          let btns = '';
          if (f.statut !== 'payee') {
            btns += `<button class="btn btn-sm btn-success" onclick="ComptabilitePage._markPaid('${f.id}')" title="Marquer payée"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></button> `;
          }
          btns += `<button class="btn btn-sm btn-secondary" onclick="ComptabilitePage._editFacture('${f.id}')"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>`;
          return btns;
        }
      });
    };

    renderTable(factures);

    document.getElementById('facture-filter').addEventListener('change', (e) => {
      const v = e.target.value;
      renderTable(v ? factures.filter(f => f.statut === v) : factures);
    });

    document.getElementById('btn-add-facture').addEventListener('click', () => this._addFacture());
  },

  // ========================= BUDGET =========================

  _renderBudget() {
    const budgets = this._getBudgets();
    const ops = this._getOperations();
    const now = new Date();
    const monthOps = this._thisMonthOps(ops).filter(o => o.type === 'depense');

    const categories = ['carburant', 'maintenance', 'assurance', 'leasing', 'salaires', 'loyer_bureau', 'taxes_impots', 'telecoms', 'marketing', 'fournitures', 'autres_depenses'];
    const catLabels = { carburant: 'Carburant', maintenance: 'Maintenance', assurance: 'Assurance', leasing: 'Leasing véhicules', salaires: 'Salaires', loyer_bureau: 'Loyer / Bureau', taxes_impots: 'Impôts / Taxes', telecoms: 'Télécom', marketing: 'Marketing', fournitures: 'Fournitures', autres_depenses: 'Autres dépenses' };

    return `
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid var(--volt-yellow);">
        <div style="display:flex;align-items:center;gap:var(--space-md);">
          <iconify-icon icon="solar:lightbulb-bold-duotone" style="font-size:24px;color:var(--volt-yellow);"></iconify-icon>
          <div>
            <h3 style="font-size:var(--font-size-sm);">Budget prévisionnel vs Réel</h3>
            <p style="font-size:var(--font-size-xs);color:var(--text-muted);">Définissez un budget pour chaque catégorie de dépense et suivez votre consommation réelle. Les barres rouges dépassant le budget signalent un dépassement.</p>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:var(--space-lg);">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:target-bold-duotone"></iconify-icon> Budget du mois - ${Utils.getMonthName(now.getMonth())} ${now.getFullYear()}</span>
          <button class="btn btn-sm btn-primary" id="btn-save-budget"><iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;" id="budget-rows">
          ${categories.map(cat => {
            const budget = budgets.find(b => b.categorie === cat);
            const budgetVal = budget ? budget.montant : 0;
            const spent = monthOps.filter(o => o.categorie === cat).reduce((s, o) => s + o.montant, 0);
            const pct = budgetVal > 0 ? Math.min(150, (spent / budgetVal) * 100) : 0;
            const isOver = spent > budgetVal && budgetVal > 0;

            return `
              <div style="display:grid;grid-template-columns:160px 160px 1fr 120px;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-color);">
                <span style="font-size:var(--font-size-sm);font-weight:500;">${catLabels[cat]}</span>
                <div>
                  <input type="number" class="form-control budget-input" data-cat="${cat}" value="${budgetVal}" placeholder="Budget" style="font-size:var(--font-size-sm);">
                </div>
                <div>
                  <div class="progress-bar" style="height:12px;border-radius:6px;">
                    <div class="progress-fill ${isOver ? 'red' : pct > 80 ? 'yellow' : 'green'}" style="width:${Math.min(100, pct)}%;border-radius:6px;"></div>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px;">
                    <span>Dépensé: ${Utils.formatCurrency(spent)}</span>
                    <span>${budgetVal > 0 ? `${pct.toFixed(0)}%` : 'Pas de budget'}</span>
                  </div>
                </div>
                <div style="text-align:right;">
                  ${isOver ? `<span class="badge badge-danger">Dépassé +${Utils.formatCurrency(spent - budgetVal)}</span>` : budgetVal > 0 ? `<span class="badge badge-success">Reste ${Utils.formatCurrency(budgetVal - spent)}</span>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Budget vs Réel</div></div>
        <div class="chart-container" style="height:350px;"><canvas id="chart-budget"></canvas></div>
      </div>
    `;
  },

  _loadBudgetCharts() {
    const budgets = this._getBudgets();
    const ops = this._thisMonthOps(this._getOperations()).filter(o => o.type === 'depense');
    const categories = ['carburant', 'maintenance', 'assurance', 'leasing', 'salaires', 'loyer_bureau'];
    const catLabels = { carburant: 'Carburant', maintenance: 'Maintenance', assurance: 'Assurance', leasing: 'Leasing', salaires: 'Salaires', loyer_bureau: 'Loyer' };

    const ctx = document.getElementById('chart-budget');
    if (ctx) {
      const budgetData = categories.map(c => { const b = budgets.find(x => x.categorie === c); return b ? b.montant : 0; });
      const reelData = categories.map(c => Math.round(ops.filter(o => o.categorie === c).reduce((s, o) => s + o.montant, 0)));
      const reelColors = categories.map((c, i) => {
        return budgetData[i] > 0 && reelData[i] > budgetData[i] ? '#ef4444' : '#22c55e';
      });
      this._charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: categories.map(c => catLabels[c]),
          datasets: [
            { label: 'Budget', data: budgetData, backgroundColor: 'rgba(59, 130, 246, 0.5)', hoverBackgroundColor: 'rgba(59, 130, 246, 0.8)', borderRadius: 4 },
            { label: 'Réel', data: reelData, backgroundColor: reelColors, hoverBackgroundColor: reelColors.map(c => c === '#ef4444' ? '#dc2626' : '#16a34a'), borderRadius: 4 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                title: (items) => items[0] ? items[0].label : '',
                label: (ctx) => {
                  const index = ctx.dataIndex;
                  const budget = budgetData[index];
                  const reel = reelData[index];
                  const ecart = reel - budget;
                  const pctRealisation = budget > 0 ? ((reel / budget) * 100).toFixed(1) : '-';
                  if (ctx.datasetIndex === 0) {
                    return `Budget: ${Utils.formatCurrency(budget)}`;
                  }
                  return [
                    `Réel: ${Utils.formatCurrency(reel)}`,
                    `Écart: ${ecart >= 0 ? '+' : ''}${Utils.formatCurrency(ecart)}`,
                    `Réalisation: ${pctRealisation}%`
                  ];
                }
              }
            }
          },
          scales: { y: { beginAtZero: true, ticks: { callback: v => Utils.formatCurrency(v) } } }
        }
      }));
    }

    // Save budget button
    document.getElementById('btn-save-budget').addEventListener('click', () => {
      const inputs = document.querySelectorAll('.budget-input');
      const newBudgets = [];
      inputs.forEach(inp => {
        const val = parseFloat(inp.value) || 0;
        if (val > 0) newBudgets.push({ categorie: inp.dataset.cat, montant: val });
      });
      Store.set('budgets', newBudgets);
      Toast.success('Budget sauvegardé');
    });
  },

  // ========================= CATEGORIES =========================

  _renderCategories() {
    const recCats = [
      { id: 'commissions_courses', label: 'Commissions courses', desc: 'Commissions reçues sur les courses des chauffeurs', icon: 'solar:transfer-horizontal-bold-duotone', color: '#22c55e' },
      { id: 'courses_directes', label: 'Courses directes', desc: 'Paiement direct de courses (app & téléphone)', icon: 'solar:wheel-bold-duotone', color: '#3b82f6' },
      { id: 'commission_yango', label: 'Commission Yango (3%)', desc: 'Commission de 3% reversee par Yango sur le CA de la flotte', icon: 'solar:hand-money-bold-duotone', color: '#FC4C02' },
      { id: 'frais_service', label: 'Frais de service', desc: 'Frais de service des plateformes (Yango, Bolt)', icon: 'solar:smartphone-bold-duotone', color: '#8b5cf6' },
      { id: 'location_vehicule', label: 'Location véhicule', desc: 'Location de véhicule à un tiers', icon: 'solar:wheel-bold-duotone', color: '#f59e0b' },
      { id: 'autres_recettes', label: 'Autres recettes', desc: 'Autres sources de revenus', icon: 'solar:add-circle-bold-duotone', color: '#22d3ee' }
    ];

    const depCats = [
      { id: 'carburant', label: 'Carburant', desc: 'Essence, gasoil, recharge électrique', icon: 'solar:gas-station-bold-duotone', color: '#ef4444' },
      { id: 'maintenance', label: 'Maintenance', desc: 'Révisions, réparations, pneus, freins', icon: 'solar:tuning-2-bold-duotone', color: '#f59e0b' },
      { id: 'assurance', label: 'Assurance', desc: 'Assurance véhicules, RC Pro', icon: 'solar:shield-bold-duotone', color: '#3b82f6' },
      { id: 'leasing', label: 'Leasing véhicules', desc: 'Mensualités de crédit-bail', icon: 'solar:document-bold-duotone', color: '#8b5cf6' },
      { id: 'salaires', label: 'Salaires', desc: 'Salaires des employés (hors chauffeurs)', icon: 'solar:users-group-rounded-bold-duotone', color: '#ec4899' },
      { id: 'loyer_bureau', label: 'Loyer / Bureau', desc: 'Loyer bureau, parking, entrepôt', icon: 'solar:buildings-bold-duotone', color: '#14b8a6' },
      { id: 'taxes_impots', label: 'Impôts / Taxes', desc: 'Patente, impôts, taxes diverses', icon: 'solar:bank-bold-duotone', color: '#6366f1' },
      { id: 'telecoms', label: 'Télécom', desc: 'Téléphone, internet, abonnements', icon: 'solar:phone-bold-duotone', color: '#f97316' },
      { id: 'marketing', label: 'Marketing', desc: 'Publicité, communication, branding', icon: 'solar:megaphone-bold-duotone', color: '#84cc16' },
      { id: 'fournitures', label: 'Fournitures', desc: 'Fournitures bureau, consommables', icon: 'solar:box-bold-duotone', color: '#a855f7' },
      { id: 'autres_depenses', label: 'Autres dépenses', desc: 'Autres dépenses non classées', icon: 'solar:menu-dots-bold', color: '#64748b' }
    ];

    return `
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid var(--volt-blue);">
        <div style="display:flex;align-items:center;gap:var(--space-md);">
          <iconify-icon icon="solar:info-circle-bold-duotone" style="font-size:24px;color:var(--volt-blue);"></iconify-icon>
          <p style="font-size:var(--font-size-sm);">Les catégories vous aident à classer vos opérations pour mieux comprendre d'où vient votre argent et où il va. Utilisez-les lors de chaque saisie.</p>
        </div>
      </div>

      <h3 style="margin-bottom:var(--space-md);color:var(--success);"><iconify-icon icon="solar:arrow-down-bold"></iconify-icon> Catégories d'encaissement</h3>
      <div class="grid-3" style="margin-bottom:var(--space-xl);">
        ${recCats.map(c => `
          <div class="card" style="border-left:4px solid ${c.color};">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:${c.color}20;color:${c.color};display:flex;align-items:center;justify-content:center;"><iconify-icon icon="${c.icon}"></iconify-icon></div>
              <div><div style="font-weight:600;font-size:var(--font-size-sm);">${c.label}</div><div style="font-size:var(--font-size-xs);color:var(--text-muted);">${c.desc}</div></div>
            </div>
          </div>
        `).join('')}
      </div>

      <h3 style="margin-bottom:var(--space-md);color:var(--danger);"><iconify-icon icon="solar:arrow-up-bold"></iconify-icon> Catégories de décaissement</h3>
      <div class="grid-3">
        ${depCats.map(c => `
          <div class="card" style="border-left:4px solid ${c.color};">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:${c.color}20;color:${c.color};display:flex;align-items:center;justify-content:center;"><iconify-icon icon="${c.icon}"></iconify-icon></div>
              <div><div style="font-weight:600;font-size:var(--font-size-sm);">${c.label}</div><div style="font-size:var(--font-size-xs);color:var(--text-muted);">${c.desc}</div></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // ========================= YANGO COMMISSION =========================

  _initYangoDatePickers() {
    const fromInput = document.getElementById('cy-date-from');
    const toInput = document.getElementById('cy-date-to');
    if (!fromInput || !toInput) return;

    // Default: 1st of current month → today
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    fromInput.value = monthStart;
    toInput.value = today;

    // Reload on date change
    fromInput.addEventListener('change', () => this._loadYangoCommission());
    toInput.addEventListener('change', () => this._loadYangoCommission());
  },

  async _loadYangoCommission() {
    const refreshBtn = document.getElementById('compta-yango-refresh');
    if (refreshBtn) { refreshBtn.classList.add('spinning'); refreshBtn.disabled = true; }

    try {
      // Fetch today's real commission once (without custom range)
      if (this._todayCommission === null) {
        const todayStats = await Store.getYangoStats(null, null);
        this._todayCommission = todayStats?.commissionPartenaire?.aujourd_hui || 0;
      }

      // Read selected dates for period
      const fromInput = document.getElementById('cy-date-from');
      const toInput = document.getElementById('cy-date-to');
      const fromDate = fromInput?.value;
      const toDate = toInput?.value;

      let dateRange = null;
      if (fromDate && toDate) {
        dateRange = {
          from: new Date(fromDate + 'T00:00:00').toISOString(),
          to: new Date(toDate + 'T23:59:59').toISOString()
        };
      }

      const stats = await Store.getYangoStats(null, dateRange);
      if (!stats || stats.error) {
        this._showYangoCommissionError();
        return;
      }

      this._yangoStats = stats;
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      const setLabel = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

      // Period commission from selected range
      const commPeriod = stats.commissionPartenaire?.mois || 0;

      setVal('cy-comm-mois', Utils.formatCurrency(commPeriod));
      setVal('cy-comm-jour', Utils.formatCurrency(this._todayCommission));

      // Update period label based on date range
      if (dateRange) {
        const from = new Date(fromDate);
        const to = new Date(toDate);
        const label = `${from.toLocaleDateString('fr-FR', {day:'2-digit',month:'short'})} - ${to.toLocaleDateString('fr-FR', {day:'2-digit',month:'short'})}`;
        setLabel('cy-comm-mois-label', `Commission ${label}`);
      } else {
        setLabel('cy-comm-mois-label', 'Commission du mois');
      }
    } catch (err) {
      console.error('Yango commission load error:', err);
      this._showYangoCommissionError();
    } finally {
      if (refreshBtn) { refreshBtn.classList.remove('spinning'); refreshBtn.disabled = false; }
    }
  },

  _showYangoCommissionError() {
    ['cy-comm-mois', 'cy-comm-jour'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '--';
    });
  },

  // ========================= CRUD OPERATIONS =========================

  _catLabel(cat) {
    const labels = {
      commissions_courses: 'Commissions courses', courses_directes: 'Courses directes',
      commission_yango: 'Commission Yango (3%)',
      location_vehicule: 'Location véhicule', frais_service: 'Frais de service',
      autres_recettes: 'Autres recettes', versement_chauffeur: 'Versement chauffeur',
      course_directe: 'Course directe', subvention: 'Subvention', autre_recette: 'Autre recette',
      carburant: 'Carburant', recharge_electrique: 'Recharge électrique', maintenance: 'Maintenance', assurance: 'Assurance',
      leasing: 'Leasing', salaires: 'Salaires', salaire: 'Salaires',
      loyer_bureau: 'Loyer / Bureau', loyer: 'Loyer / Bureau',
      telecoms: 'Télécom', telephone: 'Télécom',
      taxes_impots: 'Impôts / Taxes', impots: 'Impôts / Taxes',
      marketing: 'Marketing', fournitures: 'Fournitures',
      autres_depenses: 'Autres dépenses', divers: 'Divers'
    };
    return labels[cat] || cat;
  },

  _modeLabel(mode) {
    const labels = { especes: 'Espèces', virement: 'Virement', mobile_money: 'Mobile Money', cheque: 'Chèque', carte: 'Carte bancaire', non_specifie: 'Non spécifié' };
    return labels[mode] || mode;
  },

  /**
   * Generate sequential reference number
   * Format: PREFIX-YYYY-NNN (e.g. ENC-2025-001, DEC-2025-042, FAC-2025-015)
   */
  _generateReference(prefix, collection) {
    const year = new Date().getFullYear();
    const pattern = `${prefix}-${year}-`;
    const items = Store.get(collection) || [];

    // Find highest existing number for this prefix and year
    let maxNum = 0;
    items.forEach(item => {
      const ref = item.reference || item.numero || '';
      if (ref.startsWith(pattern)) {
        const num = parseInt(ref.slice(pattern.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    const nextNum = (maxNum + 1).toString().padStart(3, '0');
    return `${pattern}${nextNum}`;
  },

  _getCategoriesOptions() {
    const cats = [
      { group: 'Encaissements', items: [{ v: 'commissions_courses', l: 'Commissions courses' }, { v: 'commission_yango', l: 'Commission Yango (3%)' }, { v: 'courses_directes', l: 'Courses directes' }, { v: 'frais_service', l: 'Frais de service' }, { v: 'location_vehicule', l: 'Location véhicule' }, { v: 'autres_recettes', l: 'Autres recettes' }] },
      { group: 'Décaissements', items: [{ v: 'carburant', l: 'Carburant' }, { v: 'recharge_electrique', l: 'Recharge électrique' }, { v: 'maintenance', l: 'Maintenance' }, { v: 'assurance', l: 'Assurance' }, { v: 'leasing', l: 'Leasing' }, { v: 'salaires', l: 'Salaires' }, { v: 'loyer_bureau', l: 'Loyer / Bureau' }, { v: 'taxes_impots', l: 'Impôts / Taxes' }, { v: 'telecoms', l: 'Télécom' }, { v: 'marketing', l: 'Marketing' }, { v: 'fournitures', l: 'Fournitures' }, { v: 'autres_depenses', l: 'Autres dépenses' }] }
    ];
    return cats.map(g => `<optgroup label="${g.group}">${g.items.map(i => `<option value="${i.v}">${i.l}</option>`).join('')}</optgroup>`).join('');
  },

  _addOperation(type) {
    const isRecette = type === 'recette';
    const catOptions = isRecette
      ? [{ value: 'commissions_courses', label: 'Commissions courses' }, { value: 'commission_yango', label: 'Commission Yango (3%)' }, { value: 'courses_directes', label: 'Courses directes' }, { value: 'frais_service', label: 'Frais de service' }, { value: 'location_vehicule', label: 'Location véhicule' }, { value: 'autres_recettes', label: 'Autres recettes' }]
      : [{ value: 'carburant', label: 'Carburant' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'assurance', label: 'Assurance' }, { value: 'leasing', label: 'Leasing' }, { value: 'salaires', label: 'Salaires' }, { value: 'loyer_bureau', label: 'Loyer / Bureau' }, { value: 'taxes_impots', label: 'Impôts / Taxes' }, { value: 'telecoms', label: 'Télécom' }, { value: 'marketing', label: 'Marketing' }, { value: 'fournitures', label: 'Fournitures' }, { value: 'autres_depenses', label: 'Autres dépenses' }];

    // Auto-generate reference: ENC-YYYY-NNN or DEC-YYYY-NNN
    const refPrefix = isRecette ? 'ENC' : 'DEC';
    const autoRef = this._generateReference(refPrefix, 'comptabilite');

    const fields = [
      { type: 'row-start' },
      { name: 'date', label: 'Date', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
      { name: 'categorie', label: 'Catégorie', type: 'select', required: true, placeholder: 'Choisir...', options: catOptions },
      { type: 'row-end' },
      { name: 'description', label: 'Description', type: 'text', required: true, placeholder: isRecette ? 'Ex: Versement semaine 12 - Amadou' : 'Ex: Plein de carburant VEH-001' },
      { type: 'row-start' },
      { name: 'montant', label: 'Montant (FCFA)', type: 'number', min: 0, required: true, placeholder: 'Ex: 150000' },
      { name: 'modePaiement', label: 'Mode de paiement', type: 'select', options: [{ value: 'especes', label: 'Espèces' }, { value: 'mobile_money', label: 'Mobile Money' }, { value: 'virement', label: 'Virement bancaire' }, { value: 'cheque', label: 'Chèque' }, { value: 'carte', label: 'Carte bancaire' }] },
      { type: 'row-end' },
      { name: 'reference', label: 'Référence / N° pièce (auto)', type: 'text', default: autoRef, placeholder: autoRef },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'Informations complémentaires...' }
    ];

    const title = isRecette
      ? '<iconify-icon icon="solar:add-circle-bold-duotone" class="text-success"></iconify-icon> Nouvel encaissement'
      : '<iconify-icon icon="solar:minus-circle-bold-duotone" class="text-danger"></iconify-icon> Nouveau décaissement';

    Modal.form(title, FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);

      const op = {
        id: Utils.generateId('OP'),
        type,
        ...values,
        dateCreation: new Date().toISOString()
      };

      Store.add('comptabilite', op);
      Modal.close();
      Toast.success(isRecette ? 'Encaissement enregistré' : 'Décaissement enregistré');
      this._renderTab(this._currentTab);
    });
  },

  _editOperation(id) {
    const op = Store.findById('comptabilite', id);
    if (!op) return;
    const isRecette = op.type === 'recette';
    const catOptions = isRecette
      ? [{ value: 'commissions_courses', label: 'Commissions courses' }, { value: 'commission_yango', label: 'Commission Yango (3%)' }, { value: 'courses_directes', label: 'Courses directes' }, { value: 'frais_service', label: 'Frais de service' }, { value: 'location_vehicule', label: 'Location véhicule' }, { value: 'autres_recettes', label: 'Autres recettes' }]
      : [{ value: 'carburant', label: 'Carburant' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'assurance', label: 'Assurance' }, { value: 'leasing', label: 'Leasing' }, { value: 'salaires', label: 'Salaires' }, { value: 'loyer_bureau', label: 'Loyer / Bureau' }, { value: 'taxes_impots', label: 'Impôts / Taxes' }, { value: 'telecoms', label: 'Télécom' }, { value: 'marketing', label: 'Marketing' }, { value: 'fournitures', label: 'Fournitures' }, { value: 'autres_depenses', label: 'Autres dépenses' }];

    const fields = [
      { type: 'row-start' },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'categorie', label: 'Catégorie', type: 'select', required: true, options: catOptions },
      { type: 'row-end' },
      { name: 'description', label: 'Description', type: 'text', required: true },
      { type: 'row-start' },
      { name: 'montant', label: 'Montant (FCFA)', type: 'number', min: 0, required: true },
      { name: 'modePaiement', label: 'Mode de paiement', type: 'select', options: [{ value: 'especes', label: 'Espèces' }, { value: 'mobile_money', label: 'Mobile Money' }, { value: 'virement', label: 'Virement' }, { value: 'cheque', label: 'Chèque' }, { value: 'carte', label: 'Carte bancaire' }] },
      { type: 'row-end' },
      { name: 'reference', label: 'Référence', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ];

    Modal.form('<iconify-icon icon="solar:pen-bold-duotone" class="text-blue"></iconify-icon> Modifier opération', FormBuilder.build(fields, op), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      Store.update('comptabilite', id, FormBuilder.getValues(body));
      Modal.close();
      Toast.success('Opération modifiée');
      this._renderTab(this._currentTab);
    });
  },

  _deleteOperation(id) {
    Modal.confirm('Supprimer l\'opération', 'Êtes-vous sûr de vouloir supprimer cette opération comptable ?', () => {
      Store.delete('comptabilite', id);
      Toast.success('Opération supprimée');
      this._renderTab(this._currentTab);
    });
  },

  _addFacture() {
    // Auto-generate invoice number: FAC-YYYY-NNN
    const autoNumero = this._generateReference('FAC', 'factures');

    const fields = [
      { type: 'row-start' },
      { name: 'numero', label: 'N° Facture (auto)', type: 'text', required: true, default: autoNumero, placeholder: autoNumero },
      { name: 'date', label: 'Date', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'typeFacture', label: 'Type', type: 'select', required: true, options: [{ value: 'client', label: 'Facture client (à recevoir)' }, { value: 'fournisseur', label: 'Facture fournisseur (à payer)' }] },
      { name: 'tiers', label: 'Client / Fournisseur', type: 'text', required: true, placeholder: 'Nom du client ou fournisseur' },
      { type: 'row-end' },
      { name: 'description', label: 'Description', type: 'text', required: true },
      { type: 'row-start' },
      { name: 'montant', label: 'Montant (FCFA)', type: 'number', min: 0, required: true },
      { name: 'echeance', label: 'Date d\'échéance', type: 'date', required: true },
      { type: 'row-end' },
      { name: 'statut', label: 'Statut', type: 'select', options: [{ value: 'impayee', label: 'En attente' }, { value: 'payee', label: 'Payée' }, { value: 'en_retard', label: 'En retard' }] }
    ];

    Modal.form('<iconify-icon icon="solar:file-text-bold-duotone" class="text-blue"></iconify-icon> Nouvelle facture', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      Store.add('factures', { id: Utils.generateId('FAC'), ...values, dateCreation: new Date().toISOString() });
      Modal.close();
      Toast.success('Facture créée');
      this._renderTab('factures');
    });
  },

  _editFacture(id) {
    const f = Store.findById('factures', id);
    if (!f) return;
    const fields = [
      { type: 'row-start' },
      { name: 'numero', label: 'N° Facture', type: 'text', required: true },
      { name: 'tiers', label: 'Client / Fournisseur', type: 'text', required: true },
      { type: 'row-end' },
      { name: 'description', label: 'Description', type: 'text' },
      { type: 'row-start' },
      { name: 'montant', label: 'Montant (FCFA)', type: 'number', min: 0 },
      { name: 'statut', label: 'Statut', type: 'select', options: [{ value: 'impayee', label: 'En attente' }, { value: 'payee', label: 'Payée' }, { value: 'en_retard', label: 'En retard' }] },
      { type: 'row-end' }
    ];
    Modal.form('<iconify-icon icon="solar:pen-bold-duotone" class="text-blue"></iconify-icon> Modifier facture', FormBuilder.build(fields, f), () => {
      const body = document.getElementById('modal-body');
      Store.update('factures', id, FormBuilder.getValues(body));
      Modal.close();
      Toast.success('Facture modifiée');
      this._renderTab('factures');
    });
  },

  _markPaid(id) {
    Store.update('factures', id, { statut: 'payee' });
    Toast.success('Facture marquée comme payée');
    this._renderTab('factures');
  },

  _exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const ops = this._getOperations().sort((a, b) => b.date.localeCompare(a.date));
    const factures = this._getFactures();

    doc.setFontSize(18);
    doc.text('Rapport Comptable', 14, 22);
    doc.setFontSize(10);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);

    // Summary
    const recettes = ops.filter(o => o.type === 'recette').reduce((s, o) => s + o.montant, 0);
    const depenses = ops.filter(o => o.type === 'depense').reduce((s, o) => s + o.montant, 0);
    const resultat = recettes - depenses;
    doc.setFontSize(11);
    doc.text(`Total encaissements : ${Utils.formatCurrency(recettes)}`, 14, 40);
    doc.text(`Total décaissements : ${Utils.formatCurrency(depenses)}`, 14, 46);
    doc.text(`Résultat net : ${Utils.formatCurrency(resultat)}`, 14, 52);

    // Operations table
    doc.setFontSize(13);
    doc.text('Journal des opérations', 14, 64);

    const rows = ops.slice(0, 60).map(o => [
      Utils.formatDate(o.date),
      o.type === 'recette' ? 'Encaissement' : 'Décaissement',
      this._catLabel(o.categorie),
      o.description || '',
      `${o.type === 'recette' ? '+' : '-'}${Utils.formatCurrency(o.montant)}`,
      o.reference || ''
    ]);

    doc.autoTable({
      head: [['Date', 'Type', 'Catégorie', 'Description', 'Montant', 'Réf.']],
      body: rows,
      startY: 68,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    // Factures table if any
    if (factures.length > 0) {
      const lastY = doc.lastAutoTable.finalY + 12;
      doc.setFontSize(13);
      doc.text('Factures', 14, lastY);

      const fRows = factures.slice(0, 30).map(f => [
        f.numero || f.id,
        f.type === 'client' ? 'Client' : 'Fournisseur',
        Utils.formatDate(f.date),
        Utils.formatCurrency(f.montantTTC || f.montant || 0),
        f.statut
      ]);

      doc.autoTable({
        head: [['Numéro', 'Type', 'Date', 'Montant TTC', 'Statut']],
        body: fRows,
        startY: lastY + 4,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] }
      });
    }

    doc.save('comptabilite-volt.pdf');
    Toast.success('PDF exporté');
  },

  _exportCSV() {
    const ops = this._getOperations().sort((a, b) => b.date.localeCompare(a.date));

    let csv = 'Date,Type,Catégorie,Description,Montant,Référence,Mode paiement\n';
    ops.forEach(o => {
      const montant = o.type === 'recette' ? o.montant : -o.montant;
      csv += `"${Utils.formatDate(o.date)}","${o.type === 'recette' ? 'Encaissement' : 'Décaissement'}","${this._catLabel(o.categorie)}","${(o.description || '').replace(/"/g, '""')}","${montant}","${o.reference || ''}","${o.modePaiement || ''}"\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'comptabilite-volt.csv';
    a.click();
    URL.revokeObjectURL(url);
    Toast.success('CSV exporté');
  },

  // =================== ONGLET DÉPENSES VÉHICULES ===================

  _depTypeDefaults: [
    { value: 'carburant', label: 'Carburant' }, { value: 'peage', label: 'Péage' },
    { value: 'lavage', label: 'Lavage' }, { value: 'assurance', label: 'Assurance' },
    { value: 'reparation', label: 'Réparation' }, { value: 'stationnement', label: 'Stationnement' },
    { value: 'autre', label: 'Autre' }
  ],

  _getDepTypeOptions() {
    const custom = Store.get('depenseCategories') || [];
    return [...this._depTypeDefaults, ...custom];
  },

  _getDepTypeLabel(value) {
    const opt = this._getDepTypeOptions().find(t => t.value === value);
    return opt ? opt.label : value;
  },

  _addDepCategory() {
    const name = prompt('Nom de la nouvelle catégorie :');
    if (!name || !name.trim()) return null;
    const label = name.trim();
    const value = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
    // Check duplicate
    if (this._getDepTypeOptions().some(t => t.value === value)) {
      Toast.show('Cette catégorie existe déjà', 'error');
      return null;
    }
    const customs = Store.get('depenseCategories') || [];
    customs.push({ value, label });
    Store.set('depenseCategories', customs);
    Toast.show(`Catégorie "${label}" ajoutée`, 'success');
    return value;
  },

  _renderDepenses() {
    const depenses = Store.get('depenses') || [];
    const vehicules = Store.get('vehicules') || [];
    const now = new Date();
    const monthDep = depenses.filter(d => {
      const dt = new Date(d.date);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    });
    const totalMois = monthDep.reduce((s, d) => s + (d.montant || 0), 0);
    const typeTotals = {};
    monthDep.forEach(d => { typeTotals[d.typeDepense] = (typeTotals[d.typeDepense] || 0) + (d.montant || 0); });
    let topType = '-';
    Object.entries(typeTotals).forEach(([type, amount]) => {
      if (amount > (typeTotals[topType] || 0)) topType = type;
    });
    const vehiculesActifs = new Set(monthDep.map(d => d.vehiculeId));
    const moyVehicule = vehiculesActifs.size > 0 ? Math.round(totalMois / vehiculesActifs.size) : 0;

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h3 style="margin:0">Dépenses véhicules</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline" id="btn-export-dep"><iconify-icon icon="solar:file-download-bold"></iconify-icon> Exporter</button>
          <button class="btn btn-primary" id="btn-add-dep"><iconify-icon icon="solar:add-circle-bold"></iconify-icon> Ajouter</button>
        </div>
      </div>
      <div class="kpi-grid grid-4">
        <div class="kpi-card kpi-warning" id="kpi-dep-total" style="cursor:pointer" title="Voir le détail par catégorie">
          <div class="kpi-icon"><iconify-icon icon="solar:wallet-2-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(totalMois)}</div>
          <div class="kpi-label">Total ce mois</div>
        </div>
        <div class="kpi-card" id="kpi-dep-count" style="cursor:pointer" title="Voir la liste des dépenses">
          <div class="kpi-icon"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${monthDep.length}</div>
          <div class="kpi-label">Dépenses ce mois</div>
        </div>
        <div class="kpi-card kpi-danger" id="kpi-dep-top" style="cursor:pointer" title="Filtrer par cette catégorie" data-top-type="${topType}">
          <div class="kpi-icon"><iconify-icon icon="solar:tag-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${this._getDepTypeLabel(topType)}</div>
          <div class="kpi-label">Top catégorie</div>
        </div>
        <div class="kpi-card kpi-info" id="kpi-dep-avg" style="cursor:pointer" title="Voir le détail par véhicule">
          <div class="kpi-icon"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatCurrency(moyVehicule)}</div>
          <div class="kpi-label">Moy. / véhicule</div>
        </div>
      </div>
      <div class="filters-bar" style="margin-bottom:1rem">
        <select id="dep-filter-chauffeur" class="filter-select">
          <option value="">Tous les chauffeurs</option>
          ${(Store.get('chauffeurs') || []).map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
        </select>
        <select id="dep-filter-vehicule" class="filter-select">
          <option value="">Tous les véhicules</option>
          ${vehicules.map(v => `<option value="${v.id}">${v.marque} ${v.modele} - ${v.immatriculation || ''}</option>`).join('')}
        </select>
        <select id="dep-filter-type" class="filter-select">
          <option value="">Tous les types</option>
          ${this._getDepTypeOptions().map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
        <input type="date" id="dep-filter-from" class="filter-select">
        <input type="date" id="dep-filter-to" class="filter-select">
      </div>
      <div id="dep-table"></div>
    `;
  },

  _bindDepensesEvents() {
    const depenses = Store.get('depenses') || [];
    const vehicules = Store.get('vehicules') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const vehiculeMap = {};
    vehicules.forEach(v => vehiculeMap[v.id] = `${v.marque} ${v.modele}`);
    const chauffeurMap = {};
    chauffeurs.forEach(c => chauffeurMap[c.id] = `${c.prenom} ${c.nom}`);

    const renderTable = (items) => {
      Table.create({
        containerId: 'dep-table',
        data: items,
        columns: [
          { label: 'Date', key: 'date', render: (v) => Utils.formatDate(v.date) },
          { label: 'Chauffeur', key: 'chauffeurId', render: (v) => chauffeurMap[v.chauffeurId] || '-' },
          { label: 'Véhicule', key: 'vehiculeId', render: (v) => vehiculeMap[v.vehiculeId] || v.vehiculeId },
          { label: 'Type', key: 'typeDepense', render: (v) => this._getDepTypeLabel(v.typeDepense) },
          { label: 'Montant', key: 'montant', render: (v) => Utils.formatCurrency(v.montant || 0) },
          { label: 'Actions', key: 'actions', render: (v) => `
            <button class="btn-icon" title="Modifier" onclick="ComptabilitePage._editDep('${v.id}')"><iconify-icon icon="solar:pen-bold"></iconify-icon></button>
            <button class="btn-icon btn-danger" title="Supprimer" onclick="ComptabilitePage._deleteDep('${v.id}')"><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon></button>
          `}
        ],
        pageSize: 15,
        onRowClick: (id) => ComptabilitePage._editDep(id)
      });
    };

    renderTable(depenses);

    const applyFilters = () => {
      const chauffeur = document.getElementById('dep-filter-chauffeur').value;
      const vehicule = document.getElementById('dep-filter-vehicule').value;
      const type = document.getElementById('dep-filter-type').value;
      const from = document.getElementById('dep-filter-from').value;
      const to = document.getElementById('dep-filter-to').value;
      let filtered = depenses;
      if (chauffeur) filtered = filtered.filter(d => d.chauffeurId === chauffeur);
      if (vehicule) filtered = filtered.filter(d => d.vehiculeId === vehicule);
      if (type) filtered = filtered.filter(d => d.typeDepense === type);
      if (from) filtered = filtered.filter(d => d.date >= from);
      if (to) filtered = filtered.filter(d => d.date <= to);
      renderTable(filtered);
    };

    document.getElementById('dep-filter-chauffeur').addEventListener('change', applyFilters);
    document.getElementById('dep-filter-vehicule').addEventListener('change', applyFilters);
    document.getElementById('dep-filter-type').addEventListener('change', applyFilters);
    document.getElementById('dep-filter-from').addEventListener('change', applyFilters);
    document.getElementById('dep-filter-to').addEventListener('change', applyFilters);
    document.getElementById('btn-add-dep').addEventListener('click', () => this._addDep());
    document.getElementById('btn-export-dep').addEventListener('click', () => this._exportDep());

    // KPI click handlers
    const now = new Date();
    const monthDep = depenses.filter(d => {
      const dt = new Date(d.date);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    });

    // Total ce mois → détail par catégorie
    document.getElementById('kpi-dep-total').addEventListener('click', () => {
      const typeTotals = {};
      monthDep.forEach(d => { typeTotals[d.typeDepense] = (typeTotals[d.typeDepense] || 0) + (d.montant || 0); });
      const rows = Object.entries(typeTotals).sort((a, b) => b[1] - a[1])
        .map(([type, amount]) => `<tr><td>${this._getDepTypeLabel(type)}</td><td style="text-align:right;font-weight:600">${Utils.formatCurrency(amount)}</td></tr>`).join('');
      const total = monthDep.reduce((s, d) => s + (d.montant || 0), 0);
      Modal.open({
        title: '<iconify-icon icon="solar:wallet-2-bold-duotone" style="color:#f59e0b;"></iconify-icon> Détail des dépenses du mois',
        body: `<table class="table" style="width:100%"><thead><tr><th>Catégorie</th><th style="text-align:right">Montant</th></tr></thead><tbody>${rows}</tbody><tfoot><tr style="font-weight:700;border-top:2px solid var(--border-color)"><td>Total</td><td style="text-align:right">${Utils.formatCurrency(total)}</td></tr></tfoot></table>`,
        footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>'
      });
    });

    // Dépenses ce mois → liste détaillée
    document.getElementById('kpi-dep-count').addEventListener('click', () => {
      const rows = monthDep.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map(d => `<tr><td>${Utils.formatDate(d.date)}</td><td>${chauffeurMap[d.chauffeurId] || '-'}</td><td>${vehiculeMap[d.vehiculeId] || '-'}</td><td>${this._getDepTypeLabel(d.typeDepense)}</td><td style="text-align:right;font-weight:600">${Utils.formatCurrency(d.montant || 0)}</td></tr>`).join('');
      Modal.open({
        title: '<iconify-icon icon="solar:document-text-bold-duotone" style="color:#3b82f6;"></iconify-icon> Dépenses du mois',
        body: `<div style="max-height:400px;overflow-y:auto"><table class="table" style="width:100%"><thead><tr><th>Date</th><th>Chauffeur</th><th>Véhicule</th><th>Type</th><th style="text-align:right">Montant</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center">Aucune dépense</td></tr>'}</tbody></table></div>`,
        footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>',
        size: 'large'
      });
    });

    // Top catégorie → filtrer le tableau
    document.getElementById('kpi-dep-top').addEventListener('click', () => {
      const topType = document.getElementById('kpi-dep-top').dataset.topType;
      if (topType && topType !== '-') {
        const filterType = document.getElementById('dep-filter-type');
        filterType.value = topType;
        filterType.dispatchEvent(new Event('change'));
      }
    });

    // Moy. / véhicule → détail par véhicule
    document.getElementById('kpi-dep-avg').addEventListener('click', () => {
      const vehTotals = {};
      monthDep.forEach(d => { vehTotals[d.vehiculeId] = (vehTotals[d.vehiculeId] || 0) + (d.montant || 0); });
      const rows = Object.entries(vehTotals).sort((a, b) => b[1] - a[1])
        .map(([vid, amount]) => `<tr><td>${vehiculeMap[vid] || vid}</td><td style="text-align:right;font-weight:600">${Utils.formatCurrency(amount)}</td></tr>`).join('');
      Modal.open({
        title: '<iconify-icon icon="solar:wheel-bold-duotone" style="color:#3b82f6;"></iconify-icon> Dépenses par véhicule',
        body: `<table class="table" style="width:100%"><thead><tr><th>Véhicule</th><th style="text-align:right">Total du mois</th></tr></thead><tbody>${rows || '<tr><td colspan="2" style="text-align:center">Aucune donnée</td></tr>'}</tbody></table>`,
        footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>'
      });
    });
  },

  _addDep() {
    const vehicules = Store.get('vehicules') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    Modal.form(
      '<iconify-icon icon="solar:wallet-2-bold-duotone" style="color:#f59e0b;"></iconify-icon> Nouvelle dépense',
      `<form id="form-dep" class="modal-form">
        <div class="form-group"><label>Véhicule *</label>
          <select name="vehiculeId" required><option value="">Sélectionner...</option>
            ${vehicules.map(v => `<option value="${v.id}">${v.marque} ${v.modele} - ${v.immatriculation || ''}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Chauffeur</label>
          <select name="chauffeurId"><option value="">Aucun</option>
            ${chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Type de dépense *</label>
          <div style="display:flex;gap:6px;align-items:center">
            <select name="typeDepense" required style="flex:1">${this._getDepTypeOptions().map(t => `<option value="${t.value}">${t.label}</option>`).join('')}</select>
            <button type="button" id="btn-add-dep-cat" class="btn btn-outline" style="padding:6px 10px;min-width:auto;white-space:nowrap" title="Ajouter une catégorie">+</button>
          </div></div>
        <div class="form-group"><label>Montant (FCFA) *</label><input type="number" name="montant" required min="1" placeholder="0"></div>
        <div class="form-group"><label>Date *</label><input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>Kilométrage</label><input type="number" name="kilometrage" min="0" placeholder="km au compteur"></div>
        <div class="form-group"><label>Commentaire</label><textarea name="commentaire" rows="2" placeholder="Détails..."></textarea></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-dep'));
        if (!fd.get('vehiculeId') || !parseInt(fd.get('montant'))) { Toast.show('Véhicule et montant requis', 'error'); return; }
        Store.add('depenses', {
          id: 'DEP-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
          vehiculeId: fd.get('vehiculeId'), chauffeurId: fd.get('chauffeurId') || null,
          typeDepense: fd.get('typeDepense'),
          montant: parseInt(fd.get('montant')), date: fd.get('date'),
          kilometrage: fd.get('kilometrage') ? parseInt(fd.get('kilometrage')) : null,
          commentaire: fd.get('commentaire') || '', dateCreation: new Date().toISOString()
        });
        Modal.close(); Toast.show('Dépense ajoutée', 'success');
        this._renderTab('depenses');
      }
    );
    // Bind "+" button to add custom category
    const addCatBtn = document.getElementById('btn-add-dep-cat');
    if (addCatBtn) addCatBtn.addEventListener('click', () => {
      const newVal = this._addDepCategory();
      if (newVal) {
        const sel = document.querySelector('#form-dep [name="typeDepense"]');
        if (sel) {
          // Refresh options
          sel.innerHTML = this._getDepTypeOptions().map(t => `<option value="${t.value}">${t.label}</option>`).join('');
          sel.value = newVal;
        }
      }
    });
  },

  _editDep(id) {
    const d = (Store.get('depenses') || []).find(x => x.id === id);
    if (!d) return;
    const vehicules = Store.get('vehicules') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone" style="color:#3b82f6;"></iconify-icon> Modifier dépense',
      `<form id="form-dep-edit" class="modal-form">
        <div class="form-group"><label>Véhicule</label>
          <select name="vehiculeId">${vehicules.map(v => `<option value="${v.id}" ${v.id === d.vehiculeId ? 'selected' : ''}>${v.marque} ${v.modele} - ${v.immatriculation || ''}</option>`).join('')}</select></div>
        <div class="form-group"><label>Chauffeur</label>
          <select name="chauffeurId"><option value="">Aucun</option>
            ${chauffeurs.map(c => `<option value="${c.id}" ${c.id === d.chauffeurId ? 'selected' : ''}>${c.prenom} ${c.nom}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Type</label>
          <div style="display:flex;gap:6px;align-items:center">
            <select name="typeDepense" style="flex:1">${this._getDepTypeOptions().map(t => `<option value="${t.value}" ${t.value === d.typeDepense ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
            <button type="button" id="btn-edit-dep-cat" class="btn btn-outline" style="padding:6px 10px;min-width:auto;white-space:nowrap" title="Ajouter une catégorie">+</button>
          </div></div>
        <div class="form-group"><label>Montant (FCFA)</label><input type="number" name="montant" value="${d.montant || 0}" min="1"></div>
        <div class="form-group"><label>Date</label><input type="date" name="date" value="${d.date || ''}"></div>
        <div class="form-group"><label>Kilométrage</label><input type="number" name="kilometrage" value="${d.kilometrage || ''}" min="0"></div>
        <div class="form-group"><label>Commentaire</label><textarea name="commentaire" rows="2">${d.commentaire || ''}</textarea></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-dep-edit'));
        Store.update('depenses', id, {
          vehiculeId: fd.get('vehiculeId'), chauffeurId: fd.get('chauffeurId') || null,
          typeDepense: fd.get('typeDepense'),
          montant: parseInt(fd.get('montant')) || 0, date: fd.get('date'),
          kilometrage: fd.get('kilometrage') ? parseInt(fd.get('kilometrage')) : null,
          commentaire: fd.get('commentaire') || ''
        });
        Modal.close(); Toast.show('Dépense mise à jour', 'success');
        this._renderTab('depenses');
      }
    );
    // Bind "+" button to add custom category
    const addCatBtn = document.getElementById('btn-edit-dep-cat');
    if (addCatBtn) addCatBtn.addEventListener('click', () => {
      const newVal = this._addDepCategory();
      if (newVal) {
        const sel = document.querySelector('#form-dep-edit [name="typeDepense"]');
        if (sel) {
          sel.innerHTML = this._getDepTypeOptions().map(t => `<option value="${t.value}">${t.label}</option>`).join('');
          sel.value = newVal;
        }
      }
    });
  },

  _deleteDep(id) {
    if (!confirm('Supprimer cette dépense ?')) return;
    Store.delete('depenses', id);
    Toast.show('Dépense supprimée', 'success');
    this._renderTab('depenses');
  },

  _exportDep() {
    const depenses = Store.get('depenses') || [];
    if (!depenses.length) { Toast.show('Aucune dépense à exporter', 'error'); return; }
    const vehicules = Store.get('vehicules') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const vehiculeMap = {};
    vehicules.forEach(v => vehiculeMap[v.id] = `${v.marque} ${v.modele}`);
    const chauffeurMap = {};
    chauffeurs.forEach(c => chauffeurMap[c.id] = `${c.prenom} ${c.nom}`);
    const headers = ['Date', 'Chauffeur', 'Véhicule', 'Type', 'Montant (FCFA)', 'Kilométrage', 'Commentaire'];
    const rows = depenses.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(d => [
      d.date || '', chauffeurMap[d.chauffeurId] || '',
      vehiculeMap[d.vehiculeId] || d.vehiculeId,
      this._getDepTypeLabel(d.typeDepense), d.montant || 0,
      d.kilometrage || '', (d.commentaire || '').replace(/"/g, '""')
    ]);
    let csv = '\uFEFF' + headers.join(';') + '\n';
    rows.forEach(r => { csv += r.map(v => `"${v}"`).join(';') + '\n'; });
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
