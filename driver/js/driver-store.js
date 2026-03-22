/**
 * DriverStore — Client API leger pour la PWA chauffeur
 * Chaque appel fetch un endpoint scope au chauffeur connecte
 */
const DriverStore = {
  _apiBase: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api/driver'
    : 'https://volt-vtc-production.up.railway.app/api/driver',

  // Endpoints a mettre en cache pour le mode hors-ligne
  _CACHEABLE: {
    '/dashboard': 'pilote_cache_dashboard',
    '/planning': 'pilote_cache_planning',
    '/dettes': 'pilote_cache_dettes'
  },

  _CACHE_MAX_AGE: 24 * 60 * 60 * 1000, // 24h

  _headers() {
    const token = localStorage.getItem('pilote_driver_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  },

  /** Lire une entree du cache hors-ligne */
  _readCache(path) {
    const key = this._CACHEABLE[path];
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      return entry; // { data, ts }
    } catch (e) {
      return null;
    }
  },

  /** Ecrire une entree dans le cache hors-ligne */
  _writeCache(path, data) {
    const key = this._CACHEABLE[path];
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch (e) { /* localStorage plein */ }
  },

  /** Verifier si le cache est perime (> 24h) */
  isCacheStale(path) {
    const entry = this._readCache(path);
    if (!entry || !entry.ts) return true;
    return (Date.now() - entry.ts) > this._CACHE_MAX_AGE;
  },

  /** Obtenir le timestamp du cache pour un endpoint */
  getCacheTimestamp(path) {
    const entry = this._readCache(path);
    return entry ? entry.ts : null;
  },

  async _get(path) {
    // Extraire le chemin de base (sans query string) pour le cache
    const basePath = path.split('?')[0];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(this._apiBase + path, {
        headers: this._headers(),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.status === 401) {
        DriverAuth.logout();
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Mettre en cache si endpoint cacheable (uniquement sans query string)
      if (basePath === path && this._CACHEABLE[basePath]) {
        this._writeCache(basePath, data);
      }
      return data;
    } catch (e) {
      console.warn('DriverStore GET ' + path + ' failed:', e.message);
      // Fallback: lire le cache hors-ligne
      if (this._CACHEABLE[basePath]) {
        const cached = this._readCache(basePath);
        if (cached && cached.data) {
          console.log('[Offline] Donnees en cache pour ' + basePath);
          return cached.data;
        }
      }
      return null;
    }
  },

  async _post(path, body) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(this._apiBase + path, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);
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

  // ===== SERVICE / POINTAGE =====

  getServiceToday() {
    return this._get('/service/today');
  },

  startService() {
    return this._post('/service/start', {});
  },

  pauseService() {
    return this._post('/service/pause', {});
  },

  resumeService() {
    return this._post('/service/resume', {});
  },

  endService() {
    return this._post('/service/end', {});
  },

  getDeadline() {
    return this._get('/deadline');
  },

  getVersements() {
    return this._get('/versements');
  },

  getDettes() {
    return this._get('/dettes');
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

  getEtatLieuxToday() {
    return this._get('/etat-lieux/today');
  },

  getProfil() {
    return this._get('/profil');
  },

  getContrat() {
    return this._get('/contrat');
  },

  accepterContrat() {
    return this._post('/contrat/accepter', {});
  },

  getVehicule() {
    return this._get('/vehicule');
  },

  getGps() {
    return this._get('/gps');
  },

  getGpsScores() {
    return this._get('/gps');
  },

  getYangoActivity() {
    return this._get('/yango');
  },

  // ===== NOTIFICATIONS =====

  getNotifications(limit = 30) {
    return this._get(`/notifications?limit=${limit}`);
  },

  markNotificationRead(id) {
    return this._put(`/notifications/${id}/read`, {});
  },

  getVapidKey() {
    return this._get('/push/vapid-key');
  },

  subscribePush(subscription) {
    return this._post('/push/subscribe', { subscription });
  },

  unsubscribePush(endpoint) {
    return this._delete('/push/subscribe', { endpoint });
  },

  // ===== MESSAGERIE =====

  getConversations() {
    return this._get('/messages');
  },

  getConversation(id) {
    return this._get(`/messages/${id}`);
  },

  replyToConversation(id, message) {
    return this._post(`/messages/${id}/reply`, { message });
  },

  markConversationRead(id) {
    return this._put(`/messages/${id}/read`, {});
  },

  pollMessages() {
    return this._get('/messages/poll');
  },

  // ===== LOCATION GPS =====

  sendLocation(lat, lng, speed, heading, accuracy) {
    return this._post('/location', { lat, lng, speed, heading, accuracy });
  },

  sendLocationBatch(points) {
    return this._post('/location/batch', { points });
  },

  // ===== BEHAVIOR / ANALYSE CONDUITE =====

  sendBehaviorEvents(batch) {
    return this._post('/behavior/events', batch);
  },

  finalizeBehaviorSession() {
    return this._post('/behavior/finalize', {});
  },

  getBehaviorStatus() {
    return this._get('/behavior/status');
  },

  // ===== TRAJETS =====

  getTrajets(from, to) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return this._get('/trajets' + (qs ? '?' + qs : ''));
  },

  // ===== CHECKLIST VEHICULE =====

  getChecklistToday() {
    return this._get('/checklist/today');
  },

  submitChecklist(data) {
    return this._post('/checklist', data);
  },

  // ===== CLASSEMENT =====

  getClassement() {
    return this._get('/classement');
  },

  // ===== RESUME HEBDO =====

  getResumeHebdo() {
    return this._get('/resume-hebdo');
  },

  // ===== CONTRAVENTIONS =====

  getContraventions() {
    return this._get('/contraventions');
  },

  contesterContravention(id, motif) {
    return this._put('/contraventions/' + id + '/contester', { motif });
  },

  createWaveContraventionCheckout(contraventionId) {
    return this._post('/contraventions/wave/checkout', { contraventionId });
  },

  // ===== WAVE PAIEMENT =====

  createWaveCheckout(data) {
    return this._post('/wave/checkout', data);
  },

  getWaveStatus(versementId) {
    return this._get(`/wave/status/${versementId}`);
  },

  // ===== OBJECTIFS & GAMIFICATION =====

  getObjectifs() {
    return this._get('/objectifs');
  },

  // ===== DOCUMENTS UPLOAD =====

  uploadDocument(type, fichierData, fichierType, fichierNom) {
    return this._post('/documents/' + type + '/upload', { fichierData, fichierType, fichierNom });
  },

  getDocumentFile(type) {
    return this._get('/documents/' + type + '/file');
  },

  // ===== MAINTENANCES =====

  getMaintenances() {
    return this._get('/maintenances');
  },

  signalMaintenanceProblem(data) {
    return this._post('/maintenances/signal', data);
  },

  // ===== HTTP METHODS SUPPLEMENTAIRES =====

  async _put(path, body) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(this._apiBase + path, {
        method: 'PUT',
        headers: this._headers(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.status === 401) { DriverAuth.logout(); return null; }
      const data = await res.json();
      if (!res.ok) return { error: data.error || `Erreur ${res.status}` };
      return data;
    } catch (e) {
      console.warn('DriverStore PUT ' + path + ' failed:', e.message);
      return { error: 'Erreur reseau' };
    }
  },

  async _delete(path, body) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(this._apiBase + path, {
        method: 'DELETE',
        headers: this._headers(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.status === 401) { DriverAuth.logout(); return null; }
      const data = await res.json();
      if (!res.ok) return { error: data.error || `Erreur ${res.status}` };
      return data;
    } catch (e) {
      console.warn('DriverStore DELETE ' + path + ' failed:', e.message);
      return { error: 'Erreur reseau' };
    }
  }
};
