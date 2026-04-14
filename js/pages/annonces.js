/**
 * AnnoncesPage — Gestion des annonces & promotions pour pilote.tech
 *
 * NOTE: All user-visible text is escaped via Utils.escHtml() before insertion.
 * innerHTML is only used for trusted template strings with escaped dynamic values.
 */
const AnnoncesPage = {

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <h1><iconify-icon icon="solar:megaphone-bold-duotone"></iconify-icon> Annonces &amp; Promotions</h1>
        <button class="btn btn-primary" onclick="AnnoncesPage._addAnnonce()">
          <iconify-icon icon="solar:add-circle-bold"></iconify-icon> Nouvelle annonce
        </button>
      </div>
      <p style="color:var(--text-muted);margin-bottom:var(--space-lg);">
        Creez des annonces visibles en popup sur <strong>pilote.tech</strong> pour vos visiteurs. Activez ou desactivez en un clic.
      </p>
      <div id="annonces-list">
        <div style="padding:40px;text-align:center;color:var(--text-muted);"><iconify-icon icon="solar:refresh-bold-duotone" style="font-size:24px;" class="spin"></iconify-icon> Chargement...</div>
      </div>
    `;
    this._loadAnnonces();
  },

  destroy() {},

  async _loadAnnonces() {
    const ct = document.getElementById('annonces-list');

    const { data: annonces, error } = await supabase
      .from('fleet_announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      ct.textContent = '';
      const errP = document.createElement('p');
      errP.style.cssText = 'color:var(--danger);padding:20px;';
      errP.textContent = 'Erreur : ' + error.message;
      ct.appendChild(errP);
      return;
    }

    if (!annonces || annonces.length === 0) {
      ct.innerHTML = `
        <div class="card" style="text-align:center;padding:60px 20px;">
          <iconify-icon icon="solar:megaphone-bold-duotone" style="font-size:64px;color:var(--primary);opacity:.25;"></iconify-icon>
          <h3 style="margin-top:16px;color:var(--text-muted);">Aucune annonce</h3>
          <p style="color:var(--text-muted);margin-bottom:20px;">Creez votre premiere annonce pour attirer des clients sur pilote.tech</p>
          <button class="btn btn-primary" onclick="AnnoncesPage._addAnnonce()">
            <iconify-icon icon="solar:add-circle-bold"></iconify-icon> Creer une annonce
          </button>
        </div>`;
      return;
    }

    ct.innerHTML = '<div class="grid-2" style="gap:var(--space-md);">' + annonces.map(a => this._cardTemplate(a)).join('') + '</div>';
  },

  _cardTemplate(a) {
    const isActive = a.active && (!a.end_date || new Date(a.end_date) > new Date());
    const typeConfig = {
      promotion: { label: 'Promotion', color: 'var(--primary)', icon: 'solar:tag-price-bold-duotone' },
      info: { label: 'Information', color: 'var(--success)', icon: 'solar:info-circle-bold-duotone' },
      urgent: { label: 'Urgent', color: 'var(--danger)', icon: 'solar:danger-bold-duotone' }
    };
    const tc = typeConfig[a.type] || typeConfig.promotion;
    const dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const endStr = a.end_date ? new Date(a.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';

    // All dynamic values are escaped via Utils.escHtml
    const safeTitle = Utils.escHtml(a.title);
    const safeMessage = Utils.escHtml(a.message);
    const safeCtaText = a.cta_text ? Utils.escHtml(a.cta_text) : '';
    const safeCtaLink = a.cta_link ? Utils.escHtml(a.cta_link) : '';
    const safeImageUrl = a.image_url ? Utils.escHtml(a.image_url) : '';
    const safeId = Utils.escHtml(a.id);

    return `
      <div class="card" style="position:relative;overflow:hidden;${isActive ? 'border-left:4px solid ' + tc.color : ''}">
        ${safeImageUrl ? '<div style="height:140px;background:var(--bg-tertiary);border-radius:var(--radius-md);margin-bottom:12px;overflow:hidden;"><img src="' + safeImageUrl + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display=\'none\'"></div>' : ''}
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span class="badge" style="background:${tc.color}15;color:${tc.color};border:1px solid ${tc.color}30;">
            <iconify-icon icon="${tc.icon}" style="margin-right:4px;vertical-align:-2px;"></iconify-icon>${tc.label}
          </span>
          ${isActive ? '<span class="badge" style="background:var(--success)15;color:var(--success);"><iconify-icon icon="solar:check-circle-bold" style="margin-right:3px;vertical-align:-2px;"></iconify-icon>En ligne</span>' : '<span class="badge" style="background:var(--bg-tertiary);color:var(--text-muted);">Brouillon</span>'}
        </div>
        <h3 style="font-size:var(--font-size-lg);font-weight:700;margin-bottom:4px;">${safeTitle}</h3>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${safeMessage}</p>
        ${safeCtaText ? '<div style="font-size:var(--font-size-xs);color:var(--primary);margin-bottom:8px;"><iconify-icon icon="solar:link-bold" style="margin-right:4px;"></iconify-icon>' + safeCtaText + (safeCtaLink ? ' &rarr; ' + safeCtaLink : '') + '</div>' : ''}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:12px;border-top:1px solid var(--border-color);margin-top:auto;">
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">
            ${dateStr}${endStr ? ' &mdash; expire le ' + endStr : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <label class="toggle-switch" style="margin:0;" title="${a.active ? 'Desactiver' : 'Activer'}">
              <input type="checkbox" ${a.active ? 'checked' : ''} onchange="AnnoncesPage._toggleAnnonce('${safeId}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
            <button class="btn-icon" onclick="AnnoncesPage._editAnnonce('${safeId}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
            <button class="btn-icon btn-icon-danger" onclick="AnnoncesPage._deleteAnnonce('${safeId}')" title="Supprimer"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
          </div>
        </div>
      </div>`;
  },

  _addAnnonce() {
    this._openAnnonceForm(null);
  },

  async _editAnnonce(id) {
    const { data } = await supabase.from('fleet_announcements').select('*').eq('id', id).single();
    if (data) this._openAnnonceForm(data);
  },

  _openAnnonceForm(existing) {
    const isEdit = !!existing;
    Modal.form({
      title: isEdit ? 'Modifier l\'annonce' : 'Nouvelle annonce',
      icon: 'solar:megaphone-bold-duotone',
      fields: [
        { name: 'title', label: 'Titre', type: 'text', required: true, value: existing?.title || '', placeholder: 'Ex: Promotion rentree -20% sur le Star 5' },
        { name: 'message', label: 'Message', type: 'textarea', required: true, value: existing?.message || '', placeholder: 'Decrivez votre offre ou annonce...' },
        { type: 'row-start' },
        { name: 'type', label: 'Type', type: 'select', value: existing?.type || 'promotion', options: [
          { value: 'promotion', label: 'Promotion' },
          { value: 'info', label: 'Information' },
          { value: 'urgent', label: 'Urgent' }
        ]},
        { name: 'active', label: 'Statut', type: 'select', value: existing?.active ? 'true' : 'false', options: [
          { value: 'true', label: 'Actif — visible sur pilote.tech' },
          { value: 'false', label: 'Brouillon — non visible' }
        ]},
        { type: 'row-end' },
        { type: 'row-start' },
        { name: 'image_url', label: 'URL de l\'image (optionnel)', type: 'text', value: existing?.image_url || '', placeholder: 'https://...' },
        { name: 'end_date', label: 'Date de fin (optionnel)', type: 'date', value: existing?.end_date ? existing.end_date.split('T')[0] : '' },
        { type: 'row-end' },
        { type: 'divider' },
        { type: 'heading', label: 'Bouton d\'action (CTA)' },
        { type: 'row-start' },
        { name: 'cta_text', label: 'Texte du bouton', type: 'text', value: existing?.cta_text || 'En savoir plus', placeholder: 'En savoir plus' },
        { name: 'cta_link', label: 'Lien du bouton', type: 'text', value: existing?.cta_link || '', placeholder: 'https://pilote.tech/vehicules' },
        { type: 'row-end' }
      ],
      submitLabel: isEdit ? 'Enregistrer' : 'Creer l\'annonce',
      onSubmit: async (values) => {
        const record = {
          title: values.title,
          message: values.message,
          type: values.type || 'promotion',
          active: values.active === 'true',
          image_url: values.image_url || null,
          cta_text: values.cta_text || 'En savoir plus',
          cta_link: values.cta_link || null,
          end_date: values.end_date ? new Date(values.end_date + 'T23:59:59').toISOString() : null
        };

        if (isEdit) {
          const { error } = await supabase.from('fleet_announcements').update(record).eq('id', existing.id);
          if (error) { Toast.error('Erreur : ' + error.message); return; }
          Toast.success('Annonce modifiee');
        } else {
          const { error } = await supabase.from('fleet_announcements').insert(record);
          if (error) { Toast.error('Erreur : ' + error.message); return; }
          Toast.success('Annonce creee et ' + (record.active ? 'visible sur pilote.tech' : 'enregistree en brouillon'));
        }

        Modal.close();
        this._loadAnnonces();
      }
    });
  },

  async _toggleAnnonce(id, active) {
    const { error } = await supabase.from('fleet_announcements').update({ active }).eq('id', id);
    if (error) {
      Toast.error('Erreur : ' + error.message);
      return;
    }
    Toast.success(active ? 'Annonce activee — visible sur pilote.tech' : 'Annonce desactivee');
    this._loadAnnonces();
  },

  async _deleteAnnonce(id) {
    if (!confirm('Supprimer cette annonce ?')) return;
    const { error } = await supabase.from('fleet_announcements').delete().eq('id', id);
    if (error) { Toast.error('Erreur : ' + error.message); return; }
    Toast.success('Annonce supprimee');
    this._loadAnnonces();
  }
};
