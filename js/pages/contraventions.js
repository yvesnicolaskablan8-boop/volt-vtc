/**
 * ContraventionsPage - Gestion des contraventions chauffeurs (admin)
 */
const ContraventionsPage = {
  _charts: [],

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    container.innerHTML = this._template(data);
    this._bindEvents(data);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _getData() {
    const contraventions = Store.get('contraventions') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const monthContra = contraventions.filter(c => {
      const d = new Date(c.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const impayees = contraventions.filter(c => c.statut === 'impayee');
    const payees = monthContra.filter(c => c.statut === 'payee');
    const contestees = contraventions.filter(c => c.statut === 'contestee');
    const totalImpaye = impayees.reduce((s, c) => s + (c.montant || 0), 0);

    return {
      contraventions,
      chauffeurs,
      totalImpaye,
      nbMois: monthContra.length,
      nbPayees: payees.length,
      nbImpayees: impayees.length,
      nbContestees: contestees.length
    };
  },

  _template(data) {
    const types = [
      { value: 'exces_vitesse', label: 'Exc\u00e8s de vitesse' },
      { value: 'stationnement', label: 'Stationnement' },
      { value: 'feu_rouge', label: 'Feu rouge' },
      { value: 'documents', label: 'Documents' },
      { value: 'telephone', label: 'T\u00e9l\u00e9phone au volant' },
      { value: 'autre', label: 'Autre' }
    ];
    const typeLabels = {};
    types.forEach(t => typeLabels[t.value] = t.label);

    return `
      <div class="d-wrap"><div class="d-bg">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:14px;">
        <div>
          <div style="font-size:14px;color:#9ca3af;font-weight:500;">Gestion</div>
          <div style="font-size:28px;font-weight:800;color:var(--text-primary);letter-spacing:-.6px;margin-top:2px;display:flex;align-items:center;gap:12px;">
            <iconify-icon icon="solar:document-text-bold-duotone" style="color:#6366f1;"></iconify-icon> Contraventions
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-primary" id="btn-add-contravention">
            <iconify-icon icon="solar:add-circle-bold"></iconify-icon> Ajouter
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="d-grid d-g4" style="grid-template-columns:repeat(4,1fr);">
        <div class="d-card" id="kpi-total-impaye" style="cursor:pointer;${data.totalImpaye > 0 ? 'border-color:rgba(239,68,68,.2);' : ''}" title="Cliquer pour voir les détails">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(239,68,68,.1);color:#ef4444;"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;color:#ef4444;">Total impayé</div>
          </div>
          <div class="d-val" style="color:#ef4444;">${Utils.formatCurrency(data.totalImpaye)}</div>
        </div>
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(99,102,241,.08);color:#6366f1;"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;">Ce mois</div>
          </div>
          <div class="d-val">${data.nbMois}</div>
        </div>
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(16,185,129,.1);color:#10b981;"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;">Payées (mois)</div>
          </div>
          <div class="d-val" style="color:#10b981;">${data.nbPayees}</div>
        </div>
        <div class="d-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(245,158,11,.1);color:#f59e0b;"><iconify-icon icon="solar:chat-round-dots-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;">Contestées</div>
          </div>
          <div class="d-val" style="color:#f59e0b;">${data.nbContestees}</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="d-card" style="padding:12px 16px;margin-bottom:16px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select id="filter-chauffeur" class="filter-select" style="padding:6px 12px;border-radius:11px;border:1px solid var(--border-color);background:var(--bg-secondary);font-size:12px;font-weight:500;color:var(--text-primary);">
            <option value="">Tous les chauffeurs</option>
            ${data.chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
          </select>
          <select id="filter-statut" class="filter-select" style="padding:6px 12px;border-radius:11px;border:1px solid var(--border-color);background:var(--bg-secondary);font-size:12px;font-weight:500;color:var(--text-primary);">
            <option value="">Tous les statuts</option>
            <option value="impayee">Impayée</option>
            <option value="payee">Payée</option>
            <option value="contestee">Contestée</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="d-card">
        <div id="contraventions-table"></div>
      </div>

      </div></div>
    `;
  },

  _bindEvents(data) {
    const chauffeurMap = {};
    data.chauffeurs.forEach(c => chauffeurMap[c.id] = `${c.prenom} ${c.nom}`);

    const typeLabels = {
      exces_vitesse: 'Exc\u00e8s de vitesse',
      stationnement: 'Stationnement',
      feu_rouge: 'Feu rouge',
      documents: 'Documents',
      telephone: 'T\u00e9l\u00e9phone',
      autre: 'Autre'
    };

    const statusBadge = (statut) => {
      const map = {
        impayee: '<span class="badge badge-danger">Impay\u00e9e</span>',
        payee: '<span class="badge badge-success">Pay\u00e9e</span>',
        contestee: '<span class="badge badge-warning">Contest\u00e9e</span>'
      };
      return map[statut] || statut;
    };

    const renderTable = (items) => {
      Table.create({
        container: '#contraventions-table',
        data: items,
        columns: [
          { label: 'Chauffeur', key: 'chauffeurId', render: (v) => chauffeurMap[v.chauffeurId] || v.chauffeurId },
          { label: 'Date', key: 'date', render: (v) => Utils.formatDate(v.date) },
          { label: 'Type', key: 'type', render: (v) => typeLabels[v.type] || v.type },
          { label: 'Lieu', key: 'lieu', render: (v) => v.lieu || '-' },
          { label: 'Montant', key: 'montant', render: (v) => Utils.formatCurrency(v.montant || 0) },
          { label: 'Statut', key: 'statut', render: (v) => {
            let html = statusBadge(v.statut);
            if (v.moyenPaiement === 'wave') {
              html += ' <span class="badge" style="font-size:0.65rem;background:rgba(13,110,253,0.1);color:#0D6EFD;"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon> Wave</span>';
            }
            if (v.motifContestation) {
              html += ` <span title="${v.motifContestation}" style="cursor:help;font-size:0.7rem;color:#94a3b8"><iconify-icon icon="solar:chat-round-dots-bold"></iconify-icon></span>`;
            }
            return html;
          }},
          { label: 'Actions', key: 'actions', render: (v) => {
            let btns = `<button class="btn-icon" title="Modifier" onclick="ContraventionsPage._edit('${v.id}')"><iconify-icon icon="solar:pen-bold"></iconify-icon></button>`;
            if (v.statut === 'impayee' || v.statut === 'contestee') {
              btns += ` <button class="btn-icon btn-success" title="Marquer pay\u00e9e" onclick="ContraventionsPage._markPaid('${v.id}')"><iconify-icon icon="solar:check-circle-bold"></iconify-icon></button>`;
              btns += ` <button class="btn-icon" title="Payer via Wave" onclick="ContraventionsPage._payWave('${v.id}')" style="color:#0D6EFD"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></button>`;
            }
            btns += ` <button class="btn-icon btn-danger" title="Supprimer" onclick="ContraventionsPage._delete('${v.id}')"><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon></button>`;
            return btns;
          }}
        ],
        sortKey: 'date',
        sortDir: 'desc',
        pageSize: 15,
        emptyMessage: 'Aucune contravention'
      });
    };

    renderTable(data.contraventions);

    // Filters
    const applyFilters = () => {
      const chauffeur = document.getElementById('filter-chauffeur').value;
      const statut = document.getElementById('filter-statut').value;
      let filtered = data.contraventions;
      if (chauffeur) filtered = filtered.filter(c => c.chauffeurId === chauffeur);
      if (statut) filtered = filtered.filter(c => c.statut === statut);
      renderTable(filtered);
    };

    document.getElementById('filter-chauffeur').addEventListener('change', applyFilters);
    document.getElementById('filter-statut').addEventListener('change', applyFilters);

    // KPI Total impayé — click to show details
    document.getElementById('kpi-total-impaye').addEventListener('click', () => {
      this._showImpayeesDetail(data, chauffeurMap, typeLabels);
    });

    // Add button
    document.getElementById('btn-add-contravention').addEventListener('click', () => this._add(data.chauffeurs));
  },

  _showImpayeesDetail(data, chauffeurMap, typeLabels) {
    const impayees = data.contraventions.filter(c => c.statut === 'impayee');
    const total = impayees.reduce((s, c) => s + (c.montant || 0), 0);

    // Regrouper par chauffeur
    const byChauffeur = {};
    impayees.forEach(c => {
      const name = chauffeurMap[c.chauffeurId] || c.chauffeurId;
      if (!byChauffeur[name]) byChauffeur[name] = { items: [], total: 0 };
      byChauffeur[name].items.push(c);
      byChauffeur[name].total += (c.montant || 0);
    });

    let html = `
      <div style="margin-bottom:1rem;padding:1rem;border-radius:0.75rem;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;color:#ef4444">${impayees.length} contravention${impayees.length > 1 ? 's' : ''} impay\u00e9e${impayees.length > 1 ? 's' : ''}</span>
          <span style="font-weight:900;font-size:1.1rem;color:#ef4444">${Utils.formatCurrency(total)}</span>
        </div>
      </div>
    `;

    // D\u00e9tail par chauffeur
    Object.entries(byChauffeur).sort((a, b) => b[1].total - a[1].total).forEach(([name, group]) => {
      html += `
        <div style="margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;padding-bottom:0.25rem;border-bottom:1px solid #e2e8f0">
            <span style="font-weight:800;font-size:0.9rem">${name}</span>
            <span style="font-weight:700;color:#ef4444;font-size:0.85rem">${Utils.formatCurrency(group.total)}</span>
          </div>
          ${group.items.map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0.5rem;font-size:0.82rem;border-radius:0.5rem;margin-bottom:2px;background:#f8fafc">
              <span style="color:#64748b">${Utils.formatDate(c.date)} \u00b7 ${typeLabels[c.type] || c.type}${c.lieu ? ' \u00b7 ' + c.lieu : ''}</span>
              <span style="font-weight:700">${Utils.formatCurrency(c.montant || 0)}</span>
            </div>
          `).join('')}
        </div>
      `;
    });

    if (impayees.length === 0) {
      html = '<div style="text-align:center;padding:2rem;color:#94a3b8">Aucune contravention impay\u00e9e</div>';
    }

    Modal.form(
      '<iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:#ef4444"></iconify-icon> D\u00e9tail des contraventions impay\u00e9es',
      `<div style="max-height:60vh;overflow-y:auto">${html}</div>`,
      null
    );
  },

  _add(chauffeurs) {
    const typeOptions = [
      { value: 'exces_vitesse', label: 'Exc\u00e8s de vitesse' },
      { value: 'stationnement', label: 'Stationnement' },
      { value: 'feu_rouge', label: 'Feu rouge' },
      { value: 'documents', label: 'Documents' },
      { value: 'telephone', label: 'T\u00e9l\u00e9phone au volant' },
      { value: 'autre', label: 'Autre' }
    ];

    Modal.form(
      '<iconify-icon icon="solar:document-text-bold-duotone" style="color:#3b82f6;"></iconify-icon> Nouvelle contravention',
      `<form id="form-contravention" class="modal-form">
          <div class="form-group">
            <label>Chauffeur *</label>
            <select name="chauffeurId" required>
              <option value="">S\u00e9lectionner...</option>
              ${chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Date *</label>
            <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label>Type *</label>
            <select name="type" required>
              ${typeOptions.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Lieu</label>
            <input type="text" name="lieu" placeholder="ex: Boulevard Latrille, Cocody">
          </div>
          <div class="form-group">
            <label>Montant (FCFA) *</label>
            <input type="number" name="montant" required min="1" placeholder="0">
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea name="description" rows="2" placeholder="D\u00e9tails de l'infraction..."></textarea>
          </div>
          <div class="form-group">
            <label>Commentaire admin</label>
            <textarea name="commentaire" rows="2" placeholder="Note interne..."></textarea>
          </div>
        </form>`,
      () => this._saveNew()
    );
  },

  async _saveNew() {
    const form = document.getElementById('form-contravention');
    const fd = new FormData(form);
    const chauffeurId = fd.get('chauffeurId');
    const montant = parseInt(fd.get('montant'));

    if (!chauffeurId || !montant) {
      Toast.show('Chauffeur et montant requis', 'error');
      return;
    }

    const chauffeur = (Store.get('chauffeurs') || []).find(c => c.id === chauffeurId);

    const contravention = {
      id: 'CTR-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      chauffeurId,
      vehiculeId: chauffeur ? chauffeur.vehiculeAssigne : '',
      date: fd.get('date'),
      type: fd.get('type'),
      lieu: fd.get('lieu') || '',
      montant,
      description: fd.get('description') || '',
      commentaire: fd.get('commentaire') || '',
      statut: 'impayee',
      dateCreation: new Date().toISOString()
    };

    Store.add('contraventions', contravention);
    Modal.close();
    Toast.show('Contravention ajout\u00e9e', 'success');
    this.render();
  },

  _edit(id) {
    const contraventions = Store.get('contraventions') || [];
    const c = contraventions.find(x => x.id === id);
    if (!c) return;

    const chauffeurs = Store.get('chauffeurs') || [];
    const typeOptions = [
      { value: 'exces_vitesse', label: 'Exc\u00e8s de vitesse' },
      { value: 'stationnement', label: 'Stationnement' },
      { value: 'feu_rouge', label: 'Feu rouge' },
      { value: 'documents', label: 'Documents' },
      { value: 'telephone', label: 'T\u00e9l\u00e9phone au volant' },
      { value: 'autre', label: 'Autre' }
    ];

    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone" style="color:#3b82f6;"></iconify-icon> Modifier contravention',
      `<form id="form-contravention-edit" class="modal-form">
          <div class="form-group">
            <label>Chauffeur</label>
            <select name="chauffeurId">
              ${chauffeurs.map(ch => `<option value="${ch.id}" ${ch.id === c.chauffeurId ? 'selected' : ''}>${ch.prenom} ${ch.nom}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Date</label>
            <input type="date" name="date" value="${c.date || ''}">
          </div>
          <div class="form-group">
            <label>Type</label>
            <select name="type">
              ${typeOptions.map(t => `<option value="${t.value}" ${t.value === c.type ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Lieu</label>
            <input type="text" name="lieu" value="${c.lieu || ''}">
          </div>
          <div class="form-group">
            <label>Montant (FCFA)</label>
            <input type="number" name="montant" value="${c.montant || 0}" min="1">
          </div>
          <div class="form-group">
            <label>Statut</label>
            <select name="statut">
              <option value="impayee" ${c.statut === 'impayee' ? 'selected' : ''}>Impay\u00e9e</option>
              <option value="payee" ${c.statut === 'payee' ? 'selected' : ''}>Pay\u00e9e</option>
              <option value="contestee" ${c.statut === 'contestee' ? 'selected' : ''}>Contest\u00e9e</option>
            </select>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea name="description" rows="2">${c.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Commentaire admin</label>
            <textarea name="commentaire" rows="2">${c.commentaire || ''}</textarea>
          </div>
          ${c.motifContestation ? `
          <div class="form-group">
            <label>Motif de contestation (chauffeur)</label>
            <div style="padding:0.75rem;background:rgba(245,158,11,0.08);border-radius:0.5rem;font-size:0.85rem;color:#92400e">${c.motifContestation}</div>
          </div>
          ` : ''}
        </form>`,
      () => this._saveEdit(id)
    );
  },

  _saveEdit(id) {
    const form = document.getElementById('form-contravention-edit');
    const fd = new FormData(form);
    const updates = {
      chauffeurId: fd.get('chauffeurId'),
      date: fd.get('date'),
      type: fd.get('type'),
      lieu: fd.get('lieu') || '',
      montant: parseInt(fd.get('montant')) || 0,
      statut: fd.get('statut'),
      description: fd.get('description') || '',
      commentaire: fd.get('commentaire') || ''
    };

    if (updates.statut === 'payee') {
      updates.datePaiement = new Date().toISOString();
    }

    Store.update('contraventions', id, updates);
    Modal.close();
    Toast.show('Contravention mise \u00e0 jour', 'success');
    this.render();
  },

  _markPaid(id) {
    if (!confirm('Marquer cette contravention comme pay\u00e9e ?')) return;
    Store.update('contraventions', id, {
      statut: 'payee',
      datePaiement: new Date().toISOString()
    });
    Toast.show('Contravention marqu\u00e9e comme pay\u00e9e', 'success');
    this.render();
  },

  _delete(id) {
    if (!confirm('Supprimer cette contravention ?')) return;
    Store.delete('contraventions', id);
    Toast.show('Contravention supprim\u00e9e', 'success');
    this.render();
  },

  async _payWave(id) {
    const contraventions = Store.get('contraventions') || [];
    const c = contraventions.find(x => x.id === id);
    if (!c) return;

    const chauffeurs = Store.get('chauffeurs') || [];
    const ch = chauffeurs.find(x => x.id === c.chauffeurId);
    const name = ch ? `${ch.prenom} ${ch.nom}` : c.chauffeurId;

    if (!confirm(`Payer la contravention de ${name} (${Utils.formatCurrency(c.montant)}) via Wave ?`)) return;

    Toast.show('Redirection vers Wave...', 'info');

    try {
      const apiBase = Store._apiBase || '/api';
      const res = await fetch(apiBase + '/contraventions/wave/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('pilote_token') || '')
        },
        body: JSON.stringify({ contraventionId: id })
      });

      const data = await res.json();

      if (!res.ok) {
        Toast.show(data.error || 'Erreur Wave', 'error');
        return;
      }

      if (data.waveLaunchUrl) {
        window.open(data.waveLaunchUrl, '_blank');
      } else {
        Toast.show('URL de paiement non disponible', 'error');
      }
    } catch (err) {
      console.error('Wave checkout error:', err);
      Toast.show('Erreur de connexion', 'error');
    }
  }
};
