/**
 * DriverModal — Dialogues modaux (bottom sheet) pour la PWA chauffeur
 */
const DriverModal = {
  _overlay: null,
  _content: null,

  show(title, bodyHTML, actions = []) {
    this._overlay = document.getElementById('modal-overlay');
    this._content = document.getElementById('modal-content');
    if (!this._overlay || !this._content) return;

    let actionsHTML = '';
    if (actions.length > 0) {
      actionsHTML = '<div class="modal-actions">' +
        actions.map(a =>
          `<button class="btn ${a.class || 'btn-primary'}" onclick="${a.onclick}">${a.label}</button>`
        ).join('') +
        '</div>';
    }

    this._content.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" onclick="DriverModal.close()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${actionsHTML}
    `;

    this._overlay.style.display = 'flex';

    // Close on overlay click
    this._overlay.onclick = (e) => {
      if (e.target === this._overlay) this.close();
    };
  },

  close() {
    if (this._overlay) {
      this._overlay.style.display = 'none';
    }
  },

  getFormValues(fields) {
    const values = {};
    fields.forEach(name => {
      const el = this._content.querySelector(`[name="${name}"]`);
      if (el) values[name] = el.value;
    });
    return values;
  }
};
