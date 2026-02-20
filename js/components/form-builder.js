/**
 * FormBuilder - Declarative form generation
 */
const FormBuilder = {
  build(fields, values = {}) {
    let html = '';
    let currentRow = [];

    fields.forEach((field, i) => {
      const val = values[field.name] != null ? values[field.name] : (field.default || '');

      if (field.type === 'row-start') {
        html += '<div class="form-row">';
        return;
      }
      if (field.type === 'row-end') {
        html += '</div>';
        return;
      }
      if (field.type === 'divider') {
        html += `<hr style="border-color: var(--border-color); margin: var(--space-md) 0;">`;
        return;
      }
      if (field.type === 'heading') {
        html += `<h3 style="margin: var(--space-md) 0 var(--space-sm); font-size: var(--font-size-sm); color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">${field.label}</h3>`;
        return;
      }

      let input = '';

      switch (field.type) {
        case 'text':
        case 'email':
        case 'tel':
        case 'date':
        case 'number':
          input = `<input type="${field.type}" class="form-control" name="${field.name}" value="${this._escapeAttr(val)}"
            ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}
            ${field.required ? 'required' : ''}
            ${field.min != null ? `min="${field.min}"` : ''}
            ${field.max != null ? `max="${field.max}"` : ''}
            ${field.step ? `step="${field.step}"` : ''}
            ${field.readonly ? 'readonly' : ''}>`;
          break;

        case 'select':
          input = `<select class="form-control" name="${field.name}" ${field.required ? 'required' : ''}>
            ${field.placeholder ? `<option value="">${field.placeholder}</option>` : ''}
            ${(field.options || []).map(opt => {
              const optVal = typeof opt === 'object' ? opt.value : opt;
              const optLabel = typeof opt === 'object' ? opt.label : opt;
              return `<option value="${optVal}" ${String(val) === String(optVal) ? 'selected' : ''}>${optLabel}</option>`;
            }).join('')}
          </select>`;
          break;

        case 'textarea':
          input = `<textarea class="form-control" name="${field.name}"
            ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}
            ${field.rows ? `rows="${field.rows}"` : ''}
            ${field.required ? 'required' : ''}>${this._escapeHtml(val)}</textarea>`;
          break;

        default:
          input = `<input type="text" class="form-control" name="${field.name}" value="${this._escapeAttr(val)}">`;
      }

      html += `
        <div class="form-group">
          <label class="form-label">${field.label}${field.required ? ' <span class="text-danger">*</span>' : ''}</label>
          ${input}
        </div>
      `;
    });

    return html;
  },

  getValues(container) {
    const values = {};
    const inputs = container.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.name) {
        let val = input.value;
        if (input.type === 'number' && val !== '') {
          val = parseFloat(val);
        }
        values[input.name] = val;
      }
    });
    return values;
  },

  validate(container, fields) {
    let valid = true;
    // Remove previous errors
    container.querySelectorAll('.form-error').forEach(el => el.remove());
    container.querySelectorAll('.form-control').forEach(el => el.style.borderColor = '');

    fields.forEach(field => {
      if (!field.required) return;
      const input = container.querySelector(`[name="${field.name}"]`);
      if (!input) return;

      if (!input.value || input.value.trim() === '') {
        valid = false;
        input.style.borderColor = 'var(--danger)';
        const error = document.createElement('div');
        error.className = 'form-error';
        error.textContent = `${field.label} est requis`;
        input.parentNode.appendChild(error);
      }
    });

    return valid;
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  },

  _escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
};
