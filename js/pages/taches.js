// ==========================================================================
// TACHES — Module de gestion de tâches avancé
// Dashboard Manager | Kanban | Eisenhower | Réunions | Liste
// ==========================================================================

const TachesPage = {
  _activeView: 'dashboard',
  _table: null,
  _draggedTaskId: null,
  _listFilters: { statut: '', priorite: '', assigneA: '', type: '', search: '' },
  _selectedTasks: new Set(),
  _reunionDraft: null,

  // ── Helpers ────────────────────────────────────────────────────────────

  _isAdmin() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    return s && s.role === 'Administrateur';
  },

  _currentUserId() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    return s ? s.userId : '';
  },

  _currentUserName() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s) return '';
    return [s.prenom, s.nom].filter(Boolean).join(' ') || s.login || '';
  },

  _isChauffeur() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    return s && s.role === 'chauffeur';
  },

  _getUsers() {
    return (Store.get('users') || []).filter(u => u.role !== 'chauffeur');
  },

  _getTaches() {
    return Store.get('taches') || [];
  },

  _getComptesRendus() {
    return Store.get('comptesRendus') || [];
  },

  _getUserName(userId) {
    const u = this._getUsers().find(u => u.id === userId);
    if (!u) return '';
    return [u.prenom, u.nom].filter(Boolean).join(' ') || u.login || '';
  },

  _getUserInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  },

  _today() {
    return new Date().toISOString().split('T')[0];
  },

  _startOfWeek() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  },

  _endOfWeek() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? 0 : 7);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  },

  _daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  },

  _prioriteConfig: {
    urgente: { color: '#ef4444', bg: 'rgba(239,68,68,.12)', icon: 'solar:danger-bold-duotone', label: 'Urgente' },
    haute:   { color: '#f97316', bg: 'rgba(249,115,22,.12)', icon: 'solar:arrow-up-bold-duotone', label: 'Haute' },
    normale: { color: '#3b82f6', bg: 'rgba(59,130,246,.12)', icon: 'solar:minus-circle-bold-duotone', label: 'Normale' },
    basse:   { color: '#6b7280', bg: 'rgba(107,114,128,.12)', icon: 'solar:arrow-down-bold-duotone', label: 'Basse' }
  },

  _statutConfig: {
    a_faire:  { color: '#f97316', bg: 'rgba(249,115,22,.12)', label: 'A faire', icon: 'solar:clipboard-list-bold-duotone' },
    en_cours: { color: '#3b82f6', bg: 'rgba(59,130,246,.12)', label: 'En cours', icon: 'solar:play-bold-duotone' },
    terminee: { color: '#22c55e', bg: 'rgba(34,197,94,.12)', label: 'Terminée', icon: 'solar:check-circle-bold-duotone' },
    annulee:  { color: '#6b7280', bg: 'rgba(107,114,128,.12)', label: 'Annulée', icon: 'solar:close-circle-bold-duotone' }
  },

  _typeLabels: {
    maintenance: 'Maintenance', administratif: 'Administratif', livraison: 'Livraison',
    controle: 'Contrôle', autre: 'Autre'
  },

  _reunionTypeLabels: {
    equipe: 'Équipe', direction: 'Direction', operationnel: 'Opérationnel',
    urgence: 'Urgence', autre: 'Autre'
  },

  _reunionTypeColors: {
    equipe: '#3b82f6', direction: '#8b5cf6', operationnel: '#f97316',
    urgence: '#ef4444', autre: '#6b7280'
  },

  // ── Main Render ────────────────────────────────────────────────────────

  render(container) {
    const ct = container || document.getElementById('page-content');
    if (this._isChauffeur()) {
      ct.textContent = '';
      const lockDiv = document.createElement('div');
      lockDiv.className = 'empty-state';
      const lockIcon = document.createElement('iconify-icon');
      lockIcon.setAttribute('icon', 'solar:lock-bold-duotone');
      lockIcon.style.cssText = 'font-size:3rem;color:var(--text-muted);';
      lockDiv.appendChild(lockIcon);
      const h3 = document.createElement('h3');
      h3.textContent = 'Accès non autorisé';
      lockDiv.appendChild(h3);
      const p = document.createElement('p');
      p.style.color = 'var(--text-muted)';
      p.textContent = "Cette fonctionnalité n'est pas disponible pour les chauffeurs.";
      lockDiv.appendChild(p);
      ct.appendChild(lockDiv);
      return;
    }

    ct.textContent = '';
    const styleEl = document.createElement('style');
    styleEl.textContent = this._getStyleContent();
    ct.appendChild(styleEl);

    const moduleDiv = document.createElement('div');
    moduleDiv.className = 'taches-module';

    // Top bar
    const topbar = document.createElement('div');
    topbar.className = 'taches-topbar';

    const topbarLeft = document.createElement('div');
    topbarLeft.className = 'taches-topbar-left';
    const h1 = document.createElement('h1');
    h1.style.cssText = 'margin:0;font-size:1.4rem;display:flex;align-items:center;gap:8px;';
    const h1Icon = document.createElement('iconify-icon');
    h1Icon.setAttribute('icon', 'solar:checklist-bold-duotone');
    h1Icon.style.cssText = 'color:#6366f1;font-size:1.5rem;';
    h1.appendChild(h1Icon);
    h1.appendChild(document.createTextNode(' Gestion des tâches'));
    topbarLeft.appendChild(h1);
    topbar.appendChild(topbarLeft);

    const tabsDiv = document.createElement('div');
    tabsDiv.className = 'taches-tabs';
    tabsDiv.id = 'taches-tabs';
    this._buildTabButtons(tabsDiv);
    topbar.appendChild(tabsDiv);
    moduleDiv.appendChild(topbar);

    const viewContent = document.createElement('div');
    viewContent.id = 'taches-view-content';
    viewContent.className = 'taches-view-content';
    moduleDiv.appendChild(viewContent);

    const fab = document.createElement('button');
    fab.className = 'taches-fab';
    fab.title = 'Nouvelle tâche';
    fab.addEventListener('click', () => TachesPage._openTaskForm());
    const fabIcon = document.createElement('iconify-icon');
    fabIcon.setAttribute('icon', 'solar:add-circle-bold-duotone');
    fabIcon.style.fontSize = '1.5rem';
    fab.appendChild(fabIcon);
    moduleDiv.appendChild(fab);

    ct.appendChild(moduleDiv);
    this._renderActiveView();
  },

  destroy() {
    this._table = null;
    this._selectedTasks.clear();
    this._draggedTaskId = null;
  },

  _buildTabButtons(container) {
    const tabs = [
      { id: 'dashboard', icon: 'solar:chart-square-bold-duotone', label: 'Dashboard' },
      { id: 'kanban', icon: 'solar:widget-4-bold-duotone', label: 'Kanban' },
      { id: 'eisenhower', icon: 'solar:target-bold-duotone', label: 'Eisenhower' },
      { id: 'reunions', icon: 'solar:users-group-rounded-bold-duotone', label: 'Réunions' },
      { id: 'liste', icon: 'solar:list-bold-duotone', label: 'Liste' }
    ];
    tabs.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'taches-tab' + (this._activeView === t.id ? ' active' : '');
      btn.dataset.view = t.id;
      const icon = document.createElement('iconify-icon');
      icon.setAttribute('icon', t.icon);
      btn.appendChild(icon);
      const span = document.createElement('span');
      span.textContent = t.label;
      btn.appendChild(span);
      btn.addEventListener('click', () => {
        this._activeView = t.id;
        container.querySelectorAll('.taches-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderActiveView();
      });
      container.appendChild(btn);
    });
  },

  _renderActiveView() {
    const ct = document.getElementById('taches-view-content');
    if (!ct) return;
    // Using a document fragment built with DOM methods where practical,
    // but for complex templating we build HTML strings with escaped user data
    // (Utils.escHtml) then assign via innerHTML — this is the standard pattern
    // across the entire codebase and user data is always escaped.
    switch (this._activeView) {
      case 'dashboard': ct.innerHTML = this._renderDashboard(); this._bindDashboardClicks(ct); break;
      case 'kanban': ct.innerHTML = this._renderKanban(); this._bindKanbanDragDrop(); break;
      case 'eisenhower': ct.innerHTML = this._renderEisenhower(); this._bindEisenhowerDragDrop(); break;
      case 'reunions': ct.innerHTML = this._renderReunions(); break;
      case 'liste': ct.innerHTML = this._renderListe(); this._bindListeEvents(); break;
    }
  },

  // =====================================================================
  //  DASHBOARD
  // =====================================================================

  _renderDashboard() {
    const taches = this._getTaches();
    const today = this._today();
    const weekStart = this._startOfWeek();
    const weekEnd = this._endOfWeek();

    const active = taches.filter(t => t.statut === 'a_faire' || t.statut === 'en_cours');
    const aFaireAujourdhui = taches.filter(t => (t.statut === 'a_faire' || t.statut === 'en_cours') && t.dateEcheance && t.dateEcheance <= today);
    const enRetard = taches.filter(t => (t.statut === 'a_faire' || t.statut === 'en_cours') && t.dateEcheance && t.dateEcheance < today);
    const enCours = taches.filter(t => t.statut === 'en_cours');
    const termineesSemaine = taches.filter(t => t.statut === 'terminee' && t.dateTerminaison && t.dateTerminaison >= weekStart && t.dateTerminaison <= weekEnd);
    const totalDone = taches.filter(t => t.statut === 'terminee').length;
    const tauxCompletion = taches.length > 0 ? Math.round((totalDone / taches.length) * 100) : 0;

    // Charge par membre
    const userLoad = {};
    active.forEach(t => {
      if (t.assigneA) {
        const name = t.assigneANom || this._getUserName(t.assigneA) || 'Non assigné';
        userLoad[name] = (userLoad[name] || 0) + 1;
      }
    });
    const userLoadArr = Object.entries(userLoad).sort((a, b) => b[1] - a[1]);
    const maxLoad = userLoadArr.length > 0 ? userLoadArr[0][1] : 1;

    // Echeances proches (7 jours)
    const upcoming = taches
      .filter(t => (t.statut === 'a_faire' || t.statut === 'en_cours') && t.dateEcheance && t.dateEcheance >= today && t.dateEcheance <= this._daysFromNow(7))
      .sort((a, b) => a.dateEcheance.localeCompare(b.dateEcheance))
      .slice(0, 10);

    // Activite recente
    const recent = [...taches]
      .filter(t => t.dateModification)
      .sort((a, b) => (b.dateModification || '').localeCompare(a.dateModification || ''))
      .slice(0, 10);

    return `
      <div class="dash-section">
        <div class="dash-kpi-row">
          ${this._kpiCard('solar:clipboard-list-bold-duotone', '#6366f1', 'Tâches actives', active.length, "TachesPage._kpiNav('liste')")}
          ${this._kpiCard('solar:calendar-bold-duotone', '#f59e0b', "À faire aujourd'hui", aFaireAujourdhui.length, "TachesPage._kpiNav('liste','a_faire')")}
          ${this._kpiCard('solar:alarm-bold-duotone', '#ef4444', 'En retard', enRetard.length, "TachesPage._kpiNav('liste','a_faire')")}
          ${this._kpiCard('solar:play-bold-duotone', '#3b82f6', 'En cours', enCours.length, "TachesPage._kpiNav('liste','en_cours')")}
          ${this._kpiCard('solar:check-circle-bold-duotone', '#22c55e', 'Terminées (semaine)', termineesSemaine.length, "TachesPage._kpiNav('liste','terminee')")}
          ${this._kpiCard('solar:chart-bold-duotone', '#8b5cf6', 'Taux complétion', tauxCompletion + '%', "TachesPage._kpiNav('kanban')")}
        </div>
      </div>

      <div class="dash-grid-2col">
        <div class="dash-card">
          <div class="dash-card-header">
            <iconify-icon icon="solar:users-group-rounded-bold-duotone" style="color:#6366f1;"></iconify-icon>
            Charge par membre
          </div>
          <div class="dash-card-body">
            ${userLoadArr.length === 0 ? '<div style="color:var(--text-muted);text-align:center;padding:20px;">Aucune tâche assignée</div>' :
              userLoadArr.map(([name, count]) => `
                <div class="dash-bar-row dash-member-click" style="cursor:pointer;border-radius:8px;padding:6px 8px;transition:background .15s;" data-member="${Utils.escHtml(name)}">
                  <div class="dash-bar-label">${this._avatarBubble(name)} ${Utils.escHtml(name)}</div>
                  <div class="dash-bar-track">
                    <div class="dash-bar-fill" style="width:${Math.round((count / maxLoad) * 100)}%;"></div>
                  </div>
                  <div class="dash-bar-count">${count}</div>
                </div>
              `).join('')
            }
          </div>
        </div>

        <div class="dash-card">
          <div class="dash-card-header">
            <iconify-icon icon="solar:calendar-bold-duotone" style="color:#f97316;"></iconify-icon>
            Échéances proches (7j)
          </div>
          <div class="dash-card-body">
            ${upcoming.length === 0 ? '<div style="color:var(--text-muted);text-align:center;padding:20px;">Aucune échéance dans les 7 prochains jours</div>' :
              upcoming.map(t => {
                const pCfg = this._prioriteConfig[t.priorite] || this._prioriteConfig.normale;
                const daysLeft = Math.ceil((new Date(t.dateEcheance) - new Date(today)) / 86400000);
                const dayLabel = daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? 'Demain' : 'Dans ' + daysLeft + 'j';
                return `
                  <div class="dash-timeline-item" onclick="TachesPage._viewTask('${t.id}')">
                    <div class="dash-timeline-dot" style="background:${pCfg.color};"></div>
                    <div class="dash-timeline-content">
                      <div class="dash-timeline-title">${Utils.escHtml(t.titre)}</div>
                      <div class="dash-timeline-meta">
                        <span style="color:${daysLeft === 0 ? '#ef4444' : daysLeft === 1 ? '#f97316' : 'var(--text-muted)'};">${dayLabel}</span>
                        ${t.assigneANom ? ' &middot; ' + Utils.escHtml(t.assigneANom) : ''}
                      </div>
                    </div>
                  </div>
                `;
              }).join('')
            }
          </div>
        </div>
      </div>

      <div class="dash-card" style="margin-top:16px;">
        <div class="dash-card-header">
          <iconify-icon icon="solar:history-bold-duotone" style="color:#22c55e;"></iconify-icon>
          Activité récente
        </div>
        <div class="dash-card-body">
          ${recent.length === 0 ? '<div style="color:var(--text-muted);text-align:center;padding:20px;">Aucune activité récente</div>' :
            recent.map(t => {
              const sCfg = this._statutConfig[t.statut] || this._statutConfig.a_faire;
              return `
                <div class="dash-activity-item" onclick="TachesPage._viewTask('${t.id}')">
                  <div class="dash-activity-badge" style="background:${sCfg.bg};color:${sCfg.color};">
                    <iconify-icon icon="${sCfg.icon}"></iconify-icon>
                  </div>
                  <div class="dash-activity-info">
                    <div class="dash-activity-title">${Utils.escHtml(t.titre)}</div>
                    <div class="dash-activity-meta">${sCfg.label} &middot; ${t.dateModification ? Utils.formatDate(t.dateModification) : ''}</div>
                  </div>
                </div>
              `;
            }).join('')
          }
        </div>
      </div>
    `;
  },

  _kpiCard(icon, color, label, value, onclick) {
    const clickAttr = onclick ? ' onclick="' + onclick + '"' : '';
    return '<div class="dash-kpi-card" style="--kpi-accent:' + color + ';"' + clickAttr + '>'
      + '<div class="dash-kpi-icon" style="background:' + color + '20;color:' + color + ';">'
      + '<iconify-icon icon="' + icon + '" style="font-size:1.4rem;"></iconify-icon>'
      + '</div>'
      + '<div class="dash-kpi-value" style="color:' + color + ';">' + value + '</div>'
      + '<div class="dash-kpi-label">' + Utils.escHtml(label) + '</div>'
      + '</div>';
  },

  _switchTab(tabId) {
    this._activeView = tabId;
    document.querySelectorAll('.taches-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.view === tabId);
    });
    this._renderActiveView();
  },

  _bindDashboardClicks(ct) {
    ct.querySelectorAll('.dash-member-click').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.dataset.member;
        if (name) this._filterByMember(name);
      });
      el.addEventListener('mouseenter', () => { el.style.background = 'rgba(255,255,255,0.04)'; });
      el.addEventListener('mouseleave', () => { el.style.background = ''; });
    });
  },

  _filterByMember(name) {
    this._currentMemberFilter = name;
    this._switchTab('liste');
    setTimeout(() => {
      const search = document.getElementById('liste-search-input');
      if (search) { search.value = name; search.dispatchEvent(new Event('input')); }
    }, 200);
  },

  _kpiNav(tab, statut) {
    this._switchTab(tab);
    if (statut) {
      setTimeout(() => {
        const s = document.querySelector('.tl-filter-statut');
        if (s) { s.value = statut; s.dispatchEvent(new Event('change')); }
      }, 150);
    }
  },

  _avatarBubble(name) {
    const initials = this._getUserInitials(name);
    const colors = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899'];
    const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const col = colors[hash % colors.length];
    return '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:' + col + '22;color:' + col + ';font-size:11px;font-weight:700;flex-shrink:0;">' + Utils.escHtml(initials) + '</span>';
  },

  // =====================================================================
  //  KANBAN
  // =====================================================================

  _renderKanban() {
    const taches = this._getTaches();
    const columns = [
      { id: 'a_faire', label: 'À faire', color: '#f97316', icon: 'solar:clipboard-list-bold-duotone' },
      { id: 'en_cours', label: 'En cours', color: '#3b82f6', icon: 'solar:play-bold-duotone' },
      { id: 'terminee', label: 'Terminée', color: '#22c55e', icon: 'solar:check-circle-bold-duotone' },
      { id: 'annulee', label: 'Annulée', color: '#6b7280', icon: 'solar:close-circle-bold-duotone' }
    ];

    return '<div class="kanban-board" id="kanban-board">'
      + columns.map(col => {
          const colTasks = taches
            .filter(t => t.statut === col.id)
            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
          return '<div class="kanban-column" data-statut="' + col.id + '">'
            + '<div class="kanban-col-header" style="border-top:3px solid ' + col.color + ';">'
            + '<div class="kanban-col-title">'
            + '<iconify-icon icon="' + col.icon + '" style="color:' + col.color + ';"></iconify-icon>'
            + '<span>' + col.label + '</span>'
            + '<span class="kanban-col-count" style="background:' + col.color + '22;color:' + col.color + ';">' + colTasks.length + '</span>'
            + '</div></div>'
            + '<div class="kanban-col-body" data-statut="' + col.id + '"'
            + ' ondragover="TachesPage._kanbanDragOver(event)"'
            + ' ondrop="TachesPage._kanbanDrop(event, \'' + col.id + '\')"'
            + ' ondragleave="TachesPage._kanbanDragLeave(event)">'
            + colTasks.map(t => this._kanbanCard(t)).join('')
            + (colTasks.length === 0 ? '<div class="kanban-empty">Aucune tâche</div>' : '')
            + '</div>'
            + '<button class="kanban-add-btn" onclick="TachesPage._openTaskForm(\'' + col.id + '\')">'
            + '<iconify-icon icon="solar:add-circle-line-duotone"></iconify-icon> Ajouter'
            + '</button>'
            + '</div>';
        }).join('')
      + '</div>';
  },

  _kanbanCard(t) {
    const pCfg = this._prioriteConfig[t.priorite] || this._prioriteConfig.normale;
    const today = this._today();
    const isLate = (t.statut === 'a_faire' || t.statut === 'en_cours') && t.dateEcheance && t.dateEcheance < today;

    const subTotal = (t.sousTaches || []).length;
    const subDone = (t.sousTaches || []).filter(s => s.fait).length;
    const subPct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0;

    const tags = (t.etiquettes || []).slice(0, 3);

    let html = '<div class="kanban-card" draggable="true" data-task-id="' + t.id + '"'
      + ' ondragstart="TachesPage._kanbanDragStart(event, \'' + t.id + '\')"'
      + ' ondragend="TachesPage._kanbanDragEnd(event)"'
      + ' onclick="TachesPage._viewTask(\'' + t.id + '\')">'
      + '<div class="kanban-card-top">'
      + '<span class="kanban-prio-badge" style="background:' + pCfg.bg + ';color:' + pCfg.color + ';">'
      + '<iconify-icon icon="' + pCfg.icon + '" style="font-size:12px;"></iconify-icon> ' + pCfg.label
      + '</span>';

    if (isLate) {
      html += '<span class="kanban-late-badge"><iconify-icon icon="solar:alarm-bold-duotone" style="font-size:12px;"></iconify-icon> Retard</span>';
    }

    html += '</div>'
      + '<div class="kanban-card-title">' + Utils.escHtml(t.titre) + '</div>';

    if (subTotal > 0) {
      html += '<div class="kanban-subtask-bar">'
        + '<div class="kanban-subtask-track"><div class="kanban-subtask-fill" style="width:' + subPct + '%;"></div></div>'
        + '<span class="kanban-subtask-label">' + subDone + '/' + subTotal + '</span>'
        + '</div>';
    }

    if (tags.length > 0) {
      html += '<div class="kanban-tags">' + tags.map(tag => '<span class="kanban-tag">' + Utils.escHtml(tag) + '</span>').join('') + '</div>';
    }

    html += '<div class="kanban-card-footer">'
      + '<div class="kanban-card-assignee">'
      + (t.assigneANom ? this._avatarBubble(t.assigneANom) : '<span style="color:var(--text-muted);font-size:11px;">Non assigné</span>')
      + '</div>';

    if (t.dateEcheance) {
      html += '<span class="kanban-card-date" style="color:' + (isLate ? '#ef4444' : 'var(--text-muted)') + ';">'
        + '<iconify-icon icon="solar:calendar-line-duotone" style="font-size:13px;"></iconify-icon> '
        + Utils.formatDate(t.dateEcheance)
        + '</span>';
    }

    html += '</div></div>';
    return html;
  },

  _bindKanbanDragDrop() {
    // Drag drop is bound via inline event attributes for simplicity
  },

  _kanbanDragStart(e, taskId) {
    this._draggedTaskId = taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setTimeout(() => {
      if (e.target) e.target.style.opacity = '0.4';
    }, 0);
  },

  _kanbanDragEnd(e) {
    e.target.style.opacity = '1';
    document.querySelectorAll('.kanban-col-body.drag-over').forEach(el => el.classList.remove('drag-over'));
    this._draggedTaskId = null;
  },

  _kanbanDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  },

  _kanbanDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  },

  _kanbanDrop(e, newStatut) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const taskId = this._draggedTaskId || e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    const taches = this._getTaches();
    const task = taches.find(t => t.id === taskId);
    if (!task || task.statut === newStatut) return;

    const update = {
      statut: newStatut,
      dateModification: new Date().toISOString()
    };
    if (newStatut === 'terminee') {
      update.dateTerminaison = new Date().toISOString();
    }

    Store.update('taches', taskId, update);
    Toast.success('Tâche déplacée vers "' + (this._statutConfig[newStatut] ? this._statutConfig[newStatut].label : newStatut) + '"');
    this._renderActiveView();
  },

  // =====================================================================
  //  EISENHOWER
  // =====================================================================

  _renderEisenhower() {
    const taches = this._getTaches().filter(t => t.statut === 'a_faire' || t.statut === 'en_cours');

    const quadrants = [
      { id: 'q1', urgent: true,  important: true,  label: 'Faire immédiatement', color: '#ef4444', bg: 'rgba(239,68,68,.06)', icon: 'solar:fire-bold-duotone', emptyMsg: "Rien d'urgent et important. Bien joué !" },
      { id: 'q2', urgent: false, important: true,  label: 'Planifier', color: '#3b82f6', bg: 'rgba(59,130,246,.06)', icon: 'solar:calendar-bold-duotone', emptyMsg: 'Planifiez vos objectifs importants ici.' },
      { id: 'q3', urgent: true,  important: false, label: 'Déléguer', color: '#f97316', bg: 'rgba(249,115,22,.06)', icon: 'solar:users-group-rounded-bold-duotone', emptyMsg: 'Les tâches urgentes mais non importantes vont ici.' },
      { id: 'q4', urgent: false, important: false, label: 'Éliminer', color: '#6b7280', bg: 'rgba(107,114,128,.06)', icon: 'solar:trash-bin-minimalistic-bold-duotone', emptyMsg: 'Pensez à supprimer ces distractions.' }
    ];

    return '<div class="eisen-matrix" id="eisen-matrix">'
      + '<div class="eisen-axis-y"><span class="eisen-axis-label">IMPORTANT</span></div>'
      + '<div class="eisen-axis-x"><span class="eisen-axis-label">URGENT &rarr;</span></div>'
      + '<div class="eisen-grid">'
      + quadrants.map(q => {
          const qTasks = taches.filter(t => !!t.urgent === q.urgent && !!t.important === q.important);
          return '<div class="eisen-quadrant" data-quadrant="' + q.id + '"'
            + ' data-urgent="' + q.urgent + '" data-important="' + q.important + '"'
            + ' style="background:' + q.bg + ';border:1px solid ' + q.color + '15;"'
            + ' ondragover="TachesPage._eisenDragOver(event)"'
            + ' ondrop="TachesPage._eisenDrop(event, ' + q.urgent + ', ' + q.important + ')"'
            + ' ondragleave="TachesPage._eisenDragLeave(event)">'
            + '<div class="eisen-q-header" style="color:' + q.color + ';">'
            + '<iconify-icon icon="' + q.icon + '" style="font-size:1.1rem;"></iconify-icon>'
            + '<span>' + q.label + '</span>'
            + '<span class="eisen-q-count" style="background:' + q.color + '22;color:' + q.color + ';">' + qTasks.length + '</span>'
            + '</div>'
            + '<div class="eisen-q-body">'
            + (qTasks.length === 0
                ? '<div class="eisen-empty">' + Utils.escHtml(q.emptyMsg) + '</div>'
                : qTasks.map(t => '<div class="eisen-card" draggable="true" data-task-id="' + t.id + '"'
                    + ' ondragstart="TachesPage._eisenDragStart(event, \'' + t.id + '\')"'
                    + ' ondragend="TachesPage._eisenDragEnd(event)"'
                    + ' onclick="TachesPage._viewTask(\'' + t.id + '\')">'
                    + '<div class="eisen-card-title">' + Utils.escHtml(t.titre) + '</div>'
                    + '<div class="eisen-card-meta">'
                    + (t.assigneANom ? this._avatarBubble(t.assigneANom) : '')
                    + (t.dateEcheance ? '<span style="font-size:11px;color:var(--text-muted);">' + Utils.formatDate(t.dateEcheance) + '</span>' : '')
                    + '</div></div>').join('')
              )
            + '</div></div>';
        }).join('')
      + '</div></div>';
  },

  _bindEisenhowerDragDrop() {
    // Bound via inline event attributes
  },

  _eisenDragStart(e, taskId) {
    this._draggedTaskId = taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    setTimeout(() => { if (e.target) e.target.style.opacity = '0.4'; }, 0);
  },

  _eisenDragEnd(e) {
    e.target.style.opacity = '1';
    document.querySelectorAll('.eisen-quadrant.drag-over').forEach(el => el.classList.remove('drag-over'));
    this._draggedTaskId = null;
  },

  _eisenDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  },

  _eisenDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  },

  _eisenDrop(e, urgent, important) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const taskId = this._draggedTaskId || e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    Store.update('taches', taskId, {
      urgent: urgent,
      important: important,
      dateModification: new Date().toISOString()
    });
    Toast.success('Classification Eisenhower mise à jour');
    this._renderActiveView();
  },

  // =====================================================================
  //  REUNIONS
  // =====================================================================

  _renderReunions() {
    const crs = this._getComptesRendus().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const typeLabels = this._reunionTypeLabels;
    const typeColors = this._reunionTypeColors;

    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">'
      + '<h3 style="margin:0;font-size:1.1rem;color:var(--text-primary);">'
      + '<iconify-icon icon="solar:users-group-rounded-bold-duotone" style="color:#8b5cf6;"></iconify-icon> '
      + 'Comptes rendus de réunion</h3>'
      + '<button class="btn btn-primary" onclick="TachesPage._openReunionForm()" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;">'
      + '<iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouvelle réunion</button></div>';

    if (crs.length === 0) {
      html += '<div class="dash-card" style="text-align:center;padding:40px;">'
        + '<iconify-icon icon="solar:notebook-bold-duotone" style="font-size:3rem;color:var(--text-muted);"></iconify-icon>'
        + '<p style="color:var(--text-muted);margin-top:12px;">Aucun compte rendu de réunion</p></div>';
    } else {
      html += '<div class="reunion-list">';
      crs.forEach(cr => {
        const tColor = typeColors[cr.type] || '#6b7280';
        const tLabel = typeLabels[cr.type] || cr.type || 'Autre';
        const nbParticipants = (cr.participants || []).length;
        const nbActions = (cr.actionsAMener || []).length;
        const actionsLiees = (cr.actionsAMener || []).filter(a => a.tacheId).length;
        const dateObj = cr.date ? new Date(cr.date + 'T00:00:00') : null;

        html += '<div class="reunion-card" onclick="TachesPage._viewReunion(\'' + cr.id + '\')">'
          + '<div class="reunion-card-left"><div class="reunion-date-block">'
          + '<div class="reunion-date-day">' + (dateObj ? dateObj.getDate() : '?') + '</div>'
          + '<div class="reunion-date-month">' + (dateObj ? dateObj.toLocaleDateString('fr-FR', { month: 'short' }) : '') + '</div>'
          + '</div></div>'
          + '<div class="reunion-card-body">'
          + '<div class="reunion-card-title">' + Utils.escHtml(cr.titre) + '</div>'
          + '<div class="reunion-card-meta">'
          + '<span class="reunion-type-badge" style="background:' + tColor + '18;color:' + tColor + ';">' + Utils.escHtml(tLabel) + '</span>';

        if (cr.heureDebut) {
          html += '<span style="color:var(--text-muted);font-size:12px;">' + Utils.escHtml(cr.heureDebut) + (cr.heureFin ? ' - ' + Utils.escHtml(cr.heureFin) : '') + '</span>';
        }
        if (cr.lieu) {
          html += '<span style="color:var(--text-muted);font-size:12px;"><iconify-icon icon="solar:map-point-line-duotone" style="font-size:13px;"></iconify-icon> ' + Utils.escHtml(cr.lieu) + '</span>';
        }

        html += '</div><div class="reunion-card-stats">'
          + '<span><iconify-icon icon="solar:users-group-rounded-line-duotone"></iconify-icon> ' + nbParticipants + ' participant' + (nbParticipants > 1 ? 's' : '') + '</span>'
          + '<span><iconify-icon icon="solar:checklist-line-duotone"></iconify-icon> ' + nbActions + ' action' + (nbActions > 1 ? 's' : '') + '</span>';

        if (actionsLiees > 0) {
          html += '<span style="color:#22c55e;"><iconify-icon icon="solar:link-bold-duotone"></iconify-icon> ' + actionsLiees + ' tâche' + (actionsLiees > 1 ? 's' : '') + ' liée' + (actionsLiees > 1 ? 's' : '') + '</span>';
        }

        const statutLabel = cr.statut === 'valide' ? 'Validé' : cr.statut === 'archive' ? 'Archivé' : 'Brouillon';
        html += '</div></div>'
          + '<div class="reunion-card-right">'
          + '<span class="reunion-statut-badge reunion-statut-' + (cr.statut || 'brouillon') + '">' + statutLabel + '</span>'
          + '</div></div>';
      });
      html += '</div>';
    }

    return html;
  },

  _openReunionForm(existingCr) {
    const users = this._getUsers();
    const isEdit = !!existingCr;
    const cr = existingCr || {};

    let participantOptions = '';
    users.forEach(u => {
      const name = [u.prenom, u.nom].filter(Boolean).join(' ') || u.login;
      const checked = (cr.participants || []).some(p => p.userId === u.id);
      participantOptions += '<label style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer;">'
        + '<input type="checkbox" name="participant" value="' + u.id + '" data-name="' + Utils.escHtml(name) + '"' + (checked ? ' checked' : '') + '>'
        + '<span style="font-size:13px;">' + Utils.escHtml(name) + '</span></label>';
    });

    let ordreJourHtml = '';
    (cr.ordreJour || ['']).forEach((item, i) => {
      ordreJourHtml += '<div class="dynamic-list-item" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">'
        + '<input type="text" class="form-control ordre-jour-input" value="' + Utils.escHtml(item) + '" placeholder="Point ' + (i + 1) + '" style="flex:1;font-size:13px;">'
        + '<button type="button" class="btn-icon-sm" onclick="this.parentElement.remove();" title="Retirer">'
        + '<iconify-icon icon="solar:trash-bin-minimalistic-line-duotone" style="color:#ef4444;"></iconify-icon></button></div>';
    });

    let actionsHtml = '';
    (cr.actionsAMener || [{}]).forEach((a, i) => {
      actionsHtml += this._reunionActionRow(a, i, users);
    });

    const body = '<div style="max-height:70vh;overflow-y:auto;padding:4px;">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div style="grid-column:1/-1;"><label class="form-label">Titre *</label>'
      + '<input type="text" id="cr-titre" class="form-control" value="' + Utils.escHtml(cr.titre || '') + '" placeholder="Réunion d\'équipe hebdomadaire"></div>'
      + '<div><label class="form-label">Date *</label>'
      + '<input type="date" id="cr-date" class="form-control" value="' + (cr.date || this._today()) + '"></div>'
      + '<div><label class="form-label">Type</label>'
      + '<select id="cr-type" class="form-control">'
      + '<option value="equipe"' + (cr.type === 'equipe' ? ' selected' : '') + '>Équipe</option>'
      + '<option value="direction"' + (cr.type === 'direction' ? ' selected' : '') + '>Direction</option>'
      + '<option value="operationnel"' + (cr.type === 'operationnel' ? ' selected' : '') + '>Opérationnel</option>'
      + '<option value="urgence"' + (cr.type === 'urgence' ? ' selected' : '') + '>Urgence</option>'
      + '<option value="autre"' + (cr.type === 'autre' ? ' selected' : '') + '>Autre</option>'
      + '</select></div>'
      + '<div><label class="form-label">Heure début</label>'
      + '<input type="time" id="cr-heure-debut" class="form-control" value="' + (cr.heureDebut || '') + '"></div>'
      + '<div><label class="form-label">Heure fin</label>'
      + '<input type="time" id="cr-heure-fin" class="form-control" value="' + (cr.heureFin || '') + '"></div>'
      + '<div style="grid-column:1/-1;"><label class="form-label">Lieu</label>'
      + '<input type="text" id="cr-lieu" class="form-control" value="' + Utils.escHtml(cr.lieu || '') + '" placeholder="Bureau, salle de réunion..."></div>'
      + '</div>'
      + '<div style="margin-top:16px;"><label class="form-label">Participants</label>'
      + '<div style="max-height:150px;overflow-y:auto;padding:8px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);">'
      + participantOptions + '</div></div>'
      + '<div style="margin-top:16px;"><label class="form-label">Ordre du jour</label>'
      + '<div id="cr-ordre-jour-list">' + ordreJourHtml + '</div>'
      + '<button type="button" class="btn btn-sm" onclick="TachesPage._addOrdreJourItem()" style="font-size:12px;margin-top:4px;">'
      + '<iconify-icon icon="solar:add-circle-line-duotone"></iconify-icon> Ajouter un point</button></div>'
      + '<div style="margin-top:16px;"><label class="form-label">Actions à mener</label>'
      + '<div id="cr-actions-list">' + actionsHtml + '</div>'
      + '<button type="button" class="btn btn-sm" onclick="TachesPage._addActionRow()" style="font-size:12px;margin-top:4px;">'
      + '<iconify-icon icon="solar:add-circle-line-duotone"></iconify-icon> Ajouter une action</button></div>'
      + '<div style="margin-top:16px;"><label class="form-label">Notes libres</label>'
      + '<textarea id="cr-notes" class="form-control" rows="4" style="font-size:13px;">' + Utils.escHtml(cr.notesLibres || '') + '</textarea></div>'
      + '</div>';

    const footer = '<button class="btn" onclick="Modal.close()">Annuler</button>'
      + '<button class="btn btn-primary" onclick="TachesPage._saveReunion(\'' + (cr.id || '') + '\')">' + (isEdit ? 'Mettre à jour' : 'Enregistrer') + '</button>';

    Modal.open({ title: isEdit ? 'Modifier la réunion' : 'Nouvelle réunion', body: body, footer: footer, size: 'lg' });
  },

  _reunionActionRow(a, index, users) {
    const allUsers = users || this._getUsers();
    let userOpts = '';
    allUsers.forEach(u => {
      const name = [u.prenom, u.nom].filter(Boolean).join(' ') || u.login;
      userOpts += '<option value="' + u.id + '"' + (a.responsable === u.id ? ' selected' : '') + '>' + Utils.escHtml(name) + '</option>';
    });

    return '<div class="cr-action-row" style="border:1px solid var(--border-color);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--bg-secondary);">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      + '<div style="grid-column:1/-1;"><input type="text" class="form-control cr-action-desc" value="' + Utils.escHtml(a.description || '') + '" placeholder="Description de l\'action" style="font-size:13px;"></div>'
      + '<div><select class="form-control cr-action-responsable" style="font-size:13px;">'
      + '<option value="">Responsable...</option>' + userOpts + '</select></div>'
      + '<div><input type="date" class="form-control cr-action-date" value="' + (a.dateEcheance || '') + '" style="font-size:13px;"></div>'
      + '<div><select class="form-control cr-action-priorite" style="font-size:13px;">'
      + '<option value="normale"' + (a.priorite === 'normale' ? ' selected' : '') + '>Normale</option>'
      + '<option value="haute"' + (a.priorite === 'haute' ? ' selected' : '') + '>Haute</option>'
      + '<option value="urgente"' + (a.priorite === 'urgente' ? ' selected' : '') + '>Urgente</option>'
      + '<option value="basse"' + (a.priorite === 'basse' ? ' selected' : '') + '>Basse</option>'
      + '</select></div>'
      + '<div style="display:flex;align-items:end;">'
      + '<button type="button" class="btn-icon-sm" onclick="this.closest(\'.cr-action-row\').remove();" title="Retirer">'
      + '<iconify-icon icon="solar:trash-bin-minimalistic-line-duotone" style="color:#ef4444;font-size:1rem;"></iconify-icon></button>'
      + '</div></div></div>';
  },

  _addOrdreJourItem() {
    const list = document.getElementById('cr-ordre-jour-list');
    if (!list) return;
    const idx = list.querySelectorAll('.dynamic-list-item').length;
    const div = document.createElement('div');
    div.className = 'dynamic-list-item';
    div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control ordre-jour-input';
    input.placeholder = 'Point ' + (idx + 1);
    input.style.cssText = 'flex:1;font-size:13px;';
    div.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon-sm';
    btn.title = 'Retirer';
    btn.addEventListener('click', () => div.remove());
    btn.innerHTML = '<iconify-icon icon="solar:trash-bin-minimalistic-line-duotone" style="color:#ef4444;"></iconify-icon>';
    div.appendChild(btn);
    list.appendChild(div);
  },

  _addActionRow() {
    const list = document.getElementById('cr-actions-list');
    if (!list) return;
    const html = this._reunionActionRow({}, list.querySelectorAll('.cr-action-row').length);
    list.insertAdjacentHTML('beforeend', html);
  },

  _saveReunion(existingId) {
    const titre = document.getElementById('cr-titre')?.value?.trim();
    const date = document.getElementById('cr-date')?.value;
    if (!titre) { Toast.error('Le titre est requis'); return; }
    if (!date) { Toast.error('La date est requise'); return; }

    const participants = [];
    document.querySelectorAll('input[name="participant"]:checked').forEach(cb => {
      participants.push({
        userId: cb.value,
        nom: cb.dataset.name || '',
        present: true,
        role: 'participant'
      });
    });

    const ordreJour = [];
    document.querySelectorAll('.ordre-jour-input').forEach(inp => {
      const v = inp.value.trim();
      if (v) ordreJour.push(v);
    });

    const actionsAMener = [];
    document.querySelectorAll('.cr-action-row').forEach(row => {
      const desc = row.querySelector('.cr-action-desc')?.value?.trim();
      if (!desc) return;
      const resp = row.querySelector('.cr-action-responsable')?.value || '';
      const respName = resp ? this._getUserName(resp) : '';
      actionsAMener.push({
        description: desc,
        responsable: resp,
        responsableNom: respName,
        dateEcheance: row.querySelector('.cr-action-date')?.value || '',
        priorite: row.querySelector('.cr-action-priorite')?.value || 'normale',
        tacheId: ''
      });
    });

    const data = {
      titre: titre,
      date: date,
      type: document.getElementById('cr-type')?.value || 'equipe',
      heureDebut: document.getElementById('cr-heure-debut')?.value || '',
      heureFin: document.getElementById('cr-heure-fin')?.value || '',
      lieu: document.getElementById('cr-lieu')?.value?.trim() || '',
      participants: participants,
      ordreJour: ordreJour,
      actionsAMener: actionsAMener,
      pointsDiscutes: [],
      decisions: [],
      notesLibres: document.getElementById('cr-notes')?.value || '',
      dateModification: new Date().toISOString()
    };

    if (existingId) {
      Store.update('comptesRendus', existingId, data);
      Toast.success('Réunion mise à jour');
    } else {
      const session = Auth.getSession();
      data.id = Utils.generateId('CR');
      data.creePar = session?.userId || '';
      data.creeParNom = this._currentUserName();
      data.dateCreation = new Date().toISOString();
      data.statut = 'brouillon';
      Store.add('comptesRendus', data);
      Toast.success('Réunion créée');
    }

    Modal.close();
    this._renderActiveView();
  },

  _viewReunion(crId) {
    const cr = this._getComptesRendus().find(c => c.id === crId);
    if (!cr) return;

    const typeLabel = this._reunionTypeLabels[cr.type] || cr.type || 'Autre';
    const typeColor = this._reunionTypeColors[cr.type] || '#6b7280';

    let body = '<div style="max-height:70vh;overflow-y:auto;">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;">'
      + '<span style="background:' + typeColor + '18;color:' + typeColor + ';padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;">' + Utils.escHtml(typeLabel) + '</span>';

    if (cr.date) body += '<span style="color:var(--text-muted);font-size:13px;">' + Utils.formatDate(cr.date) + '</span>';
    if (cr.heureDebut) body += '<span style="color:var(--text-muted);font-size:13px;">' + Utils.escHtml(cr.heureDebut) + (cr.heureFin ? ' - ' + Utils.escHtml(cr.heureFin) : '') + '</span>';
    if (cr.lieu) body += '<span style="color:var(--text-muted);font-size:13px;"><iconify-icon icon="solar:map-point-line-duotone"></iconify-icon> ' + Utils.escHtml(cr.lieu) + '</span>';
    body += '</div>';

    if ((cr.participants || []).length > 0) {
      body += '<div style="margin-bottom:16px;"><div style="font-weight:600;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">Participants</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      cr.participants.forEach(p => {
        body += '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;background:var(--bg-tertiary);font-size:12px;">'
          + this._avatarBubble(p.nom) + ' ' + Utils.escHtml(p.nom) + '</span>';
      });
      body += '</div></div>';
    }

    if ((cr.ordreJour || []).length > 0) {
      body += '<div style="margin-bottom:16px;"><div style="font-weight:600;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">Ordre du jour</div>'
        + '<ol style="margin:0;padding-left:20px;color:var(--text-primary);font-size:13px;">';
      cr.ordreJour.forEach(item => { body += '<li style="margin-bottom:4px;">' + Utils.escHtml(item) + '</li>'; });
      body += '</ol></div>';
    }

    if ((cr.actionsAMener || []).length > 0) {
      body += '<div style="margin-bottom:16px;"><div style="font-weight:600;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">Actions à mener</div>';
      cr.actionsAMener.forEach(a => {
        const pCfg = this._prioriteConfig[a.priorite] || this._prioriteConfig.normale;
        body += '<div style="padding:8px 10px;margin-bottom:6px;border-radius:8px;background:var(--bg-tertiary);border-left:3px solid ' + pCfg.color + ';font-size:13px;">'
          + '<div style="font-weight:500;color:var(--text-primary);">' + Utils.escHtml(a.description) + '</div>'
          + '<div style="display:flex;gap:12px;margin-top:4px;color:var(--text-muted);font-size:12px;">';
        if (a.responsableNom) body += '<span><iconify-icon icon="solar:user-line-duotone"></iconify-icon> ' + Utils.escHtml(a.responsableNom) + '</span>';
        if (a.dateEcheance) body += '<span><iconify-icon icon="solar:calendar-line-duotone"></iconify-icon> ' + Utils.formatDate(a.dateEcheance) + '</span>';
        if (a.tacheId) body += '<span style="color:#22c55e;"><iconify-icon icon="solar:link-bold-duotone"></iconify-icon> Tâche liée</span>';
        body += '</div></div>';
      });
      body += '</div>';
    }

    if (cr.notesLibres) {
      body += '<div style="margin-bottom:16px;"><div style="font-weight:600;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">Notes</div>'
        + '<div style="padding:10px;border-radius:8px;background:var(--bg-tertiary);font-size:13px;color:var(--text-primary);white-space:pre-wrap;">' + Utils.escHtml(cr.notesLibres) + '</div></div>';
    }

    body += '</div>';

    const hasUngeneratedActions = (cr.actionsAMener || []).some(a => !a.tacheId && a.description);

    let footer = '';
    if (hasUngeneratedActions) {
      footer += '<button class="btn" style="color:#22c55e;border-color:#22c55e;" onclick="TachesPage._generateTasksFromReunion(\'' + cr.id + '\')">'
        + '<iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon> Générer les tâches</button>';
    }
    footer += '<button class="btn" onclick="TachesPage._openReunionForm(TachesPage._getComptesRendus().find(function(c){return c.id===\'' + cr.id + '\'}))">'
      + '<iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>'
      + '<button class="btn" onclick="Modal.close()">Fermer</button>';

    Modal.open({ title: cr.titre, body: body, footer: footer, size: 'lg' });
  },

  _generateTasksFromReunion(crId) {
    const crs = this._getComptesRendus();
    const cr = crs.find(c => c.id === crId);
    if (!cr) return;

    const session = Auth.getSession();
    let count = 0;
    const updatedActions = (cr.actionsAMener || []).map(a => {
      if (a.tacheId || !a.description) return a;

      const taskId = Utils.generateId('TCH');
      Store.add('taches', {
        id: taskId,
        titre: a.description,
        description: 'Action issue de la réunion "' + cr.titre + '" du ' + Utils.formatDate(cr.date),
        type: 'autre',
        priorite: a.priorite || 'normale',
        statut: 'a_faire',
        assigneA: a.responsable || '',
        assigneANom: a.responsableNom || '',
        creePar: session?.userId || '',
        creeParNom: this._currentUserName(),
        dateEcheance: a.dateEcheance || '',
        dateCreation: new Date().toISOString(),
        dateModification: new Date().toISOString(),
        urgent: false,
        important: a.priorite === 'haute' || a.priorite === 'urgente',
        etiquettes: ['réunion'],
        sousTaches: [],
        reunionId: crId,
        recurrence: 'aucune',
        recurrenceActif: false
      });

      count++;
      return { ...a, tacheId: taskId };
    });

    Store.update('comptesRendus', crId, {
      actionsAMener: updatedActions,
      dateModification: new Date().toISOString()
    });

    Modal.close();
    Toast.success(count + ' tâche' + (count > 1 ? 's' : '') + ' créée' + (count > 1 ? 's' : '') + ' depuis la réunion');
    this._renderActiveView();
  },

  // =====================================================================
  //  LISTE
  // =====================================================================

  _renderListe() {
    const taches = this._getTaches();
    const users = this._getUsers();
    const f = this._listFilters;

    let filtered = taches.slice();
    if (f.statut) filtered = filtered.filter(t => t.statut === f.statut);
    if (f.priorite) filtered = filtered.filter(t => t.priorite === f.priorite);
    if (f.assigneA) filtered = filtered.filter(t => t.assigneA === f.assigneA);
    if (f.type) filtered = filtered.filter(t => t.type === f.type);
    if (f.search) {
      const q = f.search.toLowerCase();
      filtered = filtered.filter(t =>
        (t.titre || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.assigneANom || '').toLowerCase().includes(q) ||
        (t.etiquettes || []).some(tag => tag.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => (b.dateCreation || '').localeCompare(a.dateCreation || ''));

    let userOpts = '';
    users.forEach(u => {
      const name = [u.prenom, u.nom].filter(Boolean).join(' ') || u.login;
      userOpts += '<option value="' + u.id + '"' + (f.assigneA === u.id ? ' selected' : '') + '>' + Utils.escHtml(name) + '</option>';
    });

    const selectedCount = this._selectedTasks.size;

    let html = '<div class="liste-toolbar">'
      + '<div class="liste-search">'
      + '<iconify-icon icon="solar:magnifer-line-duotone" style="color:var(--text-muted);font-size:1.1rem;"></iconify-icon>'
      + '<input type="text" id="liste-search-input" class="form-control" placeholder="Rechercher..." value="' + Utils.escHtml(f.search) + '" style="border:none;background:transparent;flex:1;font-size:13px;"></div>'
      + '<div class="liste-filters">'
      + '<select id="liste-f-statut" class="form-control form-control-sm" style="font-size:12px;min-width:100px;">'
      + '<option value="">Tous statuts</option>'
      + '<option value="a_faire"' + (f.statut === 'a_faire' ? ' selected' : '') + '>À faire</option>'
      + '<option value="en_cours"' + (f.statut === 'en_cours' ? ' selected' : '') + '>En cours</option>'
      + '<option value="terminee"' + (f.statut === 'terminee' ? ' selected' : '') + '>Terminée</option>'
      + '<option value="annulee"' + (f.statut === 'annulee' ? ' selected' : '') + '>Annulée</option>'
      + '</select>'
      + '<select id="liste-f-priorite" class="form-control form-control-sm" style="font-size:12px;min-width:100px;">'
      + '<option value="">Toutes priorités</option>'
      + '<option value="urgente"' + (f.priorite === 'urgente' ? ' selected' : '') + '>Urgente</option>'
      + '<option value="haute"' + (f.priorite === 'haute' ? ' selected' : '') + '>Haute</option>'
      + '<option value="normale"' + (f.priorite === 'normale' ? ' selected' : '') + '>Normale</option>'
      + '<option value="basse"' + (f.priorite === 'basse' ? ' selected' : '') + '>Basse</option>'
      + '</select>'
      + '<select id="liste-f-assigne" class="form-control form-control-sm" style="font-size:12px;min-width:120px;">'
      + '<option value="">Tous assignés</option>' + userOpts + '</select>'
      + '<select id="liste-f-type" class="form-control form-control-sm" style="font-size:12px;min-width:100px;">'
      + '<option value="">Tous types</option>'
      + '<option value="maintenance"' + (f.type === 'maintenance' ? ' selected' : '') + '>Maintenance</option>'
      + '<option value="administratif"' + (f.type === 'administratif' ? ' selected' : '') + '>Administratif</option>'
      + '<option value="livraison"' + (f.type === 'livraison' ? ' selected' : '') + '>Livraison</option>'
      + '<option value="controle"' + (f.type === 'controle' ? ' selected' : '') + '>Contrôle</option>'
      + '<option value="autre"' + (f.type === 'autre' ? ' selected' : '') + '>Autre</option>'
      + '</select></div></div>';

    if (selectedCount > 0) {
      html += '<div class="liste-bulk-bar">'
        + '<span>' + selectedCount + ' tâche' + (selectedCount > 1 ? 's' : '') + ' sélectionnée' + (selectedCount > 1 ? 's' : '') + '</span>'
        + '<button class="btn btn-sm" onclick="TachesPage._bulkChangeStatus(\'en_cours\')">'
        + '<iconify-icon icon="solar:play-bold-duotone"></iconify-icon> En cours</button>'
        + '<button class="btn btn-sm" onclick="TachesPage._bulkChangeStatus(\'terminee\')">'
        + '<iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> Terminer</button>'
        + '<button class="btn btn-sm" style="color:#ef4444;" onclick="TachesPage._bulkDelete()">'
        + '<iconify-icon icon="solar:trash-bin-minimalistic-bold-duotone"></iconify-icon> Supprimer</button>'
        + '<button class="btn btn-sm" onclick="TachesPage._selectedTasks.clear();TachesPage._renderActiveView();">Tout désélectionner</button>'
        + '</div>';
    }

    html += '<div class="liste-info" style="display:flex;align-items:center;justify-content:space-between;margin:8px 0;">'
      + '<span style="color:var(--text-muted);font-size:12px;">' + filtered.length + ' tâche' + (filtered.length > 1 ? 's' : '') + '</span></div>';

    html += '<div class="liste-table-wrap"><table class="liste-table"><thead><tr>'
      + '<th style="width:36px;"><input type="checkbox" id="liste-select-all"' + (selectedCount === filtered.length && filtered.length > 0 ? ' checked' : '') + '></th>'
      + '<th>Titre</th><th style="width:100px;">Statut</th><th style="width:90px;">Priorité</th>'
      + '<th style="width:130px;">Assigné</th><th style="width:100px;">Type</th>'
      + '<th style="width:100px;">Échéance</th><th style="width:60px;"></th>'
      + '</tr></thead><tbody>';

    if (filtered.length === 0) {
      html += '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">Aucune tâche trouvée</td></tr>';
    } else {
      const today = this._today();
      filtered.forEach(t => {
        const sCfg = this._statutConfig[t.statut] || this._statutConfig.a_faire;
        const pCfg = this._prioriteConfig[t.priorite] || this._prioriteConfig.normale;
        const isLate = (t.statut === 'a_faire' || t.statut === 'en_cours') && t.dateEcheance && t.dateEcheance < today;
        const isSelected = this._selectedTasks.has(t.id);

        html += '<tr class="liste-row' + (isSelected ? ' selected' : '') + '" data-task-id="' + t.id + '">'
          + '<td><input type="checkbox" class="liste-cb" data-id="' + t.id + '"' + (isSelected ? ' checked' : '') + '></td>'
          + '<td><div class="liste-title-cell" onclick="TachesPage._viewTask(\'' + t.id + '\')">'
          + '<span class="liste-task-title">' + Utils.escHtml(t.titre) + '</span>';

        const subLen = (t.sousTaches || []).length;
        if (subLen > 0) {
          html += '<span class="liste-subtask-info">' + (t.sousTaches || []).filter(s => s.fait).length + '/' + subLen + '</span>';
        }

        html += '</div></td>'
          + '<td><span class="liste-badge" style="background:' + sCfg.bg + ';color:' + sCfg.color + ';">' + sCfg.label + '</span></td>'
          + '<td><span class="liste-badge" style="background:' + pCfg.bg + ';color:' + pCfg.color + ';">' + pCfg.label + '</span></td>'
          + '<td>' + (t.assigneANom
            ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;">' + this._avatarBubble(t.assigneANom) + ' ' + Utils.escHtml(t.assigneANom) + '</span>'
            : '<span style="color:var(--text-muted);font-size:12px;">&mdash;</span>') + '</td>'
          + '<td><span style="font-size:12px;color:var(--text-muted);">' + (this._typeLabels[t.type] || t.type || '&mdash;') + '</span></td>'
          + '<td style="' + (isLate ? 'color:#ef4444;font-weight:600;' : 'color:var(--text-muted);') + 'font-size:12px;">'
          + (t.dateEcheance ? Utils.formatDate(t.dateEcheance) : '&mdash;') + '</td>'
          + '<td><button class="btn-icon-sm" onclick="TachesPage._openTaskForm(null, \'' + t.id + '\')" title="Modifier">'
          + '<iconify-icon icon="solar:pen-line-duotone" style="font-size:1rem;"></iconify-icon></button></td></tr>';
      });
    }

    html += '</tbody></table></div>';
    return html;
  },

  _bindListeEvents() {
    const searchInput = document.getElementById('liste-search-input');
    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          this._listFilters.search = searchInput.value;
          this._renderActiveView();
        }, 300);
      });
    }

    ['liste-f-statut', 'liste-f-priorite', 'liste-f-assigne', 'liste-f-type'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          const key = id.replace('liste-f-', '').replace('assigne', 'assigneA');
          this._listFilters[key] = el.value;
          this._renderActiveView();
        });
      }
    });

    const selectAll = document.getElementById('liste-select-all');
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        const cbs = document.querySelectorAll('.liste-cb');
        cbs.forEach(cb => {
          cb.checked = selectAll.checked;
          if (selectAll.checked) this._selectedTasks.add(cb.dataset.id);
          else this._selectedTasks.delete(cb.dataset.id);
        });
        this._renderActiveView();
      });
    }

    document.querySelectorAll('.liste-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) this._selectedTasks.add(cb.dataset.id);
        else this._selectedTasks.delete(cb.dataset.id);
        this._renderActiveView();
      });
    });
  },

  _bulkChangeStatus(newStatut) {
    if (this._selectedTasks.size === 0) return;
    const label = this._statutConfig[newStatut] ? this._statutConfig[newStatut].label : newStatut;
    this._selectedTasks.forEach(id => {
      const update = { statut: newStatut, dateModification: new Date().toISOString() };
      if (newStatut === 'terminee') update.dateTerminaison = new Date().toISOString();
      Store.update('taches', id, update);
    });
    Toast.success(this._selectedTasks.size + ' tâche(s) passée(s) en "' + label + '"');
    this._selectedTasks.clear();
    this._renderActiveView();
  },

  _bulkDelete() {
    const count = this._selectedTasks.size;
    if (count === 0) return;
    Modal.confirm('Supprimer les tâches', 'Êtes-vous sûr de vouloir supprimer ' + count + ' tâche(s) ?', () => {
      this._selectedTasks.forEach(id => Store.delete('taches', id));
      Toast.success(count + ' tâche(s) supprimée(s)');
      this._selectedTasks.clear();
      this._renderActiveView();
    });
  },

  // =====================================================================
  //  TASK FORM (global)
  // =====================================================================

  _openTaskForm(defaultStatut, editTaskId) {
    const users = this._getUsers();
    const isEdit = !!editTaskId;
    const task = isEdit ? this._getTaches().find(t => t.id === editTaskId) : {};
    const t = task || {};

    let userOpts = '';
    users.forEach(u => {
      const name = [u.prenom, u.nom].filter(Boolean).join(' ') || u.login;
      userOpts += '<option value="' + u.id + '"' + (t.assigneA === u.id ? ' selected' : '') + '>' + Utils.escHtml(name) + '</option>';
    });

    let subTasksHtml = '';
    (t.sousTaches || []).forEach((st, i) => {
      subTasksHtml += '<div class="subtask-row" style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'
        + '<input type="checkbox" class="subtask-check"' + (st.fait ? ' checked' : '') + '>'
        + '<input type="text" class="form-control subtask-input" value="' + Utils.escHtml(st.titre || '') + '" style="flex:1;font-size:13px;" placeholder="Sous-tâche ' + (i + 1) + '">'
        + '<button type="button" class="btn-icon-sm" onclick="this.parentElement.remove();" title="Retirer">'
        + '<iconify-icon icon="solar:close-circle-line-duotone" style="color:#ef4444;"></iconify-icon></button></div>';
    });

    const tags = (t.etiquettes || []).join(', ');

    const body = '<div style="max-height:70vh;overflow-y:auto;padding:4px;">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div style="grid-column:1/-1;"><label class="form-label">Titre *</label>'
      + '<input type="text" id="tf-titre" class="form-control" value="' + Utils.escHtml(t.titre || '') + '" placeholder="Titre de la tâche"></div>'
      + '<div style="grid-column:1/-1;"><label class="form-label">Description</label>'
      + '<textarea id="tf-description" class="form-control" rows="3" style="font-size:13px;" placeholder="Description détaillée...">' + Utils.escHtml(t.description || '') + '</textarea></div>'
      + '<div><label class="form-label">Type</label>'
      + '<select id="tf-type" class="form-control">'
      + '<option value="autre"' + (t.type === 'autre' || !t.type ? ' selected' : '') + '>Autre</option>'
      + '<option value="maintenance"' + (t.type === 'maintenance' ? ' selected' : '') + '>Maintenance</option>'
      + '<option value="administratif"' + (t.type === 'administratif' ? ' selected' : '') + '>Administratif</option>'
      + '<option value="livraison"' + (t.type === 'livraison' ? ' selected' : '') + '>Livraison</option>'
      + '<option value="controle"' + (t.type === 'controle' ? ' selected' : '') + '>Contrôle</option>'
      + '</select></div>'
      + '<div><label class="form-label">Priorité</label>'
      + '<select id="tf-priorite" class="form-control">'
      + '<option value="basse"' + (t.priorite === 'basse' ? ' selected' : '') + '>Basse</option>'
      + '<option value="normale"' + (t.priorite === 'normale' || !t.priorite ? ' selected' : '') + '>Normale</option>'
      + '<option value="haute"' + (t.priorite === 'haute' ? ' selected' : '') + '>Haute</option>'
      + '<option value="urgente"' + (t.priorite === 'urgente' ? ' selected' : '') + '>Urgente</option>'
      + '</select></div>'
      + '<div><label class="form-label">Assigné à</label>'
      + '<select id="tf-assigne" class="form-control"><option value="">Non assigné</option>' + userOpts + '</select></div>'
      + '<div><label class="form-label">Date échéance</label>'
      + '<input type="date" id="tf-echeance" class="form-control" value="' + (t.dateEcheance || '') + '"></div>'
      + '<div><label class="form-label">Temps estimé (min)</label>'
      + '<input type="number" id="tf-temps" class="form-control" value="' + (t.tempsEstime || '') + '" placeholder="60" min="0"></div>'
      + '<div><label class="form-label">Récurrence</label>'
      + '<select id="tf-recurrence" class="form-control">'
      + '<option value="aucune"' + (t.recurrence === 'aucune' || !t.recurrence ? ' selected' : '') + '>Aucune</option>'
      + '<option value="quotidien"' + (t.recurrence === 'quotidien' ? ' selected' : '') + '>Quotidien</option>'
      + '<option value="hebdomadaire"' + (t.recurrence === 'hebdomadaire' ? ' selected' : '') + '>Hebdomadaire</option>'
      + '<option value="mensuel"' + (t.recurrence === 'mensuel' ? ' selected' : '') + '>Mensuel</option>'
      + '</select></div>'
      + '</div>'
      + '<div style="margin-top:14px;display:flex;gap:20px;align-items:center;">'
      + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">'
      + '<input type="checkbox" id="tf-urgent"' + (t.urgent ? ' checked' : '') + '>'
      + '<span style="color:#ef4444;font-weight:600;">Urgent</span></label>'
      + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">'
      + '<input type="checkbox" id="tf-important"' + (t.important ? ' checked' : '') + '>'
      + '<span style="color:#3b82f6;font-weight:600;">Important</span></label></div>'
      + '<div style="margin-top:14px;"><label class="form-label">Étiquettes <span style="font-weight:normal;color:var(--text-muted);">(séparées par des virgules)</span></label>'
      + '<input type="text" id="tf-etiquettes" class="form-control" value="' + Utils.escHtml(tags) + '" placeholder="urgent, client, flotte..." style="font-size:13px;"></div>'
      + '<div style="margin-top:14px;"><label class="form-label">Sous-tâches</label>'
      + '<div id="tf-subtasks-list">' + subTasksHtml + '</div>'
      + '<button type="button" class="btn btn-sm" onclick="TachesPage._addSubtaskRow()" style="font-size:12px;margin-top:4px;">'
      + '<iconify-icon icon="solar:add-circle-line-duotone"></iconify-icon> Ajouter une sous-tâche</button></div></div>';

    let footer = '';
    if (isEdit) {
      footer += '<button class="btn" style="color:#ef4444;" onclick="TachesPage._deleteTask(\'' + t.id + '\')">'
        + '<iconify-icon icon="solar:trash-bin-minimalistic-bold-duotone"></iconify-icon> Supprimer</button>';
    }
    footer += '<button class="btn" onclick="Modal.close()">Annuler</button>'
      + '<button class="btn btn-primary" onclick="TachesPage._saveTask(\'' + (editTaskId || '') + '\', \'' + (defaultStatut || '') + '\')">'
      + (isEdit ? 'Mettre à jour' : 'Créer la tâche') + '</button>';

    Modal.open({ title: isEdit ? 'Modifier la tâche' : 'Nouvelle tâche', body: body, footer: footer, size: 'lg' });
  },

  _addSubtaskRow() {
    const list = document.getElementById('tf-subtasks-list');
    if (!list) return;
    const idx = list.querySelectorAll('.subtask-row').length;
    const div = document.createElement('div');
    div.className = 'subtask-row';
    div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'subtask-check';
    div.appendChild(cb);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control subtask-input';
    input.style.cssText = 'flex:1;font-size:13px;';
    input.placeholder = 'Sous-tâche ' + (idx + 1);
    div.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon-sm';
    btn.title = 'Retirer';
    btn.addEventListener('click', () => div.remove());
    btn.innerHTML = '<iconify-icon icon="solar:close-circle-line-duotone" style="color:#ef4444;"></iconify-icon>';
    div.appendChild(btn);
    list.appendChild(div);
  },

  _saveTask(editId, defaultStatut) {
    const titre = document.getElementById('tf-titre')?.value?.trim();
    if (!titre) { Toast.error('Le titre est requis'); return; }

    const session = Auth.getSession();
    const assigneA = document.getElementById('tf-assigne')?.value || '';
    const assignedUser = this._getUsers().find(u => u.id === assigneA);
    const assigneANom = assignedUser ? ([assignedUser.prenom, assignedUser.nom].filter(Boolean).join(' ') || assignedUser.login) : '';

    const etiquettesRaw = document.getElementById('tf-etiquettes')?.value || '';
    const etiquettes = etiquettesRaw.split(',').map(s => s.trim()).filter(Boolean);

    const sousTaches = [];
    document.querySelectorAll('.subtask-row').forEach(row => {
      const inp = row.querySelector('.subtask-input');
      const cb = row.querySelector('.subtask-check');
      const val = inp?.value?.trim();
      if (val) {
        sousTaches.push({
          id: Utils.generateId('ST'),
          titre: val,
          fait: cb?.checked || false,
          dateCreation: new Date().toISOString()
        });
      }
    });

    const tempsEstime = parseInt(document.getElementById('tf-temps')?.value) || 0;
    const recurrence = document.getElementById('tf-recurrence')?.value || 'aucune';

    const data = {
      titre: titre,
      description: document.getElementById('tf-description')?.value || '',
      type: document.getElementById('tf-type')?.value || 'autre',
      priorite: document.getElementById('tf-priorite')?.value || 'normale',
      assigneA: assigneA,
      assigneANom: assigneANom,
      dateEcheance: document.getElementById('tf-echeance')?.value || '',
      urgent: document.getElementById('tf-urgent')?.checked || false,
      important: document.getElementById('tf-important')?.checked || false,
      etiquettes: etiquettes,
      sousTaches: sousTaches,
      tempsEstime: tempsEstime || undefined,
      recurrence: recurrence,
      recurrenceActif: recurrence !== 'aucune',
      dateModification: new Date().toISOString()
    };

    if (editId) {
      Store.update('taches', editId, data);
      Toast.success('Tâche mise à jour');
    } else {
      data.id = Utils.generateId('TCH');
      data.statut = defaultStatut || 'a_faire';
      data.creePar = session?.userId || '';
      data.creeParNom = this._currentUserName();
      data.dateCreation = new Date().toISOString();
      data.ordre = 0;
      Store.add('taches', data);
      Toast.success('Tâche créée');
    }

    Modal.close();
    this._renderActiveView();
  },

  _deleteTask(taskId) {
    Modal.confirm('Supprimer la tâche', 'Êtes-vous sûr de vouloir supprimer cette tâche ?', () => {
      Store.delete('taches', taskId);
      Toast.success('Tâche supprimée');
      Modal.close();
      this._renderActiveView();
    });
  },

  // =====================================================================
  //  VIEW TASK (detail)
  // =====================================================================

  _viewTask(taskId) {
    const t = this._getTaches().find(x => x.id === taskId);
    if (!t) return;

    const pCfg = this._prioriteConfig[t.priorite] || this._prioriteConfig.normale;
    const sCfg = this._statutConfig[t.statut] || this._statutConfig.a_faire;
    const today = this._today();
    const isLate = (t.statut === 'a_faire' || t.statut === 'en_cours') && t.dateEcheance && t.dateEcheance < today;

    const subTotal = (t.sousTaches || []).length;
    const subDone = (t.sousTaches || []).filter(s => s.fait).length;

    let body = '<div style="max-height:70vh;overflow-y:auto;">'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">'
      + '<span style="background:' + sCfg.bg + ';color:' + sCfg.color + ';padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">'
      + '<iconify-icon icon="' + sCfg.icon + '" style="font-size:13px;"></iconify-icon> ' + sCfg.label + '</span>'
      + '<span style="background:' + pCfg.bg + ';color:' + pCfg.color + ';padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">'
      + '<iconify-icon icon="' + pCfg.icon + '" style="font-size:13px;"></iconify-icon> ' + pCfg.label + '</span>';

    if (t.urgent) body += '<span style="background:rgba(239,68,68,.1);color:#ef4444;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;">URGENT</span>';
    if (t.important) body += '<span style="background:rgba(59,130,246,.1);color:#3b82f6;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;">IMPORTANT</span>';
    if (isLate) body += '<span style="background:rgba(239,68,68,.1);color:#ef4444;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">EN RETARD</span>';
    body += '</div>';

    if (t.description) {
      body += '<div style="margin-bottom:16px;padding:10px;border-radius:8px;background:var(--bg-tertiary);font-size:13px;color:var(--text-primary);white-space:pre-wrap;">' + Utils.escHtml(t.description) + '</div>';
    }

    body += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:13px;">'
      + '<div><span style="color:var(--text-muted);">Assigné à :</span> ' + (t.assigneANom ? Utils.escHtml(t.assigneANom) : '<span style="color:var(--text-muted);">Non assigné</span>') + '</div>'
      + '<div><span style="color:var(--text-muted);">Type :</span> ' + (this._typeLabels[t.type] || t.type || '&mdash;') + '</div>'
      + '<div><span style="color:var(--text-muted);">Échéance :</span> ' + (t.dateEcheance ? '<span style="' + (isLate ? 'color:#ef4444;font-weight:600;' : '') + '">' + Utils.formatDate(t.dateEcheance) + '</span>' : '&mdash;') + '</div>'
      + '<div><span style="color:var(--text-muted);">Créé par :</span> ' + (t.creeParNom ? Utils.escHtml(t.creeParNom) : '&mdash;') + '</div>';

    if (t.tempsEstime) body += '<div><span style="color:var(--text-muted);">Temps estimé :</span> ' + t.tempsEstime + ' min</div>';
    if (t.recurrence && t.recurrence !== 'aucune') body += '<div><span style="color:var(--text-muted);">Récurrence :</span> ' + Utils.escHtml(t.recurrence) + '</div>';
    body += '<div><span style="color:var(--text-muted);">Créé le :</span> ' + (t.dateCreation ? Utils.formatDate(t.dateCreation) : '&mdash;') + '</div>';
    if (t.dateTerminaison) body += '<div><span style="color:var(--text-muted);">Terminé le :</span> ' + Utils.formatDate(t.dateTerminaison) + '</div>';
    body += '</div>';

    if ((t.etiquettes || []).length > 0) {
      body += '<div style="margin-bottom:16px;"><div style="font-weight:600;font-size:12px;color:var(--text-muted);margin-bottom:6px;">Étiquettes</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
      t.etiquettes.forEach(tag => {
        body += '<span style="background:rgba(99,102,241,.12);color:#6366f1;padding:2px 10px;border-radius:12px;font-size:11px;">' + Utils.escHtml(tag) + '</span>';
      });
      body += '</div></div>';
    }

    if (subTotal > 0) {
      body += '<div style="margin-bottom:16px;"><div style="font-weight:600;font-size:12px;color:var(--text-muted);margin-bottom:6px;">Sous-tâches (' + subDone + '/' + subTotal + ')</div>'
        + '<div style="width:100%;height:6px;border-radius:3px;background:var(--bg-tertiary);margin-bottom:8px;">'
        + '<div style="height:100%;border-radius:3px;background:#22c55e;width:' + Math.round((subDone / subTotal) * 100) + '%;transition:width .3s;"></div></div>';
      t.sousTaches.forEach(st => {
        body += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;">'
          + '<input type="checkbox"' + (st.fait ? ' checked' : '') + ' onchange="TachesPage._toggleSubtask(\'' + t.id + '\',\'' + st.id + '\',this.checked)">'
          + '<span style="' + (st.fait ? 'text-decoration:line-through;color:var(--text-muted);' : 'color:var(--text-primary);') + '">' + Utils.escHtml(st.titre) + '</span></div>';
      });
      body += '</div>';
    }

    body += '</div>';

    let statusBtns = '';
    ['a_faire', 'en_cours', 'terminee', 'annulee'].forEach(s => {
      if (s === t.statut) return;
      const sc = this._statutConfig[s];
      statusBtns += '<button class="btn btn-sm" style="color:' + sc.color + ';" onclick="TachesPage._changeStatus(\'' + t.id + '\',\'' + s + '\')">'
        + '<iconify-icon icon="' + sc.icon + '"></iconify-icon> ' + sc.label + '</button>';
    });

    const footer = '<div style="display:flex;gap:6px;flex-wrap:wrap;flex:1;">' + statusBtns + '</div>'
      + '<button class="btn" onclick="TachesPage._openTaskForm(null, \'' + t.id + '\')">'
      + '<iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>'
      + '<button class="btn" onclick="Modal.close()">Fermer</button>';

    Modal.open({ title: t.titre, body: body, footer: footer, size: 'lg' });
  },

  _changeStatus(taskId, newStatut) {
    const update = { statut: newStatut, dateModification: new Date().toISOString() };
    if (newStatut === 'terminee') update.dateTerminaison = new Date().toISOString();
    Store.update('taches', taskId, update);
    Toast.success('Statut mis à jour : ' + (this._statutConfig[newStatut] ? this._statutConfig[newStatut].label : newStatut));
    Modal.close();
    this._renderActiveView();
  },

  _toggleSubtask(taskId, subId, checked) {
    const t = this._getTaches().find(x => x.id === taskId);
    if (!t) return;
    const subs = (t.sousTaches || []).map(st =>
      st.id === subId ? { ...st, fait: checked } : st
    );
    Store.update('taches', taskId, { sousTaches: subs, dateModification: new Date().toISOString() });
  },

  // =====================================================================
  //  STYLES
  // =====================================================================

  _getStyleContent() {
    return `
      /* Module container */
      .taches-module { position:relative; min-height:80vh; }

      /* Top bar */
      .taches-topbar {
        display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;
        margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border-color);
      }
      .taches-topbar-left { display:flex; align-items:center; gap:10px; }

      /* Tabs */
      .taches-tabs {
        display:flex; gap:3px; background:rgba(255,255,255,0.03); border-radius:12px; padding:4px;
        border:1px solid rgba(255,255,255,0.06); backdrop-filter:blur(8px);
      }
      .taches-tab {
        display:flex; align-items:center; gap:6px; padding:8px 16px; border:none; border-radius:9px;
        background:transparent; color:var(--text-muted); cursor:pointer; font-size:13px; font-weight:500;
        transition:all .2s cubic-bezier(.4,0,.2,1); white-space:nowrap; position:relative;
      }
      .taches-tab:hover { color:var(--text-primary); background:rgba(255,255,255,0.05); }
      .taches-tab.active {
        background:linear-gradient(135deg, rgba(99,102,241,.2), rgba(139,92,246,.15));
        color:#818cf8; font-weight:600;
        box-shadow:0 2px 8px rgba(99,102,241,.2), inset 0 1px 0 rgba(255,255,255,0.05);
      }
      .taches-tab iconify-icon { font-size:1.1rem; }

      /* FAB */
      .taches-fab {
        position:fixed; bottom:28px; right:28px; width:56px; height:56px; border-radius:16px;
        background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; border:none;
        cursor:pointer; display:flex; align-items:center; justify-content:center;
        box-shadow:0 4px 15px rgba(99,102,241,.4), 0 0 30px rgba(99,102,241,.15); transition:all .25s cubic-bezier(.4,0,.2,1); z-index:100;
      }
      .taches-fab:hover { transform:scale(1.08) rotate(90deg); box-shadow:0 8px 25px rgba(99,102,241,.5); }
      .taches-fab:active { transform:scale(0.95); }

      /* View content */
      .taches-view-content { animation: tachesFadeIn .2s ease; }
      @keyframes tachesFadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }

      /* ── Dashboard ── */
      .dash-section { margin-bottom:20px; }
      .dash-kpi-row {
        display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px; margin-bottom:20px;
      }
      .dash-kpi-card {
        background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06);
        border-radius:16px; padding:20px 16px; text-align:center;
        transition:all .2s cubic-bezier(.4,0,.2,1); cursor:pointer; position:relative; overflow:hidden;
      }
      .dash-kpi-card::before {
        content:''; position:absolute; top:0; left:0; right:0; height:3px;
        background:var(--kpi-accent, #6366f1); opacity:0; transition:opacity .2s;
      }
      .dash-kpi-card:hover { transform:translateY(-4px); box-shadow:0 8px 25px rgba(0,0,0,.2); background:rgba(255,255,255,0.05); }
      .dash-kpi-card:hover::before { opacity:1; }
      .dash-kpi-card:active { transform:translateY(-1px); }
      .dash-kpi-icon {
        width:48px; height:48px; border-radius:14px; display:inline-flex; align-items:center;
        justify-content:center; margin-bottom:10px; transition:transform .2s;
      }
      .dash-kpi-card:hover .dash-kpi-icon { transform:scale(1.1); }
      .dash-kpi-value { font-size:1.8rem; font-weight:800; color:var(--text-primary); line-height:1.2; letter-spacing:-0.5px; }
      .dash-kpi-label { font-size:11px; color:var(--text-muted); margin-top:6px; font-weight:500; }

      .dash-grid-2col { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
      @media(max-width:768px) { .dash-grid-2col { grid-template-columns:1fr; } }

      .dash-card {
        background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06);
        border-radius:16px; overflow:hidden; backdrop-filter:blur(8px);
        transition:box-shadow .2s;
      }
      .dash-card:hover { box-shadow:0 4px 20px rgba(0,0,0,.12); }
      .dash-card-header {
        display:flex; align-items:center; gap:8px; padding:16px 18px;
        font-size:13px; font-weight:600; color:var(--text-primary);
        border-bottom:1px solid rgba(255,255,255,0.04);
        background:rgba(255,255,255,0.01);
      }
      .dash-card-body { padding:14px 18px; }

      /* Bars */
      .dash-bar-row { display:flex; align-items:center; gap:10px; padding:6px 0; }
      .dash-bar-label { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-primary); min-width:120px; }
      .dash-bar-track { flex:1; height:8px; border-radius:4px; background:var(--bg-tertiary); overflow:hidden; }
      .dash-bar-fill { height:100%; border-radius:4px; background:linear-gradient(90deg, #6366f1, #8b5cf6); transition:width .3s ease; }
      .dash-bar-count { font-size:12px; font-weight:600; color:var(--text-primary); min-width:24px; text-align:right; }

      /* Timeline */
      .dash-timeline-item {
        display:flex; align-items:flex-start; gap:10px; padding:8px 0; cursor:pointer;
        border-bottom:1px solid rgba(255,255,255,0.03); transition:background .15s;
      }
      .dash-timeline-item:hover { background:rgba(255,255,255,0.02); }
      .dash-timeline-item:last-child { border-bottom:none; }
      .dash-timeline-dot { width:10px; height:10px; border-radius:50%; margin-top:4px; flex-shrink:0; }
      .dash-timeline-content { flex:1; }
      .dash-timeline-title { font-size:13px; color:var(--text-primary); font-weight:500; }
      .dash-timeline-meta { font-size:11px; color:var(--text-muted); margin-top:2px; }

      /* Activity */
      .dash-activity-item {
        display:flex; align-items:center; gap:10px; padding:8px 0; cursor:pointer;
        border-bottom:1px solid rgba(255,255,255,0.03); transition:background .15s;
      }
      .dash-activity-item:hover { background:rgba(255,255,255,0.02); }
      .dash-activity-item:last-child { border-bottom:none; }
      .dash-activity-badge {
        width:32px; height:32px; border-radius:8px; display:flex; align-items:center;
        justify-content:center; flex-shrink:0; font-size:1rem;
      }
      .dash-activity-info { flex:1; }
      .dash-activity-title { font-size:13px; color:var(--text-primary); font-weight:500; }
      .dash-activity-meta { font-size:11px; color:var(--text-muted); }

      /* ── Kanban ── */
      .kanban-board {
        display:grid; grid-template-columns:repeat(4, 1fr); gap:14px; min-height:500px;
      }
      @media(max-width:900px) { .kanban-board { grid-template-columns:repeat(2, 1fr); } }
      @media(max-width:600px) { .kanban-board { grid-template-columns:1fr; } }

      .kanban-column {
        background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05);
        border-radius:16px; display:flex; flex-direction:column; min-height:300px;
        backdrop-filter:blur(4px);
      }
      .kanban-col-header {
        padding:14px 16px; border-radius:16px 16px 0 0;
        background:rgba(255,255,255,0.03);
      }
      .kanban-col-title {
        display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:var(--text-primary);
      }
      .kanban-col-count {
        padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700; margin-left:auto;
      }
      .kanban-col-body {
        flex:1; padding:8px; overflow-y:auto; min-height:60px;
        transition:background .15s ease;
      }
      .kanban-col-body.drag-over { background:rgba(99,102,241,.08); border-radius:0 0 12px 12px; }
      .kanban-empty { text-align:center; color:var(--text-muted); font-size:12px; padding:20px 10px; }
      .kanban-add-btn {
        display:flex; align-items:center; justify-content:center; gap:4px; padding:8px;
        border:none; background:transparent; color:var(--text-muted); cursor:pointer;
        font-size:12px; transition:all .15s; border-top:1px solid rgba(255,255,255,0.04);
      }
      .kanban-add-btn:hover { color:#6366f1; background:rgba(99,102,241,.06); }

      /* Kanban cards */
      .kanban-card {
        background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06);
        border-radius:12px; padding:12px 14px; margin-bottom:8px; cursor:pointer;
        transition:all .15s cubic-bezier(.4,0,.2,1); position:relative;
      }
      .kanban-card:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,.2); background:rgba(255,255,255,0.06); }
      .kanban-card:active { transform:scale(0.98); }
      .kanban-card-top { display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap; }
      .kanban-prio-badge {
        display:inline-flex; align-items:center; gap:3px; padding:2px 8px; border-radius:6px;
        font-size:10px; font-weight:600;
      }
      .kanban-late-badge {
        display:inline-flex; align-items:center; gap:3px; padding:2px 8px; border-radius:6px;
        font-size:10px; font-weight:700; background:rgba(239,68,68,.12); color:#ef4444;
      }
      .kanban-card-title { font-size:13px; font-weight:500; color:var(--text-primary); line-height:1.3; margin-bottom:6px; }
      .kanban-subtask-bar { display:flex; align-items:center; gap:6px; margin-bottom:6px; }
      .kanban-subtask-track { flex:1; height:4px; border-radius:2px; background:var(--bg-tertiary); overflow:hidden; }
      .kanban-subtask-fill { height:100%; border-radius:2px; background:#22c55e; }
      .kanban-subtask-label { font-size:10px; color:var(--text-muted); }
      .kanban-tags { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:6px; }
      .kanban-tag {
        background:rgba(99,102,241,.1); color:#818cf8; padding:1px 7px; border-radius:8px;
        font-size:10px; font-weight:500;
      }
      .kanban-card-footer { display:flex; align-items:center; justify-content:space-between; }
      .kanban-card-assignee { display:flex; align-items:center; }
      .kanban-card-date { display:flex; align-items:center; gap:3px; font-size:11px; }

      /* ── Eisenhower ── */
      .eisen-matrix { position:relative; }
      .eisen-axis-y {
        position:absolute; left:-30px; top:50%; transform:rotate(-90deg) translateX(-50%);
        transform-origin:left center;
      }
      .eisen-axis-x {
        position:absolute; bottom:-24px; left:50%; transform:translateX(-50%);
      }
      .eisen-axis-label { font-size:11px; font-weight:700; color:var(--text-muted); letter-spacing:1px; text-transform:uppercase; }
      .eisen-grid {
        display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:12px;
        min-height:500px; margin-left:12px; margin-bottom:12px;
      }
      @media(max-width:600px) { .eisen-grid { grid-template-columns:1fr; } .eisen-axis-y { display:none; } }
      .eisen-quadrant {
        border-radius:12px; padding:14px; display:flex; flex-direction:column;
        min-height:200px; transition:background .15s;
      }
      .eisen-quadrant.drag-over { outline:2px dashed rgba(99,102,241,.4); }
      .eisen-q-header {
        display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600;
        margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.04);
      }
      .eisen-q-count {
        padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700; margin-left:auto;
      }
      .eisen-q-body { flex:1; overflow-y:auto; }
      .eisen-empty {
        text-align:center; padding:20px 10px; color:var(--text-muted); font-size:12px;
        font-style:italic;
      }
      .eisen-card {
        background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06);
        border-radius:8px; padding:8px 10px; margin-bottom:6px; cursor:pointer;
        transition:transform .12s, box-shadow .12s;
      }
      .eisen-card:hover { transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,.12); }
      .eisen-card-title { font-size:12px; font-weight:500; color:var(--text-primary); margin-bottom:4px; }
      .eisen-card-meta { display:flex; align-items:center; gap:6px; }

      /* ── Reunions ── */
      .reunion-list { display:flex; flex-direction:column; gap:10px; }
      .reunion-card {
        display:flex; align-items:center; gap:14px; padding:16px 18px; border-radius:16px;
        background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06);
        cursor:pointer; transition:all .2s cubic-bezier(.4,0,.2,1); backdrop-filter:blur(4px);
      }
      .reunion-card:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.18); background:rgba(255,255,255,0.05); }
      .reunion-card-left { flex-shrink:0; }
      .reunion-date-block {
        width:50px; height:50px; border-radius:10px; background:rgba(139,92,246,.12);
        display:flex; flex-direction:column; align-items:center; justify-content:center;
      }
      .reunion-date-day { font-size:1.2rem; font-weight:700; color:#8b5cf6; line-height:1; }
      .reunion-date-month { font-size:10px; color:#8b5cf6; text-transform:uppercase; font-weight:600; }
      .reunion-card-body { flex:1; min-width:0; }
      .reunion-card-title { font-size:14px; font-weight:600; color:var(--text-primary); margin-bottom:4px; }
      .reunion-card-meta { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:6px; }
      .reunion-type-badge { padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600; }
      .reunion-card-stats {
        display:flex; gap:14px; font-size:12px; color:var(--text-muted);
      }
      .reunion-card-stats span { display:flex; align-items:center; gap:4px; }
      .reunion-card-right { flex-shrink:0; }
      .reunion-statut-badge {
        padding:4px 10px; border-radius:8px; font-size:11px; font-weight:600;
      }
      .reunion-statut-brouillon { background:rgba(249,115,22,.1); color:#f97316; }
      .reunion-statut-valide { background:rgba(34,197,94,.1); color:#22c55e; }
      .reunion-statut-archive { background:rgba(107,114,128,.1); color:#6b7280; }

      /* ── Liste ── */
      .liste-toolbar {
        display:flex; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap;
      }
      .liste-search {
        display:flex; align-items:center; gap:6px; background:var(--bg-secondary);
        border:1px solid var(--border-color); border-radius:8px; padding:6px 12px; min-width:200px; flex:1; max-width:320px;
      }
      .liste-filters { display:flex; gap:6px; flex-wrap:wrap; }

      .liste-bulk-bar {
        display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px;
        background:rgba(99,102,241,.08); border:1px solid rgba(99,102,241,.15); margin-bottom:12px;
        flex-wrap:wrap; font-size:13px; color:var(--text-primary);
      }

      .liste-table-wrap { overflow-x:auto; }
      .liste-table {
        width:100%; border-collapse:collapse; font-size:13px;
      }
      .liste-table th {
        text-align:left; padding:10px 12px; font-size:11px; font-weight:600;
        color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px;
        border-bottom:1px solid var(--border-color); background:var(--bg-secondary);
      }
      .liste-table td {
        padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.03);
        vertical-align:middle;
      }
      .liste-row { transition:background .1s; }
      .liste-row:hover { background:rgba(255,255,255,0.02); }
      .liste-row.selected { background:rgba(99,102,241,.06); }
      .liste-title-cell { cursor:pointer; }
      .liste-task-title { font-weight:500; color:var(--text-primary); }
      .liste-task-title:hover { color:#6366f1; }
      .liste-subtask-info {
        font-size:10px; color:var(--text-muted); background:var(--bg-tertiary);
        padding:1px 6px; border-radius:6px; margin-left:6px;
      }
      .liste-badge {
        display:inline-block; padding:2px 10px; border-radius:6px; font-size:11px; font-weight:600;
        white-space:nowrap;
      }

      /* Utility */
      .btn-icon-sm {
        background:none; border:none; cursor:pointer; padding:4px; border-radius:6px;
        transition:background .15s; display:inline-flex; align-items:center; justify-content:center;
      }
      .btn-icon-sm:hover { background:rgba(255,255,255,0.06); }

      .form-control-sm { padding:5px 10px !important; }
    `;
  }
};

// Expose globally
window.TachesPage = TachesPage;
