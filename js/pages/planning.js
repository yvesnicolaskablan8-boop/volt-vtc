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
        <h1><i class="fas fa-calendar-alt"></i> Planning Chauffeurs</h1>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-absence"><i class="fas fa-calendar-minus"></i> Déclarer une absence</button>
          <button class="btn btn-success" id="btn-add-shift"><i class="fas fa-calendar-plus"></i> Ajouter un créneau</button>
        </div>
      </div>

      <!-- Navigation & Filtres -->
      <div class="card" style="margin-bottom:var(--space-lg);padding:var(--space-md);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-sm);">
          <div style="display:flex;align-items:center;gap:var(--space-sm);">
            <button class="btn btn-sm btn-secondary" id="btn-prev"><i class="fas fa-chevron-left"></i></button>
            <h3 id="planning-period-label" style="margin:0;min-width:220px;text-align:center;font-size:var(--font-size-base);"></h3>
            <button class="btn btn-sm btn-secondary" id="btn-next"><i class="fas fa-chevron-right"></i></button>
            <button class="btn btn-sm btn-secondary" id="btn-today" style="margin-left:var(--space-sm);">Aujourd'hui</button>
          </div>
          <div class="tabs" id="planning-view-tabs" style="margin:0;">
            <div class="tab active" data-view="week"><i class="fas fa-calendar-week"></i> Semaine</div>
            <div class="tab" data-view="month"><i class="fas fa-calendar"></i> Mois</div>
            <div class="tab" data-view="stats"><i class="fas fa-chart-bar"></i> Statistiques</div>
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
    return { matin: 'M', apres_midi: 'AM', journee: 'J', nuit: 'N' }[type] || '?';
  },

  _shiftTypeColor(type) {
    return { matin: '#22c55e', apres_midi: '#3b82f6', journee: '#f59e0b', nuit: '#8b5cf6' }[type] || '#64748b';
  },

  // =================== VUE SEMAINE ===================

  _renderWeekView() {
    const chauffeurs = this._getChauffeurs().filter(c => c.statut !== 'inactif');
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
        <div class="kpi-card green">
          <div class="kpi-icon"><i class="fas fa-users"></i></div>
          <div class="kpi-value">${chauffeurs.length}</div>
          <div class="kpi-label">Chauffeurs actifs</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-icon"><i class="fas fa-calendar-check"></i></div>
          <div class="kpi-value">${filledSlots}</div>
          <div class="kpi-label">Créneaux planifiés</div>
        </div>
        <div class="kpi-card yellow">
          <div class="kpi-icon"><i class="fas fa-calendar-minus"></i></div>
          <div class="kpi-value">${uniqueAbsDrivers}</div>
          <div class="kpi-label">Chauffeurs absents</div>
        </div>
        <div class="kpi-card ${filledSlots / totalSlots >= 0.7 ? 'green' : 'red'}">
          <div class="kpi-icon"><i class="fas fa-percentage"></i></div>
          <div class="kpi-value">${totalSlots > 0 ? Math.round(filledSlots / totalSlots * 100) : 0}%</div>
          <div class="kpi-label">Taux de couverture</div>
        </div>
      </div>

      <!-- Légende -->
      <div class="card" style="margin-bottom:var(--space-md);padding:var(--space-sm) var(--space-md);">
        <div style="display:flex;gap:var(--space-md);flex-wrap:wrap;align-items:center;font-size:var(--font-size-xs);">
          <span style="font-weight:600;color:var(--text-secondary);">Créneaux :</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#22c55e;vertical-align:middle;"></span> Matin</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#3b82f6;vertical-align:middle;"></span> Après-midi</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#f59e0b;vertical-align:middle;"></span> Journée</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#8b5cf6;vertical-align:middle;"></span> Nuit</span>
          <span style="margin-left:var(--space-md);font-weight:600;color:var(--text-secondary);">Absences :</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#64748b;vertical-align:middle;"></span> Repos</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#ef4444;vertical-align:middle;"></span> Maladie</span>
          <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#3b82f6;vertical-align:middle;"></span> Congé</span>
        </div>
      </div>

      <!-- Grille planning -->
      <div class="card" style="padding:0;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:800px;">
          <thead>
            <tr style="background:var(--bg-tertiary);">
              <th style="padding:12px 16px;text-align:left;font-size:var(--font-size-sm);font-weight:600;color:var(--text-secondary);width:180px;border-bottom:2px solid var(--border-color);position:sticky;left:0;background:var(--bg-tertiary);z-index:1;">Chauffeur</th>
              ${days.map(d => `
                <th style="padding:12px 8px;text-align:center;font-size:var(--font-size-sm);border-bottom:2px solid var(--border-color);${this._isToday(d.date) ? 'background:var(--volt-blue-glow);color:var(--volt-blue);font-weight:700;' : 'color:var(--text-secondary);'}">
                  <div style="font-weight:600;">${this._getDayName(d.dayIdx)}</div>
                  <div style="font-size:var(--font-size-xs);${this._isToday(d.date) ? 'color:var(--volt-blue);' : 'color:var(--text-muted);'}">${d.obj.getDate()}/${d.obj.getMonth() + 1}</div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${chauffeurs.map(ch => `
              <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:10px 16px;position:sticky;left:0;background:var(--bg-secondary);z-index:1;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:${Utils.getAvatarColor(ch.id)};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#fff;flex-shrink:0;">${Utils.getInitials(ch.prenom, ch.nom)}</div>
                    <div>
                      <div style="font-size:var(--font-size-sm);font-weight:500;">${ch.prenom} ${ch.nom}</div>
                      <div style="font-size:10px;color:var(--text-muted);">${ch.vehiculeAssigne || 'Pas de véhicule'}</div>
                    </div>
                  </div>
                </td>
                ${days.map(d => {
                  const shifts = this._getDriverShiftsForDate(ch.id, d.date);
                  const absences = this._getDriverAbsencesForDate(ch.id, d.date);
                  const isToday = this._isToday(d.date);

                  if (absences.length > 0) {
                    const a = absences[0];
                    return `<td style="padding:4px;text-align:center;${isToday ? 'background:rgba(59,130,246,0.05);' : ''}">
                      <div style="background:${this._absenceTypeColor(a.type)}22;border:1px solid ${this._absenceTypeColor(a.type)}44;border-radius:6px;padding:6px 4px;cursor:pointer;" onclick="PlanningPage._viewAbsence('${a.id}')" title="${this._absenceTypeLabel(a.type)}${a.motif ? ': ' + a.motif : ''}">
                        <div style="font-size:10px;font-weight:600;color:${this._absenceTypeColor(a.type)};">${this._absenceTypeLabel(a.type)}</div>
                      </div>
                    </td>`;
                  }

                  if (shifts.length > 0) {
                    return `<td style="padding:4px;text-align:center;${isToday ? 'background:rgba(59,130,246,0.05);' : ''}">
                      ${shifts.map(s => `
                        <div style="background:${this._shiftTypeColor(s.typeCreneaux)}22;border:1px solid ${this._shiftTypeColor(s.typeCreneaux)}44;border-radius:6px;padding:6px 4px;margin-bottom:2px;cursor:pointer;" onclick="PlanningPage._editShift('${s.id}')" title="${this._shiftTypeLabel(s.typeCreneaux)}">
                          <div style="font-size:12px;font-weight:700;color:${this._shiftTypeColor(s.typeCreneaux)};">${this._shiftTypeShort(s.typeCreneaux)}</div>
                        </div>
                      `).join('')}
                    </td>`;
                  }

                  return `<td style="padding:4px;text-align:center;${isToday ? 'background:rgba(59,130,246,0.05);' : ''}">
                    <div class="planning-empty-cell" data-chauffeur="${ch.id}" data-date="${d.date}" style="border:1px dashed var(--border-color);border-radius:6px;padding:8px 4px;cursor:pointer;opacity:0.4;transition:all 0.2s;" onmouseenter="this.style.opacity='1';this.style.borderColor='var(--volt-blue)'" onmouseleave="this.style.opacity='0.4';this.style.borderColor='var(--border-color)'">
                      <i class="fas fa-plus" style="font-size:10px;color:var(--text-muted);"></i>
                    </div>
                  </td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
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

  // =================== VUE MOIS ===================

  _renderMonthView() {
    const chauffeurs = this._getChauffeurs().filter(c => c.statut !== 'inactif');
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
      <div class="card" style="padding:0;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:${daysInMonth * 36 + 180}px;">
          <thead>
            <tr style="background:var(--bg-tertiary);">
              <th style="padding:8px 12px;text-align:left;font-size:var(--font-size-xs);font-weight:600;color:var(--text-secondary);width:160px;border-bottom:2px solid var(--border-color);position:sticky;left:0;background:var(--bg-tertiary);z-index:1;">Chauffeur</th>
              ${dayHeaders.map(d => `
                <th style="padding:4px 2px;text-align:center;font-size:10px;border-bottom:2px solid var(--border-color);min-width:30px;
                  ${d.isToday ? 'background:var(--volt-blue-glow);color:var(--volt-blue);font-weight:700;' : d.isWeekend ? 'background:rgba(100,116,139,0.1);color:var(--text-muted);' : 'color:var(--text-secondary);'}">
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
                  <div style="display:flex;align-items:center;gap:6px;">
                    <div style="width:24px;height:24px;border-radius:50%;background:${Utils.getAvatarColor(ch.id)};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:#fff;">${Utils.getInitials(ch.prenom, ch.nom)}</div>
                    <span style="font-size:var(--font-size-xs);font-weight:500;">${ch.prenom} ${ch.nom.charAt(0)}.</span>
                  </div>
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
                      <div style="width:24px;height:24px;border-radius:4px;background:${this._shiftTypeColor(s.typeCreneaux)};margin:auto;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;cursor:pointer;" title="${this._shiftTypeLabel(s.typeCreneaux)}" onclick="PlanningPage._editShift('${s.id}')">
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
      const shiftTypes = { matin: 0, apres_midi: 0, journee: 0, nuit: 0 };
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
          shifts.forEach(s => { if (shiftTypes[s.typeCreneaux] !== undefined) shiftTypes[s.typeCreneaux]++; });
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
        <div class="card-header"><span class="card-title"><i class="fas fa-users"></i> Détail par chauffeur — ${Utils.getMonthName(month)} ${year}</span></div>
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
                      <div style="width:28px;height:28px;border-radius:50%;background:${Utils.getAvatarColor(st.chauffeur.id)};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;">${Utils.getInitials(st.chauffeur.prenom, st.chauffeur.nom)}</div>
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
          <div class="chart-header"><div class="chart-title"><i class="fas fa-chart-bar"></i> Jours travaillés par chauffeur</div></div>
          <div class="chart-container" style="height:300px;"><canvas id="chart-planning-worked"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-header"><div class="chart-title"><i class="fas fa-chart-pie"></i> Types d'absences (flotte)</div></div>
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
            borderColor: '#111827', borderWidth: 2,
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
      ctx2.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:var(--font-size-sm);"><i class="fas fa-info-circle" style="margin-right:8px;"></i> Aucune absence enregistrée ce mois</div>';
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
      { name: 'typeCreneaux', label: 'Créneau', type: 'select', required: true, options: [
        { value: 'matin', label: 'Matin (6h - 14h)' },
        { value: 'apres_midi', label: 'Après-midi (14h - 22h)' },
        { value: 'journee', label: 'Journée complète (8h - 20h)' },
        { value: 'nuit', label: 'Nuit (22h - 6h)' }
      ]},
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'Zone, client particulier, instructions...' }
    ];

    Modal.form('<i class="fas fa-calendar-plus text-success"></i> Ajouter un créneau', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      Store.add('planning', { id: Utils.generateId('PLN'), ...values, dateCreation: new Date().toISOString() });
      Modal.close();
      Toast.success('Créneau ajouté');
      this._renderView();
    });
  },

  _editShift(id) {
    const shift = Store.findById('planning', id);
    if (!shift) return;
    const chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif');
    const fields = [
      { type: 'row-start' },
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { type: 'row-end' },
      { name: 'typeCreneaux', label: 'Créneau', type: 'select', required: true, options: [
        { value: 'matin', label: 'Matin (6h - 14h)' },
        { value: 'apres_midi', label: 'Après-midi (14h - 22h)' },
        { value: 'journee', label: 'Journée complète (8h - 20h)' },
        { value: 'nuit', label: 'Nuit (22h - 6h)' }
      ]},
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ];

    Modal.form('<i class="fas fa-edit text-blue"></i> Modifier le créneau', FormBuilder.build(fields, shift), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      Store.update('planning', id, FormBuilder.getValues(body));
      Modal.close();
      Toast.success('Créneau modifié');
      this._renderView();
    }, 'Sauvegarder', () => {
      // Delete button in footer
    });

    // Add delete button
    setTimeout(() => {
      const footer = document.getElementById('modal-footer');
      if (footer) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.innerHTML = '<i class="fas fa-trash"></i> Supprimer';
        delBtn.style.marginRight = 'auto';
        delBtn.onclick = () => {
          Store.delete('planning', id);
          Modal.close();
          Toast.success('Créneau supprimé');
          this._renderView();
        };
        footer.insertBefore(delBtn, footer.firstChild);
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

    Modal.form('<i class="fas fa-calendar-minus text-danger"></i> Déclarer une absence', FormBuilder.build(fields), () => {
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
          <div style="width:48px;height:48px;border-radius:50%;background:${this._absenceTypeColor(a.type)};display:flex;align-items:center;justify-content:center;"><i class="fas fa-calendar-minus" style="color:#fff;font-size:18px;"></i></div>
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

    Modal.open(`<i class="fas fa-info-circle"></i> Détail absence`, content, `
      <button class="btn btn-danger" id="btn-delete-absence" style="margin-right:auto;"><i class="fas fa-trash"></i> Supprimer</button>
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
  }
};
