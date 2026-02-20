/**
 * Modal - Reusable modal dialog
 */
const Modal = {
  _onConfirm: null,
  _isOpen: false,

  init() {
    const overlay = document.getElementById('modal-overlay');
    const closeBtn = document.getElementById('modal-close');

    closeBtn.addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) this.close();
    });
  },

  open(options = {}) {
    const { title = '', body = '', footer = '', size = '', onConfirm = null } = options;

    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer;

    const modal = document.getElementById('modal-container');
    modal.className = `modal ${size}`;

    this._onConfirm = onConfirm;
    this._isOpen = true;

    document.getElementById('modal-overlay').classList.add('active');

    // Bind footer buttons
    const confirmBtn = document.querySelector('#modal-footer [data-action="confirm"]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (this._onConfirm) this._onConfirm();
      });
    }

    const cancelBtn = document.querySelector('#modal-footer [data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }
  },

  close() {
    document.getElementById('modal-overlay').classList.remove('active');
    this._isOpen = false;
    this._onConfirm = null;
  },

  confirm(title, message, onConfirm) {
    this.open({
      title: `<i class="fas fa-exclamation-triangle text-warning"></i> ${title}`,
      body: `<p>${message}</p>`,
      footer: `
        <button class="btn btn-secondary" data-action="cancel">Annuler</button>
        <button class="btn btn-danger" data-action="confirm">Confirmer</button>
      `,
      onConfirm: () => {
        onConfirm();
        this.close();
      }
    });
  },

  form(title, formHtml, onSubmit, size = '') {
    this.open({
      title,
      body: formHtml,
      footer: `
        <button class="btn btn-secondary" data-action="cancel">Annuler</button>
        <button class="btn btn-primary" data-action="confirm"><i class="fas fa-save"></i> Enregistrer</button>
      `,
      size,
      onConfirm: () => {
        if (onSubmit) onSubmit();
      }
    });
  }
};
