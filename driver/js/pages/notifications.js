/**
 * NotificationsPage — Centre de notifications du chauffeur
 *
 * Affiche l'historique des notifications recues (push, SMS, annonces)
 * avec badge non-lu, marquage comme lu au clic, et icones par type
 */
const NotificationsPage = {
  _refreshInterval: null,

  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const data = await DriverStore.getNotifications();

    if (!data || !data.notifications) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-bell-slash"></i>
          <p>Impossible de charger les notifications</p>
        </div>`;
      return;
    }

    const notifications = data.notifications;
    const nonLues = data.nonLues || 0;

    container.innerHTML = `
      <div class="notif-page">
        <!-- Header -->
        <div class="notif-header">
          <div class="notif-header-info">
            <h3><i class="fas fa-bell"></i> Notifications</h3>
            ${nonLues > 0 ? `<span class="notif-count-badge">${nonLues} nouvelle${nonLues > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>

        <!-- Liste -->
        <div class="notif-list" id="notif-list">
          ${notifications.length === 0
            ? `<div class="notif-empty">
                <i class="fas fa-bell-slash"></i>
                <p>Aucune notification pour le moment</p>
                <span>Vous recevrez ici vos rappels de versement, alertes documents et annonces.</span>
              </div>`
            : notifications.map(n => this._renderNotification(n)).join('')
          }
        </div>
      </div>
    `;

    // Bind click handlers
    container.querySelectorAll('.notif-item[data-id]').forEach(el => {
      el.addEventListener('click', () => this._markRead(el.dataset.id, el));
    });

    // Auto-refresh toutes les 60s
    this._refreshInterval = setInterval(() => this._refreshBadge(), 60000);
  },

  destroy() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  },

  _renderNotification(n) {
    const isRead = n.statut === 'lue';
    const icon = this._getIcon(n.type);
    const timeAgo = this._timeAgo(n.dateCreation);

    return `
      <div class="notif-item ${isRead ? 'notif-read' : 'notif-unread'}" data-id="${n.id}">
        <div class="notif-icon ${this._getIconClass(n.type)}">
          <i class="fas ${icon}"></i>
        </div>
        <div class="notif-content">
          <div class="notif-title">
            ${!isRead ? '<span class="notif-dot"></span>' : ''}
            ${n.titre}
          </div>
          <div class="notif-message">${n.message}</div>
          <div class="notif-meta">
            <span class="notif-time"><i class="fas fa-clock"></i> ${timeAgo}</span>
            <span class="notif-canal">
              ${n.canal === 'sms' || n.canal === 'both' ? '<i class="fas fa-sms" title="SMS"></i>' : ''}
              ${n.canal === 'push' || n.canal === 'both' ? '<i class="fas fa-bell" title="Push"></i>' : ''}
            </span>
          </div>
        </div>
      </div>
    `;
  },

  _getIcon(type) {
    const icons = {
      'deadline_rappel': 'fa-hourglass-half',
      'deadline_retard': 'fa-exclamation-circle',
      'document_expiration': 'fa-id-card',
      'score_faible': 'fa-tachometer-alt',
      'annonce': 'fa-bullhorn',
      'bonus': 'fa-gift',
      'bienvenue': 'fa-hand-wave'
    };
    return icons[type] || 'fa-bell';
  },

  _getIconClass(type) {
    const classes = {
      'deadline_rappel': 'notif-icon-warning',
      'deadline_retard': 'notif-icon-danger',
      'document_expiration': 'notif-icon-info',
      'score_faible': 'notif-icon-warning',
      'annonce': 'notif-icon-primary',
      'bonus': 'notif-icon-success',
      'bienvenue': 'notif-icon-primary'
    };
    return classes[type] || 'notif-icon-info';
  },

  _timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffJ = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "A l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    if (diffH < 24) return `Il y a ${diffH}h`;
    if (diffJ === 1) return 'Hier';
    if (diffJ < 7) return `Il y a ${diffJ} jours`;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  },

  async _markRead(id, el) {
    if (el.classList.contains('notif-read')) return;

    const result = await DriverStore.markNotificationRead(id);
    if (result && !result.error) {
      el.classList.remove('notif-unread');
      el.classList.add('notif-read');
      const dot = el.querySelector('.notif-dot');
      if (dot) dot.remove();

      // Mettre a jour le badge dans le header
      this._refreshBadge();
    }
  },

  async _refreshBadge() {
    try {
      const data = await DriverStore.getNotifications(1);
      if (data) {
        NotificationsPage.updateBadge(data.nonLues || 0);
      }
    } catch (e) {
      // Silently fail
    }
  },

  /**
   * Met a jour le badge de notification dans le header
   * Appele depuis driver-app.js aussi
   */
  updateBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
};
