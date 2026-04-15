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

  // =================== YANGO API (via Vercel serverless /api/yango/*) ===================

  async _yangoFetch(path) {
    const res = await fetch(`/api/yango/${path}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { error: err.error || `Erreur ${res.status}`, details: err.details || '' };
    }
    return res.json();
  },

  async getYangoWorkRules() {
    const data = await this._yangoFetch('work-rules');
    if (data.error) { console.warn('getYangoWorkRules:', data.error); return null; }
    return data;
  },

  async getYangoStats(workRuleIds, dateRange) {
    let qs = '';
    if (workRuleIds && workRuleIds.length) qs += `work_rule=${encodeURIComponent(workRuleIds.join(','))}`;
    if (dateRange) {
      if (dateRange.from) qs += `${qs ? '&' : ''}from=${encodeURIComponent(dateRange.from)}`;
      if (dateRange.to) qs += `${qs ? '&' : ''}to=${encodeURIComponent(dateRange.to)}`;
    }
    return this._yangoFetch(`stats${qs ? '?' + qs : ''}`);
  },

  async getYangoDriverStats(yangoDriverId, date) {
    if (!yangoDriverId) return { error: 'Pas de yangoDriverId' };
    let qs = `driver_id=${encodeURIComponent(yangoDriverId)}`;
    if (date) {
      const d = new Date(date);
      const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
      qs += `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }
    return this._yangoFetch(`driver-stats?${qs}`);
  },

  async getYangoDrivers(workRuleIds) {
    let qs = '';
    if (workRuleIds && workRuleIds.length) qs = `work_rule=${encodeURIComponent(workRuleIds.join(','))}`;
    const data = await this._yangoFetch(`drivers${qs ? '?' + qs : ''}`);
    if (data.error) { console.warn('getYangoDrivers:', data.error); return null; }
    return data;
  },

  async getYangoOrders(from, to) {
    let qs = '';
    if (from) qs += `from=${encodeURIComponent(from)}`;
    if (to) qs += `${qs ? '&' : ''}to=${encodeURIComponent(to)}`;
    const data = await this._yangoFetch(`orders${qs ? '?' + qs : ''}`);
    if (data.error) { console.warn('getYangoOrders:', data.error); return null; }
    return data;
  },

  async getYangoVehicles() {
    const data = await this._yangoFetch('vehicles');
    if (data.error) { console.warn('getYangoVehicles:', data.error); return null; }
    return data;
  },

  async triggerYangoSync(date = null) {
    // Sync is now implicit — stats/driver-stats always query Yango live.
    // This method returns a success stub so callers don't break.
    return { success: true, message: 'Les donnees sont synchronisees en temps reel via l\'API Yango.' };
  },

  async getYangoSyncStatus() {
    // With serverless proxy, data is always live — no cron needed.
    return { running: true, enabled: true, lastSyncDate: new Date().toISOString().split('T')[0], realtime: true };
  },

  async getYangoDriversForLinking() {
    const data = await this._yangoFetch('drivers?all=1');
    if (data.error) { console.warn('getYangoDriversForLinking:', data.error); return null; }
    return data;
  },

  async getYangoVehiclesForLinking() {
    const data = await this._yangoFetch('vehicles');
    if (data.error) { console.warn('getYangoVehiclesForLinking:', data.error); return null; }
    return data;
  },

  async cleanupGhostVersements() {
    // Not applicable in serverless mode — no local DB to clean
    return { success: true, cleaned: 0 };
  },

  async yangoBalance(chauffeurId) {
    // Resolve yangoDriverId from local chauffeur record
    const chauffeur = this.findById('chauffeurs', chauffeurId);
    const yangoId = chauffeur?.yangoDriverId;
    if (!yangoId) throw new Error('Chauffeur non lié à Yango');
    const data = await this._yangoFetch(`balance?driver_id=${encodeURIComponent(yangoId)}`);
    if (data.error) throw new Error(data.error);
    return data;
  },

  async yangoRecharge(chauffeurId, amount, description) {
    // Recharge is not available via serverless (requires Park-level write access)
    throw new Error('La recharge Yango n\'est pas encore disponible en mode serverless. Utilisez le portail Yango.');
  }
};
