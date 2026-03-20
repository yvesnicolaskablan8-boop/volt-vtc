/**
 * PlanningPage — Vue planning grille calendrier (style colonnes par jour)
 */
const PlanningPage = {
  _currentWeekStart: null,
  _container: null,

  // Nombre de créneaux horaires affichés par jour
  _SLOTS: [
    { id: 'early', label: '6h-8h', from: 6, to: 8 },
    { id: 'morning1', label: '8h-10h', from: 8, to: 10 },
    { id: 'morning2', label: '10h-12h', from: 10, to: 12 },
    { id: 'lunch', label: '12h-14h', from: 12, to: 14 },
    { id: 'afternoon1', label: '14h-16h', from: 14, to: 16 },
    { id: 'afternoon2', label: '16h-18h', from: 16, to: 18 },
    { id: 'evening1', label: '18h-20h', from: 18, to: 20 },
    { id: 'evening2', label: '20h-22h', from: 20, to: 22 },
    { id: 'night', label: '22h-0h', from: 22, to: 24 }
  ],

  render(container) {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    this._currentWeekStart = new Date(today.setDate(diff));
    this._currentWeekStart.setHours(0, 0, 0, 0);
    this._container = container;

    this._renderWeek();
  },

  async _renderWeek() {
    const container = this._container;
    const start = new Date(this._currentWeekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const fromStr = this._dateStr(start);
    const toStr = this._dateStr(end);

    const startDay = start.getDate();
    const endDay = end.getDate();
    const monthNames = ['jan.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];
    const weekLabel = 'Sem. du ' + startDay + ' au ' + endDay + ' ' + monthNames[end.getMonth()];

    container.innerHTML = `
      <div class="week-nav">
        <button id="plan-prev"><i class="fas fa-chevron-left"></i></button>
        <span class="week-label">${weekLabel}</span>
        <button id="plan-next"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div id="planning-grid">
        <div style="padding:16px 0">
          <div class="skeleton skeleton-card" style="height:300px"></div>
        </div>
      </div>
      <div id="planning-detail-area"></div>
      <div class="planning-legend">
        <div class="planning-legend-item"><div class="planning-legend-dot green"></div>Programme</div>
        <div class="planning-legend-item"><div class="planning-legend-dot gray"></div>Repos</div>
        <div class="planning-legend-item"><div class="planning-legend-dot red"></div>Absence</div>
      </div>
      <button class="planning-fab" id="plan-fab"><i class="fas fa-calendar-minus"></i></button>
    `;

    document.getElementById('plan-prev')?.addEventListener('click', () => this._prevWeek());
    document.getElementById('plan-next')?.addEventListener('click', () => this._nextWeek());
    document.getElementById('plan-fab')?.addEventListener('click', () => this._demanderAbsence());

    // Fetch data
    const [planning, absences] = await Promise.all([
      DriverStore.getPlanning(fromStr, toStr),
      DriverStore.getAbsences()
    ]);

    const planningMap = {};
    if (planning) planning.forEach(p => { planningMap[p.date] = p; });

    const absenceMap = {};
    if (absences) {
      absences.forEach(a => {
        const d1 = new Date(a.dateDebut);
        const d2 = new Date(a.dateFin);
        for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
          absenceMap[this._dateStr(d)] = a;
        }
      });
    }

    const todayStr = this._dateStr(new Date());
    const dayAbbrs = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];

    let gridHTML = '<div class="planning-grid">';

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dStr = this._dateStr(d);
      const isToday = dStr === todayStr;
      const p = planningMap[dStr];
      const absence = absenceMap[dStr];

      gridHTML += '<div class="planning-col ' + (isToday ? 'today' : '') + '" data-date="' + dStr + '">';
      gridHTML += '<div class="planning-col-header">';
      gridHTML += '<div class="planning-day-abbr">' + dayAbbrs[d.getDay()] + '</div>';
      gridHTML += '<div class="planning-day-num">' + d.getDate() + '</div>';
      gridHTML += '</div>';
      gridHTML += '<div class="planning-slots">';

      // Determine which slots are active
      const activeSlots = this._getActiveSlots(p, absence);

      for (let s = 0; s < this._SLOTS.length; s++) {
        const slotStatus = activeSlots[s];
        if (slotStatus === 'active') {
          gridHTML += '<div class="planning-slot active"><span class="slot-check"><i class="fas fa-check"></i></span></div>';
        } else if (slotStatus === 'absence') {
          gridHTML += '<div class="planning-slot absence"><span class="slot-icon"><i class="fas fa-times"></i></span></div>';
        } else if (slotStatus === 'repos') {
          gridHTML += '<div class="planning-slot repos"><span class="slot-icon"><i class="fas fa-moon"></i></span></div>';
        } else {
          gridHTML += '<div class="planning-slot empty"></div>';
        }
      }

      gridHTML += '</div></div>';
    }

    gridHTML += '</div>';

    document.getElementById('planning-grid').innerHTML = gridHTML;

    // Bind column clicks to show detail
    document.querySelectorAll('.planning-col').forEach(col => {
      col.addEventListener('click', () => {
        const date = col.dataset.date;
        this._showDetail(date, planningMap[date], absenceMap[date]);
      });
    });
  },

  /**
   * Returns array of 9 slot statuses based on planning/absence
   */
  _getActiveSlots(planning, absence) {
    const slots = new Array(this._SLOTS.length).fill('empty');

    if (absence) {
      const status = absence.type === 'repos' ? 'repos' : 'absence';
      slots.fill(status);
      return slots;
    }

    if (!planning) return slots;

    const type = planning.typeCreneaux;
    const heureDebut = planning.heureDebut ? parseInt(planning.heureDebut.split(':')[0]) : null;
    const heureFin = planning.heureFin ? parseInt(planning.heureFin.split(':')[0]) : null;

    for (let i = 0; i < this._SLOTS.length; i++) {
      const slot = this._SLOTS[i];

      if (type === 'journee') {
        // Full day: 6h-22h
        slots[i] = 'active';
      } else if (type === 'matin') {
        // Morning: 6h-14h
        if (slot.from >= 6 && slot.to <= 14) slots[i] = 'active';
      } else if (type === 'apres_midi') {
        // Afternoon: 12h-22h
        if (slot.from >= 12 && slot.to <= 24) slots[i] = 'active';
      } else if (type === 'nuit') {
        // Night: 20h-6h (show 20h-0h as active)
        if (slot.from >= 20) slots[i] = 'active';
      } else if (type === 'custom' && heureDebut !== null && heureFin !== null) {
        // Custom hours
        if (slot.from >= heureDebut && slot.to <= heureFin) slots[i] = 'active';
      } else {
        // Any other type with a planning entry = full day
        slots[i] = 'active';
      }
    }

    return slots;
  },

  _showDetail(dateStr, planning, absence) {
    const area = document.getElementById('planning-detail-area');
    if (!area) return;

    const d = new Date(dateStr + 'T00:00:00');
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const dayLabel = dayNames[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);

    const creneauLabels = {
      matin: 'Matin (6h-14h)',
      apres_midi: 'Apres-midi (12h-22h)',
      journee: 'Journee complete',
      nuit: 'Nuit (20h-6h)',
      custom: 'Personnalise'
    };

    let content = '';

    if (absence) {
      const typeLabels = { repos: 'Repos', conge: 'Conge', maladie: 'Maladie', formation: 'Formation', personnel: 'Personnel', suspension: 'Suspension' };
      content = `
        <div class="planning-detail-row">
          <span>Type</span>
          <span style="font-weight:600;color:#f87171">${typeLabels[absence.type] || absence.type}</span>
        </div>
        ${absence.motif ? '<div class="planning-detail-row"><span>Motif</span><span>' + this._esc(absence.motif) + '</span></div>' : ''}
      `;
    } else if (planning) {
      const crLabel = (planning.typeCreneaux === 'custom' && planning.heureDebut && planning.heureFin)
        ? planning.heureDebut + ' - ' + planning.heureFin
        : (creneauLabels[planning.typeCreneaux] || planning.typeCreneaux);
      content = `
        <div class="planning-detail-row">
          <span>Creneau</span>
          <span style="font-weight:600;color:#22c55e">${crLabel}</span>
        </div>
        ${planning.vehicule ? '<div class="planning-detail-row"><span>Vehicule</span><span>' + this._esc(planning.vehicule) + '</span></div>' : ''}
        ${planning.notes ? '<div class="planning-detail-row"><span>Notes</span><span>' + this._esc(planning.notes) + '</span></div>' : ''}
      `;
    } else {
      content = '<div class="planning-detail-row"><span>Aucun planning</span><span style="color:var(--text-muted)">Jour libre</span></div>';
    }

    area.innerHTML = `
      <div class="planning-detail">
        <div class="planning-detail-title">${dayLabel}</div>
        ${content}
      </div>
    `;
  },

  _prevWeek() {
    this._currentWeekStart.setDate(this._currentWeekStart.getDate() - 7);
    this._renderWeek();
  },

  _nextWeek() {
    this._currentWeekStart.setDate(this._currentWeekStart.getDate() + 7);
    this._renderWeek();
  },

  _dateStr(d) {
    return d.toISOString().split('T')[0];
  },

  _esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _demanderAbsence() {
    const formHTML = `
      <form class="driver-form" onsubmit="return false">
        <div class="form-group">
          <label>Type d'absence</label>
          <select name="type">
            <option value="repos">Repos</option>
            <option value="conge">Conge</option>
            <option value="maladie">Maladie</option>
            <option value="personnel">Personnel</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date de debut</label>
          <input type="date" name="dateDebut" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Date de fin</label>
          <input type="date" name="dateFin" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Motif (optionnel)</label>
          <textarea name="motif" rows="2" placeholder="Raison de l'absence..."></textarea>
        </div>
      </form>
    `;

    DriverModal.show('Demander une absence', formHTML, [
      { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
      { label: 'Envoyer', class: 'btn btn-primary', onclick: 'PlanningPage._submitAbsence()' }
    ]);
  },

  async _submitAbsence() {
    const values = DriverModal.getFormValues(['type', 'dateDebut', 'dateFin', 'motif']);
    if (!values.dateDebut || !values.dateFin) {
      DriverToast.show('Veuillez remplir les dates', 'error');
      return;
    }
    const result = await DriverStore.createAbsence(values);
    if (result && !result.error) {
      DriverModal.close();
      DriverToast.show('Demande d\'absence envoyee', 'success');
      this._renderWeek();
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  destroy() {
    const fab = document.querySelector('.planning-fab');
    if (fab) fab.remove();
  }
};
