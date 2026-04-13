/**
 * MonComptePage - Paramètres personnels accessibles à TOUS les utilisateurs
 * (notifications push, thème, mot de passe)
 */
const MonComptePage = {

  render() {
    const container = document.getElementById('page-content');
    const session = Auth.getSession() || {};
    container.innerHTML = this._template(session);
    this._bindEvents(session);
  },

  destroy() {},

  _template(session) {
    const theme = localStorage.getItem('pilote_theme') || 'dark';

    return `
      <div class="d-wrap"><div class="d-bg">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:14px;">
        <div>
          <div style="font-size:14px;color:#9ca3af;font-weight:500;">Mon espace</div>
          <div style="font-size:28px;font-weight:800;color:var(--text-primary);letter-spacing:-.6px;margin-top:2px;display:flex;align-items:center;gap:12px;">
            <iconify-icon icon="solar:user-circle-bold-duotone" style="color:#6366f1;"></iconify-icon> Mon compte
          </div>
        </div>
      </div>

      <!-- Profil -->
      <div class="d-card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
          <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:800;">
            ${(session.prenom || 'U').charAt(0)}${(session.nom || '').charAt(0)}
          </div>
          <div>
            <div style="font-size:18px;font-weight:800;color:var(--text-primary);">${session.prenom || ''} ${session.nom || ''}</div>
            <div style="font-size:13px;color:#9ca3af;margin-top:2px;">${session.email || ''}</div>
            <div style="margin-top:4px;">
              <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px;background:rgba(99,102,241,.1);color:#6366f1;">${session.role === 'admin' ? 'Administrateur' : session.role === 'manager' ? 'Manager' : session.role || 'Utilisateur'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Notifications Push -->
      <div class="d-card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(99,102,241,.1);display:flex;align-items:center;justify-content:center;color:#6366f1;font-size:16px;">
            <iconify-icon icon="solar:bell-bold-duotone"></iconify-icon>
          </div>
          <div style="font-size:16px;font-weight:700;color:var(--text-primary);">Notifications Push</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-radius:12px;background:var(--bg-secondary);border:1px solid var(--border-color);">
          <div>
            <div style="font-weight:600;font-size:13px;color:var(--text-primary);">Recevoir les notifications</div>
            <div id="push-status-info" style="font-size:11px;color:var(--text-muted);margin-top:2px;">Verification...</div>
          </div>
          <label class="mc-toggle">
            <input type="checkbox" id="mc-push-toggle">
            <span class="mc-toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- Theme -->
      <div class="d-card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(139,92,246,.1);display:flex;align-items:center;justify-content:center;color:#8b5cf6;font-size:16px;">
            <iconify-icon icon="solar:palette-bold-duotone"></iconify-icon>
          </div>
          <div style="font-size:16px;font-weight:700;color:var(--text-primary);">Apparence</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <label style="flex:1;min-width:100px;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;border:2px solid ${theme === 'dark' ? '#6366f1' : 'var(--border-color)'};cursor:pointer;transition:all .2s;background:var(--bg-secondary);">
            <input type="radio" name="mc-theme" value="dark" ${theme === 'dark' ? 'checked' : ''} style="accent-color:#6366f1;">
            <div>
              <iconify-icon icon="solar:moon-bold-duotone" style="font-size:18px;color:#8b5cf6;"></iconify-icon>
              <div style="font-size:12px;font-weight:600;margin-top:2px;">Sombre</div>
            </div>
          </label>
          <label style="flex:1;min-width:100px;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;border:2px solid ${theme === 'light' ? '#6366f1' : 'var(--border-color)'};cursor:pointer;transition:all .2s;background:var(--bg-secondary);">
            <input type="radio" name="mc-theme" value="light" ${theme === 'light' ? 'checked' : ''} style="accent-color:#6366f1;">
            <div>
              <iconify-icon icon="solar:sun-bold-duotone" style="font-size:18px;color:#f59e0b;"></iconify-icon>
              <div style="font-size:12px;font-weight:600;margin-top:2px;">Clair</div>
            </div>
          </label>
          <label style="flex:1;min-width:100px;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;border:2px solid ${theme === 'auto' ? '#6366f1' : 'var(--border-color)'};cursor:pointer;transition:all .2s;background:var(--bg-secondary);">
            <input type="radio" name="mc-theme" value="auto" ${theme === 'auto' ? 'checked' : ''} style="accent-color:#6366f1;">
            <div>
              <iconify-icon icon="solar:monitor-bold-duotone" style="font-size:18px;color:#3b82f6;"></iconify-icon>
              <div style="font-size:12px;font-weight:600;margin-top:2px;">Auto</div>
            </div>
          </label>
        </div>
      </div>

      <!-- Mot de passe -->
      <div class="d-card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(239,68,68,.1);display:flex;align-items:center;justify-content:center;color:#ef4444;font-size:16px;">
            <iconify-icon icon="solar:lock-bold-duotone"></iconify-icon>
          </div>
          <div style="font-size:16px;font-weight:700;color:var(--text-primary);">Changer le mot de passe</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Mot de passe actuel</label>
            <input type="password" id="mc-current-pwd" placeholder="••••••••" style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;box-sizing:border-box;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Nouveau mot de passe</label>
              <input type="password" id="mc-new-pwd" placeholder="••••••••" style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Confirmer</label>
              <input type="password" id="mc-confirm-pwd" placeholder="••••••••" style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;box-sizing:border-box;">
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button class="btn btn-primary" id="mc-change-pwd-btn" style="font-size:13px;">
              <iconify-icon icon="solar:lock-password-bold-duotone"></iconify-icon> Modifier le mot de passe
            </button>
          </div>
        </div>
      </div>

      <!-- Deconnexion -->
      <div class="d-card" style="border-color:rgba(239,68,68,.15);">
        <button class="btn" id="mc-logout-btn" style="width:100%;background:rgba(239,68,68,.08);color:#ef4444;border:1px solid rgba(239,68,68,.2);font-weight:700;font-size:14px;padding:12px;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:8px;">
          <iconify-icon icon="solar:logout-2-bold-duotone"></iconify-icon> Se deconnecter
        </button>
      </div>

      </div></div>

      <style>
        .mc-toggle { position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0; }
        .mc-toggle input { opacity:0;width:0;height:0; }
        .mc-toggle-slider { position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--bg-tertiary);border:1px solid var(--border-color);transition:0.3s;border-radius:24px; }
        .mc-toggle-slider::before { content:"";position:absolute;height:18px;width:18px;left:2px;bottom:2px;background:var(--text-muted);transition:0.3s;border-radius:50%; }
        .mc-toggle input:checked + .mc-toggle-slider { background:#6366f1;border-color:#6366f1; }
        .mc-toggle input:checked + .mc-toggle-slider::before { transform:translateX(20px);background:#fff; }
      </style>
    `;
  },

  _bindEvents(session) {
    // Push notifications
    this._initPushToggle();

    // Theme
    document.querySelectorAll('input[name="mc-theme"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const theme = radio.value;
        if (typeof ThemeManager !== 'undefined') {
          ThemeManager._applyTheme(theme, false);
          localStorage.setItem('pilote_theme', theme);
        } else {
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('pilote_theme', theme);
        }
        Toast.success('Theme applique');
      });
    });

    // Change password
    document.getElementById('mc-change-pwd-btn').addEventListener('click', () => this._changePassword(session));

    // Logout
    document.getElementById('mc-logout-btn').addEventListener('click', () => {
      if (confirm('Voulez-vous vous deconnecter ?')) {
        Auth.logout();
      }
    });
  },

  // =================== PUSH NOTIFICATIONS ===================

  async _initPushToggle() {
    const toggle = document.getElementById('mc-push-toggle');
    const statusEl = document.getElementById('push-status-info');
    if (!toggle || !statusEl) return;

    // Check browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toggle.disabled = true;
      statusEl.innerHTML = '<span style="color:var(--text-muted);">Non supporte par ce navigateur</span>';
      return;
    }

    // Check current permission & subscription state
    try {
      const perm = Notification.permission;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (perm === 'granted' && sub) {
        toggle.checked = true;
        statusEl.innerHTML = '<span style="color:#10b981;font-weight:500;">Actif — vous recevrez des notifications</span>';
      } else if (perm === 'denied') {
        toggle.disabled = true;
        statusEl.innerHTML = '<span style="color:#ef4444;">Bloque — autorisez dans les parametres du navigateur</span>';
      } else {
        toggle.checked = false;
        statusEl.innerHTML = '<span style="color:var(--text-muted);">Desactive — activez pour recevoir des alertes</span>';
      }
    } catch (e) {
      toggle.checked = false;
      statusEl.innerHTML = '<span style="color:var(--text-muted);">Impossible de verifier</span>';
    }

    // Handle toggle change
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        await this._enablePush(toggle, statusEl);
      } else {
        await this._disablePush(toggle, statusEl);
      }
    });
  },

  async _enablePush(toggle, statusEl) {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toggle.checked = false;
        statusEl.innerHTML = '<span style="color:#ef4444;">Permission refusee — autorisez dans les parametres du navigateur</span>';
        return;
      }

      statusEl.innerHTML = '<span style="color:var(--text-muted);">Activation en cours...</span>';

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        try {
          const apiBase = Store._apiBase || '/api';
          const token = Auth.getToken();
          const vapidRes = await fetch(apiBase + '/notifications/push/vapid-key', {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (!vapidRes.ok) throw new Error('Impossible de recuperer la cle VAPID');
          const { publicKey } = await vapidRes.json();
          if (!publicKey) throw new Error('Cle VAPID manquante');

          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: App._urlBase64ToUint8Array(publicKey)
          });

          await fetch(apiBase + '/notifications/push/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ subscription: sub.toJSON() })
          });
        } catch (pushErr) {
          console.warn('Push notifications not available:', pushErr.message);
          toggle.checked = false;
          statusEl.textContent = 'Notifications push non disponibles';
          Toast.error('Notifications push non disponibles actuellement');
          return;
        }
      }

      statusEl.textContent = 'Actif — vous recevrez des notifications';
      statusEl.style.color = '#10b981';
      statusEl.style.fontWeight = '500';
      Toast.success('Notifications push activees');
    } catch (e) {
      toggle.checked = false;
      statusEl.textContent = 'Erreur : ' + (e.message || 'echec');
      statusEl.style.color = '#ef4444';
      Toast.error('Impossible d\'activer les notifications');
    }
  },

  async _disablePush(toggle, statusEl) {
    try {
      statusEl.innerHTML = '<span style="color:var(--text-muted);">Desactivation...</span>';
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        await sub.unsubscribe();
        try {
          const apiBase = Store._apiBase || '/api';
          const token = Auth.getToken();
          await fetch(apiBase + '/notifications/push/subscribe', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ endpoint: sub.endpoint })
          });
        } catch (pushErr) {
          console.warn('Push unsubscribe server call not available:', pushErr.message);
        }
      }

      statusEl.innerHTML = '<span style="color:var(--text-muted);">Desactive</span>';
      Toast.success('Notifications desactivees');
    } catch (e) {
      toggle.checked = true;
      statusEl.innerHTML = '<span style="color:#ef4444;">Erreur lors de la desactivation</span>';
    }
  },

  // =================== CHANGE PASSWORD ===================

  async _changePassword(session) {
    const current = document.getElementById('mc-current-pwd').value;
    const newPwd = document.getElementById('mc-new-pwd').value;
    const confirm = document.getElementById('mc-confirm-pwd').value;

    if (!current || !newPwd) {
      Toast.error('Remplissez tous les champs');
      return;
    }
    if (newPwd.length < 4) {
      Toast.error('Le mot de passe doit faire au moins 4 caracteres');
      return;
    }
    if (newPwd !== confirm) {
      Toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    try {
      // Verify current password via Supabase Auth
      const email = session.email;
      if (!email) {
        Toast.error('Email de session introuvable');
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: current
      });
      if (signInError) {
        Toast.error('Mot de passe actuel incorrect');
        return;
      }

      // Set new password via Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPwd
      });
      if (updateError) {
        Toast.error(updateError.message || 'Erreur lors du changement');
        return;
      }

      Toast.success('Mot de passe modifie avec succes');
      document.getElementById('mc-current-pwd').value = '';
      document.getElementById('mc-new-pwd').value = '';
      document.getElementById('mc-confirm-pwd').value = '';
    } catch (e) {
      Toast.error('Erreur de connexion');
    }
  }
};
