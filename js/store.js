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
  // Etat du premier chargement. Sans lui, une page ne peut pas distinguer
  // « les donnees ne sont pas encore arrivees » de « il n'y a rien a afficher »,
  // et se contente de tourner indefiniment.
  _phase1: 'en-cours',   // 'en-cours' | 'ok' | 'echec' | 'session'
  estPret() { return this._phase1 !== 'en-cours'; },
  chargementReussi() { return this._phase1 === 'ok'; },
  sessionExpiree() { return this._phase1 === 'session'; },

  /**
   * Sans session valide, PostgREST renvoie un tableau vide avec un code 200 :
   * aucune erreur, juste le neant. L'application croyait alors avoir charge
   * avec succes zero chauffeur et affichait « Aucune donnee » partout, alors
   * que la base etait pleine. On distingue donc explicitement les deux cas.
   */
  async _verifierSession() {
    try {
      const { data } = await supabase.auth.getSession();
      return !!(data && data.session && data.session.access_token);
    } catch (e) { return false; }
  },

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
      // Tout vide ? Ce n'est un resultat legitime que si la session est valide.
      const totalCritique = CRITICAL.reduce((n, col) => n + ((this._cache[col] || []).length || 0), 0);
      if (totalCritique === 0 && !(await this._verifierSession())) {
        this._phase1 = 'session';
        console.warn('Store: aucune donnee ET aucune session valide — session expiree.');
      } else {
        this._backupToLocalStorage();
        this._phase1 = 'ok';
        console.log('Store: Phase 1 loaded (critical collections)');
      }
      this._notify();

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
          // Re-render la page courante : sans ça, les collections de Phase 2
          // (contraventions, comptabilité…) restent affichées avec les vieilles
          // données du localStorage jusqu'à une navigation manuelle.
          this._notifyRemote();
          console.log('Store: Phase 2 loaded (all collections)');
        })
        .catch(e => console.warn('Store: Phase 2 partial failure:', e.message));

    } catch (e) {
      this._phase1 = 'echec';
      console.warn('Store: Supabase unreachable — using local backup:', e.message);
      this._notify();
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

    // Pagination obligatoire : PostgREST plafonne chaque requête à 1000 lignes.
    // Sans boucle .range(), toute collection > 1000 lignes est silencieusement
    // tronquée (les plus anciennes disparaissent → fausses dettes implicites).
    const PAGE_SIZE = 1000;
    const all = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        console.warn(`Store: Supabase fetch ${col} error:`, error.message);
        // Conserver les données déjà en cache plutôt que d'écraser avec du vide
        const prev = this._cache && Array.isArray(this._cache[col]) ? this._cache[col] : [];
        return { collection: col, data: prev };
      }
      all.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return { collection: col, data: rowsToCamel(all) };
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

  // Alias de compatibilité : certaines pages appellent create/remove.
  // Sans ces alias, l'appel lève un TypeError et l'enregistrement est perdu.
  create(collection, item) {
    const it = { ...item };
    if (!it.id) {
      it.id = (typeof Utils !== 'undefined' && Utils.generateId)
        ? Utils.generateId('GEN')
        : 'GEN-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    if (!it.dateCreation) it.dateCreation = new Date().toISOString();
    return this.add(collection, it);
  },

  remove(collection, id) {
    return this.delete(collection, id);
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
      const row = this._normaliserEcriture(objToSnake(item));
      const { error } = await supabase.from(table).insert(row);
      if (error) {
        console.error(`Store: Supabase insert ${collection} failed:`, error.message);
        this._showSyncError(error, 'insert');
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
      const row = this._normaliserEcriture(objToSnake(updates));
      const { error } = await supabase.from(table).update(row).eq('id', id);
      if (error) {
        console.error(`Store: Supabase update ${collection}/${id} failed:`, error.message);
        this._showSyncError(error, 'update');
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
        this._showSyncError(error, 'delete');
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
      const row = this._normaliserEcriture(objToSnake(data));
      const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
      if (error) {
        console.error('Store: Supabase upsert settings failed:', error.message);
        this._showSyncError(error, 'settings');
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
      // App mono-entreprise : on remplace TOUTES les lignes de la table.
      // (L'ancien filtre .eq('user_id', ...) échouait — les tables fleet_*
      // n'ont pas de colonne user_id — et le set() ne synchronisait jamais.)
      const { error: delError } = await supabase
        .from(table)
        .delete()
        .not('id', 'is', null);

      if (delError) {
        console.error(`Store: Supabase bulk delete ${collection} failed:`, delError.message);
        this._showSyncError(delError, 'bulk-delete');
        return;
      }

      // Insert all new rows (if any)
      if (Array.isArray(items) && items.length > 0) {
        const rows = items.map(item => this._normaliserEcriture(objToSnake(item)));
        const { error: insError } = await supabase.from(table).insert(rows);
        if (insError) {
          console.error(`Store: Supabase bulk insert ${collection} failed:`, insError.message);
          this._showSyncError(insError, 'bulk-insert');
        }
      }
    } catch (e) {
      console.warn(`Store: Supabase bulk replace ${collection} failed (offline):`, e.message);
    }
  },

  /**
   * Show a toast notification for sync errors (if Toast is available).
   */
  /**
   * Un champ de formulaire vide vaut '' et non null. Envoye tel quel a une
   * colonne date ou numerique, PostgreSQL rejette la requete ENTIERE
   * (22007 : invalid input syntax for type date: ""), donc rien n'est
   * enregistre — alors que l'ecran annonce « modifie avec succes », le cache
   * local ayant deja ete mis a jour.
   * On convertit donc toute chaine vide en null avant l'ecriture : pour une
   * colonne texte, les deux ont le meme sens ; pour une date ou un nombre,
   * seul null est accepte.
   */
  _normaliserEcriture(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = (typeof v === 'string' && v.trim() === '') ? null : v;
    }
    return out;
  },

  _showSyncError(detail, contexte) {
    const msg = String((detail && detail.message) || detail || '');
    // Un message generique obligeait a fouiller la console pour savoir ce qui
    // avait echoue. On nomme la cause, en clair quand on sait la traduire.
    let lisible = 'Erreur de synchronisation avec le serveur';
    if (/PGRST204|schema cache|does not exist/i.test(msg)) {
      const champ = (msg.match(/'([a-z0-9_]+)' column/i) || msg.match(/column [\w.]*\.?([a-z0-9_]+)/i) || [])[1];
      lisible = champ
        ? `Champ inconnu en base : « ${champ} ». Rien n'a été enregistré.`
        : 'Un champ envoyé n\'existe pas en base. Rien n\'a été enregistré.';
    } else if (/row-level security|permission denied|42501/i.test(msg)) {
      lisible = 'Enregistrement refusé : droits insuffisants, ou session expirée. Reconnectez-vous.';
    } else if (/JWT|401|expired/i.test(msg)) {
      lisible = 'Session expirée. Reconnectez-vous pour enregistrer.';
    } else if (/duplicate key|23505/i.test(msg)) {
      lisible = 'Cet enregistrement existe déjà.';
    } else if (msg) {
      lisible = 'Enregistrement refusé : ' + msg.slice(0, 120);
    }
    console.error('[Sync]', contexte || '', msg);
    if (typeof Toast !== 'undefined') Toast.show(lisible, 'error');
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
      bonus: [],
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

  /**
   * CA réel par chauffeur sur une période (défaut 30 j), avec le nombre de
   * jours réellement travaillés — donne le CA moyen par jour, le chiffre qui
   * décide de la rentabilité d'un passage au salariat.
   */
  async getYangoCaReport(jours = 30, heures = 10) {
    try {
      return await this._yangoApi('ca-report', { query: `?jours=${jours}&heures=${heures}` });
    } catch (e) {
      console.warn('Store: getYangoCaReport error:', e.message);
      return { error: 'Non disponible', details: e.message };
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

  /**
   * Ecrit le CA Yango du jour dans fleet_ca_jour.
   * Sans cet appel, rien ne remplit la table : les chauffeurs verraient 0 F.
   */
  async synchroniserCaJour(date = null) {
    try {
      return await this._yangoApi('sync-ca', { query: date ? `?date=${encodeURIComponent(date)}` : '' });
    } catch (e) {
      console.warn('Store: synchroniserCaJour error:', e.message);
      return { error: 'Non disponible', details: e.message };
    }
  },

  /**
   * Declenchement automatique, limite a une fois par quart d'heure.
   * L'application admin etant ouverte dans la journee, elle sert de
   * declencheur : les chauffeurs voient leur progression avec un retard
   * maximum de 15 minutes, sans aucune infrastructure payante.
   * L'horodatage n'est enregistre QU'EN CAS DE SUCCES, pour qu'un echec
   * soit retente au chargement suivant au lieu d'attendre 15 minutes.
   */
  async synchroniserCaSiNecessaire(intervalleMinutes = 15) {
    const CLE = 'pilote_derniere_sync_ca';
    let dernier = 0;
    try { dernier = parseInt(localStorage.getItem(CLE) || '0', 10) || 0; } catch (e) {}
    const ecoule = Date.now() - dernier;
    if (ecoule < intervalleMinutes * 60 * 1000) {
      return { ignore: true, prochaineDansMinutes: Math.ceil((intervalleMinutes * 60 * 1000 - ecoule) / 60000) };
    }
    const r = await this.synchroniserCaJour(null);
    if (r && !r.error) {
      try { localStorage.setItem(CLE, String(Date.now())); } catch (e) {}
      console.log('[CA] Synchronisation Yango :', r.chauffeursMisAJour, 'chauffeur(s),', r.caTotal, 'FCFA');
    } else {
      console.warn('[CA] Synchronisation echouee, nouvel essai au prochain chargement :', r && r.error);
    }
    return r;
  },

  /**
   * Cree le compte d'acces d'un chauffeur, ou change son code PIN.
   * Passe par des fonctions SECURITY DEFINER reservees aux administrateurs :
   * une cle de service dans le code client donnerait les pleins pouvoirs a
   * quiconque lit le JavaScript.
   */
  async gererCompteChauffeur(chauffeurId, pin, existeDeja) {
    try {
      const fn = existeDeja ? 'fleet_reinitialiser_pin' : 'fleet_creer_compte_chauffeur';
      const { data, error } = await supabase.rpc(fn, { p_chauffeur_id: chauffeurId, p_pin: pin });
      if (error) return { success: false, error: error.message };
      if (data && data.success === false && data.motif === 'compte_existant') {
        return { success: false, error: 'Un compte existe deja pour ce numero — il a ete rattache a la fiche.' };
      }
      await this.rechargerCollection('chauffeurs');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /** Recharge une seule collection depuis la base, sans tout relire. */
  async rechargerCollection(col) {
    try {
      const { collection, data } = await this._fetchCollection(col, ['settings']);
      this._cache[collection] = data;
      this._backupToLocalStorage();
      this._notify();
      return data;
    } catch (e) {
      console.warn('Store: rechargerCollection', col, e.message);
      return null;
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
      const versements = this.get('versements') || [];
      const chauffeurs = this.get('chauffeurs') || [];
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
