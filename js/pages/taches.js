/**
 * TachesPage — Module Gestion des Taches
 * Vue intuitive pour les utilisateurs / Vue complete pour admin
 */
const TachesPage = {
  _activeTab: 'tous',
  _table: null,

  _isAdmin() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    return s && s.role === 'Administrateur';
  },

  _currentUserId() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    return s ? s.userId : '';
  },

  _isChauffeur() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    return s && s.role === 'chauffeur';
  },

  render() {
    const container = document.getElementById('page-content');
    if (this._isChauffeur()) {
      container.innerHTML = `<div class="empty-state"><iconify-icon icon="solar:lock-bold-duotone" style="font-size:3rem;color:var(--text-muted);"></iconify-icon><h3>Acces non autorise</h3><p style="color:var(--text-muted);">Cette fonctionnalite n'est pas disponible pour les chauffeurs.</p></div>`;
      return;
    }
    if (this._isAdmin()) {
      container.innerHTML = this._adminPageTemplate();
      this._renderTab(this._activeTab);
      this._bindTabEvents();
    } else {
      container.innerHTML = this._userPageTemplate();
      this._bindUserActions();
    }
  },

  destroy() {
    this._table = null;
  },

  // =================== VUE UTILISATEUR (INTUITIVE) ===================

  _userPageTemplate() {
    const userId = this._currentUserId();
    const allTaches = Store.get('taches') || [];
    const mesTaches = allTaches.filter(t => t.assigneA === userId || t.creePar === userId);
    const enAttente = mesTaches.filter(t => t.statut === 'a_faire' || t.statut === 'en_cours');
    const terminees = mesTaches.filter(t => t.statut === 'terminee' || t.statut === 'annulee');
    const today = new Date().toISOString().split('T')[0];

    // Sort by priority then echeance
    const sortTasks = (arr) => arr.sort((a, b) => {
      const pOrd = { urgente: 0, haute: 1, normale: 2, basse: 3 };
      const pa = pOrd[a.priorite] ?? 2;
      const pb = pOrd[b.priorite] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.dateEcheance || '9999').localeCompare(b.dateEcheance || '9999');
    });

    sortTasks(enAttente);

    // Taches du jour (echeance aujourd'hui ou en retard)
    const tachesDuJour = enAttente.filter(t =>
      t.dateEcheance && t.dateEcheance <= today
    );

    return `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <h1><iconify-icon icon="solar:checklist-bold-duotone" style="color:#6366f1;"></iconify-icon> Mes taches</h1>
        <button class="btn btn-primary" onclick="TachesPage._addTache()" style="display:inline-flex;align-items:center;gap:6px;">
          <iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouvelle tache
        </button>
      </div>

      <!-- Résumé rapide -->
      <div class="taches-user-summary">
        <div class="tus-card tus-afaire" onclick="document.getElementById('taches-section-afaire')?.scrollIntoView({behavior:'smooth'})">
          <div class="tus-icon" style="background:rgba(249,115,22,.15);color:#f97316;">
            <iconify-icon icon="solar:clipboard-list-bold-duotone"></iconify-icon>
          </div>
          <div class="tus-num">${enAttente.length}</div>
          <div class="tus-label">A effectuer</div>
        </div>
        <div class="tus-card tus-done">
          <div class="tus-icon" style="background:rgba(34,197,94,.15);color:#22c55e;">
            <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon>
          </div>
          <div class="tus-num">${terminees.length}</div>
          <div class="tus-label">Terminees</div>
        </div>
        ${tachesDuJour.length > 0 ? `
        <div class="tus-card tus-urgent" onclick="document.getElementById('taches-section-afaire')?.scrollIntoView({behavior:'smooth'})">
          <div class="tus-icon" style="background:rgba(239,68,68,.15);color:#ef4444;">
            <iconify-icon icon="solar:alarm-bold-duotone"></iconify-icon>
          </div>
          <div class="tus-num">${tachesDuJour.length}</div>
          <div class="tus-label">Aujourd'hui / Retard</div>
        </div>` : ''}
      </div>

      ${enAttente.length === 0 ? `
        <div class="taches-empty-hero">
          <div class="teh-icon"><iconify-icon icon="solar:cup-star-bold-duotone"></iconify-icon></div>
          <h2>Tout est fait !</h2>
          <p>Vous n'avez aucune tache en attente. Profitez-en !</p>
        </div>
      ` : ''}

      <!-- Section A EFFECTUER -->
      ${enAttente.length > 0 ? `
      <div id="taches-section-afaire" class="taches-section">
        <div class="ts-header ts-orange">
          <iconify-icon icon="solar:clipboard-list-bold-duotone"></iconify-icon>
          <span>A effectuer</span>
          <span class="ts-count">${enAttente.length}</span>
        </div>
        <div class="taches-cards-grid">
          ${enAttente.map(t => this._renderUserTaskCard(t, today)).join('')}
        </div>
      </div>` : ''}

      <!-- Section TERMINEES (collapsed) -->
      ${terminees.length > 0 ? `
      <div class="taches-section">
        <div class="ts-header ts-green ts-collapsible" onclick="this.parentElement.classList.toggle('ts-open')">
          <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon>
          <span>Terminees</span>
          <span class="ts-count">${terminees.length}</span>
          <iconify-icon icon="solar:alt-arrow-down-bold-duotone" class="ts-chevron" style="margin-left:auto;transition:transform .2s;"></iconify-icon>
        </div>
        <div class="taches-cards-grid ts-collapsed-content">
          ${terminees.slice(0, 10).map(t => this._renderUserTaskCard(t, today, true)).join('')}
          ${terminees.length > 10 ? `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:13px;">... et ${terminees.length - 10} autres</div>` : ''}
        </div>
      </div>` : ''}

      ${this._userStyles()}
    `;
  },

  _renderUserTaskCard(t, today, isDone) {
    const prioriteConfig = {
      urgente: { color: '#ef4444', bg: 'rgba(239,68,68,.1)', icon: 'solar:danger-bold-duotone', label: 'Urgente' },
      haute:   { color: '#f97316', bg: 'rgba(249,115,22,.1)', icon: 'solar:arrow-up-bold-duotone', label: 'Haute' },
      normale: { color: '#3b82f6', bg: 'rgba(59,130,246,.1)', icon: 'solar:minus-circle-bold-duotone', label: 'Normale' },
      basse:   { color: '#6b7280', bg: 'rgba(107,114,128,.1)', icon: 'solar:arrow-down-bold-duotone', label: 'Basse' }
    };
    const pCfg = prioriteConfig[t.priorite] || prioriteConfig.normale;
    const typeLabels = { maintenance: 'Maintenance', administratif: 'Administratif', livraison: 'Livraison', controle: 'Controle', autre: 'Autre' };
    const typeIcons = { maintenance: 'solar:wrench-bold-duotone', administratif: 'solar:document-text-bold-duotone', livraison: 'solar:delivery-bold-duotone', controle: 'solar:shield-check-bold-duotone', autre: 'solar:widget-4-bold-duotone' };

    const isLate = !isDone && t.dateEcheance && t.dateEcheance < today;
    const isDueToday = !isDone && t.dateEcheance && t.dateEcheance === today;

    const daysUntil = t.dateEcheance ? Math.ceil((new Date(t.dateEcheance) - new Date(today)) / 86400000) : null;
    let echeanceText = '';
    let echeanceStyle = 'color:var(--text-muted)';
    if (t.dateEcheance) {
      if (isLate) {
        const dLate = Math.abs(daysUntil);
        echeanceText = `En retard de ${dLate} jour${dLate > 1 ? 's' : ''}`;
        echeanceStyle = 'color:#ef4444;font-weight:700';
      } else if (isDueToday) {
        echeanceText = "Aujourd'hui";
        echeanceStyle = 'color:#f59e0b;font-weight:700';
      } else if (daysUntil === 1) {
        echeanceText = 'Demain';
        echeanceStyle = 'color:#f97316;font-weight:600';
      } else if (daysUntil <= 3) {
        echeanceText = `Dans ${daysUntil} jours`;
        echeanceStyle = 'color:#f97316';
      } else {
        echeanceText = Utils.formatDate(t.dateEcheance);
      }
    }

    const cardBorder = isLate ? 'border-left:4px solid #ef4444' : isDueToday ? 'border-left:4px solid #f59e0b' : t.priorite === 'urgente' ? 'border-left:4px solid #ef4444' : t.priorite === 'haute' ? 'border-left:4px solid #f97316' : 'border-left:4px solid var(--border-color)';

    const pendingClass = !isDone ? (t.statut === 'en_cours' ? 'utc-pending utc-encours' : 'utc-pending utc-afaire') : '';

    return `
    <div class="utc ${isDone ? 'utc-done' : ''} ${isLate ? 'utc-late' : ''} ${pendingClass}" style="${cardBorder}">
      <div class="utc-top">
        <div class="utc-type">
          <iconify-icon icon="${typeIcons[t.type] || typeIcons.autre}" style="font-size:14px;"></iconify-icon>
          ${typeLabels[t.type] || t.type}
        </div>
        <span class="utc-priorite" style="background:${pCfg.bg};color:${pCfg.color};">
          <iconify-icon icon="${pCfg.icon}" style="font-size:12px;"></iconify-icon>
          ${pCfg.label}
        </span>
      </div>

      <div class="utc-titre">
        ${!isDone && t.statut === 'en_cours' ? '<span class="utc-encours-badge"><iconify-icon icon="solar:running-round-bold-duotone"></iconify-icon> En cours</span> ' : ''}${t.titre}
      </div>
      ${t.description ? `<div class="utc-desc">${t.description}</div>` : ''}

      <div class="utc-meta">
        ${echeanceText ? `
        <div class="utc-meta-item" style="${echeanceStyle}">
          <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:14px;"></iconify-icon>
          ${echeanceText}
        </div>` : ''}
        ${(() => {
          const currentUserId = TachesPage._currentUserId();
          const isMyTask = t.assigneA === currentUserId;
          const isCreator = t.creePar === currentUserId;
          if (isCreator && !isMyTask && t.assigneANom) {
            return `<div class="utc-meta-item" style="color:var(--text-muted);"><iconify-icon icon="solar:user-bold-duotone" style="font-size:14px;"></iconify-icon> Assigne a ${t.assigneANom}</div>`;
          } else if (t.creeParNom) {
            return `<div class="utc-meta-item" style="color:var(--text-muted);"><iconify-icon icon="solar:user-bold-duotone" style="font-size:14px;"></iconify-icon> Assigne par ${t.creeParNom}</div>`;
          }
          return '';
        })()}
      </div>

      ${!isDone ? (() => {
        const currentUserId = TachesPage._currentUserId();
        const isMyTask = t.assigneA === currentUserId;
        if (isMyTask) {
          return `<div class="utc-actions">
            ${t.statut === 'a_faire' ? `
            <button class="btn-utc btn-utc-start btn-utc-done-full" onclick="TachesPage._changeStatut('${t.id}', 'en_cours')">
              <iconify-icon icon="solar:hand-shake-bold-duotone"></iconify-icon> Je m'en occupe
            </button>` : `
            <button class="btn-utc btn-utc-done btn-utc-done-full" onclick="TachesPage._changeStatut('${t.id}', 'terminee')">
              <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tache effectuee
            </button>`}
            <button class="btn-utc btn-utc-detail" onclick="TachesPage._viewTache('${t.id}')">
              <iconify-icon icon="solar:eye-bold-duotone"></iconify-icon>
            </button>
          </div>`;
        } else {
          // Tache que j'ai créée pour quelqu'un d'autre — suivi seulement
          return `<div class="utc-actions">
            <span style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:4px;">
              <iconify-icon icon="${t.statut === 'en_cours' ? 'solar:running-round-bold-duotone' : 'solar:clock-circle-bold-duotone'}" style="font-size:14px;"></iconify-icon>
              ${t.statut === 'en_cours' ? 'En cours de traitement' : 'En attente'}
            </span>
            <button class="btn-utc btn-utc-detail" onclick="TachesPage._viewTache('${t.id}')">
              <iconify-icon icon="solar:eye-bold-duotone"></iconify-icon>
            </button>
          </div>`;
        }
      })() : `
      <div class="utc-done-badge">
        <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon>
        ${t.statut === 'terminee' ? 'Terminee' : 'Annulee'}
        ${t.dateTerminaison ? ` le ${Utils.formatDate(t.dateTerminaison.split('T')[0])}` : ''}
      </div>`}
    </div>`;
  },

  _bindUserActions() {
    // Nothing special needed — onclick handlers are inline
  },

  _userStyles() {
    return `<style>
      /* Summary cards */
      .taches-user-summary { display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:12px;margin-bottom:24px; }
      .tus-card { display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 12px;border-radius:16px;background:var(--bg-primary);border:1px solid var(--border-color);cursor:pointer;transition:all .2s; }
      .tus-card:hover { transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.08); }
      .tus-icon { width:44px;height:44px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.3rem; }
      .tus-num { font-size:1.5rem;font-weight:800;color:var(--text-primary); }
      .tus-label { font-size:12px;font-weight:600;color:var(--text-muted);text-align:center; }

      /* Empty hero */
      .taches-empty-hero { display:flex;flex-direction:column;align-items:center;gap:12px;padding:60px 20px;text-align:center; }
      .teh-icon { font-size:4rem;color:#22c55e;margin-bottom:8px; }
      .taches-empty-hero h2 { font-size:1.4rem;font-weight:700;color:var(--text-primary);margin:0; }
      .taches-empty-hero p { color:var(--text-muted);font-size:14px;margin:0; }

      /* Section headers */
      .taches-section { margin-bottom:24px; }
      .ts-header { display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;padding:10px 16px;border-radius:12px;margin-bottom:12px; }
      .ts-header .ts-count { padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;background:rgba(255,255,255,.8);color:inherit; }
      .ts-orange { background:rgba(249,115,22,.1);color:#f97316; }
      .ts-orange .ts-count { background:rgba(249,115,22,.15); }
      .ts-blue { background:rgba(59,130,246,.1);color:#3b82f6; }
      .ts-blue .ts-count { background:rgba(59,130,246,.15); }
      .ts-green { background:rgba(34,197,94,.1);color:#22c55e; }
      .ts-green .ts-count { background:rgba(34,197,94,.15); }
      .ts-collapsible { cursor:pointer;user-select:none; }
      .ts-collapsible:hover { filter:brightness(0.95); }
      .ts-collapsed-content { display:none; }
      .ts-open .ts-collapsed-content { display:grid; }
      .ts-open .ts-chevron { transform:rotate(180deg); }

      /* Task cards grid */
      .taches-cards-grid { display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:12px; }

      /* User Task Card */
      .utc { background:var(--bg-primary);border-radius:14px;padding:16px 18px;border:1px solid var(--border-color);transition:all .2s;display:flex;flex-direction:column;gap:8px; }
      .utc:hover { box-shadow:0 4px 16px rgba(0,0,0,.06);transform:translateY(-1px); }
      .utc-late { background:rgba(239,68,68,.03); }
      .utc-done { opacity:.55; }

      /* Highlight unfinished tasks */
      .utc-pending { box-shadow:0 0 0 1px rgba(59,130,246,.18), 0 2px 12px rgba(59,130,246,.08); }
      .utc-afaire { background:linear-gradient(135deg, rgba(249,115,22,.04) 0%, rgba(249,115,22,.01) 100%); box-shadow:0 0 0 1px rgba(249,115,22,.2), 0 2px 12px rgba(249,115,22,.08); }
      .utc-encours { background:linear-gradient(135deg, rgba(59,130,246,.05) 0%, rgba(59,130,246,.01) 100%); box-shadow:0 0 0 1px rgba(59,130,246,.22), 0 2px 12px rgba(59,130,246,.1); }
      .utc-afaire:hover { box-shadow:0 0 0 1px rgba(249,115,22,.3), 0 4px 20px rgba(249,115,22,.12); }
      .utc-encours:hover { box-shadow:0 0 0 1px rgba(59,130,246,.32), 0 4px 20px rgba(59,130,246,.14); }

      .utc-top { display:flex;align-items:center;justify-content:space-between;gap:8px; }
      .utc-type { display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--text-muted); }
      .utc-priorite { display:inline-flex;align-items:center;gap:3px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700; }

      .utc-titre { font-size:15px;font-weight:700;color:var(--text-primary);line-height:1.35;display:flex;align-items:center;gap:6px;flex-wrap:wrap; }
      .utc-encours-badge { display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:rgba(59,130,246,.12);color:#3b82f6;white-space:nowrap; }
      .utc-desc { font-size:12px;color:var(--text-muted);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden; }

      .utc-meta { display:flex;flex-wrap:wrap;gap:10px;font-size:12px; }
      .utc-meta-item { display:flex;align-items:center;gap:4px; }

      /* Action buttons */
      .utc-actions { display:flex;gap:6px;margin-top:4px;padding-top:10px;border-top:1px solid var(--border-color); }
      .btn-utc { border:none;cursor:pointer;border-radius:10px;padding:8px 16px;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:5px;transition:all .15s;font-family:inherit; }
      .btn-utc-start { background:rgba(59,130,246,.12);color:#3b82f6; }
      .btn-utc-start:hover { background:rgba(59,130,246,.22); }
      .btn-utc-done { background:rgba(34,197,94,.12);color:#22c55e; }
      .btn-utc-done:hover { background:rgba(34,197,94,.22); }
      .btn-utc-done-full { flex:1; justify-content:center; }
      .btn-utc-detail { background:var(--bg-secondary);color:var(--text-muted);padding:8px 10px;margin-left:auto; }
      .btn-utc-detail:hover { background:var(--bg-tertiary); }

      .utc-done-badge { display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#22c55e;margin-top:4px; }
      .utc-done .utc-done-badge { color:#6b7280; }

      /* Dark mode tweaks */
      [data-theme="dark"] .tus-card { background:var(--bg-secondary); }
      [data-theme="dark"] .tus-card:hover { box-shadow:0 6px 20px rgba(0,0,0,.25); }
      [data-theme="dark"] .utc { background:var(--bg-secondary); }
      [data-theme="dark"] .utc:hover { box-shadow:0 4px 16px rgba(0,0,0,.2); }
      [data-theme="dark"] .utc-late { background:rgba(239,68,68,.08); }
      [data-theme="dark"] .utc-afaire { background:linear-gradient(135deg, rgba(249,115,22,.08) 0%, rgba(249,115,22,.02) 100%); }
      [data-theme="dark"] .utc-encours { background:linear-gradient(135deg, rgba(59,130,246,.1) 0%, rgba(59,130,246,.03) 100%); }
      [data-theme="dark"] .ts-header .ts-count { background:rgba(255,255,255,.1); }

      @media (max-width:600px) {
        .taches-cards-grid { grid-template-columns:1fr; }
        .taches-user-summary { grid-template-columns:repeat(2, 1fr); }
      }
    </style>`;
  },

  // =================== VUE ADMIN (COMPLETE) ===================

  _adminPageTemplate() {
    const taches = Store.get('taches') || [];
    const aFaire = taches.filter(t => t.statut === 'a_faire');
    const enCours = taches.filter(t => t.statut === 'en_cours');
    const terminees = taches.filter(t => t.statut === 'terminee');
    const urgentes = taches.filter(t => t.priorite === 'urgente' && t.statut !== 'terminee' && t.statut !== 'annulee');

    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:checklist-bold-duotone" style="color:#6366f1;"></iconify-icon> Gestion des taches</h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="TachesPage._addTache()">
            <iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouvelle tache
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="d-grid d-g4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:checklist-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${taches.length}</div>
          <div class="kpi-label">Total taches</div>
        </div>
        <div class="kpi-card orange">
          <div class="kpi-icon"><iconify-icon icon="solar:hourglass-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${aFaire.length}</div>
          <div class="kpi-label">A faire</div>
        </div>
        <div class="kpi-card blue">
          <div class="kpi-icon"><iconify-icon icon="solar:play-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${enCours.length}</div>
          <div class="kpi-label">En cours</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-icon"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${terminees.length}</div>
          <div class="kpi-label">Terminees</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tache-tabs" style="display:flex;gap:0;margin-bottom:var(--space-lg);border-bottom:2px solid var(--border-color);overflow-x:auto;">
        <button class="tache-tab ${this._activeTab === 'tous' ? 'active' : ''}" data-tab="tous">
          <iconify-icon icon="solar:list-bold-duotone"></iconify-icon> Toutes (${taches.length})
        </button>
        <button class="tache-tab ${this._activeTab === 'a_faire' ? 'active' : ''}" data-tab="a_faire">
          <iconify-icon icon="solar:hourglass-bold-duotone"></iconify-icon> A faire (${aFaire.length})
        </button>
        <button class="tache-tab ${this._activeTab === 'en_cours' ? 'active' : ''}" data-tab="en_cours">
          <iconify-icon icon="solar:play-circle-bold-duotone"></iconify-icon> En cours (${enCours.length})
        </button>
        <button class="tache-tab ${this._activeTab === 'terminees' ? 'active' : ''}" data-tab="terminees">
          <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Terminees (${terminees.length})
        </button>
        ${urgentes.length > 0 ? `
        <button class="tache-tab ${this._activeTab === 'urgentes' ? 'active' : ''}" data-tab="urgentes" style="color:#ef4444;">
          <iconify-icon icon="solar:danger-bold-duotone"></iconify-icon> Urgentes (${urgentes.length})
        </button>` : ''}
        ${(() => {
          const recurrentes = taches.filter(t => t.recurrenceActif && t.recurrence && t.recurrence !== 'aucune');
          return `<button class="tache-tab ${this._activeTab === 'recurrentes' ? 'active' : ''}" data-tab="recurrentes" style="color:#6366f1;">
            <iconify-icon icon="solar:restart-bold-duotone"></iconify-icon> Recurrentes (${recurrentes.length})
          </button>`;
        })()}
      </div>

      <div id="tache-tab-content"></div>

      <style>
        .tache-tab { background:none;border:none;padding:10px 20px;cursor:pointer;font-size:var(--font-size-sm);font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;gap:6px;white-space:nowrap;font-family:inherit; }
        .tache-tab:hover { color:var(--text-primary);background:var(--bg-secondary);border-radius:var(--radius-md) var(--radius-md) 0 0; }
        .tache-tab.active { color:#6366f1;border-bottom-color:#6366f1; }
        .tache-priorite { display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700; }
        .tache-priorite.basse { background:rgba(59,130,246,0.15);color:#60a5fa; }
        .tache-priorite.normale { background:rgba(34,197,94,0.15);color:#4ade80; }
        .tache-priorite.haute { background:#f97316;color:#fff; }
        .tache-priorite.urgente { background:#ef4444;color:#fff; }
        .tache-type { display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700;background:#6366f1;color:#fff; }

        /* Admin table row highlights — couleurs vives pour differencier */
        .tache-row-done td { opacity:.45; }
        .tache-row-afaire td { background:rgba(249,115,22,.15); }
        .tache-row-encours td { background:rgba(59,130,246,.18); }
        .tache-row-urgente td { background:rgba(239,68,68,.18); }
        .tache-row-afaire td:first-child { box-shadow:inset 4px 0 0 #f97316; }
        .tache-row-encours td:first-child { box-shadow:inset 4px 0 0 #3b82f6; }
        .tache-row-urgente td:first-child { box-shadow:inset 4px 0 0 #ef4444; }
        .tache-row-done td:first-child { box-shadow:inset 4px 0 0 #22c55e; }
      </style>
    `;
  },

  _bindTabEvents() {
    document.querySelectorAll('.tache-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        document.querySelectorAll('.tache-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderTab(this._activeTab);
      });
    });
  },

  _renderTab(tab) {
    const content = document.getElementById('tache-tab-content');
    if (!content) return;

    let taches = Store.get('taches') || [];

    if (tab === 'a_faire') {
      taches = taches.filter(t => t.statut === 'a_faire');
    } else if (tab === 'en_cours') {
      taches = taches.filter(t => t.statut === 'en_cours');
    } else if (tab === 'terminees') {
      taches = taches.filter(t => t.statut === 'terminee' || t.statut === 'annulee');
    } else if (tab === 'urgentes') {
      taches = taches.filter(t => t.priorite === 'urgente' && t.statut !== 'terminee' && t.statut !== 'annulee');
    } else if (tab === 'recurrentes') {
      taches = taches.filter(t => t.recurrenceActif && t.recurrence && t.recurrence !== 'aucune');
    }

    // Sort: urgentes first, then by echeance
    taches.sort((a, b) => {
      const pOrd = { urgente: 0, haute: 1, normale: 2, basse: 3 };
      const pa = pOrd[a.priorite] ?? 2;
      const pb = pOrd[b.priorite] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.dateEcheance || '9999').localeCompare(b.dateEcheance || '9999');
    });

    const users = Store.get('users') || [];
    const typeLabels = { maintenance: 'Maintenance', administratif: 'Administratif', livraison: 'Livraison', controle: 'Controle', autre: 'Autre' };
    const prioriteLabels = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };
    const statutLabels = { a_faire: 'A faire', en_cours: 'En cours', terminee: 'Terminee', annulee: 'Annulee' };

    if (taches.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <iconify-icon icon="solar:checklist-bold-duotone" style="font-size:3rem;color:var(--success);"></iconify-icon>
          <h3>Aucune tache ${tab === 'a_faire' ? 'en attente' : tab === 'en_cours' ? 'en cours' : tab === 'terminees' ? 'terminee' : tab === 'urgentes' ? 'urgente' : ''}</h3>
          <p style="color:var(--text-muted);">Les taches creees apparaitront ici.</p>
        </div>
      `;
      return;
    }

    Table.create({
      containerId: 'tache-tab-content',
      columns: [
        { label: 'Tache', key: 'titre', primary: true, render: (t) => {
          const isLate = t.dateEcheance && t.dateEcheance < new Date().toISOString().split('T')[0] && t.statut !== 'terminee' && t.statut !== 'annulee';
          const recLabels = { quotidien: 'Quotidien', hebdomadaire: 'Hebdo', mensuel: 'Mensuel' };
          const isRec = t.recurrenceActif && t.recurrence && t.recurrence !== 'aucune';
          const isInstance = !!t.recurrenceParentId;
          return `<div>
            <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
              ${t.titre}
              ${isRec ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:rgba(99,102,241,.12);color:#6366f1;"><iconify-icon icon="solar:restart-bold-duotone" style="font-size:12px;"></iconify-icon>${recLabels[t.recurrence] || ''}</span>` : ''}
              ${isInstance ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:rgba(34,197,94,.12);color:#22c55e;"><iconify-icon icon="solar:copy-bold-duotone" style="font-size:12px;"></iconify-icon>Auto</span>` : ''}
            </div>
            ${t.description ? `<div style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.description}</div>` : ''}
            ${isLate ? '<span style="font-size:10px;color:#ef4444;font-weight:600;">En retard</span>' : ''}
          </div>`;
        }},
        { label: 'Type', key: 'type', render: (t) => `<span class="tache-type">${typeLabels[t.type] || t.type}</span>` },
        { label: 'Assigne a', key: 'assigneA', render: (t) => {
          if (!t.assigneA) return '<span style="color:var(--text-muted);">Non assigne</span>';
          const u = users.find(x => x.id === t.assigneA);
          return u ? `<strong>${[u.prenom, u.nom].filter(Boolean).join(' ') || u.login}</strong>` : (t.assigneANom || t.assigneA);
        }},
        { label: 'Priorite', key: 'priorite', render: (t) => `<span class="tache-priorite ${t.priorite}">${prioriteLabels[t.priorite] || t.priorite}</span>` },
        { label: 'Echeance', key: 'dateEcheance', render: (t) => {
          if (!t.dateEcheance) return '<span style="color:var(--text-muted);">—</span>';
          const isLate = t.dateEcheance < new Date().toISOString().split('T')[0] && t.statut !== 'terminee' && t.statut !== 'annulee';
          return `<span style="${isLate ? 'color:#ef4444;font-weight:600;' : ''}">${Utils.formatDate(t.dateEcheance)}</span>`;
        }},
        { label: 'Statut', key: 'statut', render: (t) => {
          const colors = { a_faire: '#f59e0b', en_cours: '#3b82f6', terminee: '#22c55e', annulee: '#6b7280' };
          const c = colors[t.statut] || '#6b7280';
          return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700;background:${c};color:#fff;">${statutLabels[t.statut] || t.statut}</span>`;
        }},
        { label: '', key: 'actions', render: (t) => {
          return `<div style="display:flex;gap:4px;flex-wrap:nowrap;">
            <button class="btn btn-sm btn-secondary" onclick="TachesPage._viewTache('${t.id}')" title="Detail"><iconify-icon icon="solar:eye-bold-duotone"></iconify-icon></button>
            <button class="btn btn-sm btn-secondary" onclick="TachesPage._editTache('${t.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
            ${t.recurrenceActif ? `<button class="btn btn-sm btn-secondary" onclick="TachesPage._toggleRecurrence('${t.id}')" title="Arreter la recurrence" style="color:#f59e0b;"><iconify-icon icon="solar:stop-bold-duotone"></iconify-icon></button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="TachesPage._deleteTache('${t.id}')" title="Supprimer"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
          </div>`;
        }}
      ],
      data: taches,
      pageSize: 15,
      rowClass: (t) => {
        if (t.statut === 'terminee' || t.statut === 'annulee') return 'tache-row-done';
        if (t.priorite === 'urgente' && t.statut !== 'terminee' && t.statut !== 'annulee') return 'tache-row-urgente';
        if (t.statut === 'en_cours') return 'tache-row-encours';
        if (t.statut === 'a_faire') return 'tache-row-afaire';
        return '';
      }
    });
  },

  // =================== CRUD ===================

  _addTache() {
    if (this._isChauffeur()) { Toast.error('Acces non autorise'); return; }
    const fields = this._formFields();
    Modal.form(
      '<iconify-icon icon="solar:checklist-bold-duotone" style="color:#6366f1;"></iconify-icon> Nouvelle tache',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        const session = typeof Auth !== 'undefined' ? Auth.getSession() : {};
        const users = Store.get('users') || [];
        const assignedUser = users.find(u => u.id === values.assigneA);

        // Recuperer les valeurs de recurrence
        const recData = this._getRecurrenceValues(body);

        Store.add('taches', {
          id: Utils.generateId('TCH'),
          ...values,
          assigneANom: assignedUser ? ([assignedUser.prenom, assignedUser.nom].filter(Boolean).join(' ') || assignedUser.login) : '',
          statut: 'a_faire',
          creePar: session.userId || '',
          creeParNom: [session.prenom, session.nom].filter(Boolean).join(' ') || session.login || '',
          dateCreation: new Date().toISOString(),
          dateModification: new Date().toISOString(),
          ...recData
        });

        Modal.close();
        Toast.success(recData.recurrenceActif ? 'Tache recurrente creee avec succes' : 'Tache creee avec succes');
        this.render();
      }
    );
    this._bindRecurrenceUI();
  },

  _editTache(id) {
    if (!this._isAdmin()) { Toast.error('Seul un administrateur peut modifier les taches'); return; }
    const tache = Store.findById('taches', id);
    if (!tache) return;

    const fields = this._formFields(tache);
    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone" style="color:#6366f1;"></iconify-icon> Modifier la tache',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        const users = Store.get('users') || [];
        const assignedUser = users.find(u => u.id === values.assigneA);

        // Recuperer les valeurs de recurrence (sauf si instance generee)
        const recData = !tache.recurrenceParentId ? this._getRecurrenceValues(body) : {};

        Store.update('taches', id, {
          ...values,
          assigneANom: assignedUser ? ([assignedUser.prenom, assignedUser.nom].filter(Boolean).join(' ') || assignedUser.login) : '',
          dateModification: new Date().toISOString(),
          dateTerminaison: (values.statut === 'terminee' && !tache.dateTerminaison) ? new Date().toISOString() : tache.dateTerminaison,
          ...recData
        });

        Modal.close();
        Toast.success('Tache mise a jour');
        this.render();
      }
    );
    this._bindRecurrenceUI(tache);
  },

  _viewTache(id) {
    const tache = Store.findById('taches', id);
    if (!tache) return;

    const users = Store.get('users') || [];
    const assigned = users.find(u => u.id === tache.assigneA);

    const typeLabels = { maintenance: 'Maintenance', administratif: 'Administratif', livraison: 'Livraison', controle: 'Controle', autre: 'Autre' };
    const prioriteLabels = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };
    const statutLabels = { a_faire: 'A faire', en_cours: 'En cours', terminee: 'Terminee', annulee: 'Annulee' };
    const statutColors = { a_faire: '#f59e0b', en_cours: '#3b82f6', terminee: '#22c55e', annulee: '#6b7280' };

    Modal.open({
      title: `<iconify-icon icon="solar:checklist-bold-duotone" style="color:#6366f1;"></iconify-icon> ${tache.titre}`,
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:var(--font-size-sm);">
          <div><span class="text-muted">Type</span><br><span class="tache-type">${typeLabels[tache.type] || tache.type}</span></div>
          <div><span class="text-muted">Priorite</span><br><span class="tache-priorite ${tache.priorite}">${prioriteLabels[tache.priorite] || tache.priorite}</span></div>
          <div><span class="text-muted">Assigne a</span><br><strong>${assigned ? ([assigned.prenom, assigned.nom].filter(Boolean).join(' ') || assigned.login) : (tache.assigneANom || 'Non assigne')}</strong></div>
          <div><span class="text-muted">Statut</span><br><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${statutColors[tache.statut]}1f;color:${statutColors[tache.statut]};">${statutLabels[tache.statut]}</span></div>
          <div><span class="text-muted">Echeance</span><br><strong>${tache.dateEcheance ? Utils.formatDate(tache.dateEcheance) : '—'}</strong></div>
          <div><span class="text-muted">Creee par</span><br><strong>${tache.creeParNom || '—'}</strong></div>
          ${tache.description ? `<div style="grid-column:1/-1;"><span class="text-muted">Description</span><br><div style="padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-top:4px;">${tache.description}</div></div>` : ''}
          ${tache.commentaire ? `<div style="grid-column:1/-1;"><span class="text-muted">Commentaire</span><br><div style="padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-top:4px;">${tache.commentaire}</div></div>` : ''}
          ${(() => {
            const recLabels = { quotidien: 'Tous les jours', hebdomadaire: 'Chaque semaine', mensuel: 'Chaque mois' };
            const jourLabels = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
            const isRec = tache.recurrenceActif && tache.recurrence && tache.recurrence !== 'aucune';
            const isInstance = !!tache.recurrenceParentId;
            if (!isRec && !isInstance) return '';
            let detail = '';
            if (isRec) {
              detail = `<div style="grid-column:1/-1;padding:10px;background:rgba(99,102,241,.08);border-radius:var(--radius-sm);border-left:3px solid #6366f1;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <iconify-icon icon="solar:restart-bold-duotone" style="color:#6366f1;font-size:18px;"></iconify-icon>
                  <strong style="color:#6366f1;">Tache recurrente</strong>
                </div>
                <div style="font-size:12px;color:var(--text-muted);">
                  Frequence : <strong>${recLabels[tache.recurrence]}</strong>
                  ${tache.recurrence === 'hebdomadaire' && tache.joursSemaine ? ' — ' + tache.joursSemaine.map(j => jourLabels[j]).join(', ') : ''}
                  ${tache.recurrence === 'mensuel' && tache.jourMois ? ' — le ' + tache.jourMois + ' du mois' : ''}
                  ${tache.prochaineExecution ? '<br>Prochaine generation : <strong>' + Utils.formatDate(tache.prochaineExecution) + '</strong>' : ''}
                </div>
              </div>`;
            }
            if (isInstance) {
              detail = `<div style="grid-column:1/-1;padding:10px;background:rgba(34,197,94,.08);border-radius:var(--radius-sm);border-left:3px solid #22c55e;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <iconify-icon icon="solar:copy-bold-duotone" style="color:#22c55e;font-size:18px;"></iconify-icon>
                  <strong style="color:#22c55e;">Generee automatiquement</strong>
                </div>
                <div style="font-size:12px;color:var(--text-muted);">Cette tache a ete creee automatiquement par une tache recurrente.</div>
              </div>`;
            }
            return detail;
          })()}
          <div><span class="text-muted">Creee le</span><br><strong>${tache.dateCreation ? Utils.formatDate(tache.dateCreation.split('T')[0]) : '—'}</strong></div>
          ${tache.dateTerminaison ? `<div><span class="text-muted">Terminee le</span><br><strong>${Utils.formatDate(tache.dateTerminaison.split('T')[0])}</strong></div>` : ''}
        </div>
      `,
      footer: `
        ${this._isAdmin() ? `<button class="btn btn-secondary" onclick="TachesPage._editTache('${id}')"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>` : ''}
        ${tache.statut === 'a_faire' ? `<button class="btn btn-primary" onclick="TachesPage._changeStatut('${id}', 'en_cours')"><iconify-icon icon="solar:play-bold-duotone"></iconify-icon> Demarrer</button>` : ''}
        ${tache.statut === 'en_cours' ? `<button class="btn btn-success" onclick="TachesPage._changeStatut('${id}', 'terminee')"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tache effectuee</button>` : ''}
        ${tache.statut === 'a_faire' ? `<button class="btn btn-success" onclick="TachesPage._changeStatut('${id}', 'terminee')"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Tache effectuee</button>` : ''}
        <button class="btn btn-secondary" data-action="cancel">Fermer</button>
      `,
      size: 'large'
    });
  },

  _changeStatut(id, newStatut) {
    const update = { statut: newStatut, dateModification: new Date().toISOString() };
    if (newStatut === 'terminee') {
      update.dateTerminaison = new Date().toISOString();
    }
    Store.update('taches', id, update);
    Modal.close();
    const labels = { en_cours: 'en cours', terminee: 'effectuee', annulee: 'annulee' };
    Toast.success('Tache marquee comme "' + (labels[newStatut] || newStatut) + '"');
    this.render();
  },

  _deleteTache(id) {
    if (!this._isAdmin()) { Toast.error('Seul un administrateur peut supprimer les taches'); return; }
    if (!confirm('Supprimer cette tache ?')) return;
    Store.delete('taches', id);
    Toast.success('Tache supprimee');
    this.render();
  },

  // =================== RECURRENCE ===================

  _toggleRecurrenceSection() {
    const fields = document.getElementById('recurrence-fields');
    const chevron = document.getElementById('recurrence-chevron');
    const badge = document.getElementById('recurrence-toggle-badge');
    if (!fields) return;
    const isVisible = fields.style.display !== 'none';
    fields.style.display = isVisible ? 'none' : 'block';
    if (chevron) chevron.style.transform = isVisible ? '' : 'rotate(180deg)';
    if (isVisible) {
      // Reset recurrence to aucune when collapsing
      const sel = document.querySelector('[name="recurrence"]');
      if (sel) sel.value = 'aucune';
      if (badge) { badge.textContent = 'Desactivee'; badge.style.background = 'var(--bg-secondary)'; badge.style.color = 'var(--text-muted)'; }
    } else {
      if (badge) { badge.textContent = 'Activee'; badge.style.background = 'rgba(99,102,241,.12)'; badge.style.color = '#6366f1'; }
    }
  },

  _bindRecurrenceUI(existing) {
    setTimeout(() => {
      const sel = document.querySelector('[name="recurrence"]');
      if (!sel) return;
      sel.addEventListener('change', () => TachesPage._onRecurrenceChange());
      const val = sel.value;
      const jourMoisInput = document.querySelector('[name="jourMois"]');
      const jourMoisContainer = jourMoisInput ? jourMoisInput.closest('.form-group') : null;
      if (jourMoisContainer) jourMoisContainer.style.display = val === 'mensuel' ? '' : 'none';
      const joursDiv = document.getElementById('field-joursSemaine');
      if (joursDiv) {
        const parent = joursDiv.closest('.form-group');
        if (parent) parent.style.display = val === 'hebdomadaire' ? '' : 'none';
      }
    }, 100);
  },

  _toggleRecurrence(id) {
    if (!this._isAdmin()) return;
    const tache = Store.findById('taches', id);
    if (!tache) return;
    const newState = !tache.recurrenceActif;
    if (!newState && !confirm('Arreter la recurrence de cette tache ? Les taches deja generees seront conservees.')) return;
    Store.update('taches', id, {
      recurrenceActif: newState,
      dateModification: new Date().toISOString()
    });
    Toast.success(newState ? 'Recurrence reactivee' : 'Recurrence arretee');
    this.render();
  },

  _onRecurrenceChange() {
    const sel = document.querySelector('[name="recurrence"]');
    if (!sel) return;
    const val = sel.value;
    const joursDiv = document.getElementById('field-joursSemaine');
    const jourMoisGroup = document.querySelector('[name="jourMois"]');
    const jourMoisContainer = jourMoisGroup ? jourMoisGroup.closest('.form-group') : null;

    if (joursDiv) {
      joursDiv.style.display = val === 'hebdomadaire' ? 'flex' : 'none';
      const parent = joursDiv.closest('.form-group');
      if (parent) parent.style.display = val === 'hebdomadaire' ? '' : 'none';
    }
    if (jourMoisContainer) jourMoisContainer.style.display = val === 'mensuel' ? '' : 'none';
  },

  _toggleJourSemaine(label, jour) {
    const cb = label.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    if (cb.checked) {
      label.style.borderColor = '#6366f1';
      label.style.background = 'rgba(99,102,241,.12)';
      label.style.color = '#6366f1';
    } else {
      label.style.borderColor = 'var(--border-color)';
      label.style.background = 'var(--bg-secondary)';
      label.style.color = 'var(--text-muted)';
    }
  },

  _getRecurrenceValues(body) {
    const recurrence = body.querySelector('[name="recurrence"]');
    if (!recurrence || recurrence.value === 'aucune') {
      return { recurrence: 'aucune', recurrenceActif: false, joursSemaine: [], jourMois: null, prochaineExecution: '' };
    }

    const val = recurrence.value;
    let joursSemaine = [];
    let jourMois = null;
    let prochaineExecution = '';

    if (val === 'hebdomadaire') {
      const checks = body.querySelectorAll('#field-joursSemaine input[type="checkbox"]:checked');
      checks.forEach(c => joursSemaine.push(parseInt(c.value)));
      if (joursSemaine.length === 0) joursSemaine = [1]; // Lundi par defaut
    }

    if (val === 'mensuel') {
      const jm = body.querySelector('[name="jourMois"]');
      jourMois = jm ? parseInt(jm.value) || 1 : 1;
    }

    // Calculer prochaine execution
    const today = new Date();
    if (val === 'quotidien') {
      const next = new Date(today);
      next.setDate(next.getDate() + 1);
      prochaineExecution = next.toISOString().split('T')[0];
    } else if (val === 'hebdomadaire') {
      const dow = today.getDay();
      const sorted = [...joursSemaine].sort((a, b) => a - b);
      let found = false;
      for (const j of sorted) {
        if (j > dow) {
          const next = new Date(today);
          next.setDate(next.getDate() + (j - dow));
          prochaineExecution = next.toISOString().split('T')[0];
          found = true;
          break;
        }
      }
      if (!found) {
        const next = new Date(today);
        next.setDate(next.getDate() + (7 - dow + sorted[0]));
        prochaineExecution = next.toISOString().split('T')[0];
      }
    } else if (val === 'mensuel') {
      const next = new Date(today);
      if (next.getDate() >= jourMois) {
        next.setMonth(next.getMonth() + 1);
      }
      const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(jourMois, maxDay));
      prochaineExecution = next.toISOString().split('T')[0];
    }

    return { recurrence: val, recurrenceActif: true, joursSemaine, jourMois, prochaineExecution };
  },

  _formFields(existing) {
    // Admin voit tous sauf chauffeurs, les autres voient tous sauf chauffeurs ET admin
    const users = (Store.get('users') || []).filter(u => {
      if (u.role === 'chauffeur') return false;
      if (!this._isAdmin() && u.role === 'Administrateur') return false;
      return true;
    });

    return [
      { name: 'titre', label: 'Titre de la tache', type: 'text', required: true, default: existing ? existing.titre : '', placeholder: 'Ex: Preparer les documents comptables...' },
      { type: 'row-start' },
      { name: 'type', label: 'Type', type: 'select', required: true, default: existing ? existing.type : 'autre', options: [
        { value: 'maintenance', label: 'Maintenance' },
        { value: 'administratif', label: 'Administratif' },
        { value: 'livraison', label: 'Livraison' },
        { value: 'controle', label: 'Controle' },
        { value: 'autre', label: 'Autre' }
      ]},
      { name: 'priorite', label: 'Priorite', type: 'select', required: true, default: existing ? existing.priorite : 'normale', options: [
        { value: 'basse', label: 'Basse' },
        { value: 'normale', label: 'Normale' },
        { value: 'haute', label: 'Haute' },
        { value: 'urgente', label: 'Urgente' }
      ]},
      { type: 'row-end' },
      { name: 'assigneA', label: 'Assigner a', type: 'select', default: existing ? existing.assigneA : '', placeholder: 'Selectionner un utilisateur...', options: [{ value: '', label: 'Non assigne' }, ...users.map(u => ({ value: u.id, label: [u.prenom, u.nom].filter(Boolean).join(' ') || u.login }))] },
      { name: 'dateEcheance', label: 'Date d\'echeance', type: 'date', default: existing ? existing.dateEcheance : '' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3, default: existing ? existing.description : '', placeholder: 'Decrivez la tache en detail...' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2, default: existing ? existing.commentaire : '', placeholder: 'Note ou commentaire...' },
      ...(existing ? [
        { name: 'statut', label: 'Statut', type: 'select', default: existing.statut, options: [
          { value: 'a_faire', label: 'A faire' },
          { value: 'en_cours', label: 'En cours' },
          { value: 'terminee', label: 'Terminee' },
          { value: 'annulee', label: 'Annulee' }
        ]}
      ] : []),
      // Recurrence (admin seulement, pas pour les instances generees)
      ...(this._isAdmin() && !(existing && existing.recurrenceParentId) ? [
        { type: 'html', html: (() => {
          const isRec = existing && existing.recurrence && existing.recurrence !== 'aucune';
          return `<div id="recurrence-section">
            <hr style="border-color:var(--border-color);margin:var(--space-md) 0;">
            <div id="recurrence-toggle" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;" onclick="TachesPage._toggleRecurrenceSection()">
              <iconify-icon icon="solar:restart-bold-duotone" style="color:#6366f1;font-size:18px;"></iconify-icon>
              <span style="font-weight:600;color:var(--text-primary);font-size:var(--font-size-sm);">Tache recurrente</span>
              <span id="recurrence-toggle-badge" style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${isRec ? 'rgba(99,102,241,.12)' : 'var(--bg-secondary)'};color:${isRec ? '#6366f1' : 'var(--text-muted)'};">${isRec ? 'Activee' : 'Desactivee'}</span>
              <iconify-icon id="recurrence-chevron" icon="solar:alt-arrow-down-bold-duotone" style="margin-left:auto;color:var(--text-muted);transition:transform .2s;${isRec ? 'transform:rotate(180deg);' : ''}"></iconify-icon>
            </div>
            <div id="recurrence-fields" style="display:${isRec ? 'block' : 'none'};padding-top:8px;">`;
        })() },
        { name: 'recurrence', label: 'Repetition', type: 'select', default: existing ? (existing.recurrence || 'aucune') : 'aucune', options: [
          { value: 'aucune', label: 'Aucune (tache unique)' },
          { value: 'quotidien', label: 'Tous les jours' },
          { value: 'hebdomadaire', label: 'Chaque semaine' },
          { value: 'mensuel', label: 'Chaque mois' }
        ]},
        { type: 'html', html: `<div class="form-group"><label class="form-label">Jours de la semaine</label><div id="field-joursSemaine" style="display:${existing && existing.recurrence === 'hebdomadaire' ? 'flex' : 'none'};gap:6px;flex-wrap:wrap;">
            ${['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((j, i) => {
              const checked = existing && existing.joursSemaine && existing.joursSemaine.includes(i);
              return `<label style="display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid ${checked ? '#6366f1' : 'var(--border-color)'};background:${checked ? 'rgba(99,102,241,.12)' : 'var(--bg-secondary)'};color:${checked ? '#6366f1' : 'var(--text-muted)'};transition:all .2s;" onclick="TachesPage._toggleJourSemaine(this,${i})">
                <input type="checkbox" name="jour_${i}" value="${i}" ${checked ? 'checked' : ''} style="display:none;">
                ${j}
              </label>`;
            }).join('')}
          </div></div>` },
        { name: 'jourMois', label: 'Jour du mois', type: 'number', min: 1, max: 31, default: existing ? (existing.jourMois || 1) : 1 },
        { type: 'html', html: `</div></div>` }
      ] : [])
    ];
  }
};
