/**
 * PlanningPage - Planning & Disponibilités des Chauffeurs
 *
 * Fonctionnalités :
 * 1. Vue calendrier hebdomadaire avec les créneaux de chaque chauffeur
 * 2. Vue mensuelle résumée
 * 3. Gestion des indisponibilités (congé, repos, maladie, formation)
 * 4. Statistiques de couverture
 * 5. Attribution rapide de créneaux
 */
const PlanningPage = {
  _charts: [],
  _currentView: 'week',
  _currentWeekStart: null,
  _currentMonth: null,
  _filterChauffeurId: '',
  _filterSearch: '',

  render() {
    const now = new Date();
    // Set current week start to Monday
    const dayOfWeek = now.getDay();
    this._currentWeekStart = new Date(now);
    this._currentWeekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    this._currentWeekStart.setHours(0, 0, 0, 0);
    this._currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._renderView();
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
  },

  _template() {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Planning Chauffeurs</h1>
        <div class="page-actions">
          <button class="btn btn-secondary" onclick="PlanningPage._showTemplates()"><iconify-icon icon="solar:copy-bold-duotone"></iconify-icon> Modèles</button>
          <button class="btn btn-secondary" onclick="PlanningPage._exportPDF()"><iconify-icon icon="solar:document-bold-duotone"></iconify-icon> PDF</button>
          <button class="btn btn-warning" onclick="PlanningPage._showDepRecurrentes()"><iconify-icon icon="solar:wallet-2-bold-duotone"></iconify-icon> Dépenses</button>
          <button class="btn btn-primary" id="btn-add-absence"><iconify-icon icon="solar:calendar-minimalistic-bold-duotone"></iconify-icon> Déclarer une absence</button>
          <button class="btn btn-success" id="btn-add-shift"><iconify-icon icon="solar:calendar-add-bold-duotone"></iconify-icon> Ajouter un créneau</button>
        </div>
      </div>

      <!-- Navigation & Filtres -->
      <div class="card" style="margin-bottom:var(--space-lg);padding:var(--space-md);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-sm);">
          <div style="display:flex;align-items:center;gap:var(--space-sm);">
            <button class="btn btn-sm btn-secondary" id="btn-prev"><iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon></button>
            <h3 id="planning-period-label" style="margin:0;min-width:220px;text-align:center;font-size:var(--font-size-base);"></h3>
            <button class="btn btn-sm btn-secondary" id="btn-next"><iconify-icon icon="solar:alt-arrow-right-bold"></iconify-icon></button>
            <button class="btn btn-sm btn-secondary" id="btn-today" style="margin-left:var(--space-sm);">Aujourd'hui</button>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:6px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:4px 10px;">
              <iconify-icon icon="solar:magnifer-bold-duotone" style="color:var(--pilote-blue);font-size:16px;"></iconify-icon>
              <input type="text" id="filter-planning-search" class="form-control" placeholder="Rechercher un chauffeur..." value="${this._filterSearch}" style="width:200px;font-size:var(--font-size-sm);padding:6px 8px;border:none;background:transparent;font-weight:500;">
            </div>
            <div class="tabs" id="planning-view-tabs" style="margin:0;">
              <div class="tab active" data-view="week"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Semaine</div>
              <div class="tab" data-view="month"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Mois</div>
              <div class="tab" data-view="stats"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Statistiques</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Contenu dynamique -->
      <div id="planning-content"></div>
    `;
  },

  _bindEvents() {
    document.getElementById('btn-prev').addEventListener('click', () => this._navigate(-1));
    document.getElementById('btn-next').addEventListener('click', () => this._navigate(1));
    document.getElementById('btn-today').addEventListener('click', () => {
      const now = new Date();
      const dow = now.getDay();
      this._currentWeekStart = new Date(now);
      this._currentWeekStart.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
      this._currentWeekStart.setHours(0, 0, 0, 0);
      this._currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      this._renderView();
    });

    document.querySelectorAll('#planning-view-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#planning-view-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._currentView = tab.dataset.view;
        this._renderView();
      });
    });

    document.getElementById('filter-planning-search').addEventListener('input', (e) => {
      this._filterSearch = e.target.value;
      this._renderView();
    });

    document.getElementById('btn-add-absence').addEventListener('click', () => this._addAbsence());
    document.getElementById('btn-add-shift').addEventListener('click', () => this._addShift());
  },

  _navigate(dir) {
    if (this._currentView === 'month') {
      this._currentMonth.setMonth(this._currentMonth.getMonth() + dir);
    } else {
      this._currentWeekStart.setDate(this._currentWeekStart.getDate() + 7 * dir);
    }
    this._renderView();
  },

  _renderView() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];

    const label = document.getElementById('planning-period-label');
    const ct = document.getElementById('planning-content');

    switch (this._currentView) {
      case 'week':
        label.textContent = this._getWeekLabel();
        ct.innerHTML = this._renderWeekView();
        this._bindWeekEvents();
        break;
      case 'month':
        label.textContent = `${Utils.getMonthName(this._currentMonth.getMonth())} ${this._currentMonth.getFullYear()}`;
        ct.innerHTML = this._renderMonthView();
        break;
      case 'stats':
        label.textContent = `${Utils.getMonthName(this._currentMonth.getMonth())} ${this._currentMonth.getFullYear()}`;
        ct.innerHTML = this._renderStatsView();
        this._loadStatsCharts();
        break;
    }
  },

  _getWeekLabel() {
    const start = new Date(this._currentWeekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const weekNum = Utils.getWeekNumber(start);
    return `Semaine ${weekNum} — ${start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  },

  // =================== HELPERS ===================

  _getChauffeurs() { return Store.get('chauffeurs') || []; },
  _getPlanning() { return Store.get('planning') || []; },
  _getAbsences() { return Store.get('absences') || []; },

  _getDayName(idx) {
    return ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][idx];
  },
  _getDayNameFull(idx) {
    return ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][idx];
  },

  _dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  _isToday(dateStr) {
    return dateStr === this._dateStr(new Date());
  },

  _getShiftsForDate(dateStr) {
    return this._getPlanning().filter(s => s.date === dateStr);
  },

  _getAbsencesForDate(dateStr) {
    return this._getAbsences().filter(a => {
      return dateStr >= a.dateDebut && dateStr <= a.dateFin;
    });
  },

  _getDriverAbsencesForDate(chauffeurId, dateStr) {
    return this._getAbsences().filter(a => a.chauffeurId === chauffeurId && dateStr >= a.dateDebut && dateStr <= a.dateFin);
  },

  _getDriverShiftsForDate(chauffeurId, dateStr) {
    return this._getPlanning().filter(s => s.chauffeurId === chauffeurId && s.date === dateStr);
  },

  _absenceTypeLabel(type) {
    const labels = { repos: 'Repos', conge: 'Congé', maladie: 'Maladie', formation: 'Formation', personnel: 'Personnel', suspension: 'Suspension' };
    return labels[type] || type;
  },

  _absenceTypeColor(type) {
    const colors = { repos: '#64748b', conge: '#3b82f6', maladie: '#ef4444', formation: '#f59e0b', personnel: '#8b5cf6', suspension: '#dc2626' };
    return colors[type] || '#64748b';
  },

  _shiftTypeLabel(type) {
    const labels = { matin: 'Matin (6h-14h)', apres_midi: 'Après-midi (14h-22h)', journee: 'Journée (8h-20h)', nuit: 'Nuit (22h-6h)' };
    return labels[type] || type;
  },

  _shiftTypeShort(type) {
    return { matin: 'M', apres_midi: 'AM', journee: 'J', nuit: 'N', custom: 'P' }[type] || '?';
  },

  _shiftTypeColor(type) {
    return { matin: '#22c55e', apres_midi: '#3b82f6', journee: '#f59e0b', nuit: '#8b5cf6', custom: '#6366f1' }[type] || '#64748b';
  },

  // Helpers pour créneaux personnalisés (acceptent l'objet shift complet)
  _getShiftTimeLabel(shift) {
    if (shift.heureDebut && shift.heureFin) {
      return `${shift.heureDebut} - ${shift.heureFin}`;
    }
    return this._shiftTypeLabel(shift.typeCreneaux);
  },

  _getShiftTimeShort(shift) {
    if (shift.heureDebut && shift.heureFin) {
      const hd = parseInt(shift.heureDebut);
      const hf = parseInt(shift.heureFin);
      return `${hd}h-${hf}h`;
    }
    return this._shiftTypeShort(shift.typeCreneaux);
  },

  _getShiftColor(shift) {
    if (shift.heureDebut && shift.heureFin && (!shift.typeCreneaux || shift.typeCreneaux === 'custom')) {
      return '#6366f1';
    }
    return this._shiftTypeColor(shift.typeCreneaux);
  },

  // Mapping presets pour auto-remplir les heures
  _shiftPresets: {
    matin: ['06:00', '14:00'],
    apres_midi: ['14:00', '22:00'],
    journee: ['08:00', '20:00'],
    nuit: ['22:00', '06:00']
  },

  // =================== VUE SEMAINE ===================

  _renderWeekView() {
    let chauffeurs = this._getChauffeurs().filter(c => c.statut !== 'inactif');
    if (this._filterSearch) {
      const q = this._filterSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      chauffeurs = chauffeurs.filter(c => {
        const fullName = (c.prenom + ' ' + c.nom).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return fullName.includes(q);
      });
    }
    // Map vehiculeId → immatriculation for display
    const vehMap = {};
    (Store.get('vehicules') || []).forEach(v => { vehMap[v.id] = v.immatriculation || `${v.marque} ${v.modele}`; });
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this._currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push({ date: this._dateStr(d), dayIdx: i, obj: d });
    }

    // KPIs for the week
    const allShifts = this._getPlanning();
    const weekShifts = allShifts.filter(s => s.date >= days[0].date && s.date <= days[6].date);
    const totalSlots = chauffeurs.length * 7;
    const filledSlots = weekShifts.length;
    const absencesWeek = this._getAbsences().filter(a => a.dateFin >= days[0].date && a.dateDebut <= days[6].date);
    const uniqueAbsDrivers = [...new Set(absencesWeek.map(a => a.chauffeurId))].length;

    return `
      <!-- KPIs semaine -->
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card">
          <div class="kpi-icon"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${chauffeurs.length}</div>
          <div class="kpi-label">Chauffeurs actifs</div>
        </div>
        <div class="kpi-card blue">
          <div class="kpi-icon"><iconify-icon icon="solar:calendar-mark-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${filledSlots}</div>
          <div class="kpi-label">Créneaux planifiés</div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-icon"><iconify-icon icon="solar:calendar-minimalistic-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${uniqueAbsDrivers}</div>
          <div class="kpi-label">Chauffeurs absents</div>
        </div>
        <div class="kpi-card ${filledSlots / totalSlots >= 0.7 ? 'green' : 'red'}">
          <div class="kpi-icon"><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon></div>
          <div class="kpi-value">${totalSlots > 0 ? Math.round(filledSlots / totalSlots * 100) : 0}%</div>
          <div class="kpi-label">Taux de couverture</div>
        </div>
      </div>

      <!-- Service du jour -->
      ${this._renderServiceDuJour(chauffeurs, days)}

      <!-- Légende pills -->
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;justify-content:center;">
        <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;background:rgba(34,197,94,.08);font-size:12px;font-weight:600;color:#22c55e;"><span style="width:7px;height:7px;border-radius:50%;background:#22c55e;"></span> Matin</div>
        <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;background:rgba(59,130,246,.08);font-size:12px;font-weight:600;color:#3b82f6;"><span style="width:7px;height:7px;border-radius:50%;background:#3b82f6;"></span> Après-midi</div>
        <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;background:rgba(245,158,11,.08);font-size:12px;font-weight:600;color:#f59e0b;"><span style="width:7px;height:7px;border-radius:50%;background:#f59e0b;"></span> Journée</div>
        <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;background:rgba(139,92,246,.08);font-size:12px;font-weight:600;color:#8b5cf6;"><span style="width:7px;height:7px;border-radius:50%;background:#8b5cf6;"></span> Nuit</div>
        <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;background:rgba(99,102,241,.08);font-size:12px;font-weight:600;color:#6366f1;"><span style="width:7px;height:7px;border-radius:50%;background:#6366f1;"></span> Personnalisé</div>
        <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;background:rgba(100,116,139,.08);font-size:12px;font-weight:600;color:#64748b;"><span style="width:7px;height:7px;border-radius:50%;background:#64748b;"></span> Repos</div>
        <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;background:rgba(239,68,68,.08);font-size:12px;font-weight:600;color:#ef4444;"><span style="width:7px;height:7px;border-radius:50%;background:#ef4444;"></span> Maladie</div>
        <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;background:rgba(59,130,246,.08);font-size:12px;font-weight:600;color:#3b82f6;"><span style="width:7px;height:7px;border-radius:50%;background:#3b82f6;"></span> Congé</div>
      </div>

      <!-- Grille planning moderne -->
      <style>
        .pg-grid { display:grid; grid-template-columns:200px repeat(7,minmax(90px,1fr)); gap:3px 6px; align-items:center; }
        .pg-head {
          text-align:center; font-size:11px; font-weight:700; color:#9ca3af; padding:10px 0 8px;
          text-transform:uppercase; letter-spacing:.8px; border-bottom:2px solid transparent;
        }
        .pg-head.today {
          color:#6366f1;
          background:linear-gradient(180deg, rgba(99,102,241,.06) 0%, rgba(99,102,241,.02) 100%);
          border-radius:12px 12px 0 0;
          border-bottom:2px solid #6366f1;
        }
        .pg-head .pg-daynum { display:block; font-size:18px; font-weight:800; color:var(--text-primary); margin-top:2px; }
        .pg-head.today .pg-daynum { color:#6366f1; }
        .pg-driver {
          display:flex; align-items:center; gap:10px; font-size:13px; font-weight:600; color:var(--text-primary);
          padding:6px 4px;
          text-decoration:none; cursor:pointer; border-radius:10px; transition:background .15s;
        }
        .pg-driver:hover { background:rgba(99,102,241,.05); }
        .pg-avatar {
          width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          font-size:10px; font-weight:700; color:#fff; flex-shrink:0;
          box-shadow:0 2px 6px rgba(0,0,0,.15); border:2px solid rgba(255,255,255,.8);
          object-fit:cover;
        }
        .pg-driver-info { }
        .pg-driver-name { font-size:13px; font-weight:600; color:var(--text-primary); }
        .pg-driver-sub { font-size:10px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pg-cell {
          min-height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition:all .2s cubic-bezier(.16,1,.3,1); position:relative;
        }
        .pg-cell:hover { transform:scale(1.06); box-shadow:0 4px 12px rgba(0,0,0,.1); z-index:2; }
        .pg-shift {
          width:100%; padding:6px 4px; border-radius:10px; text-align:center;
          font-size:12px; font-weight:700; cursor:grab; transition:all .15s;
        }
        .pg-shift:hover { filter:brightness(1.05); }
        .pg-absence {
          width:100%; padding:6px 4px; border-radius:10px; text-align:center;
          font-size:11px; font-weight:600; cursor:pointer;
        }
        .pg-empty {
          width:100%; padding:6px 4px; border-radius:10px; text-align:center;
          border:1.5px dashed var(--border-color); opacity:0.3; transition:all .2s;
        }
        .pg-empty:hover { opacity:1; border-color:#6366f1; background:rgba(99,102,241,.04); }
        .pg-row-even .pg-driver, .pg-row-even .pg-cell { background:rgba(0,0,0,.012); border-radius:10px; }
        [data-theme="dark"] .pg-row-even .pg-driver, [data-theme="dark"] .pg-row-even .pg-cell { background:rgba(255,255,255,.03); }
        [data-theme="dark"] .pg-avatar { border-color:rgba(255,255,255,.15); }
        [data-theme="dark"] .pg-driver:hover { background:rgba(99,102,241,.1); }
        @media(max-width:768px) {
          .pg-grid { grid-template-columns:120px repeat(7,1fr); gap:2px 4px; }
          .pg-avatar { width:26px; height:26px; font-size:9px; }
          .pg-driver-name { font-size:12px; }
          .pg-driver-sub { display:none; }
          .pg-head { font-size:11px; }
          .pg-head .pg-daynum { font-size:16px; }
          .pg-shift { font-size:11px; padding:5px 3px; }
          .pg-absence { font-size:10px; padding:5px 3px; }
        }
      </style>

      <div class="card" style="padding:20px;overflow-x:auto;border-radius:20px;">
        <div class="pg-grid" style="min-width:800px;">
          <!-- Header -->
          <div></div>
          ${days.map(d => `
            <div class="pg-head ${this._isToday(d.date) ? 'today' : ''}">
              <span>${this._getDayName(d.dayIdx)}</span>
              <span class="pg-daynum">${d.obj.getDate()}</span>
            </div>
          `).join('')}

          <!-- Driver rows -->
          ${chauffeurs.map((ch, idx) => {
            const rowClass = idx % 2 === 1 ? 'pg-row-even' : '';
            const avatarColor = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'][idx % 10];
            const initials = ((ch.prenom||'')[0] + (ch.nom||'')[0]).toUpperCase();
            const avatarHtml = ch.photo
              ? `<img src="${ch.photo}" alt="${initials}" class="pg-avatar">`
              : `<div class="pg-avatar" style="background:linear-gradient(135deg,${avatarColor},${avatarColor}dd);">${initials}</div>`;
            const vehLabel = ch.vehiculeAssigne ? (vehMap[ch.vehiculeAssigne] || '') : '';

            let html = `<a href="#/chauffeurs/${ch.id}" class="pg-driver ${rowClass}" title="${ch.prenom} ${ch.nom}">
              ${avatarHtml}
              <div class="pg-driver-info">
                <div class="pg-driver-name">${ch.prenom} ${ch.nom}</div>
                ${vehLabel ? `<div class="pg-driver-sub">${vehLabel}</div>` : ''}
              </div>
            </a>`;

            html += days.map(d => {
              const shifts = this._getDriverShiftsForDate(ch.id, d.date);
              const absences = this._getDriverAbsencesForDate(ch.id, d.date);
              const isToday = this._isToday(d.date);
              const todayBg = isToday ? 'background:rgba(99,102,241,.03);' : '';

              if (absences.length > 0) {
                const a = absences[0];
                const c = this._absenceTypeColor(a.type);
                return `<div class="pg-cell ${rowClass}" style="${todayBg}" onclick="PlanningPage._viewAbsence('${a.id}')">
                  <div class="pg-absence" style="background:linear-gradient(135deg,${c}18,${c}0d);color:${c};border:1px solid ${c}30;" title="${this._absenceTypeLabel(a.type)}${a.motif ? ': ' + a.motif : ''}">
                    ${this._absenceTypeLabel(a.type)}
                  </div>
                </div>`;
              }

              if (shifts.length > 0) {
                return `<div class="pg-cell ${rowClass}" style="${todayBg}" ondragover="PlanningPage._onDragOver(event)" ondrop="PlanningPage._onDrop(event, '${ch.id}', '${d.date}')">
                  ${shifts.map(s => {
                    const sc = this._getShiftColor(s);
                    return `<div draggable="true" ondragstart="PlanningPage._onDragStart(event, '${s.id}')" class="pg-shift" style="background:linear-gradient(135deg,${sc}20,${sc}10);color:${sc};border:1px solid ${sc}35;" onclick="PlanningPage._editShift('${s.id}')" title="${this._getShiftTimeLabel(s)}">
                      ${this._getShiftTimeShort(s)}
                    </div>`;
                  }).join('')}
                </div>`;
              }

              return `<div class="pg-cell ${rowClass}" style="${todayBg}" ondragover="PlanningPage._onDragOver(event)" ondrop="PlanningPage._onDrop(event, '${ch.id}', '${d.date}')">
                <div class="pg-empty planning-empty-cell" data-chauffeur="${ch.id}" data-date="${d.date}">
                  <iconify-icon icon="solar:add-circle-bold-duotone" style="font-size:12px;color:#d1d5db;"></iconify-icon>
                </div>
              </div>`;
            }).join('');

            return html;
          }).join('')}
        </div>
      </div>
    `;
  },

  _bindWeekEvents() {
    document.querySelectorAll('.planning-empty-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const chId = cell.dataset.chauffeur;
        const date = cell.dataset.date;
        this._addShift(chId, date);
      });
    });
  },

  _renderServiceDuJour(chauffeurs, days) {
    const todayStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
    // Only show if today is within the week
    const isThisWeek = days.some(d => d.date === todayStr);
    if (!isThisWeek) return '';

    const pointages = Store.get('pointages') || [];
    const todayPointages = pointages.filter(p => p.date === todayStr);
    const planning = this._getPlanning();
    const todayShifts = planning.filter(p => p.date === todayStr);
    const programmesCount = todayShifts.length;

    const serviceEnCours = todayPointages.filter(p => p.statut === 'en_service').length;
    const serviceEnPause = todayPointages.filter(p => p.statut === 'pause').length;
    const serviceTermine = todayPointages.filter(p => p.statut === 'termine').length;
    const servicePasCommence = Math.max(0, programmesCount - todayPointages.length);

    return `
      <div class="card" style="margin-bottom:var(--space-lg);padding:16px 20px;border-radius:16px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:34px;height:34px;border-radius:10px;background:rgba(16,185,129,.12);color:#10b981;display:flex;align-items:center;justify-content:center;font-size:15px;">
            <iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon>
          </div>
          <div>
            <div style="font-weight:600;font-size:var(--font-size-sm);color:var(--text-primary);">Service du jour</div>
            <div style="font-size:11px;color:var(--text-muted);">${programmesCount} programme${programmesCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">
          <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(16,185,129,.1);">
            <span style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span>
            <span style="font-size:11px;color:var(--text-muted);">En service</span>
            <strong style="margin-left:auto;font-size:13px;color:var(--text-primary);">${serviceEnCours}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(249,115,22,.1);">
            <span style="width:6px;height:6px;border-radius:50%;background:#f97316;"></span>
            <span style="font-size:11px;color:var(--text-muted);">Pause</span>
            <strong style="margin-left:auto;font-size:13px;color:var(--text-primary);">${serviceEnPause}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(107,114,128,.1);">
            <span style="width:6px;height:6px;border-radius:50%;background:#6b7280;"></span>
            <span style="font-size:11px;color:var(--text-muted);">Termine</span>
            <strong style="margin-left:auto;font-size:13px;color:var(--text-primary);">${serviceTermine}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(209,213,219,.1);">
            <span style="width:6px;height:6px;border-radius:50%;background:#d1d5db;"></span>
            <span style="font-size:11px;color:var(--text-muted);">Attente</span>
            <strong style="margin-left:auto;font-size:13px;color:var(--text-primary);">${servicePasCommence}</strong>
          </div>
        </div>
      </div>`;
  },

  // =================== VUE MOIS ===================

  _renderMonthView() {
    let chauffeurs = this._getChauffeurs().filter(c => c.statut !== 'inactif');
    if (this._filterSearch) {
      const q = this._filterSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      chauffeurs = chauffeurs.filter(c => {
        const fullName = (c.prenom + ' ' + c.nom).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return fullName.includes(q);
      });
    }
    const year = this._currentMonth.getFullYear();
    const month = this._currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Build day headers
    const dayHeaders = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      const dow = dt.getDay();
      const isWeekend = dow === 0 || dow === 6;
      dayHeaders.push({ num: d, date: this._dateStr(dt), isWeekend, isToday: this._isToday(this._dateStr(dt)), dow });
    }

    return `
      <!-- Légende -->
      <div class="card" style="margin-bottom:var(--space-md);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;align-items:center;font-size:var(--font-size-xs);">
          <span style="font-weight:600;color:var(--text-secondary);">Créneaux :</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#22c55e;vertical-align:middle;"></span> <strong>M</strong> Matin</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#3b82f6;vertical-align:middle;"></span> <strong>AM</strong> Après-midi</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#f59e0b;vertical-align:middle;"></span> <strong>J</strong> Journée</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#8b5cf6;vertical-align:middle;"></span> <strong>N</strong> Nuit</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#6366f1;vertical-align:middle;"></span> <strong>P</strong> Personnalisé</span>
          <span style="margin-left:var(--space-sm);font-weight:600;color:var(--text-secondary);">Absences :</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#64748b;vertical-align:middle;"></span> <strong>R</strong> Repos</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#ef4444;vertical-align:middle;"></span> <strong>M</strong> Maladie</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#3b82f6;vertical-align:middle;"></span> <strong>C</strong> Congé</span>
        </div>
      </div>

      <div class="card" style="padding:0;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:${daysInMonth * 36 + 180}px;">
          <thead>
            <tr style="background:var(--bg-tertiary);">
              <th style="padding:8px 12px;text-align:left;font-size:var(--font-size-xs);font-weight:600;color:var(--text-secondary);width:160px;border-bottom:2px solid var(--border-color);position:sticky;left:0;background:var(--bg-tertiary);z-index:1;">Chauffeur</th>
              ${dayHeaders.map(d => `
                <th style="padding:4px 2px;text-align:center;font-size:10px;border-bottom:2px solid var(--border-color);min-width:30px;
                  ${d.isToday ? 'background:var(--pilote-blue-glow);color:var(--pilote-blue);font-weight:700;' : d.isWeekend ? 'background:rgba(100,116,139,0.1);color:var(--text-muted);' : 'color:var(--text-secondary);'}">
                  <div style="font-weight:600;">${d.num}</div>
                  <div style="font-size:9px;">${this._getDayName(d.dow === 0 ? 6 : d.dow - 1)}</div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${chauffeurs.map(ch => `
              <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:6px 12px;position:sticky;left:0;background:var(--bg-secondary);z-index:1;">
                  <a href="#/chauffeurs/${ch.id}" style="display:flex;align-items:center;gap:6px;text-decoration:none;color:inherit;" title="Voir le détail de ${ch.prenom} ${ch.nom}">
                    ${Utils.getAvatarHtml(ch, '', 'width:24px;height:24px;font-size:9px;')}
                    <span style="font-size:var(--font-size-xs);font-weight:500;">${ch.prenom} ${ch.nom.charAt(0)}.</span>
                  </a>
                </td>
                ${dayHeaders.map(d => {
                  const shifts = this._getDriverShiftsForDate(ch.id, d.date);
                  const absences = this._getDriverAbsencesForDate(ch.id, d.date);

                  if (absences.length > 0) {
                    const a = absences[0];
                    return `<td style="padding:2px;text-align:center;${d.isToday ? 'background:rgba(59,130,246,0.05);' : d.isWeekend ? 'background:rgba(100,116,139,0.05);' : ''}">
                      <div style="width:24px;height:24px;border-radius:4px;background:${this._absenceTypeColor(a.type)};margin:auto;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;cursor:pointer;" title="${this._absenceTypeLabel(a.type)}" onclick="PlanningPage._viewAbsence('${a.id}')">
                        ${a.type === 'repos' ? 'R' : a.type === 'conge' ? 'C' : a.type === 'maladie' ? 'M' : a.type === 'formation' ? 'F' : a.type === 'suspension' ? 'S' : 'P'}
                      </div>
                    </td>`;
                  }

                  if (shifts.length > 0) {
                    const s = shifts[0];
                    return `<td style="padding:2px;text-align:center;${d.isToday ? 'background:rgba(59,130,246,0.05);' : d.isWeekend ? 'background:rgba(100,116,139,0.05);' : ''}">
                      <div style="width:24px;height:24px;border-radius:4px;background:${this._getShiftColor(s)};margin:auto;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;cursor:pointer;" title="${this._getShiftTimeLabel(s)}" onclick="PlanningPage._editShift('${s.id}')">
                        ${this._shiftTypeShort(s.typeCreneaux)}
                      </div>
                    </td>`;
                  }

                  return `<td style="padding:2px;text-align:center;${d.isToday ? 'background:rgba(59,130,246,0.05);' : d.isWeekend ? 'background:rgba(100,116,139,0.05);' : ''}">
                    <div style="width:24px;height:24px;border-radius:4px;border:1px dashed var(--border-color);margin:auto;opacity:0.3;"></div>
                  </td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // =================== VUE STATISTIQUES ===================

  _renderStatsView() {
    const chauffeurs = this._getChauffeurs().filter(c => c.statut !== 'inactif');
    const planning = this._getPlanning();
    const absences = this._getAbsences();
    const year = this._currentMonth.getFullYear();
    const month = this._currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Stats per chauffeur for this month
    const stats = chauffeurs.map(ch => {
      let joursTravailes = 0;
      let joursAbsents = 0;
      let joursNonPlanifies = 0;
      const shiftTypes = { matin: 0, apres_midi: 0, journee: 0, nuit: 0, custom: 0 };
      const absTypes = { repos: 0, conge: 0, maladie: 0, formation: 0, personnel: 0, suspension: 0 };

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const shifts = this._getDriverShiftsForDate(ch.id, dateStr);
        const abs = this._getDriverAbsencesForDate(ch.id, dateStr);

        if (abs.length > 0) {
          joursAbsents++;
          const type = abs[0].type;
          if (absTypes[type] !== undefined) absTypes[type]++;
        } else if (shifts.length > 0) {
          joursTravailes++;
          shifts.forEach(s => {
            const key = (s.heureDebut && s.heureFin && (!s.typeCreneaux || s.typeCreneaux === 'custom')) ? 'custom' : s.typeCreneaux;
            if (shiftTypes[key] !== undefined) shiftTypes[key]++;
          });
        } else {
          joursNonPlanifies++;
        }
      }

      return {
        chauffeur: ch,
        joursTravailes,
        joursAbsents,
        joursNonPlanifies,
        tauxPresence: daysInMonth > 0 ? Math.round(joursTravailes / daysInMonth * 100) : 0,
        shiftTypes,
        absTypes
      };
    });

    const totalShifts = stats.reduce((s, st) => s + st.joursTravailes, 0);
    const totalAbsences = stats.reduce((s, st) => s + st.joursAbsents, 0);
    const avgPresence = stats.length > 0 ? Math.round(stats.reduce((s, st) => s + st.tauxPresence, 0) / stats.length) : 0;

    return `
      <div class="grid-4" style="margin-bottom:var(--space-lg);">
        <div class="kpi-card green">
          <div class="kpi-value">${totalShifts}</div>
          <div class="kpi-label">Jours travaillés (flotte)</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-value">${totalAbsences}</div>
          <div class="kpi-label">Jours d'absence (flotte)</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-value">${avgPresence}%</div>
          <div class="kpi-label">Taux de présence moyen</div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-value">${daysInMonth}</div>
          <div class="kpi-label">Jours dans le mois</div>
        </div>
      </div>

      <!-- Tableau détaillé par chauffeur -->
      <div class="card" style="margin-bottom:var(--space-lg);">
        <div class="card-header"><span class="card-title"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon> Détail par chauffeur — ${Utils.getMonthName(month)} ${year}</span></div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--bg-tertiary);">
                <th style="padding:10px 12px;text-align:left;font-size:var(--font-size-xs);color:var(--text-secondary);border-bottom:1px solid var(--border-color);">Chauffeur</th>
                <th style="padding:10px 8px;text-align:center;font-size:var(--font-size-xs);color:var(--text-secondary);border-bottom:1px solid var(--border-color);">Travaillé</th>
                <th style="padding:10px 8px;text-align:center;font-size:var(--font-size-xs);color:var(--text-secondary);border-bottom:1px solid var(--border-color);">Absent</th>
                <th style="padding:10px 8px;text-align:center;font-size:var(--font-size-xs);color:var(--text-secondary);border-bottom:1px solid var(--border-color);">Non planifié</th>
                <th style="padding:10px 8px;text-align:center;font-size:var(--font-size-xs);color:var(--text-secondary);border-bottom:1px solid var(--border-color);">Présence</th>
                <th style="padding:10px 8px;text-align:center;font-size:var(--font-size-xs);color:var(--text-secondary);border-bottom:1px solid var(--border-color);">Détail absences</th>
              </tr>
            </thead>
            <tbody>
              ${stats.map(st => `
                <tr style="border-bottom:1px solid var(--border-color);">
                  <td style="padding:10px 12px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      ${Utils.getAvatarHtml(st.chauffeur, '', 'width:28px;height:28px;font-size:10px;')}
                      <span style="font-size:var(--font-size-sm);font-weight:500;">${st.chauffeur.prenom} ${st.chauffeur.nom}</span>
                    </div>
                  </td>
                  <td style="padding:10px 8px;text-align:center;"><span class="badge badge-success">${st.joursTravailes}j</span></td>
                  <td style="padding:10px 8px;text-align:center;"><span class="badge ${st.joursAbsents > 5 ? 'badge-danger' : 'badge-warning'}">${st.joursAbsents}j</span></td>
                  <td style="padding:10px 8px;text-align:center;"><span class="badge badge-neutral">${st.joursNonPlanifies}j</span></td>
                  <td style="padding:10px 8px;text-align:center;">
                    <div style="display:flex;align-items:center;gap:6px;justify-content:center;">
                      <div style="width:60px;height:6px;border-radius:3px;background:var(--bg-tertiary);overflow:hidden;">
                        <div style="height:100%;width:${st.tauxPresence}%;border-radius:3px;background:${st.tauxPresence >= 70 ? '#22c55e' : st.tauxPresence >= 50 ? '#f59e0b' : '#ef4444'};"></div>
                      </div>
                      <span style="font-size:var(--font-size-xs);font-weight:600;">${st.tauxPresence}%</span>
                    </div>
                  </td>
                  <td style="padding:10px 8px;text-align:center;font-size:var(--font-size-xs);">
                    ${Object.entries(st.absTypes).filter(([, v]) => v > 0).map(([k, v]) => `<span class="badge" style="background:${this._absenceTypeColor(k)}33;color:${this._absenceTypeColor(k)};margin:1px;">${this._absenceTypeLabel(k)}: ${v}j</span>`).join(' ') || '<span style="color:var(--text-muted);">Aucune</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Jours travaillés par chauffeur</div></div>
          <div class="chart-container" style="height:300px;"><canvas id="chart-planning-worked"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-header"><div class="chart-title"><iconify-icon icon="solar:pie-chart-2-bold-duotone"></iconify-icon> Types d'absences (flotte)</div></div>
          <div class="chart-container" style="height:300px;"><canvas id="chart-planning-absences"></canvas></div>
        </div>
      </div>
    `;
  },

  _loadStatsCharts() {
    const chauffeurs = this._getChauffeurs().filter(c => c.statut !== 'inactif');
    const year = this._currentMonth.getFullYear();
    const month = this._currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Days worked per driver
    const workedData = chauffeurs.map(ch => {
      let count = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (this._getDriverShiftsForDate(ch.id, dateStr).length > 0) count++;
      }
      return count;
    });

    const ctx1 = document.getElementById('chart-planning-worked');
    if (ctx1) {
      const workedBgColors = workedData.map(v => v >= daysInMonth * 0.7 ? '#22c55e' : v >= daysInMonth * 0.5 ? '#f59e0b' : '#ef4444');
      const workedHoverColors = workedData.map(v => v >= daysInMonth * 0.7 ? '#16a34a' : v >= daysInMonth * 0.5 ? '#d97706' : '#dc2626');
      this._charts.push(new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: chauffeurs.map(c => `${c.prenom} ${c.nom.charAt(0)}.`),
          datasets: [{
            label: 'Jours travaillés',
            data: workedData,
            backgroundColor: workedBgColors,
            hoverBackgroundColor: workedHoverColors,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const idx = items[0].dataIndex;
                  const ch = chauffeurs[idx];
                  return ch ? `${ch.prenom} ${ch.nom}` : items[0].label;
                },
                label: (item) => {
                  const jours = item.raw;
                  const pct = daysInMonth > 0 ? Math.round(jours / daysInMonth * 100) : 0;
                  return `${jours} jour${jours > 1 ? 's' : ''} travaillé${jours > 1 ? 's' : ''} (${pct}% du mois)`;
                }
              }
            }
          },
          scales: { x: { beginAtZero: true, max: daysInMonth } }
        }
      }));
    }

    // Absence types breakdown
    const absTotal = { repos: 0, conge: 0, maladie: 0, formation: 0, personnel: 0, suspension: 0 };
    chauffeurs.forEach(ch => {
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const abs = this._getDriverAbsencesForDate(ch.id, dateStr);
        if (abs.length > 0 && absTotal[abs[0].type] !== undefined) absTotal[abs[0].type]++;
      }
    });

    const absEntries = Object.entries(absTotal).filter(([, v]) => v > 0);
    const ctx2 = document.getElementById('chart-planning-absences');
    if (ctx2 && absEntries.length > 0) {
      const totalAbsenceDays = absEntries.reduce((sum, [, v]) => sum + v, 0);
      this._charts.push(new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: absEntries.map(([k]) => this._absenceTypeLabel(k)),
          datasets: [{
            data: absEntries.map(([, v]) => v),
            backgroundColor: absEntries.map(([k]) => this._absenceTypeColor(k)),
            borderColor: Utils.chartBorderColor(), borderWidth: 2,
            hoverOffset: 12
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '55%',
          plugins: {
            legend: { position: 'right', labels: { font: { size: 11 }, padding: 8 } },
            tooltip: {
              callbacks: {
                label: (item) => {
                  const val = item.raw;
                  const pct = totalAbsenceDays > 0 ? Math.round(val / totalAbsenceDays * 100) : 0;
                  return `${item.label}: ${val} jour${val > 1 ? 's' : ''} (${pct}%)`;
                }
              }
            }
          }
        },
        plugins: [Utils.doughnutCenterPlugin(totalAbsenceDays, 'jours absence')]
      }));
    } else if (ctx2) {
      ctx2.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:var(--font-size-sm);"><iconify-icon icon="solar:info-circle-bold-duotone" style="margin-right:8px;"></iconify-icon> Aucune absence enregistrée ce mois</div>';
    }
  },

  // =================== CRUD ===================

  _addShift(preselectedChId, preselectedDate) {
    const chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif');
    const fields = [
      { type: 'row-start' },
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, placeholder: 'Choisir un chauffeur...', options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })), default: preselectedChId || '' },
      { name: 'date', label: 'Date', type: 'date', required: true, default: preselectedDate || new Date().toISOString().split('T')[0] },
      { type: 'row-end' },
      { name: 'typeCreneaux', label: 'Créneau type', type: 'select', required: false, options: [
        { value: 'custom', label: 'Personnalisé' },
        { value: 'matin', label: 'Matin (6h - 14h)' },
        { value: 'apres_midi', label: 'Après-midi (14h - 22h)' },
        { value: 'journee', label: 'Journée complète (8h - 20h)' },
        { value: 'nuit', label: 'Nuit (22h - 6h)' }
      ], default: 'custom' },
      { type: 'row-start' },
      { name: 'heureDebut', label: 'Heure début', type: 'time', required: true, default: '06:00' },
      { name: 'heureFin', label: 'Heure fin', type: 'time', required: true, default: '00:00' },
      { type: 'row-end' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'Zone, client particulier, instructions...' }
    ];

    Modal.form('<iconify-icon icon="solar:calendar-add-bold-duotone" class="text-success"></iconify-icon> Ajouter un créneau', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);

      // Vérifier doublon : même chauffeur, même date, même créneau horaire
      const planning = Store.get('planning') || [];
      const doublon = planning.find(p =>
        p.chauffeurId === values.chauffeurId &&
        p.date === values.date &&
        p.heureDebut === values.heureDebut &&
        p.heureFin === values.heureFin
      );
      if (doublon) {
        Toast.error('Ce créneau existe déjà pour ce chauffeur à cette date');
        return;
      }

      Store.add('planning', { id: Utils.generateId('PLN'), ...values, dateCreation: new Date().toISOString() });
      Modal.close();
      Toast.success('Créneau ajouté');
      this._renderView();
    });

    // Auto-remplir les heures quand on choisit un preset
    this._bindShiftPresetListener();
  },

  // =================== DRAG & DROP ===================

  _draggedShiftId: null,

  _onDragStart(event, shiftId) {
    this._draggedShiftId = shiftId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', shiftId);
    event.target.style.opacity = '0.5';
  },

  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  },

  _onDrop(event, targetChauffeurId, targetDate) {
    event.preventDefault();
    event.currentTarget.style.background = '';

    const shiftId = this._draggedShiftId;
    if (!shiftId) return;

    const shift = Store.findById('planning', shiftId);
    if (!shift) return;

    // Pas de changement si même chauffeur et même date
    if (shift.chauffeurId === targetChauffeurId && shift.date === targetDate) {
      this._draggedShiftId = null;
      return;
    }

    // Vérifier doublon à la destination
    const planning = Store.get('planning') || [];
    const exists = planning.some(p =>
      p.id !== shiftId &&
      p.chauffeurId === targetChauffeurId &&
      p.date === targetDate &&
      p.heureDebut === shift.heureDebut &&
      p.heureFin === shift.heureFin
    );

    if (exists) {
      Toast.error('Ce créneau existe déjà à cette date');
      this._draggedShiftId = null;
      return;
    }

    // Vérifier absence à la destination
    const absences = this._getDriverAbsencesForDate(targetChauffeurId, targetDate);
    if (absences.length > 0) {
      Toast.error('Ce chauffeur est absent ce jour-là');
      this._draggedShiftId = null;
      return;
    }

    // Mettre à jour le créneau
    Store.update('planning', shiftId, {
      chauffeurId: targetChauffeurId,
      date: targetDate
    });

    this._draggedShiftId = null;
    Toast.success('Créneau déplacé');
    this._renderView();
  },

  _editShift(id) {
    const shift = Store.findById('planning', id);
    if (!shift) return;
    const chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif');

    // Déduire heureDebut/heureFin depuis le preset si ancien enregistrement
    const editValues = { ...shift };
    if (!editValues.heureDebut && editValues.typeCreneaux && this._shiftPresets[editValues.typeCreneaux]) {
      editValues.heureDebut = this._shiftPresets[editValues.typeCreneaux][0];
      editValues.heureFin = this._shiftPresets[editValues.typeCreneaux][1];
    }
    if (!editValues.heureDebut) {
      editValues.typeCreneaux = 'custom';
      editValues.heureDebut = '06:00';
      editValues.heureFin = '00:00';
    }

    const fields = [
      { type: 'row-start' },
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { type: 'row-end' },
      { name: 'typeCreneaux', label: 'Créneau type', type: 'select', required: false, options: [
        { value: 'custom', label: 'Personnalisé' },
        { value: 'matin', label: 'Matin (6h - 14h)' },
        { value: 'apres_midi', label: 'Après-midi (14h - 22h)' },
        { value: 'journee', label: 'Journée complète (8h - 20h)' },
        { value: 'nuit', label: 'Nuit (22h - 6h)' }
      ]},
      { type: 'row-start' },
      { name: 'heureDebut', label: 'Heure début', type: 'time', required: true },
      { name: 'heureFin', label: 'Heure fin', type: 'time', required: true },
      { type: 'row-end' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ];

    Modal.form('<iconify-icon icon="solar:pen-bold-duotone" class="text-blue"></iconify-icon> Modifier le créneau', FormBuilder.build(fields, editValues), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);

      // Vérifier doublon : même chauffeur, même date, même créneau horaire (exclure le créneau en cours d'édition)
      const planning = Store.get('planning') || [];
      const doublon = planning.find(p =>
        p.id !== id &&
        p.chauffeurId === values.chauffeurId &&
        p.date === values.date &&
        p.heureDebut === values.heureDebut &&
        p.heureFin === values.heureFin
      );
      if (doublon) {
        Toast.error('Ce créneau existe déjà pour ce chauffeur à cette date');
        return;
      }

      Store.update('planning', id, values);
      Modal.close();
      Toast.success('Créneau modifié');
      this._renderView();
    }, 'Sauvegarder', () => {
      // Delete button in footer
    });

    // Add delete + recharge buttons
    setTimeout(() => {
      const footer = document.getElementById('modal-footer');
      if (footer) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.innerHTML = '<iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon> Supprimer';
        delBtn.style.marginRight = 'auto';
        delBtn.onclick = () => {
          Store.delete('planning', id);
          Modal.close();
          Toast.success('Créneau supprimé');
          this._renderView();
        };
        footer.insertBefore(delBtn, footer.firstChild);

        // Bouton Recharger Yango si le chauffeur est lié
        const ch = Store.findById('chauffeurs', shift.chauffeurId);
        if (ch && ch.yangoDriverId) {
          const rechargeBtn = document.createElement('button');
          rechargeBtn.className = 'btn btn-sm';
          rechargeBtn.style.cssText = 'background:#FC4C02;color:#fff;border:none;';
          rechargeBtn.innerHTML = '<iconify-icon icon="solar:card-transfer-bold-duotone"></iconify-icon> Recharger Yango';
          rechargeBtn.onclick = () => {
            Modal.close();
            if (typeof ChauffeursPage !== 'undefined' && ChauffeursPage._yangoRecharge) {
              ChauffeursPage._yangoRecharge(shift.chauffeurId);
            } else {
              PlanningPage._yangoRechargeFromPlanning(shift.chauffeurId);
            }
          };
          footer.insertBefore(rechargeBtn, delBtn.nextSibling);
        }
      }
    }, 50);

    // Auto-remplir les heures quand on choisit un preset
    this._bindShiftPresetListener();
  },

  _bindShiftPresetListener() {
    setTimeout(() => {
      const selectType = document.querySelector('[name="typeCreneaux"]');
      const inputDebut = document.querySelector('[name="heureDebut"]');
      const inputFin = document.querySelector('[name="heureFin"]');
      if (selectType && inputDebut && inputFin) {
        selectType.addEventListener('change', () => {
          const p = this._shiftPresets[selectType.value];
          if (p) {
            inputDebut.value = p[0];
            inputFin.value = p[1];
          }
        });
      }
    }, 50);
  },

  _addAbsence() {
    const chauffeurs = this._getChauffeurs().filter(c => c.statut !== 'inactif');
    const fields = [
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, placeholder: 'Choisir un chauffeur...', options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { type: 'row-start' },
      { name: 'dateDebut', label: 'Date de début', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
      { name: 'dateFin', label: 'Date de fin', type: 'date', required: true, default: new Date().toISOString().split('T')[0] },
      { type: 'row-end' },
      { name: 'type', label: 'Type d\'absence', type: 'select', required: true, options: [
        { value: 'repos', label: 'Jour de repos' },
        { value: 'conge', label: 'Congé' },
        { value: 'maladie', label: 'Maladie' },
        { value: 'formation', label: 'Formation' },
        { value: 'personnel', label: 'Raison personnelle' },
        { value: 'suspension', label: 'Suspension' }
      ]},
      { name: 'motif', label: 'Motif / Commentaire', type: 'textarea', rows: 2, placeholder: 'Raison de l\'absence...' }
    ];

    Modal.form('<iconify-icon icon="solar:calendar-minimalistic-bold-duotone" class="text-danger"></iconify-icon> Déclarer une absence', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);

      if (values.dateFin < values.dateDebut) {
        Toast.error('La date de fin doit être après la date de début');
        return;
      }

      Store.add('absences', { id: Utils.generateId('ABS'), ...values, dateCreation: new Date().toISOString() });
      Modal.close();
      Toast.success('Absence enregistrée');
      this._renderView();
    });
  },

  _viewAbsence(id) {
    const a = Store.findById('absences', id);
    if (!a) return;
    const ch = Store.findById('chauffeurs', a.chauffeurId);
    const nom = ch ? `${ch.prenom} ${ch.nom}` : a.chauffeurId;

    const content = `
      <div style="display:flex;flex-direction:column;gap:var(--space-md);">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:48px;height:48px;border-radius:50%;background:${this._absenceTypeColor(a.type)};display:flex;align-items:center;justify-content:center;"><iconify-icon icon="solar:calendar-minimalistic-bold-duotone" style="color:#fff;font-size:18px;"></iconify-icon></div>
          <div>
            <div style="font-weight:600;font-size:var(--font-size-base);">${nom}</div>
            <span class="badge" style="background:${this._absenceTypeColor(a.type)}33;color:${this._absenceTypeColor(a.type)};">${this._absenceTypeLabel(a.type)}</span>
          </div>
        </div>
        <div class="grid-2">
          <div><span style="font-size:var(--font-size-xs);color:var(--text-muted);">Du</span><br><strong>${Utils.formatDate(a.dateDebut)}</strong></div>
          <div><span style="font-size:var(--font-size-xs);color:var(--text-muted);">Au</span><br><strong>${Utils.formatDate(a.dateFin)}</strong></div>
        </div>
        ${a.motif ? `<div><span style="font-size:var(--font-size-xs);color:var(--text-muted);">Motif</span><br>${a.motif}</div>` : ''}
      </div>
    `;

    Modal.open(`<iconify-icon icon="solar:info-circle-bold-duotone"></iconify-icon> Détail absence`, content, `
      <button class="btn btn-danger" id="btn-delete-absence" style="margin-right:auto;"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon> Supprimer</button>
      <button class="btn btn-secondary" onclick="Modal.close()">Fermer</button>
    `);

    setTimeout(() => {
      const delBtn = document.getElementById('btn-delete-absence');
      if (delBtn) {
        delBtn.onclick = () => {
          Store.delete('absences', id);
          Modal.close();
          Toast.success('Absence supprimée');
          this._renderView();
        };
      }
    }, 50);
  },

  _showTemplates() {
    const templates = Store.get('planningTemplates') || [];

    let body = '<div style="margin-bottom:16px;">';
    body += '<button class="btn btn-primary btn-sm" onclick="PlanningPage._saveCurrentWeekAsTemplate()"><iconify-icon icon="solar:diskette-bold-duotone"></iconify-icon> Sauvegarder la semaine actuelle</button>';
    body += '</div>';

    if (templates.length === 0) {
      body += '<p style="color:var(--text-muted);text-align:center;padding:20px;">Aucun modèle sauvegardé.<br>Sauvegardez une semaine de planning pour créer votre premier modèle.</p>';
    } else {
      body += templates.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-radius:var(--radius-sm);background:var(--bg-tertiary);margin-bottom:8px;">
          <div>
            <div style="font-weight:600;">${t.name}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${t.shifts.length} créneau${t.shifts.length > 1 ? 'x' : ''} — Créé le ${Utils.formatDate(t.dateCreation)}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-primary" onclick="PlanningPage._applyTemplate('${t.id}')"><iconify-icon icon="solar:play-bold"></iconify-icon> Appliquer</button>
            <button class="btn btn-sm btn-danger" onclick="PlanningPage._deleteTemplate('${t.id}')"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
          </div>
        </div>
      `).join('');
    }

    Modal.open({ title: '<iconify-icon icon="solar:copy-bold-duotone" class="text-blue"></iconify-icon> Modèles de planning', body, footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>' });
  },

  _saveCurrentWeekAsTemplate() {
    const weekStart = new Date(this._currentWeekStart);
    const planning = Store.get('planning') || [];

    // Get all shifts for the current week
    const weekShifts = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = this._dateStr(d);
      const dayShifts = planning.filter(p => p.date === dateStr);
      dayShifts.forEach(s => {
        weekShifts.push({
          dayOfWeek: i, // 0=lundi, 1=mardi...
          chauffeurId: s.chauffeurId,
          typeCreneaux: s.typeCreneaux,
          heureDebut: s.heureDebut,
          heureFin: s.heureFin,
          notes: s.notes || ''
        });
      });
    }

    if (weekShifts.length === 0) {
      Toast.warning('Aucun créneau cette semaine à sauvegarder');
      return;
    }

    // Ask for name
    const name = prompt('Nom du modèle :', `Semaine type — ${weekShifts.length} créneaux`);
    if (!name) return;

    const templates = Store.get('planningTemplates') || [];
    templates.push({
      id: Utils.generateId('TPL'),
      name,
      shifts: weekShifts,
      dateCreation: new Date().toISOString().split('T')[0]
    });
    Store.set('planningTemplates', templates);
    Modal.close();
    Toast.success('Modèle sauvegardé');
    this._showTemplates();
  },

  _applyTemplate(templateId) {
    const templates = Store.get('planningTemplates') || [];
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;

    Modal.confirm('Appliquer le modèle ?', `Voulez-vous appliquer le modèle <strong>${tpl.name}</strong> à la semaine actuelle ? Les créneaux existants ne seront pas supprimés, seuls les nouveaux seront ajoutés.`, () => {
      const weekStart = new Date(this._currentWeekStart);
      const planning = Store.get('planning') || [];
      let added = 0;

      tpl.shifts.forEach(s => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + s.dayOfWeek);
        const dateStr = this._dateStr(d);

        // Check for duplicate
        const exists = planning.some(p =>
          p.chauffeurId === s.chauffeurId &&
          p.date === dateStr &&
          p.heureDebut === s.heureDebut &&
          p.heureFin === s.heureFin
        );

        if (!exists) {
          Store.add('planning', {
            id: Utils.generateId('PLN'),
            chauffeurId: s.chauffeurId,
            date: dateStr,
            typeCreneaux: s.typeCreneaux,
            heureDebut: s.heureDebut,
            heureFin: s.heureFin,
            notes: s.notes,
            dateCreation: new Date().toISOString()
          });
          added++;
        }
      });

      Modal.close();
      Toast.success(`${added} créneau${added > 1 ? 'x' : ''} ajouté${added > 1 ? 's' : ''}`);
      this._renderView();
    });
  },

  _deleteTemplate(templateId) {
    const templates = Store.get('planningTemplates') || [];
    const filtered = templates.filter(t => t.id !== templateId);
    Store.set('planningTemplates', filtered);
    Toast.success('Modèle supprimé');
    this._showTemplates();
  },

  _exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    const planning = Store.get('planning') || [];
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');

    doc.setFontSize(18);
    doc.text('Planning des Chauffeurs', 14, 22);
    doc.setFontSize(10);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);

    const rows = planning.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 80).map(p => {
      const ch = chauffeurs.find(c => c.id === p.chauffeurId);
      return [
        ch ? `${ch.prenom} ${ch.nom}` : p.chauffeurId,
        Utils.formatDate(p.date),
        p.typeCreneaux || 'custom',
        `${p.heureDebut || ''} - ${p.heureFin || ''}`,
        p.notes || ''
      ];
    });

    doc.autoTable({
      head: [['Chauffeur', 'Date', 'Type', 'Horaires', 'Notes']],
      body: rows,
      startY: 36,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save('planning-pilote.pdf');
    Toast.success('PDF exporté');
  },

  // =================== DÉPENSES RÉCURRENTES ===================

  _getDepTypeOptions() {
    const defaults = [
      { value: 'carburant', label: 'Carburant' }, { value: 'peage', label: 'Péage' },
      { value: 'lavage', label: 'Lavage' }, { value: 'assurance', label: 'Assurance' },
      { value: 'reparation', label: 'Réparation' }, { value: 'stationnement', label: 'Stationnement' },
      { value: 'autre', label: 'Autre' }
    ];
    const custom = Store.get('depenseCategories') || [];
    return [...defaults, ...custom];
  },

  _getDepTypeLabel(val) {
    const opt = this._getDepTypeOptions().find(t => t.value === val);
    return opt ? opt.label : val;
  },

  _showDepRecurrentes() {
    const modeles = Store.get('depenseRecurrentes') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const chMap = {};
    chauffeurs.forEach(c => chMap[c.id] = `${c.prenom} ${c.nom}`);

    const rows = modeles.map(m => `
      <tr>
        <td style="font-weight:500">${m.nom}</td>
        <td>${m.chauffeurId ? (chMap[m.chauffeurId] || m.chauffeurId) : 'Tous'}</td>
        <td>${this._getDepTypeLabel(m.typeDepense)}</td>
        <td style="font-weight:600">${Utils.formatCurrency(m.montant)}</td>
        <td><span class="badge badge-${m.recurrence === 'par_shift' ? 'success' : m.recurrence === 'quotidien' ? 'info' : m.recurrence === 'hebdo' ? 'warning' : 'primary'}">${{ par_shift: 'Par shift', quotidien: 'Quotidien', hebdo: 'Hebdomadaire', mensuel: 'Mensuel' }[m.recurrence]}</span></td>
        <td>
          <label style="cursor:pointer"><input type="checkbox" ${m.actif ? 'checked' : ''} onchange="PlanningPage._toggleRecModele('${m.id}', this.checked)"> Actif</label>
        </td>
        <td>
          <button class="btn-icon btn-danger" title="Supprimer" onclick="PlanningPage._deleteRecModele('${m.id}')"><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon></button>
        </td>
      </tr>
    `).join('');

    Modal.open({
      title: '<iconify-icon icon="solar:wallet-2-bold-duotone" style="color:#f59e0b;"></iconify-icon> Dépenses récurrentes',
      body: `
        <div style="display:flex;gap:8px;margin-bottom:1rem">
          <button class="btn btn-primary btn-sm" onclick="PlanningPage._addRecModele()"><iconify-icon icon="solar:add-circle-bold"></iconify-icon> Nouveau modèle</button>
          <button class="btn btn-success btn-sm" onclick="PlanningPage._generateExpenseGrid()"><iconify-icon icon="solar:calculator-bold-duotone"></iconify-icon> Générer la grille</button>
        </div>
        ${modeles.length ? `
          <div style="max-height:350px;overflow-y:auto">
            <table class="table" style="width:100%;font-size:var(--font-size-sm)">
              <thead><tr><th>Nom</th><th>Chauffeur</th><th>Type</th><th>Montant</th><th>Récurrence</th><th>Statut</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        ` : '<p style="text-align:center;color:var(--text-muted);padding:2rem 0;">Aucun modèle. Créez-en un pour commencer.</p>'}
      `,
      footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>',
      size: 'large'
    });
  },

  _addRecModele() {
    const chauffeurs = Store.get('chauffeurs') || [];
    const typeOptions = this._getDepTypeOptions();
    Modal.form(
      '<iconify-icon icon="solar:add-circle-bold" style="color:#22c55e;"></iconify-icon> Nouveau modèle de dépense',
      `<form id="form-rec-modele" class="modal-form">
        <div class="form-group"><label>Nom du modèle *</label><input type="text" name="nom" required placeholder="Ex: Carburant journalier"></div>
        <div class="form-group"><label>Chauffeur</label>
          <select name="chauffeurId"><option value="">Tous les chauffeurs planifiés</option>
            ${chauffeurs.filter(c => c.statut === 'actif').map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Type de dépense *</label>
          <div style="display:flex;gap:8px;align-items:center">
            <select name="typeDepense" required id="rec-type-select" style="flex:1">${typeOptions.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}</select>
            <button type="button" class="btn btn-sm" onclick="PlanningPage._addRecDepCategory()" style="padding:4px 10px;font-size:1.1rem;line-height:1" title="Ajouter une catégorie">+</button>
          </div></div>
        <div class="form-group"><label>Montant (FCFA) *</label><input type="number" name="montant" required min="1" placeholder="0"></div>
        <div class="form-group"><label>Récurrence *</label>
          <select name="recurrence" required id="rec-recurrence-select">
            <option value="par_shift">Par shift (1 dépense par créneau planifié)</option>
            <option value="quotidien">Quotidien (chaque jour de la semaine)</option>
            <option value="hebdo">Hebdomadaire</option>
            <option value="mensuel">Mensuel</option>
          </select></div>
        <div class="form-group" id="rec-jour-semaine" style="display:none"><label>Jour de la semaine</label>
          <select name="jourSemaine"><option value="0">Lundi</option><option value="1">Mardi</option><option value="2">Mercredi</option><option value="3">Jeudi</option><option value="4">Vendredi</option><option value="5">Samedi</option><option value="6">Dimanche</option></select></div>
        <div class="form-group" id="rec-jour-mois" style="display:none"><label>Jour du mois</label><input type="number" name="jourMois" min="1" max="31" value="1"></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-rec-modele'));
        if (!fd.get('nom') || !fd.get('montant')) { Toast.show('Nom et montant requis', 'error'); return; }
        Store.add('depenseRecurrentes', {
          id: 'REC-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
          nom: fd.get('nom'), chauffeurId: fd.get('chauffeurId') || null,
          typeDepense: fd.get('typeDepense'), montant: parseInt(fd.get('montant')),
          recurrence: fd.get('recurrence'),
          jourSemaine: fd.get('recurrence') === 'hebdo' ? parseInt(fd.get('jourSemaine')) : null,
          jourMois: fd.get('recurrence') === 'mensuel' ? parseInt(fd.get('jourMois')) : null,
          actif: true, dateCreation: new Date().toISOString()
        });
        Modal.close();
        Toast.show('Modèle créé', 'success');
        setTimeout(() => this._showDepRecurrentes(), 200);
      }
    );
    // Show/hide jour fields based on recurrence
    const recSelect = document.getElementById('rec-recurrence-select');
    if (recSelect) recSelect.addEventListener('change', () => {
      document.getElementById('rec-jour-semaine').style.display = recSelect.value === 'hebdo' ? '' : 'none';
      document.getElementById('rec-jour-mois').style.display = recSelect.value === 'mensuel' ? '' : 'none';
    });
  },

  _addRecDepCategory() {
    const name = prompt('Nom de la nouvelle catégorie :');
    if (!name || !name.trim()) return;
    const label = name.trim();
    const value = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
    if (this._getDepTypeOptions().some(t => t.value === value)) {
      Toast.show('Cette catégorie existe déjà', 'error'); return;
    }
    const customs = Store.get('depenseCategories') || [];
    customs.push({ value, label });
    Store.set('depenseCategories', customs);
    Toast.show(`Catégorie "${label}" ajoutée`, 'success');
    const sel = document.getElementById('rec-type-select');
    if (sel) {
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label; opt.selected = true;
      sel.appendChild(opt);
    }
  },

  _toggleRecModele(id, actif) {
    Store.update('depenseRecurrentes', id, { actif });
    Toast.show(actif ? 'Modèle activé' : 'Modèle désactivé', 'success');
  },

  _deleteRecModele(id) {
    if (!confirm('Supprimer ce modèle ?')) return;
    Store.delete('depenseRecurrentes', id);
    Toast.show('Modèle supprimé', 'success');
    setTimeout(() => this._showDepRecurrentes(), 200);
  },

  _generateExpenseGrid() {
    const modeles = (Store.get('depenseRecurrentes') || []).filter(m => m.actif);
    if (!modeles.length) { Toast.show('Aucun modèle actif', 'error'); return; }

    const planning = Store.get('planning') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];
    const depenses = Store.get('depenses') || [];
    const chMap = {};
    chauffeurs.forEach(c => { chMap[c.id] = c; });
    const vehMap = {};
    vehicules.forEach(v => { vehMap[v.id] = v.immatriculation || `${v.marque} ${v.modele}`; });

    // Get current week days
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this._currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push(this._dateStr(d));
    }

    // Shifts this week
    const weekShifts = planning.filter(s => days.includes(s.date));

    // Generate grid
    const grid = [];
    modeles.forEach(m => {
      if (m.recurrence === 'par_shift') {
        // One expense per shift
        const shifts = m.chauffeurId ? weekShifts.filter(s => s.chauffeurId === m.chauffeurId) : weekShifts;
        shifts.forEach(s => {
          const ch = chMap[s.chauffeurId];
          grid.push({
            date: s.date, chauffeurId: s.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : s.chauffeurId,
            vehiculeId: ch ? ch.vehiculeAssigne : null, typeDepense: m.typeDepense, montant: m.montant, modeleNom: m.nom
          });
        });
      } else if (m.recurrence === 'quotidien') {
        days.forEach(date => {
          if (m.chauffeurId) {
            const ch = chMap[m.chauffeurId];
            grid.push({ date, chauffeurId: m.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : m.chauffeurId,
              vehiculeId: ch ? ch.vehiculeAssigne : null, typeDepense: m.typeDepense, montant: m.montant, modeleNom: m.nom });
          } else {
            // For each chauffeur with a shift that day
            const dayShifts = weekShifts.filter(s => s.date === date);
            const seen = new Set();
            dayShifts.forEach(s => {
              if (seen.has(s.chauffeurId)) return;
              seen.add(s.chauffeurId);
              const ch = chMap[s.chauffeurId];
              grid.push({ date, chauffeurId: s.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : s.chauffeurId,
                vehiculeId: ch ? ch.vehiculeAssigne : null, typeDepense: m.typeDepense, montant: m.montant, modeleNom: m.nom });
            });
          }
        });
      } else if (m.recurrence === 'hebdo') {
        const targetDay = days[m.jourSemaine] || null;
        if (targetDay) {
          if (m.chauffeurId) {
            const ch = chMap[m.chauffeurId];
            grid.push({ date: targetDay, chauffeurId: m.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : m.chauffeurId,
              vehiculeId: ch ? ch.vehiculeAssigne : null, typeDepense: m.typeDepense, montant: m.montant, modeleNom: m.nom });
          } else {
            chauffeurs.filter(c => c.statut === 'actif').forEach(c => {
              grid.push({ date: targetDay, chauffeurId: c.id, chauffeurNom: `${c.prenom} ${c.nom}`,
                vehiculeId: c.vehiculeAssigne || null, typeDepense: m.typeDepense, montant: m.montant, modeleNom: m.nom });
            });
          }
        }
      } else if (m.recurrence === 'mensuel') {
        const targetDate = days.find(d => parseInt(d.split('-')[2]) === m.jourMois);
        if (targetDate) {
          if (m.chauffeurId) {
            const ch = chMap[m.chauffeurId];
            grid.push({ date: targetDate, chauffeurId: m.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : m.chauffeurId,
              vehiculeId: ch ? ch.vehiculeAssigne : null, typeDepense: m.typeDepense, montant: m.montant, modeleNom: m.nom });
          } else {
            chauffeurs.filter(c => c.statut === 'actif').forEach(c => {
              grid.push({ date: targetDate, chauffeurId: c.id, chauffeurNom: `${c.prenom} ${c.nom}`,
                vehiculeId: c.vehiculeAssigne || null, typeDepense: m.typeDepense, montant: m.montant, modeleNom: m.nom });
            });
          }
        }
      }
    });

    if (!grid.length) { Toast.show('Aucune dépense à générer pour cette semaine', 'error'); return; }

    // Mark duplicates
    grid.forEach(g => {
      g.exists = depenses.some(d => d.date === g.date && d.chauffeurId === g.chauffeurId && d.typeDepense === g.typeDepense && d.montant === g.montant);
      g.vehiculeLabel = g.vehiculeId ? (vehMap[g.vehiculeId] || g.vehiculeId) : '-';
    });

    // Show validation modal
    this._showGridValidation(grid, vehMap);
  },

  _showGridValidation(grid, vehMap) {
    const rows = grid.map((g, i) => `
      <tr id="grid-row-${i}" style="${g.exists ? 'opacity:0.5;' : ''}">
        <td>${Utils.formatDate(g.date)}</td>
        <td>${g.chauffeurNom}</td>
        <td>${g.vehiculeLabel}</td>
        <td>${this._getDepTypeLabel(g.typeDepense)}</td>
        <td style="font-weight:600">${Utils.formatCurrency(g.montant)}</td>
        <td style="font-size:var(--font-size-xs);color:var(--text-muted)">${g.modeleNom}</td>
        <td>
          ${g.exists
            ? '<span class="badge badge-secondary">Déjà enregistré</span>'
            : `<button class="btn-icon btn-danger" title="Retirer" onclick="document.getElementById('grid-row-${i}').remove()"><iconify-icon icon="solar:close-circle-bold"></iconify-icon></button>`
          }
        </td>
      </tr>
    `).join('');

    const newCount = grid.filter(g => !g.exists).length;
    const totalAmount = grid.filter(g => !g.exists).reduce((s, g) => s + g.montant, 0);

    Modal.open({
      title: '<iconify-icon icon="solar:calculator-bold-duotone" style="color:#22c55e;"></iconify-icon> Grille de dépenses à valider',
      body: `
        <div style="margin-bottom:1rem;display:flex;gap:1rem;flex-wrap:wrap">
          <span class="badge badge-success">${newCount} nouvelles</span>
          <span class="badge badge-secondary">${grid.filter(g => g.exists).length} déjà enregistrées</span>
          <span style="font-weight:600">Total : ${Utils.formatCurrency(totalAmount)}</span>
        </div>
        <div style="max-height:400px;overflow-y:auto" id="grid-validation-table">
          <table class="table" style="width:100%;font-size:var(--font-size-sm)">
            <thead><tr><th>Date</th><th>Chauffeur</th><th>Véhicule</th><th>Type</th><th>Montant</th><th>Modèle</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" data-action="cancel">Annuler</button>
        <button class="btn btn-success" id="btn-validate-grid"><iconify-icon icon="solar:check-circle-bold"></iconify-icon> Tout valider (${newCount})</button>
      `,
      size: 'large'
    });

    // Store grid data for validation
    this._pendingGrid = grid;

    const validateBtn = document.getElementById('btn-validate-grid');
    if (validateBtn) validateBtn.addEventListener('click', () => this._validateGrid());
  },

  _validateGrid() {
    if (!this._pendingGrid) return;
    const tableDiv = document.getElementById('grid-validation-table');
    const visibleRowIds = new Set();
    if (tableDiv) {
      tableDiv.querySelectorAll('tbody tr').forEach(tr => {
        const idx = parseInt(tr.id.replace('grid-row-', ''));
        if (!isNaN(idx)) visibleRowIds.add(idx);
      });
    }

    let count = 0;
    this._pendingGrid.forEach((g, i) => {
      if (g.exists) return;
      if (!visibleRowIds.has(i)) return; // Row was removed by user
      Store.add('depenses', {
        id: 'DEP-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        vehiculeId: g.vehiculeId || null, chauffeurId: g.chauffeurId || null,
        typeDepense: g.typeDepense, montant: g.montant, date: g.date,
        kilometrage: null, commentaire: `Auto: ${g.modeleNom}`,
        dateCreation: new Date().toISOString()
      });
      count++;
    });

    Modal.close();
    this._pendingGrid = null;
    Toast.show(`${count} dépense${count > 1 ? 's' : ''} enregistrée${count > 1 ? 's' : ''}`, 'success');
  },

  // =================== RECHARGE YANGO DEPUIS PLANNING ===================

  _yangoRechargeFromPlanning(chauffeurId) {
    const ch = Store.findById('chauffeurs', chauffeurId);
    if (!ch || !ch.yangoDriverId) {
      Toast.error('Ce chauffeur n\'est pas li\u00e9 \u00e0 Yango');
      return;
    }
    const nom = `${ch.prenom} ${ch.nom}`;

    const fields = [
      { type: 'heading', label: 'Recharger le compte Yango' },
      { type: 'html', html: `<div style="padding:10px 12px;border-radius:8px;background:rgba(252,76,2,0.08);border:1px solid rgba(252,76,2,0.25);margin-bottom:10px;font-size:var(--font-size-sm);">
        <div style="font-weight:600;color:#FC4C02;margin-bottom:2px;">${nom}</div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Yango ID : ${ch.yangoDriverId}</div>
        <div id="yango-balance-display" style="margin-top:6px;padding:6px 0 0 0;border-top:1px solid rgba(252,76,2,0.15);">
          <span style="color:var(--text-muted);font-size:var(--font-size-xs);">Solde actuel :</span>
          <span id="yango-balance-value" style="font-weight:700;font-size:var(--font-size-base);margin-left:6px;color:var(--text-muted);">Chargement...</span>
        </div>
      </div>` },
      { name: 'amount', label: 'Montant (FCFA)', type: 'number', required: true, min: 1, step: 100, placeholder: 'Ex: 5000' },
      { name: 'description', label: 'Description (optionnel)', type: 'text', placeholder: 'Raison de la recharge...' }
    ];

    Modal.form(
      '<iconify-icon icon="solar:card-transfer-bold-duotone" style="color:#FC4C02;"></iconify-icon> Recharger compte Yango',
      FormBuilder.build(fields),
      async () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);
        const amount = parseFloat(values.amount);

        if (!amount || amount <= 0) {
          Toast.error('Le montant doit être supérieur à 0');
          return;
        }

        const confirmBtn = document.querySelector('#modal-footer .btn-primary, #modal-footer .btn-success');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Envoi en cours...'; }

        try {
          const desc = values.description || `Recharge Yango — ${nom}`;
          const result = await Store.yangoRecharge(chauffeurId, amount, desc);

          // Enregistrer automatiquement comme dépense
          Store.add('depenses', {
            id: 'DEP-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
            vehiculeId: ch.vehiculeId || '',
            chauffeurId: chauffeurId,
            typeDepense: 'recharge_yango',
            montant: amount,
            date: new Date().toISOString().split('T')[0],
            commentaire: desc,
            dateCreation: new Date().toISOString()
          });

          Modal.close();
          Toast.success(result.message || `Recharge de ${Utils.formatCurrency(amount)} effectuée pour ${nom}`);
        } catch (e) {
          if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirmer'; }
          Toast.error(`Erreur : ${e.message}`);
        }
      }
    );

    // Charger le solde Yango de manière asynchrone
    Store.yangoBalance(chauffeurId).then(data => {
      const el = document.getElementById('yango-balance-value');
      if (el) {
        const bal = data.balance;
        const color = bal < 0 ? '#ef4444' : bal > 0 ? '#22c55e' : 'var(--text-primary)';
        el.style.color = color;
        el.textContent = Utils.formatCurrency(bal);
      }
    }).catch(() => {
      const el = document.getElementById('yango-balance-value');
      if (el) { el.textContent = 'Indisponible'; el.style.color = 'var(--text-muted)'; }
    });
  }
};
