/**
 * Modal - Reusable modal dialog
 */
const Modal = {
  _onConfirm: null,
  _onCancel: null,
  _isOpen: false,

  init() {
    const overlay = document.getElementById('modal-overlay');
    const closeBtn = document.getElementById('modal-close');

    closeBtn.addEventListener('click', () => this.cancel());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.cancel();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) this.cancel();
    });
  },

  open(options = {}) {
    const { title = '', body = '', footer = '', size = '', onConfirm = null, onCancel = null } = options;

    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer;

    const modal = document.getElementById('modal-container');
    modal.className = `modal ${size}`;

    this._onConfirm = onConfirm;
    this._onCancel = onCancel;
    this._isOpen = true;

    document.getElementById('modal-overlay').classList.add('active');

    // Bind footer buttons — anti-double-clic protection
    const confirmBtn = document.querySelector('#modal-footer [data-action="confirm"]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled) return;
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
        confirmBtn.style.pointerEvents = 'none';
        if (this._onConfirm) this._onConfirm();
        // Si le modal est toujours ouvert après le callback (validation échouée), ré-activer le bouton
        setTimeout(() => {
          if (this._isOpen && confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '';
            confirmBtn.style.pointerEvents = '';
          }
        }, 300);
      });
    }

    const cancelBtn = document.querySelector('#modal-footer [data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancel());
    }
  },

  cancel() {
    const onCancel = this._onCancel;
    document.getElementById('modal-overlay').classList.remove('active');
    this._isOpen = false;
    this._onConfirm = null;
    this._onCancel = null;
    if (onCancel) onCancel();
  },

  close() {
    document.getElementById('modal-overlay').classList.remove('active');
    this._isOpen = false;
    this._onConfirm = null;
    this._onCancel = null;
  },

  confirm(title, message, onConfirm) {
    this.open({
      title: `<iconify-icon icon="solar:danger-triangle-bold-duotone" class="text-warning"></iconify-icon> ${title}`,
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

  form(title, formHtml, onSubmit, size = '', onCancel = null) {
    this.open({
      title,
      body: formHtml,
      footer: `
        <button class="btn btn-secondary" data-action="cancel">Annuler</button>
        <button class="btn btn-primary" data-action="confirm"><iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Enregistrer</button>
      `,
      size,
      onConfirm: () => {
        if (onSubmit) onSubmit();
      },
      onCancel
    });
  }
};
