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
    : 'https://volt-vtc-production.up.railway.app/api',

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
        // Store _meta info separately if present
        if (this._cache._meta) {
          this._meta = this._cache._meta;
          delete this._cache._meta;
        }
        this._backupToLocalStorage();
        console.log('Store: Data loaded from API', this._meta ? `(last ${this._meta.dataMonths} months)` : '');
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

  /** Get metadata about data loading (cutoff date, totals) */
  getMeta() {
    return this._meta || null;
  },

  /**
   * Load historical data for a date range (not in initial cache).
   * Returns { courses, versements, comptabilite, gps, planning } for the range.
   */
  async loadDateRange(from, to, collections) {
    try {
      const params = new URLSearchParams({ from, to });
      if (collections) params.set('collections', collections);
      const res = await fetch(this._apiBase + '/data/range?' + params.toString(), {
        headers: this._headers()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Store: loadDateRange failed:', e.message);
      return null;
    }
  },

  /**
   * Load aggregated all-time stats for dashboard/reports.
   * Returns monthly revenue, expenses, versements, courses aggregates.
   */
  async loadAggregates() {
    try {
      const res = await fetch(this._apiBase + '/data/aggregates', {
        headers: this._headers()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Store: loadAggregates failed:', e.message);
      return null;
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
      // Only backup small/essential collections to avoid QuotaExceeded
      const essentials = {
        chauffeurs: this._cache.chauffeurs || [],
        vehicules: this._cache.vehicules || [],
        users: this._cache.users || [],
        settings: this._cache.settings || {},
        budgets: this._cache.budgets || [],
        absences: this._cache.absences || [],
        signalements: this._cache.signalements || [],
        factures: this._cache.factures || []
      };
      localStorage.setItem(this._KEY, JSON.stringify(essentials));
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
      signalements: [],
      settings: { entreprise: {}, preferences: {} }
    };
  },

  // =================== YANGO API (real-time, no cache) ===================

  async getYangoWorkRules() {
    try {
      const res = await fetch(this._apiBase + '/yango/work-rules', {
        headers: this._headers()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Store: Yango work-rules failed:', e.message);
      return null;
    }
  },

  async getYangoStats(workRuleIds, dateRange) {
    try {
      const params = new URLSearchParams();
      if (workRuleIds && workRuleIds.length > 0) {
        params.set('work_rule', workRuleIds.join(','));
      }
      if (dateRange && dateRange.from) {
        params.set('from', dateRange.from);
      }
      if (dateRange && dateRange.to) {
        params.set('to', dateRange.to);
      }
      const qs = params.toString();
      const url = this._apiBase + '/yango/stats' + (qs ? '?' + qs : '');
      const res = await fetch(url, {
        headers: this._headers()
      });
      const data = await res.json();
      if (!res.ok) {
        console.warn('Store: Yango stats error:', data);
        return { error: data.error || 'Erreur API', details: data.details || `HTTP ${res.status}` };
      }
      return data;
    } catch (e) {
      console.warn('Store: Yango stats failed:', e.message);
      return { error: 'Erreur reseau', details: e.message };
    }
  },

  async getYangoDriverStats(yangoDriverId, date) {
    try {
      const params = new URLSearchParams();
      if (date) {
        // date is 'YYYY-MM-DD' string — build full day range
        params.set('from', new Date(date + 'T00:00:00').toISOString());
        params.set('to', new Date(date + 'T23:59:59').toISOString());
      }
      const qs = params.toString();
      const url = this._apiBase + '/yango/driver-stats/' + encodeURIComponent(yangoDriverId) + (qs ? '?' + qs : '');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
      const res = await fetch(url, {
        headers: this._headers(),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        console.warn('Store: Yango driver-stats error:', data);
        return { error: data.error || 'Erreur API', details: data.details || `HTTP ${res.status}` };
      }
      return data;
    } catch (e) {
      console.warn('Store: Yango driver-stats failed:', e.message);
      if (e.name === 'AbortError') {
        return { error: 'Délai dépassé', details: 'Le serveur met trop de temps à répondre' };
      }
      return { error: 'Erreur reseau', details: e.message };
    }
  },

  async getYangoDrivers(workRuleIds) {
    try {
      let url = this._apiBase + '/yango/drivers';
      if (workRuleIds && workRuleIds.length > 0) {
        url += '?work_rule=' + encodeURIComponent(workRuleIds.join(','));
      }
      const res = await fetch(url, {
        headers: this._headers()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Store: Yango drivers failed:', e.message);
      return null;
    }
  },

  async getYangoOrders(from, to) {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(this._apiBase + '/yango/orders?' + params.toString(), {
        headers: this._headers()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Store: Yango orders failed:', e.message);
      return null;
    }
  },

  async getYangoVehicles() {
    try {
      const res = await fetch(this._apiBase + '/yango/vehicles', {
        headers: this._headers()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Store: Yango vehicles failed:', e.message);
      return null;
    }
  },

  async triggerYangoSync(date = null) {
    try {
      const body = date ? { date } : {};
      const res = await fetch(this._apiBase + '/yango/sync', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Store: Yango sync failed:', e.message);
      return { error: e.message };
    }
  },

  async getYangoSyncStatus() {
    try {
      const res = await fetch(this._apiBase + '/yango/sync/status', {
        headers: this._headers()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Store: Yango sync status failed:', e.message);
      return null;
    }
  },

  async getYangoDriversForLinking() {
    try {
      const res = await fetch(this._apiBase + '/yango/drivers/all', {
        headers: this._headers()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Store: Yango drivers for linking failed:', e.message);
      return null;
    }
  }
};
