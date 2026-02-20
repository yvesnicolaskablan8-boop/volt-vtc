/**
 * Store - LocalStorage abstraction for Volt data persistence
 */
const Store = {
  _KEY: 'volt_data',

  getAll() {
    try {
      const data = localStorage.getItem(this._KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Store.getAll error:', e);
      return null;
    }
  },

  _saveAll(data) {
    try {
      localStorage.setItem(this._KEY, JSON.stringify(data));
      document.dispatchEvent(new CustomEvent('volt:data-changed'));
    } catch (e) {
      console.error('Store._saveAll error:', e);
      if (e.name === 'QuotaExceededError') {
        Toast.show('Espace de stockage insuffisant', 'error');
      }
    }
  },

  get(collection) {
    const data = this.getAll();
    return data ? (data[collection] || []) : [];
  },

  set(collection, items) {
    const data = this.getAll() || {};
    data[collection] = items;
    this._saveAll(data);
  },

  findById(collection, id) {
    const items = this.get(collection);
    return items.find(item => item.id === id) || null;
  },

  add(collection, item) {
    const data = this.getAll() || {};
    if (!data[collection]) data[collection] = [];
    data[collection].push(item);
    this._saveAll(data);
    return item;
  },

  update(collection, id, updates) {
    const data = this.getAll() || {};
    const items = data[collection] || [];
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updates };
    data[collection] = items;
    this._saveAll(data);
    return items[index];
  },

  delete(collection, id) {
    const data = this.getAll() || {};
    const items = data[collection] || [];
    data[collection] = items.filter(item => item.id !== id);
    this._saveAll(data);
  },

  query(collection, filterFn) {
    const items = this.get(collection);
    return items.filter(filterFn);
  },

  count(collection, filterFn) {
    if (filterFn) {
      return this.query(collection, filterFn).length;
    }
    return this.get(collection).length;
  },

  isInitialized() {
    return this.getAll() !== null;
  },

  reset() {
    localStorage.removeItem(this._KEY);
    if (typeof DemoData !== 'undefined') {
      DemoData.generate();
    }
  },

  getStorageSize() {
    const data = localStorage.getItem(this._KEY) || '';
    const bytes = new Blob([data]).size;
    return {
      bytes,
      kb: Math.round(bytes / 1024),
      mb: (bytes / (1024 * 1024)).toFixed(2)
    };
  }
};
