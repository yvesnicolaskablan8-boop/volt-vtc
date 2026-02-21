/**
 * Store - Cache-First data layer with API synchronization
 *
 * Architecture:
 * - Reads are SYNCHRONOUS (from in-memory cache) → zero changes needed in pages
 * - Writes update cache immediately + fire API call in background
 * - Falls back to localStorage when API is unreachable (offline mode)
 */
const Store = {
  _KEY: 'volt_data',
  _cache: null,
  _apiBase: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api',

  // =================== INITIALIZATION ===================

  /**
   * Load all data from API into memory cache.
   * Called once at app startup after authentication.
   */
  async initialize() {
    try {
      const res = await fetch(this._apiBase + '/data', {
        headers: this._headers()
      });
      if (res.ok) {
        this._cache = await res.json();
        this._backupToLocalStorage();
        console.log('Store: Data loaded from API');
      } else if (res.status === 401) {
        // Token invalid — will redirect to login
        this._cache = this._emptyData();
      } else {
        // API error — try localStorage fallback
        console.warn('Store: API returned', res.status, '— using local backup');
        this._cache = this._loadFromLocalStorage() || this._emptyData();
      }
    } catch (e) {
      // Offline — use localStorage fallback
      console.warn('Store: API unreachable — using local backup');
      this._cache = this._loadFromLocalStorage() || this._emptyData();
    }
  },

  // =================== SYNCHRONOUS READS (from cache) ===================

  getAll() {
    return this._cache;
  },

  get(collection) {
    if (!this._cache) return [];
    const data = this._cache[collection];
    // Settings is an object, not an array
    if (collection === 'settings') return data || {};
    return data || [];
  },

  findById(collection, id) {
    const items = this.get(collection);
    if (!Array.isArray(items)) return null;
    return items.find(item => item.id === id) || null;
  },

  query(collection, filterFn) {
    const items = this.get(collection);
    if (!Array.isArray(items)) return [];
    return items.filter(filterFn);
  },

  count(collection, filterFn) {
    if (filterFn) {
      return this.query(collection, filterFn).length;
    }
    const items = this.get(collection);
    return Array.isArray(items) ? items.length : 0;
  },

  // =================== WRITES (cache + background API sync) ===================

  add(collection, item) {
    if (!this._cache) this._cache = this._emptyData();
    if (!this._cache[collection]) this._cache[collection] = [];
    this._cache[collection].push(item);
    this._backupToLocalStorage();
    this._notify();
    // Background API sync
    this._apiCall('POST', `/${collection}`, item);
    return item;
  },

  update(collection, id, updates) {
    if (!this._cache) return null;
    const items = this._cache[collection] || [];
    if (!Array.isArray(items)) return null;
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updates };
    this._backupToLocalStorage();
    this._notify();
    // Background API sync
    this._apiCall('PUT', `/${collection}/${id}`, updates);
    return items[index];
  },

  delete(collection, id) {
    if (!this._cache) return;
    const items = this._cache[collection] || [];
    this._cache[collection] = items.filter(item => item.id !== id);
    this._backupToLocalStorage();
    this._notify();
    // Background API sync
    this._apiCall('DELETE', `/${collection}/${id}`);
  },

  set(collection, data) {
    if (!this._cache) this._cache = this._emptyData();
    this._cache[collection] = data;
    this._backupToLocalStorage();
    this._notify();
    // Background API sync — settings uses PUT /api/settings, others use bulk replace
    if (collection === 'settings') {
      this._apiCall('PUT', '/settings', data);
    } else {
      // For budgets and other bulk-replace operations
      this._apiBulkReplace(collection, data);
    }
  },

  // =================== UTILITY ===================

  isInitialized() {
    return this._cache !== null;
  },

  reset() {
    this._cache = this._emptyData();
    localStorage.removeItem(this._KEY);
    this._notify();
  },

  getStorageSize() {
    const json = JSON.stringify(this._cache || {});
    const bytes = new Blob([json]).size;
    return {
      bytes,
      kb: Math.round(bytes / 1024),
      mb: (bytes / (1024 * 1024)).toFixed(2)
    };
  },

  // =================== INTERNAL: API Communication ===================

  _headers() {
    const token = localStorage.getItem('volt_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  },

  async _apiCall(method, path, body) {
    try {
      const opts = {
        method,
        headers: this._headers()
      };
      if (body && method !== 'DELETE') {
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(this._apiBase + path, opts);

      if (res.status === 401) {
        // Token expired — force logout
        console.warn('Store: Token expired, redirecting to login');
        if (typeof Auth !== 'undefined') Auth.destroySession();
        localStorage.removeItem('volt_token');
        if (typeof App !== 'undefined') App._showLogin();
        return;
      }

      if (!res.ok) {
        const text = await res.text();
        console.error(`Store: API ${method} ${path} failed (${res.status}):`, text);
        if (typeof Toast !== 'undefined') {
          Toast.show('Erreur de synchronisation avec le serveur', 'error');
        }
      }
    } catch (e) {
      // Network error — data is saved in localStorage backup
      console.warn(`Store: API ${method} ${path} failed (offline):`, e.message);
    }
  },

  async _apiBulkReplace(collection, items) {
    // Delete all existing + insert all new (used for budgets bulk replace)
    try {
      // Simple approach: send array via PUT to collection root
      const res = await fetch(this._apiBase + `/${collection}`, {
        method: 'PUT',
        headers: this._headers(),
        body: JSON.stringify(items)
      });
      if (!res.ok && res.status !== 404) {
        console.error(`Store: Bulk replace ${collection} failed:`, res.status);
      }
    } catch (e) {
      console.warn(`Store: Bulk replace ${collection} failed (offline):`, e.message);
    }
  },

  // =================== INTERNAL: localStorage Backup ===================

  _backupToLocalStorage() {
    try {
      localStorage.setItem(this._KEY, JSON.stringify(this._cache));
    } catch (e) {
      // QuotaExceeded — not critical since API is primary storage
      console.warn('Store: localStorage backup failed:', e.message);
    }
  },

  _loadFromLocalStorage() {
    try {
      const data = localStorage.getItem(this._KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Store: localStorage load error:', e);
      return null;
    }
  },

  _notify() {
    document.dispatchEvent(new CustomEvent('volt:data-changed'));
  },

  _emptyData() {
    return {
      chauffeurs: [],
      vehicules: [],
      courses: [],
      versements: [],
      gps: [],
      comptabilite: [],
      factures: [],
      budgets: [],
      planning: [],
      absences: [],
      users: [],
      settings: { entreprise: {}, preferences: {} }
    };
  }
};
