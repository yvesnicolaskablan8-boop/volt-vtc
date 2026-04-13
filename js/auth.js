/**
 * Auth - Supabase Authentication, sessions & permissions
 * Uses the global `supabase` client from supabase-config.js
 */
const Auth = {
  _SESSION_KEY: 'pilote_session',
  _TOKEN_KEY: 'pilote_token',

  // =================== TOKEN MANAGEMENT (backward compat) ===================

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
    localStorage.setItem(this._SESSION_KEY, JSON.stringify(session));
    return session;
  },

  getSession() {
    try {
      const data = localStorage.getItem(this._SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  async destroySession() {
    localStorage.removeItem(this._SESSION_KEY);
    this.removeToken();
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Auth.destroySession: signOut error', e);
    }
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
      localStorage.setItem(this._SESSION_KEY, JSON.stringify(session));
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
      '/yango': 'dashboard',
      '/chauffeurs': 'chauffeurs',
      '/motivation': 'chauffeurs',
      '/messagerie': 'chauffeurs',
      '/vehicules': 'vehicules',
      '/garage': 'vehicules',
      '/taches': 'chauffeurs',
      '/planning': 'planning',
      '/versements': 'versements',
      '/contraventions': 'contraventions',
      '/depenses': 'depenses',
      '/rentabilite': 'rentabilite',
      '/comptabilite': 'comptabilite',
      '/gps-conduite': 'gps_conduite',
      '/alertes': 'alertes',
      '/rapports': 'rapports',
      '/activite': 'parametres',
      '/notifications-admin': 'parametres',
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

  // =================== CHECK AUTH (Supabase session → fleet_users) ===================

  async checkAuth() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        return { authenticated: false, user: null };
      }

      const authId = session.user.id;

      const { data: fleetUser, error: lookupErr } = await supabase
        .from('fleet_users')
        .select('*')
        .eq('auth_id', authId)
        .single();

      if (lookupErr || !fleetUser) {
        return { authenticated: true, user: null, authUser: session.user };
      }

      const user = objToCamel(fleetUser);

      // Refresh local session & token
      this.setToken(session.access_token);
      this.createSession(user);

      return { authenticated: true, user, session };
    } catch (e) {
      console.error('Auth.checkAuth error:', e);
      return { authenticated: false, user: null };
    }
  },

  // =================== LOGIN (Supabase Auth) ===================

  async login(email, password) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        return { success: false, error: authError.message || 'invalid_credentials' };
      }

      const authId = authData.user.id;
      const accessToken = authData.session.access_token;

      // Store the Supabase access token for backward compatibility
      this.setToken(accessToken);

      // Look up the fleet_users entry
      let { data: fleetUser, error: lookupErr } = await supabase
        .from('fleet_users')
        .select('*')
        .eq('auth_id', authId)
        .single();

      // If no fleet_users entry, check if this is the very first user (auto-admin)
      if (lookupErr || !fleetUser) {
        const { count, error: countErr } = await supabase
          .from('fleet_users')
          .select('*', { count: 'exact', head: true });

        if (!countErr && count === 0) {
          // Auto-create admin with all permissions
          const allPermissions = {
            dashboard: true,
            chauffeurs: true,
            vehicules: true,
            planning: true,
            versements: true,
            contraventions: true,
            depenses: true,
            rentabilite: true,
            comptabilite: true,
            gps_conduite: true,
            alertes: true,
            rapports: true,
            parametres: true
          };

          const newUser = {
            auth_id: authId,
            email: authData.user.email,
            prenom: 'Admin',
            nom: '',
            role: 'admin',
            permissions: allPermissions,
            must_change_password: false,
            created_at: new Date().toISOString()
          };

          const { data: inserted, error: insertErr } = await supabase
            .from('fleet_users')
            .insert(newUser)
            .select()
            .single();

          if (insertErr) {
            console.error('Auth.login: auto-admin creation failed', insertErr);
            return { success: false, error: 'user_creation_failed' };
          }

          fleetUser = inserted;
        } else {
          // Not the first user and no fleet_users entry: unauthorized
          return { success: false, error: 'no_fleet_user' };
        }
      }

      const user = objToCamel(fleetUser);

      // Handle must_change_password / first_login
      if (user.mustChangePassword) {
        return { success: false, error: 'must_change_password', user };
      }

      // Create local session
      const session = this.createSession(user);
      return { success: true, session, user };

    } catch (err) {
      console.error('Auth.login error:', err);
      return { success: false, error: 'network_error', detail: err.message || String(err) };
    }
  },

  // =================== REGISTER (Supabase Auth) ===================

  async register({ entrepriseNom, prenom, nom, email, password, telephone }) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password
      });

      if (authError) {
        return { success: false, error: authError.message || 'registration_failed' };
      }

      const authId = authData.user.id;

      // All permissions for the first registrant (owner)
      const allPermissions = {
        dashboard: true,
        chauffeurs: true,
        vehicules: true,
        planning: true,
        versements: true,
        contraventions: true,
        depenses: true,
        rentabilite: true,
        comptabilite: true,
        gps_conduite: true,
        alertes: true,
        rapports: true,
        parametres: true
      };

      const newUser = {
        auth_id: authId,
        email,
        prenom: prenom || '',
        nom: nom || '',
        telephone: telephone || null,
        role: 'admin',
        permissions: allPermissions,
        must_change_password: false,
        created_at: new Date().toISOString()
      };

      const { data: fleetUser, error: insertErr } = await supabase
        .from('fleet_users')
        .insert(newUser)
        .select()
        .single();

      if (insertErr) {
        console.error('Auth.register: fleet_users insert failed', insertErr);
        return { success: false, error: 'user_creation_failed', detail: insertErr.message || String(insertErr) };
      }

      const user = objToCamel(fleetUser);

      // If Supabase returned a session (email confirmation disabled), log in
      if (authData.session) {
        this.setToken(authData.session.access_token);
        const session = this.createSession(user);
        return { success: true, session, user };
      }

      // Email confirmation required — no session yet
      return { success: true, user, confirmationRequired: true };

    } catch (err) {
      console.error('Auth.register error:', err);
      return { success: false, error: 'network_error', detail: err.message || String(err) };
    }
  },

  // =================== PASSWORD MANAGEMENT ===================

  async setPassword(userId, newPassword) {
    try {
      // Update password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (authError) {
        return { success: false, error: authError.message || 'password_update_failed' };
      }

      // Clear must_change_password flag in fleet_users
      const { error: updateErr } = await supabase
        .from('fleet_users')
        .update({ must_change_password: false })
        .eq('id', userId);

      if (updateErr) {
        console.warn('Auth.setPassword: fleet_users update warning', updateErr);
      }

      // Update local store cache
      Store.update('users', userId, { mustChangePassword: false });

      // Refresh token after password change
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        this.setToken(session.access_token);
      }

      return { success: true };
    } catch (err) {
      console.error('Auth.setPassword error:', err);
      return { success: false, error: 'network_error' };
    }
  },

  async setTemporaryPassword(userId, tempPassword) {
    // NOTE: Setting another user's password requires the Supabase Admin API
    // (supabase.auth.admin.updateUserById), which must run server-side with
    // the service_role key. Call a Supabase Edge Function or server endpoint
    // to handle this securely.
    console.warn(
      'Auth.setTemporaryPassword: requires server-side admin function. ' +
      'Implement via Supabase Edge Function using auth.admin.updateUserById().'
    );

    // Mark the user as must_change_password in fleet_users
    const { error } = await supabase
      .from('fleet_users')
      .update({ must_change_password: true })
      .eq('id', userId);

    if (error) {
      console.error('Auth.setTemporaryPassword: fleet_users update failed', error);
      return { success: false, error: 'update_failed' };
    }

    Store.update('users', userId, { mustChangePassword: true });

    return {
      success: false,
      error: 'requires_server_admin',
      message: 'Password change requires a server-side admin function. The must_change_password flag has been set.'
    };
  },

  // Kept for backward compatibility — password hashing is handled by Supabase
  async hashPassword(password) {
    return '[supabase-managed]';
  }
};
