/**
 * DriverTripTracker — Widget flottant de suivi de trajet en temps reel
 *
 * Auto-start quand vitesse > 5 km/h pendant 30s
 * Auto-stop apres 5 min immobile
 * Affiche vitesse, duree, distance
 */
const DriverTripTracker = {
  _active: false,
  _el: null,
  _timer: null,
  _startTime: null,
  _totalDistance: 0,
  _currentSpeed: 0,
  _lastLat: null,
  _lastLng: null,
  _positions: [],

  // Auto-start detection
  _movingStarted: 0,
  _immobileSince: 0,
  _AUTO_START_SPEED: 5,       // km/h
  _AUTO_START_DELAY: 30000,   // 30s de mouvement
  _AUTO_STOP_DELAY: 300000,   // 5 min immobile

  init() {
    if (this._el) return;

    // Style pulse animation
    if (!document.getElementById('trip-tracker-styles')) {
      const style = document.createElement('style');
      style.id = 'trip-tracker-styles';
      style.textContent = '@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}';
      document.head.appendChild(style);
    }

    // Build DOM programmatically (no innerHTML with user data)
    const div = document.createElement('div');
    div.id = 'trip-tracker';
    Object.assign(div.style, {
      position: 'fixed',
      bottom: 'calc(80px + env(safe-area-inset-bottom,0px))',
      left: '16px',
      right: '16px',
      zIndex: '190',
      display: 'none',
      background: 'rgba(15,23,42,0.92)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '20px',
      padding: '16px 20px',
      color: 'white',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      animation: 'modalSpring 0.4s cubic-bezier(.22,1,.36,1)'
    });

    // Header row
    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' });

    const headerLeft = document.createElement('div');
    Object.assign(headerLeft.style, { display: 'flex', alignItems: 'center', gap: '8px' });
    const dot = document.createElement('span');
    Object.assign(dot.style, { width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' });
    const label = document.createElement('span');
    Object.assign(label.style, { fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)' });
    label.textContent = 'Trajet en cours';
    headerLeft.append(dot, label);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'trip-close';
    Object.assign(closeBtn.style, { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    const closeIcon = document.createElement('iconify-icon');
    closeIcon.setAttribute('icon', 'solar:close-circle-bold-duotone');
    closeBtn.appendChild(closeIcon);
    closeBtn.addEventListener('click', () => this.stop());

    header.append(headerLeft, closeBtn);

    // Stats grid
    const grid = document.createElement('div');
    Object.assign(grid.style, { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' });

    const createStat = (id, color, unit) => {
      const col = document.createElement('div');
      const val = document.createElement('div');
      val.id = id;
      Object.assign(val.style, { fontSize: '1.8rem', fontWeight: '800', lineHeight: '1', color });
      val.textContent = id === 'trip-duration' ? '00:00' : '0';
      const lbl = document.createElement('div');
      Object.assign(lbl.style, { fontSize: '0.65rem', fontWeight: '600', color: 'rgba(255,255,255,0.4)', marginTop: '2px' });
      lbl.textContent = unit;
      col.append(val, lbl);
      return col;
    };
    grid.append(
      createStat('trip-speed', '#60a5fa', 'km/h'),
      createStat('trip-duration', '#a78bfa', 'duree'),
      createStat('trip-distance', '#34d399', 'km')
    );

    // Speed bar
    const bar = document.createElement('div');
    bar.id = 'trip-speed-bar';
    Object.assign(bar.style, { marginTop: '12px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' });
    const fill = document.createElement('div');
    fill.id = 'trip-speed-fill';
    Object.assign(fill.style, { height: '100%', borderRadius: '2px', background: '#22c55e', width: '0%', transition: 'width 0.5s,background 0.5s' });
    bar.appendChild(fill);

    div.append(header, grid, bar);
    document.body.appendChild(div);
    this._el = div;
  },

  // Appele par driver-app.js a chaque position GPS
  onPosition(lat, lng, speed, heading, accuracy) {
    this._currentSpeed = speed || 0;

    if (!this._active) {
      // Detection auto-start
      if (speed != null && speed >= this._AUTO_START_SPEED) {
        if (!this._movingStarted) this._movingStarted = Date.now();
        this._immobileSince = 0;
        if (Date.now() - this._movingStarted >= this._AUTO_START_DELAY) {
          this.start();
        }
      } else {
        this._movingStarted = 0;
      }
      return;
    }

    // Trajet actif — cumuler distance
    if (this._lastLat != null) {
      const d = this._haversine(this._lastLat, this._lastLng, lat, lng);
      if (d > 5 && d < 5000) { // filtrer bruit GPS (< 5m) et sauts (> 5km)
        this._totalDistance += d;
      }
    }
    this._lastLat = lat;
    this._lastLng = lng;
    this._positions.push({ lat, lng, speed, t: Date.now() });

    // Auto-stop detection
    if (speed != null && speed < 3) {
      if (!this._immobileSince) this._immobileSince = Date.now();
      if (Date.now() - this._immobileSince >= this._AUTO_STOP_DELAY) {
        this.stop();
        return;
      }
    } else {
      this._immobileSince = 0;
    }

    this._updateUI();
  },

  start() {
    if (this._active) return;
    this._active = true;
    this._startTime = Date.now();
    this._totalDistance = 0;
    this._lastLat = null;
    this._lastLng = null;
    this._positions = [];
    this._immobileSince = 0;
    this._movingStarted = 0;

    this.init();
    this._el.style.display = 'block';

    // Timer pour mettre a jour la duree
    this._timer = setInterval(() => this._updateUI(), 1000);
    console.log('[Trip] Trajet demarre');
  },

  stop() {
    this._active = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._el) {
      this._el.style.display = 'none';
    }
    this._movingStarted = 0;
    this._immobileSince = 0;
    console.log('[Trip] Trajet arrete — distance:', (this._totalDistance / 1000).toFixed(1), 'km');
  },

  _updateUI() {
    if (!this._el) return;

    // Vitesse
    const speedEl = this._el.querySelector('#trip-speed');
    if (speedEl) speedEl.textContent = Math.round(this._currentSpeed);

    // Duree
    const durEl = this._el.querySelector('#trip-duration');
    if (durEl && this._startTime) {
      const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      durEl.textContent = h > 0
        ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
        : String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    // Distance
    const distEl = this._el.querySelector('#trip-distance');
    if (distEl) {
      const km = this._totalDistance / 1000;
      distEl.textContent = km < 10 ? km.toFixed(1) : Math.round(km);
    }

    // Barre de vitesse (max 130 km/h)
    const fill = this._el.querySelector('#trip-speed-fill');
    if (fill) {
      const pct = Math.min(this._currentSpeed / 130 * 100, 100);
      fill.style.width = pct + '%';
      if (this._currentSpeed < 50) fill.style.background = '#22c55e';
      else if (this._currentSpeed < 90) fill.style.background = '#f59e0b';
      else if (this._currentSpeed < 110) fill.style.background = '#f97316';
      else fill.style.background = '#ef4444';
    }
  },

  _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
};
