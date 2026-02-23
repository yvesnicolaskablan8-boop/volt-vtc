/**
 * MessageriePage - Messagerie interne + Appels Twilio
 *
 * Split-view : liste conversations à gauche, fil de messages à droite
 * Appels téléphoniques via Twilio Voice API
 * Auto-refresh toutes les 15 secondes
 */
const MessageriePage = {
  _conversations: [],
  _currentConv: null,
  _pollTimer: null,
  _chauffeurs: [],

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._loadConversations();
    this._startPolling();
  },

  destroy() {
    this._stopPolling();
    this._currentConv = null;
  },

  // =================== TEMPLATE ===================

  _template() {
    return `
      <div class="page-header">
        <h1><i class="fas fa-comments"></i> Messagerie</h1>
        <div class="page-actions">
          <button class="btn btn-sm btn-primary" id="btn-new-conv"><i class="fas fa-plus"></i> Nouvelle conversation</button>
          <button class="btn btn-sm btn-secondary" id="btn-toggle-archived"><i class="fas fa-archive"></i> Archivées</button>
        </div>
      </div>

      <div class="messagerie-container">
        <!-- Colonne gauche : liste -->
        <div class="msg-list-col">
          <div class="msg-search-bar">
            <input type="text" id="msg-search" placeholder="Rechercher..." class="form-input" style="width:100%;">
          </div>
          <div id="msg-conv-list" class="msg-conv-list">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
          </div>
        </div>

        <!-- Colonne droite : fil de messages -->
        <div class="msg-chat-col" id="msg-chat-col">
          <div class="msg-empty-state">
            <i class="fas fa-comments" style="font-size:3rem;opacity:0.3;"></i>
            <p style="margin-top:var(--space-md);opacity:0.5;">Sélectionnez une conversation</p>
          </div>
        </div>
      </div>
    `;
  },

  // =================== STYLES (injectées une seule fois) ===================

  _injectStyles() {
    if (document.getElementById('messagerie-styles')) return;
    const style = document.createElement('style');
    style.id = 'messagerie-styles';
    style.textContent = `
      .messagerie-container {
        display: flex;
        gap: var(--space-md);
        height: calc(100vh - 160px);
        min-height: 500px;
      }
      .msg-list-col {
        width: 340px;
        min-width: 280px;
        background: var(--bg-card);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .msg-search-bar {
        padding: var(--space-sm);
        border-bottom: 1px solid var(--border-color);
      }
      .msg-conv-list {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-xs);
      }
      .msg-conv-item {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        padding: var(--space-sm) var(--space-md);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: background 0.15s;
        border-bottom: 1px solid var(--border-color);
      }
      .msg-conv-item:hover { background: var(--bg-hover); }
      .msg-conv-item.active { background: rgba(59,130,246,0.15); border-left: 3px solid var(--primary); }
      .msg-conv-item .msg-conv-avatar {
        width: 40px; height: 40px; border-radius: 50%;
        background: var(--primary); color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-weight: 600; font-size: 0.9rem; flex-shrink: 0;
      }
      .msg-conv-info { flex: 1; min-width: 0; }
      .msg-conv-name { font-weight: 600; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .msg-conv-preview { font-size: 0.8rem; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
      .msg-conv-meta { text-align: right; flex-shrink: 0; }
      .msg-conv-date { font-size: 0.7rem; opacity: 0.5; }
      .msg-conv-badge {
        background: var(--danger); color: #fff; font-size: 0.7rem;
        border-radius: 10px; padding: 1px 7px; margin-top: 4px; display: inline-block;
      }

      .msg-chat-col {
        flex: 1;
        background: var(--bg-card);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .msg-empty-state {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
      }
      .msg-chat-header {
        display: flex; align-items: center; gap: var(--space-md);
        padding: var(--space-md);
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-card);
      }
      .msg-chat-header-info { flex: 1; }
      .msg-chat-header-name { font-weight: 700; font-size: 1rem; }
      .msg-chat-header-subject { font-size: 0.8rem; opacity: 0.6; }
      .msg-chat-actions { display: flex; gap: var(--space-xs); }

      .msg-chat-messages {
        flex: 1; overflow-y: auto; padding: var(--space-md);
        display: flex; flex-direction: column; gap: var(--space-sm);
      }
      .msg-bubble {
        max-width: 75%; padding: var(--space-sm) var(--space-md);
        border-radius: var(--radius-lg); font-size: 0.9rem;
        line-height: 1.5; position: relative;
      }
      .msg-bubble.admin {
        align-self: flex-end;
        background: var(--primary); color: #fff;
        border-bottom-right-radius: 4px;
      }
      .msg-bubble.chauffeur {
        align-self: flex-start;
        background: var(--bg-hover);
        border-bottom-left-radius: 4px;
      }
      .msg-bubble .msg-author { font-size: 0.75rem; font-weight: 600; opacity: 0.7; margin-bottom: 2px; }
      .msg-bubble .msg-time { font-size: 0.7rem; opacity: 0.6; margin-top: 4px; text-align: right; }
      .msg-bubble.admin .msg-time { color: rgba(255,255,255,0.7); }

      .msg-bubble-call {
        align-self: center; text-align: center;
        background: var(--bg-hover); border-radius: var(--radius-md);
        padding: var(--space-sm) var(--space-lg); font-size: 0.85rem;
        opacity: 0.8;
      }
      .msg-bubble-call i { margin-right: 6px; }
      .msg-bubble-system {
        align-self: center; text-align: center;
        font-size: 0.8rem; opacity: 0.5; padding: var(--space-xs) 0;
      }

      .msg-chat-input {
        display: flex; gap: var(--space-sm);
        padding: var(--space-md);
        border-top: 1px solid var(--border-color);
        background: var(--bg-card);
      }
      .msg-chat-input textarea {
        flex: 1; resize: none; min-height: 42px; max-height: 120px;
        padding: var(--space-sm) var(--space-md);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-main); color: var(--text-primary);
        font-family: inherit; font-size: 0.9rem;
      }
      .msg-chat-input textarea:focus { outline: none; border-color: var(--primary); }
      .msg-chat-input .btn { align-self: flex-end; }

      @media (max-width: 768px) {
        .messagerie-container { flex-direction: column; height: auto; }
        .msg-list-col { width: 100%; max-height: 300px; }
        .msg-chat-col { min-height: 400px; }
      }
    `;
    document.head.appendChild(style);
  },

  // =================== EVENTS ===================

  _bindEvents() {
    this._injectStyles();

    document.getElementById('btn-new-conv')?.addEventListener('click', () => this._newConversation());

    const archBtn = document.getElementById('btn-toggle-archived');
    archBtn?.addEventListener('click', () => {
      const showArchived = archBtn.classList.toggle('active');
      archBtn.innerHTML = showArchived
        ? '<i class="fas fa-inbox"></i> Actives'
        : '<i class="fas fa-archive"></i> Archivées';
      this._loadConversations(showArchived ? 'archivee' : 'active');
    });

    document.getElementById('msg-search')?.addEventListener('input', (e) => {
      this._filterConversations(e.target.value);
    });
  },

  // =================== POLLING ===================

  _startPolling() {
    this._pollTimer = setInterval(() => {
      this._refreshData();
    }, 15000);
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  async _refreshData() {
    const statut = document.getElementById('btn-toggle-archived')?.classList.contains('active') ? 'archivee' : 'active';
    await this._loadConversations(statut, true);
    if (this._currentConv) {
      await this._loadMessages(this._currentConv.id, true);
    }
  },

  // =================== API HELPERS ===================

  async _api(method, path, body) {
    const token = localStorage.getItem('volt_token');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      signal: controller.signal
    };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch('/api/messages' + path, opts);
      clearTimeout(timeout);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erreur ${res.status}`);
      }
      return res.json();
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') throw new Error('Délai de connexion dépassé');
      throw e;
    }
  },

  // =================== LOAD CONVERSATIONS ===================

  async _loadConversations(statut = 'active', silent = false) {
    try {
      const data = await this._api('GET', `?statut=${statut}`);
      this._conversations = Array.isArray(data) ? data : [];
      this._renderConversationList();
    } catch (e) {
      if (!silent) {
        console.error('[Messagerie] Erreur chargement conversations:', e);
        const container = document.getElementById('msg-conv-list');
        if (container) {
          container.innerHTML = `
            <div style="text-align:center;padding:var(--space-xl);opacity:0.6;">
              <i class="fas fa-exclamation-circle" style="font-size:2rem;color:var(--danger);"></i>
              <p style="margin-top:var(--space-sm);">${e.message || 'Erreur de connexion'}</p>
              <button class="btn btn-sm btn-secondary" style="margin-top:var(--space-md);" onclick="MessageriePage._loadConversations()">
                <i class="fas fa-redo"></i> Réessayer
              </button>
            </div>
          `;
        }
      }
    }
  },

  _renderConversationList() {
    const container = document.getElementById('msg-conv-list');
    if (!container) return;

    if (this._conversations.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:var(--space-xl);opacity:0.5;">
          <i class="fas fa-inbox" style="font-size:2rem;"></i>
          <p style="margin-top:var(--space-sm);">Aucune conversation</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this._conversations.map(conv => {
      const initials = (conv.chauffeurNom || '??').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      const isActive = this._currentConv && this._currentConv.id === conv.id;
      const dateStr = this._formatDate(conv.dernierMessageDate);
      const badge = conv.nonLusAdmin > 0
        ? `<span class="msg-conv-badge">${conv.nonLusAdmin}</span>`
        : '';

      return `
        <div class="msg-conv-item ${isActive ? 'active' : ''}" data-conv-id="${conv.id}">
          <div class="msg-conv-avatar">${initials}</div>
          <div class="msg-conv-info">
            <div class="msg-conv-name">${this._esc(conv.chauffeurNom || conv.chauffeurId)}</div>
            <div class="msg-conv-preview">${conv.sujet ? '<b>' + this._esc(conv.sujet) + '</b> — ' : ''}${this._esc(conv.dernierMessage || '')}</div>
          </div>
          <div class="msg-conv-meta">
            <div class="msg-conv-date">${dateStr}</div>
            ${badge}
          </div>
        </div>
      `;
    }).join('');

    // Bind click events
    container.querySelectorAll('.msg-conv-item').forEach(item => {
      item.addEventListener('click', () => {
        const convId = item.dataset.convId;
        this._selectConversation(convId);
      });
    });
  },

  _filterConversations(search) {
    const items = document.querySelectorAll('.msg-conv-item');
    const q = search.toLowerCase();
    items.forEach(item => {
      const name = item.querySelector('.msg-conv-name')?.textContent.toLowerCase() || '';
      const preview = item.querySelector('.msg-conv-preview')?.textContent.toLowerCase() || '';
      item.style.display = (name.includes(q) || preview.includes(q)) ? '' : 'none';
    });
  },

  // =================== SELECT CONVERSATION ===================

  async _selectConversation(convId) {
    // Highlight in list
    document.querySelectorAll('.msg-conv-item').forEach(el => {
      el.classList.toggle('active', el.dataset.convId === convId);
    });

    await this._loadMessages(convId);

    // Mark as read
    try {
      await this._api('PUT', `/${convId}/read`);
      // Update badge in list
      const conv = this._conversations.find(c => c.id === convId);
      if (conv) conv.nonLusAdmin = 0;
      this._renderConversationList();
      // Re-highlight
      document.querySelectorAll('.msg-conv-item').forEach(el => {
        el.classList.toggle('active', el.dataset.convId === convId);
      });
    } catch (e) { /* silent */ }
  },

  // =================== LOAD MESSAGES ===================

  async _loadMessages(convId, silent = false) {
    try {
      const conv = await this._api('GET', `/${convId}`);
      this._currentConv = conv;
      this._renderChat(conv);
    } catch (e) {
      if (!silent) {
        console.error('[Messagerie] Erreur chargement messages:', e);
        Toast.show('Erreur chargement conversation', 'error');
      }
    }
  },

  _renderChat(conv) {
    const col = document.getElementById('msg-chat-col');
    if (!col) return;

    const isArchived = conv.statut === 'archivee';

    col.innerHTML = `
      <div class="msg-chat-header">
        <div class="msg-chat-header-info">
          <div class="msg-chat-header-name">${this._esc(conv.chauffeurNom || conv.chauffeurId)}</div>
          <div class="msg-chat-header-subject">${conv.sujet ? this._esc(conv.sujet) : 'Conversation directe'} ${conv.chauffeurTelephone ? '— ' + this._esc(conv.chauffeurTelephone) : ''}</div>
        </div>
        <div class="msg-chat-actions">
          ${conv.chauffeurTelephone ? `<button class="btn btn-sm btn-success" id="btn-call-chauffeur" title="Appeler"><i class="fas fa-phone"></i> Appeler</button>` : ''}
          <button class="btn btn-sm btn-secondary" id="btn-archive-conv" title="${isArchived ? 'Réactiver' : 'Archiver'}">
            <i class="fas fa-${isArchived ? 'inbox' : 'archive'}"></i>
          </button>
        </div>
      </div>

      <div class="msg-chat-messages" id="msg-chat-messages">
        ${(conv.messages || []).map(msg => this._renderMessage(msg)).join('')}
      </div>

      <div class="msg-chat-input">
        <textarea id="msg-input" placeholder="Écrire un message..." rows="1"></textarea>
        <button class="btn btn-primary" id="btn-send-msg"><i class="fas fa-paper-plane"></i></button>
      </div>
    `;

    // Scroll to bottom
    const msgContainer = document.getElementById('msg-chat-messages');
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

    // Bind events
    document.getElementById('btn-send-msg')?.addEventListener('click', () => this._sendMessage());

    const textarea = document.getElementById('msg-input');
    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
    });
    // Auto-resize textarea
    textarea?.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });

    document.getElementById('btn-call-chauffeur')?.addEventListener('click', () => this._initiateCall());
    document.getElementById('btn-archive-conv')?.addEventListener('click', () => this._toggleArchive());
  },

  _renderMessage(msg) {
    if (msg.type === 'appel') {
      const statutIcon = {
        completed: 'fa-phone',
        'no-answer': 'fa-phone-slash',
        busy: 'fa-phone-slash',
        failed: 'fa-times-circle',
        canceled: 'fa-times-circle',
        initiated: 'fa-phone-volume',
        ringing: 'fa-phone-volume'
      }[msg.callData?.statut] || 'fa-phone';

      return `
        <div class="msg-bubble-call">
          <i class="fas ${statutIcon}"></i>
          ${this._esc(msg.contenu)}
          <div style="font-size:0.7rem;opacity:0.5;margin-top:2px;">${this._formatDateTime(msg.dateCreation)}</div>
        </div>
      `;
    }

    if (msg.type === 'systeme') {
      return `
        <div class="msg-bubble-system">
          <i class="fas fa-info-circle"></i> ${this._esc(msg.contenu)}
        </div>
      `;
    }

    const isAdmin = msg.auteur === 'admin';
    return `
      <div class="msg-bubble ${isAdmin ? 'admin' : 'chauffeur'}">
        ${!isAdmin ? `<div class="msg-author">${this._esc(msg.auteurNom || msg.auteur)}</div>` : ''}
        <div>${this._esc(msg.contenu)}</div>
        <div class="msg-time">${this._formatTime(msg.dateCreation)}</div>
      </div>
    `;
  },

  // =================== SEND MESSAGE ===================

  async _sendMessage() {
    const textarea = document.getElementById('msg-input');
    const message = textarea?.value.trim();
    if (!message || !this._currentConv) return;

    textarea.value = '';
    textarea.style.height = 'auto';

    try {
      await this._api('POST', `/${this._currentConv.id}/reply`, { message });
      await this._loadMessages(this._currentConv.id);
      // Refresh list too
      const statut = document.getElementById('btn-toggle-archived')?.classList.contains('active') ? 'archivee' : 'active';
      this._loadConversations(statut, true);
    } catch (e) {
      Toast.show('Erreur envoi message: ' + e.message, 'error');
      textarea.value = message; // Restore message
    }
  },

  // =================== NEW CONVERSATION ===================

  async _newConversation() {
    // Load chauffeurs list
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');

    const chauffeurOptions = chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('');

    const html = `
      <div class="form-group">
        <label class="form-label">Chauffeur *</label>
        <select id="new-conv-chauffeur" class="form-input">
          <option value="">— Sélectionner —</option>
          ${chauffeurOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Sujet</label>
        <input type="text" id="new-conv-sujet" class="form-input" placeholder="Ex: Rappel documents...">
      </div>
      <div class="form-group">
        <label class="form-label">Message *</label>
        <textarea id="new-conv-message" class="form-input" rows="4" placeholder="Écrivez votre message..."></textarea>
      </div>
    `;

    Modal.confirm(
      'Nouvelle conversation',
      html,
      async () => {
        const chauffeurId = document.getElementById('new-conv-chauffeur').value;
        const sujet = document.getElementById('new-conv-sujet').value.trim();
        const message = document.getElementById('new-conv-message').value.trim();

        if (!chauffeurId) { Toast.show('Sélectionnez un chauffeur', 'warning'); return; }
        if (!message) { Toast.show('Écrivez un message', 'warning'); return; }

        try {
          const conv = await this._api('POST', '', { chauffeurId, sujet, message });
          Toast.show('Conversation créée', 'success');
          await this._loadConversations();
          this._selectConversation(conv.id);
        } catch (e) {
          Toast.show('Erreur: ' + e.message, 'error');
        }
      },
      { confirmText: 'Envoyer', size: 'medium' }
    );
  },

  // =================== CALL ===================

  async _initiateCall() {
    if (!this._currentConv) return;

    Modal.confirm(
      'Appeler le chauffeur',
      `<p>Voulez-vous appeler <strong>${this._esc(this._currentConv.chauffeurNom)}</strong> via Twilio ?</p>
       <p style="font-size:0.85rem;opacity:0.7;">Le chauffeur recevra un appel téléphonique sur son numéro ${this._esc(this._currentConv.chauffeurTelephone || '')}.</p>`,
      async () => {
        try {
          Toast.show('Initiation de l\'appel...', 'info');
          const result = await this._api('POST', '/call', {
            chauffeurId: this._currentConv.chauffeurId,
            conversationId: this._currentConv.id
          });
          Toast.show(`Appel initié vers ${result.chauffeurNom}`, 'success');
          // Refresh messages to show the call message
          await this._loadMessages(this._currentConv.id);
        } catch (e) {
          Toast.show('Erreur appel: ' + e.message, 'error');
        }
      },
      { confirmText: 'Appeler', confirmClass: 'btn-success' }
    );
  },

  // =================== ARCHIVE ===================

  async _toggleArchive() {
    if (!this._currentConv) return;
    const wasArchived = this._currentConv.statut === 'archivee';

    try {
      await this._api('PUT', `/${this._currentConv.id}/archive`);
      Toast.show(wasArchived ? 'Conversation réactivée' : 'Conversation archivée', 'success');
      this._currentConv = null;
      // Reset chat column
      const col = document.getElementById('msg-chat-col');
      if (col) {
        col.innerHTML = `
          <div class="msg-empty-state">
            <i class="fas fa-comments" style="font-size:3rem;opacity:0.3;"></i>
            <p style="margin-top:var(--space-md);opacity:0.5;">Sélectionnez une conversation</p>
          </div>
        `;
      }
      const statut = document.getElementById('btn-toggle-archived')?.classList.contains('active') ? 'archivee' : 'active';
      this._loadConversations(statut);
    } catch (e) {
      Toast.show('Erreur: ' + e.message, 'error');
    }
  },

  // =================== UTILS ===================

  _esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'À l\'instant';
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}j`;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  },

  _formatTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  },

  _formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
           d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
};
