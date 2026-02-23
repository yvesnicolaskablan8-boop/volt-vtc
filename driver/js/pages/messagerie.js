/**
 * MessageriePage (Driver) — Conversations chauffeur avec l'admin
 *
 * Vue liste + vue chat, polling 15s, marquage lu automatique
 */
const MessageriePage = {
  _conversations: [],
  _currentConvId: null,
  _currentConv: null,
  _pollTimer: null,
  _view: 'list', // 'list' | 'chat'

  render(container) {
    this._view = 'list';
    this._currentConvId = null;
    this._currentConv = null;
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
    this._container = container;
    this._loadConversations();
    this._startPolling();
  },

  destroy() {
    this._stopPolling();
    this._currentConvId = null;
    this._currentConv = null;
  },

  // =================== POLLING ===================

  _startPolling() {
    this._pollTimer = setInterval(() => this._poll(), 15000);
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  async _poll() {
    if (this._view === 'chat' && this._currentConvId) {
      // Refresh current conversation
      const conv = await DriverStore.getConversation(this._currentConvId);
      if (conv && !conv.error) {
        this._currentConv = conv;
        this._renderMessages();
      }
    } else {
      // Refresh list
      const data = await DriverStore.getConversations();
      if (data && !data.error) {
        this._conversations = data;
        if (this._view === 'list') this._renderList();
      }
    }
  },

  // =================== LOAD ===================

  async _loadConversations() {
    try {
      const data = await DriverStore.getConversations();
      if (!data || data.error || !Array.isArray(data)) {
        this._container.innerHTML = `
          <div class="drv-msg-empty">
            <i class="fas fa-exclamation-circle"></i>
            <span>Impossible de charger les messages</span>
            <button class="drv-msg-retry" onclick="MessageriePage._loadConversations()" style="margin-top:12px;padding:8px 20px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);cursor:pointer;">
              <i class="fas fa-redo"></i> Réessayer
            </button>
          </div>
        `;
        return;
      }
      this._conversations = data;
      this._renderList();
    } catch (e) {
      console.error('[Messagerie] Erreur:', e);
      this._container.innerHTML = `
        <div class="drv-msg-empty">
          <i class="fas fa-exclamation-circle"></i>
          <span>Erreur: ${e.message || 'Réseau indisponible'}</span>
          <button class="drv-msg-retry" onclick="MessageriePage._loadConversations()" style="margin-top:12px;padding:8px 20px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);cursor:pointer;">
            <i class="fas fa-redo"></i> Réessayer
          </button>
        </div>
      `;
    }
  },

  async _openConversation(convId) {
    this._currentConvId = convId;
    this._view = 'chat';
    this._container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const conv = await DriverStore.getConversation(convId);
    if (!conv || conv.error) {
      DriverToast.show('Erreur chargement conversation', 'error');
      this._view = 'list';
      this._renderList();
      return;
    }

    this._currentConv = conv;
    this._renderChat();

    // Mark as read
    DriverStore.markConversationRead(convId);
  },

  // =================== RENDER LIST ===================

  _renderList() {
    if (this._conversations.length === 0) {
      this._container.innerHTML = `
        <div class="drv-msg-empty">
          <i class="fas fa-comments"></i>
          <span>Aucun message</span>
          <p style="font-size:0.8rem;opacity:0.5;margin-top:8px;">Votre gestionnaire peut vous contacter ici</p>
        </div>
      `;
      return;
    }

    this._container.innerHTML = `
      <div class="drv-msg-list">
        ${this._conversations.map(conv => this._renderConvItem(conv)).join('')}
      </div>
    `;

    // Bind clicks
    this._container.querySelectorAll('.drv-msg-item').forEach(item => {
      item.addEventListener('click', () => {
        this._openConversation(item.dataset.convId);
      });
    });
  },

  _renderConvItem(conv) {
    const initials = (conv.chauffeurNom || 'AD').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const badge = conv.nonLusChauffeur > 0
      ? `<span class="drv-msg-badge">${conv.nonLusChauffeur}</span>`
      : '';
    const dateStr = this._formatDate(conv.dernierMessageDate);

    return `
      <div class="drv-msg-item ${conv.nonLusChauffeur > 0 ? 'unread' : ''}" data-conv-id="${conv.id}">
        <div class="drv-msg-avatar">AD</div>
        <div class="drv-msg-info">
          <div class="drv-msg-name">Admin${conv.sujet ? ' — ' + this._esc(conv.sujet) : ''}</div>
          <div class="drv-msg-preview">${this._esc(conv.dernierMessage || '')}</div>
        </div>
        <div class="drv-msg-meta">
          <div class="drv-msg-date">${dateStr}</div>
          ${badge}
        </div>
      </div>
    `;
  },

  // =================== RENDER CHAT ===================

  _renderChat() {
    const conv = this._currentConv;
    if (!conv) return;

    this._container.innerHTML = `
      <div class="drv-chat">
        <div class="drv-chat-header">
          <button class="drv-chat-back" id="drv-chat-back"><i class="fas fa-arrow-left"></i></button>
          <div class="drv-chat-header-info">
            <div class="drv-chat-header-name">Admin</div>
            <div class="drv-chat-header-subject">${conv.sujet ? this._esc(conv.sujet) : 'Conversation'}</div>
          </div>
        </div>

        <div class="drv-chat-messages" id="drv-chat-messages">
          ${(conv.messages || []).map(msg => this._renderMessage(msg, conv.chauffeurId)).join('')}
        </div>

        <div class="drv-chat-input">
          <textarea id="drv-msg-input" placeholder="Votre message..." rows="1"></textarea>
          <button class="drv-chat-send" id="drv-msg-send"><i class="fas fa-paper-plane"></i></button>
        </div>
      </div>
    `;

    // Scroll to bottom
    const msgContainer = document.getElementById('drv-chat-messages');
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

    // Events
    document.getElementById('drv-chat-back')?.addEventListener('click', () => {
      this._view = 'list';
      this._currentConvId = null;
      this._currentConv = null;
      this._loadConversations();
    });

    document.getElementById('drv-msg-send')?.addEventListener('click', () => this._sendMessage());

    const textarea = document.getElementById('drv-msg-input');
    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
    });
    textarea?.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    });
  },

  _renderMessages() {
    const msgContainer = document.getElementById('drv-chat-messages');
    if (!msgContainer || !this._currentConv) return;

    const wasAtBottom = msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight < 50;

    msgContainer.innerHTML = (this._currentConv.messages || [])
      .map(msg => this._renderMessage(msg, this._currentConv.chauffeurId))
      .join('');

    if (wasAtBottom) {
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }
  },

  _renderMessage(msg, chauffeurId) {
    if (msg.type === 'appel') {
      return `
        <div class="drv-bubble-call">
          <i class="fas fa-phone"></i> ${this._esc(msg.contenu)}
          <div class="drv-bubble-time">${this._formatTime(msg.dateCreation)}</div>
        </div>
      `;
    }

    if (msg.type === 'systeme') {
      return `
        <div class="drv-bubble-system">
          <i class="fas fa-info-circle"></i> ${this._esc(msg.contenu)}
        </div>
      `;
    }

    const isMe = msg.auteur === chauffeurId;
    return `
      <div class="drv-bubble ${isMe ? 'me' : 'them'}">
        <div>${this._esc(msg.contenu)}</div>
        <div class="drv-bubble-time">${this._formatTime(msg.dateCreation)}</div>
      </div>
    `;
  },

  // =================== SEND MESSAGE ===================

  async _sendMessage() {
    const textarea = document.getElementById('drv-msg-input');
    const message = textarea?.value.trim();
    if (!message || !this._currentConvId) return;

    textarea.value = '';
    textarea.style.height = 'auto';

    const result = await DriverStore.replyToConversation(this._currentConvId, message);
    if (result && !result.error) {
      // Refresh
      const conv = await DriverStore.getConversation(this._currentConvId);
      if (conv && !conv.error) {
        this._currentConv = conv;
        this._renderMessages();
        // Scroll to bottom
        const msgContainer = document.getElementById('drv-chat-messages');
        if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
      }
    } else {
      DriverToast.show('Erreur envoi: ' + (result?.error || 'Réseau'), 'error');
      textarea.value = message;
    }
  },

  // =================== BADGE (appelé depuis driver-app) ===================

  updateBadge(count) {
    const badge = document.getElementById('msg-badge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    // Also update nav badge
    const navBadge = document.querySelector('.nav-item[data-route="messagerie"] .msg-nav-badge');
    if (navBadge) {
      navBadge.textContent = count;
      navBadge.style.display = count > 0 ? 'inline-flex' : 'none';
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
    if (mins < 1) return 'maintenant';
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
  }
};
