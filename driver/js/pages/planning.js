/**
 * PlanningPage — Vue planning semaine pour le chauffeur
 */
const PlanningPage = {
  _currentWeekStart: null,

  render(container) {
    // Calculer le debut de la semaine (lundi)
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    this._currentWeekStart = new Date(today.setDate(diff));
    this._currentWeekStart.setHours(0, 0, 0, 0);

    this._renderWeek(container);
  },

  async _renderWeek(container) {
    const start = new Date(this._currentWeekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const fromStr = this._dateStr(start);
    const toStr = this._dateStr(end);

    // Week label
    const startDay = start.getDate();
    const endDay = end.getDate();
    const monthNames = ['jan.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];
    const weekLabel = `Sem. du ${startDay} au ${endDay} ${monthNames[end.getMonth()]}`;

    container.innerHTML = `
      <div class="week-nav">
        <button onclick="PlanningPage._prevWeek()"><i class="fas fa-chevron-left"></i></button>
        <span class="week-label">${weekLabel}</span>
        <button onclick="PlanningPage._nextWeek()"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div id="planning-days"><div class="loading"><i class="fas fa-spinner fa-spin"></i></div></div>
      <button class="fab blue" onclick="PlanningPage._demanderAbsence()" title="Demander une absence">
        <i class="fas fa-calendar-minus"></i>
      </button>
    `;

    // Fetch planning + absences
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
    const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const creneauLabels = {
      matin: 'Matin',
      apres_midi: 'Apres-midi',
      journee: 'Journee',
      nuit: 'Nuit'
    };

    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dStr = this._dateStr(d);
      const isToday = dStr === todayStr;
      const p = planningMap[dStr];
      const absence = absenceMap[dStr];

      let badgeHTML = '';
      if (absence) {
        const typeLabels = { repos: 'Repos', conge: 'Conge', maladie: 'Maladie', formation: 'Formation', personnel: 'Personnel', suspension: 'Suspension' };
        badgeHTML = `<span class="badge ${absence.type === 'repos' ? 'repos' : 'conge'}">${typeLabels[absence.type] || absence.type}</span>`;
      } else if (p) {
        badgeHTML = `<span class="badge ${p.typeCreneaux}">${creneauLabels[p.typeCreneaux] || p.typeCreneaux}</span>`;
      } else {
        badgeHTML = '<span class="badge neutral">--</span>';
      }

      html += `
        <div class="day-card ${isToday ? 'today' : ''}">
          <div class="day-info">
            <span class="day-name">${dayNames[d.getDay()]}</span>
            <span class="day-date">${d.getDate()}/${d.getMonth() + 1}</span>
            ${p && p.notes ? `<span class="day-notes">${p.notes}</span>` : ''}
          </div>
          ${badgeHTML}
        </div>
      `;
    }

    document.getElementById('planning-days').innerHTML = html;
  },

  _prevWeek() {
    this._currentWeekStart.setDate(this._currentWeekStart.getDate() - 7);
    this._renderWeek(document.getElementById('app-content'));
  },

  _nextWeek() {
    this._currentWeekStart.setDate(this._currentWeekStart.getDate() + 7);
    this._renderWeek(document.getElementById('app-content'));
  },

  _dateStr(d) {
    return d.toISOString().split('T')[0];
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
      this._renderWeek(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  destroy() {
    // Remove FAB
    const fab = document.querySelector('.fab');
    if (fab) fab.remove();
  }
};
