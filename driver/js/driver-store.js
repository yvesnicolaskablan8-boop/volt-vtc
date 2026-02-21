/**
 * DriverStore — Client API leger pour la PWA chauffeur
 * Chaque appel fetch un endpoint scope au chauffeur connecte
 */
const DriverStore = {
  _apiBase: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api/driver'
    : 'https://volt-vtc-production.up.railway.app/api/driver',

  _headers() {
    const token = localStorage.getItem('volt_driver_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  },

  async _get(path) {
    try {
      const res = await fetch(this._apiBase + path, { headers: this._headers() });
      if (res.status === 401) {
        DriverAuth.logout();
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('DriverStore GET ' + path + ' failed:', e.message);
      return null;
    }
  },

  async _post(path, body) {
    try {
      const res = await fetch(this._apiBase + path, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        DriverAuth.logout();
        return null;
      }
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || `Erreur ${res.status}` };
      }
      return data;
    } catch (e) {
      console.warn('DriverStore POST ' + path + ' failed:', e.message);
      return { error: 'Erreur reseau' };
    }
  },

  // ===== ENDPOINTS =====

  getDashboard() {
    return this._get('/dashboard');
  },

  getPlanning(from, to) {
    let qs = '';
    if (from || to) {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      qs = '?' + params.toString();
    }
    return this._get('/planning' + qs);
  },

  getAbsences() {
    return this._get('/absences');
  },

  createAbsence(data) {
    return this._post('/absences', data);
  },

  getVersements() {
    return this._get('/versements');
  },

  createVersement(data) {
    return this._post('/versements', data);
  },

  getSignalements() {
    return this._get('/signalements');
  },

  createSignalement(data) {
    return this._post('/signalements', data);
  },

  getProfil() {
    return this._get('/profil');
  },

  getVehicule() {
    return this._get('/vehicule');
  },

  getGps() {
    return this._get('/gps');
  }
};
