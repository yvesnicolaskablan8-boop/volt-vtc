/**
 * CarteTrajetsPage - Historique des trajets GPS sur carte Leaflet
 * Affiche le parcours d'un chauffeur pour une date donnee avec code couleur vitesse
 */
const CarteTrajetsPage = {
  _map: null,
  _layers: [],
  _startMarker: null,
  _endMarker: null,

  render() {
    const container = document.getElementById('page-content');
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    const today = new Date().toISOString().split('T')[0];

    container.innerHTML = this._template(chauffeurs, today);

    // Init map after DOM render
    setTimeout(() => this._initMap(), 100);
    this._bindEvents();
  },

  destroy() {
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._layers = [];
    this._startMarker = null;
    this._endMarker = null;
  },

  _template(chauffeurs, today) {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:map-point-wave-bold-duotone"></iconify-icon> Carte GPS</h1>
      </div>

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

      <!-- Carte -->
      <div class="card" style="overflow:hidden;">
        <div id="ct-map" style="height:520px;z-index:0;"></div>
      </div>

      <!-- Liste des sessions -->
      <div id="ct-sessions" style="margin-top:var(--space-lg);display:none;"></div>
    `;
  },

  async _initMap() {
    const mapEl = document.getElementById('ct-map');
    if (!mapEl || this._map) return;
    if (typeof L === 'undefined') await LazyLibs.leaflet();

    this._map = L.map(mapEl).setView([5.3600, -4.0083], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '\u00a9 OpenStreetMap',
      maxZoom: 19
    }).addTo(this._map);
  },

  _bindEvents() {
    const btn = document.getElementById('ct-btn-load');
    if (btn) {
      btn.addEventListener('click', () => this._loadData());
    }
    const dateInput = document.getElementById('ct-date');
    if (dateInput) {
      dateInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._loadData();
      });
    }
  },

  _loadData() {
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

    this._clearMap();

    if (sessions.length === 0) {
      Toast.info('Aucun trajet trouv\u00e9 pour cette date');
      document.getElementById('ct-stats').style.display = 'none';
      document.getElementById('ct-legend').style.display = 'none';
      document.getElementById('ct-sessions').style.display = 'none';
      return;
    }

    // Merge all GPS samples across sessions, sorted by time
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

    this._drawTrail(allSamples);
    this._showStats(allSamples, sessions);
    document.getElementById('ct-legend').style.display = '';
    this._showSessions(sessions);

    const bounds = L.latLngBounds(allSamples.map(s => [s.lat, s.lng]));
    this._map.fitBounds(bounds, { padding: [40, 40] });
  },

  _clearMap() {
    this._layers.forEach(l => this._map.removeLayer(l));
    this._layers = [];
    if (this._startMarker) {
      this._map.removeLayer(this._startMarker);
      this._startMarker = null;
    }
    if (this._endMarker) {
      this._map.removeLayer(this._endMarker);
      this._endMarker = null;
    }
  },

  _speedColor(speed) {
    if (speed < 50) return '#22c55e';
    if (speed < 90) return '#eab308';
    if (speed < 110) return '#f97316';
    return '#ef4444';
  },

  _drawTrail(samples) {
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      if (!a.lat || !a.lng || !b.lat || !b.lng) continue;

      const speed = a.speed || 0;
      const color = this._speedColor(speed);

      const line = L.polyline(
        [[a.lat, a.lng], [b.lat, b.lng]],
        { color, weight: 4, opacity: 0.85 }
      ).addTo(this._map);

      line.bindPopup('<b>' + (a.heure || '--') + '</b><br>Vitesse: ' + Math.round(speed) + ' km/h');
      this._layers.push(line);
    }

    // Start marker (green)
    const first = samples[0];
    if (first.lat && first.lng) {
      this._startMarker = L.circleMarker([first.lat, first.lng], {
        radius: 10, color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1
      }).addTo(this._map).bindPopup('<b>D\u00e9part</b><br>' + (first.heure || '--'));
      this._layers.push(this._startMarker);
    }

    // End marker (red)
    const last = samples[samples.length - 1];
    if (last.lat && last.lng) {
      this._endMarker = L.circleMarker([last.lat, last.lng], {
        radius: 10, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1
      }).addTo(this._map).bindPopup('<b>Arriv\u00e9e</b><br>' + (last.heure || '--'));
      this._layers.push(this._endMarker);
    }
  },

  /**
   * Haversine distance in km between two lat/lng points
   */
  _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  _showStats(samples, sessions) {
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
      dureeStr = this._computeDuration(firstTime, lastTime);
    }

    document.getElementById('ct-distance').textContent = totalDist.toFixed(1) + ' km';
    document.getElementById('ct-vitesse-moy').textContent = Math.round(avgSpeed) + ' km/h';
    document.getElementById('ct-vitesse-max').textContent = Math.round(maxSpeed) + ' km/h';
    document.getElementById('ct-duree').textContent = dureeStr;
    document.getElementById('ct-stats').style.display = '';
  },

  _computeDuration(startHeure, endHeure) {
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

  _showSessions(sessions) {
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
