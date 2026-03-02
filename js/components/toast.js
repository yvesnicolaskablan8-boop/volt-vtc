/**
 * Toast - Notification system
 */
const Toast = {
  show(message, type = 'info', title = null, duration = 4000) {
    const container = document.getElementById('toast-container');
    const icons = {
      success: 'solar:check-circle-bold-duotone',
      error: 'solar:close-circle-bold-duotone',
      warning: 'solar:danger-triangle-bold-duotone',
      info: 'solar:info-circle-bold-duotone'
    };
    const titles = {
      success: 'Succès',
      error: 'Erreur',
      warning: 'Attention',
      info: 'Information'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon"><iconify-icon icon="${icons[type] || icons.info}"></iconify-icon></div>
      <div class="toast-content">
        <div class="toast-title">${title || titles[type] || titles.info}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close"><iconify-icon icon="solar:close-square-bold"></iconify-icon></button>
    `;

    container.appendChild(toast);

    // Close handler
    const close = () => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', close);
    setTimeout(close, duration);
  },

  success(message, title) { this.show(message, 'success', title); },
  error(message, title) { this.show(message, 'error', title); },
  warning(message, title) { this.show(message, 'warning', title); },
  info(message, title) { this.show(message, 'info', title); }
};
