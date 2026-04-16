/**
 * Store - Cache-First data layer with Supabase synchronization
 *
 * Architecture:
 * - Reads are SYNCHRONOUS (from in-memory cache) -- zero changes needed in pages
 * - Writes update cache immediately + fire Supabase call in background
 * - Falls back to localStorage when Supabase is unreachable (offline mode)
 *
 * Dependencies (loaded before this file):
 *   - supabase-config.js : supabase client, TABLE_MAP, objToSnake, objToCamel, rowsToCamel
 */
const Store = {
  _KEY: 'pilote_data',
  _cache: null,

  // =================== INITIALIZATION ===================

  /**
   * Load all data from Supabase into memory cache.
   * Called once at app startup after authentication.
   * Fetches every collection in parallel via Promise.all.
   */
  async initialize() {
    // Phase 1: load critical collections first (dashboard needs these)
    const CRITICAL = ['chauffeurs', 'vehicules', 'versements', 'planning', 'settings'];
    const SETTINGS_COLLECTIONS = ['settings'];

    // Start with localStorage backup for instant display
    this._cache = this._loadFromLocalStorage() || this._emptyData();

    try {
      // Phase 1: fetch critical collections in parallel
      const criticalResults = await Promise.all(CRITICAL.map(col => this._fetchCollection(col, SETTINGS_COLLECTIONS)));
      for (const { collection, data } of criticalResults) {
        this._cache[collection] = data;
      }
      this._backupToLocalStorage();
      this._notify();
      console.log('Store: Phase 1 loaded (critical collections)');

      // Phase 2: fetch remaining collections in background (non-blocking)
      const allCollections = Object.keys(this._emptyData());
      const remaining = allCollections.filter(col => !CRITICAL.includes(col));

      Promise.all(remaining.map(col => this._fetchCollection(col, SETTINGS_COLLECTIONS)))
        .then(results => {
          for (const { collection, data } of results) {
            this._cache[collection] = data;
          }
          this._backupToLocalStorage();
          this._notify();
          console.log('Store: Phase 2 loaded (all collections)');
        })
        .catch(e => console.warn('Store: Phase 2 partial failure:', e.message));

    } catch (e) {
      console.warn('Store: Supabase unreachable — using local backup:', e.message);
    }
  },

  async _fetchCollection(col, settingsCollections) {
    const table = TABLE_MAP[col];
    if (!table) {
      const empty = this._emptyData();
      return { collection: col, data: empty[col] };
    }

    if (settingsCollections.includes(col)) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1)
        .single();
      if (error) {
        console.warn(`Store: Supabase fetch ${col} error:`, error.message);
        return { collection: col, data: { entreprise: {}, preferences: {} } };
      }
      return { collection: col, data: objToCamel(data) };
    }

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn(`Store: Supabase fetch ${col} error:`, error.message);
      return { collection: col, data: [] };
    }
    return { collection: col, data: rowsToCamel(data || []) };
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

  // =================== WRITES (cache + background Supabase sync) ===================

  add(collection, item) {
    if (!this._cache) this._cache = this._emptyData();
    if (!this._cache[collection]) this._cache[collection] = [];
    this._cache[collection].push(item);
    this._backupToLocalStorage();
    this._notify();
    // Background Supabase sync
    this._supabaseInsert(collection, item);
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
    // Background Supabase sync
    this._supabaseUpdate(collection, id, updates);
    return items[index];
  },

  delete(collection, id) {
    if (!this._cache) return;
    const items = this._cache[collection] || [];
    this._cache[collection] = items.filter(item => item.id !== id);
    this._backupToLocalStorage();
    this._notify();
    // Background Supabase sync
    this._supabaseDelete(collection, id);
  },

  set(collection, data) {
    if (!this._cache) this._cache = this._emptyData();
    this._cache[collection] = data;
    this._backupToLocalStorage();
    this._notify();
    // Background Supabase sync -- settings uses upsert, others use bulk replace
    if (collection === 'settings') {
      this._supabaseUpsertSettings(data);
    } else {
      this._supabaseBulkReplace(collection, data);
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

  // =================== INTERNAL: Supabase Communication ===================

  /**
   * Insert a single row into a Supabase table.
   */
  async _supabaseInsert(collection, item) {
    const table = TABLE_MAP[collection];
    if (!table) {
      console.warn(`Store: No table mapping for collection "${collection}"`);
      return;
    }
    try {
      const row = objToSnake(item);
      const { error } = await supabase.from(table).insert(row);
      if (error) {
        console.error(`Store: Supabase insert ${collection} failed:`, error.message);
        this._showSyncError();
      }
    } catch (e) {
      console.warn(`Store: Supabase insert ${collection} failed (offline):`, e.message);
    }
  },

  /**
   * Update a single row in a Supabase table by id.
   */
  async _supabaseUpdate(collection, id, updates) {
    const table = TABLE_MAP[collection];
    if (!table) {
      console.warn(`Store: No table mapping for collection "${collection}"`);
      return;
    }
    try {
      const row = objToSnake(updates);
      const { error } = await supabase.from(table).update(row).eq('id', id);
      if (error) {
        console.error(`Store: Supabase update ${collection}/${id} failed:`, error.message);
        this._showSyncError();
      }
    } catch (e) {
      console.warn(`Store: Supabase update ${collection}/${id} failed (offline):`, e.message);
    }
  },

  /**
   * Delete a single row from a Supabase table by id.
   */
  async _supabaseDelete(collection, id) {
    const table = TABLE_MAP[collection];
    if (!table) {
      console.warn(`Store: No table mapping for collection "${collection}"`);
      return;
    }
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) {
        console.error(`Store: Supabase delete ${collection}/${id} failed:`, error.message);
        this._showSyncError();
      }
    } catch (e) {
      console.warn(`Store: Supabase delete ${collection}/${id} failed (offline):`, e.message);
    }
  },

  /**
   * Upsert settings as a single row.
   */
  async _supabaseUpsertSettings(data) {
    const table = TABLE_MAP.settings;
    if (!table) return;
    try {
      const row = objToSnake(data);
      const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
      if (error) {
        console.error('Store: Supabase upsert settings failed:', error.message);
        this._showSyncError();
      }
    } catch (e) {
      console.warn('Store: Supabase upsert settings failed (offline):', e.message);
    }
  },

  /**
   * Bulk replace: delete all existing rows for the user, then insert new ones.
   * Used for budgets and other collections that are replaced wholesale.
   */
  async _supabaseBulkReplace(collection, items) {
    const table = TABLE_MAP[collection];
    if (!table) {
      console.warn(`Store: No table mapping for collection "${collection}"`);
      return;
    }
    try {
      // Get current user to scope the delete
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('Store: No authenticated user for bulk replace');
        return;
      }

      // Delete all existing rows for this user
      const { error: delError } = await supabase
        .from(table)
        .delete()
        .eq('user_id', user.id);

      if (delError) {
        console.error(`Store: Supabase bulk delete ${collection} failed:`, delError.message);
        this._showSyncError();
        return;
      }

      // Insert all new rows (if any)
      if (Array.isArray(items) && items.length > 0) {
        const rows = items.map(item => objToSnake(item));
        const { error: insError } = await supabase.from(table).insert(rows);
        if (insError) {
          console.error(`Store: Supabase bulk insert ${collection} failed:`, insError.message);
          this._showSyncError();
        }
      }
    } catch (e) {
      console.warn(`Store: Supabase bulk replace ${collection} failed (offline):`, e.message);
    }
  },

  /**
   * Show a toast notification for sync errors (if Toast is available).
   */
  _showSyncError() {
    if (typeof Toast !== 'undefined') {
      Toast.show('Erreur de synchronisation avec le serveur', 'error');
    }
  },

  // =================== INTERNAL: localStorage Backup ===================

  _backupToLocalStorage() {
    try {
      localStorage.setItem(this._KEY, JSON.stringify(this._cache));
    } catch (e) {
      // QuotaExceeded -- not critical since Supabase is primary storage
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
    document.dispatchEvent(new CustomEvent('pilote:data-changed'));
  },

  _notifyRemote() {
    document.dispatchEvent(new CustomEvent('pilote:remote-update'));
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
      pointages: [],
      conduiteBrute: [],
      checklistVehicules: [],
      depenses: [],
      reparations: [],
      controlesTechniques: [],
      incidents: [],
      taches: [],
      contraventions: [],
      depenseRecurrentes: [],
      depenseCategories: [],
      versementRecurrents: [],
      conversations: [],
      notifications: [],
      settings: { entreprise: {}, preferences: {} }
    };
  },

  // =================== YANGO API (via Vercel Serverless Functions) ===================

  /**
   * Helper: make authenticated API call to /api/yango?action=<endpoint>
   * Single consolidated serverless function — routes via query parameter.
   * Passes the Supabase session token as Bearer auth.
   */
  async _yangoApi(endpoint, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Non authentifie — veuillez vous reconnecter');

    const method = options.method || 'GET';
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const fetchOpts = { method, headers };
    if (options.body) fetchOpts.body = JSON.stringify(options.body);

    const extra = options.query || '';
    const separator = extra.startsWith('?') ? '&' : '';
    const url = `/api/yango?action=${encodeURIComponent(endpoint)}${separator}${extra.replace(/^\?/, '')}`;
    const res = await fetch(url, fetchOpts);
    const json = await res.json();

    if (!res.ok) {
      const msg = json.error || json.details || `Erreur ${res.status}`;
      throw new Error(msg);
    }
    return json;
  },

  async getYangoWorkRules() {
    try {
      return await this._yangoApi('work-rules');
    } catch (e) {
      console.warn('Store: getYangoWorkRules error:', e.message);
      return null;
    }
  },

  async getYangoStats(workRuleIds, dateRange) {
    try {
      const params = new URLSearchParams();
      if (workRuleIds && workRuleIds.length) params.set('work_rule', workRuleIds.join(','));
      if (dateRange?.from) params.set('from', dateRange.from);
      if (dateRange?.to) params.set('to', dateRange.to);
      const qs = params.toString();
      return await this._yangoApi('stats', { query: qs ? `?${qs}` : '' });
    } catch (e) {
      console.warn('Store: getYangoStats error:', e.message);
      return { error: 'Non disponible', details: e.message };
    }
  },

  async getYangoDriverStats(yangoDriverId, date) {
    try {
      const params = new URLSearchParams({ yangoDriverId });
      if (date) {
        params.set('from', `${date}T00:00:00+00:00`);
        params.set('to', `${date}T23:59:59+00:00`);
      }
      return await this._yangoApi('driver-stats', { query: `?${params}` });
    } catch (e) {
      console.warn('Store: getYangoDriverStats error:', e.message);
      return { error: 'Non disponible', details: e.message };
    }
  },

  async getYangoDrivers(workRuleIds) {
    try {
      const params = new URLSearchParams();
      if (workRuleIds && workRuleIds.length) params.set('work_rule', workRuleIds.join(','));
      const qs = params.toString();
      return await this._yangoApi('drivers', { query: qs ? `?${qs}` : '' });
    } catch (e) {
      console.warn('Store: getYangoDrivers error:', e.message);
      return null;
    }
  },

  async getYangoOrders(from, to) {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      return await this._yangoApi('orders', { query: qs ? `?${qs}` : '' });
    } catch (e) {
      console.warn('Store: getYangoOrders error:', e.message);
      return null;
    }
  },

  async getYangoVehicles() {
    try {
      return await this._yangoApi('vehicles');
    } catch (e) {
      console.warn('Store: getYangoVehicles error:', e.message);
      return null;
    }
  },

  async triggerYangoSync(date = null) {
    try {
      return await this._yangoApi('sync', {
        method: 'POST',
        body: date ? { date } : {}
      });
    } catch (e) {
      console.warn('Store: triggerYangoSync error:', e.message);
      return { error: 'Non disponible', details: e.message };
    }
  },

  async getYangoSyncStatus() {
    // Sync status is now server-side only; return basic info
    try {
      return { running: false, enabled: true, lastSyncDate: null };
    } catch (e) {
      return null;
    }
  },

  async getYangoDriversForLinking() {
    try {
      return await this._yangoApi('drivers-all');
    } catch (e) {
      console.warn('Store: getYangoDriversForLinking error:', e.message);
      return null;
    }
  },

  async getYangoVehiclesForLinking() {
    try {
      return await this._yangoApi('vehicles-all');
    } catch (e) {
      console.warn('Store: getYangoVehiclesForLinking error:', e.message);
      return null;
    }
  },

  async cleanupGhostVersements() {
    // Clean up ghost versements locally: remove versements where chauffeur no longer exists
    try {
      const versements = this.getAll('versements') || [];
      const chauffeurs = this.getAll('chauffeurs') || [];
      const chauffeurIds = new Set(chauffeurs.map(c => c.id));
      const ghosts = versements.filter(v => v.chauffeurId && !chauffeurIds.has(v.chauffeurId));
      for (const g of ghosts) {
        await this.delete('versements', g.id);
      }
      return { removed: ghosts.length };
    } catch (e) {
      console.warn('Store: cleanupGhostVersements error:', e.message);
      throw e;
    }
  },

  async yangoBalance(chauffeurId) {
    return await this._yangoApi('balance', { query: `?chauffeurId=${encodeURIComponent(chauffeurId)}` });
  },

  async yangoRecharge(chauffeurId, amount, description) {
    return await this._yangoApi('recharge', {
      method: 'POST',
      body: { chauffeurId, amount, description }
    });
  }
};
