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
  _currentView: 'month',
  _currentWeekStart: null,
  _currentMonth: null,
  _filterChauffeurId: '',
  _filterSearch: '',
  _fltService: '',   // '' | 'jour' | 'nuit'
  _fltRole: '',      // '' | 'titulaire' | 'doublure'
  _showAbsences: true,
  _draggingShiftId: null,

  _retryTimer: null,

  render() {
    const now = new Date();
    // Set current week start to Monday
    const dayOfWeek = now.getDay();
    this._currentWeekStart = new Date(now);
    this._currentWeekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    this._currentWeekStart.setHours(0, 0, 0, 0);
    this._currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this._currentDay = new Date(now); this._currentDay.setHours(0, 0, 0, 0);

    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    this._bindEvents();
    this._renderView();
    this._maybeOuvrirAjout();
  },

  // Ouvre l'ajout de créneau pré-rempli si on arrive depuis « À AJOUTER » (dashboard)
  _maybeOuvrirAjout() {
    try {
      const raw = sessionStorage.getItem('pilote_planning_add');
      if (!raw) return;
      sessionStorage.removeItem('pilote_planning_add');
      const { chauffeurId, date, returnTo } = JSON.parse(raw);
      setTimeout(() => this._addShift(chauffeurId || '', date || '', returnTo || ''), 60);
    } catch (_) {}
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
  },

  _template() {
    return `
      <div style="max-width:100%;box-sizing:border-box;overflow:hidden;">
        <div class="page-header" style="flex-wrap:wrap;">
          <h1 style="font-size:clamp(1rem,4vw,1.5rem);"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Planning</h1>
          <div class="page-actions" style="flex-wrap:wrap;gap:6px;">
            <button class="btn btn-sm btn-primary" id="btn-add-absence"><iconify-icon icon="solar:calendar-minimalistic-bold-duotone"></iconify-icon> Absence</button>
            <button class="btn btn-sm btn-success" id="btn-add-shift"><iconify-icon icon="solar:calendar-add-bold-duotone"></iconify-icon> Créneau</button>
          </div>
        </div>

        <!-- Navigation & Filtres -->
        <div class="card planning-nav-card" style="margin-bottom:var(--space-lg);padding:var(--space-sm) var(--space-md);overflow:hidden;max-width:100%;box-sizing:border-box;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-sm);">
            <div style="display:flex;align-items:center;gap:6px;min-width:0;">
              <button class="btn btn-sm btn-secondary" id="btn-prev" style="padding:4px 8px;flex-shrink:0;"><iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon></button>
              <button class="btn btn-sm btn-secondary" id="btn-today" style="font-size:11px;padding:4px 8px;flex-shrink:0;">Auj.</button>
              <h3 id="planning-period-label" style="margin:0;text-align:center;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;"></h3>
              <button class="btn btn-sm btn-secondary" id="btn-next" style="padding:4px 8px;flex-shrink:0;"><iconify-icon icon="solar:alt-arrow-right-bold"></iconify-icon></button>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;">
              <div style="display:flex;align-items:center;gap:4px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:2px 6px;">
                <iconify-icon icon="solar:magnifer-bold-duotone" style="color:var(--pilote-blue);font-size:13px;flex-shrink:0;"></iconify-icon>
                <input type="text" id="filter-planning-search" class="form-control" placeholder="Nom..." value="${this._filterSearch}" style="width:80px;font-size:11px;padding:3px 4px;border:none;background:transparent;font-weight:500;min-width:0;">
              </div>
              <button id="flt-abs" class="tab ${this._showAbsences ? 'active' : ''}" style="padding:5px 10px;font-size:11px;" title="Afficher / masquer les absences"><iconify-icon icon="solar:moon-sleep-bold-duotone"></iconify-icon> Absences</button>
              <div class="tabs" id="planning-view-tabs" style="margin:0;flex-shrink:0;">
                <div class="tab ${this._currentView === 'month' ? 'active' : ''}" data-view="month" style="padding:6px 10px;font-size:12px;"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Mois</div>
                <div class="tab ${this._currentView === 'week' ? 'active' : ''}" data-view="week" style="padding:6px 10px;font-size:12px;"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> Sem.</div>
                <div class="tab ${this._currentView === 'day' ? 'active' : ''}" data-view="day" style="padding:6px 10px;font-size:12px;"><iconify-icon icon="solar:sun-2-bold-duotone"></iconify-icon> Jour</div>
                <div class="tab ${this._currentView === 'list' ? 'active' : ''}" data-view="list" style="padding:6px 10px;font-size:12px;"><iconify-icon icon="solar:list-bold-duotone"></iconify-icon> Liste</div>
                <div class="tab ${this._currentView === 'stats' ? 'active' : ''}" data-view="stats" style="padding:6px 10px;font-size:12px;"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Stats</div>
                <div class="tab ${this._currentView === 'gantt' ? 'active' : ''}" data-view="gantt" style="padding:6px 10px;font-size:12px;"><iconify-icon icon="solar:calendar-mark-bold-duotone"></iconify-icon> Gantt</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Contenu dynamique -->
        <div id="planning-content" style="max-width:100%;box-sizing:border-box;"></div>
      </div>
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
      this._currentDay = new Date(now); this._currentDay.setHours(0, 0, 0, 0);
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

    const fltA = document.getElementById('flt-abs');
    if (fltA) fltA.addEventListener('click', () => { this._showAbsences = !this._showAbsences; fltA.classList.toggle('active', this._showAbsences); this._renderView(); });

    document.getElementById('btn-add-absence').addEventListener('click', () => this._addAbsence());
    document.getElementById('btn-add-shift').addEventListener('click', () => this._addShift());
  },

  _navigate(dir) {
    if (this._currentView === 'month' || this._currentView === 'list') {
      this._currentMonth.setMonth(this._currentMonth.getMonth() + dir);
    } else if (this._currentView === 'day') {
      this._currentDay.setDate(this._currentDay.getDate() + dir);
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
    if (!label || !ct) return;

    try {
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
        case 'day':
          label.textContent = this._getDayLabel();
          ct.replaceChildren();
          ct.insertAdjacentHTML('beforeend', this._renderDayView());
          break;
        case 'list':
          label.textContent = `${Utils.getMonthName(this._currentMonth.getMonth())} ${this._currentMonth.getFullYear()}`;
          ct.replaceChildren();
          ct.insertAdjacentHTML('beforeend', this._renderListView());
          break;
        case 'stats':
          label.textContent = `${Utils.getMonthName(this._currentMonth.getMonth())} ${this._currentMonth.getFullYear()}`;
          ct.innerHTML = this._renderStatsView();
          this._loadStatsCharts();
          break;
        case 'gantt':
          label.textContent = 'Occupation des véhicules';
          ct.replaceChildren();
          if (typeof OccupationVehiculesPage !== 'undefined') OccupationVehiculesPage.renderInto(ct);
          else ct.insertAdjacentHTML('beforeend', '<div style="padding:30px;text-align:center;color:var(--text-muted);">Vue indisponible.</div>');
          break;
      }

      // Aucun chauffeur a afficher : trois situations tres differentes, qui
      // se traduisaient jusqu'ici par le meme spinner tournant sans fin.
      // Le message est un BANDEAU pose au-dessus de la vue : le calendrier
      // reste visible et navigable, meme vide.
      const chauffeurs = this._getChauffeurs();
      let avis = '';
      if (chauffeurs && chauffeurs.length) {
        this._essaisChargement = 0;
      } else if (!this._retryTimer) {
        const pret = (typeof Store.estPret === 'function') ? Store.estPret() : true;
        this._essaisChargement = (this._essaisChargement || 0) + 1;
        const cadre = (fond, bord, couleur, contenu) => `<div style="display:flex;align-items:center;gap:12px;padding:12px 15px;border-radius:11px;background:${fond};border:1px solid ${bord};color:${couleur};font-size:var(--font-size-sm);line-height:1.55;margin-bottom:14px;">${contenu}</div>`;

        if (!pret && this._essaisChargement <= 8) {
          // 1) Premier chargement en cours : on patiente, mais pas indefiniment
          //    (8 essais x 1,5 s = 12 s au maximum).
          avis = cadre('var(--bg-tertiary)', 'var(--border-color)', 'var(--text-secondary)',
            `<div class="spinner" style="width:18px;height:18px;border:2px solid var(--border-color);border-top-color:#5D87FF;border-radius:50%;animation:spin 1s linear infinite;flex:none;"></div>
             <span>Chargement des données...</span>
             <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`);
          this._retryTimer = setTimeout(() => { this._retryTimer = null; this._renderView(); }, 1500);
        } else if ((typeof Store.chargementReussi === 'function') && !Store.chargementReussi()) {
          // 2) La lecture a echoue : ce n'est pas un parc vide.
          avis = cadre('rgba(180,83,9,.08)', 'rgba(180,83,9,.25)', '#b45309',
            `<iconify-icon icon="solar:cloud-cross-bold-duotone" style="font-size:1.5rem;flex:none;"></iconify-icon>
             <div style="flex:1;"><strong>Données indisponibles</strong> — la base n'a pas répondu. Vos données ne sont pas perdues : l'application n'arrive pas à les lire pour le moment. Reconnectez-vous si le problème persiste, votre session a pu expirer.</div>
             <button class="btn btn-sm btn-primary" style="flex:none;" onclick="PlanningPage._reessayerChargement()">Réessayer</button>`);
        } else {
          // 3) Parc reellement vide : etat normal, pas une panne.
          avis = cadre('rgba(37,99,235,.07)', 'rgba(37,99,235,.2)', '#1d4ed8',
            `<iconify-icon icon="solar:users-group-rounded-bold-duotone" style="font-size:1.5rem;flex:none;"></iconify-icon>
             <div style="flex:1;"><strong>Aucun chauffeur enregistré</strong> — ajoutez vos titulaires et doublures, puis utilisez « Générer le mois » pour remplir ce calendrier automatiquement.</div>
             <button class="btn btn-sm btn-primary" style="flex:none;" onclick="PlanningPage._reessayerChargement()">Aller aux chauffeurs</button>`);
        }
      }
      // insertAdjacentHTML plutot qu'une reaffectation de innerHTML : cette
      // derniere reconstruirait la vue et supprimerait les ecouteurs deja poses.
      if (avis) ct.insertAdjacentHTML('afterbegin', avis);

    } catch (err) {
      console.error('[Planning] Render error:', err);
      ct.innerHTML = `<div class="card" style="padding:40px;text-align:center;">
        <iconify-icon icon="solar:danger-triangle-bold-duotone" style="font-size:3rem;color:#f59e0b;"></iconify-icon>
        <h3 style="margin:12px 0 8px;">Erreur d'affichage</h3>
        <p style="color:var(--text-muted);font-size:13px;">${err.message}</p>
        <button class="btn btn-primary" onclick="PlanningPage._renderView()" style="margin-top:12px;">Réessayer</button>
      </div>`;
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

  /** Relance un cycle de chargement, ou renvoie vers la creation de chauffeurs. */
  _reessayerChargement() {
    const echec = (typeof Store.chargementReussi === 'function') && !Store.chargementReussi();
    this._essaisChargement = 0;
    if (echec) { this._renderView(); if (typeof Store.initialize === 'function') Store.initialize(); }
    else if (typeof Router !== 'undefined') Router.navigate('/chauffeurs');
  },
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
    const labels = { matin: 'Matin (6h-14h)', apres_midi: 'Après-midi (14h-22h)', journee: 'Journée (6h - minuit)', nuit: 'Nuit (22h-6h)' };
    return labels[type] || type;
  },

  _shiftTypeShort(type) {
    return { matin: 'M', apres_midi: 'AM', journee: 'J', nuit: 'N', custom: 'P' }[type] || '?';
  },

  _shiftTypeColor(type) {
    return { matin: '#22c55e', apres_midi: '#3b82f6', journee: '#f59e0b', nuit: '#8b5cf6', custom: '#5D87FF' }[type] || '#64748b';
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
      return '#5D87FF';
    }
    return this._shiftTypeColor(shift.typeCreneaux);
  },

  // Mapping presets pour auto-remplir les heures
  _shiftPresets: {
    matin: ['06:00', '14:00'],
    apres_midi: ['14:00', '22:00'],
    journee: ['06:00', '00:00'],
    nuit: ['22:00', '06:00']
  },

  // =================== VUE SEMAINE ===================

  _isMobile() {
    return window.innerWidth <= 768;
  },

  _mobileSelectedDay: 0, // index 0-6 dans la semaine

  _renderWeekView() {
    let chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif' || c.statut === 'repos');
    if (this._filterSearch) {
      const q = this._filterSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      chauffeurs = chauffeurs.filter(c => {
        const fullName = (c.prenom + ' ' + c.nom).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return fullName.includes(q);
      });
    }
    const _vehList = Store.get('vehicules') || [];
    const vehMap = {};
    _vehList.forEach(v => { vehMap[v.id] = v.immatriculation || `${v.marque} ${v.modele}`; });
    const chPlaqueMap = {};
    _vehList.forEach(v => { if (v.chauffeurAssigne) chPlaqueMap[v.chauffeurAssigne] = v.immatriculation || `${v.marque} ${v.modele}`; });
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this._currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push({ date: this._dateStr(d), dayIdx: i, obj: d });
    }

    // Auto-select today on mobile
    if (this._isMobile()) {
      const todayStr = this._dateStr(new Date());
      const todayIdx = days.findIndex(d => d.date === todayStr);
      if (todayIdx >= 0 && this._mobileSelectedDay === 0) this._mobileSelectedDay = todayIdx;
    }

    const allShifts = this._getPlanning();
    const weekShifts = allShifts.filter(s => s.date >= days[0].date && s.date <= days[6].date);
    const todayStr = this._dateStr(new Date());
    const versements = Store.get('versements') || [];
    const totalSlots = chauffeurs.length * 7;
    const filledSlots = weekShifts.length;
    const absencesWeek = this._getAbsences().filter(a => a.dateFin >= days[0].date && a.dateDebut <= days[6].date);
    const uniqueAbsDrivers = [...new Set(absencesWeek.map(a => a.chauffeurId))].length;

    // Vue semaine en cartes calendrier (même style que la vue Mois)
    const chSet = new Set(chauffeurs.map(c => c.id));
    const chById = {};
    chauffeurs.forEach(c => { chById[c.id] = c; });
    const shiftsByDate = {};
    weekShifts.forEach(p => {
      if (p.chauffeurId && chSet.has(p.chauffeurId)) {
        (shiftsByDate[p.date] = shiftsByDate[p.date] || []).push(p);
      }
    });

    const MAX_CHIPS = 10;
    const dayNames = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

    // Couverture de la flotte : un véhicule à l'arrêt un jour = une recette perdue.
    const couv = this._couvertureSemaine(days);

    const renderDayCard = (d, i) => {
      const isToday = d.date === todayStr;
      const dayShifts = (shiftsByDate[d.date] || []).slice().sort((a, b) => (a.heureDebut || '').localeCompare(b.heureDebut || ''));
      const dayAbsences = chauffeurs.flatMap(ch => this._getDriverAbsencesForDate(ch.id, d.date).slice(0, 1));

      const chips = [];
      dayShifts.forEach(s => {
        const ch = chById[s.chauffeurId];
        if (!ch) return;
        if (!this._matchesShiftFilters(s)) return;
        chips.push(`<div class="pcal-chip" draggable="true" ondragstart="event.stopPropagation();PlanningPage._onDragShift(event,'${s.id}')" style="--c:${this._getShiftColor(s)};" title="${Utils.escHtml(ch.prenom + ' ' + ch.nom)} — ${this._getShiftTimeLabel(s)}" onclick="event.stopPropagation();PlanningPage._editShift('${s.id}')">
          <span class="pcal-chip-txt">${Utils.escHtml(ch.prenom.split(' ')[0])} ${Utils.escHtml(ch.nom.charAt(0))}.${this._serviceDuCreneau(s) === 'nuit' ? ' <span style="font-size:8.5px;font-weight:800;color:#e0e7ff;background:#312e81;border-radius:4px;padding:0 3px">NUIT</span>' : ''}${s.role === 'doublure' ? ' <span style="font-size:8.5px;font-weight:800;color:#b45309;background:#fef3c7;border-radius:4px;padding:0 3px">REMPL</span>' : ''} <span class="pcal-chip-time">${s.heureDebut || ''}${s.heureFin ? '–' + s.heureFin : ''}</span></span>
        </div>`);
      });
      dayAbsences.forEach(a => {
        if (!this._showAbsences) return;
        const ch = chById[a.chauffeurId];
        if (!ch) return;
        chips.push(`<div class="pcal-chip pcal-chip-abs" style="--c:${this._absenceTypeColor(a.type)};" title="${Utils.escHtml(ch.prenom + ' ' + ch.nom)} — ${this._absenceTypeLabel(a.type)}" onclick="event.stopPropagation();PlanningPage._viewAbsence('${a.id}')">
          <span class="pcal-chip-txt">${Utils.escHtml(ch.prenom.split(' ')[0])} ${Utils.escHtml(ch.nom.charAt(0))}. <em>(${this._absenceTypeLabel(a.type).toLowerCase()})</em></span>
        </div>`);
      });

      const visible = chips.slice(0, MAX_CHIPS);
      const overflow = chips.length - visible.length;
      const numHtml = isToday
        ? `<span class="pcal-num pcal-today">${d.obj.getDate()}</span>`
        : `<span class="pcal-num">${d.obj.getDate()}</span>`;

      return `<div class="pcal-cell pcal-cell-week${isToday ? ' pcal-cell-today' : ''}" onclick="PlanningPage._addShift('','${d.date}')" ondragover="PlanningPage._onCellDragOver(event)" ondrop="PlanningPage._onDropShift(event,'${d.date}')" title="Ajouter un créneau le ${Utils.formatDate(d.date)}">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          ${numHtml}
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--text-muted);">${dayNames[i]}</span>
        </div>
        <div class="pcal-chips">${visible.join('')}${overflow > 0 ? `<div class="pcal-more">+${overflow} autre${overflow > 1 ? 's' : ''}</div>` : ''}</div>
      </div>`;
    };

    return `
      ${this._pcalCss()}
      <style>
        .pcal-cell-week { min-height:240px; }
        .pcal-chip-time { font-weight:500; color:var(--text-muted); font-size:9.5px; }
      </style>
      ${this._renderServiceDuJour(chauffeurs, days)}
      <div class="card" style="margin-bottom:var(--space-md);padding:var(--space-sm) var(--space-md);display:flex;gap:var(--space-lg);flex-wrap:wrap;font-size:var(--font-size-xs);color:var(--text-secondary);">
        <span><strong>${filledSlots}</strong> créneau${filledSlots > 1 ? 'x' : ''} programmé${filledSlots > 1 ? 's' : ''}</span>
        <span><strong>${uniqueAbsDrivers}</strong> chauffeur${uniqueAbsDrivers > 1 ? 's' : ''} absent${uniqueAbsDrivers > 1 ? 's' : ''}</span>
        <span title="Journées d'exploitation assurées sur le total possible cette semaine">Couverture flotte : <strong style="color:${couv.pct >= 95 ? '#16a34a' : couv.pct >= 75 ? '#b45309' : '#b91c1c'}">${couv.couverts}/${couv.total} jours (${couv.pct}%)</strong>${couv.perte > 0 ? ` · <span style="color:#b91c1c" title="Recette non versée (location) ou CA non produit (salarié)">${Utils.formatCurrency(couv.perte)} non produits</span>` : ''}</span>
        <button class="btn btn-sm btn-secondary" id="btn-gen-mois" style="margin-left:auto;"><iconify-icon icon="solar:calendar-add-bold-duotone"></iconify-icon> Générer le mois</button>
        <button class="btn btn-sm btn-primary" id="btn-gen-semaine"><iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon> Compléter la semaine</button>
      </div>
      <div class="card pcal-wrap" style="padding:var(--space-md);">
        <div class="pcal">
          <div class="pcal-head">${days.map((d, i) => `<div>${dayNames[i]} ${d.obj.getDate()}</div>`).join('')}</div>
          <div class="pcal-grid">${days.map(renderDayCard).join('')}</div>
        </div>
      </div>
    `;
  },

  // =================== VUE MOBILE (grille compacte comme dashboard) ===================

  _renderMobileDayView(chauffeurs, days, vehMap, stats) {
    const avatarColors = ['#5D87FF','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'];

    // KPIs compact
    let html = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
        <div class="kpi-card" style="padding:10px 8px;text-align:center;">
          <div class="kpi-value" style="font-size:1.25rem;">${chauffeurs.length}</div>
          <div class="kpi-label" style="font-size:10px;">Actifs</div>
        </div>
        <div class="kpi-card blue" style="padding:10px 8px;text-align:center;">
          <div class="kpi-value" style="font-size:1.25rem;">${stats.filledSlots}</div>
          <div class="kpi-label" style="font-size:10px;">Planifiés</div>
        </div>
        <div class="kpi-card yellow" style="padding:10px 8px;text-align:center;">
          <div class="kpi-value" style="font-size:1.25rem;">${stats.uniqueAbsDrivers}</div>
          <div class="kpi-label" style="font-size:10px;">Absents</div>
        </div>
      </div>
    `;

    // Compact heatmap grid (same style as dashboard)
    html += `
      <style>
        .pm-grid-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; margin:0 -12px; padding:0 12px; }
        .pm-grid { display:grid; grid-template-columns:80px repeat(7,minmax(44px,1fr)); gap:3px; align-items:center; min-width:420px; }
        .pm-head { text-align:center; font-size:11px; font-weight:700; color:var(--text-muted); padding:8px 0 6px; text-transform:uppercase; }
        .pm-head.today { color:#5D87FF; background:rgba(99,102,241,.08); border-radius:8px 8px 0 0; border-bottom:2px solid #5D87FF; }
        .pm-head .pm-daynum { display:block; font-size:16px; font-weight:800; color:var(--text-primary); margin-top:2px; }
        .pm-head.today .pm-daynum { color:#5D87FF; }
        .pm-driver { display:flex; align-items:center; padding:4px 6px; margin:0 -6px; overflow:hidden;
          border-radius:7px; border:1px solid transparent; transition:background .12s, color .12s, border-color .12s; }
        .pm-driver:hover { background:var(--pilote-blue); border-color:var(--pilote-blue); }
        .pm-driver:hover .pm-driver-name, .pm-driver:hover .pm-driver-plaque { color:#fff !important; }
        .pm-driver-name { font-size:12px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3; }
        .pm-driver-plaque { font-size:9px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2; }
        .pm-cell { height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .15s; font-size:11px; font-weight:700; }
        .pm-cell:active { transform:scale(1.1); }
        .pm-shift { background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.1)); color:#5D87FF; }
        .pm-shift-m { background:linear-gradient(135deg,rgba(34,197,94,.15),rgba(34,197,94,.08)); color:#22c55e; }
        .pm-shift-am { background:linear-gradient(135deg,rgba(59,130,246,.15),rgba(59,130,246,.08)); color:#3b82f6; }
        .pm-shift-j { background:linear-gradient(135deg,rgba(245,158,11,.15),rgba(245,158,11,.08)); color:#f59e0b; }
        .pm-shift-n { background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(139,92,246,.08)); color:#8b5cf6; }
        .pm-absence { background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(249,115,22,.06)); color:#f97316; }
        .pm-absence-maladie { background:linear-gradient(135deg,rgba(239,68,68,.12),rgba(239,68,68,.06)); color:#ef4444; }
        .pm-absence-conge { background:linear-gradient(135deg,rgba(59,130,246,.12),rgba(59,130,246,.06)); color:#3b82f6; }
        .pm-suspendu { background:repeating-linear-gradient(135deg,transparent,transparent 2px,rgba(239,68,68,.06) 2px,rgba(239,68,68,.06) 4px); color:#ef4444; opacity:.5; }
        .pm-repos { background:rgba(0,0,0,.02); color:#d1d5db; }
        [data-theme="dark"] .pm-repos { background:rgba(255,255,255,.03); color:#4b5563; }
        .pm-empty { border:1px dashed var(--border-color); opacity:.3; }
        .pm-row-even .pm-driver, .pm-row-even .pm-cell { background:rgba(0,0,0,.01); }
        [data-theme="dark"] .pm-row-even .pm-driver, [data-theme="dark"] .pm-row-even .pm-cell { background:rgba(255,255,255,.02); }
      </style>

      <div class="card" style="padding:12px;border-radius:16px;">
        <div class="pm-grid-scroll">
        <div class="pm-grid">
          <div></div>
          ${days.map(d => `<div class="pm-head ${this._isToday(d.date) ? 'today' : ''}">
            <span>${this._getDayName(d.dayIdx)}</span>
            <span class="pm-daynum">${d.obj.getDate()}</span>
          </div>`).join('')}

          ${chauffeurs.map((ch, idx) => {
            const rowClass = idx % 2 === 1 ? ' pm-row-even' : '';
            const isSuspendu = ch.statut === 'suspendu';
            const isRepos = ch.statut === 'repos';
            const shortName = ch.prenom + ' ' + (ch.nom||'').charAt(0) + '.';
            const plaque1 = (ch.vehiculeAssigne ? (vehMap[ch.vehiculeAssigne] || '') : '') || chPlaqueMap[ch.id] || '';
            const hasRetardMobile = days.some(d => {
              if (d.date >= todayStr) return false;
              const sh = this._getDriverShiftsForDate(ch.id, d.date);
              if (sh.length === 0) return false;
              return !versements.some(v => v.chauffeurId === ch.id && v.date === d.date && (v.statut === 'valide' || v.statut === 'supprime' || v.statut === 'perte'));
            });
            const mNameStyle = hasRetardMobile ? 'color:#ef4444;' : '';

            let row = `<div class="pm-driver${rowClass}" title="${ch.prenom} ${ch.nom}${plaque1 ? ' — ' + plaque1 : ''}${hasRetardMobile ? ' — Versement(s) en retard' : ''}" style="${mNameStyle}"><span class="pm-driver-name">${shortName}</span>${plaque1 ? `<span class="pm-driver-plaque" style="${hasRetardMobile ? 'color:#ef4444;' : ''}">${plaque1}</span>` : ''}</div>`;

            row += days.map(d => {
              const shifts = this._getDriverShiftsForDate(ch.id, d.date);
              const absences = this._getDriverAbsencesForDate(ch.id, d.date);
              const onclick = `onclick="PlanningPage._addShift('${ch.id}','${d.date}')"`;

              if (isSuspendu) {
                return `<div class="pm-cell pm-suspendu${rowClass}"><iconify-icon icon="solar:forbidden-circle-bold" style="font-size:11px;"></iconify-icon></div>`;
              }
              if (absences.length > 0) {
                const a = absences[0];
                const cls = a.type === 'maladie' ? 'pm-absence-maladie' : a.type === 'conge' ? 'pm-absence-conge' : 'pm-absence';
                const label = { repos:'R', conge:'C', maladie:'M', formation:'F', personnel:'P', suspension:'S' }[a.type] || 'A';
                return `<div class="pm-cell ${cls}${rowClass}" onclick="PlanningPage._viewAbsence('${a.id}')">${label}</div>`;
              }
              if (shifts.length > 0) {
                const s = shifts[0];
                const typeClass = { matin:'pm-shift-m', apres_midi:'pm-shift-am', journee:'pm-shift-j', nuit:'pm-shift-n' }[s.typeCreneaux] || 'pm-shift';
                const isPast = d.date < todayStr;
                const hasVersement = isPast && versements.some(v => v.chauffeurId === ch.id && v.date === d.date && (v.statut === 'valide' || v.statut === 'supprime' || v.statut === 'perte'));
                return `<div class="pm-cell ${typeClass}${rowClass}" onclick="PlanningPage._editShift('${s.id}')">${this._getShiftTimeShort(s)}</div>`;
              }
              if (isRepos) {
                return `<div class="pm-cell pm-repos${rowClass}" ${onclick} style="cursor:pointer;"><iconify-icon icon="solar:moon-sleep-bold" style="font-size:11px;"></iconify-icon></div>`;
              }
              return `<div class="pm-cell pm-empty${rowClass}" ${onclick}></div>`;
            }).join('');

            return row;
          }).join('')}
        </div>
        </div>

        <!-- Légende compact -->
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center;">
          <div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#22c55e;"><span style="width:7px;height:7px;border-radius:50%;background:#22c55e;"></span>Mat</div>
          <div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#3b82f6;"><span style="width:7px;height:7px;border-radius:50%;background:#3b82f6;"></span>AM</div>
          <div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#f59e0b;"><span style="width:7px;height:7px;border-radius:50%;background:#f59e0b;"></span>Jour</div>
          <div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#8b5cf6;"><span style="width:7px;height:7px;border-radius:50%;background:#8b5cf6;"></span>Nuit</div>
          <div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#f97316;"><span style="width:7px;height:7px;border-radius:50%;background:#f97316;"></span>Abs</div>
          <div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#ef4444;"><span style="width:7px;height:7px;border-radius:50%;background:#ef4444;"></span>Mal</div>
          <div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#94a3b8;"><span style="width:7px;height:7px;border-radius:50%;background:#d1d5db;"></span>Repos</div>
          <div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#ef4444;"><iconify-icon icon="solar:danger-triangle-bold" style="font-size:10px;"></iconify-icon>Retard</div>
        </div>
      </div>
    `;
    return html;
  },

  // =================== VUE DESKTOP (grille 7 jours) ===================

  _getShiftDuration(shift) {
    if (shift.heureDebut && shift.heureFin) {
      const [hd, md] = shift.heureDebut.split(':').map(Number);
      const [hf, mf] = shift.heureFin.split(':').map(Number);
      let diff = (hf * 60 + mf) - (hd * 60 + md);
      if (diff <= 0) diff += 24 * 60;
      return Math.round(diff / 60) + 'h';
    }
    return { matin: '8h', apres_midi: '8h', journee: '12h', nuit: '8h' }[shift.typeCreneaux] || '';
  },

  _getShiftTimeFull(shift) {
    if (shift.heureDebut && shift.heureFin) {
      return `${shift.heureDebut} - ${shift.heureFin}`;
    }
    const presets = { matin: '06:00 - 14:00', apres_midi: '14:00 - 22:00', journee: '06:00 - 00:00', nuit: '22:00 - 06:00' };
    return presets[shift.typeCreneaux] || '';
  },

  _renderDesktopGridView(chauffeurs, days, vehMap, stats, todayStr, versements) {
    const avatarColors = ['#5D87FF','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'];

    return `
      <style>
        .pg-grid { display:grid; grid-template-columns:minmax(180px,auto) repeat(7,1fr); gap:2px 0; align-items:center; }
        .pg-head {
          text-align:center; font-size:11px; font-weight:700; color:#9ca3af; padding:8px 0 6px;
          text-transform:uppercase; letter-spacing:.8px;
          border-bottom:2px solid transparent;
        }
        .pg-head.today {
          color:#b45309;
          background:linear-gradient(180deg, rgba(251,191,36,.2) 0%, rgba(251,191,36,.08) 100%);
          border-radius:12px 12px 0 0;
          border-bottom:3px solid #f59e0b;
        }
        .pg-head .pg-daynum { display:block; font-size:18px; font-weight:800; color:var(--text-primary); margin-top:2px; }
        .pg-head.today .pg-daynum { color:#d97706; }
        [data-theme="dark"] .pg-head { color:#6b7280; }
        [data-theme="dark"] .pg-head.today { background:linear-gradient(180deg, rgba(251,191,36,.25) 0%, rgba(251,191,36,.1) 100%); }
        [data-theme="dark"] .pg-head .pg-daynum { color:#d1d5db; }
        [data-theme="dark"] .pg-head.today .pg-daynum { color:#fbbf24; }

        .pg-driver {
          display:flex; align-items:center; gap:10px; font-size:13px; font-weight:600; color:var(--text-primary);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:4px 0;
          text-decoration:none; cursor:pointer;
        }
        .pg-driver { border-radius:7px; padding:2px 5px; margin:0 -5px; border:1px solid transparent;
          transition:background .12s, color .12s, border-color .12s; }
        .pg-driver:hover { background:var(--pilote-blue); color:#fff !important; border-color:var(--pilote-blue);
          box-shadow:0 2px 8px rgba(79,70,229,.35); }
        .pg-driver:hover * { color:#fff !important; }
        [data-theme="dark"] .pg-driver { color:#d1d5db; }
        .pg-avatar {
          width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          font-size:10px; font-weight:700; color:#fff; flex-shrink:0;
          box-shadow:0 2px 6px rgba(0,0,0,.15); border:2px solid rgba(255,255,255,.8);
          object-fit:cover;
        }
        [data-theme="dark"] .pg-avatar { border-color:rgba(255,255,255,.15); }
        .pg-row-even .pg-driver, .pg-row-even .pg-cell { background:rgba(0,0,0,.015); border-radius:8px; }
        [data-theme="dark"] .pg-row-even .pg-driver, [data-theme="dark"] .pg-row-even .pg-cell { background:rgba(255,255,255,.02); }

        .pg-cell {
          height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center;
          font-size:12px; cursor:pointer; transition:all .2s cubic-bezier(.16,1,.3,1);
          position:relative; margin:0 2px;
        }
        .pg-cell:hover { transform:scale(1.06); box-shadow:0 4px 12px rgba(0,0,0,.1); z-index:2; }

        /* Shift colors — gradient like dashboard */
        .pg-shift-matin { background:linear-gradient(135deg,rgba(34,197,94,.18),rgba(74,222,128,.1)); color:#22c55e; }
        .pg-shift-am { background:linear-gradient(135deg,rgba(59,130,246,.18),rgba(96,165,250,.1)); color:#3b82f6; }
        .pg-shift-journee { background:linear-gradient(135deg,rgba(245,158,11,.18),rgba(251,191,36,.1)); color:#f59e0b; }
        .pg-shift-nuit { background:linear-gradient(135deg,rgba(139,92,246,.18),rgba(167,139,250,.1)); color:#8b5cf6; }
        .pg-shift-custom { background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.1)); color:#5D87FF; }

        .pg-shift-matin:hover { background:linear-gradient(135deg,rgba(34,197,94,.28),rgba(74,222,128,.18)); }
        .pg-shift-am:hover { background:linear-gradient(135deg,rgba(59,130,246,.28),rgba(96,165,250,.18)); }
        .pg-shift-journee:hover { background:linear-gradient(135deg,rgba(245,158,11,.28),rgba(251,191,36,.18)); }
        .pg-shift-nuit:hover { background:linear-gradient(135deg,rgba(139,92,246,.28),rgba(167,139,250,.18)); }
        .pg-shift-custom:hover { background:linear-gradient(135deg,rgba(99,102,241,.25),rgba(139,92,246,.18)); }

        [data-theme="dark"] .pg-shift-matin { background:linear-gradient(135deg,rgba(34,197,94,.22),rgba(74,222,128,.15)); }
        [data-theme="dark"] .pg-shift-am { background:linear-gradient(135deg,rgba(59,130,246,.22),rgba(96,165,250,.15)); }
        [data-theme="dark"] .pg-shift-journee { background:linear-gradient(135deg,rgba(245,158,11,.22),rgba(251,191,36,.15)); }
        [data-theme="dark"] .pg-shift-nuit { background:linear-gradient(135deg,rgba(139,92,246,.22),rgba(167,139,250,.15)); }
        [data-theme="dark"] .pg-shift-custom { background:linear-gradient(135deg,rgba(99,102,241,.22),rgba(139,92,246,.15)); }

        /* Absence */
        .pg-absence { background:linear-gradient(135deg,rgba(249,115,22,.15),rgba(251,146,60,.08)); color:#f97316; }
        .pg-absence:hover { background:linear-gradient(135deg,rgba(249,115,22,.25),rgba(251,146,60,.15)); }
        .pg-absence-maladie { background:linear-gradient(135deg,rgba(239,68,68,.18),rgba(248,113,113,.1)); color:#ef4444; }
        .pg-absence-maladie:hover { background:linear-gradient(135deg,rgba(239,68,68,.28),rgba(248,113,113,.2)); }
        .pg-absence-conge { background:linear-gradient(135deg,rgba(59,130,246,.15),rgba(96,165,250,.08)); color:#3b82f6; }
        .pg-absence-conge:hover { background:linear-gradient(135deg,rgba(59,130,246,.25),rgba(96,165,250,.15)); }

        /* Repos */
        .pg-repos { background:rgba(0,0,0,.025); color:#d1d5db; }
        [data-theme="dark"] .pg-repos { background:rgba(255,255,255,.03); color:#4b5563; }

        /* Suspendu */
        .pg-suspendu { background:linear-gradient(135deg,rgba(239,68,68,.1),rgba(248,113,113,.05)); color:#ef4444; }

        /* Empty */
        .pg-empty { background:rgba(0,0,0,.015); }
        .pg-empty:hover { background:rgba(99,102,241,.06); }
        [data-theme="dark"] .pg-empty { background:rgba(255,255,255,.02); }
        [data-theme="dark"] .pg-empty:hover { background:rgba(99,102,241,.08); }

        /* Today column highlight — bande ambre continue */
        .pg-today-col { background-color:rgba(251,191,36,.15); }
        .pg-cell.pg-today-col { background-color:rgba(251,191,36,.13); border-radius:0; margin:0; }
        .pg-cell.pg-today-col.pg-empty { background:rgba(251,191,36,.18); border-radius:0; }
        .pg-cell.pg-today-col.pg-repos { background:rgba(251,191,36,.12); border-radius:0; }
        .pg-head.today { border-radius:12px 12px 0 0; }
        [data-theme="dark"] .pg-today-col { background-color:rgba(251,191,36,.18); }
        [data-theme="dark"] .pg-cell.pg-today-col { background-color:rgba(251,191,36,.15); }
        [data-theme="dark"] .pg-cell.pg-today-col.pg-empty { background:rgba(251,191,36,.22); }
        [data-theme="dark"] .pg-cell.pg-today-col.pg-repos { background:rgba(251,191,36,.15); }

        .pg-cell-text { font-size:11px; font-weight:700; letter-spacing:-.2px; text-align:center; line-height:1.3; }

        @media(max-width:1200px) {
          .pg-grid { grid-template-columns:minmax(120px,auto) repeat(7,1fr); gap:2px 0; }
          .pg-cell { height:36px; border-radius:8px; }
          .pg-cell-text { font-size:10px; }
          .pg-driver { font-size:11px; }
          .pg-avatar { width:26px; height:26px; font-size:9px; }
        }
        @media(max-width:768px) {
          .pg-card { padding:12px 10px !important; }
          .pg-grid { grid-template-columns:70px repeat(7,1fr); gap:2px 0; min-width:420px; }
          .pg-head { font-size:10px; padding:6px 0 4px; letter-spacing:.3px; }
          .pg-head .pg-daynum { font-size:15px; margin-top:1px; }
          .pg-cell { height:30px; border-radius:7px; }
          .pg-cell-text { font-size:9px; }
          .pg-cell:hover { transform:none; box-shadow:none; }
          .pg-cell:active { transform:scale(1.08); }
          .pg-driver { font-size:11px; gap:0; padding:2px 0; }
          .pg-driver .pg-avatar { display:none; }
          .pg-driver span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; max-width:68px; }
          .pg-header-icon { width:30px !important; height:30px !important; border-radius:8px !important; }
          .pg-header-icon iconify-icon { font-size:14px !important; }
          .pg-header-title { font-size:13px !important; }
          .pg-header-sub { font-size:10px !important; }
        }
      </style>

      <!-- Header card -->
      <div class="card pg-card" style="padding:24px 20px;border-radius:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="pg-header-icon" style="width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#5D87FF,#4570EA);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(99,102,241,.25);">
              <iconify-icon icon="solar:calendar-bold-duotone" style="font-size:18px;color:#fff;"></iconify-icon>
            </div>
            <div>
              <div class="pg-header-title" style="font-size:15px;font-weight:800;color:var(--text-primary);letter-spacing:-.3px;">Planning semaine</div>
              <div class="pg-header-sub" style="font-size:11px;color:#9ca3af;font-weight:500;margin-top:1px;">${chauffeurs.length} chauffeur${chauffeurs.length > 1 ? 's' : ''} actif${chauffeurs.length > 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>

        <div class="pg-grid" style="animation:dSlide .5s cubic-bezier(.16,1,.3,1);">
          <div></div>
          ${days.map(d => `
            <div class="pg-head ${this._isToday(d.date) ? 'today' : ''}">
              <span>${this._getDayName(d.dayIdx).toUpperCase()}</span>
              <span class="pg-daynum">${d.obj.getDate()}</span>
            </div>
          `).join('')}

          ${chauffeurs.map((ch, idx) => {
            const color = avatarColors[idx % avatarColors.length];
            const rowClass = idx % 2 === 1 ? ' pg-row-even' : '';
            const initials = ((ch.prenom||'')[0] + (ch.nom||'')[0]).toUpperCase();
            const avatarHtml = ch.photo
              ? `<img src="${ch.photo}" alt="${initials}" class="pg-avatar" style="object-fit:cover;">`
              : `<div class="pg-avatar" style="background:linear-gradient(135deg,${color},${color}dd);">${initials}</div>`;
            const isSuspendu = ch.statut === 'suspendu';
            const isStatutRepos = ch.statut === 'repos';
            const statutBadge = isSuspendu
              ? ' <span style="font-size:9px;padding:1px 5px;border-radius:6px;background:rgba(239,68,68,.1);color:#ef4444;font-weight:600;">Susp.</span>'
              : isStatutRepos
                ? ' <span style="font-size:9px;padding:1px 5px;border-radius:6px;background:rgba(100,116,139,.1);color:#64748b;font-weight:600;">Repos</span>'
                : '';

            // Vérifier si le chauffeur a au moins un retard de versement cette semaine
            const hasRetard = days.some(d => {
              if (d.date >= todayStr) return false;
              const sh = this._getDriverShiftsForDate(ch.id, d.date);
              if (sh.length === 0) return false;
              return !versements.some(v => v.chauffeurId === ch.id && v.date === d.date && (v.statut === 'valide' || v.statut === 'supprime' || v.statut === 'perte'));
            });
            const nameColor = hasRetard ? 'color:#ef4444;' : '';

            const plaque2 = (ch.vehiculeAssigne ? (vehMap[ch.vehiculeAssigne] || '') : '') || chPlaqueMap[ch.id] || '';
            let html = `<a href="#/chauffeurs/${ch.id}" class="pg-driver${rowClass}" title="${ch.prenom} ${ch.nom}${plaque2 ? ' — ' + plaque2 : ''}${hasRetard ? ' — Versement(s) en retard' : ''}" style="${isSuspendu ? 'opacity:.5;' : ''}${nameColor}animation:dSlide .4s cubic-bezier(.16,1,.3,1) ${idx * 30}ms both;">
              ${avatarHtml}<div style="display:flex;flex-direction:column;line-height:1.2;"><span>${ch.prenom} ${ch.nom}${statutBadge}</span>${plaque2 ? `<span style="font-size:9px;color:${hasRetard ? '#ef4444' : 'var(--text-muted)'};font-weight:400;">${plaque2}</span>` : ''}</div>
            </a>`;

            html += days.map((d, ci) => {
              const shifts = this._getDriverShiftsForDate(ch.id, d.date);
              const absences = this._getDriverAbsencesForDate(ch.id, d.date);
              const anim = `animation:dSlide .4s cubic-bezier(.16,1,.3,1) ${idx * 30 + ci * 15}ms both;`;
              const todayCol = this._isToday(d.date) ? ' pg-today-col' : '';

              if (isSuspendu) {
                return `<div class="pg-cell pg-suspendu${rowClass}${todayCol}" style="${anim}" title="Suspendu">
                  <iconify-icon icon="solar:forbidden-circle-bold" style="font-size:13px;"></iconify-icon>
                </div>`;
              }

              if (absences.length > 0) {
                const a = absences[0];
                const absCls = a.type === 'maladie' ? 'pg-absence-maladie' : a.type === 'conge' ? 'pg-absence-conge' : 'pg-absence';
                return `<div class="pg-cell ${absCls}${rowClass}${todayCol}" style="${anim}" title="${this._absenceTypeLabel(a.type)}" onclick="PlanningPage._viewAbsence('${a.id}')">
                  <span class="pg-cell-text">${this._absenceTypeLabel(a.type)}</span>
                </div>`;
              }

              if (shifts.length > 0) {
                const s = shifts[0];
                const typeClass = { matin:'pg-shift-matin', apres_midi:'pg-shift-am', journee:'pg-shift-journee', nuit:'pg-shift-nuit' }[s.typeCreneaux] || 'pg-shift-custom';
                const timeShort = this._getShiftTimeShort(s);
                const isPast = d.date < todayStr;
                const hasVersement = isPast && versements.some(v => v.chauffeurId === ch.id && v.date === d.date && (v.statut === 'valide' || v.statut === 'supprime' || v.statut === 'perte'));
                return `<div class="pg-cell ${typeClass}${rowClass}${todayCol}" draggable="true" ondragstart="PlanningPage._onDragStart(event, '${s.id}')" style="${anim}" title="${this._getShiftTimeFull(s)} (${this._getShiftDuration(s)})${isPast && !hasVersement ? ' — Versement en retard' : ''}" onclick="PlanningPage._editShift('${s.id}')">
                  <span class="pg-cell-text">${timeShort}</span>
                </div>`;
              }

              if (isStatutRepos) {
                return `<div class="pg-cell pg-repos${rowClass}${todayCol} planning-empty-cell" data-chauffeur="${ch.id}" data-date="${d.date}" style="${anim}" ondragover="PlanningPage._onDragOver(event)" ondrop="PlanningPage._onDrop(event, '${ch.id}', '${d.date}')">
                  <iconify-icon icon="solar:moon-sleep-bold-duotone" style="font-size:13px;"></iconify-icon>
                </div>`;
              }

              return `<div class="pg-cell pg-empty${rowClass}${todayCol} planning-empty-cell" data-chauffeur="${ch.id}" data-date="${d.date}" style="${anim}" ondragover="PlanningPage._onDragOver(event)" ondrop="PlanningPage._onDrop(event, '${ch.id}', '${d.date}')"></div>`;
            }).join('');
            return html;
          }).join('')}
        </div>

        <!-- Légende -->
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;justify-content:center;">
          <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(34,197,94,.08);font-size:11px;font-weight:600;color:#22c55e;"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span> Matin</div>
          <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(59,130,246,.08);font-size:11px;font-weight:600;color:#3b82f6;"><span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;"></span> AM</div>
          <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(245,158,11,.08);font-size:11px;font-weight:600;color:#f59e0b;"><span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;"></span> Journée</div>
          <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(139,92,246,.08);font-size:11px;font-weight:600;color:#8b5cf6;"><span style="width:6px;height:6px;border-radius:50%;background:#8b5cf6;"></span> Nuit</div>
          <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(99,102,241,.08);font-size:11px;font-weight:600;color:#5D87FF;"><span style="width:6px;height:6px;border-radius:50%;background:#5D87FF;"></span> Perso.</div>
          <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(249,115,22,.08);font-size:11px;font-weight:600;color:#f97316;"><span style="width:6px;height:6px;border-radius:50%;background:#f97316;"></span> Absent</div>
          <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(0,0,0,.03);font-size:11px;font-weight:600;color:#9ca3af;"><span style="width:6px;height:6px;border-radius:50%;background:#d1d5db;"></span> Repos</div>
          <div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:rgba(239,68,68,.08);font-size:11px;font-weight:600;color:#ef4444;"><iconify-icon icon="solar:danger-triangle-bold" style="font-size:10px;"></iconify-icon> En retard</div>
        </div>
      </div>
    `;
  },

  _bindWeekEvents() {
    const genBtn = document.getElementById('btn-gen-semaine');
    if (genBtn) genBtn.addEventListener('click', () => this._genererSemaine());
    const genMois = document.getElementById('btn-gen-mois');
    if (genMois) genMois.addEventListener('click', () => this._genererMois());
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
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
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
    let chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif' || c.statut === 'repos');
    if (this._filterSearch) {
      const q = this._filterSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      chauffeurs = chauffeurs.filter(c => {
        const fullName = (c.prenom + ' ' + c.nom).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return fullName.includes(q);
      });
    }
    const _vehList3 = Store.get('vehicules') || [];
    const vehMap = {};
    _vehList3.forEach(v => { vehMap[v.id] = v.immatriculation || `${v.marque} ${v.modele}`; });
    const chPlaqueMap = {};
    _vehList3.forEach(v => { if (v.chauffeurAssigne) chPlaqueMap[v.chauffeurAssigne] = v.immatriculation || `${v.marque} ${v.modele}`; });
    const year = this._currentMonth.getFullYear();
    const month = this._currentMonth.getMonth();
    const chSet = new Set(chauffeurs.map(c => c.id));
    const chById = {};
    chauffeurs.forEach(c => { chById[c.id] = c; });

    // Grille calendrier : du lundi précédant le 1er au dimanche suivant la fin du mois
    const firstOfMonth = new Date(year, month, 1);
    const gridStart = new Date(firstOfMonth);
    const fdow = firstOfMonth.getDay(); // 0=dim
    gridStart.setDate(firstOfMonth.getDate() - (fdow === 0 ? 6 : fdow - 1));
    const cells = [];
    const cur = new Date(gridStart);
    do {
      cells.push({
        date: this._dateStr(cur),
        num: cur.getDate(),
        inMonth: cur.getMonth() === month,
        isToday: this._isToday(this._dateStr(cur))
      });
      cur.setDate(cur.getDate() + 1);
    } while (cur.getMonth() === month || cur.getDay() !== 1); // s'arrête au lundi après la fin du mois

    const planning = Store.get('planning') || [];
    const shiftsByDate = {};
    planning.forEach(p => {
      if (p.chauffeurId && chSet.has(p.chauffeurId)) {
        (shiftsByDate[p.date] = shiftsByDate[p.date] || []).push(p);
      }
    });

    const MAX_CHIPS = 3;
    const dayNames = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

    const renderCell = (c) => {
      const dayShifts = c.inMonth ? (shiftsByDate[c.date] || []) : [];
      // Absences des chauffeurs planifiés ou non ce jour-là
      const dayAbsences = c.inMonth ? chauffeurs.flatMap(ch => this._getDriverAbsencesForDate(ch.id, c.date).slice(0, 1)) : [];

      const chips = [];
      dayShifts.forEach(s => {
        const ch = chById[s.chauffeurId];
        if (!ch) return;
        if (!this._matchesShiftFilters(s)) return;
        chips.push(`<div class="pcal-ev" draggable="true" ondragstart="event.stopPropagation();PlanningPage._onDragShift(event,'${s.id}')" style="--c:${this._getShiftColor(s)};" title="${Utils.escHtml(ch.prenom + ' ' + ch.nom)} — ${this._getShiftTimeLabel(s)}" onclick="event.stopPropagation();PlanningPage._editShift('${s.id}')">
          <span class="pcal-ev-name">${Utils.escHtml(ch.prenom + ' ' + ch.nom)}</span>
          <span class="pcal-ev-time">${Utils.escHtml(this._getShiftTimeLabel(s))}</span>
        </div>`);
      });
      dayAbsences.forEach(a => {
        if (!this._showAbsences) return;
        const ch = chById[a.chauffeurId];
        if (!ch) return;
        chips.push(`<div class="pcal-ev pcal-ev-abs" style="--c:${this._absenceTypeColor(a.type)};" title="${Utils.escHtml(ch.prenom + ' ' + ch.nom)} — ${this._absenceTypeLabel(a.type)}" onclick="event.stopPropagation();PlanningPage._viewAbsence('${a.id}')">
          <span class="pcal-ev-name">${Utils.escHtml(ch.prenom + ' ' + ch.nom)}</span>
          <span class="pcal-ev-time">${Utils.escHtml(this._absenceTypeLabel(a.type))}</span>
        </div>`);
      });

      const visible = chips.slice(0, MAX_CHIPS);
      const overflow = chips.length - visible.length;
      const numHtml = c.isToday
        ? `<span class="pcal-num pcal-today">${c.num}</span>`
        : `<span class="pcal-num${c.inMonth ? '' : ' pcal-num-out'}">${c.num}</span>`;

      return `<div class="pcal-cell${c.inMonth ? '' : ' pcal-cell-out'}${c.isToday ? ' pcal-cell-today' : ''}" ${c.inMonth ? `onclick="PlanningPage._addShift('','${c.date}')" ondragover="PlanningPage._onCellDragOver(event)" ondrop="PlanningPage._onDropShift(event,'${c.date}')" title="Ajouter un créneau le ${Utils.formatDate(c.date)}"` : ''}>
        ${numHtml}
        <div class="pcal-chips">${visible.join('')}${overflow > 0 ? `<div class="pcal-more">+${overflow} autre${overflow > 1 ? 's' : ''}</div>` : ''}</div>
      </div>`;
    };

    return `
      ${this._pcalCss()}
      <div class="card pcal-wrap" style="padding:var(--space-md);">
        <div class="pcal">
          <div class="pcal-head">${dayNames.map(d => `<div>${d}</div>`).join('')}</div>
          <div class="pcal-grid">${cells.map(renderCell).join('')}</div>
        </div>
      </div>
    `;
  },

  _getDayLabel() {
    return this._currentDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  },

  // Filtres appliqués à tous les créneaux (service jour/nuit + rôle)
  _matchesShiftFilters(s) {
    if (this._fltService && this._serviceDuCreneau(s) !== this._fltService) return false;
    if (this._fltRole) {
      const role = s.role === 'doublure' ? 'doublure' : 'titulaire';
      if (role !== this._fltRole) return false;
    }
    return true;
  },

  // Glisser-déposer : reprogrammer un créneau sur un autre jour
  _onDragShift(e, id) {
    this._draggingShiftId = id;
    try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
  },
  _onCellDragOver(e) {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
  },
  _onDropShift(e, date) {
    e.preventDefault();
    const id = this._draggingShiftId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
    this._draggingShiftId = null;
    if (!id || !date) return;
    const shift = this._getPlanning().find(s => s.id === id);
    if (!shift || shift.date === date) return;
    Store.update('planning', id, { date });
    if (typeof Toast !== 'undefined') Toast.success('Créneau déplacé au ' + Utils.formatDate(date));
    this._renderView();
  },

  _filterByName(chauffeurs) {
    if (!this._filterSearch) return chauffeurs;
    const q = this._filterSearch.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return chauffeurs.filter(c => (c.prenom + ' ' + c.nom).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  },

  // Vue JOUR : agenda d'une seule journée (créneaux + absences), style Spike
  _renderDayView() {
    const dateStr = this._dateStr(this._currentDay);
    const chauffeurs = this._filterByName(this._getChauffeurs().filter(c => c.statut === 'actif' || c.statut === 'repos'));
    const chById = {}; chauffeurs.forEach(c => chById[c.id] = c);
    const chSet = new Set(chauffeurs.map(c => c.id));
    const shifts = this._getShiftsForDate(dateStr).filter(s => chSet.has(s.chauffeurId) && this._matchesShiftFilters(s))
      .sort((a, b) => (a.heureDebut || '').localeCompare(b.heureDebut || ''));
    const absItems = [];
    if (this._showAbsences) chauffeurs.forEach(ch => this._getDriverAbsencesForDate(ch.id, dateStr).forEach(a => absItems.push({ a, ch })));
    const isToday = this._isToday(dateStr);
    const vehList = Store.get('vehicules') || [];
    const chPlaque = {}; vehList.forEach(v => { if (v.chauffeurAssigne) chPlaque[v.chauffeurAssigne] = v.immatriculation || `${v.marque} ${v.modele}`; });

    const shiftCards = shifts.map(s => {
      const ch = chById[s.chauffeurId]; if (!ch) return '';
      const col = this._getShiftColor(s);
      const nuit = this._serviceDuCreneau(s) === 'nuit';
      return `<div onclick="PlanningPage._editShift('${s.id}')" style="display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-left:4px solid ${col};cursor:pointer;transition:box-shadow .15s;" onmouseover="this.style.boxShadow='0 4px 14px rgba(37,83,185,.12)'" onmouseout="this.style.boxShadow='none'">
        <div style="width:50px;flex-shrink:0;text-align:center;">
          <div style="font-size:15px;font-weight:800;color:var(--text-primary);">${s.heureDebut || '—'}</div>
          <div style="font-size:11px;color:var(--text-muted);">${s.heureFin || ''}</div>
        </div>
        <div style="width:38px;height:38px;border-radius:50%;background:color-mix(in srgb, ${col} 16%, transparent);color:${col};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0;">${Utils.escHtml((ch.prenom || '?').charAt(0))}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${Utils.escHtml(ch.prenom)} ${Utils.escHtml(ch.nom)}${nuit ? ' <span style="font-size:9px;font-weight:800;color:#e0e7ff;background:#312e81;border-radius:4px;padding:1px 5px;">NUIT</span>' : ''}${s.role === 'doublure' ? ' <span style="font-size:9px;font-weight:800;color:#b45309;background:#fef3c7;border-radius:4px;padding:1px 5px;">REMPL</span>' : ''}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${this._getShiftTimeLabel(s)}${chPlaque[ch.id] ? ` · ${Utils.escHtml(chPlaque[ch.id])}` : ''}</div>
        </div>
        <iconify-icon icon="solar:alt-arrow-right-linear" style="color:var(--text-muted);font-size:16px;flex-shrink:0;"></iconify-icon>
      </div>`;
    }).join('');

    const absCards = absItems.map(({ a, ch }) => {
      const col = this._absenceTypeColor(a.type);
      return `<div onclick="PlanningPage._viewAbsence('${a.id}')" style="display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;background:color-mix(in srgb, ${col} 9%, transparent);border:1px solid color-mix(in srgb, ${col} 28%, transparent);cursor:pointer;">
        <div style="width:50px;flex-shrink:0;text-align:center;color:${col};"><iconify-icon icon="solar:moon-sleep-bold-duotone" style="font-size:20px;"></iconify-icon></div>
        <div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:700;color:var(--text-primary);">${Utils.escHtml(ch.prenom)} ${Utils.escHtml(ch.nom)}</div><div style="font-size:12px;color:var(--text-muted);">${this._absenceTypeLabel(a.type)}</div></div>
      </div>`;
    }).join('');

    const total = shifts.length + absItems.length;
    const body = total === 0
      ? `<div style="text-align:center;padding:48px 20px;color:var(--text-muted);"><iconify-icon icon="solar:calendar-minimalistic-bold-duotone" style="font-size:44px;opacity:.4;"></iconify-icon><div style="margin-top:12px;font-size:14px;">Aucun créneau ce jour</div></div>`
      : `<div style="display:flex;flex-direction:column;gap:9px;">${shiftCards}${absCards}</div>`;

    return `<div class="card" style="padding:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:11px;">
          <div style="width:40px;height:40px;border-radius:12px;background:${isToday ? 'var(--pilote-blue)' : 'var(--bg-tertiary)'};color:${isToday ? '#fff' : 'var(--text-secondary)'};display:flex;align-items:center;justify-content:center;"><iconify-icon icon="solar:sun-2-bold-duotone" style="font-size:20px;"></iconify-icon></div>
          <div><div style="font-size:15px;font-weight:800;color:var(--text-primary);text-transform:capitalize;">${this._getDayLabel()}</div><div style="font-size:12px;color:var(--text-muted);">${shifts.length} créneau${shifts.length > 1 ? 'x' : ''}${absItems.length ? ` · ${absItems.length} absence${absItems.length > 1 ? 's' : ''}` : ''}</div></div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="PlanningPage._addShift('','${dateStr}')"><iconify-icon icon="solar:add-circle-bold"></iconify-icon> Créneau</button>
      </div>
      ${body}
    </div>`;
  },

  // Vue LISTE : tous les créneaux du mois, groupés par date (style agenda)
  _renderListView() {
    const chauffeurs = this._filterByName(this._getChauffeurs().filter(c => c.statut === 'actif' || c.statut === 'repos'));
    const chById = {}; chauffeurs.forEach(c => chById[c.id] = c);
    const chSet = new Set(chauffeurs.map(c => c.id));
    const y = this._currentMonth.getFullYear(), m = this._currentMonth.getMonth();
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    const firstDay = `${prefix}-01`;
    const lastDay = `${prefix}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`;

    const entries = [];
    this._getPlanning().forEach(s => {
      if (!s.chauffeurId || !chSet.has(s.chauffeurId) || !String(s.date).startsWith(prefix) || !this._matchesShiftFilters(s)) return;
      const ch = chById[s.chauffeurId]; if (!ch) return;
      entries.push({ date: s.date, t: s.heureDebut || '00:00', kind: 'shift', s, ch });
    });
    this._getAbsences().forEach(a => {
      if (!this._showAbsences || !chSet.has(a.chauffeurId) || a.dateDebut > lastDay || a.dateFin < firstDay) return;
      const ch = chById[a.chauffeurId]; if (!ch) return;
      entries.push({ date: a.dateDebut < firstDay ? firstDay : a.dateDebut, t: '00:00', kind: 'abs', a, ch });
    });
    entries.sort((x, z) => x.date.localeCompare(z.date) || x.t.localeCompare(z.t));

    if (entries.length === 0) {
      return `<div class="card" style="padding:48px 20px;text-align:center;color:var(--text-muted);"><iconify-icon icon="solar:list-bold-duotone" style="font-size:44px;opacity:.4;"></iconify-icon><div style="margin-top:12px;font-size:14px;">Aucun créneau ce mois</div></div>`;
    }

    const groups = {};
    entries.forEach(e => { (groups[e.date] = groups[e.date] || []).push(e); });
    const todayStr = this._dateStr(new Date());
    const sections = Object.keys(groups).sort().map(date => {
      const dObj = new Date(date + 'T00:00:00');
      const dayLabel = dObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      const isToday = date === todayStr;
      const rows = groups[date].map(e => {
        if (e.kind === 'shift') {
          const col = this._getShiftColor(e.s);
          const nuit = this._serviceDuCreneau(e.s) === 'nuit';
          return `<div onclick="PlanningPage._editShift('${e.s.id}')" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:11px;border:1px solid var(--border-color);border-left:4px solid ${col};background:var(--bg-secondary);cursor:pointer;">
            <span style="font-size:12px;font-weight:800;color:var(--text-primary);width:46px;flex-shrink:0;">${e.s.heureDebut || '—'}</span>
            <span style="width:9px;height:9px;border-radius:50%;background:${col};flex-shrink:0;"></span>
            <span style="flex:1;min-width:0;font-size:13px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escHtml(e.ch.prenom)} ${Utils.escHtml(e.ch.nom)}${nuit ? ' · nuit' : ''}${e.s.role === 'doublure' ? ' · rempl.' : ''}</span>
            <span style="font-size:11px;color:var(--text-muted);flex-shrink:0;">${this._getShiftTimeLabel(e.s)}</span>
          </div>`;
        }
        const col = this._absenceTypeColor(e.a.type);
        return `<div onclick="PlanningPage._viewAbsence('${e.a.id}')" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:11px;border:1px solid var(--border-color);border-left:4px solid ${col};background:color-mix(in srgb, ${col} 8%, transparent);cursor:pointer;">
          <span style="width:46px;flex-shrink:0;color:${col};font-size:13px;"><iconify-icon icon="solar:moon-sleep-bold-duotone"></iconify-icon></span>
          <span style="width:9px;height:9px;border-radius:50%;background:${col};flex-shrink:0;"></span>
          <span style="flex:1;min-width:0;font-size:13px;font-weight:700;color:var(--text-primary);">${Utils.escHtml(e.ch.prenom)} ${Utils.escHtml(e.ch.nom)}</span>
          <span style="font-size:11px;color:var(--text-muted);flex-shrink:0;">${this._absenceTypeLabel(e.a.type)}</span>
        </div>`;
      }).join('');
      return `<div style="margin-bottom:18px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;">
          <span style="font-size:12px;font-weight:800;color:${isToday ? 'var(--pilote-blue)' : 'var(--text-secondary)'};text-transform:capitalize;">${dayLabel}</span>
          ${isToday ? `<span style="font-size:9px;font-weight:800;color:#fff;background:var(--pilote-blue);border-radius:20px;padding:2px 8px;">AUJOURD'HUI</span>` : ''}
          <span style="font-size:11px;color:var(--text-muted);">· ${groups[date].length}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;">${rows}</div>
      </div>`;
    }).join('');

    return `<div class="card" style="padding:20px 20px 6px;">${sections}</div>`;
  },

  // CSS partagé des vues calendrier (Mois et Semaine)
  _pcalCss() {
    return `<style>
      .pcal-wrap { overflow-x:auto; }
      .pcal { min-width:680px; }
      .pcal-head { display:grid; grid-template-columns:repeat(7,1fr); gap:10px; margin-bottom:8px; }
      .pcal-head div { text-align:center; font-size:11px; font-weight:700; letter-spacing:.08em; color:var(--text-muted); }
      .pcal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:10px; }
      .pcal-cell { border:1px solid var(--border-color); border-radius:14px; background:var(--bg-secondary); min-height:122px; padding:10px; cursor:pointer; transition:border-color .15s, box-shadow .15s; display:flex; flex-direction:column; gap:6px; }
      .pcal-cell:hover { border-color:var(--pilote-blue, #3b82f6); box-shadow:0 2px 10px rgba(59,130,246,.10); }
      .pcal-cell-out { background:var(--bg-tertiary); border-color:transparent; cursor:default; opacity:.55; }
      /* Aujourd'hui : cellule teintée bleu clair + pastille de date bleue (style Spike) */
      .pcal-cell-today { background:rgba(93,135,255,.07); border-color:rgba(93,135,255,.45); }
      .pcal-num { font-size:13px; font-weight:600; color:var(--text-primary); line-height:26px; }
      .pcal-num-out { color:var(--text-muted); }
      .pcal-today { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:var(--pilote-blue); color:#fff; font-weight:800; box-shadow:0 4px 10px rgba(93,135,255,.35); }
      .pcal-chips { display:flex; flex-direction:column; gap:4px; overflow:hidden; }
      /* Événements « pastille Spike » : liseré coloré à gauche + fond teinté de la même couleur (--c) */
      .pcal-chip { display:flex; align-items:center; gap:5px; font-size:10.5px; font-weight:700; white-space:nowrap; overflow:hidden; cursor:pointer;
        color:var(--text-secondary);
        color:color-mix(in srgb, var(--c, #5D87FF) 72%, var(--text-primary));
        background:var(--bg-tertiary);
        background:color-mix(in srgb, var(--c, #5D87FF) 13%, transparent);
        border-left:3px solid var(--c, #5D87FF); border-radius:5px; padding:3px 8px;
        transition:background .12s, box-shadow .12s, transform .12s; }
      .pcal-chip:hover { background:color-mix(in srgb, var(--c, #5D87FF) 22%, transparent);
        transform:translateX(1px); box-shadow:0 2px 8px rgba(37,83,185,.14); }
      .pcal-chip:active { transform:translateX(1px) scale(.98); }
      .pcal-chip-abs .pcal-chip-txt { opacity:.8; }
      .pcal-chip-txt { overflow:hidden; text-overflow:ellipsis; }
      .pcal-more { font-size:10px; font-weight:600; color:var(--text-muted); padding-left:2px; }
      /* Cartes événement (style calendrier plein écran) : nom + heure */
      .pcal-ev { display:flex; flex-direction:column; gap:1px; padding:4px 8px; border-radius:8px; border:1px solid var(--border-color); border-left:3px solid var(--c,#5D87FF); background:color-mix(in srgb, var(--c,#5D87FF) 8%, var(--bg-secondary)); cursor:pointer; overflow:hidden; transition:background .12s, box-shadow .12s, transform .12s; }
      .pcal-ev:hover { background:color-mix(in srgb, var(--c,#5D87FF) 16%, var(--bg-secondary)); box-shadow:0 2px 8px rgba(37,83,185,.14); transform:translateX(1px); }
      .pcal-ev:active { transform:translateX(1px) scale(.98); }
      .pcal-ev-name { font-size:11px; font-weight:700; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.25; }
      .pcal-ev-time { font-size:10px; font-weight:600; color:var(--text-muted); line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .pcal-ev-abs .pcal-ev-name { opacity:.85; }
    </style>`;
  },

  // =================== VUE STATISTIQUES ===================

  _renderStatsView() {
    const chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif' || c.statut === 'repos');
    const _vehList2 = Store.get('vehicules') || [];
    const vehMap = {};
    _vehList2.forEach(v => { vehMap[v.id] = v.immatriculation || `${v.marque} ${v.modele}`; });
    const chPlaqueMap = {};
    _vehList2.forEach(v => { if (v.chauffeurAssigne) chPlaqueMap[v.chauffeurAssigne] = v.immatriculation || `${v.marque} ${v.modele}`; });
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
                      <div style="display:flex;flex-direction:column;line-height:1.2;">
                        <span style="font-size:var(--font-size-sm);font-weight:500;">${st.chauffeur.prenom} ${st.chauffeur.nom}</span>
                        ${(() => { const _p = (st.chauffeur.vehiculeAssigne ? (vehMap[st.chauffeur.vehiculeAssigne] || '') : '') || chPlaqueMap[st.chauffeur.id] || ''; return _p ? `<span style="font-size:10px;color:var(--text-muted);">${_p}</span>` : ''; })()}
                      </div>
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
    const chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif' || c.statut === 'repos');
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


  // =================== BINÔME TITULAIRE / DOUBLURE ===================

  /**
   * Services exploités par un véhicule : un seul (jour) ou deux (jour + nuit).
   * Chaque service porte son propre titulaire, sa doublure, sa recette et ses horaires.
   */
  _servicesDuVehicule(v) {
    const jour = {
      cle: 'jour',
      label: 'Jour',
      titulaireId: v.chauffeurAssigne || null,
      doublureId: v.doublureId || null,
      recette: (v.recetteJour != null && v.recetteJour > 0) ? Number(v.recetteJour) : null,
      heureDebut: v.heureDebutJour || '06:00',
      heureFin: v.heureFinJour || (v.modeExploitation === 'double' ? '21:00' : '00:00'),
      typeCreneaux: 'journee'
    };
    if (v.modeExploitation !== 'double') return [jour];
    return [jour, {
      cle: 'nuit',
      label: 'Nuit',
      titulaireId: v.chauffeurNuitId || null,
      doublureId: v.doublureNuitId || null,
      recette: (v.recetteNuit != null && v.recetteNuit > 0) ? Number(v.recetteNuit) : null,
      heureDebut: v.heureDebutNuit || '22:00',
      heureFin: v.heureFinNuit || '05:00',
      typeCreneaux: 'nuit'
    }];
  },

  /** Service d'un créneau : colonne `service`, sinon déduit de l'horaire. */
  _serviceDuCreneau(p) {
    if (p.service) return p.service;
    if (p.typeCreneaux === 'nuit') return 'nuit';
    const h = parseInt(String(p.heureDebut || '').slice(0, 2), 10);
    return (!isNaN(h) && (h >= 21 || h < 5)) ? 'nuit' : 'jour';
  },

  /** Véhicule d'un créneau : colonne vehiculeId, sinon voiture assignée au chauffeur. */
  _vehiculeDuCreneau(p, chById) {
    if (p.vehiculeId) return p.vehiculeId;
    const ch = chById[p.chauffeurId];
    return ch ? (ch.vehiculeAssigne || null) : null;
  },

  /**
   * Couverture de la flotte sur la semaine : chaque jour où un véhicule actif
   * n'a personne au volant est une recette qui n'est pas produite.
   */
  _couvertureSemaine(days) {
    const vehicules = (Store.get('vehicules') || []).filter(v => v.statut !== 'inactif' && v.statut !== 'vendu');
    const chauffeurs = Store.get('chauffeurs') || [];
    const chById = {};
    chauffeurs.forEach(c => { chById[c.id] = c; });
    const planning = Store.get('planning') || [];

    const occupe = new Set();
    planning.forEach(p => {
      const vId = this._vehiculeDuCreneau(p, chById);
      if (vId) occupe.add(`${vId}|${p.date}|${this._serviceDuCreneau(p)}`);
    });

    let couverts = 0;
    let perte = 0;
    let total = 0;
    vehicules.forEach(v => {
      const services = this._servicesDuVehicule(v);
      total += services.length * days.length;
      services.forEach(sv => {
        const titulaire = chauffeurs.find(c => c.id === sv.titulaireId);
        // Un service non couvert coûte sa recette (location) ou le CA non produit (salarié).
        const manque = sv.recette != null ? sv.recette
          : (!titulaire ? 0
            : (titulaire.typeContrat === 'salarie' ? (titulaire.objectifCaJour || 0) : (titulaire.redevanceQuotidienne || 0)));
        days.forEach(d => {
          if (occupe.has(`${v.id}|${d.date}|${sv.cle}`)) couverts++;
          else perte += manque;
        });
      });
    });
    return { couverts, total, perte, pct: total > 0 ? Math.round((couverts / total) * 100) : 0 };
  },

  /** Nombre de jours consécutifs déjà travaillés par un chauffeur juste avant `dateStr`. */
  /** Jours de repos hebdomadaires d'un chauffeur (1 ou 2 selon son contrat). */
  _joursReposDe(ch) {
    const l = [];
    if (!ch) return l;
    if (ch.jourRepos === 0 || ch.jourRepos) l.push(Number(ch.jourRepos));
    if (ch.jourRepos2 === 0 || ch.jourRepos2) l.push(Number(ch.jourRepos2));
    return l;
  },

  _joursConsecutifsAvant(chauffeurId, dateStr, planning) {
    const datesTravaillees = new Set(planning.filter(p => p.chauffeurId === chauffeurId).map(p => p.date));
    let n = 0;
    const [y, m, j] = dateStr.split('-').map(Number);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(y, m - 1, j - i);
      if (datesTravaillees.has(this._dateStr(d))) n++;
      else break;
    }
    return n;
  },

  /**
   * Remplit les trous de la semaine : le titulaire sur ses jours, la doublure
   * attitrée sur son jour de repos — pour que chaque voiture roule 7 j/7.
   * Ne touche jamais aux créneaux déjà saisis et respecte la règle des 6 jours
   * consécutifs maximum par chauffeur.
   */
  /**
   * Assistant de generation automatique du planning sur un mois complet.
   * Reutilise le moteur du simulateur (Utils.simulerPlanningMois) : rotation
   * equitable des doublures, 6 jours consecutifs maximum, deux jours de repos.
   * N'ecrase jamais un creneau existant.
   */
  _genererMois() {
    const vehicules = (Store.get('vehicules') || []).filter(v => v.statut !== 'inactif' && v.statut !== 'vendu');
    const chauffeurs = (Store.get('chauffeurs') || []).filter(c => c.statut !== 'inactif');
    if (!vehicules.length) { Toast.warning('Aucun vehicule actif : ajoutez des vehicules avant de generer.'); return; }
    if (!chauffeurs.length) { Toast.warning('Aucun chauffeur actif : ajoutez des chauffeurs avant de generer.'); return; }

    // Role par defaut : celui de la fiche ; a defaut, deduit des affectations vehicule.
    const titAff = new Set(vehicules.map(v => v.chauffeurAssigne).filter(Boolean));
    const doubAff = new Set(vehicules.map(v => v.doublureId).filter(Boolean));
    const roleDe = (c) => c.roleFlotte || (titAff.has(c.id) ? 'titulaire' : (doubAff.has(c.id) ? 'doublure' : ''));

    const now = new Date();
    let optsMois = '';
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      optsMois += `<option value="${d.getFullYear()}-${d.getMonth()}">${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</option>`;
    }

    const lignesCh = chauffeurs.map(c => {
      const r = roleDe(c);
      return `<tr style="border-bottom:1px solid var(--border-color);">
        <td style="padding:5px 7px;font-weight:600;">${Utils.escHtml(`${c.prenom} ${c.nom}`)}</td>
        <td style="padding:5px 7px;color:var(--text-muted);font-size:var(--font-size-xs);">${c.typeContrat === 'salarie' ? 'Salarie' : 'Location'}</td>
        <td style="padding:4px 7px;">
          <select class="gm-role form-control" data-ch="${c.id}" style="font-size:var(--font-size-xs);padding:4px 6px;">
            <option value="" ${!r ? 'selected' : ''}>Ne pas utiliser</option>
            <option value="titulaire" ${r === 'titulaire' ? 'selected' : ''}>Titulaire</option>
            <option value="doublure" ${r === 'doublure' ? 'selected' : ''}>Doublure</option>
          </select></td></tr>`;
    }).join('');

    const casesVeh = vehicules.map(v => `<label style="display:flex;align-items:center;gap:7px;padding:4px 0;font-size:var(--font-size-sm);">
      <input type="checkbox" class="gm-veh" value="${v.id}" checked>
      <span>${Utils.escHtml(v.immatriculation || `${v.marque || ''} ${v.modele || ''}`.trim() || v.id)}</span></label>`).join('');

    Modal.open({
      title: '<iconify-icon icon="solar:calendar-add-bold-duotone" style="color:var(--pilote-blue)"></iconify-icon> Generer le planning du mois',
      size: 'large',
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
          <div>
            <label style="font-size:var(--font-size-xs);font-weight:700;display:block;margin-bottom:4px;">Mois</label>
            <select id="gm-mois" class="form-control" style="margin-bottom:14px;">${optsMois}</select>
            <div style="font-size:var(--font-size-xs);font-weight:700;margin-bottom:5px;">Vehicules a planifier</div>
            <div style="max-height:190px;overflow-y:auto;border:1px solid var(--border-color);border-radius:9px;padding:7px 10px;">${casesVeh}</div>
          </div>
          <div>
            <div style="font-size:var(--font-size-xs);font-weight:700;margin-bottom:5px;">Role de chaque chauffeur</div>
            <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border-color);border-radius:9px;">
              <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">${lignesCh}</table>
            </div>
          </div>
        </div>
        <div id="gm-apercu" style="margin-top:14px;"></div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
               <button class="btn btn-primary" id="gm-appliquer">Ecrire dans le planning</button>`
    });

    const rafraichir = () => this._apercuGenMois();
    setTimeout(() => {
      document.getElementById('gm-mois').addEventListener('change', rafraichir);
      document.querySelectorAll('.gm-veh, .gm-role').forEach(e => e.addEventListener('change', rafraichir));
      document.getElementById('gm-appliquer').addEventListener('click', () => this._appliquerGenMois());
      rafraichir();
    }, 30);
  },

  /** Calcule le planning du mois sans rien ecrire. */
  _calculerGenMois() {
    const [annee, mois] = document.getElementById('gm-mois').value.split('-').map(Number);
    const vIds = [...document.querySelectorAll('.gm-veh:checked')].map(e => e.value);
    const roles = {};
    document.querySelectorAll('.gm-role').forEach(sel => { if (sel.value) roles[sel.dataset.ch] = sel.value; });

    const chById = {};
    (Store.get('chauffeurs') || []).forEach(c => { chById[c.id] = c; });
    const vehicules = (Store.get('vehicules') || []).filter(v => vIds.includes(v.id));
    const titIds = Object.keys(roles).filter(id => roles[id] === 'titulaire');
    const doubIds = Object.keys(roles).filter(id => roles[id] === 'doublure');

    // Un POSTE = un vehicule x un service. Une voiture exploitee en deux
    // services compte donc deux postes (jour puis nuit), chacun avec son
    // titulaire et ses propres horaires.
    const postes = [];
    vehicules.forEach(v => { this._servicesDuVehicule(v).forEach(sv => postes.push({ v, sv })); });

    // Appariement : on respecte l'affectation deja faite sur la fiche vehicule,
    // puis on distribue les titulaires restants sur les postes libres. Un meme
    // chauffeur ne peut tenir deux postes, meme s'il est designe deux fois.
    const dejaPlaces = new Set();
    postes.forEach(po => {
      const t = po.sv.titulaireId;
      if (t && titIds.includes(t) && !dejaPlaces.has(t)) { dejaPlaces.add(t); po._titulaire = t; }
    });
    const restants = titIds.filter(id => !dejaPlaces.has(id));
    let k = 0;
    const titulaires = postes.map((po, i) => {
      const id = po._titulaire || (restants[k++] || null);
      const c = id ? chById[id] : null;
      const repos = (c && (c.jourRepos === 0 || c.jourRepos)) ? Number(c.jourRepos) : i % 7;
      const repos2 = (c && (c.jourRepos2 === 0 || c.jourRepos2)) ? Number(c.jourRepos2) : (repos + 3) % 7;
      return { id: id || ('VIDE-' + po.v.id + '-' + po.sv.cle), nom: c ? `${c.prenom} ${c.nom}` : 'Titulaire a assigner',
               repos, repos2, reel: !!c, vehiculeId: po.v.id, service: po.sv.cle };
    });
    const doublures = doubIds.map(id => ({ id, nom: `${chById[id].prenom} ${chById[id].nom}` }));

    const sim = Utils.simulerPlanningMois({ annee, mois, titulaires, doublures });

    const planning = Store.get('planning') || [];
    const occupe = new Set();
    planning.forEach(p => {
      const vId = this._vehiculeDuCreneau(p, chById);
      if (vId) occupe.add(`${vId}|${p.date}|${this._serviceDuCreneau(p)}`);
    });
    const pris = new Set(planning.map(p => `${p.chauffeurId}|${p.date}`));

    const creneaux = [];
    let sansTitulaire = 0, aRecruter = 0, dejaOccupe = 0, chauffeurPris = 0;
    postes.forEach((po, vi) => {
      const v = po.v, sv = po.sv;
      for (let j = 1; j <= sim.nbJours; j++) {
        const cell = sim.grille[vi][j - 1];
        if (!cell) continue;
        if (String(cell.id).startsWith('VIDE-')) { sansTitulaire++; continue; }
        if (cell.aRecruter) { aRecruter++; continue; }
        const date = `${annee}-${String(mois + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
        if (occupe.has(`${v.id}|${date}|${sv.cle}`)) { dejaOccupe++; continue; }
        if (pris.has(`${cell.id}|${date}`)) { chauffeurPris++; continue; }
        creneaux.push({
          id: Utils.generateId('PLN'),
          chauffeurId: cell.id,
          vehiculeId: v.id,
          service: sv.cle,
          role: cell.role,
          date,
          typeCreneaux: sv.typeCreneaux,
          heureDebut: sv.heureDebut,
          heureFin: sv.heureFin,
          notes: cell.role === 'doublure' ? `Remplacement ${sv.label.toLowerCase()} — genere automatiquement` : '',
          redevanceOverride: sv.recette,
          dateCreation: new Date().toISOString()
        });
        occupe.add(`${v.id}|${date}|${sv.cle}`);
        pris.add(`${cell.id}|${date}`);
      }
    });
    const nbNuit = postes.filter(po => po.sv.cle === 'nuit').length;
    return { annee, mois, sim, creneaux, vehicules, postes, nbNuit, titulaires, sansTitulaire, aRecruter, dejaOccupe, chauffeurPris };
  },

  _apercuGenMois() {
    const zone = document.getElementById('gm-apercu');
    if (!zone) return;
    let r;
    try { r = this._calculerGenMois(); } catch (e) { zone.textContent = 'Calcul impossible : ' + e.message; return; }
    this._dernierGenMois = r;

    const notes = [];
    if (r.sansTitulaire > 0) notes.push(`<div style="color:#b45309;">${r.sansTitulaire} jour(s) sans titulaire : il manque des chauffeurs marques « Titulaire » pour couvrir tous les vehicules.</div>`);
    if (r.aRecruter > 0) notes.push(`<div style="color:#b91c1c;">${r.aRecruter} jour(s) de repos sans doublure disponible — ${r.sim.doublures.filter(d => d.aRecruter).length} doublure(s) a recruter.</div>`);
    if (r.dejaOccupe > 0) notes.push(`<div style="color:var(--text-muted);">${r.dejaOccupe} creneau(x) deja planifie(s) — conserves tels quels, rien n'est ecrase.</div>`);
    if (r.chauffeurPris > 0) notes.push(`<div style="color:var(--text-muted);">${r.chauffeurPris} jour(s) ou le chauffeur conduisait deja une autre voiture.</div>`);

    const tuile = (lbl, val, sous) => `<div style="flex:1;min-width:120px;"><div style="font-size:var(--font-size-xs);color:var(--text-muted);font-weight:700;">${lbl}</div><div style="font-size:1.3rem;font-weight:900;">${val}</div>${sous ? `<div style="font-size:11px;color:var(--text-muted);">${sous}</div>` : ''}</div>`;
    const nbTit = r.creneaux.filter(c => c.role === 'titulaire').length;
    const nbDoub = r.creneaux.filter(c => c.role === 'doublure').length;

    zone.innerHTML = `
      <div style="padding:12px 14px;border-radius:11px;background:var(--bg-tertiary);">
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:${notes.length ? '10px' : '0'};">
          ${tuile('Creneaux a creer', r.creneaux.length, `${r.postes.length} poste(s) x ${r.sim.nbJours} jours`)}
          ${tuile('Par les titulaires', nbTit)}
          ${tuile('Par les doublures', nbDoub)}
          ${tuile('Doublures utilisees', r.sim.doublures.length)}
          ${r.nbNuit > 0 ? tuile('Dont service de nuit', r.creneaux.filter(c => c.service === 'nuit').length, `${r.nbNuit} poste(s) de nuit`) : ''}
        </div>
        ${notes.length ? `<div style="font-size:var(--font-size-xs);line-height:1.7;border-top:1px solid var(--border-color);padding-top:9px;">${notes.join('')}</div>` : ''}
      </div>`;
  },

  _appliquerGenMois() {
    const r = this._dernierGenMois;
    if (!r || !r.creneaux.length) { Toast.warning('Aucun creneau a creer.'); return; }
    r.creneaux.forEach(c => Store.add('planning', c));
    Modal.close();
    Toast.success(`${r.creneaux.length} creneaux crees pour le mois.`);
    this.render();
  },

  _genererSemaine() {
    const vehicules = (Store.get('vehicules') || []).filter(v => v.statut !== 'inactif' && v.statut !== 'vendu');
    const chauffeurs = Store.get('chauffeurs') || [];
    const chById = {};
    chauffeurs.forEach(c => { chById[c.id] = c; });
    const planning = Store.get('planning') || [];

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this._currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push({ date: this._dateStr(d), dow: d.getDay() });
    }

    const occupe = new Set();
    planning.forEach(p => {
      const vId = this._vehiculeDuCreneau(p, chById);
      if (vId) occupe.add(`${vId}|${p.date}|${this._serviceDuCreneau(p)}`);
    });
    // Un chauffeur ne peut assurer qu'un seul service par jour.
    const chauffeurPris = new Set(planning.map(p => `${p.chauffeurId}|${p.date}`));

    const nouveaux = [];
    let sansDoublure = 0, sansTitulaire = 0, bloques = 0, dejaPris = 0;

    vehicules.forEach(v => {
      const services = this._servicesDuVehicule(v);
      services.forEach(sv => {
        const titulaire = sv.titulaireId ? chById[sv.titulaireId] : null;
        if (!titulaire) { sansTitulaire += days.length; return; }
        const doublure = sv.doublureId ? chById[sv.doublureId] : null;
        // Un salarié peut avoir deux jours de repos par semaine
        const joursRepos = [];
        if (titulaire.jourRepos === 0 || titulaire.jourRepos) joursRepos.push(Number(titulaire.jourRepos));
        if (titulaire.jourRepos2 === 0 || titulaire.jourRepos2) joursRepos.push(Number(titulaire.jourRepos2));

        days.forEach(d => {
          if (occupe.has(`${v.id}|${d.date}|${sv.cle}`)) return;
          const estRepos = joursRepos.includes(d.dow);
          const chauffeur = estRepos ? doublure : titulaire;
          if (!chauffeur) { sansDoublure++; return; }
          if (chauffeurPris.has(`${chauffeur.id}|${d.date}`)) { dejaPris++; return; }

          const simule = planning.concat(nouveaux);
          if (this._joursConsecutifsAvant(chauffeur.id, d.date, simule) >= 6) { bloques++; return; }

          const creneau = {
            id: Utils.generateId('PLN'),
            chauffeurId: chauffeur.id,
            vehiculeId: v.id,
            service: sv.cle,
            role: estRepos ? 'doublure' : 'titulaire',
            date: d.date,
            typeCreneaux: sv.typeCreneaux,
            heureDebut: sv.heureDebut,
            heureFin: sv.heureFin,
            notes: estRepos ? `Remplacement ${sv.label.toLowerCase()} — repos de ${titulaire.prenom} ${titulaire.nom}` : '',
            // La recette du service prime sur celle du chauffeur (jour 25 000 / nuit 18 000)
            redevanceOverride: sv.recette,
            dateCreation: new Date().toISOString()
          };
          nouveaux.push(creneau);
          occupe.add(`${v.id}|${d.date}|${sv.cle}`);
          chauffeurPris.add(`${chauffeur.id}|${d.date}`);
        });
      });
    });

    if (nouveaux.length === 0) {
      Modal.open({
        title: '<iconify-icon icon="solar:info-circle-bold-duotone" style="color:var(--pilote-blue)"></iconify-icon> Rien à compléter',
        body: `<div style="font-size:var(--font-size-sm);line-height:1.6">
          <p>Aucun créneau n'a pu être ajouté cette semaine.</p>
          ${sansTitulaire > 0 ? `<p>• ${sansTitulaire} jour(s)-voiture sans <strong>chauffeur titulaire</strong> assigné au véhicule.</p>` : ''}
          ${sansDoublure > 0 ? `<p>• ${sansDoublure} jour(s) de repos sans <strong>doublure attitrée</strong> — désignez-la sur la fiche du véhicule.</p>` : ''}
          ${bloques > 0 ? `<p>• ${bloques} jour(s) bloqué(s) par la règle des <strong>6 jours consécutifs</strong>.</p>` : ''}
          ${dejaPris > 0 ? `<p>• ${dejaPris} jour(s) où le chauffeur conduisait déjà une autre voiture.</p>` : ''}
        </div>`,
        size: 'small'
      });
      return;
    }

    const parRole = nouveaux.filter(c => c.role === 'doublure').length;
    const recettePotentielle = nouveaux.reduce((s, c) => {
      if (c.redevanceOverride != null && c.redevanceOverride > 0) return s + c.redevanceOverride;
      const ch = chById[c.chauffeurId];
      return s + (ch ? (ch.redevanceQuotidienne || 0) : 0);
    }, 0);
    const nbNuit = nouveaux.filter(c => c.service === 'nuit').length;

    Modal.open({
      title: '<iconify-icon icon="solar:magic-stick-3-bold-duotone" style="color:var(--pilote-blue)"></iconify-icon> Compléter la semaine',
      body: `<div style="font-size:var(--font-size-sm);line-height:1.7">
        <p><strong>${nouveaux.length} créneau(x)</strong> vont être créés — dont <strong>${parRole}</strong> en remplacement par une doublure${nbNuit > 0 ? ` et <strong>${nbNuit}</strong> en service de nuit` : ''}.</p>
        <p style="padding:10px 12px;border-radius:8px;background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.2)">Recette supplémentaire attendue : <strong style="color:#16a34a">${Utils.formatCurrency(recettePotentielle)}</strong></p>
        ${sansDoublure > 0 ? `<p style="color:#b45309">⚠ ${sansDoublure} jour(s) de repos restent non couverts : aucune doublure n'est désignée sur ces véhicules.</p>` : ''}
        ${bloques > 0 ? `<p style="color:#b45309">⚠ ${bloques} jour(s) écarté(s) : le chauffeur atteindrait 7 jours consécutifs.</p>` : ''}
        <p style="color:var(--text-muted);font-size:var(--font-size-xs)">Les créneaux déjà saisis ne sont pas modifiés.</p>
      </div>`,
      footer: `<button class="btn btn-primary" id="btn-confirm-gen">Créer les ${nouveaux.length} créneaux</button><button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>`
    });

    this._pendingGen = nouveaux;
    setTimeout(() => {
      const b = document.getElementById('btn-confirm-gen');
      if (b) b.addEventListener('click', () => this._confirmGenererSemaine());
    }, 60);
  },

  _confirmGenererSemaine() {
    const creneaux = this._pendingGen || [];
    creneaux.forEach(c => Store.add('planning', c));
    this._pendingGen = null;
    Modal.close();
    Toast.success(`${creneaux.length} créneau${creneaux.length > 1 ? 'x' : ''} créé${creneaux.length > 1 ? 's' : ''}`);
    this._renderView();
  },

  // =================== CRUD ===================

  _addShift(preselectedChId, preselectedDate, returnTo) {
    const chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif' || c.statut === 'repos');
    const fields = [
      { type: 'row-start' },
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, placeholder: 'Choisir un chauffeur...', options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })), default: preselectedChId || '' },
      { name: 'date', label: 'Date', type: 'date', required: true, default: preselectedDate || new Date().toISOString().split('T')[0] },
      { type: 'row-end' },
      { name: 'vehiculeId', label: 'Véhicule', type: 'select', placeholder: 'Voiture habituelle du chauffeur', options: (Store.get('vehicules') || []).filter(v => v.statut !== 'inactif' && v.statut !== 'vendu').map(v => ({ value: v.id, label: v.immatriculation || `${v.marque} ${v.modele}` })), default: (preselectedChId && (this._getChauffeurs().find(c => c.id === preselectedChId) || {}).vehiculeAssigne) || '' },
      { name: 'typeCreneaux', label: 'Créneau type', type: 'select', required: false, options: [
        { value: 'custom', label: 'Personnalisé' },
        { value: 'matin', label: 'Matin (6h - 14h)' },
        { value: 'apres_midi', label: 'Après-midi (14h - 22h)' },
        { value: 'journee', label: 'Journée complète (6h - minuit)' },
        { value: 'nuit', label: 'Nuit (22h - 6h)' }
      ], default: 'custom' },
      { type: 'row-start' },
      { name: 'heureDebut', label: 'Heure début', type: 'time', required: true, default: '06:00' },
      { name: 'heureFin', label: 'Heure fin', type: 'time', required: true, default: '00:00' },
      { type: 'row-end' },
      { name: 'redevanceOverride', label: 'Recette exceptionnelle (FCFA)', type: 'number', placeholder: 'Laisser vide = recette habituelle du chauffeur', min: 0 },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'Zone, client particulier, instructions...' }
    ];

    Modal.form('<iconify-icon icon="solar:calendar-add-bold-duotone" class="text-success"></iconify-icon> Ajouter un créneau', FormBuilder.build(fields), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      // Convertir en nombre ou null
      if (values.redevanceOverride !== undefined && values.redevanceOverride !== '' && values.redevanceOverride !== null) {
        values.redevanceOverride = Number(values.redevanceOverride);
      } else {
        values.redevanceOverride = null;
      }

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
      if (returnTo === 'dashboard') {
        if (typeof Router !== 'undefined' && Router.navigate) Router.navigate('/dashboard');
        else window.location.hash = '#/dashboard';
      } else {
        this._renderView();
      }
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
    const chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif' || c.statut === 'repos');

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
        { value: 'journee', label: 'Journée complète (6h - minuit)' },
        { value: 'nuit', label: 'Nuit (22h - 6h)' }
      ]},
      { type: 'row-start' },
      { name: 'heureDebut', label: 'Heure début', type: 'time', required: true },
      { name: 'heureFin', label: 'Heure fin', type: 'time', required: true },
      { type: 'row-end' },
      { name: 'redevanceOverride', label: 'Recette exceptionnelle (FCFA)', type: 'number', placeholder: 'Laisser vide = recette habituelle du chauffeur', min: 0 },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ];

    Modal.form('<iconify-icon icon="solar:pen-bold-duotone" class="text-blue"></iconify-icon> Modifier le créneau', FormBuilder.build(fields, editValues), () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      // Convertir en nombre ou null
      if (values.redevanceOverride !== undefined && values.redevanceOverride !== '' && values.redevanceOverride !== null) {
        values.redevanceOverride = Number(values.redevanceOverride);
      } else {
        values.redevanceOverride = null;
      }

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
    const chauffeurs = this._getChauffeurs().filter(c => c.statut === 'actif' || c.statut === 'repos');
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

  async _exportPDF() {
    await LazyLibs.jspdf();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    const planning = Store.get('planning') || [];
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif' || c.statut === 'repos');

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
            ${chauffeurs.filter(c => c.statut === 'actif' || c.statut === 'repos').map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
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
            chauffeurs.filter(c => c.statut === 'actif' || c.statut === 'repos').forEach(c => {
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
            chauffeurs.filter(c => c.statut === 'actif' || c.statut === 'repos').forEach(c => {
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
          const depId = 'DEP-' + Math.random().toString(36).substr(2, 6).toUpperCase();
          Store.add('depenses', {
            id: depId,
            vehiculeId: ch.vehiculeId || '',
            chauffeurId: chauffeurId,
            typeDepense: 'recharge_yango',
            montant: amount,
            date: new Date().toISOString().split('T')[0],
            commentaire: desc,
            dateCreation: new Date().toISOString()
          });

          // Auto-comptabilité : décaissement recharge Yango
          Store.add('comptabilite', {
            id: Utils.generateId('OP'),
            type: 'depense',
            date: new Date().toISOString().slice(0,10),
            categorie: 'recharge_yango',
            description: `Recharge Yango — ${nom}`,
            montant: amount,
            modePaiement: 'virement',
            reference: depId,
            notes: 'Créé automatiquement depuis recharge Yango (planning)',
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
