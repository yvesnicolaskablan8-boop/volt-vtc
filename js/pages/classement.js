/**
 * ClassementPage - Classement des chauffeurs par score composite
 */
const ClassementPage = {
  _selectedPeriod: 'current', // 'current' | 'last' | '3months'
  _showConfig: false,

  _getWeights() {
    const settings = Store.get('settings') || {};
    const cl = settings.classement || {};
    return {
      recettes: cl.poidsRecettes ?? 40,
      conduite: cl.poidsConduite ?? 25,
      regularite: cl.poidsRegularite ?? 20,
      infractions: cl.poidsInfractions ?? 15,
      bonusHebdo: cl.bonusHebdo ?? 25000,
      penaliteInfraction: cl.penaliteInfraction ?? 10
    };
  },

  render() {
    const container = document.getElementById('page-content');
    const data = this._computeRankings();
    container.innerHTML = this._template(data);
    this._bindEvents();
  },

  destroy() {},

  _getMonthRange() {
    const now = new Date();
    const period = this._selectedPeriod;
    if (period === 'last') {
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return [{ month: m, year: y }];
    }
    if (period === '3months') {
      const ranges = [];
      for (let i = 0; i < 3; i++) {
        let m = now.getMonth() - i;
        let y = now.getFullYear();
        if (m < 0) { m += 12; y--; }
        ranges.push({ month: m, year: y });
      }
      return ranges;
    }
    // current
    return [{ month: now.getMonth(), year: now.getFullYear() }];
  },

  _getPeriodLabel() {
    const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const ranges = this._getMonthRange();
    if (ranges.length === 1) {
      return monthNames[ranges[0].month] + ' ' + ranges[0].year;
    }
    const last = ranges[ranges.length - 1];
    const first = ranges[0];
    return monthNames[last.month] + ' - ' + monthNames[first.month] + ' ' + first.year;
  },

  _matchesRange(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const m = d.getMonth();
    const y = d.getFullYear();
    return this._getMonthRange().some(r => r.month === m && r.year === y);
  },

  _computeRankings() {
    const chauffeurs = Store.get('chauffeurs') || [];
    const versements = Store.get('versements') || [];
    const planning = Store.get('planning') || [];
    const contras = Store.get('contraventions') || [];
    const infractions = Store.get('infractionsVitesse') || [];

    const activeChauffeurs = chauffeurs.filter(c => c.statut === 'actif' || c.statut === 'repos');

    // CA par chauffeur sur la période
    const revenueByDriver = {};
    versements.filter(v => v.statut !== 'supprime' && v.montantVerse > 0 && this._matchesRange(v.date)).forEach(v => {
      revenueByDriver[v.chauffeurId] = (revenueByDriver[v.chauffeurId] || 0) + v.montantVerse;
    });
    const maxCA = Math.max(...Object.values(revenueByDriver), 1);

    // Calcul du score pour chaque chauffeur
    const ranked = activeChauffeurs.map(ch => {
      const cId = ch.id;

      // 1. Score recettes (40%)
      const ca = revenueByDriver[cId] || 0;
      const scoreRecettes = Math.min((ca / maxCA) * 100, 100);

      // 2. Score conduite (25%)
      const scoreConduite = ch.scoreConduite || 0;

      // 3. Regularite versements (20%)
      const planningMois = planning.filter(p => p.chauffeurId === cId && this._matchesRange(p.date));
      const versementsMois = versements.filter(v => v.chauffeurId === cId && this._matchesRange(v.date) && (v.statut === 'valide' || v.statut === 'supprime'));
      const nbPlanifie = planningMois.length || 1;
      const nbVerse = Math.min(versementsMois.length, nbPlanifie);
      const scoreRegularite = (nbVerse / nbPlanifie) * 100;

      // 4. Contraventions/Infractions
      const w = this._getWeights();
      const nbContras = contras.filter(c => c.chauffeurId === cId && this._matchesRange(c.date)).length;
      const nbInfractions = infractions.filter(inf => inf.chauffeurId === cId && this._matchesRange(inf.date)).length;
      const penalite = (nbContras + nbInfractions) * w.penaliteInfraction;
      const scoreContra = Math.max(100 - penalite, 0);

      // Score global pondéré (poids configurables)
      const totalPoids = w.recettes + w.conduite + w.regularite + w.infractions;
      const scoreGlobal = Math.round(
        (scoreRecettes * (w.recettes / totalPoids)) +
        (scoreConduite * (w.conduite / totalPoids)) +
        (scoreRegularite * (w.regularite / totalPoids)) +
        (scoreContra * (w.infractions / totalPoids))
      );

      const initials = ((ch.prenom || '')[0] + (ch.nom || '')[0]).toUpperCase();

      return {
        id: cId,
        nom: (ch.prenom || '') + ' ' + (ch.nom || ''),
        initials,
        scoreGlobal,
        ca,
        scoreConduite: Math.round(scoreConduite),
        regularite: Math.round(scoreRegularite),
        nbContras,
        nbInfractions,
        totalInfractions: nbContras + nbInfractions
      };
    })
      .sort((a, b) => b.scoreGlobal - a.scoreGlobal);

    // Assign ranks
    ranked.forEach((r, i) => { r.rang = i + 1; });

    return {
      ranked,
      periodLabel: this._getPeriodLabel(),
      activeCount: activeChauffeurs.length
    };
  },

  _template(data) {
    const { ranked, periodLabel, activeCount } = data;
    const top3 = ranked.slice(0, 3);

    return `
    <div class="classement-page">
      <div class="classement-header">
        <div class="classement-header-left">
          <h1><iconify-icon icon="solar:cup-star-bold-duotone" style="color:#f59e0b;"></iconify-icon> Classement des chauffeurs</h1>
          <p class="classement-subtitle">${Utils.escHtml(periodLabel)} &bull; ${activeCount} chauffeur${activeCount !== 1 ? 's' : ''} actif${activeCount !== 1 ? 's' : ''}</p>
        </div>
        <div class="classement-header-right" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <select id="classement-period" class="form-control" style="min-width:150px;">
            <option value="current" ${this._selectedPeriod === 'current' ? 'selected' : ''}>Ce mois</option>
            <option value="last" ${this._selectedPeriod === 'last' ? 'selected' : ''}>Mois dernier</option>
            <option value="3months" ${this._selectedPeriod === '3months' ? 'selected' : ''}>3 derniers mois</option>
          </select>
          <button id="classement-config-btn" class="btn btn-sm" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(99,102,241,.25);">
            <iconify-icon icon="solar:ruler-bold-duotone" style="font-size:15px;"></iconify-icon> Regles
          </button>
        </div>
      </div>

      ${top3.length >= 3 ? this._renderPodium(top3) : ''}

      <div class="classement-legend">
        <div class="classement-legend-item">
          <iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#3b82f6;"></iconify-icon>
          <span>Recettes <strong>${this._getWeights().recettes}%</strong></span>
        </div>
        <div class="classement-legend-item">
          <iconify-icon icon="solar:steering-wheel-bold-duotone" style="color:#8b5cf6;"></iconify-icon>
          <span>Conduite <strong>${this._getWeights().conduite}%</strong></span>
        </div>
        <div class="classement-legend-item">
          <iconify-icon icon="solar:calendar-check-bold-duotone" style="color:#22c55e;"></iconify-icon>
          <span>R&eacute;gularit&eacute; <strong>${this._getWeights().regularite}%</strong></span>
        </div>
        <div class="classement-legend-item">
          <iconify-icon icon="solar:shield-warning-bold-duotone" style="color:#ef4444;"></iconify-icon>
          <span>Infractions <strong>${this._getWeights().infractions}%</strong></span>
        </div>
      </div>

      <!-- Panneau parametres -->
      <div id="classement-config-panel" style="display:none;margin-bottom:20px;">
        ${this._renderConfigPanel()}
      </div>

      <div class="d-card" style="margin-top:20px;">
        <div id="classement-table"></div>
      </div>
    </div>

    <style>
      .classement-page { padding: 0; }
      .classement-header {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 16px; flex-wrap: wrap; margin-bottom: 24px;
      }
      .classement-header h1 {
        font-size: 22px; font-weight: 800; color: var(--text-primary);
        display: flex; align-items: center; gap: 10px; margin: 0;
      }
      .classement-subtitle { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; }
      .classement-header-right { display: flex; align-items: center; gap: 10px; }

      /* Podium */
      .classement-podium {
        display: flex; align-items: flex-end; justify-content: center;
        gap: 12px; margin: 0 auto 24px; max-width: 600px; padding: 20px 0 0;
      }
      .podium-place {
        display: flex; flex-direction: column; align-items: center;
        flex: 1; max-width: 180px; cursor: pointer; transition: transform 0.2s ease;
      }
      .podium-place:hover { transform: translateY(-4px); }
      .podium-avatar {
        width: 56px; height: 56px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; font-weight: 800; color: #fff;
        margin-bottom: 8px; position: relative;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      }
      .podium-place-1 .podium-avatar { width: 68px; height: 68px; font-size: 22px; }
      .podium-rank-badge {
        position: absolute; bottom: -6px; right: -4px;
        width: 22px; height: 22px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 900; color: #fff;
        border: 2px solid var(--bg-primary, #1a1f3a);
      }
      .podium-name {
        font-size: 13px; font-weight: 700; color: var(--text-primary);
        text-align: center; white-space: nowrap; overflow: hidden;
        text-overflow: ellipsis; max-width: 100%; margin-bottom: 4px;
      }
      .podium-score { font-size: 22px; font-weight: 900; margin-bottom: 10px; }
      .podium-score span { font-size: 12px; font-weight: 600; opacity: 0.6; }
      .podium-bar {
        width: 100%; border-radius: 12px 12px 0 0;
        display: flex; align-items: flex-start; justify-content: center;
        padding-top: 12px;
      }
      .podium-bar-icon { font-size: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); }
      .podium-place-1 .podium-bar { height: 120px; }
      .podium-place-2 .podium-bar { height: 90px; }
      .podium-place-3 .podium-bar { height: 70px; }

      /* Legend */
      .classement-legend {
        display: flex; flex-wrap: wrap; gap: 16px; justify-content: center;
        padding: 14px 20px; background: var(--bg-secondary, rgba(0,0,0,0.02));
        border-radius: 12px; margin-bottom: 4px;
      }
      .classement-legend-item {
        display: flex; align-items: center; gap: 6px;
        font-size: 12px; color: var(--text-secondary);
      }
      .classement-legend-item strong { color: var(--text-primary); font-weight: 700; }

      .tendance-up { color: #22c55e; }
      .tendance-down { color: #ef4444; }
      .tendance-stable { color: #9ca3af; }

      @media (max-width: 640px) {
        .classement-podium { gap: 8px; padding: 12px 0 0; }
        .podium-avatar { width: 44px; height: 44px; font-size: 15px; }
        .podium-place-1 .podium-avatar { width: 52px; height: 52px; font-size: 18px; }
        .podium-score { font-size: 18px; }
        .podium-name { font-size: 11px; }
        .podium-place-1 .podium-bar { height: 90px; }
        .podium-place-2 .podium-bar { height: 65px; }
        .podium-place-3 .podium-bar { height: 50px; }
        .classement-header { flex-direction: column; }
        .classement-header-right { width: 100%; }
        .classement-header-right select { width: 100%; max-width: none; }
        .classement-legend { gap: 10px; padding: 10px 12px; }
        .classement-legend-item { font-size: 11px; }
      }
    </style>
    `;
  },

  _renderPodium(top3) {
    const places = [
      { data: top3[1], place: 2, color: '#9ca3af', barBg: 'linear-gradient(to top, #9ca3af22, #9ca3af44)', icon: '&#129352;' },
      { data: top3[0], place: 1, color: '#f59e0b', barBg: 'linear-gradient(to top, #f59e0b22, #f59e0b44)', icon: '&#129351;' },
      { data: top3[2], place: 3, color: '#cd7f32', barBg: 'linear-gradient(to top, #cd7f3222, #cd7f3244)', icon: '&#129353;' }
    ];

    return `
      <div class="classement-podium">
        ${places.map(p => {
          const scoreColor = p.data.scoreGlobal >= 75 ? '#22c55e' : p.data.scoreGlobal >= 50 ? '#f59e0b' : '#ef4444';
          return '<div class="podium-place podium-place-' + p.place + '" onclick="Router.navigate(\'/chauffeurs/' + p.data.id + '\')">'
            + '<div class="podium-avatar" style="background:' + p.color + ';">'
            + Utils.escHtml(p.data.initials)
            + '<div class="podium-rank-badge" style="background:' + p.color + ';">' + p.place + '</div>'
            + '</div>'
            + '<div class="podium-name">' + Utils.escHtml(p.data.nom) + '</div>'
            + '<div class="podium-score" style="color:' + scoreColor + ';">'
            + p.data.scoreGlobal + '<span>/100</span>'
            + '</div>'
            + '<div class="podium-bar" style="background:' + p.barBg + ';">'
            + '<span class="podium-bar-icon">' + p.icon + '</span>'
            + '</div>'
            + '</div>';
        }).join('')}
      </div>
    `;
  },

  _bindEvents() {
    const select = document.getElementById('classement-period');
    if (select) {
      select.addEventListener('change', () => {
        this._selectedPeriod = select.value;
        this.destroy();
        this.render();
      });
    }
    this._renderTable();
    this._bindConfigEvents();
  },

  _renderTable() {
    const data = this._computeRankings();
    const ranked = data.ranked;

    Table.create({
      containerId: 'classement-table',
      columns: [
        {
          label: 'Rang', key: 'rang',
          render: (row) => {
            const medals = { 1: '#f59e0b', 2: '#9ca3af', 3: '#cd7f32' };
            const c = medals[row.rang];
            if (c) return '<div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;background:' + c + '20;color:' + c + ';">' + row.rang + '</div>';
            return '<span style="font-weight:600;color:var(--text-secondary);padding-left:8px;">' + row.rang + '</span>';
          }
        },
        {
          label: 'Chauffeur', key: 'nom', primary: true,
          render: (row) => '<div style="display:flex;align-items:center;gap:10px;">'
            + '<div style="width:32px;height:32px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">' + Utils.escHtml(row.initials) + '</div>'
            + '<span style="font-weight:600;">' + Utils.escHtml(row.nom) + '</span>'
            + '</div>'
        },
        {
          label: 'Score Global', key: 'scoreGlobal', value: (row) => row.scoreGlobal,
          render: (row) => {
            const color = row.scoreGlobal >= 75 ? '#22c55e' : row.scoreGlobal >= 50 ? '#f59e0b' : '#ef4444';
            return '<div style="display:flex;align-items:center;gap:8px;">'
              + '<div style="flex:1;max-width:80px;height:6px;border-radius:3px;background:rgba(0,0,0,.06);"><div style="height:100%;width:' + row.scoreGlobal + '%;border-radius:3px;background:' + color + ';transition:width .4s ease;"></div></div>'
              + '<strong style="color:' + color + ';font-size:14px;">' + row.scoreGlobal + '</strong><span style="font-size:11px;color:var(--text-muted);">/100</span>'
              + '</div>';
          }
        },
        {
          label: 'Recettes', key: 'ca', value: (row) => row.ca,
          render: (row) => '<span style="font-weight:600;">' + Utils.formatCurrency(row.ca) + '</span>'
        },
        {
          label: 'Score Conduite', key: 'scoreConduite', value: (row) => row.scoreConduite,
          render: (row) => {
            const color = row.scoreConduite >= 75 ? '#22c55e' : row.scoreConduite >= 50 ? '#f59e0b' : '#ef4444';
            return '<span style="color:' + color + ';font-weight:600;">' + row.scoreConduite + '<span style="font-size:10px;opacity:.6">/100</span></span>';
          }
        },
        {
          label: 'R\u00e9gularit\u00e9', key: 'regularite', value: (row) => row.regularite,
          render: (row) => {
            const color = row.regularite >= 80 ? '#22c55e' : row.regularite >= 50 ? '#f59e0b' : '#ef4444';
            return '<span style="color:' + color + ';font-weight:600;">' + row.regularite + '%</span>';
          }
        },
        {
          label: 'Infractions', key: 'totalInfractions', value: (row) => row.totalInfractions,
          render: (row) => {
            if (row.totalInfractions === 0) return '<span style="color:#22c55e;font-weight:600;">0</span>';
            const parts = [];
            if (row.nbContras > 0) parts.push('<span style="color:#ef4444;">' + row.nbContras + ' contr.</span>');
            if (row.nbInfractions > 0) parts.push('<span style="color:#f97316;">' + row.nbInfractions + ' inf.</span>');
            return '<span style="font-weight:600;">' + parts.join(' + ') + '</span>';
          }
        },
        {
          label: 'Tendance', key: 'scoreGlobal', sortable: false,
          render: (row) => {
            if (row.scoreGlobal >= 75) return '<span class="tendance-up"><iconify-icon icon="solar:arrow-up-bold" style="font-size:14px;"></iconify-icon></span>';
            if (row.scoreGlobal >= 50) return '<span class="tendance-stable"><iconify-icon icon="solar:minus-circle-bold" style="font-size:14px;"></iconify-icon></span>';
            return '<span class="tendance-down"><iconify-icon icon="solar:arrow-down-bold" style="font-size:14px;"></iconify-icon></span>';
          }
        }
      ],
      data: ranked,
      pageSize: 20,
      onRowClick: (row) => Router.navigate('/chauffeurs/' + row.id)
    });
  },

  _renderConfigPanel() {
    const w = this._getWeights();
    const inputStyle = 'width:100%;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-primary);color:var(--text-primary);font-size:13px;text-align:center;font-weight:700;';
    const labelStyle = 'font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:4px;display:block;text-transform:uppercase;letter-spacing:0.3px;';
    return `<div class="d-card" style="padding:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <iconify-icon icon="solar:settings-bold-duotone" style="font-size:20px;color:#6366f1;"></iconify-icon>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Criteres de classement</div>
            <div style="font-size:11px;color:var(--text-muted);">Ajustez les poids de chaque critere (total doit faire 100%)</div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;margin-bottom:16px;">
        <div>
          <label style="${labelStyle}"><iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#3b82f6;font-size:13px;vertical-align:middle;"></iconify-icon> Recettes (%)</label>
          <input type="number" id="cfg-poids-recettes" value="${w.recettes}" min="0" max="100" style="${inputStyle}">
        </div>
        <div>
          <label style="${labelStyle}"><iconify-icon icon="solar:steering-wheel-bold-duotone" style="color:#8b5cf6;font-size:13px;vertical-align:middle;"></iconify-icon> Conduite (%)</label>
          <input type="number" id="cfg-poids-conduite" value="${w.conduite}" min="0" max="100" style="${inputStyle}">
        </div>
        <div>
          <label style="${labelStyle}"><iconify-icon icon="solar:calendar-check-bold-duotone" style="color:#22c55e;font-size:13px;vertical-align:middle;"></iconify-icon> Regularite (%)</label>
          <input type="number" id="cfg-poids-regularite" value="${w.regularite}" min="0" max="100" style="${inputStyle}">
        </div>
        <div>
          <label style="${labelStyle}"><iconify-icon icon="solar:shield-warning-bold-duotone" style="color:#ef4444;font-size:13px;vertical-align:middle;"></iconify-icon> Infractions (%)</label>
          <input type="number" id="cfg-poids-infractions" value="${w.infractions}" min="0" max="100" style="${inputStyle}">
        </div>
      </div>
      <div id="cfg-total-indicator" style="font-size:12px;font-weight:600;margin-bottom:14px;padding:8px 12px;border-radius:8px;background:rgba(34,197,94,0.08);color:#22c55e;text-align:center;">Total : 100%</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:16px;">
        <div>
          <label style="${labelStyle}">Bonus hebdo (FCFA)</label>
          <input type="number" id="cfg-bonus-hebdo" value="${w.bonusHebdo}" min="0" step="1000" style="${inputStyle}">
        </div>
        <div>
          <label style="${labelStyle}">Penalite / infraction (pts)</label>
          <input type="number" id="cfg-penalite-infraction" value="${w.penaliteInfraction}" min="0" max="50" style="${inputStyle}">
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button id="cfg-save-btn" class="btn" style="background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;border:none;border-radius:10px;padding:10px 24px;font-weight:700;font-size:13px;cursor:pointer;">
          <iconify-icon icon="solar:check-circle-bold" style="margin-right:4px;"></iconify-icon> Enregistrer
        </button>
      </div>
    </div>`;
  },

  _bindConfigEvents() {
    const btn = document.getElementById('classement-config-btn');
    const panel = document.getElementById('classement-config-panel');
    if (btn && panel) {
      btn.addEventListener('click', () => {
        this._showConfig = !this._showConfig;
        panel.style.display = this._showConfig ? 'block' : 'none';
        if (this._showConfig) {
          setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
      });
    }

    // Live total indicator
    ['cfg-poids-recettes', 'cfg-poids-conduite', 'cfg-poids-regularite', 'cfg-poids-infractions'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this._updateTotalIndicator());
    });

    const saveBtn = document.getElementById('cfg-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => this._saveConfig());
  },

  _updateTotalIndicator() {
    const r = parseInt(document.getElementById('cfg-poids-recettes')?.value) || 0;
    const c = parseInt(document.getElementById('cfg-poids-conduite')?.value) || 0;
    const g = parseInt(document.getElementById('cfg-poids-regularite')?.value) || 0;
    const i = parseInt(document.getElementById('cfg-poids-infractions')?.value) || 0;
    const total = r + c + g + i;
    const el = document.getElementById('cfg-total-indicator');
    if (el) {
      const ok = total === 100;
      el.style.background = ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
      el.style.color = ok ? '#22c55e' : '#ef4444';
      el.textContent = 'Total : ' + total + '%' + (ok ? '' : ' (doit faire 100%)');
    }
  },

  _saveConfig() {
    const r = parseInt(document.getElementById('cfg-poids-recettes')?.value) || 0;
    const c = parseInt(document.getElementById('cfg-poids-conduite')?.value) || 0;
    const g = parseInt(document.getElementById('cfg-poids-regularite')?.value) || 0;
    const i = parseInt(document.getElementById('cfg-poids-infractions')?.value) || 0;
    const total = r + c + g + i;
    if (total !== 100) {
      Toast.error('Le total des poids doit faire exactement 100%');
      return;
    }
    const bonusHebdo = parseInt(document.getElementById('cfg-bonus-hebdo')?.value) || 25000;
    const penaliteInfraction = parseInt(document.getElementById('cfg-penalite-infraction')?.value) || 10;

    const settings = Store.get('settings') || {};
    settings.classement = {
      poidsRecettes: r,
      poidsConduite: c,
      poidsRegularite: g,
      poidsInfractions: i,
      bonusHebdo,
      penaliteInfraction
    };
    Store.set('settings', settings);
    Toast.success('Criteres de classement mis a jour');
    this._showConfig = false;
    this.render();
  }
};
