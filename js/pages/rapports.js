/**
 * RapportsPage - Report generation with charts/graphs and CSV/PDF export
 */
const RapportsPage = {
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._renderCharts();
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _template() {
    const reports = [
      { id: 'bilan-mensuel', icon: 'fa-calendar-alt', color: 'var(--volt-blue)', title: 'Bilan mensuel', desc: "Synthese mensuelle du CA, des courses et des versements" },
      { id: 'fiche-chauffeur', icon: 'fa-id-card', color: 'var(--volt-cyan)', title: 'Fiche chauffeur', desc: 'Rapport individuel : courses, versements, score conduite' },
      { id: 'fiche-vehicule', icon: 'fa-car', color: 'var(--success)', title: 'Fiche vehicule', desc: 'Rapport couts et revenus par vehicule' },
      { id: 'etat-versements', icon: 'fa-money-bill-transfer', color: 'var(--warning)', title: 'Etat des versements', desc: 'Versements en attente, en retard ou partiels' },
      { id: 'analyse-rentabilite', icon: 'fa-chart-pie', color: 'var(--danger)', title: 'Analyse rentabilite', desc: 'Comparaison de rentabilite de la flotte' },
      { id: 'bilan-conduite', icon: 'fa-satellite-dish', color: 'var(--volt-yellow)', title: 'Bilan conduite', desc: "Scores et incidents de conduite de l'ensemble des chauffeurs" }
    ];

    return `
      <div class="page-header">
        <h1><i class="fas fa-file-export"></i> Rapports</h1>
      </div>

      <!-- Charts Section -->
      <div class="charts-grid" style="margin-bottom:var(--space-xl);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-bar" style="color:var(--volt-blue)"></i> CA mensuel (6 derniers mois)</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-rapport-ca-mensuel"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-pie" style="color:var(--danger)"></i> Repartition des couts flotte</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-rapport-couts"></canvas>
          </div>
        </div>
      </div>

      <div class="charts-grid" style="margin-bottom:var(--space-xl);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-line" style="color:var(--success)"></i> Courses par mois</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-rapport-courses"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-users" style="color:var(--volt-cyan)"></i> Performance chauffeurs (CA)</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-rapport-drivers"></canvas>
          </div>
        </div>
      </div>

      <div class="charts-grid" style="margin-bottom:var(--space-xl);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-money-bill-wave" style="color:var(--warning)"></i> Versements vs Commissions</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-rapport-versements"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-satellite-dish" style="color:var(--volt-yellow)"></i> Scores de conduite</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-rapport-conduite"></canvas>
          </div>
        </div>
      </div>

      <!-- Export Reports Cards -->
      <div class="card" style="margin-bottom:var(--space-lg);">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-download"></i> Exporter un rapport</span>
        </div>
      </div>

      <div class="grid-3" style="margin-bottom:var(--space-xl);">
        ${reports.map(r => `
          <div class="card" style="cursor:pointer;transition:all 0.2s;" data-report="${r.id}"
               onmouseover="this.style.borderColor='var(--border-accent)';this.style.transform='translateY(-2px)'"
               onmouseout="this.style.borderColor='';this.style.transform=''">
            <div style="display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-md);">
              <div style="width:44px;height:44px;border-radius:var(--radius-sm);background:${r.color}20;color:${r.color};display:flex;align-items:center;justify-content:center;font-size:var(--font-size-lg);">
                <i class="fas ${r.icon}"></i>
              </div>
              <div>
                <h3 style="font-size:var(--font-size-base);">${r.title}</h3>
                <p style="font-size:var(--font-size-xs);margin-top:2px;">${r.desc}</p>
              </div>
            </div>
            <div style="display:flex;gap:var(--space-sm);">
              <button class="btn btn-sm btn-primary" data-export="csv" data-report="${r.id}"><i class="fas fa-file-csv"></i> CSV</button>
              <button class="btn btn-sm btn-secondary" data-export="pdf" data-report="${r.id}"><i class="fas fa-file-pdf"></i> PDF</button>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Preview section -->
      <div class="card" style="margin-top:var(--space-md);">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-eye"></i> Apercu du rapport</span>
          <div style="display:flex;gap:var(--space-sm);">
            <select class="form-control" id="report-month" style="width:160px;">
              ${Array.from({ length: 6 }, (_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                return `<option value="${val}">${Utils.getMonthName(d.getMonth())} ${d.getFullYear()}</option>`;
              }).join('')}
            </select>
          </div>
        </div>
        <div id="report-preview" style="margin-top:var(--space-md);">
          <p class="text-muted text-center" style="padding:var(--space-xl);">Cliquez sur un rapport pour voir l'apercu</p>
        </div>
      </div>

      <!-- Data management -->
      <div class="card" style="margin-top:var(--space-xl);">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-database"></i> Gestion des donnees</span>
        </div>
        <div style="display:flex;gap:var(--space-md);align-items:center;flex-wrap:wrap;">
          <div style="flex:1;font-size:var(--font-size-sm);">
            <p>Taille des donnees : <strong>${Store.getStorageSize().kb} Ko</strong></p>
            <p class="text-muted" style="font-size:var(--font-size-xs);">Les donnees sont stockees localement dans votre navigateur</p>
          </div>
          <button class="btn btn-danger" id="btn-reset-data"><i class="fas fa-undo"></i> Reinitialiser les donnees</button>
        </div>
      </div>
    `;
  },

  // =================== CHARTS ===================

  _renderCharts() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];

    this._renderCAMensuelChart();
    this._renderCoutsChart();
    this._renderCoursesChart();
    this._renderDriversChart();
    this._renderVersementsChart();
    this._renderConduiteChart();
  },

  _renderCAMensuelChart() {
    const courses = Store.get('courses').filter(c => c.statut === 'terminee');
    const now = new Date();
    const months = [];
    const caData = [];
    const commissionData = [];

    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(Utils.getMonthShort(m.getMonth()));
      const monthCourses = courses.filter(c => {
        const d = new Date(c.dateHeure);
        return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
      });
      const ca = monthCourses.reduce((s, c) => s + c.montantTTC, 0);
      caData.push(Math.round(ca));

      const versements = Store.get('versements').filter(v => {
        const d = new Date(v.date);
        return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
      });
      const commission = versements.reduce((s, v) => s + v.commission, 0);
      commissionData.push(Math.round(commission));
    }

    const ctx = document.getElementById('chart-rapport-ca-mensuel');
    if (!ctx) return;

    this._charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: 'CA Courses',
            data: caData,
            backgroundColor: '#3b82f6',
            hoverBackgroundColor: '#60a5fa',
            borderRadius: 6
          },
          {
            label: 'Commissions',
            data: commissionData,
            backgroundColor: '#f59e0b',
            hoverBackgroundColor: '#fbbf24',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { padding: 12, font: { size: 11 }, usePointStyle: true, pointStyle: 'rectRounded' } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) }, grid: { color: 'rgba(148,163,184,0.1)' } },
          x: { grid: { display: false } }
        }
      }
    }));
  },

  _renderCoutsChart() {
    const vehicules = Store.get('vehicules');
    let totalMaintenance = 0;
    let totalAssurance = 0;
    let totalAcquisition = 0;
    let totalEnergie = 0;

    vehicules.forEach(v => {
      const isEV = v.typeEnergie === 'electrique';
      totalMaintenance += (v.coutsMaintenance || []).reduce((s, m) => s + m.montant, 0);
      totalAssurance += v.primeAnnuelle || 0;
      totalAcquisition += v.typeAcquisition === 'leasing' ? (v.mensualiteLeasing || 0) * 12 : (v.prixAchat || 0) / 5;
      const conso = v.consommation || (isEV ? 15 : 6.5);
      const coutE = v.coutEnergie || (isEV ? 120 : 800);
      totalEnergie += ((v.kilometrageMensuel || 2500) * 12 * conso / 100) * coutE;
    });

    const ctx = document.getElementById('chart-rapport-couts');
    if (!ctx) return;

    const data = [Math.round(totalAcquisition), Math.round(totalAssurance), Math.round(totalMaintenance), Math.round(totalEnergie)];
    const total = data.reduce((a, b) => a + b, 0);

    this._charts.push(new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Acquisition', 'Assurance', 'Maintenance', 'Energie'],
        datasets: [{
          data: data,
          backgroundColor: ['#3b82f6', '#facc15', '#ef4444', '#22c55e'],
          borderColor: 'transparent',
          borderWidth: 2,
          hoverOffset: 12
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${Utils.formatCurrency(ctx.raw)} (${pct}%)`;
              }
            }
          }
        }
      },
      plugins: [Utils.doughnutCenterPlugin(Utils.formatCurrency(total), 'Cout total')]
    }));
  },

  _renderCoursesChart() {
    const courses = Store.get('courses').filter(c => c.statut === 'terminee');
    const now = new Date();
    const months = [];
    const nbCourses = [];
    const kmTotal = [];

    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(Utils.getMonthShort(m.getMonth()));
      const monthCourses = courses.filter(c => {
        const d = new Date(c.dateHeure);
        return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
      });
      nbCourses.push(monthCourses.length);
      kmTotal.push(Math.round(monthCourses.reduce((s, c) => s + c.distanceKm, 0)));
    }

    const ctx = document.getElementById('chart-rapport-courses');
    if (!ctx) return;

    this._charts.push(new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Courses',
            data: nbCourses,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            borderWidth: 2,
            tension: 0.3,
            pointBackgroundColor: '#22c55e',
            pointHoverRadius: 7,
            yAxisID: 'y'
          },
          {
            label: 'Km parcourus',
            data: kmTotal,
            borderColor: '#06b6d4',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.3,
            pointBackgroundColor: '#06b6d4',
            pointHoverRadius: 7,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { padding: 12, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) return `Courses: ${ctx.raw}`;
                return `Distance: ${ctx.raw.toLocaleString('fr-FR')} km`;
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Courses' }, grid: { color: 'rgba(148,163,184,0.1)' } },
          y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'km' }, grid: { drawOnChartArea: false } },
          x: { grid: { display: false } }
        }
      }
    }));
  },

  _renderDriversChart() {
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    const courses = Store.get('courses').filter(c => c.statut === 'terminee');

    const driverData = chauffeurs.map(c => {
      const driverCourses = courses.filter(cr => cr.chauffeurId === c.id);
      return {
        nom: `${c.prenom.charAt(0)}. ${c.nom}`,
        ca: Math.round(driverCourses.reduce((s, cr) => s + cr.montantTTC, 0)),
        courses: driverCourses.length
      };
    }).sort((a, b) => b.ca - a.ca).slice(0, 8);

    const ctx = document.getElementById('chart-rapport-drivers');
    if (!ctx) return;

    this._charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: driverData.map(d => d.nom),
        datasets: [{
          label: 'CA',
          data: driverData.map(d => d.ca),
          backgroundColor: driverData.map((_, i) => {
            const colors = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
            return colors[i % colors.length];
          }),
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const d = driverData[ctx.dataIndex];
                return `CA: ${Utils.formatCurrency(d.ca)} (${d.courses} courses)`;
              }
            }
          }
        },
        scales: {
          x: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) }, grid: { color: 'rgba(148,163,184,0.1)' } },
          y: { grid: { display: false } }
        }
      }
    }));
  },

  _renderVersementsChart() {
    const versements = Store.get('versements');
    const now = new Date();
    const months = [];
    const verseData = [];
    const commissionData = [];

    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(Utils.getMonthShort(m.getMonth()));
      const monthVers = versements.filter(v => {
        const d = new Date(v.date);
        return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
      });
      verseData.push(Math.round(monthVers.reduce((s, v) => s + v.montantVerse, 0)));
      commissionData.push(Math.round(monthVers.reduce((s, v) => s + v.commission, 0)));
    }

    const ctx = document.getElementById('chart-rapport-versements');
    if (!ctx) return;

    this._charts.push(new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Commissions dues',
            data: commissionData,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            fill: true,
            borderWidth: 2,
            tension: 0.3,
            pointBackgroundColor: '#ef4444',
            pointHoverRadius: 7
          },
          {
            label: 'Montant verse',
            data: verseData,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.08)',
            fill: true,
            borderWidth: 2,
            tension: 0.3,
            pointBackgroundColor: '#22c55e',
            pointHoverRadius: 7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { padding: 12, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) }, grid: { color: 'rgba(148,163,184,0.1)' } },
          x: { grid: { display: false } }
        }
      }
    }));
  },

  _renderConduiteChart() {
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    const gps = Store.get('gps');

    const driverScores = chauffeurs.map(c => {
      const driverGps = gps.filter(g => g.chauffeurId === c.id).sort((a, b) => b.date.localeCompare(a.date));
      const latest = driverGps[0];
      return {
        nom: `${c.prenom.charAt(0)}. ${c.nom}`,
        score: latest ? latest.scoreGlobal : 0,
        vitesse: latest ? latest.scoreVitesse : 0,
        freinage: latest ? latest.scoreFreinage : 0
      };
    }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);

    const ctx = document.getElementById('chart-rapport-conduite');
    if (!ctx) return;

    this._charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: driverScores.map(d => d.nom),
        datasets: [
          {
            label: 'Score global',
            data: driverScores.map(d => d.score),
            backgroundColor: driverScores.map(d => d.score > 80 ? '#22c55e' : d.score > 65 ? '#f59e0b' : '#ef4444'),
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                const d = driverScores[ctx.dataIndex];
                return `Vitesse: ${d.vitesse}/100 | Freinage: ${d.freinage}/100`;
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { stepSize: 20 }, grid: { color: 'rgba(148,163,184,0.1)' } },
          x: { grid: { display: false } }
        }
      }
    }));
  },

  // =================== EVENTS ===================

  _bindEvents() {
    // Report export buttons
    document.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const reportId = btn.dataset.report;
        const format = btn.dataset.export;
        this._exportReport(reportId, format);
      });
    });

    // Report card click (preview)
    document.querySelectorAll('[data-report]').forEach(card => {
      if (card.tagName === 'DIV') {
        card.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          this._previewReport(card.dataset.report);
        });
      }
    });

    // Reset data
    document.getElementById('btn-reset-data').addEventListener('click', () => {
      Modal.confirm('Reinitialiser les donnees', 'Toutes les donnees seront supprimees et remplacees par les donnees de demonstration. Continuer ?', () => {
        Store.reset();
        Toast.success('Donnees reinitialisees');
        setTimeout(() => location.reload(), 500);
      });
    });
  },

  _getReportData(reportId) {
    const monthSelect = document.getElementById('report-month');
    const [year, month] = (monthSelect?.value || '').split('-').map(Number);

    switch (reportId) {
      case 'bilan-mensuel': return this._bilanMensuel(year, month);
      case 'fiche-chauffeur': return this._fichesChauffeurs();
      case 'fiche-vehicule': return this._fichesVehicules();
      case 'etat-versements': return this._etatVersements();
      case 'analyse-rentabilite': return this._analyseRentabilite();
      case 'bilan-conduite': return this._bilanConduite();
      default: return { title: '', headers: [], rows: [] };
    }
  },

  _exportReport(reportId, format) {
    const { title, headers, rows, subtitle } = this._getReportData(reportId);
    if (rows.length === 0) {
      Toast.warning('Aucune donnee a exporter');
      return;
    }

    if (format === 'csv') {
      Utils.exportCSV(headers, rows, `volt-${reportId}-${new Date().toISOString().split('T')[0]}.csv`);
      Toast.success(`Rapport "${title}" exporte en CSV`);
    } else {
      Utils.exportPDF(title, headers, rows, { subtitle });
      Toast.success(`Rapport "${title}" exporte en PDF`);
    }
  },

  _previewReport(reportId) {
    const { title, headers, rows } = this._getReportData(reportId);
    const preview = document.getElementById('report-preview');

    if (rows.length === 0) {
      preview.innerHTML = '<p class="text-muted text-center" style="padding:var(--space-lg);">Aucune donnee pour ce rapport</p>';
      return;
    }

    preview.innerHTML = `
      <h3 style="margin-bottom:var(--space-md);">${title}</h3>
      <div id="report-preview-table"></div>
    `;

    Table.create({
      containerId: 'report-preview-table',
      columns: headers.map((h, i) => ({
        label: h,
        render: (row) => row[i],
        value: (row) => row[i]
      })),
      data: rows.map((row, i) => ({ id: i, ...row })),
      pageSize: 15
    });
  },

  // Report generators
  _bilanMensuel(year, month) {
    const courses = Store.get('courses').filter(c => {
      const d = new Date(c.dateHeure);
      return d.getFullYear() === year && d.getMonth() + 1 === month && c.statut === 'terminee';
    });
    const versements = Store.get('versements').filter(v => {
      const d = new Date(v.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
    const chauffeurs = Store.get('chauffeurs');

    const byDriver = {};
    chauffeurs.forEach(c => { byDriver[c.id] = { nom: `${c.prenom} ${c.nom}`, courses: 0, ca: 0, verse: 0, commission: 0 }; });
    courses.forEach(c => {
      if (byDriver[c.chauffeurId]) {
        byDriver[c.chauffeurId].courses++;
        byDriver[c.chauffeurId].ca += c.montantTTC;
      }
    });
    versements.forEach(v => {
      if (byDriver[v.chauffeurId]) {
        byDriver[v.chauffeurId].verse += v.montantVerse;
        byDriver[v.chauffeurId].commission += v.commission;
      }
    });

    return {
      title: `Bilan mensuel - ${Utils.getMonthName(month - 1)} ${year}`,
      subtitle: `Periode : ${Utils.getMonthName(month - 1)} ${year}`,
      headers: ['Chauffeur', 'Courses', 'CA (FCFA)', 'Commission (FCFA)', 'Verse (FCFA)', 'Taux recouvrement'],
      rows: Object.values(byDriver).filter(d => d.courses > 0).map(d => [
        d.nom,
        d.courses,
        Math.round(d.ca).toLocaleString('fr-FR'),
        Math.round(d.commission).toLocaleString('fr-FR'),
        Math.round(d.verse).toLocaleString('fr-FR'),
        d.commission > 0 ? `${Math.round(d.verse / d.commission * 100)}%` : '-'
      ])
    };
  },

  _fichesChauffeurs() {
    const chauffeurs = Store.get('chauffeurs');
    const versements = Store.get('versements');
    const courses = Store.get('courses').filter(c => c.statut === 'terminee');

    return {
      title: 'Fiches chauffeurs',
      headers: ['Chauffeur', 'Statut', 'Debut contrat', 'Total courses', 'CA total (FCFA)', 'Total verse (FCFA)', 'Score conduite'],
      rows: chauffeurs.map(c => {
        const driverCourses = courses.filter(cr => cr.chauffeurId === c.id);
        const driverVers = versements.filter(v => v.chauffeurId === c.id);
        return [
          `${c.prenom} ${c.nom}`,
          c.statut,
          Utils.formatDate(c.dateDebutContrat),
          driverCourses.length,
          Math.round(driverCourses.reduce((s, cr) => s + cr.montantTTC, 0)).toLocaleString('fr-FR'),
          Math.round(driverVers.reduce((s, v) => s + v.montantVerse, 0)).toLocaleString('fr-FR'),
          c.scoreConduite
        ];
      })
    };
  },

  _fichesVehicules() {
    const vehicules = Store.get('vehicules');
    const courses = Store.get('courses').filter(c => c.statut === 'terminee');

    return {
      title: 'Fiches vehicules',
      headers: ['Vehicule', 'Immatriculation', 'Energie', 'Acquisition', 'Km', 'Maintenance (FCFA)', 'CA genere (FCFA)', 'Statut'],
      rows: vehicules.map(v => {
        const vCourses = courses.filter(c => c.vehiculeId === v.id);
        const maintenance = (v.coutsMaintenance || []).reduce((s, m) => s + m.montant, 0);
        const isEV = v.typeEnergie === 'electrique';
        return [
          `${v.marque} ${v.modele}`,
          v.immatriculation,
          isEV ? 'Electrique' : 'Thermique',
          v.typeAcquisition,
          Utils.formatNumber(v.kilometrage),
          Math.round(maintenance).toLocaleString('fr-FR'),
          Math.round(vCourses.reduce((s, c) => s + c.montantTTC, 0)).toLocaleString('fr-FR'),
          v.statut
        ];
      })
    };
  },

  _etatVersements() {
    const versements = Store.get('versements').filter(v => v.statut !== 'valide');
    const chauffeurs = Store.get('chauffeurs');

    return {
      title: 'Etat des versements impayes',
      headers: ['Chauffeur', 'Periode', 'Date', 'Commission (FCFA)', 'Verse (FCFA)', 'Reste du (FCFA)', 'Statut'],
      rows: versements.sort((a, b) => b.date.localeCompare(a.date)).map(v => {
        const c = chauffeurs.find(x => x.id === v.chauffeurId);
        return [
          c ? `${c.prenom} ${c.nom}` : v.chauffeurId,
          v.periode,
          Utils.formatDate(v.date),
          Math.round(v.commission).toLocaleString('fr-FR'),
          Math.round(v.montantVerse).toLocaleString('fr-FR'),
          Math.round(v.commission - v.montantVerse).toLocaleString('fr-FR'),
          v.statut
        ];
      })
    };
  },

  _analyseRentabilite() {
    const vehicules = Store.get('vehicules');
    const versements = Store.get('versements');
    const courses = Store.get('courses').filter(c => c.statut === 'terminee');
    const now = new Date();

    return {
      title: 'Analyse de rentabilite',
      headers: ['Vehicule', 'Energie', 'Type acq.', 'Prix achat (FCFA)', 'CA genere (FCFA)', 'Couts maint. (FCFA)', 'Assurance/an (FCFA)', 'Profit estime (FCFA)', 'ROI (%)'],
      rows: vehicules.map(v => {
        const vCourses = courses.filter(c => c.vehiculeId === v.id);
        const revenue = versements.filter(vs => vs.vehiculeId === v.id).reduce((s, vs) => s + vs.montantVerse, 0);
        const maintenance = (v.coutsMaintenance || []).reduce((s, m) => s + m.montant, 0);
        const months = Math.max(1, Math.round((now - new Date(v.dateCreation)) / (30 * 24 * 60 * 60 * 1000)));
        const isEV = v.typeEnergie === 'electrique';
        const defaultConsommation = isEV ? 15 : 6.5;
        const defaultCoutEnergie = isEV ? 120 : 800;
        const energyCost = (v.kilometrage * (v.consommation || defaultConsommation) / 100) * (v.coutEnergie || defaultCoutEnergie);
        const totalCost = (v.typeAcquisition === 'leasing' ? v.apportInitial + v.mensualiteLeasing * Math.min(months, v.dureeLeasing) : v.prixAchat) + maintenance + (v.primeAnnuelle / 12 * months) + energyCost;
        const profit = revenue - totalCost;
        const roi = totalCost > 0 ? (profit / totalCost * 100) : 0;

        return [
          `${v.marque} ${v.modele}`,
          isEV ? 'Electrique' : 'Thermique',
          v.typeAcquisition,
          v.prixAchat.toLocaleString('fr-FR'),
          Math.round(vCourses.reduce((s, c) => s + c.montantTTC, 0)).toLocaleString('fr-FR'),
          Math.round(maintenance).toLocaleString('fr-FR'),
          v.primeAnnuelle.toLocaleString('fr-FR'),
          Math.round(profit).toLocaleString('fr-FR'),
          roi.toFixed(1)
        ];
      })
    };
  },

  _bilanConduite() {
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    const gps = Store.get('gps');

    return {
      title: 'Bilan conduite - Tous chauffeurs',
      headers: ['Chauffeur', 'Score global', 'Vitesse', 'Freinage', 'Acceleration', 'Virages', 'Incidents/jour', 'Tendance'],
      rows: chauffeurs.map(c => {
        const driverGps = gps.filter(g => g.chauffeurId === c.id).sort((a, b) => b.date.localeCompare(a.date));
        const latest = driverGps[0];
        if (!latest) return [`${c.prenom} ${c.nom}`, '-', '-', '-', '-', '-', '-', '-'];

        const avgIncidents = driverGps.slice(0, 7).reduce((s, g) =>
          s + g.evenements.freinagesBrusques + g.evenements.accelerationsBrusques + g.evenements.excesVitesse, 0) / Math.min(7, driverGps.length);

        return [
          `${c.prenom} ${c.nom}`,
          latest.scoreGlobal,
          latest.scoreVitesse,
          latest.scoreFreinage,
          latest.scoreAcceleration,
          latest.scoreVirage,
          avgIncidents.toFixed(1),
          latest.analyseIA.tendance
        ];
      })
    };
  }
};
