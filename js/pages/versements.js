/**
 * VersementsPage - Payment tracking and validation
 */

// Helper : détecte si un versement est un paiement réel (pas un fantôme auto-généré)
function _isRealVersement(v) {
  if (v.statut === 'supprime') return false;
  // Versements Wave en attente de confirmation : toujours les montrer
  if (v.moyenPaiement === 'wave' || v.waveCheckoutId) return true;
  // Versements soumis par le chauffeur via l'app : toujours les montrer
  if (v.soumisParChauffeur) return true;
  // Fantômes auto-générés en attente sans paiement réel
  if (v.statut === 'en_attente' && (v.montantVerse || 0) <= 0) return false;
  if ((v.montantVerse || 0) <= 0) return false;
  // Auto-généré sans moyen de paiement = fantôme de la grille récurrente
  if (/^Auto[:\-]/.test(v.commentaire || '') && !v.moyenPaiement) return false;
  return true;
}

const VersementsPage = {
  _selectedPeriod: null, // null = aujourd'hui, 'YYYY-MM-DD' = date spécifique

  render() {
    const container = document.getElementById('page-content');
    const data = this._getData();
    this._kpiData = data;
    container.innerHTML = this._template(data);
    this._bindEvents(data);
    this._bindPeriodSelector();
  },

  destroy() {
  },

  _onPeriodChange(value) {
    this._selectedPeriod = value || null;
    this.destroy();
    this.render();
  },

  _resetToToday() {
    this._selectedPeriod = null;
    this.destroy();
    this.render();
  },

  async _cleanupGhosts() {
    if (!confirm('Supprimer tous les versements fantômes (auto-générés sans paiement réel) de la base de données ?')) return;
    try {
      const result = await Store.cleanupGhostVersements();
      Toast.success(result.message || `${result.deleted} fantôme(s) supprimé(s)`);
      this.destroy();
      this.render();
    } catch (e) {
      Toast.error('Erreur : ' + e.message);
    }
  },

  _bindPeriodSelector() {
    const input = document.getElementById('versements-period');
    if (input) {
      input.addEventListener('change', () => this._onPeriodChange(input.value));
    }
  },

  _getData() {
    const versements = Store.get('versements');
    const chauffeurs = Store.get('chauffeurs');
    const now = new Date();
    const selectedDay = this._selectedPeriod || now.toISOString().split('T')[0];
    const sel = new Date(selectedDay);
    const thisMonth = sel.getMonth();
    const thisYear = sel.getFullYear();

    // Toujours filtrer par jour (selectedDay = aujourd'hui ou date choisie)
    const monthVers = versements.filter(v => v.date === selectedDay);

    // Exclure les versements fantômes (0 FCFA ou auto-générés sans paiement réel)
    const realVers = monthVers.filter(_isRealVersement);
    const activeVers = realVers;
    const totalVerse = activeVers.filter(v => v.statut === 'valide' || v.statut === 'partiel').reduce((s, v) => s + (v.montantVerse || 0), 0);

    // Compter les statuts — uniquement les paiements réels
    const byStatus = {
      valide: realVers.filter(v => v.statut === 'valide').length,
      retard: 0, // sera recalculé ci-dessous via le planning
      partiel: realVers.filter(v => v.statut === 'partiel').length
    };

    // Calculer le montant attendu et les retards via le planning
    const planning = Store.get('planning') || [];
    const absences = Store.get('absences') || [];

    // Toujours filtrer sur le jour sélectionné
    const filterMinDate = selectedDay;
    const filterMaxDate = selectedDay;

    const scheduledDays = new Map();
    planning.filter(p => p.date >= filterMinDate && p.date <= filterMaxDate).forEach(p => {
      const key = `${p.chauffeurId}|${p.date}`;
      if (!scheduledDays.has(key)) scheduledDays.set(key, p);
    });

    let totalAttendu = 0;
    const detailProgrammes = [];
    const detailRetard = [];
    scheduledDays.forEach((p) => {
      const hasAbsence = absences.some(a => a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin);
      if (hasAbsence) return;
      const ch = chauffeurs.find(c => c.id === p.chauffeurId);
      if (!ch || ch.statut === 'inactif') return;
      const redevance = (p.redevanceOverride != null && p.redevanceOverride > 0) ? p.redevanceOverride : (ch.redevanceQuotidienne || 0);
      if (redevance <= 0) return;
      detailProgrammes.push({ chauffeurId: p.chauffeurId, nom: ch.nom, prenom: ch.prenom, redevance, date: p.date });
      totalAttendu += redevance;
      const hasValidOrDismissed = versements.some(v => v.chauffeurId === p.chauffeurId && v.date === p.date && (v.statut === 'valide' || v.statut === 'supprime'));
      if (!hasValidOrDismissed) {
        byStatus.retard++;
        detailRetard.push({ chauffeurId: p.chauffeurId, nom: ch.nom, prenom: ch.prenom, redevance, date: p.date });
      }
    });

    const nbChauffeursProgrammes = new Set(detailProgrammes.map(d => d.chauffeurId)).size;
    const detailVerse = activeVers.filter(v => v.statut === 'valide' || v.statut === 'partiel').map(v => {
      const ch = chauffeurs.find(c => c.id === v.chauffeurId);
      return { chauffeurId: v.chauffeurId, nom: ch ? ch.nom : '?', prenom: ch ? ch.prenom : '?', montant: v.montantVerse || 0, date: v.date, statut: v.statut };
    });

    const tauxRecouvrement = totalAttendu > 0 ? (totalVerse / totalAttendu) * 100 : 0;

    const periodLabel = Utils.formatDate(selectedDay);

    // Weekly evolution (last 12 weeks)
    const weeklyEvo = [];
    for (let w = 11; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (w * 7 + now.getDay()));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekVers = versements.filter(v => {
        const d = new Date(v.date);
        return d >= weekStart && d <= weekEnd;
      });

      weeklyEvo.push({
        label: `S${Utils.getWeekNumber(weekStart)}`,
        total: weekVers.filter(_isRealVersement).reduce((s, v) => s + (v.montantVerse || 0), 0)
      });
    }

    // =================== RECETTES IMPAYÉES ===================
    const now2 = new Date();
    const unpaidItems = [];
    scheduledDays.forEach((p) => {
      const hasAbsence = absences.some(a => a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin);
      if (hasAbsence) return;
      const ch2 = chauffeurs.find(c => c.id === p.chauffeurId);
      if (!ch2 || ch2.statut === 'inactif') return;
      const redev = (p.redevanceOverride != null && p.redevanceOverride > 0) ? p.redevanceOverride : (ch2.redevanceQuotidienne || 0);
      if (redev <= 0) return;
      const hasValidOrDismissed = versements.some(v => v.chauffeurId === p.chauffeurId && v.date === p.date && (v.statut === 'valide' || v.statut === 'supprime'));
      if (!hasValidOrDismissed) {
        const existing2 = versements.find(v => v.chauffeurId === p.chauffeurId && v.date === p.date);
        const joursRetard = Math.floor((now2 - new Date(p.date)) / 86400000);
        let tauxPenalite = 0;
        if (joursRetard > 7) tauxPenalite = 0.15;
        else if (joursRetard > 4) tauxPenalite = 0.10;
        else if (joursRetard > 2) tauxPenalite = 0.05;
        const penalite = Math.round(redev * tauxPenalite);
        unpaidItems.push({
          planningId: p.id, chauffeurId: p.chauffeurId, date: p.date,
          typeCreneaux: p.typeCreneaux, heureDebut: p.heureDebut, heureFin: p.heureFin,
          montantDu: redev, joursRetard, tauxPenalite, penalite, totalDu: redev + penalite,
          justification: existing2 ? existing2.justification : null,
          versementId: existing2 ? existing2.id : null
        });
      }
    });
    unpaidItems.sort((a, b) => b.date.localeCompare(a.date));
    const totalUnpaid = unpaidItems.reduce((s, i) => s + i.montantDu, 0);
    const totalPenalites = unpaidItems.reduce((s, i) => s + i.penalite, 0);

    // Dettes & pertes globales (tous versements, pas limité au jour)
    const totalDettes = versements.filter(v => v.traitementManquant === 'dette' && v.manquant > 0).reduce((s, v) => s + v.manquant, 0);
    const totalPertes = versements.filter(v => v.traitementManquant === 'perte' && v.manquant > 0).reduce((s, v) => s + v.manquant, 0);
    const nbDetteDrivers = new Set(versements.filter(v => v.traitementManquant === 'dette' && v.manquant > 0).map(v => v.chauffeurId)).size;

    return { versements, chauffeurs, totalAttendu, totalVerse, tauxRecouvrement, byStatus, weeklyEvo, periodLabel, selectedDay, detailProgrammes, detailRetard, detailVerse, nbChauffeursProgrammes, unpaidItems, totalUnpaid, totalPenalites, totalDettes, totalPertes, nbDetteDrivers };
  },

  _template(d) {
    return `
      <div class="d-wrap"><div class="d-bg">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:14px;">
        <div>
          <div style="font-size:14px;color:#9ca3af;font-weight:500;">Suivi financier</div>
          <div style="font-size:28px;font-weight:800;color:#111827;letter-spacing:-.6px;margin-top:2px;display:flex;align-items:center;gap:12px;">
            <iconify-icon icon="solar:transfer-horizontal-bold-duotone" style="color:#6366f1;"></iconify-icon> Versements
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:0;background:rgba(255,255,255,.7);backdrop-filter:blur(12px);border-radius:14px;border:1px solid rgba(0,0,0,.06);padding:3px;">
            <input type="date" id="versements-period" value="${this._selectedPeriod || new Date().toISOString().split('T')[0]}" style="font-size:12px;padding:6px 10px;border-radius:11px;background:transparent;border:none;color:#374151;font-weight:500;outline:none;">
            ${this._selectedPeriod ? '<button onclick="VersementsPage._resetToToday()" style="font-size:13px;padding:6px 8px;border-radius:11px;background:transparent;border:none;cursor:pointer;color:#6b7280;"><iconify-icon icon="solar:restart-bold"></iconify-icon></button>' : ''}
          </div>
          <button class="btn btn-secondary" onclick="VersementsPage._exportPDF()"><iconify-icon icon="solar:document-bold-duotone"></iconify-icon> PDF</button>
          <button class="btn btn-secondary" onclick="VersementsPage._exportCSV()"><iconify-icon icon="solar:file-bold-duotone"></iconify-icon> CSV</button>
          <button class="btn btn-secondary" onclick="VersementsPage._cleanupGhosts()" title="Supprimer les versements fantômes (0 FCFA)"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon> Nettoyer</button>
          <button class="btn btn-success" onclick="VersementsPage._showRecettesRecurrentes()"><iconify-icon icon="solar:repeat-bold-duotone"></iconify-icon> Récurrents</button>
          <button class="btn btn-primary" id="btn-add-versement"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Nouveau versement</button>
        </div>
      </div>

      <!-- KPIs — Row 1 : Montant attendu + Versé + Taux + Programmés -->
      <div class="d-grid d-g4" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
        <div class="d-card" style="cursor:pointer;color:#fff;background:linear-gradient(135deg,#6366f1,#818cf8);border:none;box-shadow:0 4px 20px rgba(99,102,241,.25);" onclick="VersementsPage._showKpiDetail('attendu')">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">Montant attendu</div>
          </div>
          <div class="d-val" style="color:#fff;">${Utils.formatCurrency(d.totalAttendu)}</div>
          <div class="d-sub" style="color:rgba(255,255,255,.6);">${d.periodLabel}</div>
        </div>
        <div class="d-card" style="cursor:pointer;color:#fff;background:linear-gradient(135deg,#10b981,#34d399);border:none;box-shadow:0 4px 20px rgba(16,185,129,.25);" onclick="VersementsPage._showKpiDetail('verse')">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">Montant versé</div>
          </div>
          <div class="d-val" style="color:#fff;">${Utils.formatCurrency(d.totalVerse)}</div>
          <div class="d-sub" style="color:rgba(255,255,255,.6);">${d.periodLabel}</div>
        </div>
        <div class="d-card" style="cursor:pointer;color:#fff;background:linear-gradient(135deg,${d.tauxRecouvrement >= 80 ? '#10b981,#34d399' : d.tauxRecouvrement >= 50 ? '#f97316,#fb923c' : '#ef4444,#f87171'});border:none;box-shadow:0 4px 20px ${d.tauxRecouvrement >= 80 ? 'rgba(16,185,129,.25)' : d.tauxRecouvrement >= 50 ? 'rgba(249,115,22,.25)' : 'rgba(239,68,68,.25)'};" onclick="VersementsPage._showKpiDetail('taux')">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;"><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">Taux recouvrement</div>
          </div>
          <div class="d-val" style="color:#fff;">${d.tauxRecouvrement.toFixed(1)}%</div>
          <div class="d-bar-track" style="margin-top:10px;background:rgba(255,255,255,.15);">
            <div class="d-bar-fill" style="width:${Math.min(d.tauxRecouvrement,100)}%;background:rgba(255,255,255,.5);"></div>
          </div>
        </div>
        <div class="d-card" style="cursor:pointer;color:#fff;background:linear-gradient(135deg,#3b82f6,#60a5fa);border:none;box-shadow:0 4px 20px rgba(59,130,246,.25);" onclick="VersementsPage._showKpiDetail('programmes')">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;"><iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">Chauffeurs programmés</div>
          </div>
          <div class="d-val" style="color:#fff;">${d.nbChauffeursProgrammes}</div>
        </div>
      </div>

      <!-- KPIs — Row 2 : En retard + Dettes + Pertes -->
      <div class="d-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px;">
        <div class="d-card" style="cursor:pointer;color:#fff;background:linear-gradient(135deg,#8b5cf6,#a78bfa);border:none;box-shadow:0 4px 20px rgba(139,92,246,.25);" onclick="VersementsPage._showKpiDetail('retard')">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">En retard</div>
          </div>
          <div class="d-val" style="color:#fff;">${d.byStatus.retard}</div>
          <div style="margin-top:10px;">
            <span style="display:inline-flex;align-items:center;gap:3px;padding:4px 10px;border-radius:20px;background:rgba(255,255,255,.2);backdrop-filter:blur(4px);font-size:11px;font-weight:700;color:#fff;">${d.byStatus.retard > 0 ? 'Action requise' : 'Tout est OK'}</span>
          </div>
        </div>
        <div class="d-card" style="cursor:pointer;color:#fff;background:linear-gradient(135deg,#f97316,#fb923c);border:none;box-shadow:0 4px 20px rgba(249,115,22,.25);" onclick="document.getElementById('dette-section')?.scrollIntoView({behavior:'smooth'})">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">Dettes</div>
          </div>
          <div class="d-val" style="color:#fff;">${d.totalDettes > 0 ? Utils.formatCurrency(d.totalDettes) : '0 FCFA'}</div>
          <div class="d-sub" style="color:rgba(255,255,255,.6);">${d.totalDettes > 0 ? d.nbDetteDrivers + ' chauffeur' + (d.nbDetteDrivers > 1 ? 's' : '') : 'Aucune dette'}</div>
          <div class="d-bar-track" style="margin-top:10px;background:rgba(255,255,255,.15);">
            <div class="d-bar-fill" style="width:${d.totalAttendu > 0 ? Math.min(d.totalDettes/d.totalAttendu*100,100) : 0}%;background:rgba(255,255,255,.5);"></div>
          </div>
        </div>
        <div class="d-card" style="color:#fff;background:linear-gradient(135deg,#ef4444,#f87171);border:none;box-shadow:0 4px 20px rgba(239,68,68,.25);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="d-icon" style="background:rgba(255,255,255,.2);color:#fff;"><iconify-icon icon="solar:close-circle-bold-duotone"></iconify-icon></div>
            <div class="d-lbl" style="margin:0;color:rgba(255,255,255,.8);">Pertes</div>
          </div>
          <div class="d-val" style="color:#fff;">${d.totalPertes > 0 ? Utils.formatCurrency(d.totalPertes) : '0 FCFA'}</div>
          <div class="d-bar-track" style="margin-top:10px;background:rgba(255,255,255,.15);">
            <div class="d-bar-fill" style="width:${d.totalAttendu > 0 ? Math.min(d.totalPertes/d.totalAttendu*100,100) : 0}%;background:rgba(255,255,255,.5);"></div>
          </div>
        </div>
      </div>

      <!-- Recettes impayées -->
      ${this._renderUnpaidSection(d)}

      <!-- Suivi des dettes -->
      ${this._renderDetteSection(d)}

      <!-- Versements du jour -->
      ${this._renderVersementsSection(d)}

      </div></div>
    `;
  },

  _bindEvents(d) {
    const versements = d.versements.filter(_isRealVersement).sort((a, b) => b.date.localeCompare(a.date));
    this._loadYangoCourses(versements, d.chauffeurs);

    // Filters for versements card list
    const filterChauffeur = document.getElementById('filter-chauffeur');
    const filterStatut = document.getElementById('filter-statut');

    if (filterChauffeur && filterStatut) {
      const applyFilters = () => {
        let filtered = [...versements];
        if (filterChauffeur.value) filtered = filtered.filter(v => v.chauffeurId === filterChauffeur.value);
        if (filterStatut.value) filtered = filtered.filter(v => v.statut === filterStatut.value);
        const container = document.getElementById('versements-list');
        if (container) container.innerHTML = this._renderVersementRows(filtered, d.chauffeurs);
        const countEl = document.getElementById('versements-count');
        if (countEl) countEl.textContent = filtered.length;
        const totalEl = document.getElementById('versements-total');
        if (totalEl) totalEl.textContent = Utils.formatCurrency(filtered.filter(v => v.statut === 'valide' || v.statut === 'partiel').reduce((s, v) => s + (v.montantVerse || 0), 0));
        this._loadYangoCourses(filtered, d.chauffeurs);
      };
      filterChauffeur.addEventListener('change', applyFilters);
      filterStatut.addEventListener('change', applyFilters);
    }

    // Search in versements list
    const searchInput = document.getElementById('versements-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase().trim();
        const items = document.querySelectorAll('#versements-list [data-name]');
        items.forEach(item => {
          item.style.display = item.dataset.name.includes(q) ? '' : 'none';
        });
      });
    }

    // Search in dettes list
    const detteSearch = document.getElementById('dette-search');
    if (detteSearch) {
      detteSearch.addEventListener('input', () => {
        const q = detteSearch.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#dette-rows-list .dette-row');
        rows.forEach(row => {
          row.style.display = row.dataset.nom.includes(q) ? '' : 'none';
        });
      });
    }

    // Add button
    document.getElementById('btn-add-versement').addEventListener('click', () => this._add());
  },

  // =================== VERSEMENTS DU JOUR (CARD LIST) ===================

  _renderVersementsSection(d) {
    const versements = d.versements.filter(_isRealVersement).sort((a, b) => b.date.localeCompare(a.date));
    if (versements.length === 0) return `<div class="card" style="margin-top:var(--space-lg);border-left:4px solid #22c55e;text-align:center;padding:var(--space-xl);color:var(--text-muted);">
      <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:2rem;color:#22c55e;display:block;margin-bottom:8px;"></iconify-icon>
      Aucun versement pour cette date
    </div>`;

    const totalVerse = versements.filter(v => v.statut === 'valide' || v.statut === 'partiel').reduce((s, v) => s + (v.montantVerse || 0), 0);
    const rows = this._renderVersementRows(versements, d.chauffeurs);

    return `<div class="card" style="margin-top:var(--space-lg);border-left:4px solid #22c55e;">
      <div class="card-header">
        <span class="card-title"><iconify-icon icon="solar:hand-money-bold-duotone" style="color:#22c55e;"></iconify-icon> Versements (<span id="versements-count">${versements.length}</span>)</span>
        <div style="text-align:right;">
          <div style="font-size:var(--font-size-base);font-weight:700;color:#22c55e;" id="versements-total">${Utils.formatCurrency(totalVerse)}</div>
        </div>
      </div>
      <div style="display:flex;gap:var(--space-sm);margin-bottom:8px;flex-wrap:wrap;">
        <div style="position:relative;flex:1;min-width:150px;">
          <iconify-icon icon="solar:magnifer-bold" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;color:#22c55e;pointer-events:none;"></iconify-icon>
          <input type="text" id="versements-search" class="form-control" placeholder="Rechercher un chauffeur..." style="padding-left:32px;font-size:var(--font-size-xs);border:2px solid #22c55e;border-radius:var(--radius-md);background:var(--bg-primary);" onclick="event.stopPropagation()">
        </div>
        <select class="form-control" id="filter-chauffeur" style="width:180px;font-size:var(--font-size-xs);">
          <option value="">Tous les chauffeurs</option>
          ${d.chauffeurs.map(c => `<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('')}
        </select>
        <select class="form-control" id="filter-statut" style="width:140px;font-size:var(--font-size-xs);">
          <option value="">Tous statuts</option>
          <option value="valide">Validé</option>
          <option value="en_attente">En attente</option>
          <option value="retard">En retard</option>
          <option value="partiel">Partiel</option>
        </select>
      </div>
      <div id="versements-list" style="display:flex;flex-direction:column;gap:6px;max-height:500px;overflow-y:auto;">
        ${rows}
      </div>
    </div>`;
  },

  _renderVersementRows(versements, chauffeurs) {
    return versements.map(v => {
      const c = chauffeurs.find(x => x.id === v.chauffeurId);
      const name = c ? `${c.prenom} ${c.nom}` : v.chauffeurId;
      const isDeleted = v.statut === 'supprime';
      const dateLabel = Utils.formatDate(v.dateService || v.date);
      const paidLabel = v.dateCreation && v.dateCreation.split('T')[0] !== (v.dateService || v.date) ? `Payé le ${Utils.formatDate(v.dateCreation.split('T')[0])}` : '';

      // Statut badge
      let statutHtml = '';
      if (v.statut === 'valide') statutHtml = '<span style="font-size:var(--font-size-xs);font-weight:600;color:#22c55e;"><iconify-icon icon="solar:check-circle-bold"></iconify-icon> Validé</span>';
      else if (v.statut === 'partiel') statutHtml = '<span style="font-size:var(--font-size-xs);font-weight:600;color:#3b82f6;"><iconify-icon icon="solar:pie-chart-2-bold"></iconify-icon> Partiel</span>';
      else if (v.statut === 'en_attente') statutHtml = '<span style="font-size:var(--font-size-xs);font-weight:600;color:#f59e0b;"><iconify-icon icon="solar:clock-circle-bold"></iconify-icon> En attente</span>';
      else if (v.statut === 'retard') statutHtml = '<span style="font-size:var(--font-size-xs);font-weight:600;color:#ef4444;"><iconify-icon icon="solar:alarm-bold"></iconify-icon> Retard</span>';
      else if (v.statut === 'supprime') statutHtml = '<span style="font-size:var(--font-size-xs);font-weight:600;color:var(--text-muted);"><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon> Supprimé</span>';

      // Debt/loss badge — use redevance as fallback for expected amount
      let manquantHtml = '';
      const redev = c ? (c.redevanceQuotidienne || 0) : 0;
      const attendu = (v.montantBrut || 0) > 0 ? v.montantBrut : redev;
      if (v.traitementManquant === 'dette') {
        const manque = attendu - (v.montantVerse || 0);
        manquantHtml = `<span style="font-size:10px;font-weight:700;background:rgba(245,158,11,0.15);color:#d97706;padding:2px 7px;border-radius:4px;"><iconify-icon icon="solar:clock-circle-bold"></iconify-icon> Dette ${manque > 0 ? Utils.formatCurrency(manque) : ''}</span>`;
      } else if (v.traitementManquant === 'perte') {
        const manque = attendu - (v.montantVerse || 0);
        manquantHtml = `<span style="font-size:10px;font-weight:700;background:rgba(239,68,68,0.15);color:#dc2626;padding:2px 7px;border-radius:4px;"><iconify-icon icon="solar:danger-triangle-bold"></iconify-icon> Perte ${manque > 0 ? Utils.formatCurrency(manque) : ''}</span>`;
      }

      // Payment method badge
      let methodHtml = '';
      if (v.moyenPaiement === 'wave') methodHtml = '<span style="font-size:10px;font-weight:600;background:rgba(34,197,94,0.1);color:#22c55e;padding:1px 6px;border-radius:4px;"><iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon> Wave</span>';
      else if (v.soumisParChauffeur) methodHtml = '<span style="font-size:10px;font-weight:600;background:rgba(59,130,246,0.1);color:#3b82f6;padding:1px 6px;border-radius:4px;"><iconify-icon icon="solar:smartphone-bold-duotone"></iconify-icon> Chauffeur</span>';

      // Courses
      const coursesHtml = `<span data-yango-courses="${v.id}" style="font-size:var(--font-size-xs);color:var(--text-muted);">${v.nombreCourses > 0 ? `${v.nombreCourses} courses` : '<iconify-icon icon="solar:refresh-bold" class="spin-icon" style="font-size:11px;"></iconify-icon>'}</span>`;

      // Action buttons
      let actionsHtml = '<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">';
      if (v.statut === 'en_attente' || v.statut === 'retard') {
        actionsHtml += `<button class="btn btn-sm btn-success" onclick="event.stopPropagation();VersementsPage._validate('${v.id}')" title="Valider"><iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon></button>`;
      }
      actionsHtml += `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();VersementsPage._edit('${v.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>`;
      if (v.statut === 'valide') {
        actionsHtml += `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();VersementsPage._exportReceipt('${v.id}')" title="Reçu PDF"><iconify-icon icon="solar:file-download-bold-duotone"></iconify-icon></button>`;
      }
      actionsHtml += '</div>';

      const isDette = v.traitementManquant === 'dette';
      const isPerte = v.traitementManquant === 'perte';
      const rowBg = isDeleted ? 'var(--bg-tertiary)' : isDette ? 'rgba(245,158,11,0.06)' : isPerte ? 'rgba(239,68,68,0.06)' : v.moyenPaiement === 'wave' ? 'rgba(34,197,94,0.06)' : 'var(--bg-tertiary)';
      const rowBorder = isDeleted ? '' : isDette ? 'border-left:3px solid #f59e0b;' : isPerte ? 'border-left:3px solid #ef4444;' : v.moyenPaiement === 'wave' ? 'border-left:3px solid #22c55e;' : '';
      return `<div data-name="${name.toLowerCase()}" style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:var(--radius-sm);background:${rowBg};${rowBorder}gap:8px;${isDeleted ? 'opacity:0.5;' : ''}">
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--font-size-sm);font-weight:600;">${name}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${dateLabel}${paidLabel ? ' • ' + paidLabel : ''}${v.periode ? ' • ' + v.periode : ''}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap;">${statutHtml} ${manquantHtml} ${methodHtml} ${coursesHtml}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:var(--font-size-sm);font-weight:700;color:${isDeleted ? 'var(--text-muted)' : isPerte ? '#ef4444' : isDette ? '#d97706' : v.statut === 'en_attente' ? '#f59e0b' : '#22c55e'};${isDeleted ? 'text-decoration:line-through;' : ''}">${Utils.formatCurrency((v.montantVerse || 0) > 0 ? v.montantVerse : (v.montantBrut || 0))}</div>
          ${actionsHtml}
        </div>
      </div>`;
    }).join('');
  },

  async _loadYangoCourses(versements, chauffeurs) {
    // Regrouper par chauffeur+date pour éviter les appels dupliqués
    const calls = {};
    versements.forEach(v => {
      const serviceDate = v.dateService || v.date;
      if (!serviceDate || !v.chauffeurId) return;
      const c = chauffeurs.find(x => x.id === v.chauffeurId);
      if (!c || !c.yangoDriverId) return;
      const key = `${c.yangoDriverId}_${serviceDate}`;
      if (!calls[key]) calls[key] = { yangoId: c.yangoDriverId, date: serviceDate, versementIds: [] };
      calls[key].versementIds.push(v.id);
    });

    // Lancer les appels en parallèle (max 5 simultanés)
    const entries = Object.values(calls);
    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          const stats = await Store.getYangoDriverStats(entry.yangoId, entry.date);
          return { ...entry, stats };
        })
      );

      results.forEach(r => {
        if (r.status !== 'fulfilled') return;
        const { versementIds, stats } = r.value;
        const nb = (stats && !stats.error) ? (stats.nbCourses || 0) : null;
        versementIds.forEach(id => {
          const cell = document.querySelector(`[data-yango-courses="${id}"]`);
          if (cell) {
            cell.innerHTML = nb !== null && nb > 0
              ? `<span style="font-weight:600;">${nb}</span>`
              : `<span style="color:var(--text-muted);">${nb === 0 ? '0' : '-'}</span>`;
          }
        });
      });
    }
  },

  _add() {
    const chauffeurs = Store.get('chauffeurs').filter(c => c.statut === 'actif');
    const session = Auth.getSession();
    const isAdmin = session && session.role === 'Administrateur';
    const statusOptions = [
      { value: 'valide', label: 'Validé' },
      { value: 'partiel', label: 'Partiel' },
      { value: 'retard', label: 'En retard' },
      { value: 'supprime', label: 'Supprimer', disabled: !isAdmin }
    ];
    const fields = [
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, placeholder: 'Sélectionner...', options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { type: 'row-start' },
      { name: 'date', label: 'Journée de service', type: 'date', required: true },
      { name: 'periode', label: 'Période (ex: 2025-S08)', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'html', html: '<div id="versement-redevance-info" style="display:none;padding:10px 14px;border-radius:8px;background:var(--bg-tertiary);margin-bottom:12px;font-size:var(--font-size-sm);border-left:3px solid var(--primary);"></div>' },
      { type: 'row-start' },
      { name: 'montantVerse', label: 'Montant versé (FCFA)', type: 'number', min: 0, step: 0.01, required: true },
      { name: 'statut', label: 'Statut', type: 'select', options: statusOptions },
      { type: 'row-end' },
      { type: 'html', html: '<div id="versement-comparaison" style="display:none;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:var(--font-size-sm);"></div>' },
      { type: 'html', html: '<div id="versement-traitement-manquant" style="display:none;padding:12px 14px;border-radius:8px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);margin-bottom:12px;font-size:var(--font-size-sm);"><label style="font-weight:600;margin-bottom:8px;display:block">Traitement du manquant</label><div style="display:flex;gap:10px;flex-wrap:wrap"><label style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:2px solid var(--border-color);background:var(--bg-primary)"><input type="radio" name="traitementManquant" value="dette" checked> <iconify-icon icon="solar:clock-circle-bold" style="color:#f59e0b"></iconify-icon> Reporter en dette</label><label style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:2px solid var(--border-color);background:var(--bg-primary)"><input type="radio" name="traitementManquant" value="perte"> <iconify-icon icon="solar:close-circle-bold" style="color:#ef4444"></iconify-icon> Passer en perte</label></div><div id="versement-manquant-detail" style="margin-top:8px;font-size:var(--font-size-xs);color:var(--text-muted)"></div></div>' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2 }
    ];

    Modal.form('<iconify-icon icon="solar:transfer-horizontal-bold-duotone" class="text-blue"></iconify-icon> Nouveau versement', FormBuilder.build(fields), async () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;
      const values = FormBuilder.getValues(body);
      const chauffeur = Store.findById('chauffeurs', values.chauffeurId);

      // Auto-déterminer le statut basé sur le montant vs redevance
      const redevance = chauffeur ? (chauffeur.redevanceQuotidienne || 0) : 0;
      const montant = parseFloat(values.montantVerse) || 0;
      if (redevance > 0 && montant > 0 && values.statut !== 'supprime') {
        if (montant >= redevance) {
          values.statut = 'valide';
        } else {
          values.statut = 'partiel';
        }
      }

      // Récupérer les stats Yango (courses, CA) pour ce chauffeur à cette date
      let nombreCourses = 0;
      let montantBrut = values.montantVerse;
      if (chauffeur && chauffeur.yangoDriverId && values.date) {
        try {
          const stats = await Store.getYangoDriverStats(chauffeur.yangoDriverId, values.date);
          if (stats && !stats.error) {
            nombreCourses = stats.nbCourses || 0;
            montantBrut = stats.totalCA || values.montantVerse;
          }
        } catch (e) {
          console.warn('Versement: impossible de récupérer les stats Yango', e);
        }
      }

      // Compute shortfall info
      const manquant = (redevance > 0 && montant < redevance) ? redevance - montant : 0;
      const traitementRadio = document.querySelector('input[name="traitementManquant"]:checked');
      const traitementManquant = manquant > 0 ? (traitementRadio ? traitementRadio.value : 'dette') : null;

      const versement = {
        id: Utils.generateId('VRS'),
        ...values,
        dateService: values.date,
        vehiculeId: chauffeur ? chauffeur.vehiculeAssigne : null,
        montantBrut,
        nombreCourses,
        commission: 0,
        montantNet: values.montantVerse,
        manquant: manquant || 0,
        traitementManquant,
        dateValidation: values.statut === 'valide' ? new Date().toISOString() : null,
        dateCreation: new Date().toISOString()
      };

      Store.add('versements', versement);
      Modal.close();

      // Message contextuel
      if (manquant > 0) {
        if (traitementManquant === 'dette') {
          Toast.show(`Versement partiel — ${Utils.formatCurrency(manquant)} reporté en dette`, 'warning');
        } else {
          Toast.show(`Versement partiel — ${Utils.formatCurrency(manquant)} passé en perte`, 'warning');
        }
      } else {
        Toast.success('Versement enregistré');
      }
      this.render();
    });

    // Bind dynamic redevance display on chauffeur selection
    setTimeout(() => {
      const chSelect = document.querySelector('[name="chauffeurId"]');
      const montantInput = document.querySelector('[name="montantVerse"]');
      const statutSelect = document.querySelector('[name="statut"]');
      const infoDiv = document.getElementById('versement-redevance-info');
      const compDiv = document.getElementById('versement-comparaison');

      const updateRedevanceInfo = () => {
        if (!infoDiv) return;
        const chId = chSelect ? chSelect.value : '';
        const ch = chId ? chauffeurs.find(c => c.id === chId) : null;
        if (ch && ch.redevanceQuotidienne > 0) {
          infoDiv.style.display = '';
          infoDiv.innerHTML = `<strong>${ch.prenom} ${ch.nom}</strong> — Redevance quotidienne : <strong style="color:var(--primary)">${Utils.formatCurrency(ch.redevanceQuotidienne)}</strong>`;
        } else if (ch) {
          infoDiv.style.display = '';
          infoDiv.innerHTML = `<strong>${ch.prenom} ${ch.nom}</strong> — <span style="color:#ef4444">⚠ Aucune redevance configurée</span>`;
        } else {
          infoDiv.style.display = 'none';
        }
        updateComparaison();
      };

      const traitementDiv = document.getElementById('versement-traitement-manquant');
      const manquantDetail = document.getElementById('versement-manquant-detail');

      const updateComparaison = () => {
        if (!compDiv) return;
        const chId = chSelect ? chSelect.value : '';
        const ch = chId ? chauffeurs.find(c => c.id === chId) : null;
        const redevance = ch ? (ch.redevanceQuotidienne || 0) : 0;
        const montant = parseFloat(montantInput ? montantInput.value : 0) || 0;

        if (redevance > 0 && montant > 0) {
          const diff = montant - redevance;
          const pct = Math.round((montant / redevance) * 100);
          if (diff >= 0) {
            compDiv.style.display = '';
            compDiv.style.background = 'rgba(34,197,94,0.08)';
            compDiv.style.borderLeft = '3px solid #22c55e';
            compDiv.innerHTML = `<iconify-icon icon="solar:check-circle-bold" style="color:#22c55e"></iconify-icon> <strong style="color:#22c55e">Complet (${pct}%)</strong>${diff > 0 ? ` — Excédent : +${Utils.formatCurrency(diff)}` : ''}`;
            if (statutSelect && statutSelect.value !== 'supprime') statutSelect.value = 'valide';
            if (traitementDiv) traitementDiv.style.display = 'none';
          } else {
            compDiv.style.display = '';
            compDiv.style.background = 'rgba(245,158,11,0.08)';
            compDiv.style.borderLeft = '3px solid #f59e0b';
            compDiv.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold" style="color:#f59e0b"></iconify-icon> <strong style="color:#f59e0b">Partiel (${pct}%)</strong> — Manque : <strong style="color:#ef4444">${Utils.formatCurrency(Math.abs(diff))}</strong>`;
            if (statutSelect && statutSelect.value !== 'supprime') statutSelect.value = 'partiel';
            // Show treatment choice
            if (traitementDiv) {
              traitementDiv.style.display = '';
              // Compute existing debt for this chauffeur
              const allVers = Store.get('versements') || [];
              const detteExistante = allVers.filter(v => v.chauffeurId === chId && v.traitementManquant === 'dette' && v.manquant > 0).reduce((s, v) => s + (v.manquant || 0), 0);
              if (manquantDetail) {
                manquantDetail.innerHTML = detteExistante > 0
                  ? `Dette existante de ${ch.prenom} ${ch.nom} : <strong style="color:#ef4444">${Utils.formatCurrency(detteExistante)}</strong> — Nouveau total si reporté : <strong>${Utils.formatCurrency(detteExistante + Math.abs(diff))}</strong>`
                  : `Aucune dette existante pour ${ch.prenom} ${ch.nom}`;
              }
            }
          }
        } else {
          compDiv.style.display = 'none';
          if (traitementDiv) traitementDiv.style.display = 'none';
        }
      };

      if (chSelect) chSelect.addEventListener('change', updateRedevanceInfo);
      if (montantInput) montantInput.addEventListener('input', updateComparaison);
    }, 100);
  },

  _edit(id) {
    const versement = Store.findById('versements', id);
    if (!versement) return;
    const chauffeurs = Store.get('chauffeurs');
    const session = Auth.getSession();
    const isAdmin = session && session.role === 'Administrateur';
    const editStatusOptions = [
      { value: 'valide', label: 'Validé' },
      { value: 'en_attente', label: 'En attente' },
      { value: 'retard', label: 'En retard' },
      { value: 'partiel', label: 'Partiel' },
      { value: 'supprime', label: 'Supprimer', disabled: !isAdmin }
    ];
    const editVersement = { ...versement, date: versement.dateService || versement.date };
    // Bloc audit — détails de paiement (lecture seule)
    const auditLines = [];
    if (versement.moyenPaiement) auditLines.push(`<b>Moyen de paiement</b> : ${versement.moyenPaiement === 'wave' ? '<span style="color:#1da1f2;">Wave</span>' : versement.moyenPaiement === 'especes' ? 'Espèces' : versement.moyenPaiement}`);
    if (versement.waveCheckoutId) auditLines.push(`<b>Réf. Wave</b> : <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:0.85em;">${versement.waveCheckoutId}</code>`);
    if (versement.wavePaymentRef) auditLines.push(`<b>Réf. paiement</b> : <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:0.85em;">${versement.wavePaymentRef}</code>`);
    if (versement.dateValidation) auditLines.push(`<b>Validé le</b> : ${new Date(versement.dateValidation).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}`);
    if (versement.dateCreation) auditLines.push(`<b>Créé le</b> : ${new Date(versement.dateCreation).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}`);
    if (versement.soumisParChauffeur) auditLines.push(`<b>Origine</b> : <span style="color:#8b5cf6;"><iconify-icon icon="solar:smartphone-bold-duotone" style="font-size:0.9em;"></iconify-icon> Soumis par le chauffeur (app)</span>`);
    else auditLines.push(`<b>Origine</b> : <span style="color:#f59e0b;"><iconify-icon icon="solar:monitor-bold-duotone" style="font-size:0.9em;"></iconify-icon> Saisi par l'admin</span>`);
    const auditHtml = auditLines.length > 0 ? `<div style="padding:12px 14px;border-radius:8px;background:var(--bg-tertiary);border-left:3px solid #3b82f6;margin-bottom:16px;font-size:var(--font-size-sm);line-height:1.8;">
      <div style="font-weight:700;margin-bottom:6px;color:#3b82f6;"><iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon> Détails du paiement</div>
      ${auditLines.join('<br>')}
    </div>` : '';

    const fields = [
      { type: 'html', html: auditHtml },
      { name: 'chauffeurId', label: 'Chauffeur', type: 'select', required: true, options: chauffeurs.map(c => ({ value: c.id, label: `${c.prenom} ${c.nom}` })) },
      { type: 'row-start' },
      { name: 'date', label: 'Journée de service', type: 'date', required: true },
      { name: 'periode', label: 'Période (ex: 2025-S08)', type: 'text' },
      { type: 'row-end' },
      { type: 'html', html: '<div id="versement-redevance-info" style="display:none;padding:10px 14px;border-radius:8px;background:var(--bg-tertiary);margin-bottom:12px;font-size:var(--font-size-sm);border-left:3px solid var(--primary);"></div>' },
      { type: 'row-start' },
      { name: 'montantVerse', label: 'Montant versé (FCFA)', type: 'number', min: 0, step: 0.01 },
      { name: 'statut', label: 'Statut', type: 'select', options: editStatusOptions },
      { type: 'row-end' },
      { type: 'html', html: '<div id="versement-comparaison" style="display:none;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:var(--font-size-sm);"></div>' },
      { type: 'html', html: '<div id="versement-traitement-manquant" style="display:none;padding:12px 14px;border-radius:8px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);margin-bottom:12px;font-size:var(--font-size-sm);"><label style="font-weight:600;margin-bottom:8px;display:block">Traitement du manquant</label><div style="display:flex;gap:10px;flex-wrap:wrap"><label style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:2px solid var(--border-color);background:var(--bg-primary)"><input type="radio" name="traitementManquant" value="dette" ' + (versement.traitementManquant !== 'perte' ? 'checked' : '') + '> <iconify-icon icon="solar:clock-circle-bold" style="color:#f59e0b"></iconify-icon> Reporter en dette</label><label style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:2px solid var(--border-color);background:var(--bg-primary)"><input type="radio" name="traitementManquant" value="perte" ' + (versement.traitementManquant === 'perte' ? 'checked' : '') + '> <iconify-icon icon="solar:close-circle-bold" style="color:#ef4444"></iconify-icon> Passer en perte</label></div><div id="versement-manquant-detail" style="margin-top:8px;font-size:var(--font-size-xs);color:var(--text-muted)"></div></div>' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2 }
    ];

    Modal.form('<iconify-icon icon="solar:pen-bold-duotone" class="text-blue"></iconify-icon> Modifier versement', FormBuilder.build(fields, editVersement), () => {
      const body = document.getElementById('modal-body');
      const values = FormBuilder.getValues(body);
      values.dateService = values.date;
      values.montantBrut = values.montantVerse;
      values.montantNet = values.montantVerse;
      values.commission = 0;

      // Calculer le manquant
      const chauffeur = Store.findById('chauffeurs', values.chauffeurId);
      const redevance = chauffeur ? (chauffeur.redevanceQuotidienne || 0) : 0;
      const montant = parseFloat(values.montantVerse) || 0;
      const manquant = (redevance > 0 && montant < redevance) ? redevance - montant : 0;
      const traitementRadio = document.querySelector('input[name="traitementManquant"]:checked');
      values.manquant = manquant || 0;
      values.traitementManquant = manquant > 0 ? (traitementRadio ? traitementRadio.value : 'dette') : null;

      // Auto-set statut
      if (redevance > 0 && montant > 0 && values.statut !== 'supprime') {
        if (montant >= redevance) {
          values.statut = 'valide';
        } else {
          values.statut = 'partiel';
        }
      }

      if (values.statut === 'valide' && !versement.dateValidation) {
        values.dateValidation = new Date().toISOString();
      }
      Store.update('versements', id, values);
      Modal.close();
      if (manquant > 0) {
        if (values.traitementManquant === 'dette') {
          Toast.show(`Versement modifié — ${Utils.formatCurrency(manquant)} reporté en dette`, 'warning');
        } else {
          Toast.show(`Versement modifié — ${Utils.formatCurrency(manquant)} passé en perte`, 'warning');
        }
      } else {
        Toast.success('Versement modifié');
      }
      this.render();
    });

    // Bind dynamic redevance + comparaison display
    setTimeout(() => {
      const chSelect = document.querySelector('[name="chauffeurId"]');
      const montantInput = document.querySelector('[name="montantVerse"]');
      const statutSelect = document.querySelector('[name="statut"]');
      const infoDiv = document.getElementById('versement-redevance-info');
      const compDiv = document.getElementById('versement-comparaison');
      const traitementDiv = document.getElementById('versement-traitement-manquant');
      const manquantDetail = document.getElementById('versement-manquant-detail');

      const updateRedevanceInfo = () => {
        if (!infoDiv) return;
        const chId = chSelect ? chSelect.value : '';
        const ch = chId ? chauffeurs.find(c => c.id === chId) : null;
        if (ch && ch.redevanceQuotidienne > 0) {
          infoDiv.style.display = '';
          infoDiv.innerHTML = `<strong>${ch.prenom} ${ch.nom}</strong> — Redevance quotidienne : <strong style="color:var(--primary)">${Utils.formatCurrency(ch.redevanceQuotidienne)}</strong>`;
        } else if (ch) {
          infoDiv.style.display = '';
          infoDiv.innerHTML = `<strong>${ch.prenom} ${ch.nom}</strong> — <span style="color:#ef4444">⚠ Aucune redevance configurée</span>`;
        } else {
          infoDiv.style.display = 'none';
        }
        updateComparaison();
      };

      const updateComparaison = () => {
        if (!compDiv) return;
        const chId = chSelect ? chSelect.value : '';
        const ch = chId ? chauffeurs.find(c => c.id === chId) : null;
        const redevance = ch ? (ch.redevanceQuotidienne || 0) : 0;
        const montant = parseFloat(montantInput ? montantInput.value : 0) || 0;

        if (redevance > 0 && montant > 0) {
          const diff = montant - redevance;
          const pct = Math.round((montant / redevance) * 100);
          if (diff >= 0) {
            compDiv.style.display = '';
            compDiv.style.background = 'rgba(34,197,94,0.08)';
            compDiv.style.borderLeft = '3px solid #22c55e';
            compDiv.innerHTML = `<iconify-icon icon="solar:check-circle-bold" style="color:#22c55e"></iconify-icon> <strong style="color:#22c55e">Complet (${pct}%)</strong>${diff > 0 ? ` — Excédent : +${Utils.formatCurrency(diff)}` : ''}`;
            if (statutSelect && statutSelect.value !== 'supprime') statutSelect.value = 'valide';
            if (traitementDiv) traitementDiv.style.display = 'none';
          } else {
            compDiv.style.display = '';
            compDiv.style.background = 'rgba(245,158,11,0.08)';
            compDiv.style.borderLeft = '3px solid #f59e0b';
            compDiv.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold" style="color:#f59e0b"></iconify-icon> <strong style="color:#f59e0b">Partiel (${pct}%)</strong> — Manque : <strong style="color:#ef4444">${Utils.formatCurrency(Math.abs(diff))}</strong>`;
            if (statutSelect && statutSelect.value !== 'supprime') statutSelect.value = 'partiel';
            if (traitementDiv) {
              traitementDiv.style.display = '';
              const allVers = Store.get('versements') || [];
              const detteExistante = allVers.filter(v => v.chauffeurId === chId && v.id !== id && v.traitementManquant === 'dette' && v.manquant > 0).reduce((s, v) => s + (v.manquant || 0), 0);
              if (manquantDetail) {
                manquantDetail.innerHTML = detteExistante > 0
                  ? `Dette existante de ${ch.prenom} ${ch.nom} : <strong style="color:#ef4444">${Utils.formatCurrency(detteExistante)}</strong> — Nouveau total si reporté : <strong>${Utils.formatCurrency(detteExistante + Math.abs(diff))}</strong>`
                  : `Aucune dette existante pour ${ch.prenom} ${ch.nom}`;
              }
            }
          }
        } else {
          compDiv.style.display = 'none';
          if (traitementDiv) traitementDiv.style.display = 'none';
        }
      };

      if (chSelect) chSelect.addEventListener('change', updateRedevanceInfo);
      if (montantInput) montantInput.addEventListener('input', updateComparaison);
      // Trigger initial display
      updateRedevanceInfo();
    }, 100);
  },

  _validate(id) {
    Store.update('versements', id, {
      statut: 'valide',
      dateValidation: new Date().toISOString()
    });
    Toast.success('Versement valid\u00e9');
    this.render();
    Header.refreshNotifications();
  },

  // =================== KPI DETAIL MODALS ===================

  _showKpiDetail(type) {
    const d = this._kpiData;
    if (!d) return;
    let title = '';
    let html = '';

    const thStyle = 'padding:10px 12px;text-align:left;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);';
    const tdStyle = 'padding:10px 12px;border-bottom:1px solid var(--border-color);';

    switch(type) {
      case 'attendu': {
        title = '<iconify-icon icon="solar:wallet-money-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon> Détail — Montant attendu';
        const byDriver = {};
        d.detailProgrammes.forEach(p => {
          if (!byDriver[p.chauffeurId]) byDriver[p.chauffeurId] = { nom: p.nom, prenom: p.prenom, total: 0, jours: 0, redevance: p.redevance };
          byDriver[p.chauffeurId].total += p.redevance;
          byDriver[p.chauffeurId].jours++;
        });
        const rows = Object.values(byDriver).sort((a,b) => b.total - a.total);
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Basé sur le planning et la redevance quotidienne de chaque chauffeur pour <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}text-align:center;">Jours</th>
            <th style="${thStyle}text-align:right;">Redevance/jour</th>
            <th style="${thStyle}text-align:right;">Total</th>
          </tr></thead><tbody>
          ${rows.map(r => `<tr>
            <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
            <td style="${tdStyle}text-align:center;">${r.jours}</td>
            <td style="${tdStyle}text-align:right;">${Utils.formatCurrency(r.redevance)}</td>
            <td style="${tdStyle}text-align:right;font-weight:600;">${Utils.formatCurrency(r.total)}</td>
          </tr>`).join('')}
          </tbody>
          <tfoot><tr style="border-top:2px solid var(--border-color);">
            <td style="padding:10px 12px;font-weight:700;">Total</td>
            <td style="padding:10px 12px;text-align:center;font-weight:700;">${d.detailProgrammes.length} jour${d.detailProgrammes.length > 1 ? 's' : ''}</td>
            <td></td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;">${Utils.formatCurrency(d.totalAttendu)}</td>
          </tr></tfoot>
        </table>`;
        break;
      }
      case 'verse': {
        title = '<iconify-icon icon="solar:check-circle-bold-duotone" style="color:#22c55e;"></iconify-icon> Détail — Montant versé';
        const rows = [...d.detailVerse].sort((a,b) => b.montant - a.montant);
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Versements validés et partiels pour <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}">Date</th>
            <th style="${thStyle}text-align:right;">Montant</th>
            <th style="${thStyle}text-align:center;">Statut</th>
          </tr></thead><tbody>
          ${rows.length ? rows.map(r => `<tr>
            <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
            <td style="${tdStyle}">${Utils.formatDate(r.date)}</td>
            <td style="${tdStyle}text-align:right;font-weight:600;">${Utils.formatCurrency(r.montant)}</td>
            <td style="${tdStyle}text-align:center;">${Utils.statusBadge(r.statut)}</td>
          </tr>`).join('') : `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--text-muted);">Aucun versement pour cette période</td></tr>`}
          </tbody>
          ${rows.length ? `<tfoot><tr style="border-top:2px solid var(--border-color);">
            <td colspan="2" style="padding:10px 12px;font-weight:700;">${rows.length} versement${rows.length > 1 ? 's' : ''}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;">${Utils.formatCurrency(d.totalVerse)}</td>
            <td></td>
          </tr></tfoot>` : ''}
        </table>`;
        break;
      }
      case 'taux': {
        title = '<iconify-icon icon="solar:sale-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon> Détail — Taux de recouvrement';
        const byDriver = {};
        d.detailProgrammes.forEach(p => {
          if (!byDriver[p.chauffeurId]) byDriver[p.chauffeurId] = { nom: p.nom, prenom: p.prenom, attendu: 0, verse: 0 };
          byDriver[p.chauffeurId].attendu += p.redevance;
        });
        d.detailVerse.forEach(v => {
          if (!byDriver[v.chauffeurId]) byDriver[v.chauffeurId] = { nom: v.nom, prenom: v.prenom, attendu: 0, verse: 0 };
          byDriver[v.chauffeurId].verse += v.montant;
        });
        const rows = Object.values(byDriver).sort((a,b) => {
          const pctA = a.attendu > 0 ? a.verse / a.attendu : 0;
          const pctB = b.attendu > 0 ? b.verse / b.attendu : 0;
          return pctA - pctB;
        });
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Comparaison attendu vs versé par chauffeur — <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}text-align:right;">Attendu</th>
            <th style="${thStyle}text-align:right;">Versé</th>
            <th style="${thStyle}text-align:right;">Écart</th>
            <th style="${thStyle}text-align:right;">%</th>
          </tr></thead><tbody>
          ${rows.map(r => {
            const ecart = r.verse - r.attendu;
            const pct = r.attendu > 0 ? (r.verse / r.attendu * 100) : 0;
            const pctColor = pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
            return `<tr>
              <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
              <td style="${tdStyle}text-align:right;">${Utils.formatCurrency(r.attendu)}</td>
              <td style="${tdStyle}text-align:right;font-weight:600;">${Utils.formatCurrency(r.verse)}</td>
              <td style="${tdStyle}text-align:right;color:${ecart >= 0 ? '#22c55e' : '#ef4444'};">${ecart >= 0 ? '+' : ''}${Utils.formatCurrency(ecart)}</td>
              <td style="${tdStyle}text-align:right;font-weight:700;color:${pctColor};">${pct.toFixed(0)}%</td>
            </tr>`;
          }).join('')}
          </tbody>
          <tfoot><tr style="border-top:2px solid var(--border-color);">
            <td style="padding:10px 12px;font-weight:700;">Total</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;">${Utils.formatCurrency(d.totalAttendu)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;">${Utils.formatCurrency(d.totalVerse)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;color:${d.totalVerse - d.totalAttendu >= 0 ? '#22c55e' : '#ef4444'};">${d.totalVerse - d.totalAttendu >= 0 ? '+' : ''}${Utils.formatCurrency(d.totalVerse - d.totalAttendu)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;">${d.tauxRecouvrement.toFixed(1)}%</td>
          </tr></tfoot>
        </table>`;
        break;
      }
      case 'programmes': {
        title = '<iconify-icon icon="solar:users-group-rounded-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon> Chauffeurs programmés';
        const byDriver = {};
        d.detailProgrammes.forEach(p => {
          if (!byDriver[p.chauffeurId]) byDriver[p.chauffeurId] = { nom: p.nom, prenom: p.prenom, redevance: p.redevance, jours: 0 };
          byDriver[p.chauffeurId].jours++;
        });
        // Check which drivers have paid
        const paidDriverIds = new Set(d.detailVerse.map(v => v.chauffeurId));
        const retardDriverIds = new Set(d.detailRetard.map(r => r.chauffeurId));
        const rows = Object.entries(byDriver).sort((a,b) => a[1].nom.localeCompare(b[1].nom));
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Chauffeurs planifiés (hors absences/inactifs) — <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}text-align:center;">Jours</th>
            <th style="${thStyle}text-align:right;">Redevance/jour</th>
            <th style="${thStyle}text-align:right;">Total attendu</th>
            <th style="${thStyle}text-align:center;">Statut versement</th>
          </tr></thead><tbody>
          ${rows.map(([id, r]) => {
            const paid = paidDriverIds.has(id);
            const late = retardDriverIds.has(id);
            const badge = paid ? '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:rgba(34,197,94,0.1);color:#22c55e;">Versé</span>' : late ? '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:rgba(239,68,68,0.1);color:#ef4444;">Impayé</span>' : '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;background:rgba(107,114,128,0.1);color:#6b7280;">—</span>';
            return `<tr>
              <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
              <td style="${tdStyle}text-align:center;">${r.jours}</td>
              <td style="${tdStyle}text-align:right;">${Utils.formatCurrency(r.redevance)}</td>
              <td style="${tdStyle}text-align:right;font-weight:600;">${Utils.formatCurrency(r.redevance * r.jours)}</td>
              <td style="${tdStyle}text-align:center;">${badge}</td>
            </tr>`;
          }).join('')}
          </tbody>
          <tfoot><tr style="border-top:2px solid var(--border-color);">
            <td style="padding:10px 12px;font-weight:700;">${rows.length} chauffeur${rows.length > 1 ? 's' : ''}</td>
            <td style="padding:10px 12px;text-align:center;font-weight:700;">${d.detailProgrammes.length}</td>
            <td></td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;">${Utils.formatCurrency(d.totalAttendu)}</td>
            <td></td>
          </tr></tfoot>
        </table>`;
        break;
      }
      case 'retard': {
        title = '<iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:#ef4444;"></iconify-icon> Versements en retard';
        const rows = [...d.detailRetard].sort((a,b) => a.date.localeCompare(b.date));
        const totalDu = rows.reduce((s,r) => s + r.redevance, 0);
        html = `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">Chauffeurs programmés n'ayant pas encore versé — <strong>${d.periodLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid var(--border-color);">
            <th style="${thStyle}">Chauffeur</th>
            <th style="${thStyle}">Date</th>
            <th style="${thStyle}text-align:right;">Redevance due</th>
          </tr></thead><tbody>
          ${rows.length ? rows.map(r => `<tr>
            <td style="${tdStyle}font-weight:500;">${r.prenom} ${r.nom}</td>
            <td style="${tdStyle}">${Utils.formatDate(r.date)}</td>
            <td style="${tdStyle}text-align:right;font-weight:600;color:#ef4444;">${Utils.formatCurrency(r.redevance)}</td>
          </tr>`).join('') : `<tr><td colspan="3" style="padding:20px;text-align:center;color:var(--text-muted);">Aucun versement en retard 🎉</td></tr>`}
          </tbody>
          ${rows.length ? `<tfoot><tr style="border-top:2px solid var(--border-color);">
            <td colspan="2" style="padding:10px 12px;font-weight:700;">${rows.length} impayé${rows.length > 1 ? 's' : ''}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:1.05rem;color:#ef4444;">${Utils.formatCurrency(totalDu)}</td>
          </tr></tfoot>` : ''}
        </table>`;
        break;
      }
    }
    this._showKpiModal(title, html);
  },

  _showKpiModal(title, html) {
    const existing = document.getElementById('kpi-detail-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'kpi-detail-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:var(--radius-lg);padding:24px;max-width:800px;width:92%;max-height:82vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.1rem;">${title}</h3>
          <button onclick="document.getElementById('kpi-detail-overlay').remove()" style="background:var(--bg-tertiary);border:none;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;">&times;</button>
        </div>
        ${html}
      </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
    document.body.appendChild(overlay);
  },

  _exportReceipt(id) {
    const v = Store.findById('versements', id);
    if (!v) return;
    DashboardPage._generateReceiptPDF(v.chauffeurId, v.date, v.montantVerse, v.moyenPaiement, v.referencePaiement);
  },

  _exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const versements = Store.get('versements').filter(_isRealVersement);
    const chauffeurs = Store.get('chauffeurs');

    doc.setFontSize(18);
    doc.text('Rapport des Versements', 14, 22);
    doc.setFontSize(10);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);

    const rows = versements.slice(0, 50).map(v => {
      const ch = chauffeurs.find(c => c.id === v.chauffeurId);
      return [
        ch ? `${ch.prenom} ${ch.nom}` : v.chauffeurId,
        Utils.formatDate(v.date),
        Utils.formatCurrency(v.montantVerse),
        v.statut
      ];
    });

    doc.autoTable({
      head: [['Chauffeur', 'Date', 'Montant', 'Statut']],
      body: rows,
      startY: 36,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save('versements-pilote.pdf');
    Toast.success('PDF exporté');
  },

  _exportCSV() {
    const versements = Store.get('versements').filter(_isRealVersement);
    const chauffeurs = Store.get('chauffeurs');

    let csv = 'Chauffeur,Date,Montant,Statut,Commentaire\n';
    versements.forEach(v => {
      const ch = chauffeurs.find(c => c.id === v.chauffeurId);
      const name = ch ? `${ch.prenom} ${ch.nom}` : v.chauffeurId;
      csv += `"${name}","${v.date}","${v.montantVerse}","${v.statut}","${(v.commentaire || '').replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'versements-pilote.csv';
    a.click();
    URL.revokeObjectURL(url);
    Toast.success('CSV exporté');
  },

  // =================== RECETTES / VERSEMENTS RÉCURRENTS ===================

  _showRecettesRecurrentes() {
    const modeles = Store.get('versementRecurrents') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const chMap = {};
    chauffeurs.forEach(c => chMap[c.id] = `${c.prenom} ${c.nom}`);

    const recurrenceLabels = { par_shift: 'Par shift', quotidien: 'Quotidien', hebdo: 'Hebdomadaire', mensuel: 'Mensuel' };
    const recurrenceBadge = { par_shift: 'success', quotidien: 'info', hebdo: 'warning', mensuel: 'primary' };

    const rows = modeles.map(m => {
      const montantDisplay = m.useRedevance
        ? (m.chauffeurId && chMap[m.chauffeurId]
          ? `<span style="color:#22c55e;font-size:11px;font-weight:600">${Utils.formatCurrency(chMap[m.chauffeurId].redevanceQuotidienne || 0)}</span> <span style="font-size:10px;color:var(--text-muted)">(redevance)</span>`
          : '<span style="color:#22c55e;font-size:11px;font-weight:600">Selon redevance</span>')
        : Utils.formatCurrency(m.montant);
      return `
      <tr>
        <td style="font-weight:500">${m.nom}</td>
        <td>${m.chauffeurId ? (chMap[m.chauffeurId] || m.chauffeurId) : 'Tous (planifiés)'}</td>
        <td style="font-weight:600">${montantDisplay}</td>
        <td><span class="badge badge-${recurrenceBadge[m.recurrence] || 'secondary'}">${recurrenceLabels[m.recurrence] || m.recurrence}</span></td>
        <td><span class="badge badge-info">Référence</span></td>
        <td>
          <label style="cursor:pointer"><input type="checkbox" ${m.actif ? 'checked' : ''} onchange="VersementsPage._toggleRecVersement('${m.id}', this.checked)"> Actif</label>
        </td>
        <td style="white-space:nowrap">
          <button class="btn-icon" title="Modifier" onclick="VersementsPage._editRecVersement('${m.id}')" style="color:var(--primary)"><iconify-icon icon="solar:pen-bold"></iconify-icon></button>
          <button class="btn-icon btn-danger" title="Supprimer" onclick="VersementsPage._deleteRecVersement('${m.id}')"><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon></button>
        </td>
      </tr>
    `;
    }).join('');

    Modal.open({
      title: '<iconify-icon icon="solar:repeat-bold-duotone" style="color:#22c55e;"></iconify-icon> Versements récurrents',
      body: `
        <div style="display:flex;gap:8px;margin-bottom:1rem">
          <button class="btn btn-primary btn-sm" onclick="VersementsPage._addRecVersement()"><iconify-icon icon="solar:add-circle-bold"></iconify-icon> Nouveau modèle</button>
        </div>
        <div style="padding:8px 12px;border-radius:8px;background:var(--bg-tertiary);margin-bottom:1rem;font-size:var(--font-size-xs);color:var(--text-muted);">
          <iconify-icon icon="solar:info-circle-bold" style="color:var(--primary);"></iconify-icon>
          Les modèles servent de référence. Les versements ne sont créés que lorsque vous encaissez un paiement réel.
        </div>
        ${modeles.length ? `
          <div style="max-height:350px;overflow-y:auto">
            <table class="table" style="width:100%;font-size:var(--font-size-sm)">
              <thead><tr><th>Nom</th><th>Chauffeur</th><th>Montant</th><th>Récurrence</th><th>Type</th><th>Actif</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        ` : '<p style="text-align:center;color:var(--text-muted);padding:2rem 0">Aucun modèle. Créez-en un pour commencer.</p>'}
      `,
      footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>',
      size: 'large'
    });
  },

  _addRecVersement() {
    const chauffeurs = Store.get('chauffeurs') || [];
    Modal.form(
      '<iconify-icon icon="solar:add-circle-bold" style="color:#22c55e;"></iconify-icon> Nouveau modèle de versement',
      `<form id="form-rec-versement" class="modal-form">
        <div class="form-group"><label>Nom du modèle *</label><input type="text" name="nom" required placeholder="Ex: Recette journalière"></div>
        <div class="form-group"><label>Chauffeur</label>
          <select name="chauffeurId" id="rec-v-chauffeur-select"><option value="">Tous les chauffeurs planifiés</option>
            ${chauffeurs.filter(c => c.statut === 'actif').map(c => `<option value="${c.id}">${c.prenom} ${c.nom}${c.redevanceQuotidienne ? ' (' + Utils.formatCurrency(c.redevanceQuotidienne) + '/j)' : ''}</option>`).join('')}
          </select></div>
        <div class="form-group" style="padding:8px 12px;border-radius:8px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2)">
          <label style="cursor:pointer;display:flex;align-items:center;gap:8px;margin:0">
            <input type="checkbox" name="useRedevance" id="rec-v-use-redevance">
            <span><strong>Utiliser la redevance du chauffeur</strong><br><span style="font-size:11px;color:var(--text-muted)">Le montant sera automatiquement celui de la redevance quotidienne définie sur la fiche chauffeur</span></span>
          </label>
        </div>
        <div class="form-group" id="rec-v-montant-group"><label>Montant (FCFA) *</label><input type="number" name="montant" required min="1" placeholder="0" id="rec-v-montant"></div>
        <input type="hidden" name="statut" value="en_attente">
        <div class="form-group"><label>Récurrence *</label>
          <select name="recurrence" required id="rec-v-recurrence-select">
            <option value="par_shift">Par shift (1 versement par créneau planifié)</option>
            <option value="quotidien">Quotidien (chaque jour de la semaine)</option>
            <option value="hebdo">Hebdomadaire</option>
            <option value="mensuel">Mensuel</option>
          </select></div>
        <div class="form-group" id="rec-v-jour-semaine" style="display:none"><label>Jour de la semaine</label>
          <select name="jourSemaine"><option value="0">Lundi</option><option value="1">Mardi</option><option value="2">Mercredi</option><option value="3">Jeudi</option><option value="4">Vendredi</option><option value="5">Samedi</option><option value="6">Dimanche</option></select></div>
        <div class="form-group" id="rec-v-jour-mois" style="display:none"><label>Jour du mois</label><input type="number" name="jourMois" min="1" max="31" value="1"></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-rec-versement'));
        const useRedevance = !!document.getElementById('rec-v-use-redevance').checked;
        if (!fd.get('nom')) { Toast.show('Nom requis', 'error'); return; }
        if (!useRedevance && !fd.get('montant')) { Toast.show('Montant requis (ou cochez "Utiliser la redevance")', 'error'); return; }
        Store.add('versementRecurrents', {
          id: 'VREC-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
          nom: fd.get('nom'), chauffeurId: fd.get('chauffeurId') || null,
          montant: useRedevance ? 0 : parseInt(fd.get('montant')),
          useRedevance: useRedevance,
          statut: fd.get('statut') || 'en_attente',
          recurrence: fd.get('recurrence'),
          jourSemaine: fd.get('recurrence') === 'hebdo' ? parseInt(fd.get('jourSemaine')) : null,
          jourMois: fd.get('recurrence') === 'mensuel' ? parseInt(fd.get('jourMois')) : null,
          actif: true, dateCreation: new Date().toISOString()
        });
        Modal.close();
        Toast.show('Modèle créé', 'success');
        setTimeout(() => this._showRecettesRecurrentes(), 200);
      }
    );
    // Toggle useRedevance → hide/show montant field
    const useRedCb = document.getElementById('rec-v-use-redevance');
    const montantGroup = document.getElementById('rec-v-montant-group');
    const montantInput = document.getElementById('rec-v-montant');
    if (useRedCb) useRedCb.addEventListener('change', () => {
      if (useRedCb.checked) {
        montantGroup.style.display = 'none';
        montantInput.removeAttribute('required');
      } else {
        montantGroup.style.display = '';
        montantInput.setAttribute('required', 'true');
      }
    });
    const recSelect = document.getElementById('rec-v-recurrence-select');
    if (recSelect) recSelect.addEventListener('change', () => {
      document.getElementById('rec-v-jour-semaine').style.display = recSelect.value === 'hebdo' ? '' : 'none';
      document.getElementById('rec-v-jour-mois').style.display = recSelect.value === 'mensuel' ? '' : 'none';
    });
  },

  _editRecVersement(id) {
    const modeles = Store.get('versementRecurrents') || [];
    const m = modeles.find(x => x.id === id);
    if (!m) { Toast.show('Modèle introuvable', 'error'); return; }
    const chauffeurs = Store.get('chauffeurs') || [];
    const joursSemaine = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

    Modal.form(
      '<iconify-icon icon="solar:pen-bold" style="color:var(--primary);"></iconify-icon> Modifier le modèle',
      `<form id="form-rec-versement-edit" class="modal-form">
        <div class="form-group"><label>Nom du modèle *</label><input type="text" name="nom" required value="${m.nom || ''}"></div>
        <div class="form-group"><label>Chauffeur</label>
          <select name="chauffeurId" id="rec-ve-chauffeur-select"><option value="">Tous les chauffeurs planifiés</option>
            ${chauffeurs.filter(c => c.statut === 'actif').map(c => `<option value="${c.id}" ${c.id === m.chauffeurId ? 'selected' : ''}>${c.prenom} ${c.nom}${c.redevanceQuotidienne ? ' (' + Utils.formatCurrency(c.redevanceQuotidienne) + '/j)' : ''}</option>`).join('')}
          </select></div>
        <div class="form-group" style="padding:8px 12px;border-radius:8px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2)">
          <label style="cursor:pointer;display:flex;align-items:center;gap:8px;margin:0">
            <input type="checkbox" name="useRedevance" id="rec-ve-use-redevance" ${m.useRedevance ? 'checked' : ''}>
            <span><strong>Utiliser la redevance du chauffeur</strong><br><span style="font-size:11px;color:var(--text-muted)">Le montant sera automatiquement celui de la redevance quotidienne définie sur la fiche chauffeur</span></span>
          </label>
        </div>
        <div class="form-group" id="rec-ve-montant-group" ${m.useRedevance ? 'style="display:none"' : ''}><label>Montant (FCFA) *</label><input type="number" name="montant" ${m.useRedevance ? '' : 'required'} min="1" value="${m.montant || ''}" id="rec-ve-montant"></div>
        <div class="form-group"><label>Récurrence *</label>
          <select name="recurrence" required id="rec-ve-recurrence-select">
            <option value="par_shift" ${m.recurrence === 'par_shift' ? 'selected' : ''}>Par shift (1 versement par créneau planifié)</option>
            <option value="quotidien" ${m.recurrence === 'quotidien' ? 'selected' : ''}>Quotidien (chaque jour de la semaine)</option>
            <option value="hebdo" ${m.recurrence === 'hebdo' ? 'selected' : ''}>Hebdomadaire</option>
            <option value="mensuel" ${m.recurrence === 'mensuel' ? 'selected' : ''}>Mensuel</option>
          </select></div>
        <div class="form-group" id="rec-ve-jour-semaine" style="${m.recurrence === 'hebdo' ? '' : 'display:none'}"><label>Jour de la semaine</label>
          <select name="jourSemaine">${joursSemaine.map((j, i) => `<option value="${i}" ${i === m.jourSemaine ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
        <div class="form-group" id="rec-ve-jour-mois" style="${m.recurrence === 'mensuel' ? '' : 'display:none'}"><label>Jour du mois</label><input type="number" name="jourMois" min="1" max="31" value="${m.jourMois || 1}"></div>
      </form>`,
      () => {
        const fd = new FormData(document.getElementById('form-rec-versement-edit'));
        const useRedevance = !!document.getElementById('rec-ve-use-redevance').checked;
        if (!fd.get('nom')) { Toast.show('Nom requis', 'error'); return; }
        if (!useRedevance && !fd.get('montant')) { Toast.show('Montant requis (ou cochez "Utiliser la redevance")', 'error'); return; }
        Store.update('versementRecurrents', id, {
          nom: fd.get('nom'), chauffeurId: fd.get('chauffeurId') || null,
          montant: useRedevance ? 0 : parseInt(fd.get('montant')),
          useRedevance: useRedevance,
          recurrence: fd.get('recurrence'),
          jourSemaine: fd.get('recurrence') === 'hebdo' ? parseInt(fd.get('jourSemaine')) : null,
          jourMois: fd.get('recurrence') === 'mensuel' ? parseInt(fd.get('jourMois')) : null
        });
        Modal.close();
        Toast.show('Modèle modifié', 'success');
        setTimeout(() => this._showRecettesRecurrentes(), 200);
      }
    );
    // Toggle useRedevance → hide/show montant field
    const useRedCb = document.getElementById('rec-ve-use-redevance');
    const montantGroup = document.getElementById('rec-ve-montant-group');
    const montantInput = document.getElementById('rec-ve-montant');
    if (useRedCb) useRedCb.addEventListener('change', () => {
      if (useRedCb.checked) {
        montantGroup.style.display = 'none';
        montantInput.removeAttribute('required');
      } else {
        montantGroup.style.display = '';
        montantInput.setAttribute('required', 'true');
      }
    });
    const recSelect = document.getElementById('rec-ve-recurrence-select');
    if (recSelect) recSelect.addEventListener('change', () => {
      document.getElementById('rec-ve-jour-semaine').style.display = recSelect.value === 'hebdo' ? '' : 'none';
      document.getElementById('rec-ve-jour-mois').style.display = recSelect.value === 'mensuel' ? '' : 'none';
    });
  },

  _toggleRecVersement(id, actif) {
    Store.update('versementRecurrents', id, { actif });
    Toast.show(actif ? 'Modèle activé' : 'Modèle désactivé', 'success');
  },

  _deleteRecVersement(id) {
    if (!confirm('Supprimer ce modèle ?')) return;
    Store.delete('versementRecurrents', id);
    Toast.show('Modèle supprimé', 'success');
    setTimeout(() => this._showRecettesRecurrentes(), 200);
  },

  _generateVersementGrid() {
    const modeles = (Store.get('versementRecurrents') || []).filter(m => m.actif);
    if (!modeles.length) { Toast.show('Aucun modèle actif', 'error'); return; }

    const planning = Store.get('planning') || [];
    const chauffeurs = Store.get('chauffeurs') || [];
    const vehicules = Store.get('vehicules') || [];
    const versements = Store.get('versements') || [];
    const chMap = {};
    chauffeurs.forEach(c => { chMap[c.id] = c; });
    const vehMap = {};
    vehicules.forEach(v => { vehMap[v.id] = v.immatriculation || `${v.marque} ${v.modele}`; });

    // Use selected period or today to determine the week
    const refDate = this._selectedPeriod ? new Date(this._selectedPeriod) : new Date();
    const dayOfWeek = refDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(refDate);
    weekStart.setDate(refDate.getDate() + mondayOffset);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d.toISOString().split('T')[0]);
    }

    const weekShifts = planning.filter(s => days.includes(s.date));
    const grid = [];

    // Helper: resolve montant — use driver's redevanceQuotidienne if useRedevance
    const getMontant = (m, ch) => {
      if (m.useRedevance && ch) return ch.redevanceQuotidienne || 0;
      return m.montant || 0;
    };

    modeles.forEach(m => {
      if (m.recurrence === 'par_shift') {
        const shifts = m.chauffeurId ? weekShifts.filter(s => s.chauffeurId === m.chauffeurId) : weekShifts;
        shifts.forEach(s => {
          const ch = chMap[s.chauffeurId];
          const montant = getMontant(m, ch);
          if (m.useRedevance && montant <= 0) return; // skip drivers with no redevance
          grid.push({ date: s.date, chauffeurId: s.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : s.chauffeurId,
            vehiculeId: ch ? ch.vehiculeAssigne : null, montant, statut: m.statut || 'en_attente', modeleNom: m.nom });
        });
      } else if (m.recurrence === 'quotidien') {
        days.forEach(date => {
          if (m.chauffeurId) {
            const ch = chMap[m.chauffeurId];
            const montant = getMontant(m, ch);
            grid.push({ date, chauffeurId: m.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : m.chauffeurId,
              vehiculeId: ch ? ch.vehiculeAssigne : null, montant, statut: m.statut || 'en_attente', modeleNom: m.nom });
          } else {
            const dayShifts = weekShifts.filter(s => s.date === date);
            const seen = new Set();
            dayShifts.forEach(s => {
              if (seen.has(s.chauffeurId)) return;
              seen.add(s.chauffeurId);
              const ch = chMap[s.chauffeurId];
              const montant = getMontant(m, ch);
              if (m.useRedevance && montant <= 0) return;
              grid.push({ date, chauffeurId: s.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : s.chauffeurId,
                vehiculeId: ch ? ch.vehiculeAssigne : null, montant, statut: m.statut || 'en_attente', modeleNom: m.nom });
            });
          }
        });
      } else if (m.recurrence === 'hebdo') {
        const targetDay = days[m.jourSemaine] || null;
        if (targetDay) {
          if (m.chauffeurId) {
            const ch = chMap[m.chauffeurId];
            const montant = getMontant(m, ch);
            grid.push({ date: targetDay, chauffeurId: m.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : m.chauffeurId,
              vehiculeId: ch ? ch.vehiculeAssigne : null, montant, statut: m.statut || 'en_attente', modeleNom: m.nom });
          } else {
            chauffeurs.filter(c => c.statut === 'actif').forEach(c => {
              const montant = getMontant(m, c);
              if (m.useRedevance && montant <= 0) return;
              grid.push({ date: targetDay, chauffeurId: c.id, chauffeurNom: `${c.prenom} ${c.nom}`,
                vehiculeId: c.vehiculeAssigne || null, montant, statut: m.statut || 'en_attente', modeleNom: m.nom });
            });
          }
        }
      } else if (m.recurrence === 'mensuel') {
        const targetDate = days.find(d => parseInt(d.split('-')[2]) === m.jourMois);
        if (targetDate) {
          if (m.chauffeurId) {
            const ch = chMap[m.chauffeurId];
            const montant = getMontant(m, ch);
            grid.push({ date: targetDate, chauffeurId: m.chauffeurId, chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : m.chauffeurId,
              vehiculeId: ch ? ch.vehiculeAssigne : null, montant, statut: m.statut || 'en_attente', modeleNom: m.nom });
          } else {
            chauffeurs.filter(c => c.statut === 'actif').forEach(c => {
              const montant = getMontant(m, c);
              if (m.useRedevance && montant <= 0) return;
              grid.push({ date: targetDate, chauffeurId: c.id, chauffeurNom: `${c.prenom} ${c.nom}`,
                vehiculeId: c.vehiculeAssigne || null, montant, statut: m.statut || 'en_attente', modeleNom: m.nom });
            });
          }
        }
      }
    });

    if (!grid.length) { Toast.show('Aucun versement à générer pour cette semaine', 'error'); return; }

    grid.forEach(g => {
      g.exists = versements.some(v => v.date === g.date && v.chauffeurId === g.chauffeurId && v.montantVerse === g.montant);
      g.vehiculeLabel = g.vehiculeId ? (vehMap[g.vehiculeId] || g.vehiculeId) : '-';
    });

    this._showVersementGridValidation(grid);
  },

  _showVersementGridValidation(grid) {
    const rows = grid.map((g, i) => `
      <tr id="vgrid-row-${i}" style="${g.exists ? 'opacity:0.5;' : ''}">
        <td>${Utils.formatDate(g.date)}</td>
        <td>${g.chauffeurNom}</td>
        <td>${g.vehiculeLabel}</td>
        <td style="font-weight:600">${Utils.formatCurrency(g.montant)}</td>
        <td>${g.statut === 'valide' ? '<span class="badge badge-success">Validé</span>' : '<span class="badge badge-warning">En attente</span>'}</td>
        <td style="font-size:var(--font-size-xs);color:var(--text-muted)">${g.modeleNom}</td>
        <td>
          ${g.exists
            ? '<span class="badge badge-secondary">Déjà enregistré</span>'
            : `<button class="btn-icon btn-danger" title="Retirer" onclick="document.getElementById('vgrid-row-${i}').remove()"><iconify-icon icon="solar:close-circle-bold"></iconify-icon></button>`
          }
        </td>
      </tr>
    `).join('');

    const newCount = grid.filter(g => !g.exists).length;
    const totalAmount = grid.filter(g => !g.exists).reduce((s, g) => s + g.montant, 0);

    Modal.open({
      title: '<iconify-icon icon="solar:transfer-horizontal-bold-duotone" style="color:#22c55e;"></iconify-icon> Grille de versements à valider',
      body: `
        <div style="margin-bottom:1rem;display:flex;gap:1rem;flex-wrap:wrap">
          <span class="badge badge-success">${newCount} nouveaux</span>
          <span class="badge badge-secondary">${grid.filter(g => g.exists).length} déjà enregistrés</span>
          <span style="font-weight:600">Total : ${Utils.formatCurrency(totalAmount)}</span>
        </div>
        <div style="max-height:400px;overflow-y:auto" id="vgrid-validation-table">
          <table class="table" style="width:100%;font-size:var(--font-size-sm)">
            <thead><tr><th>Date</th><th>Chauffeur</th><th>Véhicule</th><th>Montant</th><th>Statut</th><th>Modèle</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" data-action="cancel">Annuler</button>
        <button class="btn btn-success" id="btn-validate-vgrid"><iconify-icon icon="solar:check-circle-bold"></iconify-icon> Tout valider (${newCount})</button>
      `,
      size: 'large'
    });

    this._pendingVGrid = grid;
    const validateBtn = document.getElementById('btn-validate-vgrid');
    if (validateBtn) validateBtn.addEventListener('click', () => this._validateVersementGrid());
  },

  _validateVersementGrid() {
    if (!this._pendingVGrid) return;
    const tableDiv = document.getElementById('vgrid-validation-table');
    const visibleRowIds = new Set();
    if (tableDiv) {
      tableDiv.querySelectorAll('tbody tr').forEach(tr => {
        const idx = parseInt(tr.id.replace('vgrid-row-', ''));
        if (!isNaN(idx)) visibleRowIds.add(idx);
      });
    }

    // Compute current period
    const refDate = this._selectedPeriod ? new Date(this._selectedPeriod) : new Date();
    const oneJan = new Date(refDate.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((refDate - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
    const periode = `${refDate.getFullYear()}-S${String(weekNum).padStart(2, '0')}`;

    let count = 0;
    this._pendingVGrid.forEach((g, i) => {
      if (g.exists) return;
      if (!visibleRowIds.has(i)) return;
      Store.add('versements', {
        id: Utils.generateId('VRS'),
        chauffeurId: g.chauffeurId, vehiculeId: g.vehiculeId || null,
        date: g.date, dateService: g.date, periode,
        montantBrut: g.montant, commission: 0, montantNet: g.montant,
        montantVerse: 0,
        statut: 'en_attente', nombreCourses: 0,
        dateValidation: null,
        commentaire: `Auto: ${g.modeleNom}`,
        dateCreation: new Date().toISOString()
      });
      count++;
    });

    Modal.close();
    this._pendingVGrid = null;
    Toast.show(`${count} versement${count > 1 ? 's' : ''} enregistré${count > 1 ? 's' : ''}`, 'success');
    this.render();
  },

  // =================== RECETTES IMPAYÉES ===================

  _renderUnpaidSection(d) {
    if (!d.unpaidItems || d.unpaidItems.length === 0) return '';

    const rows = d.unpaidItems.map(item => {
      const ch = d.chauffeurs.find(c => c.id === item.chauffeurId);
      const name = ch ? `${ch.prenom} ${ch.nom}` : item.chauffeurId;
      const hasJustif = !!item.justification;
      return `<div data-name="${name.toLowerCase()}" style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-radius:var(--radius-sm);background:var(--bg-tertiary);">
        <div style="min-width:0;flex:1;">
          <div style="font-size:var(--font-size-sm);font-weight:500;"><a href="javascript:void(0)" onclick="event.stopPropagation();VersementsPage._payReceipt('${item.chauffeurId}','${item.date}','${item.planningId}','${item.versementId || ''}',${item.totalDu})" style="color:var(--text-primary);text-decoration:none;cursor:pointer;" onmouseenter="this.style.color='var(--primary)'" onmouseleave="this.style.color='var(--text-primary)'">${name}</a></div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${Utils.formatDate(item.date)}${item.heureDebut && item.heureFin ? ' \u2014 ' + item.heureDebut + ' \u00e0 ' + item.heureFin : ''} &bull; ${item.joursRetard}j de retard</div>
          ${hasJustif ? `<div style="font-size:var(--font-size-xs);color:var(--pilote-blue);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> ${item.justification}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:8px;">
          <div style="font-size:var(--font-size-sm);font-weight:600;color:#ef4444;">${Utils.formatCurrency(item.montantDu)}</div>
          ${item.penalite > 0 ? `<div style="font-size:10px;color:#f59e0b;font-weight:600;">+ ${Utils.formatCurrency(item.penalite)} p\u00e9nalit\u00e9</div>` : ''}
        </div>
      </div>`;
    }).join('');

    return `<div class="card" style="margin-top:var(--space-lg);border-left:4px solid #ef4444;">
      <div class="card-header" style="cursor:pointer;" onclick="VersementsPage._showUnpaidDetails()">
        <span class="card-title"><iconify-icon icon="solar:bill-cross-bold-duotone" style="color:#ef4444;"></iconify-icon> Recettes \u00e0 verser aujourd\u0027hui (${d.unpaidItems.length})</span>
        <div style="text-align:right;">
          <div style="font-size:var(--font-size-base);font-weight:700;color:#ef4444;">${Utils.formatCurrency(d.totalUnpaid)}</div>
          ${d.totalPenalites > 0 ? `<div style="font-size:var(--font-size-xs);color:#f59e0b;font-weight:600;"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> + ${Utils.formatCurrency(d.totalPenalites)} p\u00e9nalit\u00e9s</div>` : ''}
        </div>
      </div>
      <div style="position:relative;margin-bottom:8px;">
        <iconify-icon icon="solar:magnifer-bold" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--pilote-orange);pointer-events:none;"></iconify-icon>
        <input type="text" id="unpaid-search" class="form-control" placeholder="Rechercher un chauffeur..." style="padding-left:32px;font-size:var(--font-size-xs);border:2px solid var(--pilote-orange);border-radius:var(--radius-md);background:var(--bg-primary);" oninput="VersementsPage._filterUnpaidList(this.value)" onclick="event.stopPropagation()">
      </div>
      <div id="unpaid-list" style="display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto;">
        ${rows}
      </div>
    </div>`;
  },

  _filterUnpaidList(query) {
    const container = document.getElementById('unpaid-list');
    if (!container) return;
    const q = query.toLowerCase().trim();
    const items = container.querySelectorAll('[data-name]');
    items.forEach(item => {
      item.style.display = item.dataset.name.includes(q) ? '' : 'none';
    });
  },

  _showUnpaidDetails() {
    const data = this._getData();
    if (!data.unpaidItems || data.unpaidItems.length === 0) {
      Toast.info('Aucune recette impay\u00e9e');
      return;
    }

    this._unpaidData = data;

    const chauffeurIds = [...new Set(data.unpaidItems.map(i => i.chauffeurId))];
    const chauffeurOptions = chauffeurIds.map(id => {
      const ch = data.chauffeurs.find(c => c.id === id);
      return ch ? `<option value="${id}">${ch.prenom} ${ch.nom}</option>` : '';
    }).join('');

    const filtersHtml = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:1;min-width:140px;">
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">Chauffeur</label>
          <select class="form-control" id="unpaid-filter-chauffeur" style="font-size:var(--font-size-xs);padding:6px 8px;" onchange="VersementsPage._applyUnpaidFilters()">
            <option value="">Tous</option>
            ${chauffeurOptions}
          </select>
        </div>
        <div>
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">Du</label>
          <input type="date" class="form-control" id="unpaid-filter-from" style="font-size:var(--font-size-xs);padding:6px 8px;" onchange="VersementsPage._applyUnpaidFilters()">
        </div>
        <div>
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">Au</label>
          <input type="date" class="form-control" id="unpaid-filter-to" style="font-size:var(--font-size-xs);padding:6px 8px;" onchange="VersementsPage._applyUnpaidFilters()">
        </div>
        <div>
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">Retard min (j)</label>
          <input type="number" class="form-control" id="unpaid-filter-retard" min="0" value="0" style="font-size:var(--font-size-xs);padding:6px 8px;width:80px;" onchange="VersementsPage._applyUnpaidFilters()">
        </div>
        <button class="btn btn-sm btn-success" onclick="VersementsPage._exportUnpaidExcel()" title="Exporter en Excel">
          <iconify-icon icon="solar:file-download-bold-duotone"></iconify-icon> Excel
        </button>
      </div>
      <div id="unpaid-summary" style="display:flex;gap:12px;margin-bottom:8px;font-size:var(--font-size-xs);padding:8px;background:var(--bg-tertiary);border-radius:var(--radius-sm);"></div>
    `;

    const rows = this._renderUnpaidRows(data.unpaidItems, data.chauffeurs);

    Modal.open({
      title: '<iconify-icon icon="solar:bill-cross-bold-duotone" style="color:#ef4444;"></iconify-icon> Recettes impay\u00e9es (' + data.unpaidItems.length + ')',
      body: filtersHtml + `<div id="unpaid-rows-container" style="display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto;">${rows}</div>`,
      footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>',
      size: 'large'
    });

    this._updateUnpaidSummary(data.unpaidItems);
  },

  _renderUnpaidRows(items, chauffeurs) {
    const session = Auth.getSession();
    const isAdmin = session && session.role === 'Administrateur';
    return items.map(item => {
      const ch = chauffeurs.find(c => c.id === item.chauffeurId);
      const name = ch ? `${ch.prenom} ${ch.nom}` : item.chauffeurId;
      const hasJustif = !!item.justification;
      const creneauLabel = item.heureDebut && item.heureFin ? `${item.heureDebut} \u00e0 ${item.heureFin}` : (item.typeCreneaux || '');
      const penaliteHtml = item.penalite > 0 ? `<div style="font-size:10px;color:#f59e0b;font-weight:600;">+ ${Utils.formatCurrency(item.penalite)} (${Math.round(item.tauxPenalite*100)}%)</div>` : '';

      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:var(--radius-sm);background:var(--bg-tertiary);gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--font-size-sm);font-weight:600;"><a href="javascript:void(0)" onclick="event.stopPropagation();VersementsPage._payReceipt('${item.chauffeurId}','${item.date}','${item.planningId}','${item.versementId || ''}',${item.totalDu})" style="color:var(--text-primary);text-decoration:none;cursor:pointer;" onmouseenter="this.style.color='var(--primary)'" onmouseleave="this.style.color='var(--text-primary)'">${name}</a></div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${Utils.formatDate(item.date)}${creneauLabel ? ' \u2014 ' + creneauLabel : ''} &bull; <span style="color:${item.joursRetard > 4 ? '#ef4444' : '#f59e0b'};font-weight:600;">${item.joursRetard}j de retard</span></div>
          ${hasJustif ? `<div style="font-size:var(--font-size-xs);color:var(--pilote-blue);margin-top:2px;"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> ${item.justification}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:var(--font-size-sm);font-weight:600;color:#ef4444;">${Utils.formatCurrency(item.montantDu)}</div>
          ${penaliteHtml}
          <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-success" onclick="event.stopPropagation();VersementsPage._payReceipt('${item.chauffeurId}','${item.date}','${item.planningId}','${item.versementId || ''}',${item.totalDu})">
              <iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon> Payer
            </button>
            <button class="btn btn-sm ${hasJustif ? 'btn-secondary' : 'btn-outline'}" onclick="event.stopPropagation();VersementsPage._addJustification('${item.chauffeurId}','${item.date}','${item.planningId}','${item.versementId || ''}')">
              <iconify-icon icon="solar:document-add-bold-duotone"></iconify-icon> ${hasJustif ? 'Modifier' : 'Justifier'}
            </button>
            ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();VersementsPage._deleteReceipt('${item.chauffeurId}','${item.date}','${item.planningId}','${item.versementId || ''}')">
              <iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon>
            </button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  },

  _updateUnpaidSummary(items) {
    const el = document.getElementById('unpaid-summary');
    if (!el) return;
    const total = items.reduce((s, i) => s + i.montantDu, 0);
    const totalPen = items.reduce((s, i) => s + i.penalite, 0);
    const avgRetard = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.joursRetard, 0) / items.length) : 0;
    el.innerHTML = `
      <div><strong>${items.length}</strong> impay\u00e9(s)</div>
      <div>Total: <strong style="color:#ef4444;">${Utils.formatCurrency(total)}</strong></div>
      ${totalPen > 0 ? `<div>P\u00e9nalit\u00e9s: <strong style="color:#f59e0b;">${Utils.formatCurrency(totalPen)}</strong></div>` : ''}
      <div>Retard moy: <strong>${avgRetard}j</strong></div>
    `;
  },

  _applyUnpaidFilters() {
    if (!this._unpaidData) return;
    let items = [...this._unpaidData.unpaidItems];

    const chauffeurId = document.getElementById('unpaid-filter-chauffeur')?.value;
    const dateFrom = document.getElementById('unpaid-filter-from')?.value;
    const dateTo = document.getElementById('unpaid-filter-to')?.value;
    const minRetard = parseInt(document.getElementById('unpaid-filter-retard')?.value) || 0;

    if (chauffeurId) items = items.filter(i => i.chauffeurId === chauffeurId);
    if (dateFrom) items = items.filter(i => i.date >= dateFrom);
    if (dateTo) items = items.filter(i => i.date <= dateTo);
    if (minRetard > 0) items = items.filter(i => i.joursRetard >= minRetard);

    const container = document.getElementById('unpaid-rows-container');
    if (container) container.innerHTML = this._renderUnpaidRows(items, this._unpaidData.chauffeurs);
    this._updateUnpaidSummary(items);
  },

  _exportUnpaidExcel() {
    const data = this._unpaidData || this._getData();
    let items = [...data.unpaidItems];

    const chauffeurId = document.getElementById('unpaid-filter-chauffeur')?.value;
    const dateFrom = document.getElementById('unpaid-filter-from')?.value;
    const dateTo = document.getElementById('unpaid-filter-to')?.value;
    const minRetard = parseInt(document.getElementById('unpaid-filter-retard')?.value) || 0;
    if (chauffeurId) items = items.filter(i => i.chauffeurId === chauffeurId);
    if (dateFrom) items = items.filter(i => i.date >= dateFrom);
    if (dateTo) items = items.filter(i => i.date <= dateTo);
    if (minRetard > 0) items = items.filter(i => i.joursRetard >= minRetard);

    const headers = ['Chauffeur', 'Date', 'Cr\u00e9neau', 'Montant d\u00fb', 'Jours retard', 'Taux p\u00e9nalit\u00e9', 'P\u00e9nalit\u00e9', 'Total d\u00fb', 'Justification'];
    const rows = items.map(i => {
      const ch = data.chauffeurs.find(c => c.id === i.chauffeurId);
      return [
        ch ? `${ch.prenom} ${ch.nom}` : i.chauffeurId,
        i.date,
        i.heureDebut && i.heureFin ? `${i.heureDebut}-${i.heureFin}` : i.typeCreneaux || '',
        i.montantDu, i.joursRetard, `${Math.round(i.tauxPenalite * 100)}%`,
        i.penalite, i.totalDu, i.justification || ''
      ];
    });
    Utils.exportCSV(headers, rows, `pilote-impayes-${new Date().toISOString().split('T')[0]}.csv`);
    Toast.success(`${items.length} impay\u00e9(s) export\u00e9(s) en Excel`);
  },

  _addJustification(chauffeurId, date, planningId, versementId) {
    const versements = Store.get('versements') || [];
    const existing = versementId && versementId !== 'null' ? versements.find(v => v.id === versementId) : versements.find(v => v.chauffeurId === chauffeurId && v.date === date);

    const fields = [
      { name: 'justification', label: 'Justificatif / Raison', type: 'textarea', rows: 3, placeholder: 'Expliquer pourquoi la recette n\'a pas \u00e9t\u00e9 pay\u00e9e...', required: true }
    ];

    const existingValues = existing ? { justification: existing.justification || '' } : {};

    Modal.form(
      '<iconify-icon icon="solar:document-add-bold-duotone" style="color:var(--pilote-blue);"></iconify-icon> Justifier l\'impay\u00e9',
      FormBuilder.build(fields, existingValues),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);

        if (existing) {
          Store.update('versements', existing.id, {
            justification: values.justification,
            justificationDate: new Date().toISOString()
          });
        } else {
          Store.add('versements', {
            id: Utils.generateId('VRS'),
            chauffeurId, date, periode: '',
            montantVerse: 0, statut: 'en_attente',
            justification: values.justification,
            justificationDate: new Date().toISOString(),
            dateCreation: new Date().toISOString()
          });
        }

        Modal.close();
        Toast.success('Justificatif enregistr\u00e9');
        this.render();
      }
    );
  },

  _payReceipt(chauffeurId, date, planningId, versementId, montantDu) {
    const versements = Store.get('versements') || [];
    const existing = versementId && versementId !== 'null' ? versements.find(v => v.id === versementId) : versements.find(v => v.chauffeurId === chauffeurId && v.date === date);
    const chauffeurs = Store.get('chauffeurs') || [];
    const ch = chauffeurs.find(c => c.id === chauffeurId);
    const name = ch ? `${ch.prenom} ${ch.nom}` : chauffeurId;

    const redevance = montantDu || 0;
    const fields = [
      { type: 'heading', label: `Paiement pour ${name} \u2014 ${date}` },
      { type: 'html', html: redevance > 0 ? `<div style="padding:8px 12px;border-radius:8px;background:var(--bg-tertiary);margin-bottom:10px;font-size:var(--font-size-sm);border-left:3px solid var(--primary);">Redevance attendue : <strong style="color:var(--primary)">${Utils.formatCurrency(redevance)}</strong></div>` : '' },
      { type: 'row-start' },
      { name: 'montantVerse', label: 'Montant vers\u00e9 (FCFA)', type: 'number', required: true, min: 0, step: 100, default: montantDu || 0, placeholder: 'Montant de la redevance...' },
      { name: 'moyenPaiement', label: 'Moyen de paiement', type: 'select', required: true, options: [
        { value: 'especes', label: 'Esp\u00e8ces' },
        { value: 'mobile_money', label: 'Mobile Money' },
        { value: 'wave', label: 'Wave' },
        { value: 'orange_money', label: 'Orange Money' },
        { value: 'virement', label: 'Virement bancaire' },
        { value: 'cheque', label: 'Ch\u00e8que' },
        { value: 'autre', label: 'Autre' }
      ]},
      { type: 'row-end' },
      { type: 'html', html: '<div id="pay-comparaison" style="display:none;padding:10px 14px;border-radius:8px;margin-bottom:10px;font-size:var(--font-size-sm);"></div>' },
      { type: 'html', html: '<div id="pay-traitement-manquant" style="display:none;padding:12px 14px;border-radius:8px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);margin-bottom:10px;font-size:var(--font-size-sm);"><label style="font-weight:600;margin-bottom:8px;display:block">Traitement du manquant</label><div style="display:flex;gap:10px;flex-wrap:wrap"><label style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:2px solid var(--border-color);background:var(--bg-primary)"><input type="radio" name="traitementManquant" value="dette" checked> Reporter en dette</label><label style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:2px solid var(--border-color);background:var(--bg-primary)"><input type="radio" name="traitementManquant" value="perte"> Passer en perte</label></div></div>' },
      { name: 'referencePaiement', label: 'R\u00e9f\u00e9rence / N\u00b0 transaction', type: 'text', placeholder: 'Num\u00e9ro de transaction, re\u00e7u...' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2, placeholder: 'Notes sur le paiement...' }
    ];

    const existingValues = existing ? {
      montantVerse: existing.montantVerse || montantDu || 0,
      moyenPaiement: existing.moyenPaiement || '',
      referencePaiement: existing.referencePaiement || '',
      commentaire: existing.commentaire || ''
    } : {};

    Modal.form(
      '<iconify-icon icon="solar:hand-money-bold-duotone" style="color:#22c55e;"></iconify-icon> Encaisser la recette',
      FormBuilder.build(fields, existingValues),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);
        const montant = parseFloat(values.montantVerse) || 0;

        if (montant <= 0) {
          Toast.error('Le montant doit \u00eatre sup\u00e9rieur \u00e0 0');
          return;
        }

        const manquant = (redevance > 0 && montant < redevance) ? redevance - montant : 0;
        const traitementRadio = document.querySelector('input[name="traitementManquant"]:checked');
        const traitementManquant = manquant > 0 ? (traitementRadio ? traitementRadio.value : 'dette') : null;
        const statut = (redevance > 0 && montant < redevance) ? 'partiel' : 'valide';

        if (existing) {
          Store.update('versements', existing.id, {
            montantVerse: montant, montantBrut: redevance || existing.montantBrut,
            statut, manquant, traitementManquant,
            moyenPaiement: values.moyenPaiement,
            referencePaiement: values.referencePaiement,
            commentaire: values.commentaire,
            dateValidation: new Date().toISOString()
          });
        } else {
          Store.add('versements', {
            id: Utils.generateId('VRS'),
            chauffeurId, date, periode: '',
            montantBrut: redevance || 0, montantVerse: montant,
            statut, manquant, traitementManquant,
            moyenPaiement: values.moyenPaiement,
            referencePaiement: values.referencePaiement,
            commentaire: values.commentaire,
            dateValidation: new Date().toISOString(),
            dateCreation: new Date().toISOString()
          });
        }

        Modal.close();

        // Si perte → créer une dépense en comptabilité
        if (manquant > 0 && traitementManquant === 'perte') {
          const chForVeh = chauffeurs.find(c => c.id === chauffeurId);
          Store.add('depenses', {
            id: Utils.generateId('DEP'),
            vehiculeId: chForVeh?.vehiculeAssigne || '',
            chauffeurId,
            typeDepense: 'perte_versement',
            montant: manquant,
            date,
            commentaire: `Perte sur versement partiel du ${Utils.formatDate(date)}`,
            dateCreation: new Date().toISOString()
          });
        }

        if (manquant > 0) {
          const label = traitementManquant === 'dette' ? 'report\u00e9 en dette' : 'pass\u00e9 en perte';
          Toast.warning(`Paiement partiel \u2014 ${Utils.formatCurrency(montant)} sur ${Utils.formatCurrency(redevance)}. Manquant de ${Utils.formatCurrency(manquant)} ${label}.`);
        } else {
          Toast.success('Paiement enregistr\u00e9 \u2014 ' + Utils.formatCurrency(montant));
        }

        this.render();
      }
    );

    // Dynamic listeners for real-time comparison
    setTimeout(() => {
      const montantInput = document.querySelector('input[name="montantVerse"]');
      const compDiv = document.getElementById('pay-comparaison');
      const traitDiv = document.getElementById('pay-traitement-manquant');

      if (!montantInput || !compDiv) return;

      const updateComparaison = () => {
        const m = parseFloat(montantInput.value) || 0;
        if (redevance <= 0 || m <= 0) {
          compDiv.style.display = 'none';
          if (traitDiv) traitDiv.style.display = 'none';
          return;
        }
        compDiv.style.display = 'block';
        if (m >= redevance) {
          compDiv.style.background = 'rgba(34,197,94,0.08)';
          compDiv.style.border = '1px solid rgba(34,197,94,0.3)';
          compDiv.innerHTML = `<span style="color:#22c55e;font-weight:600">\u2713 Complet</span> \u2014 ${Utils.formatCurrency(m)} / ${Utils.formatCurrency(redevance)} (${Math.round(m / redevance * 100)}%)`;
          if (traitDiv) traitDiv.style.display = 'none';
        } else {
          const manq = redevance - m;
          const pct = Math.round(m / redevance * 100);
          compDiv.style.background = 'rgba(245,158,11,0.08)';
          compDiv.style.border = '1px solid rgba(245,158,11,0.3)';

          const allVers = Store.get('versements') || [];
          const detteExistante = allVers
            .filter(v => v.chauffeurId === chauffeurId && v.traitementManquant === 'dette' && v.manquant > 0)
            .reduce((sum, v) => sum + v.manquant, 0);

          let detteInfo = '';
          if (detteExistante > 0) {
            detteInfo = `<div style="margin-top:6px;color:var(--danger);font-size:12px">\u26a0 Dette existante : ${Utils.formatCurrency(detteExistante)}</div>`;
          }

          compDiv.innerHTML = `<span style="color:#f59e0b;font-weight:600">\u26a0 Partiel</span> \u2014 ${Utils.formatCurrency(m)} / ${Utils.formatCurrency(redevance)} (${pct}%)<br><span style="color:var(--danger)">Manquant : ${Utils.formatCurrency(manq)}</span>${detteInfo}`;
          if (traitDiv) traitDiv.style.display = 'block';
        }
      };

      montantInput.addEventListener('input', updateComparaison);
      updateComparaison();
    }, 100);
  },

  _deleteReceipt(chauffeurId, date, planningId, versementId) {
    const session = Auth.getSession();
    const isAdmin = session && session.role === 'Administrateur';
    if (!isAdmin) {
      Toast.error('Seul un administrateur peut supprimer une recette');
      return;
    }

    const chauffeurs = Store.get('chauffeurs') || [];
    const ch = chauffeurs.find(c => c.id === chauffeurId);
    const name = ch ? `${ch.prenom} ${ch.nom}` : chauffeurId;

    Modal.confirm(
      'Supprimer cette recette ?',
      `Voulez-vous supprimer la recette de <strong>${name}</strong> du <strong>${Utils.formatDate(date)}</strong> ? Cette action marquera la recette comme supprim\u00e9e.`,
      () => {
        const versements = Store.get('versements') || [];
        const existing = versementId && versementId !== 'null' ? versements.find(v => v.id === versementId) : versements.find(v => v.chauffeurId === chauffeurId && v.date === date);

        if (existing) {
          Store.update('versements', existing.id, {
            statut: 'supprime',
            dateSuppression: new Date().toISOString()
          });
        } else {
          Store.add('versements', {
            id: Utils.generateId('VRS'),
            chauffeurId, date, periode: '',
            montantVerse: 0, statut: 'supprime',
            commentaire: 'Supprim\u00e9 depuis la page versements',
            dateSuppression: new Date().toISOString(),
            dateCreation: new Date().toISOString()
          });
        }

        Modal.close();
        Toast.success('Recette supprim\u00e9e');
        this.render();
      }
    );
  },

  // =================== SUIVI DES DETTES ===================

  _getDetteData() {
    const versements = Store.get('versements') || [];
    const chauffeurs = Store.get('chauffeurs') || [];

    // Dettes actives (traitementManquant === 'dette' et manquant > 0)
    const dettes = versements.filter(v => v.traitementManquant === 'dette' && v.manquant > 0);
    // Pertes
    const pertes = versements.filter(v => v.traitementManquant === 'perte' && v.manquant > 0);

    // Grouper dettes par chauffeur
    const byDriver = {};
    dettes.forEach(v => {
      if (!byDriver[v.chauffeurId]) byDriver[v.chauffeurId] = { items: [], total: 0 };
      byDriver[v.chauffeurId].items.push(v);
      byDriver[v.chauffeurId].total += v.manquant;
    });

    const detteList = Object.keys(byDriver).map(cId => {
      const ch = chauffeurs.find(c => c.id === cId);
      const d = byDriver[cId];
      d.items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return {
        chauffeurId: cId,
        nom: ch ? `${ch.prenom} ${ch.nom}` : cId,
        count: d.items.length,
        total: d.total,
        lastDate: d.items[d.items.length - 1]?.date || '',
        items: d.items
      };
    }).sort((a, b) => b.total - a.total);

    const totalDettes = detteList.reduce((s, d) => s + d.total, 0);
    const totalPertes = pertes.reduce((s, v) => s + v.manquant, 0);

    return { detteList, totalDettes, totalPertes, chauffeurs };
  },

  _renderDetteSection(d) {
    const detteData = this._getDetteData();
    if (detteData.detteList.length === 0 && detteData.totalPertes === 0) return '';

    const rows = detteData.detteList.map(item => {
      return `<div class="dette-row" data-nom="${(item.nom || '').toLowerCase()}" style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:var(--radius-sm);background:var(--bg-tertiary);gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--font-size-sm);font-weight:600;">${item.nom}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${item.count} impay\u00e9(s) \u2022 Derni\u00e8re : ${Utils.formatDate(item.lastDate)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:var(--font-size-sm);font-weight:700;color:#f59e0b;">${Utils.formatCurrency(item.total)}</div>
          <div style="display:flex;gap:4px;margin-top:4px;">
            <button class="btn btn-sm btn-success" onclick="event.stopPropagation();VersementsPage._encaisserDette('${item.chauffeurId}')">
              <iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon> Encaisser
            </button>
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();VersementsPage._showDetteDetail('${item.chauffeurId}')">
              <iconify-icon icon="solar:list-bold-duotone"></iconify-icon> D\u00e9tail
            </button>
          </div>
        </div>
      </div>`;
    }).join('');

    const searchBar = detteData.detteList.length > 0 ? `
      <div style="padding:0 0 10px 0;">
        <div style="position:relative;">
          <iconify-icon icon="solar:magnifer-linear" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:0.9rem;"></iconify-icon>
          <input type="text" id="dette-search" placeholder="Rechercher un chauffeur..." style="width:100%;padding:8px 10px 8px 32px;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-secondary);font-size:var(--font-size-sm);font-family:var(--font-body);outline:none;">
        </div>
      </div>` : '';

    return `<div id="dette-section" class="card" style="margin-top:var(--space-lg);border-left:4px solid #f59e0b;">
      <div class="card-header">
        <span class="card-title"><iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#f59e0b;"></iconify-icon> Suivi des dettes (${detteData.detteList.length} chauffeur${detteData.detteList.length > 1 ? 's' : ''})</span>
        <div style="text-align:right;">
          ${detteData.totalDettes > 0 ? `<div style="font-size:var(--font-size-base);font-weight:700;color:#f59e0b;">Dettes : ${Utils.formatCurrency(detteData.totalDettes)}</div>` : ''}
          ${detteData.totalPertes > 0 ? `<div style="font-size:var(--font-size-xs);font-weight:600;color:#ef4444;">Pertes : ${Utils.formatCurrency(detteData.totalPertes)}</div>` : ''}
        </div>
      </div>
      ${searchBar}
      ${detteData.detteList.length > 0 ? `<div id="dette-rows-list" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;">${rows}</div>` : '<div style="text-align:center;color:var(--text-muted);padding:12px;font-size:var(--font-size-sm);">Aucune dette active \u2014 seules des pertes enregistr\u00e9es</div>'}
    </div>`;
  },

  _showDetteDetail(chauffeurId) {
    const detteData = this._getDetteData();
    const driver = detteData.detteList.find(d => d.chauffeurId === chauffeurId);
    if (!driver) {
      Toast.info('Aucune dette pour ce chauffeur');
      return;
    }

    const rows = driver.items.map(v => {
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-radius:var(--radius-sm);background:var(--bg-tertiary);font-size:var(--font-size-sm);gap:6px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;">${Utils.formatDate(v.date)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Vers\u00e9 : ${Utils.formatCurrency(v.montantVerse || 0)} sur ${Utils.formatCurrency((v.montantVerse || 0) + v.manquant)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-weight:700;color:#f59e0b;">${Utils.formatCurrency(v.manquant)}</div>
          <div style="display:flex;gap:3px;margin-top:3px;">
            <button class="btn btn-sm btn-outline" style="font-size:0.6rem;padding:2px 6px;" onclick="event.stopPropagation();VersementsPage._modifierDette('${v.id}')">
              <iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier
            </button>
            <button class="btn btn-sm btn-outline" style="font-size:0.6rem;padding:2px 6px;color:#ef4444;border-color:#ef4444;" onclick="event.stopPropagation();VersementsPage._annulerDette('${v.id}')">
              <iconify-icon icon="solar:close-circle-bold-duotone"></iconify-icon> Annuler
            </button>
          </div>
        </div>
      </div>`;
    }).join('');

    Modal.open({
      title: `<iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#f59e0b;"></iconify-icon> D\u00e9tail dette \u2014 ${driver.nom}`,
      body: `
        <div style="display:flex;gap:12px;padding:10px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-bottom:12px;font-size:var(--font-size-sm);">
          <div><strong>${driver.count}</strong> versement(s) en dette</div>
          <div>Total : <strong style="color:#f59e0b;">${Utils.formatCurrency(driver.total)}</strong></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto;">${rows}</div>
      `,
      footer: `<button class="btn btn-success" onclick="Modal.close();VersementsPage._encaisserDette('${chauffeurId}')"><iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon> Encaisser</button><button class="btn btn-secondary" data-action="cancel">Fermer</button>`,
      size: 'medium'
    });
  },

  _modifierDette(versementId) {
    const versements = Store.get('versements') || [];
    const v = versements.find(x => x.id === versementId);
    if (!v) { Toast.error('Versement introuvable'); return; }

    const chauffeurs = Store.get('chauffeurs') || [];
    const ch = chauffeurs.find(c => c.id === v.chauffeurId);
    const nom = ch ? `${ch.prenom} ${ch.nom}` : v.chauffeurId;

    const fields = [
      { type: 'heading', label: `Modifier dette \u2014 ${nom}` },
      { type: 'html', html: `<div style="padding:8px 12px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);margin-bottom:10px;font-size:var(--font-size-sm);">
        Vers\u00e9 : <strong>${Utils.formatCurrency(v.montantVerse || 0)}</strong> \u2014 Manquant actuel : <strong style="color:#f59e0b;">${Utils.formatCurrency(v.manquant)}</strong>
      </div>` },
      { name: 'date', label: 'Date de la dette', type: 'date', required: true, default: v.date },
      { name: 'manquant', label: 'Nouveau montant manquant (FCFA)', type: 'number', required: true, min: 0, step: 100, default: v.manquant },
      { name: 'commentaire', label: 'Commentaire (optionnel)', type: 'textarea', rows: 2, placeholder: 'Raison de la modification...', default: '' }
    ];

    Modal.form(
      '<iconify-icon icon="solar:pen-bold-duotone" style="color:#f59e0b;"></iconify-icon> Modifier la dette',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);
        const newManquant = parseFloat(values.manquant) || 0;

        if (newManquant < 0) {
          Toast.error('Le montant ne peut pas \u00eatre n\u00e9gatif');
          return;
        }

        const updates = { manquant: newManquant };
        if (values.date && values.date !== v.date) {
          updates.date = values.date;
          updates.dateService = values.date;
        }
        if (newManquant === 0) {
          updates.traitementManquant = null;
        }
        if (values.commentaire) {
          updates.commentaire = (v.commentaire ? v.commentaire + ' | ' : '') + 'Modif dette: ' + values.commentaire;
        }

        Store.update('versements', versementId, updates);
        Modal.close();
        Toast.success(`Dette modifi\u00e9e : ${Utils.formatCurrency(v.manquant)} \u2192 ${Utils.formatCurrency(newManquant)}`);
        this.render();
        setTimeout(() => this._showDetteDetail(v.chauffeurId), 300);
      },
      '',
      () => { setTimeout(() => this._showDetteDetail(v.chauffeurId), 200); }
    );
  },

  _annulerDette(versementId) {
    const versements = Store.get('versements') || [];
    const v = versements.find(x => x.id === versementId);
    if (!v) { Toast.error('Versement introuvable'); return; }

    const chauffeurs = Store.get('chauffeurs') || [];
    const ch = chauffeurs.find(c => c.id === v.chauffeurId);
    const nom = ch ? `${ch.prenom} ${ch.nom}` : v.chauffeurId;

    Modal.open({
      title: `<iconify-icon icon="solar:close-circle-bold-duotone" style="color:#ef4444;"></iconify-icon> Annuler cette dette ?`,
      body: `
        <div style="padding:12px;border-radius:var(--radius-sm);background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);font-size:var(--font-size-sm);">
          <div style="font-weight:600;margin-bottom:6px;">${nom}</div>
          <div>Date : ${Utils.formatDate(v.date)}</div>
          <div>Montant dette : <strong style="color:#f59e0b;">${Utils.formatCurrency(v.manquant)}</strong></div>
          <div style="margin-top:8px;color:var(--text-muted);font-size:var(--font-size-xs);">La dette sera mise \u00e0 z\u00e9ro et le traitement sera supprim\u00e9. Cette action est irr\u00e9versible.</div>
        </div>
      `,
      footer: `<button class="btn btn-danger" onclick="VersementsPage._confirmAnnulerDette('${versementId}','${v.chauffeurId}')"><iconify-icon icon="solar:close-circle-bold-duotone"></iconify-icon> Confirmer l'annulation</button><button class="btn btn-secondary" onclick="Modal.close();VersementsPage._showDetteDetail('${v.chauffeurId}')">Retour</button>`,
      size: 'small'
    });
  },

  _confirmAnnulerDette(versementId, chauffeurId) {
    Store.update('versements', versementId, { manquant: 0, traitementManquant: null });
    Modal.close();
    Toast.success('Dette annul\u00e9e avec succ\u00e8s');
    this.render();
    if (chauffeurId) setTimeout(() => this._showDetteDetail(chauffeurId), 300);
  },

  _encaisserDette(chauffeurId) {
    const detteData = this._getDetteData();
    const driver = detteData.detteList.find(d => d.chauffeurId === chauffeurId);
    if (!driver || driver.total <= 0) {
      Toast.info('Aucune dette \u00e0 encaisser');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const fields = [
      { type: 'heading', label: `Recouvrement dette \u2014 ${driver.nom}` },
      { type: 'html', html: `<div style="padding:8px 12px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);margin-bottom:10px;font-size:var(--font-size-sm);">Dette totale : <strong style="color:#f59e0b;">${Utils.formatCurrency(driver.total)}</strong> (${driver.count} versement${driver.count > 1 ? 's' : ''})</div>` },
      { name: 'montant', label: 'Montant \u00e0 encaisser (FCFA)', type: 'number', required: true, min: 1, step: 100, default: driver.total },
      { type: 'row-start' },
      { name: 'dateRecette', label: 'Recette du (date concern\u00e9e)', type: 'date', required: true, default: today },
      { name: 'dateEncaissement', label: 'Encaiss\u00e9 le', type: 'date', required: true, default: today },
      { type: 'row-end' },
      { name: 'moyenPaiement', label: 'Moyen de paiement', type: 'select', required: true, options: [
        { value: 'especes', label: 'Esp\u00e8ces' },
        { value: 'mobile_money', label: 'Mobile Money' },
        { value: 'wave', label: 'Wave' },
        { value: 'orange_money', label: 'Orange Money' },
        { value: 'virement', label: 'Virement bancaire' },
        { value: 'autre', label: 'Autre' }
      ]},
      { name: 'referencePaiement', label: 'R\u00e9f\u00e9rence / N\u00b0 transaction', type: 'text', placeholder: 'Num\u00e9ro de transaction...' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2, placeholder: 'Notes...' }
    ];

    Modal.form(
      '<iconify-icon icon="solar:hand-money-bold-duotone" style="color:#22c55e;"></iconify-icon> Encaisser la dette',
      FormBuilder.build(fields),
      () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;
        const values = FormBuilder.getValues(body);
        const montant = parseFloat(values.montant) || 0;

        if (montant <= 0) {
          Toast.error('Le montant doit \u00eatre sup\u00e9rieur \u00e0 0');
          return;
        }

        // Créer un versement de recouvrement
        Store.add('versements', {
          id: Utils.generateId('VRS'),
          chauffeurId,
          date: values.dateRecette || new Date().toISOString().split('T')[0],
          dateService: values.dateRecette || new Date().toISOString().split('T')[0],
          periode: 'recouvrement',
          montantVerse: montant,
          statut: 'valide',
          moyenPaiement: values.moyenPaiement,
          referencePaiement: values.referencePaiement,
          commentaire: values.commentaire || 'Recouvrement de dette',
          dateValidation: new Date(values.dateEncaissement + 'T' + new Date().toTimeString().split(' ')[0]).toISOString(),
          dateCreation: new Date().toISOString()
        });

        // Parcourir les dettes du plus ancien au plus récent et réduire
        let restant = montant;
        const sortedItems = [...driver.items].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        let nbApures = 0;

        sortedItems.forEach(v => {
          if (restant <= 0) return;
          if (restant >= v.manquant) {
            restant -= v.manquant;
            Store.update('versements', v.id, { manquant: 0, traitementManquant: null });
            nbApures++;
          } else {
            Store.update('versements', v.id, { manquant: v.manquant - restant });
            restant = 0;
          }
        });

        Modal.close();

        if (restant > 0) {
          Toast.success(`Dette sold\u00e9e ! ${Utils.formatCurrency(montant - restant)} appliqu\u00e9(s) sur ${driver.count} versement(s). Exc\u00e9dent de ${Utils.formatCurrency(restant)}.`);
        } else {
          Toast.success(`Recouvrement de ${Utils.formatCurrency(montant)} \u2014 ${nbApures} dette(s) sold\u00e9e(s) sur ${driver.count}.`);
        }

        this.render();
      }
    );
  }
};
