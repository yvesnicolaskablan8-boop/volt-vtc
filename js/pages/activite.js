/**
 * ActivitePage - Journal d'activite (audit log)
 * Affiche les logs d'activite de l'application avec filtres et pagination
 */
const ActivitePage = {
  _logs: [],
  _currentPage: 1,
  _perPage: 50,
  _filterCollection: '',
  _filterAction: '',

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._loadLogs();
  },

  destroy() {
    this._logs = [];
    this._currentPage = 1;
  },

  _template() {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> Journal d'activite</h1>
        <div class="page-actions">
          <button class="btn btn-sm btn-secondary" id="btn-refresh-activity">
            <iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Actualiser
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid-4" id="activity-stats" style="margin-bottom:var(--space-lg);"></div>

      <!-- Filtres -->
      <div class="card" style="margin-bottom:var(--space-lg);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;align-items:center;">
          <select class="form-control" id="filter-collection" style="max-width:200px;">
            <option value="">Toutes les collections</option>
            <option value="Chauffeur">Chauffeurs</option>
            <option value="Vehicule">Vehicules</option>
            <option value="Versement">Versements</option>
            <option value="Course">Courses</option>
            <option value="Depense">Depenses</option>
            <option value="Facture">Factures</option>
            <option value="Planning">Planning</option>
            <option value="Comptabilite">Comptabilite</option>
            <option value="Budget">Budgets</option>
            <option value="Contravention">Contraventions</option>
            <option value="Reparation">Reparations</option>
            <option value="Incident">Incidents</option>
            <option value="Signalement">Signalements</option>
            <option value="User">Utilisateurs</option>
          </select>
          <select class="form-control" id="filter-action" style="max-width:180px;">
            <option value="">Toutes les actions</option>
            <option value="create">Creation</option>
            <option value="update">Modification</option>
            <option value="delete">Suppression</option>
            <option value="bulk_replace">Remplacement</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="card" style="padding:0;overflow:auto;">
        <table class="data-table" id="activity-table">
          <thead>
            <tr>
              <th>Heure</th>
              <th>Utilisateur</th>
              <th>Action</th>
              <th>Collection</th>
              <th>Document</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="activity-tbody"></tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div id="activity-pagination" style="margin-top:var(--space-md);display:flex;justify-content:center;gap:var(--space-sm);"></div>
    `;
  },

  _bindEvents() {
    document.getElementById('btn-refresh-activity').addEventListener('click', () => this._loadLogs());
    document.getElementById('filter-collection').addEventListener('change', (e) => {
      this._filterCollection = e.target.value;
      this._currentPage = 1;
      this._renderTable();
    });
    document.getElementById('filter-action').addEventListener('change', (e) => {
      this._filterAction = e.target.value;
      this._currentPage = 1;
      this._renderTable();
    });
  },

  async _loadLogs() {
    try {
      const token = localStorage.getItem('pilote_token');
      const apiBase = Store._apiBase || '/api';
      const res = await fetch(apiBase + '/activityLogs?sort=timestamp&order=desc&limit=5000', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        this._logs = await res.json();
      } else {
        this._logs = [];
      }
    } catch (e) {
      console.warn('[ActivitePage] Load error:', e.message);
      this._logs = [];
    }
    this._renderStats();
    this._renderTable();
  },

  _getFilteredLogs() {
    let logs = this._logs;
    if (this._filterCollection) {
      logs = logs.filter(l => l.collection === this._filterCollection);
    }
    if (this._filterAction) {
      logs = logs.filter(l => l.action === this._filterAction);
    }
    return logs;
  },

  _renderStats() {
    const container = document.getElementById('activity-stats');
    if (!container) return;

    const logs = this._logs;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const todayLogs = logs.filter(l => (l.timestamp || '').startsWith(todayStr));

    // This week
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekLogs = logs.filter(l => (l.timestamp || '') >= weekStartStr);

    // Top user
    const userCounts = {};
    todayLogs.forEach(l => {
      const name = l.userNom || 'Inconnu';
      userCounts[name] = (userCounts[name] || 0) + 1;
    });
    const topUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0];

    container.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(16,185,129,0.15);color:#10b981;">
          <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:24px;"></iconify-icon>
        </div>
        <div class="kpi-info">
          <div class="kpi-value">${todayLogs.length}</div>
          <div class="kpi-label">Aujourd'hui</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(59,130,246,0.15);color:#3b82f6;">
          <iconify-icon icon="solar:graph-up-bold-duotone" style="font-size:24px;"></iconify-icon>
        </div>
        <div class="kpi-info">
          <div class="kpi-value">${weekLogs.length}</div>
          <div class="kpi-label">Cette semaine</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(245,158,11,0.15);color:#f59e0b;">
          <iconify-icon icon="solar:user-bold-duotone" style="font-size:24px;"></iconify-icon>
        </div>
        <div class="kpi-info">
          <div class="kpi-value">${topUser ? topUser[0] : '-'}</div>
          <div class="kpi-label">Top utilisateur${topUser ? ' (' + topUser[1] + ')' : ''}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(139,92,246,0.15);color:#8b5cf6;">
          <iconify-icon icon="solar:database-bold-duotone" style="font-size:24px;"></iconify-icon>
        </div>
        <div class="kpi-info">
          <div class="kpi-value">${logs.length}</div>
          <div class="kpi-label">Total (90j)</div>
        </div>
      </div>
    `;
  },

  _renderTable() {
    const tbody = document.getElementById('activity-tbody');
    if (!tbody) return;

    const filtered = this._getFilteredLogs();
    const start = (this._currentPage - 1) * this._perPage;
    const page = filtered.slice(start, start + this._perPage);

    if (page.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--space-xl);color:var(--text-muted);">Aucune activite enregistree</td></tr>';
      this._renderPagination(filtered.length);
      return;
    }

    tbody.innerHTML = page.map(log => {
      const ts = log.timestamp ? new Date(log.timestamp) : null;
      const timeStr = ts ? ts.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
      const actionBadge = this._actionBadge(log.action);
      const collLabel = this._collectionLabel(log.collection);
      let details = log.details || '';
      if (details.length > 80) details = details.substring(0, 80) + '...';

      return `<tr>
        <td style="white-space:nowrap;">${timeStr}</td>
        <td>${log.userNom || '-'}</td>
        <td>${actionBadge}</td>
        <td>${collLabel}</td>
        <td style="font-family:monospace;font-size:12px;">${log.documentId || '-'}</td>
        <td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${details}</td>
      </tr>`;
    }).join('');

    this._renderPagination(filtered.length);
  },

  _renderPagination(total) {
    const container = document.getElementById('activity-pagination');
    if (!container) return;

    const totalPages = Math.ceil(total / this._perPage);
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    if (this._currentPage > 1) {
      html += `<button class="btn btn-sm btn-secondary" data-page="${this._currentPage - 1}"><iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon></button>`;
    }
    html += `<span style="padding:4px 12px;color:var(--text-muted);">Page ${this._currentPage} / ${totalPages}</span>`;
    if (this._currentPage < totalPages) {
      html += `<button class="btn btn-sm btn-secondary" data-page="${this._currentPage + 1}"><iconify-icon icon="solar:alt-arrow-right-bold"></iconify-icon></button>`;
    }

    container.innerHTML = html;
    container.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._currentPage = parseInt(btn.dataset.page);
        this._renderTable();
      });
    });
  },

  _actionBadge(action) {
    const map = {
      create: { label: 'Creation', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
      update: { label: 'Modification', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
      delete: { label: 'Suppression', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
      bulk_replace: { label: 'Remplacement', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' }
    };
    const info = map[action] || { label: action, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600;background:${info.bg};color:${info.color};">${info.label}</span>`;
  },

  _collectionLabel(collection) {
    const map = {
      Chauffeur: 'Chauffeurs',
      Vehicule: 'Vehicules',
      Versement: 'Versements',
      Course: 'Courses',
      Depense: 'Depenses',
      Facture: 'Factures',
      Planning: 'Planning',
      Comptabilite: 'Comptabilite',
      Budget: 'Budgets',
      Contravention: 'Contraventions',
      Reparation: 'Reparations',
      Incident: 'Incidents',
      Signalement: 'Signalements',
      User: 'Utilisateurs',
      Absence: 'Absences',
      Pointage: 'Pointages',
      ConduiteBrute: 'Conduite',
      ChecklistVehicule: 'Checklists',
      DepenseRecurrente: 'Dep. recurrentes',
      VersementRecurrent: 'Vers. recurrents',
      DepenseCategorie: 'Cat. depenses',
      ControleTechnique: 'Controles tech.',
      Gps: 'GPS',
      ActivityLog: 'Logs'
    };
    return map[collection] || collection;
  }
};
