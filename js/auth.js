/**
 * Auth - Authentication via API, JWT tokens & permissions
 */
const Auth = {
  _SESSION_KEY: 'volt_session',
  _TOKEN_KEY: 'volt_token',

  // =================== TOKEN MANAGEMENT ===================

  getToken() {
    return localStorage.getItem(this._TOKEN_KEY);
  },

  setToken(token) {
    localStorage.setItem(this._TOKEN_KEY, token);
  },

  removeToken() {
    localStorage.removeItem(this._TOKEN_KEY);
  },

  // =================== SESSION ===================

  createSession(user) {
    const session = {
      userId: user.id,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      loginTime: new Date().toISOString()
    };
    sessionStorage.setItem(this._SESSION_KEY, JSON.stringify(session));
    return session;
  },

  getSession() {
    try {
      const data = sessionStorage.getItem(this._SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  destroySession() {
    sessionStorage.removeItem(this._SESSION_KEY);
    this.removeToken();
  },

  isLoggedIn() {
    return this.getSession() !== null && this.getToken() !== null;
  },

  getCurrentUser() {
    const session = this.getSession();
    if (!session) return null;
    return Store.findById('users', session.userId);
  },

  refreshSession() {
    const session = this.getSession();
    if (!session) return;
    const user = Store.findById('users', session.userId);
    if (user) {
      session.permissions = user.permissions;
      session.role = user.role;
      session.prenom = user.prenom;
      session.nom = user.nom;
      sessionStorage.setItem(this._SESSION_KEY, JSON.stringify(session));
    }
  },

  // =================== PERMISSIONS ===================

  hasPermission(permissionKey) {
    const session = this.getSession();
    if (!session || !session.permissions) return false;
    return session.permissions[permissionKey] === true;
  },

  getPermissionForRoute(route) {
    const map = {
      '/dashboard': 'dashboard',
      '/chauffeurs': 'chauffeurs',
      '/vehicules': 'vehicules',
      '/planning': 'planning',
      '/versements': 'versements',
      '/rentabilite': 'rentabilite',
      '/comptabilite': 'comptabilite',
      '/gps-conduite': 'gps_conduite',
      '/alertes': 'alertes',
      '/rapports': 'rapports',
      '/parametres': 'parametres'
    };
    const baseRoute = '/' + route.split('/').filter(Boolean)[0];
    return map[baseRoute] || null;
  },

  canAccessRoute(route) {
    const perm = this.getPermissionForRoute(route);
    if (!perm) return true;
    return this.hasPermission(perm);
  },

  // =================== LOGIN (via API) ===================

  async login(email, password) {
    const apiBase = Store._apiBase || (window.location.hostname === 'localhost'
      ? 'http://localhost:3001/api'
      : '/api');

    try {
      const res = await fetch(apiBase + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (data.success) {
        // Store JWT token
        this.setToken(data.token);
        // Create local session for quick access
        const session = this.createSession(data.user);
        return { success: true, session, user: data.user };
      }

      // Handle special cases (first_login, must_change_password)
      if (data.error === 'first_login' || data.error === 'must_change_password') {
        return { success: false, error: data.error, user: data.user };
      }

      return { success: false, error: data.error || 'unknown_error' };
    } catch (err) {
      console.error('Auth.login network error:', err);
      return { success: false, error: 'network_error' };
    }
  },

  // =================== PASSWORD MANAGEMENT (via API) ===================

  async setPassword(userId, newPassword) {
    const apiBase = Store._apiBase || '/api';
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(apiBase + '/auth/set-password', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, password: newPassword, temporary: false })
    });
    const data = await res.json();

    // Store token if provided (auto-login after first password set)
    if (data.token) {
      this.setToken(data.token);
    }

    // Update user in local cache
    Store.update('users', userId, { mustChangePassword: false });
    return data;
  },

  async setTemporaryPassword(userId, tempPassword) {
    const apiBase = Store._apiBase || '/api';
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(apiBase + '/auth/set-password', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, password: tempPassword, temporary: true })
    });
    const data = await res.json();

    // Update user in local cache
    Store.update('users', userId, { mustChangePassword: true });
    return data;
  },

  // Keep hashPassword for backward compatibility (used in parametres.js _addUser)
  // In API mode, password hashing is done server-side
  async hashPassword(password) {
    return '[server-side]';
  }
};
