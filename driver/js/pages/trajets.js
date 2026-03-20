/**
 * TrajetsPage — Historique des trajets sur carte Leaflet
 */
const TrajetsPage = {
  _map: null,
  _layers: [],

  async render(container) {
    container.innerHTML = '<div style="padding:8px 0"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card" style="height:80px"></div><div class="skeleton skeleton-card" style="height:60px"></div></div>';

    // Dates : derniers 7 jours
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const fromStr = weekAgo.toISOString().split('T')[0];
    const toStr = today.toISOString().split('T')[0];

    const trajets = await DriverStore.getTrajets(fromStr, toStr);

    container.innerHTML = `
      <!-- Selecteur de date -->
      <div style="display:flex;gap:10px;margin-bottom:1rem;align-items:center">
        <input type="date" id="trajets-date-from" value="${fromStr}"
          style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid var(--border-color);font-family:inherit;font-size:0.85rem;background:var(--bg-secondary);color:var(--text-primary)">
        <span style="color:var(--text-muted);font-size:0.85rem">a</span>
        <input type="date" id="trajets-date-to" value="${toStr}"
          style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid var(--border-color);font-family:inherit;font-size:0.85rem;background:var(--bg-secondary);color:var(--text-primary)">
        <button onclick="TrajetsPage._reload()" style="padding:10px 14px;border-radius:12px;border:none;background:#3b82f6;color:white;cursor:pointer;font-size:0.85rem">
          <i class="fas fa-search"></i>
        </button>
      </div>

      <!-- Carte -->
      <div id="trajets-map" style="height:350px;border-radius:1.25rem;overflow:hidden;margin-bottom:1.25rem;border:1px solid var(--border-color)"></div>

      <!-- Liste des trajets -->
      <div id="trajets-list"></div>
    `;

    // Initialiser la carte
    this._initMap();

    // Afficher les trajets
    this._renderTrajets(trajets);
  },

  _initMap() {
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    const mapEl = document.getElementById('trajets-map');
    if (!mapEl || typeof L === 'undefined') return;

    this._map = L.map(mapEl).setView([48.8566, 2.3522], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM',
      maxZoom: 19
    }).addTo(this._map);
  },

  _renderTrajets(trajets) {
    const listEl = document.getElementById('trajets-list');
    if (!listEl) return;

    if (!trajets || trajets.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="margin-top:1rem">
          <iconify-icon icon="solar:route-bold-duotone" style="font-size:3rem;color:#cbd5e1;display:block;margin-bottom:8px"></iconify-icon>
          <p>Aucun trajet sur cette periode</p>
        </div>`;
      return;
    }

    // Afficher la liste
    listEl.innerHTML = `
      <h3 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:1rem">
        ${trajets.length} trajet(s) trouve(s)
      </h3>
      ${trajets.map((t, i) => {
        const date = new Date(t.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        const scoreColor = (t.stats?.scoreGlobal || 0) >= 70 ? '#22c55e' : (t.stats?.scoreGlobal || 0) >= 50 ? '#f59e0b' : '#ef4444';
        const nbEvents = (t.evenements || []).length;
        return `
          <div onclick="TrajetsPage._showTrajet(${i})" style="display:flex;align-items:center;gap:14px;padding:1rem 1.25rem;border-radius:1.25rem;background:var(--bg-secondary);border:1px solid var(--border-color);margin-bottom:10px;cursor:pointer;transition:transform 0.15s" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
            <div style="width:44px;height:44px;border-radius:12px;background:rgba(59,130,246,0.08);color:#3b82f6;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <iconify-icon icon="solar:route-bold-duotone" style="font-size:1.3rem"></iconify-icon>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary)">${date}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">
                ${t.stats?.distanceKm ? t.stats.distanceKm.toFixed(1) + ' km' : '--'} &bull;
                ${t.stats?.dureeMinutes ? Math.round(t.stats.dureeMinutes) + ' min' : '--'} &bull;
                ${nbEvents} evt
              </div>
            </div>
            <div style="text-align:center;flex-shrink:0">
              <div style="font-size:1.25rem;font-weight:900;color:${scoreColor}">${t.stats?.scoreGlobal || '--'}</div>
              <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Score</div>
            </div>
          </div>`;
      }).join('')}
    `;

    // Stocker pour acces
    this._trajets = trajets;

    // Afficher le premier trajet sur la carte
    if (trajets.length > 0) {
      this._showTrajet(0);
    }
  },

  _showTrajet(index) {
    const trajet = this._trajets[index];
    if (!trajet || !this._map) return;

    // Clear layers
    this._layers.forEach(l => this._map.removeLayer(l));
    this._layers = [];

    const samples = trajet.gpsSamples || [];
    if (samples.length === 0) return;

    // Dessiner la polyline
    const coords = samples
      .filter(s => s.lat && s.lng)
      .map(s => [s.lat, s.lng]);

    if (coords.length < 2) return;

    const polyline = L.polyline(coords, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.8,
      smoothFactor: 1
    }).addTo(this._map);
    this._layers.push(polyline);

    // Marqueurs depart/arrivee
    const startMarker = L.circleMarker(coords[0], {
      radius: 8, fillColor: '#22c55e', fillOpacity: 1, color: 'white', weight: 2
    }).addTo(this._map).bindPopup('Depart');
    this._layers.push(startMarker);

    const endMarker = L.circleMarker(coords[coords.length - 1], {
      radius: 8, fillColor: '#ef4444', fillOpacity: 1, color: 'white', weight: 2
    }).addTo(this._map).bindPopup('Arrivee');
    this._layers.push(endMarker);

    // Marqueurs evenements
    const eventColors = {
      freinage: '#f97316',
      acceleration: '#3b82f6',
      virage: '#8b5cf6',
      vitesse: '#ef4444'
    };
    const eventIcons = {
      freinage: 'Freinage',
      acceleration: 'Acceleration',
      virage: 'Virage brusque',
      vitesse: 'Exces de vitesse'
    };

    (trajet.evenements || []).forEach(evt => {
      if (!evt.lat || !evt.lng) return;
      const color = eventColors[evt.type] || '#64748b';
      const marker = L.circleMarker([evt.lat, evt.lng], {
        radius: 6, fillColor: color, fillOpacity: 0.9, color: 'white', weight: 2
      }).addTo(this._map).bindPopup(`
        <strong>${eventIcons[evt.type] || evt.type}</strong><br>
        Intensite: ${evt.intensite ? evt.intensite.toFixed(1) : '--'}
      `);
      this._layers.push(marker);
    });

    // Zoom to fit
    this._map.fitBounds(polyline.getBounds(), { padding: [30, 30] });

    // Highlight la card selectionnee
    const listEl = document.getElementById('trajets-list');
    if (listEl) {
      listEl.querySelectorAll('[onclick^="TrajetsPage._showTrajet"]').forEach((el, i) => {
        el.style.borderColor = i === index ? '#3b82f6' : 'var(--border-color)';
        el.style.boxShadow = i === index ? '0 0 0 2px rgba(59,130,246,0.2)' : 'none';
      });
    }
  },

  async _reload() {
    const from = document.getElementById('trajets-date-from')?.value;
    const to = document.getElementById('trajets-date-to')?.value;
    if (!from || !to) return;

    const listEl = document.getElementById('trajets-list');
    if (listEl) listEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const trajets = await DriverStore.getTrajets(from, to);
    this._renderTrajets(trajets);
  },

  destroy() {
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._layers = [];
    this._trajets = null;
  }
};
