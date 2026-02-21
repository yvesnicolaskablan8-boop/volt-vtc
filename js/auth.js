/**
 * Auth - Authentication, sessions & permissions
 */
const Auth = {
  _SESSION_KEY: 'volt_session',
  _HASH_SALT: 'volt_vtc_2024',

  // =================== PASSWORD HASHING ===================

  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(this._HASH_SALT + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async verifyPassword(password, hash) {
    const computed = await this.hashPassword(password);
    return computed === hash;
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
    Store.update('users', user.id, { dernierConnexion: new Date().toISOString() });
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
  },

  isLoggedIn() {
    return this.getSession() !== null;
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

  // =================== LOGIN ===================

  async login(email, password) {
    const users = Store.get('users') || [];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return { success: false, error: 'user_not_found' };
    }
    if (user.statut !== 'actif') {
      return { success: false, error: 'account_disabled' };
    }

    // User has no password yet (migration / first login)
    if (!user.passwordHash) {
      return { success: false, error: 'first_login', user };
    }

    const valid = await this.verifyPassword(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: 'invalid_password' };
    }

    // Temporary password — must change
    if (user.mustChangePassword) {
      return { success: false, error: 'must_change_password', user };
    }

    const session = this.createSession(user);
    return { success: true, session, user };
  },

  // =================== PASSWORD MANAGEMENT ===================

  async setPassword(userId, newPassword) {
    const hash = await this.hashPassword(newPassword);
    Store.update('users', userId, { passwordHash: hash, mustChangePassword: false });
  },

  async setTemporaryPassword(userId, tempPassword) {
    const hash = await this.hashPassword(tempPassword);
    Store.update('users', userId, { passwordHash: hash, mustChangePassword: true });
  }
};
