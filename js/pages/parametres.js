/**
 * ParametresPage - Paramètres de l'application
 *
 * Onglets :
 * 1. Utilisateurs — CRUD avec permissions page par page
 * 2. Entreprise — Infos société (nom, email, adresse…)
 * 3. Préférences — Thème, langue, notifications…
 */
const ParametresPage = {
  _currentTab: 'account',

  // =================== MODULES MAP ===================
  _modules: [
    { key: 'dashboard', label: 'Tableau de bord', icon: 'fa-gauge-high' },
    { key: 'chauffeurs', label: 'Chauffeurs', icon: 'fa-id-card' },
    { key: 'vehicules', label: 'Véhicules', icon: 'fa-car' },
    { key: 'planning', label: 'Planning', icon: 'fa-calendar-alt' },
    { key: 'versements', label: 'Versements', icon: 'fa-money-bill-transfer' },
    { key: 'rentabilite', label: 'Rentabilité', icon: 'fa-chart-pie' },
    { key: 'comptabilite', label: 'Comptabilité', icon: 'fa-calculator' },
    { key: 'gps_conduite', label: 'GPS & Conduite', icon: 'fa-satellite-dish' },
    { key: 'alertes', label: 'Alertes', icon: 'fa-bell' },
    { key: 'rapports', label: 'Rapports', icon: 'fa-file-export' },
    { key: 'parametres', label: 'Paramètres', icon: 'fa-cog' }
  ],

  // =================== ROLE TEMPLATES ===================
  _roleTemplates: {
    'Administrateur': { dashboard: true, chauffeurs: true, vehicules: true, planning: true, versements: true, rentabilite: true, comptabilite: true, gps_conduite: true, alertes: true, rapports: true, parametres: true },
    'Manager': { dashboard: true, chauffeurs: true, vehicules: true, planning: true, versements: true, rentabilite: true, comptabilite: true, gps_conduite: true, alertes: true, rapports: true, parametres: false },
    'Opérateur': { dashboard: true, chauffeurs: true, vehicules: true, planning: true, versements: false, rentabilite: false, comptabilite: false, gps_conduite: false, alertes: false, rapports: false, parametres: false },
    'Comptable': { dashboard: true, chauffeurs: false, vehicules: false, planning: false, versements: true, rentabilite: true, comptabilite: true, gps_conduite: false, alertes: false, rapports: true, parametres: false },
    'Superviseur': { dashboard: true, chauffeurs: false, vehicules: false, planning: false, versements: false, rentabilite: false, comptabilite: false, gps_conduite: true, alertes: true, rapports: true, parametres: false }
  },

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._renderTab(this._currentTab);
  },

  destroy() {
    // Nothing to clean up
  },

  _template() {
    return `
      <div class="page-header">
        <h1><i class="fas fa-cog"></i> Paramètres</h1>
      </div>

      <div class="tabs" id="settings-tabs">
        <div class="tab active" data-tab="account"><i class="fas fa-user-circle"></i> Mon compte</div>
        <div class="tab" data-tab="users"><i class="fas fa-users-cog"></i> Utilisateurs</div>
        <div class="tab" data-tab="entreprise"><i class="fas fa-building"></i> Entreprise</div>
        <div class="tab" data-tab="preferences"><i class="fas fa-sliders-h"></i> Préférences</div>
      </div>

      <div id="settings-content"></div>
    `;
  },

  _bindEvents() {
    document.querySelectorAll('#settings-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#settings-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._currentTab = tab.dataset.tab;
        this._renderTab(this._currentTab);
      });
    });
  },

  _renderTab(tab) {
    const ct = document.getElementById('settings-content');
    switch (tab) {
      case 'account': ct.innerHTML = this._renderAccount(); this._bindAccountEvents(); break;
      case 'users': ct.innerHTML = this._renderUsers(); this._bindUsersEvents(); break;
      case 'entreprise': ct.innerHTML = this._renderEntreprise(); this._bindEntrepriseEvents(); break;
      case 'preferences': ct.innerHTML = this._renderPreferences(); this._bindPreferencesEvents(); break;
    }
  },

  // ========================= ONGLET MON COMPTE =========================

  _renderAccount() {
    const session = Auth.getSession();
    if (!session) return '<div class="card"><p>Vous devez être connecté.</p></div>';
    const user = Store.findById('users', session.id) || session;

    return `
      <div class="grid-2" style="gap:var(--space-lg);">
        <!-- Profil -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-user-circle"></i> Mon profil</span>
          </div>
          <div style="padding-top:var(--space-md);">
            <div style="display:flex;align-items:center;gap:var(--space-lg);margin-bottom:var(--space-lg);padding-bottom:var(--space-lg);border-bottom:1px solid var(--border-color);">
              <div style="width:72px;height:72px;border-radius:50%;background:${Utils.getAvatarColor(user.id)};display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;flex-shrink:0;">
                ${Utils.getInitials(user.prenom, user.nom)}
              </div>
              <div>
                <div style="font-size:var(--font-size-lg);font-weight:700;">${user.prenom} ${user.nom}</div>
                <div style="font-size:var(--font-size-sm);color:var(--text-muted);">${user.email}</div>
                <span class="badge badge-info" style="margin-top:6px;">${user.role}</span>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:var(--space-md);">
              <div class="grid-2" style="gap:var(--space-md);">
                <div class="form-group">
                  <label class="form-label">Prénom</label>
                  <input type="text" class="form-control" id="account-prenom" value="${user.prenom || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">Nom</label>
                  <input type="text" class="form-control" id="account-nom" value="${user.nom || ''}">
                </div>
              </div>
              <div class="grid-2" style="gap:var(--space-md);">
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" id="account-email" value="${user.email || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">Téléphone</label>
                  <input type="tel" class="form-control" id="account-telephone" value="${user.telephone || ''}">
                </div>
              </div>
              <div style="display:flex;justify-content:flex-end;">
                <button class="btn btn-primary" id="btn-save-profile"><i class="fas fa-save"></i> Sauvegarder le profil</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Mot de passe + Infos -->
        <div>
          <!-- Changer mot de passe -->
          <div class="card" style="margin-bottom:var(--space-lg);">
            <div class="card-header">
              <span class="card-title"><i class="fas fa-key"></i> Modifier le mot de passe</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Mot de passe actuel</label>
                <div style="position:relative;">
                  <input type="password" class="form-control" id="pwd-current" placeholder="Entrez votre mot de passe actuel" style="padding-right:40px;">
                  <button type="button" class="btn-toggle-pwd" data-target="pwd-current" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;">
                    <i class="fas fa-eye"></i>
                  </button>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Nouveau mot de passe</label>
                <div style="position:relative;">
                  <input type="password" class="form-control" id="pwd-new" placeholder="Minimum 6 caractères" style="padding-right:40px;">
                  <button type="button" class="btn-toggle-pwd" data-target="pwd-new" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;">
                    <i class="fas fa-eye"></i>
                  </button>
                </div>
                <div id="pwd-strength" style="margin-top:6px;"></div>
              </div>
              <div class="form-group">
                <label class="form-label">Confirmer le nouveau mot de passe</label>
                <div style="position:relative;">
                  <input type="password" class="form-control" id="pwd-confirm" placeholder="Retapez le nouveau mot de passe" style="padding-right:40px;">
                  <button type="button" class="btn-toggle-pwd" data-target="pwd-confirm" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;">
                    <i class="fas fa-eye"></i>
                  </button>
                </div>
              </div>
              <div style="display:flex;justify-content:flex-end;">
                <button class="btn btn-primary" id="btn-change-pwd"><i class="fas fa-lock"></i> Modifier le mot de passe</button>
              </div>
            </div>
          </div>

          <!-- Infos session -->
          <div class="card" style="border-left:4px solid var(--volt-blue);">
            <div class="card-header">
              <span class="card-title"><i class="fas fa-info-circle"></i> Informations de session</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-sm);padding-top:var(--space-md);font-size:var(--font-size-sm);">
              <div style="display:flex;justify-content:space-between;padding:6px 0;">
                <span style="color:var(--text-muted);">Identifiant</span>
                <span style="font-weight:500;font-family:monospace;">${user.id}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border-color);">
                <span style="color:var(--text-muted);">Rôle</span>
                <span class="badge badge-info">${user.role}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border-color);">
                <span style="color:var(--text-muted);">Statut</span>
                <span class="badge badge-success"><i class="fas fa-circle" style="font-size:6px;margin-right:4px;"></i>Actif</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border-color);">
                <span style="color:var(--text-muted);">Dernière connexion</span>
                <span>${user.dernierConnexion ? Utils.timeAgo(user.dernierConnexion) : '-'}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border-color);">
                <span style="color:var(--text-muted);">Modules accessibles</span>
                <span style="font-weight:500;">${user.permissions ? Object.values(user.permissions).filter(Boolean).length : 0} / ${this._modules.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _bindAccountEvents() {
    const session = Auth.getSession();
    if (!session) return;

    // Toggle password visibility
    document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) {
          const isPassword = target.type === 'password';
          target.type = isPassword ? 'text' : 'password';
          btn.innerHTML = `<i class="fas fa-eye${isPassword ? '-slash' : ''}"></i>`;
        }
      });
    });

    // Password strength indicator
    const pwdNew = document.getElementById('pwd-new');
    if (pwdNew) {
      pwdNew.addEventListener('input', () => {
        const pwd = pwdNew.value;
        const strengthDiv = document.getElementById('pwd-strength');
        if (!pwd) { strengthDiv.innerHTML = ''; return; }

        let score = 0;
        if (pwd.length >= 6) score++;
        if (pwd.length >= 10) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;

        const levels = [
          { label: 'Très faible', color: '#ef4444', width: '20%' },
          { label: 'Faible', color: '#f97316', width: '40%' },
          { label: 'Moyen', color: '#eab308', width: '60%' },
          { label: 'Fort', color: '#22c55e', width: '80%' },
          { label: 'Très fort', color: '#10b981', width: '100%' }
        ];
        const level = levels[Math.min(score, 4)];

        strengthDiv.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:4px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;">
              <div style="width:${level.width};height:100%;background:${level.color};border-radius:4px;transition:all 0.3s;"></div>
            </div>
            <span style="font-size:11px;color:${level.color};font-weight:500;white-space:nowrap;">${level.label}</span>
          </div>
        `;
      });
    }

    // Save profile
    document.getElementById('btn-save-profile').addEventListener('click', () => {
      const prenom = document.getElementById('account-prenom').value.trim();
      const nom = document.getElementById('account-nom').value.trim();
      const email = document.getElementById('account-email').value.trim();
      const telephone = document.getElementById('account-telephone').value.trim();

      if (!prenom || !nom) {
        Toast.error('Le prénom et le nom sont obligatoires');
        return;
      }
      if (email && !email.includes('@')) {
        Toast.error('Veuillez entrer un email valide');
        return;
      }

      Store.update('users', session.id, { prenom, nom, email, telephone });
      Auth.refreshSession();
      Toast.success('Profil mis à jour');
      this._renderTab('account');
    });

    // Change password
    document.getElementById('btn-change-pwd').addEventListener('click', async () => {
      const current = document.getElementById('pwd-current').value;
      const newPwd = document.getElementById('pwd-new').value;
      const confirm = document.getElementById('pwd-confirm').value;

      if (!current) {
        Toast.error('Veuillez entrer votre mot de passe actuel');
        return;
      }
      if (!newPwd || newPwd.length < 6) {
        Toast.error('Le nouveau mot de passe doit contenir au moins 6 caractères');
        return;
      }
      if (newPwd !== confirm) {
        Toast.error('Les mots de passe ne correspondent pas');
        return;
      }
      if (current === newPwd) {
        Toast.error('Le nouveau mot de passe doit être différent de l\'actuel');
        return;
      }

      try {
        // Verify current password by attempting login
        const apiBase = Store._apiBase || '/api';
        const user = Store.findById('users', session.id);
        const verifyRes = await fetch(apiBase + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, password: current })
        });
        const verifyData = await verifyRes.json();

        if (!verifyData.success) {
          Toast.error('Mot de passe actuel incorrect');
          return;
        }

        // Set new password (not temporary — user chose it themselves)
        const result = await Auth.setPassword(session.id, newPwd);
        if (result.success) {
          Toast.success('Mot de passe modifié avec succès');
          document.getElementById('pwd-current').value = '';
          document.getElementById('pwd-new').value = '';
          document.getElementById('pwd-confirm').value = '';
          document.getElementById('pwd-strength').innerHTML = '';
        } else {
          Toast.error('Erreur lors de la modification du mot de passe');
        }
      } catch (err) {
        console.error('Password change error:', err);
        Toast.error('Erreur réseau — veuillez réessayer');
      }
    });
  },

  // ========================= ONGLET UTILISATEURS =========================

  _renderUsers() {
    const users = Store.get('users') || [];
    const actifs = users.filter(u => u.statut === 'actif').length;
    const inactifs = users.filter(u => u.statut === 'inactif').length;
    const roles = [...new Set(users.map(u => u.role))];

    return `
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card cyan">
          <div class="kpi-icon"><i class="fas fa-users"></i></div>
          <div class="kpi-value">${users.length}</div>
          <div class="kpi-label">Total utilisateurs</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><i class="fas fa-user-check"></i></div>
          <div class="kpi-value">${actifs}</div>
          <div class="kpi-label">Actifs</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-icon"><i class="fas fa-user-slash"></i></div>
          <div class="kpi-value">${inactifs}</div>
          <div class="kpi-label">Inactifs</div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-icon"><i class="fas fa-shield-halved"></i></div>
          <div class="kpi-value">${roles.length}</div>
          <div class="kpi-label">Rôles distincts</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);">
        <div></div>
        <button class="btn btn-primary" id="btn-add-user"><i class="fas fa-user-plus"></i> Nouvel utilisateur</button>
      </div>

      <div id="users-table"></div>
    `;
  },

  _bindUsersEvents() {
    const users = Store.get('users') || [];

    Table.create({
      containerId: 'users-table',
      columns: [
        {
          label: 'Utilisateur', primary: true,
          render: (u) => `
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:50%;background:${Utils.getAvatarColor(u.id)};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;">${Utils.getInitials(u.prenom, u.nom)}</div>
              <div>
                <div style="font-weight:600;font-size:var(--font-size-sm);">${u.prenom} ${u.nom}</div>
                <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${u.email}</div>
              </div>
            </div>`,
          value: (u) => `${u.prenom} ${u.nom}`
        },
        { label: 'Rôle', render: (u) => `<span class="badge badge-info">${u.role}</span>`, value: (u) => u.role },
        { label: 'Statut', render: (u) => u.statut === 'actif' ? '<span class="badge badge-success"><i class="fas fa-circle" style="font-size:6px;margin-right:4px;"></i>Actif</span>' : '<span class="badge badge-danger"><i class="fas fa-circle" style="font-size:6px;margin-right:4px;"></i>Inactif</span>', value: (u) => u.statut },
        {
          label: 'Accès',
          render: (u) => {
            const granted = this._modules.filter(m => u.permissions && u.permissions[m.key]);
            if (granted.length === this._modules.length) return '<span class="badge badge-success">Tous</span>';
            if (granted.length === 0) return '<span class="badge badge-danger">Aucun</span>';
            return `<span class="badge badge-warning">${granted.length}/${this._modules.length} modules</span>`;
          },
          value: (u) => Object.values(u.permissions || {}).filter(Boolean).length
        },
        {
          label: 'Dernière connexion',
          render: (u) => u.dernierConnexion ? `<span style="font-size:var(--font-size-xs);color:var(--text-muted);">${Utils.timeAgo(u.dernierConnexion)}</span>` : '-',
          value: (u) => u.dernierConnexion || ''
        }
      ],
      data: users,
      pageSize: 15,
      actions: (u) => `
        <button class="btn btn-sm btn-secondary" onclick="ParametresPage._editUser('${u.id}')" title="Modifier"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-secondary" onclick="ParametresPage._resetUserPassword('${u.id}')" title="Mot de passe"><i class="fas fa-key"></i></button>
        <button class="btn btn-sm btn-danger" onclick="ParametresPage._deleteUser('${u.id}')" title="Supprimer"><i class="fas fa-trash"></i></button>
      `
    });

    document.getElementById('btn-add-user').addEventListener('click', () => this._addUser());
  },

  _getPermissionsHTML(perms = {}) {
    return `
      <div style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border-color);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);">
          <h4 style="margin:0;font-size:var(--font-size-sm);font-weight:600;"><i class="fas fa-shield-halved" style="margin-right:6px;color:var(--primary);"></i>Accès aux modules</h4>
          <div style="display:flex;gap:var(--space-xs);">
            <button type="button" class="btn btn-sm btn-secondary" id="btn-perms-all"><i class="fas fa-check-double"></i> Tout</button>
            <button type="button" class="btn btn-sm btn-secondary" id="btn-perms-none"><i class="fas fa-times"></i> Aucun</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:8px;" id="perms-grid">
          ${this._modules.map(m => {
            const checked = perms[m.key] ? 'checked' : '';
            return `
              <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);cursor:pointer;transition:all 0.2s;background:${perms[m.key] ? 'var(--card-hover-bg, rgba(59,130,246,0.05))' : 'transparent'};" class="perm-label">
                <input type="checkbox" name="perm_${m.key}" ${checked} style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;">
                <i class="fas ${m.icon}" style="font-size:12px;color:var(--text-muted);width:16px;text-align:center;"></i>
                <span style="font-size:var(--font-size-xs);font-weight:500;">${m.label}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  _collectPermissions(container) {
    const perms = {};
    this._modules.forEach(m => {
      const cb = container.querySelector(`[name="perm_${m.key}"]`);
      perms[m.key] = cb ? cb.checked : false;
    });
    return perms;
  },

  _bindPermissionToggles(container) {
    // Select all / none
    const allBtn = container.querySelector('#btn-perms-all');
    const noneBtn = container.querySelector('#btn-perms-none');
    if (allBtn) {
      allBtn.addEventListener('click', () => {
        container.querySelectorAll('#perms-grid input[type="checkbox"]').forEach(cb => { cb.checked = true; });
        this._updatePermLabels(container);
      });
    }
    if (noneBtn) {
      noneBtn.addEventListener('click', () => {
        container.querySelectorAll('#perms-grid input[type="checkbox"]').forEach(cb => { cb.checked = false; });
        this._updatePermLabels(container);
      });
    }

    // Checkbox visual toggle
    container.querySelectorAll('#perms-grid input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => this._updatePermLabels(container));
    });

    // Role change → auto-fill permissions
    const roleSelect = container.querySelector('[name="role"]');
    if (roleSelect) {
      roleSelect.addEventListener('change', () => {
        const role = roleSelect.value;
        const template = this._roleTemplates[role];
        if (template) {
          this._modules.forEach(m => {
            const cb = container.querySelector(`[name="perm_${m.key}"]`);
            if (cb) cb.checked = !!template[m.key];
          });
          this._updatePermLabels(container);
        }
      });
    }
  },

  _updatePermLabels(container) {
    container.querySelectorAll('.perm-label').forEach(label => {
      const cb = label.querySelector('input[type="checkbox"]');
      if (cb && cb.checked) {
        label.style.background = 'var(--card-hover-bg, rgba(59,130,246,0.05))';
        label.style.borderColor = 'var(--primary)';
      } else {
        label.style.background = 'transparent';
        label.style.borderColor = 'var(--border-color)';
      }
    });
  },

  _addUser() {
    const allPerms = {};
    this._modules.forEach(m => { allPerms[m.key] = true; });

    const fields = [
      { type: 'row-start' },
      { name: 'prenom', label: 'Prénom', type: 'text', required: true, placeholder: 'Ex: Aminata' },
      { name: 'nom', label: 'Nom', type: 'text', required: true, placeholder: 'Ex: Koné' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'email', label: 'Email (facultatif)', type: 'email', required: false, placeholder: 'ex: aminata@volt.ci' },
      { name: 'telephone', label: 'Téléphone', type: 'tel', placeholder: '+225 XX XX XX XX' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'role', label: 'Rôle', type: 'select', required: true, options: [
        { value: 'Administrateur', label: 'Administrateur' },
        { value: 'Manager', label: 'Manager' },
        { value: 'Opérateur', label: 'Opérateur' },
        { value: 'Comptable', label: 'Comptable' },
        { value: 'Superviseur', label: 'Superviseur' },
        { value: 'chauffeur', label: 'Chauffeur (app mobile)' }
      ]},
      { name: 'statut', label: 'Statut', type: 'select', options: [
        { value: 'actif', label: 'Actif' },
        { value: 'inactif', label: 'Inactif' }
      ]},
      { type: 'row-end' },
      { type: 'divider' },
      { type: 'heading', label: 'Mot de passe' },
      { type: 'row-start' },
      { name: 'password', label: 'Mot de passe temporaire', type: 'password', placeholder: 'Minimum 6 caractères', minlength: 6 },
      { name: 'password_confirm', label: 'Confirmer le mot de passe', type: 'password', placeholder: 'Retapez le mot de passe', minlength: 6 },
      { type: 'row-end' }
    ];

    // Chauffeur-specific fields (shown/hidden based on role selection)
    const chauffeurs = Store.get('chauffeurs') || [];
    const chauffeurOptions = chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom} (${c.telephone || ''})</option>`).join('');
    const chauffeurSection = `
      <div id="chauffeur-section" style="display:none;margin-bottom:var(--space-md);padding:var(--space-md);border-radius:var(--radius-sm);border:2px solid var(--volt-blue);background:rgba(59,130,246,0.05);">
        <h4 style="margin:0 0 var(--space-md);font-size:var(--font-size-sm);color:var(--volt-blue);"><i class="fas fa-car"></i> Configuration compte chauffeur</h4>
        <div style="display:flex;gap:var(--space-md);align-items:flex-end;margin-bottom:var(--space-md);">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label class="form-label">Chauffeur lié *</label>
            <select class="form-control" name="chauffeurId" id="add-chauffeurId">
              <option value="">-- Sélectionner un chauffeur --</option>
              ${chauffeurOptions}
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-success" id="btn-quick-add-chauffeur" style="white-space:nowrap;height:38px;"><i class="fas fa-plus"></i> Créer un chauffeur</button>
        </div>
        <div id="quick-chauffeur-form" style="display:none;margin-bottom:var(--space-md);padding:var(--space-md);border-radius:var(--radius-sm);background:rgba(34,197,94,0.06);border:1px dashed var(--success);">
          <h5 style="margin:0 0 var(--space-sm);font-size:var(--font-size-xs);font-weight:600;color:var(--success);"><i class="fas fa-bolt"></i> Création rapide</h5>
          <div class="grid-2" style="gap:var(--space-sm);">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Prénom *</label>
              <input type="text" class="form-control" id="quick-chf-prenom" placeholder="Prénom">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Nom *</label>
              <input type="text" class="form-control" id="quick-chf-nom" placeholder="Nom">
            </div>
          </div>
          <div class="form-group" style="margin-top:var(--space-sm);margin-bottom:var(--space-sm);">
            <label class="form-label">Téléphone *</label>
            <input type="tel" class="form-control" id="quick-chf-tel" placeholder="+225 XX XX XX XX">
          </div>
          <div style="display:flex;gap:var(--space-sm);justify-content:flex-end;">
            <button type="button" class="btn btn-sm btn-secondary" id="btn-quick-chf-cancel">Annuler</button>
            <button type="button" class="btn btn-sm btn-success" id="btn-quick-chf-save"><i class="fas fa-check"></i> Créer & lier</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Code PIN (4-6 chiffres)</label>
          <input type="text" class="form-control" name="pin" id="add-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Ex: 1234">
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-xs);"><i class="fas fa-info-circle" style="color:var(--volt-blue);"></i> Le chauffeur se connectera avec son numéro de téléphone et ce code PIN via l'app <strong>/driver/</strong></div>
      </div>
    `;

    const formHtml = FormBuilder.build(fields) +
      chauffeurSection +
      `<div style="margin-top:-8px;margin-bottom:var(--space-md);font-size:var(--font-size-xs);color:var(--text-muted);"><i class="fas fa-info-circle" style="color:var(--volt-blue);"></i> Si aucun mot de passe n'est défini, l'utilisateur devra en créer un lors de sa première connexion.</div>` +
      this._getPermissionsHTML(allPerms);

    Modal.form('<i class="fas fa-user-plus" style="color:var(--primary);"></i> Nouvel utilisateur', formHtml, async () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const permissions = this._collectPermissions(body);

      // Remove perm_* keys that FormBuilder picks up from checkboxes
      Object.keys(values).forEach(k => { if (k.startsWith('perm_')) delete values[k]; });

      // Extract and validate password
      const pwd = values.password || '';
      const pwdConfirm = values.password_confirm || '';
      delete values.password;
      delete values.password_confirm;

      if (pwd && pwd.length < 6) {
        Toast.error('Le mot de passe doit contenir au moins 6 caractères');
        return;
      }
      if (pwd && pwd !== pwdConfirm) {
        Toast.error('Les mots de passe ne correspondent pas');
        return;
      }

      // Get chauffeur-specific fields
      const chauffeurId = body.querySelector('#add-chauffeurId')?.value || '';
      const pin = body.querySelector('#add-pin')?.value || '';

      // For chauffeur role, validate chauffeurId
      if (values.role === 'chauffeur') {
        if (!chauffeurId) {
          Toast.error('Veuillez sélectionner un chauffeur à lier');
          return;
        }
        // Auto-fill telephone from chauffeur
        const chauffeur = Store.findById('chauffeurs', chauffeurId);
        if (chauffeur && chauffeur.telephone) {
          values.telephone = chauffeur.telephone;
        }
      }

      const user = {
        id: Utils.generateId('USR'),
        ...values,
        chauffeurId: values.role === 'chauffeur' ? chauffeurId : undefined,
        avatar: null,
        passwordHash: null,
        mustChangePassword: pwd ? true : true,
        permissions,
        dernierConnexion: null,
        dateCreation: new Date().toISOString()
      };

      Store.add('users', user);

      // If a password was provided, set it via API (server-side hashing)
      if (pwd) {
        await Auth.setTemporaryPassword(user.id, pwd);
      }

      // If chauffeur role with PIN, set the PIN via API
      if (values.role === 'chauffeur' && pin) {
        await this._setChauffeurPin(user.id, pin, chauffeurId);
      }

      Modal.close();
      Toast.success(`Utilisateur ${values.prenom} ${values.nom} créé` + (values.role === 'chauffeur' ? ' (compte chauffeur)' : pwd ? ' avec mot de passe temporaire' : ''));
      this._renderTab('users');
    }, 'modal-lg');

    // Bind permission toggles + chauffeur role toggle after modal is open
    setTimeout(() => {
      const body = document.getElementById('modal-body');
      if (body) {
        this._bindPermissionToggles(body);
        this._bindChauffeurRoleToggle(body);
      }
    }, 50);
  },

  /**
   * Show/hide chauffeur-specific fields based on role selection
   */
  _bindChauffeurRoleToggle(container) {
    const roleSelect = container.querySelector('[name="role"]');
    const chauffeurSection = container.querySelector('#chauffeur-section');
    if (!roleSelect || !chauffeurSection) return;

    const toggle = () => {
      chauffeurSection.style.display = roleSelect.value === 'chauffeur' ? 'block' : 'none';
    };
    roleSelect.addEventListener('change', toggle);
    toggle(); // apply initial state

    // Quick add chauffeur button
    const btnQuickAdd = container.querySelector('#btn-quick-add-chauffeur');
    const quickForm = container.querySelector('#quick-chauffeur-form');
    const btnCancel = container.querySelector('#btn-quick-chf-cancel');
    const btnSave = container.querySelector('#btn-quick-chf-save');

    if (btnQuickAdd && quickForm) {
      btnQuickAdd.addEventListener('click', () => {
        quickForm.style.display = 'block';
        btnQuickAdd.style.display = 'none';
        const prenomInput = container.querySelector('#quick-chf-prenom');
        if (prenomInput) prenomInput.focus();
      });

      if (btnCancel) {
        btnCancel.addEventListener('click', () => {
          quickForm.style.display = 'none';
          btnQuickAdd.style.display = '';
        });
      }

      if (btnSave) {
        btnSave.addEventListener('click', () => {
          const prenom = container.querySelector('#quick-chf-prenom').value.trim();
          const nom = container.querySelector('#quick-chf-nom').value.trim();
          const tel = container.querySelector('#quick-chf-tel').value.trim();

          if (!prenom || !nom || !tel) {
            Toast.error('Prénom, nom et téléphone sont obligatoires');
            return;
          }

          // Create chauffeur
          const chauffeur = {
            id: Utils.generateId('CHF'),
            prenom,
            nom,
            telephone: tel,
            email: '',
            statut: 'actif',
            dateDebutContrat: new Date().toISOString().split('T')[0],
            vehiculeAssigne: null,
            photo: null,
            documents: [],
            scoreConduite: 80,
            noteInterne: '',
            dateCreation: new Date().toISOString()
          };

          Store.add('chauffeurs', chauffeur);

          // Add to select and select it
          const select = container.querySelector('#add-chauffeurId');
          if (select) {
            const opt = document.createElement('option');
            opt.value = chauffeur.id;
            opt.textContent = `${prenom} ${nom} (${tel})`;
            opt.selected = true;
            select.appendChild(opt);
          }

          // Auto-fill telephone in user form
          const telInput = container.querySelector('[name="telephone"]');
          if (telInput && !telInput.value) {
            telInput.value = tel;
          }

          // Hide quick form
          quickForm.style.display = 'none';
          btnQuickAdd.style.display = '';

          Toast.success(`Chauffeur ${prenom} ${nom} créé et lié`);
        });
      }
    }
  },

  /**
   * If role is chauffeur, call set-pin API to define the PIN
   */
  async _setChauffeurPin(userId, pin, chauffeurId) {
    if (!pin || !chauffeurId) return;
    try {
      const apiBase = Store._apiBase || '/api';
      await fetch(apiBase + '/driver/auth/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin, chauffeurId })
      });
    } catch (e) {
      console.warn('Set PIN failed:', e);
    }
  },

  _editUser(id) {
    const user = Store.findById('users', id);
    if (!user) return;

    const fields = [
      { type: 'row-start' },
      { name: 'prenom', label: 'Prénom', type: 'text', required: true },
      { name: 'nom', label: 'Nom', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'email', label: 'Email (facultatif)', type: 'email', required: false },
      { name: 'telephone', label: 'Téléphone', type: 'tel' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'role', label: 'Rôle', type: 'select', required: true, options: [
        { value: 'Administrateur', label: 'Administrateur' },
        { value: 'Manager', label: 'Manager' },
        { value: 'Opérateur', label: 'Opérateur' },
        { value: 'Comptable', label: 'Comptable' },
        { value: 'Superviseur', label: 'Superviseur' },
        { value: 'chauffeur', label: 'Chauffeur (app mobile)' }
      ]},
      { name: 'statut', label: 'Statut', type: 'select', options: [
        { value: 'actif', label: 'Actif' },
        { value: 'inactif', label: 'Inactif' }
      ]},
      { type: 'row-end' }
    ];

    // Chauffeur-specific section for edit
    const chauffeurs = Store.get('chauffeurs') || [];
    const chauffeurOptions = chauffeurs.map(c => `<option value="${c.id}" ${user.chauffeurId === c.id ? 'selected' : ''}>${c.prenom} ${c.nom} (${c.telephone || ''})</option>`).join('');
    const editChauffeurSection = `
      <div id="chauffeur-section" style="display:${user.role === 'chauffeur' ? 'block' : 'none'};margin-bottom:var(--space-md);padding:var(--space-md);border-radius:var(--radius-sm);border:2px solid var(--volt-blue);background:rgba(59,130,246,0.05);">
        <h4 style="margin:0 0 var(--space-md);font-size:var(--font-size-sm);color:var(--volt-blue);"><i class="fas fa-car"></i> Configuration compte chauffeur</h4>
        <div style="display:flex;gap:var(--space-md);align-items:flex-end;margin-bottom:var(--space-md);">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label class="form-label">Chauffeur lié *</label>
            <select class="form-control" name="chauffeurId" id="add-chauffeurId">
              <option value="">-- Sélectionner un chauffeur --</option>
              ${chauffeurOptions}
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-success" id="btn-quick-add-chauffeur" style="white-space:nowrap;height:38px;"><i class="fas fa-plus"></i> Créer un chauffeur</button>
        </div>
        <div id="quick-chauffeur-form" style="display:none;margin-bottom:var(--space-md);padding:var(--space-md);border-radius:var(--radius-sm);background:rgba(34,197,94,0.06);border:1px dashed var(--success);">
          <h5 style="margin:0 0 var(--space-sm);font-size:var(--font-size-xs);font-weight:600;color:var(--success);"><i class="fas fa-bolt"></i> Création rapide</h5>
          <div class="grid-2" style="gap:var(--space-sm);">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Prénom *</label>
              <input type="text" class="form-control" id="quick-chf-prenom" placeholder="Prénom">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Nom *</label>
              <input type="text" class="form-control" id="quick-chf-nom" placeholder="Nom">
            </div>
          </div>
          <div class="form-group" style="margin-top:var(--space-sm);margin-bottom:var(--space-sm);">
            <label class="form-label">Téléphone *</label>
            <input type="tel" class="form-control" id="quick-chf-tel" placeholder="+225 XX XX XX XX">
          </div>
          <div style="display:flex;gap:var(--space-sm);justify-content:flex-end;">
            <button type="button" class="btn btn-sm btn-secondary" id="btn-quick-chf-cancel">Annuler</button>
            <button type="button" class="btn btn-sm btn-success" id="btn-quick-chf-save"><i class="fas fa-check"></i> Créer & lier</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Nouveau code PIN (laisser vide pour ne pas changer)</label>
          <input type="text" class="form-control" name="pin" id="add-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="****">
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-xs);"><i class="fas fa-info-circle" style="color:var(--volt-blue);"></i> Le chauffeur se connectera via l'app <strong>/driver/</strong></div>
      </div>
    `;

    // Password status info
    const pwdStatus = user.passwordHash
      ? `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:var(--radius-sm);background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);margin-bottom:var(--space-md);">
          <i class="fas fa-check-circle" style="color:var(--success);"></i>
          <span style="font-size:var(--font-size-xs);color:var(--text-secondary);">Mot de passe défini${user.mustChangePassword ? ' (temporaire — devra être changé)' : ''}</span>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-reset-pwd" style="margin-left:auto;"><i class="fas fa-key"></i> Réinitialiser</button>
        </div>`
      : `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:var(--radius-sm);background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);margin-bottom:var(--space-md);">
          <i class="fas fa-exclamation-triangle" style="color:var(--warning);"></i>
          <span style="font-size:var(--font-size-xs);color:var(--text-secondary);">Aucun mot de passe — l'utilisateur devra en créer un à la première connexion</span>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-reset-pwd" style="margin-left:auto;"><i class="fas fa-key"></i> Définir</button>
        </div>`;

    const formHtml = FormBuilder.build(fields, user) + editChauffeurSection + pwdStatus + this._getPermissionsHTML(user.permissions || {});

    Modal.form('<i class="fas fa-user-edit" style="color:var(--primary);"></i> Modifier utilisateur', formHtml, async () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const permissions = this._collectPermissions(body);

      // Remove perm_* keys that FormBuilder picks up from checkboxes
      Object.keys(values).forEach(k => { if (k.startsWith('perm_')) delete values[k]; });

      // Get chauffeur-specific fields
      const chauffeurIdVal = body.querySelector('#add-chauffeurId')?.value || '';
      const pinVal = body.querySelector('#add-pin')?.value || '';

      // For chauffeur role, validate
      if (values.role === 'chauffeur' && !chauffeurIdVal) {
        Toast.error('Veuillez sélectionner un chauffeur à lier');
        return;
      }

      const updateData = {
        ...values,
        permissions,
        chauffeurId: values.role === 'chauffeur' ? chauffeurIdVal : undefined
      };

      Store.update('users', id, updateData);

      // If chauffeur role with new PIN, set it via API
      if (values.role === 'chauffeur' && pinVal) {
        await this._setChauffeurPin(id, pinVal, chauffeurIdVal);
      }

      // If editing the current user, refresh session
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
        const session = Auth.getSession();
        if (session && session.id === id) {
          Auth.refreshSession();
        }
      }

      Modal.close();
      Toast.success('Utilisateur modifié');
      this._renderTab('users');
    }, 'modal-lg');

    setTimeout(() => {
      const body = document.getElementById('modal-body');
      if (body) {
        this._bindPermissionToggles(body);
        this._bindChauffeurRoleToggle(body);
        // Bind reset password button
        const resetBtn = body.querySelector('#btn-reset-pwd');
        if (resetBtn) {
          resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            Modal.close();
            setTimeout(() => this._resetUserPassword(id), 300);
          });
        }
      }
    }, 50);
  },

  _resetUserPassword(id) {
    const user = Store.findById('users', id);
    if (!user) return;

    const fields = [
      { type: 'row-start' },
      { name: 'password', label: 'Nouveau mot de passe', type: 'password', required: true, placeholder: 'Minimum 6 caractères', minlength: 6 },
      { name: 'password_confirm', label: 'Confirmer', type: 'password', required: true, placeholder: 'Retapez le mot de passe', minlength: 6 },
      { type: 'row-end' }
    ];

    const formHtml = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--space-lg);padding-bottom:var(--space-md);border-bottom:1px solid var(--border-color);">
        <div style="width:40px;height:40px;border-radius:50%;background:${Utils.getAvatarColor(user.id)};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;">${Utils.getInitials(user.prenom, user.nom)}</div>
        <div>
          <div style="font-weight:600;">${user.prenom} ${user.nom}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${user.email}</div>
        </div>
      </div>
      ${FormBuilder.build(fields)}
      <label style="display:flex;align-items:center;gap:8px;margin-top:var(--space-sm);cursor:pointer;">
        <input type="checkbox" id="force-change" checked style="accent-color:var(--primary);width:16px;height:16px;">
        <span style="font-size:var(--font-size-xs);color:var(--text-secondary);">Forcer le changement au prochain login</span>
      </label>
    `;

    Modal.form('<i class="fas fa-key" style="color:var(--warning);"></i> Réinitialiser le mot de passe', formHtml, async () => {
      const body = document.getElementById('modal-body');
      const pwd = body.querySelector('[name="password"]').value;
      const pwdConfirm = body.querySelector('[name="password_confirm"]').value;
      const forceChange = body.querySelector('#force-change').checked;

      if (!pwd || !pwdConfirm) {
        Toast.error('Veuillez remplir tous les champs');
        return;
      }
      if (pwd.length < 6) {
        Toast.error('Le mot de passe doit contenir au moins 6 caractères');
        return;
      }
      if (pwd !== pwdConfirm) {
        Toast.error('Les mots de passe ne correspondent pas');
        return;
      }

      if (forceChange) {
        await Auth.setTemporaryPassword(id, pwd);
      } else {
        await Auth.setPassword(id, pwd);
      }

      Modal.close();
      Toast.success(`Mot de passe de ${user.prenom} ${user.nom} réinitialisé`);
      this._renderTab('users');
    });
  },

  _deleteUser(id) {
    const user = Store.findById('users', id);
    if (!user) return;
    Modal.confirm(
      'Supprimer l\'utilisateur',
      `Êtes-vous sûr de vouloir supprimer <strong>${user.prenom} ${user.nom}</strong> (${user.role}) ? Cette action est irréversible.`,
      () => {
        Store.delete('users', id);
        Toast.success('Utilisateur supprimé');
        this._renderTab('users');
      }
    );
  },

  // ========================= ONGLET ENTREPRISE =========================

  _renderEntreprise() {
    const settings = Store.get('settings') || {};
    const ent = settings.entreprise || {};

    return `
      <div class="grid-2" style="gap:var(--space-lg);">
        <!-- Formulaire -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-building"></i> Informations de l'entreprise</span>
            <button class="btn btn-sm btn-primary" id="btn-save-entreprise"><i class="fas fa-save"></i> Sauvegarder</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Nom de l'entreprise *</label>
                <input type="text" class="form-control" id="ent-nom" value="${ent.nom || ''}" placeholder="Ex: Volt VTC">
              </div>
              <div class="form-group">
                <label class="form-label">Slogan</label>
                <input type="text" class="form-control" id="ent-slogan" value="${ent.slogan || ''}" placeholder="Ex: Transport de qualité">
              </div>
            </div>
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" class="form-control" id="ent-email" value="${ent.email || ''}" placeholder="contact@volt.ci">
              </div>
              <div class="form-group">
                <label class="form-label">Téléphone</label>
                <input type="tel" class="form-control" id="ent-telephone" value="${ent.telephone || ''}" placeholder="+225 XX XX XX XX">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Adresse</label>
              <input type="text" class="form-control" id="ent-adresse" value="${ent.adresse || ''}" placeholder="Ex: Cocody Riviera, Abidjan">
            </div>
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Site web</label>
                <input type="text" class="form-control" id="ent-siteweb" value="${ent.siteWeb || ''}" placeholder="www.volt.ci">
              </div>
              <div class="form-group">
                <label class="form-label">N° Registre du commerce</label>
                <input type="text" class="form-control" id="ent-registre" value="${ent.numeroRegistre || ''}" placeholder="CI-ABJ-2024-XXXX">
              </div>
            </div>
            <div class="form-group" style="max-width:200px;">
              <label class="form-label">Devise</label>
              <select class="form-control" id="ent-devise">
                <option value="FCFA" ${ent.devise === 'FCFA' ? 'selected' : ''}>FCFA (Franc CFA)</option>
                <option value="EUR" ${ent.devise === 'EUR' ? 'selected' : ''}>EUR (Euro)</option>
                <option value="USD" ${ent.devise === 'USD' ? 'selected' : ''}>USD (Dollar US)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Aperçu -->
        <div>
          <div class="card" style="border-top:3px solid var(--primary);">
            <div style="text-align:center;padding:var(--space-xl) var(--space-lg);">
              <div style="width:80px;height:80px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;margin:0 auto var(--space-md);font-size:28px;color:#fff;font-weight:700;">
                ${(ent.nom || 'V').charAt(0)}
              </div>
              <h2 style="margin-bottom:4px;" id="preview-nom">${ent.nom || 'Nom entreprise'}</h2>
              <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-bottom:var(--space-lg);" id="preview-slogan">${ent.slogan || ''}</p>

              <div style="display:flex;flex-direction:column;gap:var(--space-sm);text-align:left;">
                ${ent.email ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><i class="fas fa-envelope" style="color:var(--text-muted);width:16px;text-align:center;"></i> ${ent.email}</div>` : ''}
                ${ent.telephone ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><i class="fas fa-phone" style="color:var(--text-muted);width:16px;text-align:center;"></i> ${ent.telephone}</div>` : ''}
                ${ent.adresse ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><i class="fas fa-map-marker-alt" style="color:var(--text-muted);width:16px;text-align:center;"></i> ${ent.adresse}</div>` : ''}
                ${ent.siteWeb ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><i class="fas fa-globe" style="color:var(--text-muted);width:16px;text-align:center;"></i> ${ent.siteWeb}</div>` : ''}
                ${ent.numeroRegistre ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><i class="fas fa-file-contract" style="color:var(--text-muted);width:16px;text-align:center;"></i> ${ent.numeroRegistre}</div>` : ''}
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:var(--space-md);border-left:4px solid var(--volt-blue);">
            <div style="display:flex;align-items:center;gap:var(--space-sm);">
              <i class="fas fa-lightbulb" style="color:var(--volt-blue);"></i>
              <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin:0;">Ces informations apparaissent sur les exports PDF et les factures générées par l'application.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _bindEntrepriseEvents() {
    document.getElementById('btn-save-entreprise').addEventListener('click', () => {
      const settings = Store.get('settings') || {};
      settings.entreprise = {
        nom: document.getElementById('ent-nom').value.trim(),
        slogan: document.getElementById('ent-slogan').value.trim(),
        email: document.getElementById('ent-email').value.trim(),
        telephone: document.getElementById('ent-telephone').value.trim(),
        adresse: document.getElementById('ent-adresse').value.trim(),
        siteWeb: document.getElementById('ent-siteweb').value.trim(),
        numeroRegistre: document.getElementById('ent-registre').value.trim(),
        devise: document.getElementById('ent-devise').value
      };

      if (!settings.entreprise.nom) {
        Toast.error('Le nom de l\'entreprise est obligatoire');
        return;
      }

      Store.set('settings', settings);
      Toast.success('Informations entreprise sauvegardées');
      this._renderTab('entreprise');
    });
  },

  // ========================= ONGLET PREFERENCES =========================

  _renderPreferences() {
    const settings = Store.get('settings') || {};
    const prefs = settings.preferences || {};
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

    return `
      <div class="grid-2" style="gap:var(--space-lg);">
        <!-- Apparence -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-palette"></i> Apparence</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-lg);padding-top:var(--space-md);">
            <div class="form-group">
              <label class="form-label">Thème par défaut</label>
              <div style="display:flex;gap:var(--space-md);">
                <label style="display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);border:2px solid ${currentTheme === 'dark' ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;transition:all 0.2s;">
                  <input type="radio" name="pref-theme" value="dark" ${currentTheme === 'dark' ? 'checked' : ''} style="accent-color:var(--primary);">
                  <i class="fas fa-moon" style="color:var(--primary);"></i>
                  <div>
                    <div style="font-weight:600;font-size:var(--font-size-sm);">Mode sombre</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Recommandé pour un usage prolongé</div>
                  </div>
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);border:2px solid ${currentTheme === 'light' ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;transition:all 0.2s;">
                  <input type="radio" name="pref-theme" value="light" ${currentTheme === 'light' ? 'checked' : ''} style="accent-color:var(--primary);">
                  <i class="fas fa-sun" style="color:var(--warning);"></i>
                  <div>
                    <div style="font-weight:600;font-size:var(--font-size-sm);">Mode clair</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Idéal pour les environnements lumineux</div>
                  </div>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Langue</label>
              <select class="form-control" id="pref-langue" style="max-width:300px;">
                <option value="fr" ${prefs.langue === 'fr' ? 'selected' : ''}>Français</option>
                <option value="en" ${prefs.langue === 'en' ? 'selected' : ''}>English</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Format de date</label>
              <select class="form-control" id="pref-format-date" style="max-width:300px;">
                <option value="DD/MM/YYYY" ${prefs.formatDate === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY (20/02/2026)</option>
                <option value="MM/DD/YYYY" ${prefs.formatDate === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY (02/20/2026)</option>
                <option value="YYYY-MM-DD" ${prefs.formatDate === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD (2026-02-20)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Notifications & Sécurité -->
        <div>
          <div class="card" style="margin-bottom:var(--space-lg);">
            <div class="card-header">
              <span class="card-title"><i class="fas fa-bell"></i> Notifications</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);">Notifications dans l'application</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Afficher les alertes et mises à jour</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="pref-notifications" ${prefs.notifications !== false ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border-color);">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);">Alertes sonores</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Jouer un son lors d'une alerte critique</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="pref-sons" ${prefs.alertesSonores ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title"><i class="fas fa-lock"></i> Sécurité</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Délai d'inactivité avant déconnexion (minutes)</label>
                <input type="number" class="form-control" id="pref-timeout" value="${prefs.sessionTimeout || 30}" min="5" max="480" style="max-width:200px;">
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top:var(--space-lg);display:flex;justify-content:flex-end;">
        <button class="btn btn-primary" id="btn-save-preferences"><i class="fas fa-save"></i> Sauvegarder les préférences</button>
      </div>

      <style>
        .toggle-switch { position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0; }
        .toggle-switch input { opacity:0;width:0;height:0; }
        .toggle-slider { position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--bg-tertiary);border:1px solid var(--border-color);transition:0.3s;border-radius:24px; }
        .toggle-slider::before { content:"";position:absolute;height:18px;width:18px;left:2px;bottom:2px;background:var(--text-muted);transition:0.3s;border-radius:50%; }
        .toggle-switch input:checked + .toggle-slider { background:var(--primary);border-color:var(--primary); }
        .toggle-switch input:checked + .toggle-slider::before { transform:translateX(20px);background:#fff; }
      </style>
    `;
  },

  _bindPreferencesEvents() {
    // Theme radio buttons — apply immediately
    document.querySelectorAll('input[name="pref-theme"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const theme = radio.value;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('volt_theme', theme);
        if (typeof Utils !== 'undefined' && Utils.configureChartDefaults) {
          Utils.configureChartDefaults();
        }
      });
    });

    // Save button
    document.getElementById('btn-save-preferences').addEventListener('click', () => {
      const settings = Store.get('settings') || {};
      settings.preferences = {
        themeDefaut: document.querySelector('input[name="pref-theme"]:checked')?.value || 'dark',
        langue: document.getElementById('pref-langue').value,
        formatDate: document.getElementById('pref-format-date').value,
        notifications: document.getElementById('pref-notifications').checked,
        alertesSonores: document.getElementById('pref-sons').checked,
        sessionTimeout: parseInt(document.getElementById('pref-timeout').value) || 30
      };

      Store.set('settings', settings);
      Toast.success('Préférences sauvegardées');
    });
  }
};
