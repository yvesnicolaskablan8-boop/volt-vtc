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
    { key: 'dashboard', label: 'Tableau de bord', icon: 'solar:widget-bold-duotone' },
    { key: 'chauffeurs', label: 'Chauffeurs', icon: 'solar:user-id-bold-duotone' },
    { key: 'vehicules', label: 'Véhicules', icon: 'solar:wheel-bold-duotone' },
    { key: 'planning', label: 'Planning', icon: 'solar:calendar-bold-duotone' },
    { key: 'versements', label: 'Versements', icon: 'solar:transfer-horizontal-bold-duotone' },
    { key: 'contraventions', label: 'Contraventions', icon: 'solar:document-text-bold-duotone' },
    { key: 'depenses', label: 'Dépenses', icon: 'solar:money-bag-bold-duotone' },
    { key: 'rentabilite', label: 'Rentabilité', icon: 'solar:pie-chart-bold-duotone' },
    { key: 'comptabilite', label: 'Comptabilité', icon: 'solar:calculator-bold-duotone' },
    { key: 'garage', label: 'Garage', icon: 'solar:garage-bold-duotone' },
    { key: 'gps_conduite', label: 'GPS & Conduite', icon: 'solar:satellite-bold-duotone' },
    { key: 'controle_conduite', label: 'Contrôle conduite', icon: 'solar:shield-check-bold-duotone' },
    { key: 'classement', label: 'Classement', icon: 'solar:cup-star-bold-duotone' },
    { key: 'taches', label: 'Tâches', icon: 'solar:checklist-bold-duotone' },
    { key: 'messagerie', label: 'Messagerie', icon: 'solar:chat-round-dots-bold-duotone' },
    { key: 'alertes', label: 'Alertes', icon: 'solar:bell-bing-bold-duotone' },
    { key: 'rapports', label: 'Rapports', icon: 'solar:file-bold-duotone' },
    { key: 'parametres', label: 'Paramètres', icon: 'solar:settings-bold-duotone' }
  ],

  // =================== ROLE TEMPLATES ===================
  _roleTemplates: {
    'Administrateur': { dashboard: true, chauffeurs: true, vehicules: true, planning: true, versements: true, contraventions: true, depenses: true, rentabilite: true, comptabilite: true, garage: true, gps_conduite: true, alertes: true, rapports: true, parametres: true },
    'Manager': { dashboard: true, chauffeurs: true, vehicules: true, planning: true, versements: true, contraventions: true, depenses: true, rentabilite: true, comptabilite: true, garage: true, gps_conduite: true, alertes: true, rapports: true, parametres: false },
    'Opérateur': { dashboard: true, chauffeurs: true, vehicules: true, planning: true, versements: false, contraventions: false, depenses: false, rentabilite: false, comptabilite: false, garage: false, gps_conduite: false, alertes: false, rapports: false, parametres: false },
    'Comptable': { dashboard: true, chauffeurs: false, vehicules: false, planning: false, versements: true, contraventions: true, rentabilite: true, comptabilite: true, garage: false, gps_conduite: false, alertes: false, rapports: true, parametres: false },
    'Superviseur': { dashboard: true, chauffeurs: false, vehicules: false, planning: false, versements: false, contraventions: false, rentabilite: false, comptabilite: false, garage: false, gps_conduite: true, alertes: true, rapports: true, parametres: false }
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
        <h1><iconify-icon icon="solar:settings-bold-duotone"></iconify-icon> Paramètres</h1>
      </div>

      <div class="tabs" id="settings-tabs">
        <div class="tab active" data-tab="account"><iconify-icon icon="solar:user-circle-bold-duotone"></iconify-icon> Mon compte</div>
        <div class="tab" data-tab="users"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon> Utilisateurs</div>
        <div class="tab" data-tab="entreprise"><iconify-icon icon="solar:buildings-bold-duotone"></iconify-icon> Entreprise</div>
        <div class="tab" data-tab="preferences"><iconify-icon icon="solar:tuning-bold-duotone"></iconify-icon> Préférences</div>
        <div class="tab" data-tab="versements-settings"><iconify-icon icon="solar:transfer-horizontal-bold-duotone"></iconify-icon> Versements</div>
        <div class="tab" data-tab="notifications-settings"><iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon> Notifications</div>
        <div class="tab" data-tab="parcs"><iconify-icon icon="solar:garage-bold-duotone"></iconify-icon> Parcs</div>
        <div class="tab" data-tab="contrat"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> Contrat</div>
        <div class="tab" data-tab="integrations"><iconify-icon icon="solar:plug-circle-bold-duotone"></iconify-icon> Intégrations</div>
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
      case 'versements-settings': ct.innerHTML = this._renderVersementsSettings(); this._bindVersementsSettingsEvents(); break;
      case 'notifications-settings': ct.innerHTML = this._renderNotificationsSettings(); this._bindNotificationsSettingsEvents(); break;
      case 'parcs': ct.innerHTML = this._renderParcs(); this._bindParcsEvents(); break;
      case 'contrat': ct.innerHTML = this._renderContrat(); this._bindContratEvents(); break;
      case 'integrations': ct.innerHTML = this._renderIntegrations(); this._bindIntegrationsEvents(); break;
    }
  },

  // ========================= ONGLET MON COMPTE =========================

  _renderAccount() {
    const session = Auth.getSession();
    if (!session) return '<div class="card"><p>Vous devez être connecté.</p></div>';
    const user = Store.findById('users', session.userId) || session;

    return `
      <div class="grid-2" style="gap:var(--space-lg);">
        <!-- Profil -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:user-circle-bold-duotone"></iconify-icon> Mon profil</span>
          </div>
          <div style="padding-top:var(--space-md);">
            <div style="display:flex;align-items:center;gap:var(--space-lg);margin-bottom:var(--space-lg);padding-bottom:var(--space-lg);border-bottom:1px solid var(--border-color);">
              <div style="width:72px;height:72px;border-radius:50%;background:${Utils.getAvatarColor(user.id)};display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;flex-shrink:0;">
                ${Utils.getInitials(user.prenom, user.nom)}
              </div>
              <div>
                <div style="font-size:var(--font-size-lg);font-weight:700;">${Utils.escHtml(user.prenom)} ${Utils.escHtml(user.nom)}</div>
                <div style="font-size:var(--font-size-sm);color:var(--text-muted);">${Utils.escHtml(user.email)}</div>
                <span class="badge badge-info" style="margin-top:6px;">${Utils.escHtml(user.role)}</span>
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
                <button class="btn btn-primary" id="btn-save-profile"><iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder le profil</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Mot de passe + Infos -->
        <div>
          <!-- Changer mot de passe -->
          <div class="card" style="margin-bottom:var(--space-lg);">
            <div class="card-header">
              <span class="card-title"><iconify-icon icon="solar:key-bold-duotone"></iconify-icon> Modifier le mot de passe</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Mot de passe actuel</label>
                <div style="position:relative;">
                  <input type="password" class="form-control" id="pwd-current" placeholder="Entrez votre mot de passe actuel" style="padding-right:40px;">
                  <button type="button" class="btn-toggle-pwd" data-target="pwd-current" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;">
                    <iconify-icon icon="solar:eye-bold"></iconify-icon>
                  </button>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Nouveau mot de passe</label>
                <div style="position:relative;">
                  <input type="password" class="form-control" id="pwd-new" placeholder="Minimum 6 caractères" style="padding-right:40px;">
                  <button type="button" class="btn-toggle-pwd" data-target="pwd-new" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;">
                    <iconify-icon icon="solar:eye-bold"></iconify-icon>
                  </button>
                </div>
                <div id="pwd-strength" style="margin-top:6px;"></div>
              </div>
              <div class="form-group">
                <label class="form-label">Confirmer le nouveau mot de passe</label>
                <div style="position:relative;">
                  <input type="password" class="form-control" id="pwd-confirm" placeholder="Retapez le nouveau mot de passe" style="padding-right:40px;">
                  <button type="button" class="btn-toggle-pwd" data-target="pwd-confirm" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;">
                    <iconify-icon icon="solar:eye-bold"></iconify-icon>
                  </button>
                </div>
              </div>
              <div style="display:flex;justify-content:flex-end;">
                <button class="btn btn-primary" id="btn-change-pwd"><iconify-icon icon="solar:lock-bold-duotone"></iconify-icon> Modifier le mot de passe</button>
              </div>
            </div>
          </div>

          <!-- Infos session -->
          <div class="card" style="border-left:4px solid var(--pilote-blue);">
            <div class="card-header">
              <span class="card-title"><iconify-icon icon="solar:info-circle-bold-duotone"></iconify-icon> Informations de session</span>
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
                <span class="badge badge-success"><iconify-icon icon="solar:record-circle-bold-duotone" style="font-size:6px;margin-right:4px;"></iconify-icon>Actif</span>
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
          btn.innerHTML = `<iconify-icon icon="solar:${isPassword ? 'eye-closed-bold' : 'eye-bold'}"></iconify-icon>`;
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

      Store.update('users', session.userId, { prenom, nom, email, telephone });
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
        // Verify current password via Supabase Auth
        const user = Store.findById('users', session.userId);
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: current
        });
        if (verifyError) {
          Toast.error('Mot de passe actuel incorrect');
          return;
        }

        // Set new password (not temporary — user chose it themselves)
        const result = await Auth.setPassword(session.userId, newPwd);
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
          <div class="kpi-icon"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${users.length}</div>
          <div class="kpi-label">Total utilisateurs</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><iconify-icon icon="solar:user-check-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${actifs}</div>
          <div class="kpi-label">Actifs</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-icon"><iconify-icon icon="solar:user-cross-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${inactifs}</div>
          <div class="kpi-label">Inactifs</div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-icon"><iconify-icon icon="solar:shield-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${roles.length}</div>
          <div class="kpi-label">Rôles distincts</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);flex-wrap:wrap;gap:8px;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <div style="position:relative;">
            <iconify-icon icon="solar:magnifer-bold" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--text-muted);pointer-events:none;"></iconify-icon>
            <input type="text" id="users-filter-name" class="form-control" placeholder="Filtrer par nom..." style="padding-left:32px;font-size:var(--font-size-xs);width:200px;" oninput="ParametresPage._filterUsers()">
          </div>
          <select id="users-filter-role" class="form-control" style="font-size:var(--font-size-xs);width:150px;" onchange="ParametresPage._filterUsers()">
            <option value="">Tous les roles</option>
            ${roles.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
          <select id="users-filter-statut" class="form-control" style="font-size:var(--font-size-xs);width:130px;" onchange="ParametresPage._filterUsers()">
            <option value="">Tous statuts</option>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
          </select>
        </div>
        <button class="btn btn-primary" id="btn-add-user"><iconify-icon icon="solar:user-plus-bold-duotone"></iconify-icon> Nouvel utilisateur</button>
      </div>

      <div id="users-table"></div>
    `;
  },

  _usersTable: null,

  _filterUsers() {
    if (!this._usersTable) return;
    const nameVal = (document.getElementById('users-filter-name')?.value || '').toLowerCase().trim();
    const roleVal = document.getElementById('users-filter-role')?.value || '';
    const statutVal = document.getElementById('users-filter-statut')?.value || '';

    this._usersTable.filter(u => {
      if (nameVal && !`${u.prenom} ${u.nom}`.toLowerCase().includes(nameVal) && !(u.email || '').toLowerCase().includes(nameVal)) return false;
      if (roleVal && u.role !== roleVal) return false;
      if (statutVal && u.statut !== statutVal) return false;
      return true;
    });
  },

  _bindUsersEvents() {
    const users = Store.get('users') || [];

    this._usersTable = Table.create({
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
        { label: 'Statut', render: (u) => u.statut === 'actif' ? '<span class="badge badge-success"><iconify-icon icon="solar:record-circle-bold-duotone" style="font-size:6px;margin-right:4px;"></iconify-icon>Actif</span>' : '<span class="badge badge-danger"><iconify-icon icon="solar:record-circle-bold-duotone" style="font-size:6px;margin-right:4px;"></iconify-icon>Inactif</span>', value: (u) => u.statut },
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
        <button class="btn btn-sm btn-secondary" onclick="ParametresPage._editUser('${u.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
        <button class="btn btn-sm btn-secondary" onclick="ParametresPage._resetUserPassword('${u.id}')" title="Mot de passe"><iconify-icon icon="solar:key-bold-duotone"></iconify-icon></button>
        <button class="btn btn-sm btn-danger" onclick="ParametresPage._deleteUser('${u.id}')" title="Supprimer"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
      `
    });

    document.getElementById('btn-add-user').addEventListener('click', () => this._addUser());
  },

  _getPermissionsHTML(perms = {}) {
    return `
      <div id="permissions-section" style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border-color);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);">
          <h4 style="margin:0;font-size:var(--font-size-sm);font-weight:600;"><iconify-icon icon="solar:shield-bold-duotone" style="margin-right:6px;color:var(--primary);"></iconify-icon>Accès aux modules</h4>
          <div style="display:flex;gap:var(--space-xs);">
            <button type="button" class="btn btn-sm btn-secondary" id="btn-perms-all"><iconify-icon icon="solar:check-read-bold-duotone"></iconify-icon> Tout</button>
            <button type="button" class="btn btn-sm btn-secondary" id="btn-perms-none"><iconify-icon icon="solar:close-circle-bold"></iconify-icon> Aucun</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:8px;" id="perms-grid">
          ${this._modules.map(m => {
            const checked = perms[m.key] ? 'checked' : '';
            return `
              <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);cursor:pointer;transition:all 0.2s;background:${perms[m.key] ? 'var(--card-hover-bg, rgba(59,130,246,0.05))' : 'transparent'};" class="perm-label">
                <input type="checkbox" name="perm_${m.key}" ${checked} style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;">
                <iconify-icon icon="${m.icon}" style="font-size:12px;color:var(--text-muted);width:16px;text-align:center;"></iconify-icon>
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
      { name: 'email', label: 'Email (facultatif)', type: 'email', required: false, placeholder: 'ex: aminata@pilote.app' },
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
      <div id="chauffeur-section" style="display:none;margin-bottom:var(--space-md);padding:var(--space-md);border-radius:var(--radius-sm);border:2px solid var(--pilote-blue);background:rgba(59,130,246,0.05);">
        <h4 style="margin:0 0 var(--space-md);font-size:var(--font-size-sm);color:var(--pilote-blue);"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon> Configuration compte chauffeur</h4>
        <div style="display:flex;gap:var(--space-md);align-items:flex-end;margin-bottom:var(--space-md);">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label class="form-label">Chauffeur lié *</label>
            <select class="form-control" name="chauffeurId" id="add-chauffeurId">
              <option value="">-- Sélectionner un chauffeur --</option>
              ${chauffeurOptions}
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-success" id="btn-quick-add-chauffeur" style="white-space:nowrap;height:38px;"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Créer un chauffeur</button>
        </div>
        <div id="quick-chauffeur-form" style="display:none;margin-bottom:var(--space-md);padding:var(--space-md);border-radius:var(--radius-sm);background:rgba(34,197,94,0.06);border:1px dashed var(--success);">
          <h5 style="margin:0 0 var(--space-sm);font-size:var(--font-size-xs);font-weight:600;color:var(--success);"><iconify-icon icon="solar:bolt-bold-duotone"></iconify-icon> Création rapide</h5>
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
            <button type="button" class="btn btn-sm btn-success" id="btn-quick-chf-save"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Créer & lier</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Code PIN (4-6 chiffres)</label>
          <input type="text" class="form-control" name="pin" id="add-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Ex: 1234">
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-xs);"><iconify-icon icon="solar:info-circle-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon> Le chauffeur se connectera avec son numéro de téléphone et ce code PIN via l'app <strong>/driver/</strong></div>
      </div>
    `;

    const formHtml = FormBuilder.build(fields) +
      chauffeurSection +
      `<div style="margin-top:-8px;margin-bottom:var(--space-md);font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:info-circle-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon> Si aucun mot de passe n'est défini, l'utilisateur devra en créer un lors de sa première connexion.</div>` +
      this._getPermissionsHTML(allPerms);

    Modal.form('<iconify-icon icon="solar:user-plus-bold-duotone" style="color:var(--primary);"></iconify-icon> Nouvel utilisateur', formHtml, async () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const permissions = this._collectPermissions(body);

      // Remove perm_* keys and pin (pin is handled separately via set-pin API with bcrypt)
      Object.keys(values).forEach(k => { if (k.startsWith('perm_') || k === 'pin') delete values[k]; });

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

      // Clean empty email to avoid duplicate key errors in MongoDB
      if (!values.email || !values.email.trim()) {
        Toast.error('L\'email est obligatoire pour créer un compte');
        return;
      }

      // Password is required for new users
      if (!pwd) {
        Toast.error('Le mot de passe est obligatoire pour un nouvel utilisateur');
        return;
      }

      // Save admin session before creating new auth user
      const adminToken = Auth.getToken();
      const adminSession = Auth.getSession();

      try {
        // 1. Create Supabase Auth account
        let authId = null;
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: values.email.trim(),
          password: pwd
        });

        if (authError) {
          // If user already registered in Auth, try signing in to get their auth_id
          if (authError.message && authError.message.includes('already registered')) {
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: values.email.trim(),
              password: pwd
            });
            if (signInError) {
              Toast.error('Ce compte existe déjà mais le mot de passe ne correspond pas. Utilisez le même mot de passe que lors de la première tentative.');
              return;
            }
            authId = signInData.user.id;
          } else {
            Toast.error(App._translateSupabaseError ? App._translateSupabaseError(authError.message) : authError.message);
            return;
          }
        } else {
          authId = authData.user.id;
        }

        // 2. Restore admin session (signUp/signIn may have changed the session)
        if (adminToken) {
          try {
            const currentSession = (await supabase.auth.getSession()).data?.session;
            await supabase.auth.setSession({
              access_token: adminToken,
              refresh_token: currentSession?.refresh_token || adminToken
            });
          } catch (e) {
            console.warn('Session restore warning:', e);
          }
          Auth.setToken(adminToken);
          if (adminSession) {
            localStorage.setItem(Auth._SESSION_KEY, JSON.stringify(adminSession));
          }
        }

        // 3. Insert fleet_users entry with auth_id (directly via Supabase)
        const newFleetUser = {
          auth_id: authId,
          email: values.email.trim(),
          prenom: values.prenom || '',
          nom: values.nom || '',
          telephone: values.telephone || null,
          role: values.role || 'Opérateur',
          statut: values.statut || 'actif',
          permissions: permissions,
          must_change_password: true,
          chauffeur_id: values.role === 'chauffeur' ? chauffeurId : null,
          created_at: new Date().toISOString()
        };

        const { data: insertedUser, error: insertError } = await supabase
          .from('fleet_users')
          .insert(newFleetUser)
          .select()
          .single();

        if (insertError) {
          console.error('fleet_users insert failed:', insertError);
          Toast.error('Erreur lors de la création : ' + (insertError.message || 'échec d\'insertion'));
          return;
        }

        // 4. Add to local Store cache (using camelCase)
        const userForStore = objToCamel(insertedUser);
        if (!Store._cache) Store._cache = Store._emptyData();
        if (!Store._cache.users) Store._cache.users = [];
        Store._cache.users.push(userForStore);
        Store._backupToLocalStorage();

        Modal.close();
        Toast.success('Utilisateur ' + values.prenom + ' ' + values.nom + ' créé avec mot de passe temporaire');
        this._renderTab('users');

      } catch (err) {
        console.error('User creation error:', err);
        Toast.error('Erreur : ' + (err.message || 'échec de création'));
        // Restore admin session on error
        if (adminToken && adminSession) {
          Auth.setToken(adminToken);
          localStorage.setItem(Auth._SESSION_KEY, JSON.stringify(adminSession));
        }
      }
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

    const permsWrapper = container.querySelector('#permissions-section');

    const toggle = () => {
      const isChauffeur = roleSelect.value === 'chauffeur';
      chauffeurSection.style.display = isChauffeur ? 'block' : 'none';

      // Hide/show permissions section for chauffeur role
      if (permsWrapper) {
        permsWrapper.style.display = isChauffeur ? 'none' : '';
      }

      // Auto-uncheck all permissions when chauffeur is selected
      if (isChauffeur) {
        container.querySelectorAll('#perms-grid input[type="checkbox"]').forEach(cb => { cb.checked = false; });
        this._updatePermLabels(container);
      }
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

    const apiBase = Store._apiBase || '/api';
    const headers = {
      'Content-Type': 'application/json'
    };
    // Include admin auth token
    const token = localStorage.getItem('pilote_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // Set PIN directly via Store update on chauffeurs table
    try {
      // Short delay to let Store.add() sync complete
      await new Promise(r => setTimeout(r, 500));

      const bcryptLoaded = typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt;
      let pinHash;
      if (bcryptLoaded) {
        const salt = dcodeIO.bcrypt.genSaltSync(10);
        pinHash = dcodeIO.bcrypt.hashSync(pin, salt);
      } else {
        // Fallback: store plain PIN (not ideal but functional without bcrypt)
        pinHash = pin;
      }

      Store.update('chauffeurs', chauffeurId, { pinHash: pinHash });
      console.log('PIN set successfully for chauffeur', chauffeurId);
      return true;
    } catch (e) {
      console.warn('Set PIN error:', e);
      return false;
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
      <div id="chauffeur-section" style="display:${user.role === 'chauffeur' ? 'block' : 'none'};margin-bottom:var(--space-md);padding:var(--space-md);border-radius:var(--radius-sm);border:2px solid var(--pilote-blue);background:rgba(59,130,246,0.05);">
        <h4 style="margin:0 0 var(--space-md);font-size:var(--font-size-sm);color:var(--pilote-blue);"><iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon> Configuration compte chauffeur</h4>
        <div style="display:flex;gap:var(--space-md);align-items:flex-end;margin-bottom:var(--space-md);">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label class="form-label">Chauffeur lié *</label>
            <select class="form-control" name="chauffeurId" id="add-chauffeurId">
              <option value="">-- Sélectionner un chauffeur --</option>
              ${chauffeurOptions}
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-success" id="btn-quick-add-chauffeur" style="white-space:nowrap;height:38px;"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Créer un chauffeur</button>
        </div>
        <div id="quick-chauffeur-form" style="display:none;margin-bottom:var(--space-md);padding:var(--space-md);border-radius:var(--radius-sm);background:rgba(34,197,94,0.06);border:1px dashed var(--success);">
          <h5 style="margin:0 0 var(--space-sm);font-size:var(--font-size-xs);font-weight:600;color:var(--success);"><iconify-icon icon="solar:bolt-bold-duotone"></iconify-icon> Création rapide</h5>
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
            <button type="button" class="btn btn-sm btn-success" id="btn-quick-chf-save"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Créer & lier</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Nouveau code PIN (laisser vide pour ne pas changer)</label>
          <input type="text" class="form-control" name="pin" id="add-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="****">
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-xs);"><iconify-icon icon="solar:info-circle-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon> Le chauffeur se connectera via l'app <strong>/driver/</strong></div>
      </div>
    `;

    // Password status info
    const pwdStatus = user.passwordHash
      ? `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:var(--radius-sm);background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);margin-bottom:var(--space-md);">
          <iconify-icon icon="solar:check-circle-bold-duotone" style="color:var(--success);"></iconify-icon>
          <span style="font-size:var(--font-size-xs);color:var(--text-secondary);">Mot de passe défini${user.mustChangePassword ? ' (temporaire — devra être changé)' : ''}</span>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-reset-pwd" style="margin-left:auto;"><iconify-icon icon="solar:key-bold-duotone"></iconify-icon> Réinitialiser</button>
        </div>`
      : `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:var(--radius-sm);background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);margin-bottom:var(--space-md);">
          <iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:var(--warning);"></iconify-icon>
          <span style="font-size:var(--font-size-xs);color:var(--text-secondary);">Aucun mot de passe — l'utilisateur devra en créer un à la première connexion</span>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-reset-pwd" style="margin-left:auto;"><iconify-icon icon="solar:key-bold-duotone"></iconify-icon> Définir</button>
        </div>`;

    const formHtml = FormBuilder.build(fields, user) + editChauffeurSection + pwdStatus + this._getPermissionsHTML(user.permissions || {});

    Modal.form('<iconify-icon icon="solar:user-pen-bold-duotone" style="color:var(--primary);"></iconify-icon> Modifier utilisateur', formHtml, async () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const permissions = this._collectPermissions(body);

      // Remove perm_* keys and pin (pin is handled separately via set-pin API with bcrypt)
      Object.keys(values).forEach(k => { if (k.startsWith('perm_') || k === 'pin') delete values[k]; });

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
        const pinSet = await this._setChauffeurPin(id, pinVal, chauffeurIdVal);
        if (pinSet) {
          Toast.success('PIN mis à jour');
        } else {
          Toast.error('Erreur lors de la mise à jour du PIN');
        }
      }

      // If editing the current user, refresh session
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
        const session = Auth.getSession();
        if (session && session.userId === id) {
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

    Modal.form('<iconify-icon icon="solar:key-bold-duotone" style="color:var(--warning);"></iconify-icon> Réinitialiser le mot de passe', formHtml, async () => {
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
            <span class="card-title"><iconify-icon icon="solar:buildings-bold-duotone"></iconify-icon> Informations de l'entreprise</span>
            <button class="btn btn-sm btn-primary" id="btn-save-entreprise"><iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Nom de l'entreprise *</label>
                <input type="text" class="form-control" id="ent-nom" value="${ent.nom || ''}" placeholder="Ex: Mon Entreprise">
              </div>
              <div class="form-group">
                <label class="form-label">Slogan</label>
                <input type="text" class="form-control" id="ent-slogan" value="${ent.slogan || ''}" placeholder="Ex: Transport de qualité">
              </div>
            </div>
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" class="form-control" id="ent-email" value="${ent.email || ''}" placeholder="contact@pilote.app">
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
                <input type="text" class="form-control" id="ent-siteweb" value="${ent.siteWeb || ''}" placeholder="www.pilote.app">
              </div>
              <div class="form-group">
                <label class="form-label">N° Registre du commerce</label>
                <input type="text" class="form-control" id="ent-registre" value="${ent.numeroRegistre || ''}" placeholder="CI-ABJ-2024-XXXX">
              </div>
            </div>
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group" style="max-width:200px;">
                <label class="form-label">Devise</label>
                <select class="form-control" id="ent-devise">
                  <option value="FCFA" ${ent.devise === 'FCFA' ? 'selected' : ''}>FCFA (Franc CFA)</option>
                  <option value="EUR" ${ent.devise === 'EUR' ? 'selected' : ''}>EUR (Euro)</option>
                  <option value="USD" ${ent.devise === 'USD' ? 'selected' : ''}>USD (Dollar US)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Objectif CA mensuel</label>
                <input type="number" class="form-control" id="ent-objectif-ca" value="${ent.objectifMensuelCA || ''}" placeholder="Ex: 3000000" min="0" step="50000">
                <small style="color:var(--text-muted);font-size:11px;">Si vide, calculé automatiquement depuis le planning et les redevances</small>
              </div>
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
                ${ent.email ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><iconify-icon icon="solar:letter-bold-duotone" style="color:var(--text-muted);width:16px;text-align:center;"></iconify-icon> ${ent.email}</div>` : ''}
                ${ent.telephone ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><iconify-icon icon="solar:phone-bold-duotone" style="color:var(--text-muted);width:16px;text-align:center;"></iconify-icon> ${ent.telephone}</div>` : ''}
                ${ent.adresse ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><iconify-icon icon="solar:map-point-bold-duotone" style="color:var(--text-muted);width:16px;text-align:center;"></iconify-icon> ${ent.adresse}</div>` : ''}
                ${ent.siteWeb ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><iconify-icon icon="solar:global-bold-duotone" style="color:var(--text-muted);width:16px;text-align:center;"></iconify-icon> ${ent.siteWeb}</div>` : ''}
                ${ent.numeroRegistre ? `<div style="display:flex;align-items:center;gap:10px;font-size:var(--font-size-sm);"><iconify-icon icon="solar:document-bold-duotone" style="color:var(--text-muted);width:16px;text-align:center;"></iconify-icon> ${ent.numeroRegistre}</div>` : ''}
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:var(--space-md);border-left:4px solid var(--pilote-blue);">
            <div style="display:flex;align-items:center;gap:var(--space-sm);">
              <iconify-icon icon="solar:lightbulb-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon>
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
      const objectifCA = parseInt(document.getElementById('ent-objectif-ca').value) || 0;
      settings.entreprise = {
        nom: document.getElementById('ent-nom').value.trim(),
        slogan: document.getElementById('ent-slogan').value.trim(),
        email: document.getElementById('ent-email').value.trim(),
        telephone: document.getElementById('ent-telephone').value.trim(),
        adresse: document.getElementById('ent-adresse').value.trim(),
        siteWeb: document.getElementById('ent-siteweb').value.trim(),
        numeroRegistre: document.getElementById('ent-registre').value.trim(),
        devise: document.getElementById('ent-devise').value,
        objectifMensuelCA: objectifCA > 0 ? objectifCA : null
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
            <span class="card-title"><iconify-icon icon="solar:palette-bold-duotone"></iconify-icon> Apparence</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-lg);padding-top:var(--space-md);">
            <div class="form-group">
              <label class="form-label">Thème par défaut</label>
              <div style="display:flex;gap:var(--space-md);">
                <label style="display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);border:2px solid ${currentTheme === 'dark' ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;transition:all 0.2s;">
                  <input type="radio" name="pref-theme" value="dark" ${currentTheme === 'dark' ? 'checked' : ''} style="accent-color:var(--primary);">
                  <iconify-icon icon="solar:moon-bold" style="color:var(--primary);"></iconify-icon>
                  <div>
                    <div style="font-weight:600;font-size:var(--font-size-sm);">Mode sombre</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Recommandé pour un usage prolongé</div>
                  </div>
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);border:2px solid ${currentTheme === 'light' ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;transition:all 0.2s;">
                  <input type="radio" name="pref-theme" value="light" ${currentTheme === 'light' ? 'checked' : ''} style="accent-color:var(--primary);">
                  <iconify-icon icon="solar:sun-bold-duotone" style="color:var(--warning);"></iconify-icon>
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
              <span class="card-title"><iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon> Notifications</span>
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
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border-color);">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);"><iconify-icon icon="solar:bell-bold-duotone" style="color:var(--primary);margin-right:4px;"></iconify-icon> Notifications push (taches)</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Recevoir des alertes meme quand l'app est fermee</div>
                  <div id="push-status-info" style="font-size:var(--font-size-xs);margin-top:4px;"></div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="pref-push-notifications">
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border-color);">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);"><iconify-icon icon="logos:whatsapp-icon" style="margin-right:4px;"></iconify-icon> Notifications WhatsApp (taches)</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Les alertes de taches sont envoyees automatiquement sur WhatsApp</div>
                </div>
                <span style="font-size:var(--font-size-xs);font-weight:600;color:#25D366;background:#25D3661a;padding:4px 10px;border-radius:12px;">Toujours actif</span>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title"><iconify-icon icon="solar:lock-bold-duotone"></iconify-icon> Sécurité</span>
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
        <button class="btn btn-primary" id="btn-save-preferences"><iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder les préférences</button>
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
    // Push notifications — detect current state and handle toggle
    this._initPushToggle();

    // Theme radio buttons — apply immediately via ThemeManager
    document.querySelectorAll('input[name="pref-theme"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const theme = radio.value;
        if (typeof ThemeManager !== 'undefined') {
          ThemeManager._applyTheme(theme, false);
          localStorage.setItem('pilote_theme', theme);
        } else {
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('pilote_theme', theme);
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
  },

  // ========================= PUSH & WHATSAPP NOTIFICATIONS TOGGLE =========================

  async _initPushToggle() {
    const toggle = document.getElementById('pref-push-notifications');
    const statusEl = document.getElementById('push-status-info');
    if (!toggle || !statusEl) return;

    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!session || session.role === 'chauffeur') {
      toggle.parentElement.parentElement.parentElement.style.display = 'none';
      return;
    }

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
        statusEl.innerHTML = '<span style="color:var(--success);font-weight:500;">Actif — vous recevrez des notifications push</span>';
      } else if (perm === 'denied') {
        toggle.disabled = true;
        statusEl.innerHTML = '<span style="color:var(--danger);">Bloque par le navigateur — autorisez les notifications dans les parametres du navigateur</span>';
      } else {
        toggle.checked = false;
        statusEl.innerHTML = '<span style="color:var(--text-muted);">Desactive — activez pour recevoir des alertes</span>';
      }
    } catch (e) {
      toggle.checked = false;
      statusEl.innerHTML = '<span style="color:var(--text-muted);">Impossible de verifier l\'etat</span>';
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
      // Request permission
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toggle.checked = false;
        statusEl.innerHTML = '<span style="color:var(--danger);">Permission refusee — autorisez les notifications dans les parametres du navigateur</span>';
        return;
      }

      statusEl.innerHTML = '<span style="color:var(--text-muted);">Activation en cours...</span>';

      const reg = await navigator.serviceWorker.ready;

      // Check if already subscribed
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        try {
          // Get VAPID key
          const apiBase = Store._apiBase || '/api';
          const token = Auth.getToken();
          const vapidRes = await fetch(apiBase + '/notifications/push/vapid-key', {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (!vapidRes.ok) throw new Error('Impossible de recuperer la cle VAPID');
          const { publicKey } = await vapidRes.json();
          if (!publicKey) throw new Error('Cle VAPID manquante');

          // Subscribe
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: App._urlBase64ToUint8Array(publicKey)
          });

          // Send to server
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
          statusEl.textContent = 'Notifications push non disponibles actuellement';
          Toast.error('Notifications push non disponibles actuellement');
          return;
        }
      }

      statusEl.textContent = 'Actif — vous recevrez des notifications push';
      Toast.success('Notifications push activees');
    } catch (e) {
      toggle.checked = false;
      statusEl.textContent = 'Erreur : ' + (e.message || 'echec activation');
      Toast.error('Impossible d\'activer les notifications : ' + (e.message || 'erreur'));
    }
  },

  async _disablePush(toggle, statusEl) {
    try {
      statusEl.textContent = 'Desactivation en cours...';

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        // Unsubscribe from browser
        await sub.unsubscribe();

        // Remove from server
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

      statusEl.textContent = 'Desactive — activez pour recevoir des alertes';
      Toast.success('Notifications push desactivees');
    } catch (e) {
      toggle.checked = true;
      statusEl.textContent = 'Erreur lors de la desactivation';
    }
  },

  // ========================= ONGLET VERSEMENTS (DEADLINE + PENALITES) =========================

  _renderVersementsSettings() {
    const settings = Store.get('settings') || {};
    const vs = settings.versements || {};
    const bonus = settings.bonus || {};
    const joursSemaine = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const dtype = vs.deadlineType || 'quotidien';
    const isQuotidien = dtype === 'quotidien';
    const isHebdo = dtype === 'hebdomadaire';
    const isMensuel = dtype === 'mensuel';

    return `
      <div class="grid-2" style="gap:var(--space-lg);">
        <!-- Deadline -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:clock-circle-bold-duotone" style="color:var(--primary);"></iconify-icon> Deadline de versement</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-lg);padding-top:var(--space-md);">

            <div class="form-group">
              <label class="form-label">Type de deadline</label>
              <div style="display:flex;gap:var(--space-md);flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);border:2px solid ${isQuotidien ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;min-width:140px;transition:all 0.2s;">
                  <input type="radio" name="vs-deadline-type" value="quotidien" ${isQuotidien ? 'checked' : ''} style="accent-color:var(--primary);">
                  <div>
                    <div style="font-weight:600;font-size:var(--font-size-sm);">Quotidien</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Lundi → Samedi</div>
                  </div>
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);border:2px solid ${isHebdo ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;min-width:140px;transition:all 0.2s;">
                  <input type="radio" name="vs-deadline-type" value="hebdomadaire" ${isHebdo ? 'checked' : ''} style="accent-color:var(--primary);">
                  <div>
                    <div style="font-weight:600;font-size:var(--font-size-sm);">Hebdomadaire</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Chaque semaine</div>
                  </div>
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);border:2px solid ${isMensuel ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;min-width:140px;transition:all 0.2s;">
                  <input type="radio" name="vs-deadline-type" value="mensuel" ${isMensuel ? 'checked' : ''} style="accent-color:var(--primary);">
                  <div>
                    <div style="font-weight:600;font-size:var(--font-size-sm);">Mensuel</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Chaque mois</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Info quotidien -->
            <div id="vs-info-quotidien" style="display:${isQuotidien ? 'block' : 'none'};padding:12px 16px;border-radius:var(--radius-sm);background:rgba(var(--primary-rgb,99,102,241),0.08);font-size:var(--font-size-xs);color:var(--text-secondary);">
              <iconify-icon icon="solar:info-circle-bold-duotone" style="color:var(--primary);margin-right:6px;"></iconify-icon>
              Les chauffeurs doivent verser leur recette <strong>chaque jour du lundi au samedi</strong> avant l'heure limite. Le dimanche est un jour de repos (pas de deadline).
            </div>

            <!-- Jour de la semaine (hebdo) -->
            <div class="form-group" id="vs-jour-hebdo" style="display:${isHebdo ? 'block' : 'none'};">
              <label class="form-label">Jour de la semaine</label>
              <select class="form-control" id="vs-deadline-jour-semaine">
                ${joursSemaine.map((j, i) => `<option value="${i}" ${(vs.deadlineJour || 0) === i ? 'selected' : ''}>${j}</option>`).join('')}
              </select>
            </div>

            <!-- Jour du mois (mensuel) -->
            <div class="form-group" id="vs-jour-mensuel" style="display:${isMensuel ? 'block' : 'none'};">
              <label class="form-label">Jour du mois</label>
              <input type="number" class="form-control" id="vs-deadline-jour-mois" min="1" max="31" value="${vs.deadlineJour || 1}" style="max-width:120px;">
            </div>

            <div class="form-group">
              <label class="form-label">Heure limite</label>
              <input type="time" class="form-control" id="vs-deadline-heure" value="${vs.deadlineHeure || '23:59'}" style="max-width:160px;">
            </div>

            <div class="form-group" style="border-top:1px solid var(--border-color);padding-top:var(--space-md);margin-top:var(--space-sm);">
              <label class="form-label">Objectif temps en ligne (heures)</label>
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="number" class="form-control" id="vs-objectif-temps" min="0" max="24" step="0.5" value="${((settings.objectifs?.tempsEnLigneMin || 630) / 60).toFixed(1)}" style="max-width:150px;" placeholder="10.5">
                <span style="font-size:var(--font-size-sm);color:var(--text-muted);font-weight:500;">heures/jour</span>
              </div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px;">Dur\u00e9e minimum en statut "en ligne" par jour. Alerte si le chauffeur termine en dessous.</div>
            </div>
          </div>
        </div>

        <!-- Penalites -->
        <div>
          <div class="card" style="margin-bottom:var(--space-lg);">
            <div class="card-header">
              <span class="card-title"><iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:var(--warning);"></iconify-icon> Pénalités de retard</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);">Activer les pénalités</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Applique une pénalité sur les versements en retard</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="vs-penalite-active" ${vs.penaliteActive ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div id="vs-penalite-details" style="display:${vs.penaliteActive ? 'flex' : 'none'};flex-direction:column;gap:var(--space-md);padding-top:var(--space-sm);border-top:1px solid var(--border-color);">
                <div class="form-group">
                  <label class="form-label">Type de pénalité</label>
                  <div style="display:flex;gap:var(--space-sm);">
                    <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:var(--radius-sm);border:1px solid ${(vs.penaliteType || 'pourcentage') === 'pourcentage' ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;">
                      <input type="radio" name="vs-penalite-type" value="pourcentage" ${(vs.penaliteType || 'pourcentage') === 'pourcentage' ? 'checked' : ''} style="accent-color:var(--primary);">
                      <span style="font-size:var(--font-size-sm);font-weight:500;">Pourcentage (%)</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:var(--radius-sm);border:1px solid ${vs.penaliteType === 'montant_fixe' ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;">
                      <input type="radio" name="vs-penalite-type" value="montant_fixe" ${vs.penaliteType === 'montant_fixe' ? 'checked' : ''} style="accent-color:var(--primary);">
                      <span style="font-size:var(--font-size-sm);font-weight:500;">Montant fixe (FCFA)</span>
                    </label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Valeur de la pénalité</label>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input type="number" class="form-control" id="vs-penalite-valeur" min="0" value="${vs.penaliteValeur || 5}" style="max-width:150px;">
                    <span id="vs-penalite-unite" style="font-size:var(--font-size-sm);color:var(--text-muted);font-weight:500;">${(vs.penaliteType || 'pourcentage') === 'pourcentage' ? '% du montant brut' : 'FCFA'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Alertes admin -->
          <div class="card" style="border-left:4px solid var(--pilote-blue);">
            <div class="card-header">
              <span class="card-title"><iconify-icon icon="solar:bell-bing-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon> Notifications admin</span>
            </div>
            <div style="padding-top:var(--space-md);">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);">Alerte retard de versement</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Recevoir une alerte quand un chauffeur est en retard</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="vs-alerte-retard" ${vs.alerteRetard !== false ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bonus de performance -->
      <div class="card" style="margin-top:var(--space-lg);border-top:3px solid #22c55e;">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:cup-bold-duotone" style="color:#22c55e;"></iconify-icon> Bonus de performance</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
            <div>
              <div style="font-weight:500;font-size:var(--font-size-sm);">Activer les bonus</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Récompense les chauffeurs atteignant un excellent score de conduite</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="bonus-actif" ${bonus.bonusActif ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div id="bonus-details" style="display:${bonus.bonusActif ? 'flex' : 'none'};flex-direction:column;gap:var(--space-md);padding-top:var(--space-sm);border-top:1px solid var(--border-color);">
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Score minimum requis</label>
                <div style="display:flex;align-items:center;gap:8px;">
                  <input type="number" class="form-control" id="bonus-score-min" min="50" max="100" value="${bonus.scoreMinimum || 90}" style="max-width:100px;">
                  <span style="font-size:var(--font-size-sm);color:var(--text-muted);">/ 100</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Temps d'activité Yango minimum</label>
                <div style="display:flex;align-items:center;gap:8px;">
                  <input type="number" class="form-control" id="bonus-activite-min" min="0" max="1440" value="${Math.round((bonus.tempsActiviteMin || 600) / 60)}" style="max-width:100px;">
                  <span style="font-size:var(--font-size-sm);color:var(--text-muted);">heures / jour</span>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Type de bonus</label>
              <div style="display:flex;gap:var(--space-sm);">
                <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:var(--radius-sm);border:1px solid ${(bonus.bonusType || 'montant_fixe') === 'montant_fixe' ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;">
                  <input type="radio" name="bonus-type" value="montant_fixe" ${(bonus.bonusType || 'montant_fixe') === 'montant_fixe' ? 'checked' : ''} style="accent-color:var(--primary);">
                  <span style="font-size:var(--font-size-sm);font-weight:500;">Montant fixe (FCFA)</span>
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:var(--radius-sm);border:1px solid ${bonus.bonusType === 'pourcentage' ? 'var(--primary)' : 'var(--border-color)'};cursor:pointer;flex:1;">
                  <input type="radio" name="bonus-type" value="pourcentage" ${bonus.bonusType === 'pourcentage' ? 'checked' : ''} style="accent-color:var(--primary);">
                  <span style="font-size:var(--font-size-sm);font-weight:500;">Pourcentage (%)</span>
                </label>
              </div>
            </div>

            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Valeur du bonus</label>
                <div style="display:flex;align-items:center;gap:8px;">
                  <input type="number" class="form-control" id="bonus-valeur" min="0" value="${bonus.bonusValeur || 5000}" style="max-width:150px;">
                  <span id="bonus-unite" style="font-size:var(--font-size-sm);color:var(--text-muted);font-weight:500;">${(bonus.bonusType || 'montant_fixe') === 'montant_fixe' ? 'FCFA' : '% du montant net'}</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Période d'évaluation</label>
                <select class="form-control" id="bonus-periode">
                  <option value="mensuel" ${(bonus.bonusPeriode || 'mensuel') === 'mensuel' ? 'selected' : ''}>Mensuel</option>
                  <option value="hebdomadaire" ${bonus.bonusPeriode === 'hebdomadaire' ? 'selected' : ''}>Hebdomadaire</option>
                </select>
              </div>
            </div>

            <div style="padding:12px 16px;border-radius:var(--radius-sm);background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);font-size:var(--font-size-xs);color:var(--text-secondary);">
              <iconify-icon icon="solar:info-circle-bold-duotone" style="color:#22c55e;margin-right:6px;"></iconify-icon>
              Le chauffeur doit atteindre <strong>un score de conduite ≥ <span id="bonus-info-score">${bonus.scoreMinimum || 90}</span>/100</strong> et <strong>un temps d'activité Yango ≥ <span id="bonus-info-activite">${Math.round((bonus.tempsActiviteMin || 600) / 60)}</span>h/jour</strong> pour recevoir le bonus de <strong><span id="bonus-info-valeur">${(bonus.bonusValeur || 5000).toLocaleString('fr-FR')}</span> <span id="bonus-info-unite">${(bonus.bonusType || 'montant_fixe') === 'montant_fixe' ? 'FCFA' : '%'}</span></strong>.
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top:var(--space-lg);display:flex;justify-content:flex-end;">
        <button class="btn btn-primary" id="btn-save-versements-settings"><iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder la configuration</button>
      </div>
    `;
  },

  _bindVersementsSettingsEvents() {
    // Toggle quotidien/hebdo/mensuel → switch jour selector
    document.querySelectorAll('input[name="vs-deadline-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const val = radio.value;
        document.getElementById('vs-info-quotidien').style.display = val === 'quotidien' ? 'block' : 'none';
        document.getElementById('vs-jour-hebdo').style.display = val === 'hebdomadaire' ? 'block' : 'none';
        document.getElementById('vs-jour-mensuel').style.display = val === 'mensuel' ? 'block' : 'none';
        // Update radio border
        document.querySelectorAll('input[name="vs-deadline-type"]').forEach(r => {
          r.closest('label').style.borderColor = r.checked ? 'var(--primary)' : 'var(--border-color)';
        });
      });
    });

    // Toggle penalite active → show/hide details
    const penaliteToggle = document.getElementById('vs-penalite-active');
    if (penaliteToggle) {
      penaliteToggle.addEventListener('change', () => {
        document.getElementById('vs-penalite-details').style.display = penaliteToggle.checked ? 'flex' : 'none';
      });
    }

    // Toggle penalite type → update unite label
    document.querySelectorAll('input[name="vs-penalite-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const unite = document.getElementById('vs-penalite-unite');
        if (unite) unite.textContent = radio.value === 'pourcentage' ? '% du montant brut' : 'FCFA';
        // Update radio borders
        document.querySelectorAll('input[name="vs-penalite-type"]').forEach(r => {
          r.closest('label').style.borderColor = r.checked ? 'var(--primary)' : 'var(--border-color)';
        });
      });
    });

    // Toggle bonus actif → show/hide details
    const bonusToggle = document.getElementById('bonus-actif');
    if (bonusToggle) {
      bonusToggle.addEventListener('change', () => {
        document.getElementById('bonus-details').style.display = bonusToggle.checked ? 'flex' : 'none';
      });
    }

    // Toggle bonus type → update unite label
    document.querySelectorAll('input[name="bonus-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const unite = document.getElementById('bonus-unite');
        const infoUnite = document.getElementById('bonus-info-unite');
        if (unite) unite.textContent = radio.value === 'montant_fixe' ? 'FCFA' : '% du montant net';
        if (infoUnite) infoUnite.textContent = radio.value === 'montant_fixe' ? 'FCFA' : '%';
        document.querySelectorAll('input[name="bonus-type"]').forEach(r => {
          r.closest('label').style.borderColor = r.checked ? 'var(--primary)' : 'var(--border-color)';
        });
      });
    });

    // Update bonus info banner dynamically
    const bonusScoreInput = document.getElementById('bonus-score-min');
    const bonusActiviteInput = document.getElementById('bonus-activite-min');
    const bonusValeurInput = document.getElementById('bonus-valeur');
    if (bonusScoreInput) bonusScoreInput.addEventListener('input', () => {
      const el = document.getElementById('bonus-info-score');
      if (el) el.textContent = bonusScoreInput.value;
    });
    if (bonusActiviteInput) bonusActiviteInput.addEventListener('input', () => {
      const el = document.getElementById('bonus-info-activite');
      if (el) el.textContent = bonusActiviteInput.value;
    });
    if (bonusValeurInput) bonusValeurInput.addEventListener('input', () => {
      const el = document.getElementById('bonus-info-valeur');
      if (el) el.textContent = parseInt(bonusValeurInput.value || 0).toLocaleString('fr-FR');
    });

    // Save
    document.getElementById('btn-save-versements-settings').addEventListener('click', () => {
      const deadlineType = document.querySelector('input[name="vs-deadline-type"]:checked')?.value || 'quotidien';
      let deadlineJour = 0;
      if (deadlineType === 'hebdomadaire') {
        deadlineJour = parseInt(document.getElementById('vs-deadline-jour-semaine').value);
      } else if (deadlineType === 'mensuel') {
        deadlineJour = parseInt(document.getElementById('vs-deadline-jour-mois').value) || 1;
      }
      const deadlineHeure = document.getElementById('vs-deadline-heure').value || '23:59';
      const penaliteActive = document.getElementById('vs-penalite-active').checked;
      const penaliteType = document.querySelector('input[name="vs-penalite-type"]:checked')?.value || 'pourcentage';
      const penaliteValeur = parseInt(document.getElementById('vs-penalite-valeur').value) || 0;
      const alerteRetard = document.getElementById('vs-alerte-retard').checked;

      // Bonus config
      const bonusActif = document.getElementById('bonus-actif').checked;
      const scoreMinimum = parseInt(document.getElementById('bonus-score-min').value) || 90;
      const tempsActiviteMin = (parseInt(document.getElementById('bonus-activite-min').value) || 10) * 60;
      const bonusType = document.querySelector('input[name="bonus-type"]:checked')?.value || 'montant_fixe';
      const bonusValeur = parseInt(document.getElementById('bonus-valeur').value) || 5000;
      const bonusPeriode = document.getElementById('bonus-periode').value || 'mensuel';

      const settings = Store.get('settings') || {};
      // Objectif temps en ligne (en minutes)
      const tempsEnLigneHeures = parseFloat(document.getElementById('vs-objectif-temps').value) || 10.5;
      const tempsEnLigneMin = Math.round(tempsEnLigneHeures * 60);

      settings.versements = {
        deadlineType,
        deadlineJour,
        deadlineHeure,
        penaliteActive,
        penaliteType,
        penaliteValeur,
        alerteRetard
      };
      settings.objectifs = {
        tempsEnLigneMin,
        alerteTempsEnLigne: true
      };
      settings.bonus = {
        bonusActif,
        scoreMinimum,
        tempsActiviteMin,
        bonusType,
        bonusValeur,
        bonusPeriode
      };

      Store.set('settings', settings);
      Toast.success('Configuration des versements sauvegardée');
    });
  },

  // ========================= ONGLET NOTIFICATIONS =========================

  _renderNotificationsSettings() {
    const settings = Store.get('settings') || {};
    const notif = settings.notifications || {};

    return `
      <div class="grid-2" style="gap:var(--space-lg);">
        <!-- Canaux -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:satellite-bold-duotone" style="color:var(--primary);"></iconify-icon> Canaux de notification</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">

            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
              <div>
                <div style="font-weight:500;font-size:var(--font-size-sm);"><iconify-icon icon="solar:bell-bing-bold-duotone" style="color:var(--primary);margin-right:6px;"></iconify-icon> Push (PWA)</div>
                <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Notifications dans le navigateur/mobile des chauffeurs. Gratuit.</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="notif-push-actif" ${notif.pushActif !== false ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border-color);">
              <div>
                <div style="font-weight:500;font-size:var(--font-size-sm);"><iconify-icon icon="solar:chat-dots-bold-duotone" style="color:#22c55e;margin-right:6px;"></iconify-icon> SMS (Twilio)</div>
                <div style="font-size:var(--font-size-xs);color:var(--text-muted);">SMS aux chauffeurs. Necessite un compte Twilio (~0.05$/SMS).</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="notif-sms-actif" ${notif.smsActif ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border-color);">
              <div>
                <div style="font-weight:500;font-size:var(--font-size-sm);"><iconify-icon icon="mdi:whatsapp" style="color:#25D366;margin-right:6px;"></iconify-icon> WhatsApp (Twilio)</div>
                <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Messages WhatsApp aux chauffeurs via Twilio (~0.005$/msg).</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="notif-whatsapp-actif" ${notif.whatsappActif ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="form-group" style="border-top:1px solid var(--border-color);padding-top:var(--space-md);">
              <label class="form-label"><iconify-icon icon="solar:phone-bold-duotone" style="color:var(--primary);margin-right:4px;"></iconify-icon> Telephone admin (pour alertes SMS)</label>
              <input type="tel" class="form-control" id="notif-tel-admin" value="${notif.telephoneAdmin || ''}" placeholder="+225 07 XX XX XX XX">
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Recoit les SMS d'alerte retard des chauffeurs</div>
            </div>

            <div class="form-group">
              <label class="form-label"><iconify-icon icon="mdi:whatsapp" style="color:#25D366;margin-right:4px;"></iconify-icon> WhatsApp admin (pour alertes)</label>
              <input type="tel" class="form-control" id="notif-tel-admin-whatsapp" value="${notif.telephoneAdminWhatsapp || ''}" placeholder="+225 07 XX XX XX XX">
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Recoit les alertes WhatsApp. Laissez vide pour utiliser le meme numero SMS.</div>
            </div>
          </div>
        </div>

        <!-- Rappels deadline -->
        <div>
          <div class="card" style="margin-bottom:var(--space-lg);">
            <div class="card-header">
              <span class="card-title"><iconify-icon icon="solar:hourglass-bold-duotone" style="color:#f59e0b;"></iconify-icon> Rappels deadline</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-sm);padding-top:var(--space-md);">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);">Rappel 24h avant</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Envoye quand il reste 24h avant la deadline</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="notif-rappel-24h" ${notif.rappelDeadline24h !== false ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border-color);">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);">Rappel 1h avant</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Rappel urgent 1 heure avant la deadline</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="notif-rappel-1h" ${notif.rappelDeadline1h !== false ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <!-- Documents -->
          <div class="card">
            <div class="card-header">
              <span class="card-title"><iconify-icon icon="solar:user-id-bold-duotone" style="color:#6366f1;"></iconify-icon> Expiration documents</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-sm);padding-top:var(--space-md);">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);">Alerte 30 jours avant</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Permis, carte VTC, assurance</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="notif-doc-30j" ${notif.alerteDocuments30j !== false ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border-color);">
                <div>
                  <div style="font-weight:500;font-size:var(--font-size-sm);">Alerte 7 jours avant</div>
                  <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Rappel urgent avant expiration</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="notif-doc-7j" ${notif.alerteDocuments7j !== false ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Score conduite + Admin retard -->
      <div class="grid-2" style="gap:var(--space-lg);margin-top:var(--space-lg);">
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:spedometer-max-bold-duotone" style="color:#ef4444;"></iconify-icon> Score de conduite</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
              <div>
                <div style="font-weight:500;font-size:var(--font-size-sm);">Alerte score faible</div>
                <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Previent le chauffeur si son score est trop bas</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="notif-score-faible" ${notif.alerteScoreFaible !== false ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="form-group" id="notif-score-seuil-group" style="display:${notif.alerteScoreFaible !== false ? 'block' : 'none'};padding-top:var(--space-sm);border-top:1px solid var(--border-color);">
              <label class="form-label">Seuil d'alerte</label>
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="number" class="form-control" id="notif-score-seuil" min="30" max="90" value="${notif.scoreSeuilAlerte || 60}" style="max-width:100px;">
                <span style="font-size:var(--font-size-sm);color:var(--text-muted);">/ 100</span>
              </div>
            </div>
          </div>
        </div>

        <div class="card" style="border-left:4px solid var(--pilote-blue);">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:shield-user-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon> Alertes admin</span>
          </div>
          <div style="padding-top:var(--space-md);">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
              <div>
                <div style="font-weight:500;font-size:var(--font-size-sm);">SMS retard de versement</div>
                <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Recevoir un SMS quand un chauffeur est en retard</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="notif-admin-retard" ${notif.alerteAdminRetard !== false ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Envoyer une annonce -->
      <div class="card" style="margin-top:var(--space-lg);border-top:3px solid #FC4C02;">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:megaphone-bold-duotone" style="color:#FC4C02;"></iconify-icon> Envoyer une annonce</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
          <div class="form-group">
            <label class="form-label">Titre</label>
            <input type="text" class="form-control" id="annonce-titre" placeholder="Ex: Reunion demain matin" maxlength="100">
          </div>
          <div class="form-group">
            <label class="form-label">Message</label>
            <textarea class="form-control" id="annonce-message" rows="3" placeholder="Ecrivez votre message ici..." maxlength="500"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Canal d'envoi</label>
            <div style="display:flex;gap:var(--space-sm);">
              <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:var(--radius-sm);border:2px solid var(--primary);cursor:pointer;flex:1;">
                <input type="radio" name="annonce-canal" value="push" checked style="accent-color:var(--primary);">
                <span style="font-size:var(--font-size-sm);font-weight:500;"><iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon> Push</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:var(--radius-sm);border:2px solid var(--border-color);cursor:pointer;flex:1;">
                <input type="radio" name="annonce-canal" value="sms" style="accent-color:var(--primary);">
                <span style="font-size:var(--font-size-sm);font-weight:500;"><iconify-icon icon="solar:chat-dots-bold-duotone"></iconify-icon> SMS</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:var(--radius-sm);border:2px solid var(--border-color);cursor:pointer;flex:1;">
                <input type="radio" name="annonce-canal" value="both" style="accent-color:var(--primary);">
                <span style="font-size:var(--font-size-sm);font-weight:500;"><iconify-icon icon="solar:plain-bold-duotone"></iconify-icon> Les deux</span>
              </label>
            </div>
          </div>
          <button class="btn btn-warning" id="btn-send-annonce" style="align-self:flex-start;">
            <iconify-icon icon="solar:plain-bold-duotone"></iconify-icon> Envoyer a tous les chauffeurs
          </button>
          <div id="annonce-result" style="display:none;"></div>
        </div>
      </div>

      <div style="margin-top:var(--space-lg);display:flex;justify-content:flex-end;">
        <button class="btn btn-primary" id="btn-save-notifications-settings"><iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder la configuration</button>
      </div>
    `;
  },

  _bindNotificationsSettingsEvents() {
    // Toggle score faible → show/hide seuil
    const scoreToggle = document.getElementById('notif-score-faible');
    if (scoreToggle) {
      scoreToggle.addEventListener('change', () => {
        const group = document.getElementById('notif-score-seuil-group');
        if (group) group.style.display = scoreToggle.checked ? 'block' : 'none';
      });
    }

    // Annonce canal radio → update border colors
    document.querySelectorAll('input[name="annonce-canal"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('input[name="annonce-canal"]').forEach(r => {
          r.closest('label').style.borderColor = r.checked ? 'var(--primary)' : 'var(--border-color)';
        });
      });
    });

    // Envoyer annonce
    const sendBtn = document.getElementById('btn-send-annonce');
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        const titre = document.getElementById('annonce-titre').value.trim();
        const message = document.getElementById('annonce-message').value.trim();
        const canal = document.querySelector('input[name="annonce-canal"]:checked')?.value || 'push';
        const resultDiv = document.getElementById('annonce-result');

        if (!titre || !message) {
          Toast.error('Veuillez remplir le titre et le message');
          return;
        }

        sendBtn.disabled = true;
        sendBtn.innerHTML = '<iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Envoi en cours...';

        try {
          const activeChauffs = Store.getAll('chauffeurs').filter(c => c.statut === 'actif');
          const notifRows = activeChauffs.map(c => objToSnake({
            chauffeurId: c.id, type: 'annonce', titre, message, canal, statut: 'envoyee'
          }));
          const { error: notifErr } = await supabase.from('fleet_notifications').insert(notifRows);

          if (!notifErr) {
            Toast.success(`Annonce envoyee a ${activeChauffs.length} chauffeur(s)`);
            document.getElementById('annonce-titre').value = '';
            document.getElementById('annonce-message').value = '';
            if (resultDiv) {
              resultDiv.style.display = 'block';
              resultDiv.innerHTML = `
                <div style="padding:12px 16px;border-radius:var(--radius-sm);background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);font-size:var(--font-size-xs);">
                  <iconify-icon icon="solar:check-circle-bold-duotone" style="color:#22c55e;margin-right:6px;"></iconify-icon>
                  <strong>${data.sent}</strong> envoyee(s), <strong>${data.failed}</strong> echec(s) sur <strong>${data.total}</strong> chauffeur(s)
                </div>
              `;
            }
          } else {
            Toast.error(data.error || 'Erreur lors de l\'envoi');
          }
        } catch (err) {
          Toast.error('Erreur reseau: ' + err.message);
        }

        sendBtn.disabled = false;
        sendBtn.innerHTML = '<iconify-icon icon="solar:plain-bold-duotone"></iconify-icon> Envoyer a tous les chauffeurs';
      });
    }

    // Sauvegarder configuration notifications
    document.getElementById('btn-save-notifications-settings').addEventListener('click', () => {
      const notifications = {
        pushActif: document.getElementById('notif-push-actif').checked,
        smsActif: document.getElementById('notif-sms-actif').checked,
        whatsappActif: document.getElementById('notif-whatsapp-actif').checked,
        rappelDeadline24h: document.getElementById('notif-rappel-24h').checked,
        rappelDeadline1h: document.getElementById('notif-rappel-1h').checked,
        alerteDocuments30j: document.getElementById('notif-doc-30j').checked,
        alerteDocuments7j: document.getElementById('notif-doc-7j').checked,
        alerteScoreFaible: document.getElementById('notif-score-faible').checked,
        scoreSeuilAlerte: parseInt(document.getElementById('notif-score-seuil').value) || 60,
        alerteAdminRetard: document.getElementById('notif-admin-retard').checked,
        telephoneAdmin: document.getElementById('notif-tel-admin').value.trim(),
        telephoneAdminWhatsapp: document.getElementById('notif-tel-admin-whatsapp').value.trim()
      };

      const settings = Store.get('settings') || {};
      settings.notifications = notifications;
      Store.set('settings', settings);
      Toast.success('Configuration des notifications sauvegardee');
    });
  },

  // ========================= ONGLET PARCS =========================

  _renderParcs() {
    const parcs = Store.get('parcs') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];
    const parcActif = localStorage.getItem('pilote_parc_actif') || '';

    return `
      <div class="grid-2" style="gap:var(--space-lg);">
        <div>
          <div class="card">
            <div class="card-header">
              <span class="card-title"><iconify-icon icon="solar:garage-bold-duotone"></iconify-icon> Gestion des parcs</span>
              <button class="btn btn-sm btn-primary" id="btn-add-parc"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouveau parc</button>
            </div>
            <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:var(--space-md);">
              Organisez vos véhicules et chauffeurs en parcs pour une gestion multi-sites. Le filtre parc s'applique sur tout le tableau de bord.
            </p>

            ${parcs.length === 0 ? `
              <div style="text-align:center;padding:var(--space-xl);color:var(--text-muted);">
                <iconify-icon icon="solar:garage-bold-duotone" style="font-size:48px;opacity:0.3;"></iconify-icon>
                <p style="margin-top:var(--space-sm);">Aucun parc créé. Créez votre premier parc pour organiser votre flotte.</p>
              </div>
            ` : `
              <!-- Filtre parc actif -->
              <div style="margin-bottom:var(--space-md);padding:12px;border-radius:var(--radius-sm);background:var(--bg-tertiary);display:flex;align-items:center;gap:10px;">
                <iconify-icon icon="solar:filter-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon>
                <span style="font-size:var(--font-size-sm);font-weight:600;">Parc actif :</span>
                <select class="form-control" id="select-parc-actif" style="flex:1;max-width:200px;">
                  <option value="">Tous les parcs</option>
                  ${parcs.map(p => `<option value="${p.id}" ${parcActif === p.id ? 'selected' : ''}>${p.nom}</option>`).join('')}
                </select>
              </div>

              ${parcs.map(p => {
                const nbChauffeurs = chauffeurs.filter(c => c.parcId === p.id).length;
                const nbVehicules = vehicules.filter(v => v.parcId === p.id).length;
                return `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:var(--radius-sm);background:var(--bg-tertiary);margin-bottom:8px;border-left:4px solid ${p.couleur || 'var(--pilote-blue)'};">
                    <div>
                      <div style="font-weight:600;">${p.nom}</div>
                      <div style="font-size:var(--font-size-xs);color:var(--text-muted);">
                        <iconify-icon icon="solar:user-bold-duotone"></iconify-icon> ${nbChauffeurs} chauffeur${nbChauffeurs > 1 ? 's' : ''}
                        <span style="margin:0 6px;">•</span>
                        <iconify-icon icon="solar:wheel-bold-duotone"></iconify-icon> ${nbVehicules} véhicule${nbVehicules > 1 ? 's' : ''}
                        ${p.adresse ? `<span style="margin:0 6px;">•</span><iconify-icon icon="solar:map-point-bold-duotone"></iconify-icon> ${p.adresse}` : ''}
                      </div>
                    </div>
                    <div style="display:flex;gap:6px;">
                      <button class="btn btn-sm btn-secondary" onclick="ParametresPage._editParc('${p.id}')"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
                      <button class="btn btn-sm btn-danger" onclick="ParametresPage._deleteParc('${p.id}')"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
                    </div>
                  </div>
                `;
              }).join('')}
            `}
          </div>
        </div>

        <!-- Aide -->
        <div>
          <div class="card" style="border-left:4px solid var(--pilote-blue);">
            <div style="display:flex;align-items:flex-start;gap:var(--space-sm);">
              <iconify-icon icon="solar:lightbulb-bold-duotone" style="color:var(--pilote-blue);font-size:20px;flex-shrink:0;"></iconify-icon>
              <div>
                <p style="font-size:var(--font-size-sm);font-weight:600;margin-bottom:8px;">Comment utiliser les parcs ?</p>
                <ul style="font-size:var(--font-size-xs);color:var(--text-muted);padding-left:16px;display:flex;flex-direction:column;gap:6px;">
                  <li>Créez un parc pour chaque site ou zone géographique</li>
                  <li>Assignez vos chauffeurs et véhicules à un parc via leur fiche</li>
                  <li>Filtrez le tableau de bord par parc pour une vue ciblée</li>
                  <li>Le parc actif filtre automatiquement toutes les données</li>
                </ul>
              </div>
            </div>
          </div>

          ${parcs.length > 0 ? `
            <div class="card" style="margin-top:var(--space-md);">
              <div class="card-header">
                <span class="card-title">Répartition</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                ${parcs.map(p => {
                  const nbC = chauffeurs.filter(c => c.parcId === p.id).length;
                  const nbV = vehicules.filter(v => v.parcId === p.id).length;
                  const total = nbC + nbV;
                  const maxTotal = Math.max(...parcs.map(pp => chauffeurs.filter(c => c.parcId === pp.id).length + vehicules.filter(v => v.parcId === pp.id).length), 1);
                  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                  return `
                    <div>
                      <div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);margin-bottom:4px;">
                        <span style="font-weight:600;">${p.nom}</span>
                        <span style="color:var(--text-muted);">${total} éléments</span>
                      </div>
                      <div style="height:6px;border-radius:3px;background:var(--bg-tertiary);overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:${p.couleur || 'var(--pilote-blue)'};border-radius:3px;transition:width 0.3s;"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);margin-bottom:4px;">
                    <span style="font-weight:600;color:var(--text-muted);">Non assignés</span>
                    <span style="color:var(--text-muted);">${chauffeurs.filter(c => !c.parcId).length + vehicules.filter(v => !v.parcId).length} éléments</span>
                  </div>
                  <div style="height:6px;border-radius:3px;background:var(--bg-tertiary);overflow:hidden;">
                    <div style="height:100%;width:${Math.max(...parcs.map(pp => chauffeurs.filter(c => c.parcId === pp.id).length + vehicules.filter(v => v.parcId === pp.id).length), 1) > 0 ? ((chauffeurs.filter(c => !c.parcId).length + vehicules.filter(v => !v.parcId).length) / Math.max(...parcs.map(pp => chauffeurs.filter(c => c.parcId === pp.id).length + vehicules.filter(v => v.parcId === pp.id).length), 1)) * 100 : 0}%;background:var(--text-muted);border-radius:3px;"></div>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  _bindParcsEvents() {
    document.getElementById('btn-add-parc')?.addEventListener('click', () => this._addParc());

    document.getElementById('select-parc-actif')?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        localStorage.setItem('pilote_parc_actif', val);
      } else {
        localStorage.removeItem('pilote_parc_actif');
      }
      Toast.success(val ? 'Parc actif mis à jour' : 'Filtre parc désactivé');
    });
  },

  _addParc() {
    const fields = [
      { name: 'nom', label: 'Nom du parc', type: 'text', required: true, placeholder: 'Ex: Abidjan Nord' },
      { name: 'adresse', label: 'Adresse / Zone', type: 'text', placeholder: 'Ex: Cocody, Abidjan' },
      { name: 'couleur', label: 'Couleur', type: 'select', options: [
        { value: '#3b82f6', label: '🔵 Bleu' },
        { value: '#22c55e', label: '🟢 Vert' },
        { value: '#f59e0b', label: '🟡 Orange' },
        { value: '#ef4444', label: '🔴 Rouge' },
        { value: '#8b5cf6', label: '🟣 Violet' },
        { value: '#06b6d4', label: '🔵 Cyan' }
      ]},
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ];

    Modal.form('<iconify-icon icon="solar:garage-bold-duotone" class="text-blue"></iconify-icon> Nouveau parc', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);

      const parcs = Store.get('parcs') || [];
      parcs.push({ id: Utils.generateId('PRC'), ...values, dateCreation: new Date().toISOString() });
      Store.set('parcs', parcs);
      Modal.close();
      Toast.success('Parc créé');
      this._renderTab('parcs');
    });
  },

  _editParc(id) {
    const parcs = Store.get('parcs') || [];
    const parc = parcs.find(p => p.id === id);
    if (!parc) return;

    const fields = [
      { name: 'nom', label: 'Nom du parc', type: 'text', required: true },
      { name: 'adresse', label: 'Adresse / Zone', type: 'text' },
      { name: 'couleur', label: 'Couleur', type: 'select', options: [
        { value: '#3b82f6', label: '🔵 Bleu' },
        { value: '#22c55e', label: '🟢 Vert' },
        { value: '#f59e0b', label: '🟡 Orange' },
        { value: '#ef4444', label: '🔴 Rouge' },
        { value: '#8b5cf6', label: '🟣 Violet' },
        { value: '#06b6d4', label: '🔵 Cyan' }
      ]},
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ];

    Modal.form('<iconify-icon icon="solar:pen-bold-duotone" class="text-blue"></iconify-icon> Modifier le parc', FormBuilder.build(fields, parc), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      Object.assign(parc, values);
      Store.set('parcs', parcs);
      Modal.close();
      Toast.success('Parc modifié');
      this._renderTab('parcs');
    });
  },

  _deleteParc(id) {
    const parcs = Store.get('parcs') || [];
    const parc = parcs.find(p => p.id === id);
    if (!parc) return;

    Modal.confirm('Supprimer le parc', `Voulez-vous supprimer le parc <strong>${parc.nom}</strong> ? Les chauffeurs et véhicules associés seront désassignés.`, () => {
      // Remove parc from entities
      const chauffeurs = Store.get('chauffeurs') || [];
      chauffeurs.filter(c => c.parcId === id).forEach(c => {
        Store.update('chauffeurs', c.id, { parcId: '' });
      });
      const vehicules = Store.get('vehicules') || [];
      vehicules.filter(v => v.parcId === id).forEach(v => {
        Store.update('vehicules', v.id, { parcId: '' });
      });

      const filtered = parcs.filter(p => p.id !== id);
      Store.set('parcs', filtered);

      if (localStorage.getItem('pilote_parc_actif') === id) {
        localStorage.removeItem('pilote_parc_actif');
      }

      Toast.success('Parc supprimé');
      this._renderTab('parcs');
    });
  },

  // ========================= ONGLET INTÉGRATIONS =========================

  _renderIntegrations() {
    const settings = Store.get('settings') || {};
    const integrations = settings.integrations || {};
    const wave = integrations.wave || {};
    const yango = integrations.yango || {};

    const waveConfigured = wave.configured || (wave.apiKey && wave.apiKey !== '');
    const yangoConfigured = yango.configured || (yango.parkId && yango.apiKey && yango.parkId !== '' && yango.apiKey !== '');

    return '<div class="grid-2" style="gap:var(--space-lg);">' +

      // ---- Wave Card ----
      '<div class="card">' +
        '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">' +
          '<span class="card-title" style="display:flex;align-items:center;gap:8px;">' +
            '<iconify-icon icon="solar:wallet-money-bold-duotone" style="font-size:24px;color:#7c3aed;"></iconify-icon> Wave Money' +
          '</span>' +
          '<span class="badge ' + (waveConfigured ? 'badge-success' : 'badge-danger') + '">' +
            (waveConfigured ? 'Connecté' : 'Non configuré') +
          '</span>' +
        '</div>' +
        '<div style="padding-top:var(--space-md);display:flex;flex-direction:column;gap:var(--space-md);">' +
          '<div class="form-group">' +
            '<label class="form-label">Clé API Wave</label>' +
            '<div style="position:relative;">' +
              '<input type="password" id="wave-api-key" class="form-control" placeholder="Entrez votre clé API Wave" value="' + (wave.apiKey || '') + '" style="padding-right:40px;" />' +
              '<button type="button" class="btn-toggle-password" onclick="ParametresPage._togglePasswordField(\'wave-api-key\')" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">' +
                '<iconify-icon icon="solar:eye-bold-duotone"></iconify-icon>' +
              '</button>' +
            '</div>' +
            '<small style="color:var(--text-muted);">Disponible dans votre dashboard Wave Business</small>' +
          '</div>' +
          '<div style="display:flex;gap:var(--space-sm);">' +
            '<button class="btn btn-primary" id="save-wave-btn" style="flex:1;">' +
              '<iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder' +
            '</button>' +
            '<button class="btn btn-outline" id="test-wave-btn">' +
              '<iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tester' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ---- Yango Card ----
      '<div class="card">' +
        '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">' +
          '<span class="card-title" style="display:flex;align-items:center;gap:8px;">' +
            '<iconify-icon icon="solar:taxi-bold-duotone" style="font-size:24px;color:#f59e0b;"></iconify-icon> Yango Fleet' +
          '</span>' +
          '<span class="badge ' + (yangoConfigured ? 'badge-success' : 'badge-danger') + '">' +
            (yangoConfigured ? 'Connecté' : 'Non configuré') +
          '</span>' +
        '</div>' +
        '<div style="padding-top:var(--space-md);display:flex;flex-direction:column;gap:var(--space-md);">' +
          '<div class="form-group">' +
            '<label class="form-label">Park ID</label>' +
            '<input type="text" id="yango-park-id" class="form-control" placeholder="ID du parc Yango" value="' + (yango.parkId || '') + '" />' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Clé API</label>' +
            '<div style="position:relative;">' +
              '<input type="password" id="yango-api-key" class="form-control" placeholder="Clé API Yango" value="' + (yango.apiKey || '') + '" style="padding-right:40px;" />' +
              '<button type="button" onclick="ParametresPage._togglePasswordField(\'yango-api-key\')" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">' +
                '<iconify-icon icon="solar:eye-bold-duotone"></iconify-icon>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label">Client ID</label>' +
            '<input type="text" id="yango-client-id" class="form-control" placeholder="taxi/park/VOTRE_PARK_ID" value="' + (yango.clientId || '') + '" />' +
          '</div>' +
          '<div style="display:flex;gap:var(--space-sm);">' +
            '<button class="btn btn-primary" id="save-yango-btn" style="flex:1;">' +
              '<iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder' +
            '</button>' +
            '<button class="btn btn-outline" id="test-yango-btn">' +
              '<iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tester' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

    '</div>' +

    // ---- Info note ----
    '<div class="card" style="margin-top:var(--space-lg);border-left:4px solid var(--primary);">' +
      '<div style="display:flex;align-items:flex-start;gap:var(--space-md);">' +
        '<iconify-icon icon="solar:info-circle-bold-duotone" style="font-size:24px;color:var(--primary);flex-shrink:0;margin-top:2px;"></iconify-icon>' +
        '<div>' +
          '<div style="font-weight:600;margin-bottom:4px;">Comment ça marche ?</div>' +
          '<p style="color:var(--text-muted);margin:0;font-size:var(--font-size-sm);line-height:1.6;">' +
            'Les clés API configurées ici sont stockées de manière sécurisée en base de données. ' +
            'Elles sont prioritaires sur les variables d\'environnement du serveur. ' +
            'Les modifications prennent effet immédiatement, sans redémarrage.' +
          '</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  },

  _bindIntegrationsEvents() {
    // Save Wave
    const saveWaveBtn = document.getElementById('save-wave-btn');
    if (saveWaveBtn) {
      saveWaveBtn.addEventListener('click', async () => {
        const apiKey = document.getElementById('wave-api-key').value.trim();
        try {
          const settings = Store.get('settings') || {};
          if (!settings.integrations) settings.integrations = {};
          settings.integrations.wave = { apiKey };
          Store.set('settings', settings);
          Toast.success('Configuration Wave sauvegardée');
          this._renderTab('integrations');
        } catch (err) {
          Toast.error('Erreur: ' + err.message);
        }
      });
    }

    // Save Yango
    const saveYangoBtn = document.getElementById('save-yango-btn');
    if (saveYangoBtn) {
      saveYangoBtn.addEventListener('click', async () => {
        const parkId = document.getElementById('yango-park-id').value.trim();
        const apiKey = document.getElementById('yango-api-key').value.trim();
        const clientId = document.getElementById('yango-client-id').value.trim();
        try {
          const settings = Store.get('settings') || {};
          if (!settings.integrations) settings.integrations = {};
          settings.integrations.yango = { parkId, apiKey, clientId };
          Store.set('settings', settings);
          Toast.success('Configuration Yango sauvegardée');
          this._renderTab('integrations');
        } catch (err) {
          Toast.error('Erreur: ' + err.message);
        }
      });
    }

    // Test Wave
    const testWaveBtn = document.getElementById('test-wave-btn');
    if (testWaveBtn) {
      testWaveBtn.addEventListener('click', async () => {
        Toast.error('Fonctionnalite temporairement indisponible');
      });
    }

    // Test Yango
    const testYangoBtn = document.getElementById('test-yango-btn');
    if (testYangoBtn) {
      testYangoBtn.addEventListener('click', async () => {
        Toast.error('Fonctionnalite temporairement indisponible');
      });
    }
  },

  // ========================= ONGLET CONTRAT =========================

  _renderContrat() {
    const settings = Store.get('settings') || {};
    const c = settings.contrat || {};
    const amendements = c.amendements || [];
    const version = c.version || 1;
    const derniereMaj = c.derniereMaj ? Utils.formatDate(c.derniereMaj) : '-';

    const escVal = (v) => Utils.escHtml(v || '');
    const escTextarea = (v) => (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
      <div style="display:flex;flex-direction:column;gap:var(--space-lg);">
        <!-- En-tête version -->
        <div class="card" style="border-left:4px solid var(--primary);">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-md);">
            <div style="display:flex;align-items:center;gap:var(--space-md);">
              <iconify-icon icon="solar:document-text-bold-duotone" style="font-size:28px;color:var(--primary);"></iconify-icon>
              <div>
                <div style="font-weight:700;font-size:var(--font-size-lg);">Modèle de contrat chauffeur</div>
                <div style="font-size:var(--font-size-sm);color:var(--text-muted);">Version ${version} — Dernière mise à jour : ${derniereMaj}</div>
              </div>
            </div>
            <div style="display:flex;gap:var(--space-sm);">
              <button class="btn btn-sm btn-primary" id="btn-save-contrat"><iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder</button>
              <button class="btn btn-sm btn-danger" id="btn-publier-contrat"><iconify-icon icon="solar:upload-bold-duotone"></iconify-icon> Publier les modifications</button>
            </div>
          </div>
        </div>

        <!-- Formulaire principal -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Informations du contrat</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Employeur</label>
                <input type="text" class="form-control" id="contrat-employeur" value="${escVal(c.employeur)}" placeholder="Nom de l'employeur">
              </div>
              <div class="form-group">
                <label class="form-label">Type de contrat</label>
                <select class="form-control" id="contrat-type">
                  <option value="CDI" ${c.typeContrat === 'CDI' ? 'selected' : ''}>CDI</option>
                  <option value="CDD" ${c.typeContrat === 'CDD' ? 'selected' : ''}>CDD</option>
                </select>
              </div>
            </div>
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Poste</label>
                <input type="text" class="form-control" id="contrat-poste" value="${escVal(c.poste)}" placeholder="Ex: Chauffeur VTC">
              </div>
              <div class="form-group">
                <label class="form-label">Période d'essai</label>
                <input type="text" class="form-control" id="contrat-periode-essai" value="${escVal(c.periodeEssai)}" placeholder="Ex: 3 mois, renouvelable une fois">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Lieu de travail</label>
              <input type="text" class="form-control" id="contrat-lieu" value="${escVal(c.lieuTravail)}" placeholder="Ex: Abidjan et environs">
            </div>
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Organisation du travail</label>
                <textarea class="form-control" id="contrat-organisation" rows="3" placeholder="Décrivez l'organisation du travail...">${escTextarea(c.organisation)}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Horaires</label>
                <textarea class="form-control" id="contrat-horaires" rows="3" placeholder="Décrivez les horaires de travail...">${escTextarea(c.horaires)}</textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- Rémunération -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:wallet-bold-duotone"></iconify-icon> Rémunération</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
            <div class="grid-2" style="gap:var(--space-md);">
              <div class="form-group">
                <label class="form-label">Salaire journalier (FCFA)</label>
                <input type="number" class="form-control" id="contrat-salaire" value="${c.salaireJournalier || ''}" placeholder="0" min="0" step="500">
              </div>
              <div class="form-group">
                <label class="form-label">Objectif minimum journalier (FCFA)</label>
                <input type="number" class="form-control" id="contrat-objectif" value="${c.objectifMinimum || ''}" placeholder="0" min="0" step="500">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Bonus performance</label>
              <textarea class="form-control" id="contrat-bonus" rows="3" placeholder="Décrivez la structure de bonus...">${escTextarea(c.bonusPerformance)}</textarea>
            </div>
          </div>
        </div>

        <!-- Clauses -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon> Clauses et obligations</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-md);padding-top:var(--space-md);">
            <div class="form-group">
              <label class="form-label">Obligations du chauffeur</label>
              <textarea class="form-control" id="contrat-obligations" rows="4" placeholder="Listez les obligations du chauffeur...">${escTextarea(c.obligations)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Responsabilités et sanctions</label>
              <textarea class="form-control" id="contrat-responsabilites" rows="4" placeholder="Décrivez les responsabilités et sanctions...">${escTextarea(c.responsabilites)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Protection sociale</label>
              <textarea class="form-control" id="contrat-protection" rows="3" placeholder="Décrivez la couverture sociale...">${escTextarea(c.protectionSociale)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Clause de résiliation</label>
              <textarea class="form-control" id="contrat-resiliation" rows="3" placeholder="Conditions de résiliation du contrat...">${escTextarea(c.clauseResiliation)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Clauses particulières</label>
              <textarea class="form-control" id="contrat-clauses-particulieres" rows="3" placeholder="Clauses additionnelles...">${escTextarea(c.clausesParticulieres)}</textarea>
            </div>
          </div>
        </div>

        <!-- Amendements -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:clipboard-list-bold-duotone"></iconify-icon> Amendements</span>
            <button class="btn btn-sm btn-secondary" id="btn-add-amendement"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Ajouter un amendement</button>
          </div>
          <div style="padding-top:var(--space-md);">
            ${amendements.length === 0 ? `
              <div style="text-align:center;padding:var(--space-xl);color:var(--text-muted);">
                <iconify-icon icon="solar:clipboard-list-bold-duotone" style="font-size:32px;opacity:0.5;"></iconify-icon>
                <p style="margin-top:var(--space-sm);font-size:var(--font-size-sm);">Aucun amendement pour le moment</p>
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;gap:var(--space-sm);">
                ${amendements.map((a, i) => `
                  <div style="display:flex;align-items:flex-start;gap:var(--space-md);padding:var(--space-md);background:var(--bg-secondary);border-radius:var(--radius-sm);border-left:3px solid var(--primary);">
                    <div style="flex:1;">
                      <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px;">
                        <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:12px;"></iconify-icon>
                        ${Utils.formatDate(a.date)}${a.auteur ? ' — ' + Utils.escHtml(a.auteur) : ''}
                      </div>
                      <div style="font-size:var(--font-size-sm);">${Utils.escHtml(a.description)}</div>
                    </div>
                    <button class="btn btn-sm btn-ghost btn-delete-amendement" data-index="${i}" title="Supprimer">
                      <iconify-icon icon="solar:trash-bin-trash-bold-duotone" style="color:var(--danger);"></iconify-icon>
                    </button>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  },

  _getContratFormValues() {
    return {
      employeur: document.getElementById('contrat-employeur').value.trim(),
      typeContrat: document.getElementById('contrat-type').value,
      poste: document.getElementById('contrat-poste').value.trim(),
      periodeEssai: document.getElementById('contrat-periode-essai').value.trim(),
      lieuTravail: document.getElementById('contrat-lieu').value.trim(),
      organisation: document.getElementById('contrat-organisation').value.trim(),
      horaires: document.getElementById('contrat-horaires').value.trim(),
      salaireJournalier: parseInt(document.getElementById('contrat-salaire').value) || 0,
      bonusPerformance: document.getElementById('contrat-bonus').value.trim(),
      objectifMinimum: parseInt(document.getElementById('contrat-objectif').value) || 0,
      obligations: document.getElementById('contrat-obligations').value.trim(),
      responsabilites: document.getElementById('contrat-responsabilites').value.trim(),
      protectionSociale: document.getElementById('contrat-protection').value.trim(),
      clauseResiliation: document.getElementById('contrat-resiliation').value.trim(),
      clausesParticulieres: document.getElementById('contrat-clauses-particulieres').value.trim()
    };
  },

  _bindContratEvents() {
    // Sauvegarder (sans publier)
    document.getElementById('btn-save-contrat').addEventListener('click', () => {
      const settings = Store.get('settings') || {};
      const existing = settings.contrat || {};
      const values = this._getContratFormValues();

      settings.contrat = {
        ...existing,
        ...values
      };

      Store.set('settings', settings);
      Toast.success('Modèle de contrat sauvegardé');
    });

    // Publier les modifications
    document.getElementById('btn-publier-contrat').addEventListener('click', () => {
      const chauffeurs = Store.get('chauffeurs') || [];
      const nbActifs = chauffeurs.filter(c => c.statut === 'actif').length;

      Modal.confirm(
        'Publier les modifications du contrat',
        `<div style="display:flex;flex-direction:column;gap:var(--space-md);">
          <p><iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:var(--warning);"></iconify-icon> Cette action va :</p>
          <ul style="margin:0;padding-left:var(--space-lg);display:flex;flex-direction:column;gap:var(--space-xs);">
            <li>Incrémenter la version du contrat</li>
            <li>Enregistrer la date de mise à jour</li>
            <li>Réinitialiser l'acceptation du contrat pour <strong>${nbActifs} chauffeur(s) actif(s)</strong></li>
          </ul>
          <p style="font-size:var(--font-size-sm);color:var(--text-muted);">Chaque chauffeur devra re-valider le contrat depuis son application.</p>
        </div>`,
        async () => {
          try {
            const settings = Store.get('settings') || {};
            const existing = settings.contrat || {};
            const values = this._getContratFormValues();

            settings.contrat = {
              ...existing,
              ...values,
              version: (existing.version || 1) + 1,
              derniereMaj: new Date().toISOString()
            };

            Store.set('settings', settings);

            // Reset contrat acceptance for all chauffeurs via Supabase
            const { error } = await supabase
              .from('fleet_chauffeurs')
              .update({ contrat_accepte: false })
              .neq('id', '00000000-0000-0000-0000-000000000000');

            if (!error) {
              // Update local cache too
              const chauffeurs = Store.get('chauffeurs') || [];
              chauffeurs.forEach(c => {
                c.contratAccepte = false;
                c.contratAccepteLe = null;
                c.contratAccepteIP = null;
              });
              Store.set('chauffeurs', chauffeurs);
              Toast.success(`Contrat v${settings.contrat.version} publié — ${chauffeurs.length} chauffeur(s) doivent re-valider`);
            } else {
              Toast.error('Erreur lors de la réinitialisation des acceptations');
            }

            this._renderTab('contrat');
          } catch (err) {
            Toast.error('Erreur: ' + err.message);
          }
        }
      );
    });

    // Ajouter un amendement
    document.getElementById('btn-add-amendement').addEventListener('click', () => {
      Modal.form(
        'Ajouter un amendement',
        `<div class="form-group">
          <label class="form-label">Description de l'amendement</label>
          <textarea class="form-control" id="amendement-description" rows="4" placeholder="Décrivez la modification apportée au contrat..."></textarea>
        </div>`,
        () => {
          const description = document.getElementById('amendement-description').value.trim();
          if (!description) {
            Toast.error('La description est obligatoire');
            return;
          }

          const settings = Store.get('settings') || {};
          const existing = settings.contrat || {};
          const amendements = existing.amendements || [];
          const session = Auth.getSession();

          amendements.push({
            date: new Date().toISOString(),
            description,
            auteur: session ? `${session.prenom || ''} ${session.nom || ''}`.trim() : ''
          });

          settings.contrat = {
            ...existing,
            amendements,
            version: (existing.version || 1) + 1
          };

          Store.set('settings', settings);
          Toast.success('Amendement ajouté — version incrémentée à ' + settings.contrat.version);
          Modal.close();
          this._renderTab('contrat');
        },
        'md'
      );
    });

    // Supprimer un amendement
    document.querySelectorAll('.btn-delete-amendement').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        Modal.confirm(
          'Supprimer l\'amendement',
          'Êtes-vous sûr de vouloir supprimer cet amendement ?',
          () => {
            const settings = Store.get('settings') || {};
            const existing = settings.contrat || {};
            const amendements = [...(existing.amendements || [])];
            amendements.splice(index, 1);

            settings.contrat = {
              ...existing,
              amendements
            };

            Store.set('settings', settings);
            Toast.success('Amendement supprimé');
            this._renderTab('contrat');
          }
        );
      });
    });
  },

  _togglePasswordField(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const btn = input.parentElement.querySelector('button iconify-icon');
    if (btn) btn.setAttribute('icon', isPassword ? 'solar:eye-closed-bold-duotone' : 'solar:eye-bold-duotone');
  }
};
