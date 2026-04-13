/**
 * GpsConduitePage - GPS tracking, real-time map, AI driving behavior analysis,
 * and trip history (formerly CarteTrajetsPage)
 */
const GpsConduitePage = {
  _charts: [],
  _selectedDriver: null,
  _activeTab: 'realtime',
  // Real-time map state
  _map: null,
  _markers: {},
  _mapPollInterval: null,
  _mapFitted: false,
  // History map state
  _histMap: null,
  _histLayers: [],
  _histStartMarker: null,
  _histEndMarker: null,

  render() {
    const container = document.getElementById('page-content');
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    this._selectedDriver = chauffeurs[0]?.id || null;

    container.innerHTML = this._pageShell(chauffeurs);
    this._bindTabEvents();
    this._renderActiveTab(chauffeurs);
  },

  destroy() {
    this._destroyRealtimeTab();
    this._destroyHistoryTab();
  },

  _destroyRealtimeTab() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
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

  _destroyHistoryTab() {
    if (this._histMap) {
      this._histMap.remove();
      this._histMap = null;
    }
    this._histLayers = [];
    this._histStartMarker = null;
    this._histEndMarker = null;
  },

  // =================== PAGE SHELL WITH TABS ===================

  _pageShell(chauffeurs) {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:map-arrow-right-bold-duotone"></iconify-icon> GPS & Conduite</h1>
      </div>

      <!-- Tabs -->
      <div class="gps-tabs" style="display:flex;gap:0;margin-bottom:var(--space-lg);border-bottom:2px solid var(--border-color);overflow-x:auto;">
        <button class="gps-tab ${this._activeTab === 'realtime' ? 'active' : ''}" data-tab="realtime">
          <iconify-icon icon="solar:map-bold-duotone"></iconify-icon> Temps r\u00e9el
        </button>
        <button class="gps-tab ${this._activeTab === 'history' ? 'active' : ''}" data-tab="history">
          <iconify-icon icon="solar:map-point-wave-bold-duotone"></iconify-icon> Historique trajets
        </button>
      </div>

      <div id="gps-tab-content"></div>

      <style>
        .gps-tab { background:none;border:none;padding:10px 20px;cursor:pointer;font-size:var(--font-size-sm);font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;gap:6px;white-space:nowrap;font-family:inherit; }
        .gps-tab:hover { color:var(--text-primary);background:var(--bg-secondary);border-radius:var(--radius-md) var(--radius-md) 0 0; }
        .gps-tab.active { color:var(--pilote-blue);border-bottom-color:var(--pilote-blue); }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      </style>
    `;
  },

  _bindTabEvents() {
    document.querySelectorAll('.gps-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab === this._activeTab) return;
        // Cleanup current tab
        if (this._activeTab === 'realtime') this._destroyRealtimeTab();
        if (this._activeTab === 'history') this._destroyHistoryTab();

        this._activeTab = tab.dataset.tab;
        document.querySelectorAll('.gps-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
        this._renderActiveTab(chauffeurs);
      });
    });
  },

  _renderActiveTab(chauffeurs) {
    const content = document.getElementById('gps-tab-content');
    if (!content) return;

    if (this._activeTab === 'realtime') {
      content.innerHTML = this._realtimeTemplate(chauffeurs);
      this._bindRealtimeEvents(chauffeurs);
      if (this._selectedDriver) {
        this._renderDriverAnalysis(this._selectedDriver);
      }
      setTimeout(() => this._initMap(), 100);
    } else {
      content.innerHTML = this._historyTemplate(chauffeurs);
      setTimeout(() => this._initHistMap(), 100);
      this._bindHistoryEvents();
    }
  },

  // =================== REAL-TIME TAB ===================

  _realtimeTemplate(chauffeurs) {
    const allGps = Store.get('gps');
    const today = new Date().toISOString().split('T')[0];
    const todayGps = allGps.filter(g => g.date === today);
    const avgScore = todayGps.length > 0
      ? Math.round(todayGps.reduce((s, g) => s + g.scoreGlobal, 0) / todayGps.length) : 0;
    const totalEvents = todayGps.reduce((s, g) =>
      s + g.evenements.freinagesBrusques + g.evenements.accelerationsBrusques + g.evenements.excesVitesse, 0);
    const totalKm = todayGps.reduce((s, g) => s + g.evenements.distanceParcourue, 0);

    return `
      <div class="page-actions" style="margin-bottom:var(--space-lg);">
        <div class="badge badge-success" style="padding:6px 12px;font-size:var(--font-size-sm);">
          <iconify-icon icon="solar:record-circle-bold-duotone" style="font-size:8px;animation:pulse 2s infinite"></iconify-icon> Suivi en temps r\u00e9el
        </div>
      </div>

      <!-- Real-time GPS Map -->
      <div class="card" style="margin-bottom:var(--space-lg);overflow:hidden;">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
          <span class="card-title"><iconify-icon icon="solar:map-bold-duotone" class="text-blue"></iconify-icon> Carte temps r\u00e9el</span>
          <div style="display:flex;align-items:center;gap:var(--space-sm);">
            <span id="map-driver-count" class="badge badge-info" style="font-size:var(--font-size-xs);">0 en ligne</span>
            <span class="badge badge-success" style="font-size:10px;padding:3px 8px;">
              <iconify-icon icon="solar:record-circle-bold-duotone" style="font-size:6px;animation:pulse 2s infinite"></iconify-icon> Live 15s
            </span>
          </div>
        </div>
        <div id="gps-realtime-map" style="height:450px;border-radius:0 0 var(--radius-md) var(--radius-md);z-index:0;"></div>
      </div>

      <!-- Fleet KPIs -->
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:shield-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${avgScore}<span style="font-size:var(--font-size-sm);color:var(--text-muted)">/100</span></div>
          <div class="kpi-label">Score moyen flotte</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${chauffeurs.length}</div>
          <div class="kpi-label">Chauffeurs suivis</div>
        </div>
        <div class="kpi-card ${totalEvents > 20 ? 'red' : 'yellow'}">
          <div class="kpi-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${totalEvents}</div>
          <div class="kpi-label">Incidents aujourd'hui</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><iconify-icon icon="solar:route-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${Utils.formatNumber(totalKm)}<span style="font-size:var(--font-size-sm);color:var(--text-muted)"> km</span></div>
          <div class="kpi-label">Distance parcourue</div>
        </div>
      </div>

      <!-- Driver search filter -->
      <div style="margin-bottom:var(--space-md);position:relative;">
        <iconify-icon icon="solar:magnifer-bold-duotone" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:18px;color:var(--text-muted);pointer-events:none;"></iconify-icon>
        <input type="text" id="gps-driver-search" placeholder="Rechercher un chauffeur par nom..." style="width:100%;padding:12px 14px 12px 42px;border-radius:var(--radius-md);border:1px solid var(--border-color);font-size:var(--font-size-sm);font-family:inherit;background:var(--bg-secondary);color:var(--text-primary);outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='var(--pilote-blue)'" onblur="this.style.borderColor='var(--border-color)'">
      </div>

      <!-- Driver selector + Fleet scores -->
      <div id="gps-drivers-grid" class="grid-3" style="margin-bottom:var(--space-lg);">
        ${chauffeurs.map(c => {
          const gps = allGps.filter(g => g.chauffeurId === c.id).sort((a, b) => b.date.localeCompare(a.date));
          const latest = gps[0];
          const score = latest ? latest.scoreGlobal : c.scoreConduite;
          const trend = gps.length >= 2 ? score - gps[1].scoreGlobal : 0;
          return `
            <div class="card driver-score-card ${this._selectedDriver === c.id ? 'selected' : ''}"
                 data-driver="${c.id}"
                 style="cursor:pointer;transition:all 0.2s;${this._selectedDriver === c.id ? 'border-color:var(--pilote-blue);box-shadow:var(--shadow-glow);' : ''}">
              <div style="display:flex;align-items:center;gap:12px;">
                ${Utils.getAvatarHtml(c)}
                <div style="flex:1;">
                  <div style="font-weight:600;font-size:var(--font-size-sm);">${c.prenom} ${c.nom}</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">
                    ${latest ? `${latest.evenements.distanceParcourue} km aujourd'hui` : 'Pas de donn\u00e9es'}
                  </div>
                </div>
                <div style="text-align:center;">
                  <div class="score-circle ${Utils.scoreClass(score)}" style="width:48px;height:48px;font-size:var(--font-size-base);">${score}</div>
                  <div style="font-size:10px;margin-top:4px;" class="${trend >= 0 ? 'text-success' : 'text-danger'}">
                    <iconify-icon icon="solar:arrow-${trend >= 0 ? 'up' : 'down'}-bold"></iconify-icon> ${Math.abs(trend)}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Driver analysis section -->
      <div id="driver-analysis"></div>
    `;
  },

  _bindRealtimeEvents(chauffeurs) {
    document.querySelectorAll('.driver-score-card').forEach(card => {
      card.addEventListener('click', () => {
        this._selectedDriver = card.dataset.driver;
        document.querySelectorAll('.driver-score-card').forEach(c => {
          c.style.borderColor = '';
          c.style.boxShadow = '';
          c.classList.remove('selected');
        });
        card.style.borderColor = 'var(--pilote-blue)';
        card.style.boxShadow = 'var(--shadow-glow)';
        card.classList.add('selected');
        this._renderDriverAnalysis(this._selectedDriver);
      });
    });

    const searchInput = document.getElementById('gps-driver-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        document.querySelectorAll('.driver-score-card').forEach(card => {
          const driverId = card.dataset.driver;
          const ch = chauffeurs.find(c => c.id === driverId);
          if (!ch) return;
          const fullName = `${ch.prenom} ${ch.nom}`.toLowerCase();
          card.style.display = (!query || fullName.includes(query)) ? '' : 'none';
        });
      });
    }
  },

  // =================== REAL-TIME MAP ===================

  _initMap() {
    const mapEl = document.getElementById('gps-realtime-map');
    if (!mapEl || typeof L === 'undefined') return;

    this._map = L.map('gps-realtime-map', {
      center: [5.345, -4.025],
      zoom: 12,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(this._map);

    this._refreshMapPositions();
    this._mapPollInterval = setInterval(() => this._refreshMapPositions(), 15000);
  },

  async _refreshMapPositions() {
    if (!this._map) return;

    try {
      const chauffeurs = Store.getAll('chauffeurs').filter(c => c.statut === 'actif' && c.location && c.location.lat);
      const vehicules = Store.getAll('vehicules');
      const positions = chauffeurs.map(c => {
        const v = vehicules.find(v => v.id === c.vehiculeAssigne);
        return {
          chauffeurId: c.id,
          prenom: c.prenom,
          nom: c.nom,
          vehicule: v ? `${v.marque} ${v.modele} - ${v.immatriculation}` : '',
          lat: c.location.lat,
          lng: c.location.lng,
          speed: c.location.speed,
          heading: c.location.heading,
          updatedAt: c.location.updatedAt
        };
      });

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
            ${pos.speed != null ? `<iconify-icon icon="solar:spedometer-max-bold-duotone"></iconify-icon> ${pos.speed} km/h<br>` : ''}
            <iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> ${ageMin < 1 ? '\u00c0 l\'instant' : `Il y a ${ageMin} min`}
            ${isStale ? '<br><span style="color:#ef4444;font-weight:600;">\u26a0 Signal ancien</span>' : ''}
          </div>
        `;

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
              <iconify-icon icon="solar:${pos.heading != null ? 'map-arrow-right-bold-duotone' : 'wheel-bold-duotone'}" style="font-size:14px;"></iconify-icon>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -20]
        });

        if (this._markers[pos.chauffeurId]) {
          this._markers[pos.chauffeurId].setLatLng([pos.lat, pos.lng]);
          this._markers[pos.chauffeurId].setIcon(markerIcon);
          this._markers[pos.chauffeurId].getPopup().setContent(popupContent);
        } else {
          this._markers[pos.chauffeurId] = L.marker([pos.lat, pos.lng], { icon: markerIcon })
            .addTo(this._map)
            .bindPopup(popupContent);
        }
      });

      Object.keys(this._markers).forEach(id => {
        if (!activeIds.has(id)) {
          this._map.removeLayer(this._markers[id]);
          delete this._markers[id];
        }
      });

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
    this._charts.forEach(c => c.destroy());
    this._charts = [];

    const chauffeur = Store.findById('chauffeurs', driverId);
    const gpsData = Store.query('gps', g => g.chauffeurId === driverId)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!chauffeur || gpsData.length === 0) {
      document.getElementById('driver-analysis').innerHTML = `
        <div class="empty-state"><iconify-icon icon="solar:map-arrow-right-bold-duotone"></iconify-icon><h3>Aucune donn\u00e9e GPS</h3></div>
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
        ${Utils.getAvatarHtml(chauffeur)}
        Analyse - ${chauffeur.prenom} ${chauffeur.nom}
      </h2>

      <!-- AI Analysis Card -->
      <div class="card" style="margin-bottom:var(--space-lg);border-left:4px solid var(--pilote-cyan);">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:cpu-bolt-bold-duotone" class="text-blue"></iconify-icon> Analyse IA du comportement routier</span>
          <span class="badge ${latest.analyseIA.tendance === 'amelioration' ? 'badge-success' : latest.analyseIA.tendance === 'stable' ? 'badge-info' : 'badge-danger'}">
            ${latest.analyseIA.tendance === 'amelioration' ? 'En am\u00e9lioration' : latest.analyseIA.tendance === 'stable' ? 'Stable' : 'En d\u00e9gradation'}
          </span>
        </div>
        <p style="font-size:var(--font-size-sm);margin-bottom:var(--space-md);">${latest.analyseIA.resume}</p>
        <div style="font-size:var(--font-size-sm);">
          <strong style="color:var(--text-primary);">Recommandations :</strong>
          <ul style="margin-top:var(--space-sm);display:flex;flex-direction:column;gap:6px;">
            ${latest.analyseIA.recommandations.map(r => `
              <li style="display:flex;align-items:flex-start;gap:8px;">
                <iconify-icon icon="solar:lightbulb-bold-duotone" class="text-yellow" style="margin-top:3px;"></iconify-icon>
                <span>${r}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        <div style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border-color);display:flex;gap:var(--space-lg);font-size:var(--font-size-sm);">
          <div><span class="text-muted">Position flotte :</span> <strong>${latest.analyseIA.comparaisonFlotte === 'au_dessus' ? 'Au-dessus de la moyenne' : latest.analyseIA.comparaisonFlotte === 'dans_la_moyenne' ? 'Dans la moyenne' : 'En dessous de la moyenne'}</strong></div>
          <div><span class="text-muted">Moy. freinages/jour :</span> <strong>${avgEvents.freinages}</strong></div>
          <div><span class="text-muted">Moy. acc\u00e9l\u00e9rations/jour :</span> <strong>${avgEvents.accelerations}</strong></div>
          <div><span class="text-muted">Moy. exc\u00e8s vitesse/jour :</span> <strong>${avgEvents.excesVitesse}</strong></div>
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
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">Acc\u00e9l\u00e9ration</div>
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
            <div class="chart-title"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> \u00c9volution des scores (30 jours)</div>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="chart-gps-scores"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Incidents journaliers</div>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="chart-gps-events"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:spedometer-max-bold-duotone"></iconify-icon> Score global</div>
          </div>
          <div class="chart-container" style="height:300px;">
            <canvas id="chart-gps-gauge"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Profil de conduite</div>
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
            { label: 'Acc\u00e9l\u00e9ration', data: data.map(g => g.scoreAcceleration), borderColor: '#facc15', borderWidth: 1.5, pointRadius: 0, borderDash: [3, 3], pointHoverRadius: 8, pointHoverBorderWidth: 3 }
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

    const last7 = data.slice(-7);
    const eventsCtx = document.getElementById('chart-gps-events');
    if (eventsCtx) {
      this._charts.push(new Chart(eventsCtx, {
        type: 'bar',
        data: {
          labels: last7.map(g => g.date.slice(5)),
          datasets: [
            { label: 'Freinages brusques', data: last7.map(g => g.evenements.freinagesBrusques), backgroundColor: '#ef4444', hoverBackgroundColor: '#dc2626' },
            { label: 'Acc\u00e9l\u00e9rations', data: last7.map(g => g.evenements.accelerationsBrusques), backgroundColor: '#facc15', hoverBackgroundColor: '#eab308' },
            { label: 'Exc\u00e8s vitesse', data: last7.map(g => g.evenements.excesVitesse), backgroundColor: '#f97316', hoverBackgroundColor: '#ea580c' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 10 } } },
            tooltip: {
              callbacks: {
                title: (items) => items.length ? `Journ\u00e9e du ${items[0].label}` : '',
                label: (item) => {
                  const count = item.parsed.y;
                  const severite = count > 3 ? '\u00c9lev\u00e9e' : count > 1 ? 'Mod\u00e9r\u00e9e' : 'Faible';
                  return `${item.dataset.label} : ${count} (s\u00e9v\u00e9rit\u00e9 : ${severite})`;
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

    const radarCtx = document.getElementById('chart-gps-radar');
    if (radarCtx) {
      this._charts.push(new Chart(radarCtx, {
        type: 'radar',
        data: {
          labels: ['Vitesse', 'Freinage', 'Acc\u00e9l\u00e9ration', 'Virages', 'R\u00e9gularit\u00e9'],
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

    Table.create({
      containerId: 'gps-daily-table',
      columns: [
        { label: 'Date', key: 'date', render: (g) => Utils.formatDate(g.date) },
        { label: 'Score', key: 'scoreGlobal', render: (g) => `<div class="score-circle ${Utils.scoreClass(g.scoreGlobal)}">${g.scoreGlobal}</div>` },
        { label: 'Distance', render: (g) => `${g.evenements.distanceParcourue} km`, value: (g) => g.evenements.distanceParcourue },
        { label: 'Dur\u00e9e', render: (g) => `${g.evenements.tempsConduite}h`, value: (g) => g.evenements.tempsConduite },
        { label: 'V. moy', render: (g) => `${g.evenements.vitesseMoyenne} km/h`, value: (g) => g.evenements.vitesseMoyenne },
        { label: 'V. max', render: (g) => `${g.evenements.vitesseMax} km/h`, value: (g) => g.evenements.vitesseMax },
        { label: 'Freinages', render: (g) => `<span class="${g.evenements.freinagesBrusques > 3 ? 'text-danger' : ''}">${g.evenements.freinagesBrusques}</span>`, value: (g) => g.evenements.freinagesBrusques },
        { label: 'Exc\u00e8s', render: (g) => `<span class="${g.evenements.excesVitesse > 1 ? 'text-danger' : ''}">${g.evenements.excesVitesse}</span>`, value: (g) => g.evenements.excesVitesse }
      ],
      data: data.slice(-7).reverse(),
      pageSize: 7
    });
  },

  // =================== HISTORY TAB (ex CarteTrajetsPage) ===================

  _historyTemplate(chauffeurs) {
    const today = new Date().toISOString().split('T')[0];
    return `
      <!-- Filtres -->
      <div class="card" style="margin-bottom:var(--space-lg);">
        <div class="card-body" style="display:flex;flex-wrap:wrap;gap:var(--space-md);align-items:flex-end;">
          <div style="flex:1;min-width:200px;">
            <label class="form-label">Chauffeur</label>
            <select id="ct-chauffeur" class="form-control">
              <option value="">-- Choisir un chauffeur --</option>
              ${chauffeurs.map(c => '<option value="' + c.id + '">' + c.prenom + ' ' + c.nom + '</option>').join('')}
            </select>
          </div>
          <div style="min-width:180px;">
            <label class="form-label">Date</label>
            <input type="date" id="ct-date" class="form-control" value="${today}">
          </div>
          <div>
            <button id="ct-btn-load" class="btn btn-primary">
              <iconify-icon icon="solar:magnifer-bold-duotone"></iconify-icon> Afficher
            </button>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div id="ct-stats" class="grid-4" style="margin-bottom:var(--space-lg);display:none;">
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:route-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="ct-distance">--</div>
          <div class="kpi-label">Distance totale</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:speedometer-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="ct-vitesse-moy">--</div>
          <div class="kpi-label">Vitesse moyenne</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="ct-vitesse-max">--</div>
          <div class="kpi-label">Vitesse max</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value" id="ct-duree">--</div>
          <div class="kpi-label">Dur\u00e9e</div>
        </div>
      </div>

      <!-- Legende vitesse -->
      <div id="ct-legend" class="card" style="margin-bottom:var(--space-md);display:none;">
        <div class="card-body" style="display:flex;flex-wrap:wrap;gap:var(--space-lg);align-items:center;padding:var(--space-sm) var(--space-md);">
          <span style="font-weight:600;font-size:var(--font-size-sm);">L\u00e9gende vitesse :</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:var(--font-size-sm);"><span style="width:20px;height:4px;background:#22c55e;border-radius:2px;display:inline-block;"></span> &lt; 50 km/h</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:var(--font-size-sm);"><span style="width:20px;height:4px;background:#eab308;border-radius:2px;display:inline-block;"></span> 50-90 km/h</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:var(--font-size-sm);"><span style="width:20px;height:4px;background:#f97316;border-radius:2px;display:inline-block;"></span> 90-110 km/h</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:var(--font-size-sm);"><span style="width:20px;height:4px;background:#ef4444;border-radius:2px;display:inline-block;"></span> &gt; 110 km/h</span>
        </div>
      </div>

      <!-- Carte historique -->
      <div class="card" style="overflow:hidden;">
        <div id="gps-history-map" style="height:520px;z-index:0;"></div>
      </div>

      <!-- Liste des sessions -->
      <div id="ct-sessions" style="margin-top:var(--space-lg);display:none;"></div>
    `;
  },

  _initHistMap() {
    const mapEl = document.getElementById('gps-history-map');
    if (!mapEl || this._histMap || typeof L === 'undefined') return;

    this._histMap = L.map(mapEl).setView([5.3600, -4.0083], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '\u00a9 OpenStreetMap',
      maxZoom: 19
    }).addTo(this._histMap);
  },

  _bindHistoryEvents() {
    const btn = document.getElementById('ct-btn-load');
    if (btn) {
      btn.addEventListener('click', () => this._loadHistData());
    }
    const dateInput = document.getElementById('ct-date');
    if (dateInput) {
      dateInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._loadHistData();
      });
    }
  },

  _loadHistData() {
    const chauffeurId = document.getElementById('ct-chauffeur').value;
    const date = document.getElementById('ct-date').value;

    if (!chauffeurId) {
      Toast.warning('Veuillez choisir un chauffeur');
      return;
    }
    if (!date) {
      Toast.warning('Veuillez choisir une date');
      return;
    }

    const allRecords = Store.get('conduiteBrute') || [];
    const sessions = allRecords.filter(r => r.chauffeurId === chauffeurId && r.date === date);

    this._clearHistMap();

    if (sessions.length === 0) {
      Toast.info('Aucun trajet trouv\u00e9 pour cette date');
      document.getElementById('ct-stats').style.display = 'none';
      document.getElementById('ct-legend').style.display = 'none';
      document.getElementById('ct-sessions').style.display = 'none';
      return;
    }

    let allSamples = [];
    sessions.forEach(s => {
      if (s.gpsSamples && s.gpsSamples.length > 0) {
        allSamples = allSamples.concat(s.gpsSamples);
      }
    });

    allSamples.sort((a, b) => (a.heure || '').localeCompare(b.heure || ''));

    if (allSamples.length < 2) {
      Toast.info('Pas assez de points GPS pour tracer un trajet');
      document.getElementById('ct-stats').style.display = 'none';
      document.getElementById('ct-legend').style.display = 'none';
      return;
    }

    this._drawHistTrail(allSamples);
    this._showHistStats(allSamples, sessions);
    document.getElementById('ct-legend').style.display = '';
    this._showHistSessions(sessions);

    const bounds = L.latLngBounds(allSamples.map(s => [s.lat, s.lng]));
    this._histMap.fitBounds(bounds, { padding: [40, 40] });
  },

  _clearHistMap() {
    if (!this._histMap) return;
    this._histLayers.forEach(l => this._histMap.removeLayer(l));
    this._histLayers = [];
    if (this._histStartMarker) {
      this._histMap.removeLayer(this._histStartMarker);
      this._histStartMarker = null;
    }
    if (this._histEndMarker) {
      this._histMap.removeLayer(this._histEndMarker);
      this._histEndMarker = null;
    }
  },

  _histSpeedColor(speed) {
    if (speed < 50) return '#22c55e';
    if (speed < 90) return '#eab308';
    if (speed < 110) return '#f97316';
    return '#ef4444';
  },

  _drawHistTrail(samples) {
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      if (!a.lat || !a.lng || !b.lat || !b.lng) continue;

      const speed = a.speed || 0;
      const color = this._histSpeedColor(speed);

      const line = L.polyline(
        [[a.lat, a.lng], [b.lat, b.lng]],
        { color, weight: 4, opacity: 0.85 }
      ).addTo(this._histMap);

      line.bindPopup('<b>' + (a.heure || '--') + '</b><br>Vitesse: ' + Math.round(speed) + ' km/h');
      this._histLayers.push(line);
    }

    const first = samples[0];
    if (first.lat && first.lng) {
      this._histStartMarker = L.circleMarker([first.lat, first.lng], {
        radius: 10, color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1
      }).addTo(this._histMap).bindPopup('<b>D\u00e9part</b><br>' + (first.heure || '--'));
      this._histLayers.push(this._histStartMarker);
    }

    const last = samples[samples.length - 1];
    if (last.lat && last.lng) {
      this._histEndMarker = L.circleMarker([last.lat, last.lng], {
        radius: 10, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1
      }).addTo(this._histMap).bindPopup('<b>Arriv\u00e9e</b><br>' + (last.heure || '--'));
      this._histLayers.push(this._histEndMarker);
    }
  },

  _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  _showHistStats(samples, sessions) {
    let totalDist = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      if (a.lat && a.lng && b.lat && b.lng) {
        totalDist += this._haversine(a.lat, a.lng, b.lat, b.lng);
      }
    }

    const speeds = samples.filter(s => typeof s.speed === 'number' && s.speed > 0).map(s => s.speed);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

    let dureeStr = '--';
    const firstTime = samples[0]?.heure;
    const lastTime = samples[samples.length - 1]?.heure;
    if (firstTime && lastTime) {
      dureeStr = this._computeHistDuration(firstTime, lastTime);
    }

    document.getElementById('ct-distance').textContent = totalDist.toFixed(1) + ' km';
    document.getElementById('ct-vitesse-moy').textContent = Math.round(avgSpeed) + ' km/h';
    document.getElementById('ct-vitesse-max').textContent = Math.round(maxSpeed) + ' km/h';
    document.getElementById('ct-duree').textContent = dureeStr;
    document.getElementById('ct-stats').style.display = '';
  },

  _computeHistDuration(startHeure, endHeure) {
    const parseMin = (h) => {
      if (!h) return 0;
      if (h.includes('T')) {
        const d = new Date(h);
        return d.getHours() * 60 + d.getMinutes();
      }
      const parts = h.split(':');
      return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
    };
    const startMin = parseMin(startHeure);
    const endMin = parseMin(endHeure);
    let diff = endMin - startMin;
    if (diff < 0) diff += 24 * 60;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hours > 0) return hours + 'h ' + mins + 'min';
    return mins + ' min';
  },

  _showHistSessions(sessions) {
    const container = document.getElementById('ct-sessions');
    if (!container) return;

    const columns = [
      { key: 'sessionDebut', label: 'D\u00e9but', render: (v) => v || '--' },
      { key: 'sessionFin', label: 'Fin', render: (v) => v || '--' },
      { key: 'gpsSamples', label: 'Points GPS', render: (v) => (v && v.length) || 0 },
      { key: 'stats.distanceParcourue', label: 'Distance (km)', render: (v, row) => {
        const d = row.stats?.distanceParcourue;
        return d ? d.toFixed(1) : '--';
      }},
      { key: 'stats.vitesseMoyenne', label: 'Vit. moy.', render: (v, row) => {
        const s = row.stats?.vitesseMoyenne;
        return s ? Math.round(s) + ' km/h' : '--';
      }},
      { key: 'stats.vitesseMax', label: 'Vit. max', render: (v, row) => {
        const s = row.stats?.vitesseMax;
        return s ? Math.round(s) + ' km/h' : '--';
      }},
      { key: 'compteurs', label: '\u00c9v\u00e9nements', render: (v, row) => {
        const c = row.compteurs;
        if (!c) return '--';
        return (c.freinagesBrusques || 0) + (c.accelerationsBrusques || 0) +
               (c.viragesAgressifs || 0) + (c.excesVitesse || 0);
      }}
    ];

    container.innerHTML = '<div class="card">' +
      '<div class="card-header">' +
        '<span class="card-title"><iconify-icon icon="solar:list-bold-duotone" class="text-blue"></iconify-icon> Sessions du jour (' + sessions.length + ')</span>' +
      '</div>' +
      '<div class="card-body">' +
        Table.create({ columns, data: sessions, pageSize: 10 }) +
      '</div>' +
    '</div>';
    container.style.display = '';
  }
};
