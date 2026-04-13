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
    try {
      // Determine which collections are arrays vs object (settings)
      const SETTINGS_COLLECTIONS = ['settings'];
      const collections = Object.keys(this._emptyData());

      const fetchPromises = collections.map(async (col) => {
        const table = TABLE_MAP[col];
        if (!table) {
          // No table mapping -- return the empty default
          const empty = this._emptyData();
          return { collection: col, data: empty[col] };
        }

        if (SETTINGS_COLLECTIONS.includes(col)) {
          // Settings: single row
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

        // Regular collection: array of rows
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.warn(`Store: Supabase fetch ${col} error:`, error.message);
          return { collection: col, data: [] };
        }
        return { collection: col, data: rowsToCamel(data || []) };
      });

      const results = await Promise.all(fetchPromises);

      // Build cache from results
      this._cache = this._emptyData();
      for (const { collection, data } of results) {
        this._cache[collection] = data;
      }

      this._backupToLocalStorage();
      console.log('Store: Data loaded from Supabase');
    } catch (e) {
      // Offline or unexpected error -- use localStorage fallback
      console.warn('Store: Supabase unreachable -- using local backup:', e.message);
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

  // =================== YANGO API (stubs -- require Edge Functions) ===================

  async getYangoWorkRules() {
    console.warn('Store: getYangoWorkRules requires Supabase Edge Functions (not yet implemented)');
    return null;
  },

  async getYangoStats(workRuleIds, dateRange) {
    console.warn('Store: getYangoStats requires Supabase Edge Functions (not yet implemented)');
    return { error: 'Non disponible', details: 'Les Edge Functions Yango ne sont pas encore configurees' };
  },

  async getYangoDriverStats(yangoDriverId, date) {
    console.warn('Store: getYangoDriverStats requires Supabase Edge Functions (not yet implemented)');
    return { error: 'Non disponible', details: 'Les Edge Functions Yango ne sont pas encore configurees' };
  },

  async getYangoDrivers(workRuleIds) {
    console.warn('Store: getYangoDrivers requires Supabase Edge Functions (not yet implemented)');
    return null;
  },

  async getYangoOrders(from, to) {
    console.warn('Store: getYangoOrders requires Supabase Edge Functions (not yet implemented)');
    return null;
  },

  async getYangoVehicles() {
    console.warn('Store: getYangoVehicles requires Supabase Edge Functions (not yet implemented)');
    return null;
  },

  async triggerYangoSync(date = null) {
    console.warn('Store: triggerYangoSync requires Supabase Edge Functions (not yet implemented)');
    return { error: 'Non disponible', details: 'Les Edge Functions Yango ne sont pas encore configurees' };
  },

  async getYangoSyncStatus() {
    console.warn('Store: getYangoSyncStatus requires Supabase Edge Functions (not yet implemented)');
    return null;
  },

  async getYangoDriversForLinking() {
    console.warn('Store: getYangoDriversForLinking requires Supabase Edge Functions (not yet implemented)');
    return null;
  },

  async getYangoVehiclesForLinking() {
    console.warn('Store: getYangoVehiclesForLinking requires Supabase Edge Functions (not yet implemented)');
    return null;
  },

  async cleanupGhostVersements() {
    console.warn('Store: cleanupGhostVersements requires Supabase Edge Functions (not yet implemented)');
    throw new Error('Edge Function non disponible');
  },

  async yangoBalance(chauffeurId) {
    console.warn('Store: yangoBalance requires Supabase Edge Functions (not yet implemented)');
    throw new Error('Edge Function non disponible');
  },

  async yangoRecharge(chauffeurId, amount, description) {
    console.warn('Store: yangoRecharge requires Supabase Edge Functions (not yet implemented)');
    throw new Error('Edge Function non disponible');
  }
};
