/**
 * RapportsPage - Report generation and CSV/PDF export
 */
const RapportsPage = {
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _template() {
    const reports = [
      { id: 'bilan-mensuel', icon: 'fa-calendar-alt', color: 'var(--volt-blue)', title: 'Bilan mensuel', desc: "Synthèse mensuelle du CA, des courses et des versements" },
      { id: 'fiche-chauffeur', icon: 'fa-id-card', color: 'var(--volt-cyan)', title: 'Fiche chauffeur', desc: 'Rapport individuel : courses, versements, score conduite' },
      { id: 'fiche-vehicule', icon: 'fa-car', color: 'var(--success)', title: 'Fiche véhicule', desc: 'Rapport coûts et revenus par véhicule' },
      { id: 'etat-versements', icon: 'fa-money-bill-transfer', color: 'var(--warning)', title: 'État des versements', desc: 'Versements en attente, en retard ou partiels' },
      { id: 'analyse-rentabilite', icon: 'fa-chart-pie', color: 'var(--danger)', title: 'Analyse rentabilité', desc: 'Comparaison de rentabilité de la flotte' },
      { id: 'bilan-conduite', icon: 'fa-satellite-dish', color: 'var(--volt-yellow)', title: 'Bilan conduite', desc: "Scores et incidents de conduite de l'ensemble des chauffeurs" }
    ];

    return `
      <div class="page-header">
        <h1><i class="fas fa-file-export"></i> Rapports</h1>
      </div>

      <div class="grid-3">
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
      <div class="card" style="margin-top:var(--space-xl);">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-eye"></i> Aperçu du rapport</span>
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
          <p class="text-muted text-center" style="padding:var(--space-xl);">Cliquez sur un rapport pour voir l'aperçu</p>
        </div>
      </div>

      <!-- Data management -->
      <div class="card" style="margin-top:var(--space-xl);">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-database"></i> Gestion des données</span>
        </div>
        <div style="display:flex;gap:var(--space-md);align-items:center;flex-wrap:wrap;">
          <div style="flex:1;font-size:var(--font-size-sm);">
            <p>Taille des données : <strong>${Store.getStorageSize().kb} Ko</strong></p>
            <p class="text-muted" style="font-size:var(--font-size-xs);">Les données sont stockées localement dans votre navigateur</p>
          </div>
          <button class="btn btn-danger" id="btn-reset-data"><i class="fas fa-undo"></i> Réinitialiser les données</button>
        </div>
      </div>
    `;
  },

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
      Modal.confirm('Réinitialiser les données', 'Toutes les données seront supprimées et remplacées par les données de démonstration. Continuer ?', () => {
        Store.reset();
        Toast.success('Données réinitialisées');
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
      Toast.warning('Aucune donnée à exporter');
      return;
    }

    if (format === 'csv') {
      Utils.exportCSV(headers, rows, `volt-${reportId}-${new Date().toISOString().split('T')[0]}.csv`);
      Toast.success(`Rapport "${title}" exporté en CSV`);
    } else {
      Utils.exportPDF(title, headers, rows, { subtitle });
      Toast.success(`Rapport "${title}" exporté en PDF`);
    }
  },

  _previewReport(reportId) {
    const { title, headers, rows } = this._getReportData(reportId);
    const preview = document.getElementById('report-preview');

    if (rows.length === 0) {
      preview.innerHTML = '<p class="text-muted text-center" style="padding:var(--space-lg);">Aucune donnée pour ce rapport</p>';
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
      subtitle: `Période : ${Utils.getMonthName(month - 1)} ${year}`,
      headers: ['Chauffeur', 'Courses', 'CA (FCFA)', 'Commission (FCFA)', 'Versé (FCFA)', 'Taux recouvrement'],
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
      headers: ['Chauffeur', 'Statut', 'Début contrat', 'Total courses', 'CA total (FCFA)', 'Total versé (FCFA)', 'Score conduite'],
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
      title: 'Fiches véhicules',
      headers: ['Véhicule', 'Immatriculation', 'Énergie', 'Acquisition', 'Km', 'Maintenance (FCFA)', 'CA généré (FCFA)', 'Statut'],
      rows: vehicules.map(v => {
        const vCourses = courses.filter(c => c.vehiculeId === v.id);
        const maintenance = (v.coutsMaintenance || []).reduce((s, m) => s + m.montant, 0);
        const isEV = v.typeEnergie === 'electrique';
        return [
          `${v.marque} ${v.modele}`,
          v.immatriculation,
          isEV ? 'Électrique' : 'Thermique',
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
      title: 'État des versements impayés',
      headers: ['Chauffeur', 'Période', 'Date', 'Commission (FCFA)', 'Versé (FCFA)', 'Reste dû (FCFA)', 'Statut'],
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
      title: 'Analyse de rentabilité',
      headers: ['Véhicule', 'Énergie', 'Type acq.', 'Prix achat (FCFA)', 'CA généré (FCFA)', 'Coûts maint. (FCFA)', 'Assurance/an (FCFA)', 'Profit estimé (FCFA)', 'ROI (%)'],
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
          isEV ? 'Électrique' : 'Thermique',
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
      headers: ['Chauffeur', 'Score global', 'Vitesse', 'Freinage', 'Accélération', 'Virages', 'Incidents/jour', 'Tendance'],
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
