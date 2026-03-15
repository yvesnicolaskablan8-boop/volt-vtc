/**
 * NotificationsAdminPage - Gestion des notifications admin
 * Envoi d'annonces, historique et statistiques
 */
const NotificationsAdminPage = {
  _stats: null,
  _history: [],
  _historyTotal: 0,
  _currentPage: 1,
  _perPage: 50,

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._loadData();
  },

  destroy() {
    this._stats = null;
    this._history = [];
    this._currentPage = 1;
  },

  _template() {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:bell-bold-duotone"></iconify-icon> Notifications</h1>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-new-annonce">
            <iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouvelle annonce
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid-4" id="notif-admin-stats" style="margin-bottom:var(--space-lg);"></div>

      <!-- History Table -->
      <div class="card" style="padding:0;overflow:auto;">
        <table class="data-table" id="notif-history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Titre</th>
              <th>Message</th>
              <th>Canal</th>
              <th>Statut</th>
              <th>Chauffeur</th>
            </tr>
          </thead>
          <tbody id="notif-history-tbody"></tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div id="notif-pagination" style="margin-top:var(--space-md);display:flex;justify-content:center;gap:var(--space-sm);"></div>
    `;
  },

  _bindEvents() {
    document.getElementById('btn-new-annonce').addEventListener('click', () => this._showSendModal());
  },

  async _loadData() {
    await Promise.all([this._loadStats(), this._loadHistory()]);
  },

  async _loadStats() {
    try {
      const token = localStorage.getItem('pilote_token');
      const apiBase = Store._apiBase || '/api';
      const res = await fetch(apiBase + '/notifications/stats', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        this._stats = await res.json();
      }
    } catch (e) {
      console.warn('[NotificationsAdmin] Stats error:', e.message);
    }
    this._renderStats();
  },

  async _loadHistory() {
    try {
      const token = localStorage.getItem('pilote_token');
      const apiBase = Store._apiBase || '/api';
      const offset = (this._currentPage - 1) * this._perPage;
      const res = await fetch(apiBase + '/notifications?limit=' + this._perPage + '&offset=' + offset, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        this._history = data.notifications || [];
        this._historyTotal = data.total || 0;
      }
    } catch (e) {
      console.warn('[NotificationsAdmin] History error:', e.message);
    }
    this._renderHistory();
  },

  _renderStats() {
    const container = document.getElementById('notif-admin-stats');
    if (!container) return;

    const s = this._stats;
    const totalMois = s ? s.mois.total : 0;
    const aujourdHui = s ? s.aujourd_hui : 0;
    const echecs = s ? s.mois.echecs : 0;
    const coutSMS = s ? s.mois.coutEstimeSMS : 0;
    const whatsappMois = s ? (s.mois.whatsapp || 0) : 0;
    const coutWA = s ? (s.mois.coutEstimeWhatsApp || 0) : 0;

    container.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(59,130,246,0.15);color:#3b82f6;">
          <iconify-icon icon="solar:letter-bold-duotone" style="font-size:24px;"></iconify-icon>
        </div>
        <div class="kpi-info">
          <div class="kpi-value">${totalMois}</div>
          <div class="kpi-label">Envoyees ce mois</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(16,185,129,0.15);color:#10b981;">
          <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:24px;"></iconify-icon>
        </div>
        <div class="kpi-info">
          <div class="kpi-value">${aujourdHui}</div>
          <div class="kpi-label">Aujourd'hui</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(239,68,68,0.15);color:#ef4444;">
          <iconify-icon icon="solar:danger-triangle-bold-duotone" style="font-size:24px;"></iconify-icon>
        </div>
        <div class="kpi-info">
          <div class="kpi-value">${echecs}</div>
          <div class="kpi-label">Echecs</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(245,158,11,0.15);color:#f59e0b;">
          <iconify-icon icon="solar:wallet-bold-duotone" style="font-size:24px;"></iconify-icon>
        </div>
        <div class="kpi-info">
          <div class="kpi-value">${coutSMS.toFixed(2)} $</div>
          <div class="kpi-label">Cout SMS estime</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(37,211,102,0.15);color:#25D366;">
          <iconify-icon icon="mdi:whatsapp" style="font-size:24px;"></iconify-icon>
        </div>
        <div class="kpi-info">
          <div class="kpi-value">${whatsappMois} <span style="font-size:12px;color:var(--text-muted);">(${coutWA.toFixed(3)} $)</span></div>
          <div class="kpi-label">WhatsApp ce mois</div>
        </div>
      </div>
    `;
  },

  _renderHistory() {
    const tbody = document.getElementById('notif-history-tbody');
    if (!tbody) return;

    if (this._history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:var(--space-xl);color:var(--text-muted);">Aucune notification</td></tr>';
      this._renderPagination();
      return;
    }

    const chauffeurs = Store.get('chauffeurs') || [];

    tbody.innerHTML = this._history.map(n => {
      const date = n.dateCreation ? new Date(n.dateCreation).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
      const typeBadge = this._typeBadge(n.type);
      const msg = (n.message || '').length > 60 ? n.message.substring(0, 60) + '...' : (n.message || '');
      const canalBadge = this._canalBadge(n.canal);
      const statutBadge = this._statutBadge(n.statut);
      const ch = n.chauffeurId ? chauffeurs.find(c => c.id === n.chauffeurId) : null;
      const chName = ch ? (ch.prenom + ' ' + ch.nom) : (n.chauffeurId ? n.chauffeurId : 'Tous');

      return `<tr>
        <td style="white-space:nowrap;">${date}</td>
        <td>${typeBadge}</td>
        <td style="font-weight:500;">${n.titre || '-'}</td>
        <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${msg}</td>
        <td>${canalBadge}</td>
        <td>${statutBadge}</td>
        <td style="font-size:12px;">${chName}</td>
      </tr>`;
    }).join('');

    this._renderPagination();
  },

  _renderPagination() {
    const container = document.getElementById('notif-pagination');
    if (!container) return;

    const totalPages = Math.ceil(this._historyTotal / this._perPage);
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
        this._loadHistory();
      });
    });
  },

  _typeBadge(type) {
    const map = {
      deadline_rappel: { label: 'Rappel', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
      deadline_retard: { label: 'Retard', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
      document_expiration: { label: 'Document', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
      score_faible: { label: 'Score', color: '#ec4899', bg: 'rgba(236,72,153,0.15)' },
      annonce: { label: 'Annonce', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
      bonus: { label: 'Bonus', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
      bienvenue: { label: 'Bienvenue', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
      maintenance_urgente: { label: 'Maintenance', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
      maintenance_retard: { label: 'Maint. retard', color: '#f97316', bg: 'rgba(249,115,22,0.15)' }
    };
    const info = map[type] || { label: type || '-', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;background:${info.bg};color:${info.color};">${info.label}</span>`;
  },

  _canalBadge(canal) {
    const map = {
      push: { label: 'Push', color: '#3b82f6' },
      sms: { label: 'SMS', color: '#10b981' },
      both: { label: 'Push+SMS', color: '#8b5cf6' },
      whatsapp: { label: 'WhatsApp', color: '#25D366' },
      'push+whatsapp': { label: 'Push+WA', color: '#059669' },
      'sms+whatsapp': { label: 'SMS+WA', color: '#0d9488' },
      all: { label: 'Tous', color: '#f59e0b' }
    };
    const info = map[canal] || { label: canal || '-', color: '#6b7280' };
    return `<span style="font-size:11px;font-weight:600;color:${info.color};">${info.label}</span>`;
  },

  _statutBadge(statut) {
    const map = {
      envoyee: { label: 'Envoyee', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
      echec: { label: 'Echec', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
      lue: { label: 'Lue', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' }
    };
    const info = map[statut] || { label: statut || '-', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;background:${info.bg};color:${info.color};">${info.label}</span>`;
  },

  _showSendModal() {
    const chauffeurs = Store.get('chauffeurs') || [];
    const chOptions = chauffeurs
      .filter(c => c.statut === 'actif')
      .map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`)
      .join('');

    Modal.show('Nouvelle annonce', `
      <div class="form-group">
        <label class="form-label">Titre</label>
        <input type="text" class="form-control" id="notif-titre" placeholder="Titre de l'annonce" required>
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea class="form-control" id="notif-message" rows="4" placeholder="Contenu de l'annonce..." required></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Canal</label>
        <select class="form-control" id="notif-canal">
          <option value="push">Push uniquement</option>
          <option value="sms">SMS uniquement</option>
          <option value="whatsapp">WhatsApp uniquement</option>
          <option value="both">Push + SMS</option>
          <option value="push+whatsapp">Push + WhatsApp</option>
          <option value="sms+whatsapp">SMS + WhatsApp</option>
          <option value="all">Tous (Push + SMS + WhatsApp)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Chauffeur (vide = tous)</label>
        <select class="form-control" id="notif-chauffeur">
          <option value="">Tous les chauffeurs (broadcast)</option>
          ${chOptions}
        </select>
      </div>
    `, [
      { label: 'Annuler', class: 'btn-secondary', action: 'close' },
      { label: 'Envoyer', class: 'btn-primary', action: () => this._sendNotification() }
    ]);
  },

  async _sendNotification() {
    const titre = document.getElementById('notif-titre').value.trim();
    const message = document.getElementById('notif-message').value.trim();
    const canal = document.getElementById('notif-canal').value;
    const chauffeurId = document.getElementById('notif-chauffeur').value;

    if (!titre || !message) {
      Toast.show('Titre et message requis', 'error');
      return;
    }

    try {
      const token = localStorage.getItem('pilote_token');
      const apiBase = Store._apiBase || '/api';
      const body = { titre, message, canal };
      if (chauffeurId) body.chauffeurId = chauffeurId;

      const res = await fetch(apiBase + '/notifications/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        Modal.close();
        Toast.success('Annonce envoyee : ' + (data.sent || 0) + ' envoyee(s), ' + (data.failed || 0) + ' echec(s)');
        this._loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        Toast.show(err.error || 'Erreur lors de l\'envoi', 'error');
      }
    } catch (e) {
      console.error('[NotificationsAdmin] Send error:', e);
      Toast.show('Erreur technique', 'error');
    }
  }
};
