/**
 * DriverAuth — Authentification chauffeur via Supabase
 * Utilise le pattern telephone → email (comme pilote.tech)
 */
const DriverAuth = {
  _TOKEN_KEY: 'pilote_driver_token',
  _USER_KEY: 'pilote_driver_user',
  _CHAUFFEUR_KEY: 'pilote_driver_chauffeur',

  _phoneToEmail(phone) {
    const digits = phone.replace(/\D/g, '');
    return `driver_${digits}@pilote.tech`;
  },

  isLoggedIn() {
    return !!localStorage.getItem(this._CHAUFFEUR_KEY);
  },

  getToken() {
    return localStorage.getItem(this._TOKEN_KEY);
  },

  getChauffeur() {
    try {
      return JSON.parse(localStorage.getItem(this._CHAUFFEUR_KEY));
    } catch {
      return null;
    }
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(this._USER_KEY));
    } catch {
      return null;
    }
  },

  getChauffeurId() {
    const ch = this.getChauffeur();
    return ch ? ch.id : null;
  },

  async login(telephone, pin) {
    try {
      const email = this._phoneToEmail(telephone);

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: pin
      });

      if (authError) {
        // Try lookup by telephone to give better error message
        const { data: chauffeur } = await supabase
          .from('fleet_chauffeurs')
          .select('id, prenom, nom')
          .eq('telephone', telephone)
          .single();

        if (!chauffeur) {
          return { success: false, error: 'Numero non reconnu' };
        }
        return { success: false, error: 'PIN incorrect' };
      }

      // Find chauffeur by auth_id
      let { data: chauffeur } = await supabase
        .from('fleet_chauffeurs')
        .select('*')
        .eq('auth_id', authData.user.id)
        .single();

      if (!chauffeur) {
        // Try by telephone
        const { data: chByPhone } = await supabase
          .from('fleet_chauffeurs')
          .select('*')
          .eq('telephone', telephone)
          .single();

        if (chByPhone) {
          // Link auth_id
          await supabase.from('fleet_chauffeurs').update({ auth_id: authData.user.id }).eq('id', chByPhone.id);
          chauffeur = chByPhone;
        } else {
          await supabase.auth.signOut();
          return { success: false, error: 'Profil chauffeur non trouve' };
        }
      }

      const ch = objToCamel(chauffeur);
      localStorage.setItem(this._TOKEN_KEY, authData.session.access_token);
      localStorage.setItem(this._CHAUFFEUR_KEY, JSON.stringify(ch));
      localStorage.setItem(this._USER_KEY, JSON.stringify({ id: authData.user.id, email }));
      return { success: true, chauffeur: ch };
    } catch (e) {
      console.error('DriverAuth login error:', e);
      return { success: false, error: 'Impossible de se connecter' };
    }
  },

  async checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const chauffeur = this.getChauffeur();
    if (chauffeur) return true;

    // Try to reload chauffeur from Supabase
    const { data } = await supabase
      .from('fleet_chauffeurs')
      .select('*')
      .eq('auth_id', session.user.id)
      .single();

    if (data) {
      localStorage.setItem(this._CHAUFFEUR_KEY, JSON.stringify(objToCamel(data)));
      return true;
    }

    return false;
  },

  logout() {
    localStorage.removeItem(this._TOKEN_KEY);
    localStorage.removeItem(this._USER_KEY);
    localStorage.removeItem(this._CHAUFFEUR_KEY);
    supabase.auth.signOut();
    if (typeof DriverApp !== 'undefined') {
      DriverApp.showLogin();
    }
  }
};
