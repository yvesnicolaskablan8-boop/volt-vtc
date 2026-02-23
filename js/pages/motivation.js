/**
 * MotivationPage — Dashboard Motivation & Engagement des chauffeurs
 */
const MotivationPage = {
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    container.innerHTML = this._template(data);
    this._bindEvents(data);
    this._loadCharts(data);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _getData() {
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    const allGps = Store.get('gps');
    const versements = Store.get('versements');
    const absences = Store.get('absences');
    const signalements = Store.get('signalements');
    const courses = Store.get('courses');
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    // ============ CLASSEMENT ============
    const ranking = chauffeurs.map(c => {
      // GPS data
      const gps = allGps.filter(g => g.chauffeurId === c.id).sort((a, b) => b.date.localeCompare(a.date));
      const last7Gps = gps.filter(g => {
        const d = new Date(g.date);
        return (now - d) < 7 * 86400000;
      });
      const last30Gps = gps.filter(g => {
        const d = new Date(g.date);
        return (now - d) < 30 * 86400000;
      });

      // Score conduite
      const scoreConduite = gps[0] ? gps[0].scoreGlobal : c.scoreConduite || 0;

      // Tendance score (7j vs precedent)
      const avg7 = last7Gps.length > 0 ? last7Gps.reduce((s, g) => s + g.scoreGlobal, 0) / last7Gps.length : scoreConduite;
      const prev7 = gps.filter(g => {
        const d = new Date(g.date);
        return (now - d) >= 7 * 86400000 && (now - d) < 14 * 86400000;
      });
      const avgPrev7 = prev7.length > 0 ? prev7.reduce((s, g) => s + g.scoreGlobal, 0) / prev7.length : avg7;
      const scoreTrend = Math.round(avg7 - avgPrev7);

      // Activite Yango (heures moyennes/jour sur 7j)
      const activiteMinutes7 = last7Gps.reduce((s, g) => s + (g.evenements?.tempsActiviteYango || 0), 0);
      const joursActivite7 = last7Gps.filter(g => (g.evenements?.tempsActiviteYango || 0) > 0).length;
      const activiteMoyH = joursActivite7 > 0 ? activiteMinutes7 / joursActivite7 / 60 : 0;

      // Distance ce mois
      const monthGps = allGps.filter(g => {
        const d = new Date(g.date);
        return g.chauffeurId === c.id && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      });
      const distanceMois = monthGps.reduce((s, g) => s + (g.evenements?.distanceParcourue || 0), 0);

      // Courses ce mois
      const coursesMois = courses.filter(co => {
        const d = new Date(co.dateHeure);
        return co.chauffeurId === c.id && d.getMonth() === thisMonth && d.getFullYear() === thisYear && co.statut === 'terminee';
      }).length;

      // Versements
      const chauffeurVers = versements.filter(v => v.chauffeurId === c.id);
      const monthVers = chauffeurVers.filter(v => {
        const d = new Date(v.date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      });
      const versementsRetard = chauffeurVers.filter(v => v.statut === 'retard').length;
      const versementsTotal = chauffeurVers.length;
      const tauxPonctualite = versementsTotal > 0 ? Math.round(((versementsTotal - versementsRetard) / versementsTotal) * 100) : 100;

      // Jours travailles ce mois
      const joursUniques = new Set(monthGps.map(g => g.date));
      const joursTravailles = joursUniques.size;

      // Score engagement composite
      const engagementScore = Math.round(
        scoreConduite * 0.3 +
        Math.min(100, activiteMoyH / 10 * 100) * 0.25 +
        tauxPonctualite * 0.25 +
        Math.min(100, joursTravailles / 26 * 100) * 0.2
      );

      return {
        id: c.id, prenom: c.prenom, nom: c.nom,
        scoreConduite, scoreTrend,
        activiteMoyH: Math.round(activiteMoyH * 10) / 10,
        distanceMois, coursesMois,
        tauxPonctualite, versementsRetard,
        joursTravailles,
        engagementScore,
        dateDebutContrat: c.dateDebutContrat
      };
    });

    // Trier par engagement score desc
    ranking.sort((a, b) => b.engagementScore - a.engagementScore);

    // ============ ALERTES DESENGAGEMENT ============
    const alertes = [];
    ranking.forEach(r => {
      // Score en chute
      if (r.scoreTrend <= -5) {
        alertes.push({ chauffeurId: r.id, prenom: r.prenom, nom: r.nom, type: 'score_baisse', severity: r.scoreTrend <= -10 ? 'critique' : 'haute', detail: `Score en baisse de ${Math.abs(r.scoreTrend)} pts sur 7j` });
      }
      // Faible activite
      if (r.activiteMoyH < 6 && r.activiteMoyH > 0) {
        alertes.push({ chauffeurId: r.id, prenom: r.prenom, nom: r.nom, type: 'faible_activite', severity: r.activiteMoyH < 4 ? 'critique' : 'haute', detail: `Seulement ${r.activiteMoyH}h/jour (objectif: 10h)` });
      }
      // Inactif (0 jours travailles cette semaine)
      const last7 = allGps.filter(g => g.chauffeurId === r.id && (now - new Date(g.date)) < 7 * 86400000);
      if (last7.length === 0) {
        alertes.push({ chauffeurId: r.id, prenom: r.prenom, nom: r.nom, type: 'inactif', severity: 'critique', detail: 'Aucune activite depuis 7 jours' });
      }
      // Retards versements
      if (r.versementsRetard >= 2) {
        alertes.push({ chauffeurId: r.id, prenom: r.prenom, nom: r.nom, type: 'retards_versements', severity: r.versementsRetard >= 3 ? 'critique' : 'haute', detail: `${r.versementsRetard} versement(s) en retard` });
      }
      // Score conduite faible
      if (r.scoreConduite < 50) {
        alertes.push({ chauffeurId: r.id, prenom: r.prenom, nom: r.nom, type: 'score_faible', severity: r.scoreConduite < 35 ? 'critique' : 'haute', detail: `Score conduite: ${r.scoreConduite}/100` });
      }
    });
    // Trier par severite
    const sevOrd = { critique: 0, haute: 1 };
    alertes.sort((a, b) => (sevOrd[a.severity] || 9) - (sevOrd[b.severity] || 9));

    // Signalements recents
    const recentSignalements = signalements
      .filter(s => (now - new Date(s.dateSignalement)) < 30 * 86400000)
      .sort((a, b) => new Date(b.dateSignalement) - new Date(a.dateSignalement));

    // ============ STATS GLOBALES ============
    const avgEngagement = ranking.length > 0 ? Math.round(ranking.reduce((s, r) => s + r.engagementScore, 0) / ranking.length) : 0;
    const avgScore = ranking.length > 0 ? Math.round(ranking.reduce((s, r) => s + r.scoreConduite, 0) / ranking.length) : 0;
    const avgActivite = ranking.length > 0 ? Math.round(ranking.reduce((s, r) => s + r.activiteMoyH, 0) / ranking.length * 10) / 10 : 0;
    const totalRetards = ranking.reduce((s, r) => s + r.versementsRetard, 0);
    const totalInactifs = ranking.filter(r => {
      const last7 = allGps.filter(g => g.chauffeurId === r.id && (now - new Date(g.date)) < 7 * 86400000);
      return last7.length === 0;
    }).length;

    // Absences ce mois
    const absencesMois = absences.filter(a => {
      const debut = new Date(a.dateDebut);
      const fin = new Date(a.dateFin);
      const debutMois = new Date(thisYear, thisMonth, 1);
      const finMois = new Date(thisYear, thisMonth + 1, 0);
      return debut <= finMois && fin >= debutMois;
    });

    // Distribution engagement
    const engagementDistrib = {
      excellent: ranking.filter(r => r.engagementScore >= 80).length,
      bon: ranking.filter(r => r.engagementScore >= 60 && r.engagementScore < 80).length,
      moyen: ranking.filter(r => r.engagementScore >= 40 && r.engagementScore < 60).length,
      faible: ranking.filter(r => r.engagementScore < 40).length
    };

    return {
      ranking, alertes, recentSignalements,
      avgEngagement, avgScore, avgActivite, totalRetards, totalInactifs,
      absencesMois, engagementDistrib,
      totalChauffeurs: ranking.length
    };
  },

  _template(d) {
    const alerteIcons = {
      score_baisse: 'fa-arrow-trend-down', faible_activite: 'fa-clock',
      inactif: 'fa-user-slash', retards_versements: 'fa-money-bill-wave',
      score_faible: 'fa-shield-halved'
    };
    const alerteColors = { critique: '#ef4444', haute: '#f59e0b' };

    return `
      <div class="page-header">
        <h1><i class="fas fa-fire"></i> Motivation &amp; Engagement</h1>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="MotivationPage.render()"><i class="fas fa-sync-alt"></i> Actualiser</button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card ${d.avgEngagement >= 70 ? 'green' : d.avgEngagement >= 50 ? 'yellow' : 'red'}">
          <div class="kpi-icon"><i class="fas fa-fire"></i></div>
          <div class="kpi-value">${d.avgEngagement}<span style="font-size:var(--font-size-sm);color:var(--text-muted)">/100</span></div>
          <div class="kpi-label">Score engagement moyen</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><i class="fas fa-clock"></i></div>
          <div class="kpi-value">${d.avgActivite}<span style="font-size:var(--font-size-sm);color:var(--text-muted)">h/j</span></div>
          <div class="kpi-label">Activit&eacute; moy. (7j)</div>
        </div>
        <div class="kpi-card ${d.totalInactifs > 0 ? 'red' : 'green'}">
          <div class="kpi-icon"><i class="fas fa-user-slash"></i></div>
          <div class="kpi-value">${d.totalInactifs}<span style="font-size:var(--font-size-sm);color:var(--text-muted)">/${d.totalChauffeurs}</span></div>
          <div class="kpi-label">Inactifs (&gt;7j)</div>
        </div>
        <div class="kpi-card ${d.totalRetards > 0 ? 'yellow' : 'green'}">
          <div class="kpi-icon"><i class="fas fa-money-bill-wave"></i></div>
          <div class="kpi-value">${d.totalRetards}</div>
          <div class="kpi-label">Versements en retard</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-grid" style="margin-bottom:var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-pie"></i> Distribution engagement</div>
          </div>
          <div class="chart-container" style="height:260px;">
            <canvas id="chart-engagement-distrib"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-bar"></i> Top 10 — Score engagement</div>
          </div>
          <div class="chart-container" style="height:260px;">
            <canvas id="chart-engagement-top"></canvas>
          </div>
        </div>
      </div>

      <!-- Alertes desengagement -->
      ${d.alertes.length > 0 ? `
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid ${d.alertes[0].severity === 'critique' ? '#ef4444' : '#f59e0b'};">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-triangle-exclamation" style="color:#ef4444;"></i> Alertes d&eacute;sengagement (${d.alertes.length})</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${d.alertes.slice(0, 8).map(a => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius-sm);background:var(--bg-tertiary);cursor:pointer;" onclick="Router.navigate('/chauffeurs/${a.chauffeurId}')">
              <i class="fas ${alerteIcons[a.type] || 'fa-exclamation'}" style="color:${alerteColors[a.severity]};font-size:0.85rem;width:20px;text-align:center;flex-shrink:0;"></i>
              <div style="flex:1;min-width:0;">
                <span style="font-size:var(--font-size-sm);font-weight:600;">${a.prenom} ${a.nom}</span>
                <span style="font-size:var(--font-size-xs);color:var(--text-muted);margin-left:6px;">${a.detail}</span>
              </div>
              <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${a.severity === 'critique' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'};color:${alerteColors[a.severity]};">${a.severity.toUpperCase()}</span>
            </div>
          `).join('')}
          ${d.alertes.length > 8 ? `<div style="text-align:center;font-size:var(--font-size-xs);color:var(--text-muted);padding:4px;">+ ${d.alertes.length - 8} autre(s)</div>` : ''}
        </div>
      </div>
      ` : `
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid #22c55e;">
        <div style="display:flex;align-items:center;gap:10px;padding:4px;">
          <i class="fas fa-check-circle" style="color:#22c55e;font-size:1.2rem;"></i>
          <span style="font-size:var(--font-size-sm);font-weight:600;color:#22c55e;">Aucune alerte — tous les chauffeurs sont engag&eacute;s !</span>
        </div>
      </div>
      `}

      <!-- Classement complet -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-ranking-star"></i> Classement des chauffeurs</span>
          <span style="font-size:var(--font-size-xs);color:var(--text-muted);">${d.totalChauffeurs} chauffeurs actifs</span>
        </div>
        <div id="ranking-table"></div>
      </div>
    `;
  },

  _bindEvents(d) {
    Table.create({
      containerId: 'ranking-table',
      columns: [
        {
          label: '#', key: 'rank',
          render: (r, i) => {
            const idx = d.ranking.indexOf(r) + 1;
            const medal = idx === 1 ? '<i class="fas fa-trophy" style="color:#facc15;"></i>' :
                          idx === 2 ? '<i class="fas fa-medal" style="color:#94a3b8;"></i>' :
                          idx === 3 ? '<i class="fas fa-medal" style="color:#cd7f32;"></i>' :
                          '<span style="color:var(--text-muted);">' + idx + '</span>';
            return medal;
          }
        },
        {
          label: 'Chauffeur', key: 'nom', primary: true,
          render: (r) => `
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="avatar" style="width:32px;height:32px;font-size:11px;background:${Utils.getAvatarColor(r.id)}">${Utils.getInitials(r.prenom, r.nom)}</div>
              <div>
                <div style="font-weight:600;font-size:var(--font-size-sm);">${r.prenom} ${r.nom}</div>
              </div>
            </div>
          `
        },
        {
          label: 'Engagement', key: 'engagementScore',
          render: (r) => `<div class="score-circle ${Utils.scoreClass(r.engagementScore)}" style="width:40px;height:40px;font-size:var(--font-size-sm);">${r.engagementScore}</div>`
        },
        {
          label: 'Conduite', key: 'scoreConduite',
          render: (r) => `
            <span style="font-weight:600;color:${r.scoreConduite >= 70 ? '#22c55e' : r.scoreConduite >= 50 ? '#f59e0b' : '#ef4444'};">${r.scoreConduite}</span>
            ${r.scoreTrend !== 0 ? `<span style="font-size:10px;color:${r.scoreTrend > 0 ? '#22c55e' : '#ef4444'};margin-left:4px;"><i class="fas fa-arrow-${r.scoreTrend > 0 ? 'up' : 'down'}"></i>${Math.abs(r.scoreTrend)}</span>` : ''}
          `
        },
        {
          label: 'Activite/j', key: 'activiteMoyH',
          render: (r) => {
            const color = r.activiteMoyH >= 10 ? '#22c55e' : r.activiteMoyH >= 6 ? '#f59e0b' : '#ef4444';
            return `<span style="font-weight:600;color:${color};">${r.activiteMoyH}h</span><span style="font-size:var(--font-size-xs);color:var(--text-muted);">/10h</span>`;
          }
        },
        {
          label: 'Jours trav.', key: 'joursTravailles',
          render: (r) => `<span style="font-weight:500;">${r.joursTravailles}</span><span style="font-size:var(--font-size-xs);color:var(--text-muted);">/26</span>`
        },
        {
          label: 'Ponctualite', key: 'tauxPonctualite',
          render: (r) => {
            const color = r.tauxPonctualite >= 90 ? '#22c55e' : r.tauxPonctualite >= 70 ? '#f59e0b' : '#ef4444';
            return `<span style="font-weight:600;color:${color};">${r.tauxPonctualite}%</span>` +
              (r.versementsRetard > 0 ? `<span style="font-size:10px;color:#ef4444;margin-left:4px;">(${r.versementsRetard} retard${r.versementsRetard > 1 ? 's' : ''})</span>` : '');
          }
        },
        {
          label: 'Courses', key: 'coursesMois',
          render: (r) => `<span style="font-weight:500;">${r.coursesMois}</span>`
        },
        {
          label: 'Distance', key: 'distanceMois',
          render: (r) => r.distanceMois > 0 ? `${Utils.formatNumber(r.distanceMois)} km` : '-',
          value: (r) => r.distanceMois
        }
      ],
      data: d.ranking,
      pageSize: 15,
      onRowClick: (id) => Router.navigate('/chauffeurs/' + id)
    });
  },

  _loadCharts(d) {
    this._charts = [];

    // Distribution engagement (doughnut)
    const distribCtx = document.getElementById('chart-engagement-distrib');
    if (distribCtx) {
      const dd = d.engagementDistrib;
      const total = d.totalChauffeurs;
      this._charts.push(new Chart(distribCtx, {
        type: 'doughnut',
        data: {
          labels: ['Excellent (80+)', 'Bon (60-79)', 'Moyen (40-59)', 'Faible (<40)'],
          datasets: [{
            data: [dd.excellent, dd.bon, dd.moyen, dd.faible],
            backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = total > 0 ? (ctx.raw / total * 100).toFixed(0) : 0;
                  return `${ctx.label}: ${ctx.raw} chauffeur${ctx.raw > 1 ? 's' : ''} (${pct}%)`;
                }
              }
            }
          }
        },
        plugins: [Utils.doughnutCenterPlugin(
          () => d.avgEngagement.toString(),
          'engagement'
        )]
      }));
    }

    // Top 10 engagement (horizontal bar)
    const topCtx = document.getElementById('chart-engagement-top');
    if (topCtx) {
      const top10 = d.ranking.slice(0, 10);
      this._charts.push(new Chart(topCtx, {
        type: 'bar',
        data: {
          labels: top10.map(r => `${r.prenom} ${r.nom.charAt(0)}.`),
          datasets: [{
            label: 'Engagement',
            data: top10.map(r => r.engagementScore),
            backgroundColor: top10.map(r =>
              r.engagementScore >= 80 ? '#22c55e' :
              r.engagementScore >= 60 ? '#3b82f6' :
              r.engagementScore >= 40 ? '#f59e0b' : '#ef4444'
            ),
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Score engagement: ${ctx.raw}/100`
              }
            }
          },
          scales: {
            x: { min: 0, max: 100, ticks: { stepSize: 20 } }
          }
        }
      }));
    }
  }
};
