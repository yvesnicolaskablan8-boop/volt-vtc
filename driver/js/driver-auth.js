/**
 * DriverAuth — Authentification telephone + PIN pour les chauffeurs
 */
const DriverAuth = {
  _TOKEN_KEY: 'volt_driver_token',
  _USER_KEY: 'volt_driver_user',
  _CHAUFFEUR_KEY: 'volt_driver_chauffeur',

  _apiBase: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api/driver/auth'
    : 'https://volt-vtc-production.up.railway.app/api/driver/auth',

  isLoggedIn() {
    return !!localStorage.getItem(this._TOKEN_KEY);
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

  async login(telephone, pin) {
    try {
      const res = await fetch(this._apiBase + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone, pin })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem(this._TOKEN_KEY, data.token);
        localStorage.setItem(this._USER_KEY, JSON.stringify(data.user));
        localStorage.setItem(this._CHAUFFEUR_KEY, JSON.stringify(data.chauffeur));
        return { success: true };
      }

      return { success: false, error: data.error || 'Erreur de connexion' };
    } catch (e) {
      return { success: false, error: 'Impossible de se connecter au serveur' };
    }
  },

  logout() {
    localStorage.removeItem(this._TOKEN_KEY);
    localStorage.removeItem(this._USER_KEY);
    localStorage.removeItem(this._CHAUFFEUR_KEY);
    // Show login screen
    if (typeof DriverApp !== 'undefined') {
      DriverApp.showLogin();
    }
  }
};
