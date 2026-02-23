/**
 * GpsConduitePage - GPS tracking, real-time map, and AI driving behavior analysis
 */
const GpsConduitePage = {
  _charts: [],
  _selectedDriver: null,
  _map: null,
  _markers: {},
  _mapPollInterval: null,
  _mapFitted: false,

  render() {
    const container = document.getElementById('page-content');
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    this._selectedDriver = chauffeurs[0]?.id || null;
    container.innerHTML = this._template(chauffeurs);
    this._bindEvents(chauffeurs);
    if (this._selectedDriver) {
      this._renderDriverAnalysis(this._selectedDriver);
    }
    // Init real-time map after DOM is rendered
    setTimeout(() => this._initMap(), 100);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
    // Cleanup map
    if (this._mapPollInterval) {
      clearInterval(this._mapPollInterval);
      this._mapPollInterval = null;
    }
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._markers = {};
    this._mapFitted = false;
  },

  _template(chauffeurs) {
    // Fleet overview
    const allGps = Store.get('gps');
    const today = new Date().toISOString().split('T')[0];
    const todayGps = allGps.filter(g => g.date === today);
    const avgScore = todayGps.length > 0
      ? Math.round(todayGps.reduce((s, g) => s + g.scoreGlobal, 0) / todayGps.length) : 0;
    const totalEvents = todayGps.reduce((s, g) =>
      s + g.evenements.freinagesBrusques + g.evenements.accelerationsBrusques + g.evenements.excesVitesse, 0);
    const totalKm = todayGps.reduce((s, g) => s + g.evenements.distanceParcourue, 0);

    return `
      <div class="page-header">
        <h1><i class="fas fa-satellite-dish"></i> GPS & Conduite</h1>
        <div class="page-actions">
          <div class="badge badge-success" style="padding:6px 12px;font-size:var(--font-size-sm);">
            <i class="fas fa-circle" style="font-size:8px;animation:pulse 2s infinite"></i> Suivi en temps réel
          </div>
        </div>
      </div>

      <!-- Real-time GPS Map -->
      <div class="card" style="margin-bottom:var(--space-lg);overflow:hidden;">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
          <span class="card-title"><i class="fas fa-map-location-dot text-blue"></i> Carte temps réel</span>
          <div style="display:flex;align-items:center;gap:var(--space-sm);">
            <span id="map-driver-count" class="badge badge-info" style="font-size:var(--font-size-xs);">0 en ligne</span>
            <span class="badge badge-success" style="font-size:10px;padding:3px 8px;">
              <i class="fas fa-circle" style="font-size:6px;animation:pulse 2s infinite"></i> Live 15s
            </span>
          </div>
        </div>
        <div id="gps-realtime-map" style="height:450px;border-radius:0 0 var(--radius-md) var(--radius-md);z-index:0;"></div>
      </div>

      <!-- Fleet KPIs -->
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card">
          <div class="kpi-icon"><i class="fas fa-shield-halved"></i></div>
          <div class="kpi-value">${avgScore}<span style="font-size:var(--font-size-sm);color:var(--text-muted)">/100</span></div>
          <div class="kpi-label">Score moyen flotte</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><i class="fas fa-users"></i></div>
          <div class="kpi-value">${chauffeurs.length}</div>
          <div class="kpi-label">Chauffeurs suivis</div>
        </div>
        <div class="kpi-card ${totalEvents > 20 ? 'red' : 'yellow'}">
          <div class="kpi-icon"><i class="fas fa-triangle-exclamation"></i></div>
          <div class="kpi-value">${totalEvents}</div>
          <div class="kpi-label">Incidents aujourd'hui</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><i class="fas fa-road"></i></div>
          <div class="kpi-value">${Utils.formatNumber(totalKm)}<span style="font-size:var(--font-size-sm);color:var(--text-muted)"> km</span></div>
          <div class="kpi-label">Distance parcourue</div>
        </div>
      </div>

      <!-- Driver selector + Fleet scores -->
      <div class="grid-3" style="margin-bottom:var(--space-lg);">
        ${chauffeurs.map(c => {
          const gps = allGps.filter(g => g.chauffeurId === c.id).sort((a, b) => b.date.localeCompare(a.date));
          const latest = gps[0];
          const score = latest ? latest.scoreGlobal : c.scoreConduite;
          const trend = gps.length >= 2 ? score - gps[1].scoreGlobal : 0;
          return `
            <div class="card driver-score-card ${this._selectedDriver === c.id ? 'selected' : ''}"
                 data-driver="${c.id}"
                 style="cursor:pointer;transition:all 0.2s;${this._selectedDriver === c.id ? 'border-color:var(--volt-blue);box-shadow:var(--shadow-glow);' : ''}">
              <div style="display:flex;align-items:center;gap:12px;">
                <div class="avatar" style="background:${Utils.getAvatarColor(c.id)}">${Utils.getInitials(c.prenom, c.nom)}</div>
                <div style="flex:1;">
                  <div style="font-weight:600;font-size:var(--font-size-sm);">${c.prenom} ${c.nom}</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">
                    ${latest ? `${latest.evenements.distanceParcourue} km aujourd'hui` : 'Pas de données'}
                  </div>
                </div>
                <div style="text-align:center;">
                  <div class="score-circle ${Utils.scoreClass(score)}" style="width:48px;height:48px;font-size:var(--font-size-base);">${score}</div>
                  <div style="font-size:10px;margin-top:4px;" class="${trend >= 0 ? 'text-success' : 'text-danger'}">
                    <i class="fas fa-arrow-${trend >= 0 ? 'up' : 'down'}"></i> ${Math.abs(trend)}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Driver analysis section -->
      <div id="driver-analysis"></div>

      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      </style>
    `;
  },

  _bindEvents(chauffeurs) {
    document.querySelectorAll('.driver-score-card').forEach(card => {
      card.addEventListener('click', () => {
        this._selectedDriver = card.dataset.driver;
        // Update selection styling
        document.querySelectorAll('.driver-score-card').forEach(c => {
          c.style.borderColor = '';
          c.style.boxShadow = '';
          c.classList.remove('selected');
        });
        card.style.borderColor = 'var(--volt-blue)';
        card.style.boxShadow = 'var(--shadow-glow)';
        card.classList.add('selected');
        this._renderDriverAnalysis(this._selectedDriver);
      });
    });
  },

  // =================== REAL-TIME MAP ===================

  _initMap() {
    const mapEl = document.getElementById('gps-realtime-map');
    if (!mapEl || typeof L === 'undefined') return;

    // Centrer sur Abidjan
    this._map = L.map('gps-realtime-map', {
      center: [5.345, -4.025],
      zoom: 12,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(this._map);

    // Premier chargement
    this._refreshMapPositions();

    // Polling toutes les 15 secondes
    this._mapPollInterval = setInterval(() => this._refreshMapPositions(), 15000);
  },

  async _refreshMapPositions() {
    if (!this._map) return;

    try {
      const token = localStorage.getItem('volt_token');
      const resp = await fetch('/api/gps/positions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) return;
      const positions = await resp.json();

      const countEl = document.getElementById('map-driver-count');
      if (countEl) {
        countEl.textContent = `${positions.length} en ligne`;
      }

      const now = Date.now();
      const activeIds = new Set();

      positions.forEach(pos => {
        activeIds.add(pos.chauffeurId);

        const updatedAt = pos.updatedAt ? new Date(pos.updatedAt).getTime() : 0;
        const ageMin = Math.round((now - updatedAt) / 60000);
        const isStale = ageMin > 5;

        const popupContent = `
          <div style="font-size:13px;min-width:160px;">
            <strong>${pos.prenom} ${pos.nom}</strong><br>
            ${pos.vehicule ? `<span style="color:#666;">${pos.vehicule}</span><br>` : ''}
            ${pos.speed != null ? `<i class="fas fa-gauge-high"></i> ${pos.speed} km/h<br>` : ''}
            <i class="fas fa-clock"></i> ${ageMin < 1 ? 'À l\'instant' : `Il y a ${ageMin} min`}
            ${isStale ? '<br><span style="color:#ef4444;font-weight:600;">⚠ Signal ancien</span>' : ''}
          </div>
        `;

        // Icône colorée selon fraîcheur
        const markerColor = isStale ? '#94a3b8' : '#3b82f6';
        const markerIcon = L.divIcon({
          className: 'gps-marker-icon',
          html: `
            <div style="
              background:${markerColor};
              width:32px;height:32px;border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              color:white;font-size:14px;font-weight:700;
              border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
              ${pos.heading != null ? `transform:rotate(${pos.heading}deg);` : ''}
            ">
              <i class="fas fa-${pos.heading != null ? 'location-arrow' : 'car'}" style="font-size:14px;"></i>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -20]
        });

        if (this._markers[pos.chauffeurId]) {
          // Mettre à jour le marker existant
          this._markers[pos.chauffeurId].setLatLng([pos.lat, pos.lng]);
          this._markers[pos.chauffeurId].setIcon(markerIcon);
          this._markers[pos.chauffeurId].getPopup().setContent(popupContent);
        } else {
          // Créer un nouveau marker
          this._markers[pos.chauffeurId] = L.marker([pos.lat, pos.lng], { icon: markerIcon })
            .addTo(this._map)
            .bindPopup(popupContent);
        }
      });

      // Supprimer les markers de chauffeurs déconnectés
      Object.keys(this._markers).forEach(id => {
        if (!activeIds.has(id)) {
          this._map.removeLayer(this._markers[id]);
          delete this._markers[id];
        }
      });

      // Ajuster la vue au premier chargement si on a des positions
      if (!this._mapFitted && positions.length > 0) {
        const bounds = L.latLngBounds(positions.map(p => [p.lat, p.lng]));
        this._map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        this._mapFitted = true;
      }
    } catch (err) {
      console.warn('[Map] Erreur refresh positions:', err);
    }
  },

  _renderDriverAnalysis(driverId) {
    // Destroy previous charts
    this._charts.forEach(c => c.destroy());
    this._charts = [];

    const chauffeur = Store.findById('chauffeurs', driverId);
    const gpsData = Store.query('gps', g => g.chauffeurId === driverId)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!chauffeur || gpsData.length === 0) {
      document.getElementById('driver-analysis').innerHTML = `
        <div class="empty-state"><i class="fas fa-satellite-dish"></i><h3>Aucune donnée GPS</h3></div>
      `;
      return;
    }

    const latest = gpsData[gpsData.length - 1];
    const last7 = gpsData.slice(-7);
    const last30 = gpsData.slice(-30);

    const avgEvents = {
      freinages: Math.round(last7.reduce((s, g) => s + g.evenements.freinagesBrusques, 0) / last7.length * 10) / 10,
      accelerations: Math.round(last7.reduce((s, g) => s + g.evenements.accelerationsBrusques, 0) / last7.length * 10) / 10,
      excesVitesse: Math.round(last7.reduce((s, g) => s + g.evenements.excesVitesse, 0) / last7.length * 10) / 10
    };

    const analysisContainer = document.getElementById('driver-analysis');
    analysisContainer.innerHTML = `
      <h2 style="margin-bottom:var(--space-lg);display:flex;align-items:center;gap:var(--space-sm);">
        <div class="avatar" style="background:${Utils.getAvatarColor(driverId)}">${Utils.getInitials(chauffeur.prenom, chauffeur.nom)}</div>
        Analyse - ${chauffeur.prenom} ${chauffeur.nom}
      </h2>

      <!-- AI Analysis Card -->
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid var(--volt-cyan);">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-robot text-blue"></i> Analyse IA du comportement routier</span>
          <span class="badge ${latest.analyseIA.tendance === 'amelioration' ? 'badge-success' : latest.analyseIA.tendance === 'stable' ? 'badge-info' : 'badge-danger'}">
            ${latest.analyseIA.tendance === 'amelioration' ? 'En amélioration' : latest.analyseIA.tendance === 'stable' ? 'Stable' : 'En dégradation'}
          </span>
        </div>
        <p style="font-size:var(--font-size-sm);margin-bottom:var(--space-md);">${latest.analyseIA.resume}</p>
        <div style="font-size:var(--font-size-sm);">
          <strong style="color:var(--text-primary);">Recommandations :</strong>
          <ul style="margin-top:var(--space-sm);display:flex;flex-direction:column;gap:6px;">
            ${latest.analyseIA.recommandations.map(r => `
              <li style="display:flex;align-items:flex-start;gap:8px;">
                <i class="fas fa-lightbulb text-yellow" style="margin-top:3px;"></i>
                <span>${r}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        <div style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border-color);display:flex;gap:var(--space-lg);font-size:var(--font-size-sm);">
          <div><span class="text-muted">Position flotte :</span> <strong>${latest.analyseIA.comparaisonFlotte === 'au_dessus' ? 'Au-dessus de la moyenne' : latest.analyseIA.comparaisonFlotte === 'dans_la_moyenne' ? 'Dans la moyenne' : 'En dessous de la moyenne'}</strong></div>
          <div><span class="text-muted">Moy. freinages/jour :</span> <strong>${avgEvents.freinages}</strong></div>
          <div><span class="text-muted">Moy. accélérations/jour :</span> <strong>${avgEvents.accelerations}</strong></div>
          <div><span class="text-muted">Moy. excès vitesse/jour :</span> <strong>${avgEvents.excesVitesse}</strong></div>
        </div>
      </div>

      <!-- Driving stats -->
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="card" style="text-align:center;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Vitesse</div>
          <div class="score-circle ${Utils.scoreClass(latest.scoreVitesse)}" style="margin:0 auto;width:56px;height:56px;font-size:var(--font-size-lg);">${latest.scoreVitesse}</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Freinage</div>
          <div class="score-circle ${Utils.scoreClass(latest.scoreFreinage)}" style="margin:0 auto;width:56px;height:56px;font-size:var(--font-size-lg);">${latest.scoreFreinage}</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Accélération</div>
          <div class="score-circle ${Utils.scoreClass(latest.scoreAcceleration)}" style="margin:0 auto;width:56px;height:56px;font-size:var(--font-size-lg);">${latest.scoreAcceleration}</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Virages</div>
          <div class="score-circle ${Utils.scoreClass(latest.scoreVirage)}" style="margin:0 auto;width:56px;height:56px;font-size:var(--font-size-lg);">${latest.scoreVirage}</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-line"></i> Évolution des scores (30 jours)</div>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="chart-gps-scores"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-bar"></i> Incidents journaliers</div>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="chart-gps-events"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-gauge"></i> Score global</div>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="chart-gps-gauge"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><i class="fas fa-chart-radar"></i> Profil de conduite</div>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="chart-gps-radar"></canvas>
          </div>
        </div>
      </div>

      <!-- Daily log table -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header"><span class="card-title">Journal des 7 derniers jours</span></div>
        <div id="gps-daily-table"></div>
      </div>
    `;

    this._loadAnalysisCharts(last30, latest);
  },

  _loadAnalysisCharts(data, latest) {
    // Score evolution (30 days)
    const scoresCtx = document.getElementById('chart-gps-scores');
    if (scoresCtx) {
      const scoresChart = new Chart(scoresCtx, {
        type: 'line',
        data: {
          labels: data.map(g => g.date.slice(5)),
          datasets: [
            { label: 'Global', data: data.map(g => g.scoreGlobal), borderColor: '#3b82f6', borderWidth: 2, pointRadius: 1, pointHoverRadius: 8, pointHoverBorderWidth: 3 },
            { label: 'Vitesse', data: data.map(g => g.scoreVitesse), borderColor: '#22c55e', borderWidth: 1.5, pointRadius: 0, borderDash: [3, 3], pointHoverRadius: 8, pointHoverBorderWidth: 3 },
            { label: 'Freinage', data: data.map(g => g.scoreFreinage), borderColor: '#ef4444', borderWidth: 1.5, pointRadius: 0, borderDash: [3, 3], pointHoverRadius: 8, pointHoverBorderWidth: 3 },
            { label: 'Accélération', data: data.map(g => g.scoreAcceleration), borderColor: '#facc15', borderWidth: 1.5, pointRadius: 0, borderDash: [3, 3], pointHoverRadius: 8, pointHoverBorderWidth: 3 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 10 } } },
            tooltip: {
              callbacks: {
                title: (items) => items.length ? `Date : ${items[0].label}` : '',
                afterBody: (items) => {
                  if (!items.length) return '';
                  const idx = items[0].dataIndex;
                  if (idx > 0) {
                    const variations = items.map(item => {
                      const prev = item.dataset.data[idx - 1];
                      const curr = item.parsed.y;
                      const diff = curr - prev;
                      return `${item.dataset.label} : ${diff >= 0 ? '+' : ''}${diff} pts`;
                    });
                    return '\nVariation :\n' + variations.join('\n');
                  }
                  return '';
                }
              }
            }
          },
          scales: { y: { min: 0, max: 100 } }
        }
      });
      this._charts.push(scoresChart);
    }

    // Daily events
    const last7 = data.slice(-7);
    const eventsCtx = document.getElementById('chart-gps-events');
    if (eventsCtx) {
      this._charts.push(new Chart(eventsCtx, {
        type: 'bar',
        data: {
          labels: last7.map(g => g.date.slice(5)),
          datasets: [
            { label: 'Freinages brusques', data: last7.map(g => g.evenements.freinagesBrusques), backgroundColor: '#ef4444', hoverBackgroundColor: '#dc2626' },
            { label: 'Accélérations', data: last7.map(g => g.evenements.accelerationsBrusques), backgroundColor: '#facc15', hoverBackgroundColor: '#eab308' },
            { label: 'Excès vitesse', data: last7.map(g => g.evenements.excesVitesse), backgroundColor: '#f97316', hoverBackgroundColor: '#ea580c' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 10 } } },
            tooltip: {
              callbacks: {
                title: (items) => items.length ? `Journée du ${items[0].label}` : '',
                label: (item) => {
                  const count = item.parsed.y;
                  const severite = count > 3 ? 'Élevée' : count > 1 ? 'Modérée' : 'Faible';
                  return `${item.dataset.label} : ${count} (sévérité : ${severite})`;
                },
                afterBody: (items) => {
                  const total = items.reduce((s, i) => s + i.parsed.y, 0);
                  return `\nTotal incidents : ${total}`;
                }
              }
            }
          },
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
        }
      }));
    }

    // Gauge (half doughnut)
    const gaugeCtx = document.getElementById('chart-gps-gauge');
    if (gaugeCtx) {
      const score = latest.scoreGlobal;
      const gaugeColor = score >= 85 ? '#22c55e' : score >= 70 ? '#3b82f6' : score >= 55 ? '#f59e0b' : '#ef4444';
      const gaugeQualif = score > 80 ? 'Excellent' : score > 65 ? 'Bon' : score > 50 ? 'Moyen' : 'Faible';
      this._charts.push(new Chart(gaugeCtx, {
        type: 'doughnut',
        data: {
          labels: ['Score', 'Restant'],
          datasets: [{
            data: [score, 100 - score],
            backgroundColor: [gaugeColor, 'rgba(30, 41, 59, 0.3)'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          rotation: -90,
          circumference: 180,
          cutout: '75%',
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              filter: (tooltipItem) => tooltipItem.dataIndex === 0,
              callbacks: {
                label: () => `Score global : ${score}/100`,
                afterLabel: () => `Qualification : ${gaugeQualif}`
              }
            }
          }
        },
        plugins: [{
          id: 'gaugeText',
          afterDraw(chart) {
            const { ctx, chartArea } = chart;
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2 + 20;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 36px Inter';
            ctx.fillStyle = gaugeColor;
            ctx.fillText(score, centerX, centerY);
            ctx.font = '14px Inter';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(Utils.scoreLabel(score), centerX, centerY + 30);
            ctx.restore();
          }
        }]
      }));
    }

    // Radar chart
    const radarCtx = document.getElementById('chart-gps-radar');
    if (radarCtx) {
      this._charts.push(new Chart(radarCtx, {
        type: 'radar',
        data: {
          labels: ['Vitesse', 'Freinage', 'Accélération', 'Virages', 'Régularité'],
          datasets: [{
            label: 'Score actuel',
            data: [latest.scoreVitesse, latest.scoreFreinage, latest.scoreAcceleration, latest.scoreVirage, latest.scoreRegularite],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            borderWidth: 2,
            pointBackgroundColor: '#3b82f6',
            pointHoverRadius: 8,
            pointHoverBorderWidth: 3
          }, {
            label: 'Moyenne flotte',
            data: [78, 75, 80, 82, 79],
            borderColor: '#94a3b8',
            backgroundColor: 'rgba(148, 163, 184, 0.05)',
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: (item) => {
                  const val = item.parsed.r;
                  const qualif = val > 80 ? 'Excellent' : val > 65 ? 'Bon' : val > 50 ? 'Moyen' : 'Faible';
                  return `${item.dataset.label} : ${val}/100 (${qualif})`;
                }
              }
            }
          },
          scales: {
            r: {
              beginAtZero: true, max: 100,
              ticks: { stepSize: 20, display: false },
              grid: { color: 'rgba(30, 41, 59, 0.5)' },
              angleLines: { color: 'rgba(30, 41, 59, 0.5)' },
              pointLabels: { color: '#94a3b8', font: { size: 11 } }
            }
          }
        }
      }));
    }

    // Daily log table
    Table.create({
      containerId: 'gps-daily-table',
      columns: [
        { label: 'Date', key: 'date', render: (g) => Utils.formatDate(g.date) },
        { label: 'Score', key: 'scoreGlobal', render: (g) => `<div class="score-circle ${Utils.scoreClass(g.scoreGlobal)}">${g.scoreGlobal}</div>` },
        { label: 'Distance', render: (g) => `${g.evenements.distanceParcourue} km`, value: (g) => g.evenements.distanceParcourue },
        { label: 'Durée', render: (g) => `${g.evenements.tempsConduite}h`, value: (g) => g.evenements.tempsConduite },
        { label: 'V. moy', render: (g) => `${g.evenements.vitesseMoyenne} km/h`, value: (g) => g.evenements.vitesseMoyenne },
        { label: 'V. max', render: (g) => `${g.evenements.vitesseMax} km/h`, value: (g) => g.evenements.vitesseMax },
        { label: 'Freinages', render: (g) => `<span class="${g.evenements.freinagesBrusques > 3 ? 'text-danger' : ''}">${g.evenements.freinagesBrusques}</span>`, value: (g) => g.evenements.freinagesBrusques },
        { label: 'Excès', render: (g) => `<span class="${g.evenements.excesVitesse > 1 ? 'text-danger' : ''}">${g.evenements.excesVitesse}</span>`, value: (g) => g.evenements.excesVitesse }
      ],
      data: data.slice(-7).reverse(),
      pageSize: 7
    });
  }
};
