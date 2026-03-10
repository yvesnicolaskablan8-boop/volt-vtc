/**
 * ChauffeursPage - Driver management with CRUD and detail view
 * Shows only internal Volt drivers (no Yango data)
 */
const ChauffeursPage = {
  _charts: [],
  _table: null,
  _currentPage: 1,
  _detailChart: null,

  render() {
    const container = document.getElementById('page-content');
    const chauffeurs = Store.get('chauffeurs');
    container.innerHTML = this._listTemplate(chauffeurs);
    this._bindListEvents();
  },

  renderDetail(id) {
    const container = document.getElementById('page-content');
    const chauffeur = Store.findById('chauffeurs', id);
    if (!chauffeur) {
      container.innerHTML = '<div class="empty-state"><iconify-icon icon="solar:user-cross-bold-duotone"></iconify-icon><h3>Chauffeur non trouvé</h3></div>';
      return;
    }
    container.innerHTML = this._detailTemplate(chauffeur);
    this._loadDetailCharts(chauffeur);
    this._bindDetailEvents(chauffeur);
    setTimeout(() => {
      this._loadVersementsChart(chauffeur.id);
    }, 100);
  },

  destroy() {
    this._charts.forEach(c => c.destroy());
    this._charts = [];
    if (this._detailChart) {
      this._detailChart.destroy();
      this._detailChart = null;
    }
    if (this._yangoRefreshInterval) {
      clearInterval(this._yangoRefreshInterval);
      this._yangoRefreshInterval = null;
    }
  },

  _listTemplate(chauffeurs) {
    const stats = {
      total: chauffeurs.length,
      actifs: chauffeurs.filter(c => c.statut === 'actif').length,
      suspendus: chauffeurs.filter(c => c.statut === 'suspendu').length,
      inactifs: chauffeurs.filter(c => c.statut === 'inactif').length
    };

    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:user-id-bold-duotone"></iconify-icon> Chauffeurs</h1>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-chauffeur"><iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> Ajouter</button>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom: var(--space-lg);">
        <div class="kpi-card"><div class="kpi-value">${stats.total}</div><div class="kpi-label">Total Volt</div></div>
        <div class="kpi-card green"><div class="kpi-value">${stats.actifs}</div><div class="kpi-label">Actifs</div></div>
        <div class="kpi-card yellow"><div class="kpi-value">${stats.suspendus}</div><div class="kpi-label">Suspendus</div></div>
        <div class="kpi-card red"><div class="kpi-value">${stats.inactifs}</div><div class="kpi-label">Inactifs</div></div>
      </div>

      <div id="chauffeurs-table"></div>
    `;
  },

  _bindListEvents() {
    const chauffeurs = Store.get('chauffeurs');
    const vehicules = Store.get('vehicules');
    const today = new Date().toISOString().split('T')[0];
    const pointages = Store.get('pointages') || [];
    const gpsData = Store.get('gps') || [];
    const settings = Store.get('settings') || {};
    const objectifMin = settings.objectifs?.tempsEnLigneMin || 630;

    this._table = Table.create({
      containerId: 'chauffeurs-table',
      columns: [
        {
          label: 'Chauffeur', key: 'nom', primary: true,
          render: (c) => {
            return `<div class="flex items-center gap-sm">
              ${Utils.getAvatarHtml(c, 'avatar-sm')}
              <div><div style="font-weight:500">${c.prenom} ${c.nom}</div><div style="font-size:11px;color:var(--text-muted)">${c.email}</div></div>
            </div>`;
          },
          value: (c) => `${c.nom} ${c.prenom}`
        },
        { label: 'Téléphone', key: 'telephone' },
        {
          label: 'Véhicule', key: 'vehiculeAssigne',
          render: (c) => {
            if (!c.vehiculeAssigne) return '<span class="text-muted">Non assigné</span>';
            const v = vehicules.find(x => x.id === c.vehiculeAssigne);
            return v ? `${v.marque} ${v.modele}` : c.vehiculeAssigne;
          }
        },
        {
          label: 'Temps en ligne', key: 'tempsEnLigne',
          render: (c) => {
            const ptg = pointages.find(p => p.chauffeurId === c.id && p.date === today);
            const gps = gpsData.find(g => g.chauffeurId === c.id && (g.date === today || g.date.startsWith(today)));
            const yangoMin = gps?.evenements?.tempsActiviteYango || 0;
            let minutes = 0;
            let source = '';
            if (ptg) {
              minutes = ptg.dureeTotaleMinutes || 0;
              if (ptg.statut === 'en_service' && ptg.heureDebut) {
                const debut = new Date(ptg.heureDebut);
                const now = new Date();
                let pauseMs = 0, pauseStart = null;
                for (const evt of (ptg.evenements || [])) {
                  if (evt.type === 'pause') pauseStart = new Date(evt.heure);
                  else if (evt.type === 'reprise' && pauseStart) { pauseMs += new Date(evt.heure) - pauseStart; pauseStart = null; }
                }
                minutes = Math.round((now - debut - pauseMs) / 60000);
              }
              source = 'pointage';
            } else if (yangoMin > 0) {
              minutes = yangoMin;
              source = 'yango';
            }
            if (!minutes) return '<span class="text-muted">--</span>';
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            const pct = Math.min(100, Math.round((minutes / objectifMin) * 100));
            const color = minutes >= objectifMin ? '#22c55e' : (pct >= 50 ? '#f59e0b' : '#ef4444');
            return `<div style="min-width:90px">
              <div style="font-size:0.82rem;font-weight:700;color:${color}">${h}h${String(m).padStart(2, '0')}${source === 'yango' ? ' <span style="font-size:0.55rem;color:#FC4C02;font-weight:600">Y</span>' : ''}</div>
              <div style="height:4px;background:var(--bg-tertiary);border-radius:2px;margin-top:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div>
              </div>
              <div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px">${pct}% de ${Math.floor(objectifMin/60)}h${objectifMin%60 > 0 ? String(objectifMin%60).padStart(2,'0') : ''}</div>
            </div>`;
          },
          value: (c) => {
            const ptg = pointages.find(p => p.chauffeurId === c.id && p.date === today);
            if (ptg) return ptg.dureeTotaleMinutes || 0;
            const gps = gpsData.find(g => g.chauffeurId === c.id && (g.date === today || g.date.startsWith(today)));
            return gps?.evenements?.tempsActiviteYango || -1;
          }
        },
        {
          label: 'Temps occup\u00e9', key: 'tempsOccupe',
          render: (c) => {
            const gps = gpsData.find(g => g.chauffeurId === c.id && (g.date === today || g.date.startsWith(today)));
            const activite = gps?.evenements?.tempsActiviteYango || 0;
            if (!activite) return '<span class="text-muted">--</span>';
            const h = Math.floor(activite / 60);
            const m = activite % 60;
            return `<div style="font-size:0.82rem;font-weight:700;color:#6366f1">${h}h${String(m).padStart(2, '0')}</div>`;
          },
          value: (c) => {
            const gps = gpsData.find(g => g.chauffeurId === c.id && (g.date === today || g.date.startsWith(today)));
            return gps?.evenements?.tempsActiviteYango || -1;
          }
        },
        {
          label: 'Score', key: 'scoreConduite',
          render: (c) => `<div class="score-circle ${Utils.scoreClass(c.scoreConduite)}">${c.scoreConduite}</div>`
        },
        {
          label: 'Statut', key: 'statut',
          render: (c) => {
            const ptg = pointages.find(p => p.chauffeurId === c.id && p.date === today);
            let badge = Utils.statusBadge(c.statut);
            if (ptg) {
              const labels = { en_service: 'En service', pause: 'En pause', termine: 'Termin\u00e9' };
              const colors = { en_service: '#22c55e', pause: '#f59e0b', termine: '#94a3b8' };
              badge += `<br><span style="font-size:0.65rem;font-weight:600;color:${colors[ptg.statut]}">${labels[ptg.statut]}</span>`;
            }
            return badge;
          }
        }
      ],
      data: chauffeurs,
      pageSize: 10,
      initialPage: this._currentPage,
      onPageChange: (page) => { this._currentPage = page; },
      onRowClick: (id) => Router.navigate(`/chauffeurs/${id}`),
      actions: (c) => `
        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); ChauffeursPage._edit('${c.id}')" title="Modifier"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon></button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); ChauffeursPage._delete('${c.id}')" title="Supprimer"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
      `
    });

    document.getElementById('btn-add-chauffeur').addEventListener('click', () => this._add());
  },

  _detailTemplate(c) {
    const vehicule = c.vehiculeAssigne ? Store.findById('vehicules', c.vehiculeAssigne) : null;
    const versements = Store.query('versements', v => v.chauffeurId === c.id);
    const courses = Store.query('courses', cr => cr.chauffeurId === c.id && cr.statut === 'terminee');
    const totalCA = courses.reduce((s, cr) => s + cr.montantTTC, 0);
    const totalVerse = versements.filter(v => v.statut !== 'supprime').reduce((s, v) => s + v.montantVerse, 0);
    const color = Utils.getAvatarColor(c.id);

    // Calculer les impayés de ce chauffeur
    const planning = Store.get('planning') || [];
    const absences = Store.get('absences') || [];
    const allVersements = Store.get('versements') || [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const redevance = c.redevanceQuotidienne || 0;
    let impayeCount = 0;
    let impayeTotal = 0;
    if (redevance > 0) {
      const daysMap = new Map();
      planning.filter(p => p.chauffeurId === c.id && p.date <= todayStr).forEach(p => {
        if (!daysMap.has(p.date)) daysMap.set(p.date, p);
      });
      daysMap.forEach((p) => {
        const hasAbsence = absences.some(a => a.chauffeurId === c.id && p.date >= a.dateDebut && p.date <= a.dateFin);
        if (hasAbsence) return;
        const hasPaid = allVersements.some(v => v.chauffeurId === c.id && v.date === p.date && (v.statut === 'valide' || v.statut === 'supprime'));
        if (!hasPaid) { impayeCount++; impayeTotal += redevance; }
      });
    }

    return `
      <div class="page-header">
        <h1>
          <a href="#/chauffeurs" style="color:var(--text-muted)"><iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon></a>
          Fiche chauffeur
        </h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="ChauffeursPage._showBilanMensuel('${c.id}')"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Bilan mensuel</button>
          <button class="btn btn-secondary" onclick="ChauffeursPage._showHistorique('${c.id}')"><iconify-icon icon="solar:history-bold-duotone"></iconify-icon> Historique</button>
          <button class="btn btn-secondary" onclick="ChauffeursPage._edit('${c.id}')"><iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> Modifier</button>
          <button class="btn btn-danger" onclick="ChauffeursPage._delete('${c.id}')"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon> Supprimer</button>
        </div>
      </div>

      <style>.driver-photo-upload:hover .photo-overlay{opacity:1!important;}</style>
      <div class="detail-header">
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div class="driver-photo-upload" id="photo-upload-zone" style="position:relative;cursor:pointer;" title="Cliquer pour changer la photo">
            ${Utils.getAvatarHtml(c, 'avatar-xl')}
            <div class="photo-overlay" style="position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;">
              <iconify-icon icon="solar:camera-bold-duotone" style="color:#fff;font-size:24px;"></iconify-icon>
            </div>
            <input type="file" id="photo-file-input" accept="image/*" style="display:none">
          </div>
          ${c.photo ? '<button class="btn btn-sm btn-danger" id="btn-delete-photo" style="margin-top:8px;font-size:11px;"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon> Supprimer photo</button>' : ''}
        </div>
        <div class="detail-info">
          <h2>${c.prenom} ${c.nom} ${Utils.statusBadge(c.statut)}${(() => {
            const today = new Date().toISOString().split('T')[0];
            const ptg = (Store.get('pointages') || []).find(p => p.chauffeurId === c.id && p.date === today);
            if (!ptg) return '';
            const labels = { en_service: 'En service', pause: 'En pause', termine: 'Terminé' };
            const colors = { en_service: '#22c55e', pause: '#f59e0b', termine: '#94a3b8' };
            return ` <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;background:${colors[ptg.statut]}20;color:${colors[ptg.statut]};margin-left:6px">${labels[ptg.statut]}</span>`;
          })()}</h2>
          <p>${c.email} &bull; ${c.telephone}</p>
          <div class="detail-stats">
            <div class="detail-stat">
              <div class="detail-stat-value" data-header-ca data-local-ca="${totalCA}">${Utils.formatCurrency(totalCA)}</div>
              <div class="detail-stat-label">CA total</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value" data-header-courses data-local-courses="${courses.length}">${courses.length}</div>
              <div class="detail-stat-label">Courses</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value" style="${impayeTotal > 0 ? 'color:#ef4444;font-weight:700' : ''}">${impayeTotal > 0 ? Utils.formatCurrency(impayeTotal) : '0'}</div>
              <div class="detail-stat-label">${impayeCount > 0 ? `<span style="color:#ef4444">${impayeCount} Impayé${impayeCount > 1 ? 's' : ''}</span>` : '✓ À jour'}</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value">${Utils.formatCurrency(totalVerse)}</div>
              <div class="detail-stat-label">Versé</div>
            </div>
            <div class="detail-stat">
              <div class="detail-stat-value score-circle ${Utils.scoreClass(c.scoreConduite)}" style="margin:0 auto">${c.scoreConduite}</div>
              <div class="detail-stat-label">Score conduite</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Temps en ligne & Temps occupé -->
      <div class="card" style="margin-bottom:var(--space-lg)">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> Temps en ligne</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span id="temps-statut-badge"></span>
            <input type="date" id="temps-date-filter" value="${new Date().toISOString().split('T')[0]}" max="${new Date().toISOString().split('T')[0]}" style="font-size:0.7rem;padding:4px 8px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;">
          </div>
        </div>
        <div id="temps-en-ligne-content"></div>
      </div>

      <div class="grid-2">
        <!-- Info card -->
        <div class="card">
          <div class="card-header"><span class="card-title">Informations</span></div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:var(--font-size-sm);">
            <div><span class="text-muted">Date de naissance</span><br><strong>${Utils.formatDate(c.dateNaissance)}</strong></div>
            <div><span class="text-muted">Adresse</span><br><strong>${c.adresse}</strong></div>
            <div><span class="text-muted">N° Permis</span><br><strong>${c.numeroPermis}</strong></div>
            <div><span class="text-muted">Début contrat</span><br><strong>${Utils.formatDate(c.dateDebutContrat)}</strong></div>
            <div><span class="text-muted">Véhicule</span><br><strong>${vehicule ? `${vehicule.marque} ${vehicule.modele} (${vehicule.immatriculation})` : 'Non assigné'}</strong></div>
            <div><span class="text-muted">Fin contrat</span><br><strong>${c.dateFinContrat ? Utils.formatDate(c.dateFinContrat) : 'En cours'}</strong></div>
            <div><span class="text-muted">Recette quotidienne</span><br><strong style="color:${c.redevanceQuotidienne > 0 ? 'var(--volt-blue)' : 'var(--text-muted)'}">${c.redevanceQuotidienne > 0 ? Utils.formatCurrency(c.redevanceQuotidienne) + ' / jour' : 'Non définie'}</strong></div>
          </div>
        </div>

        <!-- Documents & Expirations -->
        <div class="card">
          <div class="card-header"><span class="card-title"><iconify-icon icon="solar:document-bold-duotone"></iconify-icon> Documents</span></div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${(() => {
              const docItems = [
                { label: 'Permis de conduire', date: c.dateExpirationPermis },
                { label: 'Carte VTC', date: c.dateExpirationVTC },
                { label: 'Visite médicale', date: c.dateExpirationVisite }
              ];
              const now = new Date();
              return docItems.map(item => {
                if (!item.date) {
                  return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-radius:var(--radius-sm);background:var(--bg-tertiary);">' +
                    '<div style="font-size:var(--font-size-sm);font-weight:500;">' + item.label + '</div>' +
                    '<span class="badge" style="background:var(--bg-tertiary);color:var(--text-muted);">Non renseigné</span>' +
                  '</div>';
                }
                const expDate = new Date(item.date);
                const daysUntil = Math.ceil((expDate - now) / 86400000);
                let badgeStyle, badgeText;
                if (daysUntil < 0) {
                  badgeStyle = 'background:var(--danger);color:#fff;';
                  badgeText = 'Expiré depuis ' + Math.abs(daysUntil) + 'j';
                } else if (daysUntil <= 30) {
                  badgeStyle = 'background:var(--warning);color:#fff;';
                  badgeText = 'Expire dans ' + daysUntil + 'j';
                } else {
                  badgeStyle = 'background:var(--success);color:#fff;';
                  badgeText = 'Valide';
                }
                return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-radius:var(--radius-sm);background:var(--bg-tertiary);">' +
                  '<div>' +
                    '<div style="font-size:var(--font-size-sm);font-weight:500;">' + item.label + '</div>' +
                    '<div style="font-size:var(--font-size-xs);color:var(--text-muted);">Expire le ' + Utils.formatDate(item.date) + '</div>' +
                  '</div>' +
                  '<span class="badge" style="' + badgeStyle + '">' + badgeText + '</span>' +
                '</div>';
              }).join('');
            })()}
          </div>
        </div>

        <!-- Liaison Yango -->
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:bus-bold-duotone" style="color:#FC4C02"></iconify-icon> Liaison Yango</span>
            ${c.yangoDriverId
              ? '<span class="badge badge-success"><iconify-icon icon="solar:link-bold-duotone"></iconify-icon> Lié</span>'
              : '<span class="badge badge-warning"><iconify-icon icon="solar:link-broken-bold-duotone"></iconify-icon> Non lié</span>'}
          </div>
          ${c.yangoDriverId ? `
            <div style="font-size:var(--font-size-sm);margin-bottom:8px;">
              <span class="text-muted">Yango ID :</span> <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:11px;">${c.yangoDriverId}</code>
              <button class="btn btn-sm btn-danger" style="margin-left:8px;" onclick="ChauffeursPage._unlinkYango('${c.id}')">
                <iconify-icon icon="solar:link-broken-bold-duotone"></iconify-icon> Délier
              </button>
            </div>
          ` : `
            <div style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:10px;">
              Ce chauffeur n'est pas encore lié a un profil Yango. Cliquez ci-dessous pour rechercher et lier manuellement.
            </div>
            <button class="btn btn-primary btn-sm" onclick="ChauffeursPage._searchYangoDriver('${c.id}')">
              <iconify-icon icon="solar:magnifer-bold-duotone"></iconify-icon> Rechercher sur Yango
            </button>
            <div id="yango-search-results" style="margin-top:10px;"></div>
          `}
        </div>

        <!-- CA Yango (only if linked) -->
        ${c.yangoDriverId ? `
        <div class="card" id="yango-ca-card" style="border-top:3px solid #FC4C02;">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:wallet-bold-duotone" style="color:#FC4C02"></iconify-icon> CA Yango</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <input type="date" id="yango-ca-date" class="form-control"
                style="width:auto;font-size:12px;padding:4px 8px;min-height:auto;"
                value="${new Date().toISOString().split('T')[0]}"
                max="${new Date().toISOString().split('T')[0]}">
              <span id="yango-ca-live" style="font-size:9px;padding:2px 8px;background:#FC4C02;color:#fff;border-radius:10px;font-weight:700;">EN DIRECT</span>
            </div>
          </div>
          <div id="yango-ca-content" class="card-body">
            <div style="text-align:center;padding:var(--space-md);color:var(--text-muted);font-size:var(--font-size-xs);">
              <iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement des données Yango...
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Historique performance 30j -->
        ${c.yangoDriverId ? `
        <div class="card">
          <div class="card-header">
            <span class="card-title"><iconify-icon icon="solar:graph-up-bold-duotone" style="color:#3b82f6;"></iconify-icon> Historique 30 jours</span>
          </div>
          <div style="height:200px;">
            <canvas id="chart-perf-30j"></canvas>
          </div>
          <div id="perf-30j-loading" style="text-align:center;padding:var(--space-sm);color:var(--text-muted);font-size:var(--font-size-xs);">
            <iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement de l'historique...
          </div>
        </div>
        ` : ''}

        <!-- Documents -->
        <div class="card">
          <div class="card-header"><span class="card-title">Documents</span></div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${(c.documents || []).map(doc => `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:8px; border-radius:var(--radius-sm); background:var(--bg-tertiary);">
                <div>
                  <div style="font-size:var(--font-size-sm); font-weight:500;">${doc.nom}</div>
                  <div style="font-size:var(--font-size-xs); color:var(--text-muted);">Expire : ${Utils.formatDate(doc.dateExpiration)}</div>
                </div>
                ${Utils.statusBadge(doc.statut)}
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-grid" style="margin-top:var(--space-lg);">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:chart-2-bold-duotone"></iconify-icon> Scores de conduite</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-driver-scores"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon> Historique versements</div>
          </div>
          <div class="chart-container" style="height:280px;">
            <canvas id="chart-driver-payments"></canvas>
          </div>
        </div>
      </div>

      <!-- Historique versements -->
      <div class="card" style="margin-top:var(--space-md);">
        <div class="card-header">
          <span class="card-title"><iconify-icon icon="solar:chart-bold-duotone"></iconify-icon> Historique des versements</span>
        </div>
        <div style="height:250px;">
          <canvas id="chart-versements-history"></canvas>
        </div>
      </div>

      <!-- Recent courses -->
      <div class="card" style="margin-top:var(--space-lg);">
        <div class="card-header">
          <span class="card-title">Dernières courses</span>
        </div>
        <div id="driver-courses-table"></div>
      </div>
    `;
  },

  _loadDetailCharts(chauffeur) {
    this._charts = [];

    // Radar chart - driving scores
    const gpsData = Store.query('gps', g => g.chauffeurId === chauffeur.id);
    if (gpsData.length > 0) {
      const latest = gpsData.sort((a, b) => b.date.localeCompare(a.date))[0];
      const radarCtx = document.getElementById('chart-driver-scores');
      if (radarCtx) {
        this._charts.push(new Chart(radarCtx, {
          type: 'radar',
          data: {
            labels: ['Vitesse', 'Freinage', 'Accélération', 'Virages', 'Régularité'],
            datasets: [{
              label: 'Score',
              data: [latest.scoreVitesse, latest.scoreFreinage, latest.scoreAcceleration, latest.scoreVirage, latest.scoreRegularite],
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              borderWidth: 2,
              pointBackgroundColor: '#3b82f6',
              pointHoverRadius: 8,
              pointHoverBorderWidth: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const score = ctx.raw;
                    const qual = score > 80 ? 'Excellent' : score > 65 ? 'Bon' : score > 50 ? 'Moyen' : 'Faible';
                    return `${ctx.label}: ${score}/100 (${qual})`;
                  }
                }
              }
            },
            scales: {
              r: {
                beginAtZero: true,
                max: 100,
                ticks: { stepSize: 20, display: false },
                grid: { color: 'rgba(30, 41, 59, 0.5)' },
                angleLines: { color: 'rgba(30, 41, 59, 0.5)' },
                pointLabels: { color: '#94a3b8', font: { size: 12 } }
              }
            }
          }
        }));
      }
    }

    // Payment history chart
    const versements = Store.query('versements', v => v.chauffeurId === chauffeur.id && v.statut !== 'supprime')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12);

    const payCtx = document.getElementById('chart-driver-payments');
    if (payCtx && versements.length > 0) {
      const payChart = new Chart(payCtx, {
        type: 'line',
        data: {
          labels: versements.map(v => v.periode),
          datasets: [{
            label: 'Versé',
            data: versements.map(v => Math.round(v.montantVerse)),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            borderWidth: 2,
            pointHoverRadius: 7,
            pointHoverBorderWidth: 3
          }, {
            label: 'Commission',
            data: versements.map(v => Math.round(v.commission)),
            borderColor: '#facc15',
            borderWidth: 2,
            borderDash: [5, 5],
            pointHoverRadius: 7,
            pointHoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw;
                  const prev = ctx.dataIndex > 0 ? ctx.dataset.data[ctx.dataIndex - 1] : null;
                  let line = `${ctx.dataset.label}: ${Utils.formatCurrency(val)}`;
                  if (prev !== null) {
                    const diff = val - prev;
                    const pct = prev !== 0 ? ((diff / prev) * 100).toFixed(1) : '—';
                    const sign = diff >= 0 ? '+' : '';
                    line += ` (${sign}${Utils.formatCurrency(diff)}, ${sign}${pct}%)`;
                  }
                  return line;
                }
              }
            },
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => Utils.formatCurrency(v) } }
          }
        }
      });
      this._charts.push(payChart);
    }

    // Recent courses table
    const recentCourses = Store.query('courses', cr => cr.chauffeurId === chauffeur.id)
      .sort((a, b) => new Date(b.dateHeure) - new Date(a.dateHeure))
      .slice(0, 50);

    Table.create({
      containerId: 'driver-courses-table',
      columns: [
        { label: 'Date', key: 'dateHeure', render: (c) => Utils.formatDate(c.dateHeure) },
        { label: 'Départ', key: 'depart', render: (c) => `<span style="max-width:150px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.depart}</span>` },
        { label: 'Arrivée', key: 'arrivee', render: (c) => `<span style="max-width:150px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.arrivee}</span>` },
        { label: 'Distance', key: 'distanceKm', render: (c) => `${c.distanceKm} km` },
        { label: 'Montant', key: 'montantTTC', render: (c) => Utils.formatCurrency(c.montantTTC, 2), primary: true },
        { label: 'Statut', key: 'statut', render: (c) => Utils.statusBadge(c.statut) }
      ],
      data: recentCourses,
      pageSize: 10
    });
  },

  _loadVersementsChart(chauffeurId) {
    const ctx = document.getElementById('chart-versements-history');
    if (!ctx) return;

    const versements = Store.get('versements').filter(v => v.chauffeurId === chauffeurId && v.statut !== 'supprime');
    const now = new Date();
    const labels = [];
    const dataVerse = [];
    const dataAttendu = [];

    const ch = Store.findById('chauffeurs', chauffeurId);
    const redevance = ch ? (ch.redevanceQuotidienne || 0) : 0;

    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthNum = m.getMonth();
      const yearNum = m.getFullYear();

      labels.push(Utils.getMonthShort(monthNum));

      const monthVers = versements.filter(v => {
        const d = new Date(v.date);
        return d.getMonth() === monthNum && d.getFullYear() === yearNum;
      });

      dataVerse.push(monthVers.reduce((s, v) => s + v.montantVerse, 0));

      // Planning days for this chauffeur this month
      const planning = Store.get('planning') || [];
      const planDays = planning.filter(p => {
        const d = new Date(p.date);
        return p.chauffeurId === chauffeurId && d.getMonth() === monthNum && d.getFullYear() === yearNum;
      });
      const uniqueDays = new Set(planDays.map(p => p.date)).size;
      dataAttendu.push(uniqueDays * redevance);
    }

    if (this._detailChart) this._detailChart.destroy();
    this._detailChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Versé',
            data: dataVerse,
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderRadius: 4
          },
          {
            label: 'Attendu',
            data: dataAttendu,
            backgroundColor: 'rgba(59, 130, 246, 0.3)',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => Utils.formatCurrency(v) } }
        }
      }
    });
  },

  _bindDetailEvents(chauffeur) {
    // Photo upload events
    const uploadZone = document.getElementById('photo-upload-zone');
    const fileInput = document.getElementById('photo-file-input');
    if (uploadZone && fileInput) {
      uploadZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => this._handlePhotoUpload(chauffeur.id));
    }
    const deletePhotoBtn = document.getElementById('btn-delete-photo');
    if (deletePhotoBtn) {
      deletePhotoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deletePhoto(chauffeur.id);
      });
    }

    if (chauffeur && chauffeur.yangoDriverId) {
      // Load Yango CA on page load
      this._loadYangoCA(chauffeur.id);
      this._loadPerf30j(chauffeur);

      // Wire date picker change
      const dateInput = document.getElementById('yango-ca-date');
      if (dateInput) {
        dateInput.addEventListener('change', () => this._loadYangoCA(chauffeur.id));
      }

      // Auto-refresh every 2 min when viewing today
      this._yangoRefreshInterval = setInterval(() => {
        const input = document.getElementById('yango-ca-date');
        const today = new Date().toISOString().split('T')[0];
        if (input && input.value === today) {
          this._loadYangoCA(chauffeur.id);
        }
      }, 120000);
    }

    // Temps en ligne & occupé — initial render + date picker + API live
    const tempsDateInput = document.getElementById('temps-date-filter');
    if (tempsDateInput) {
      this._renderTempsEnLigneCard(chauffeur.id, tempsDateInput.value, chauffeur.yangoDriverId);
      tempsDateInput.addEventListener('change', () => {
        this._renderTempsEnLigneCard(chauffeur.id, tempsDateInput.value, chauffeur.yangoDriverId);
      });
    }
  },

  async _loadYangoCA(chauffeurId) {
    const chauffeur = Store.findById('chauffeurs', chauffeurId);
    if (!chauffeur || !chauffeur.yangoDriverId) return;

    const container = document.getElementById('yango-ca-content');
    if (!container) return;

    const dateInput = document.getElementById('yango-ca-date');
    const today = new Date().toISOString().split('T')[0];
    const selectedDate = dateInput ? dateInput.value : today;
    const isToday = selectedDate === today;

    // Show/hide live badge
    const liveBadge = document.getElementById('yango-ca-live');
    if (liveBadge) liveBadge.style.display = isToday ? '' : 'none';

    container.innerHTML = '<div style="text-align:center;padding:var(--space-md);color:var(--text-muted);font-size:var(--font-size-xs);"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Chargement...</div>';

    const stats = await Store.getYangoDriverStats(chauffeur.yangoDriverId, isToday ? null : selectedDate);

    if (!stats || stats.error) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-md);font-size:var(--font-size-xs);">
        <div style="color:var(--danger);margin-bottom:8px;"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> ${stats?.details || stats?.error || 'Erreur'}</div>
        <button class="btn btn-sm btn-secondary" onclick="ChauffeursPage._loadYangoCA('${chauffeurId}')"><iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Réessayer</button>
      </div>`;
      return;
    }

    container.innerHTML = `
      <div class="grid-4" style="gap:var(--space-sm);">
        <div style="text-align:center;padding:var(--space-sm);">
          <div style="font-size:var(--font-size-xl);font-weight:700;color:#FC4C02;">${Utils.formatCurrency(stats.totalCA)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">CA Total</div>
        </div>
        <div style="text-align:center;padding:var(--space-sm);">
          <div style="font-size:var(--font-size-lg);font-weight:600;color:#22c55e;">${Utils.formatCurrency(stats.totalCash)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:money-bag-bold-duotone" style="font-size:9px"></iconify-icon> Espèces</div>
        </div>
        <div style="text-align:center;padding:var(--space-sm);">
          <div style="font-size:var(--font-size-lg);font-weight:600;color:#3b82f6;">${Utils.formatCurrency(stats.totalCard)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:card-bold-duotone" style="font-size:9px"></iconify-icon> Carte</div>
        </div>
        <div style="text-align:center;padding:var(--space-sm);">
          <div style="font-size:var(--font-size-lg);font-weight:600;">${stats.nbCourses}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:bus-bold-duotone" style="font-size:9px"></iconify-icon> Courses</div>
        </div>
      </div>
      <div style="display:flex;justify-content:center;gap:var(--space-md);margin-top:var(--space-sm);padding-top:var(--space-sm);border-top:1px solid var(--border-color);font-size:var(--font-size-xs);color:var(--text-muted);">
        ${isToday ? '<span><iconify-icon icon="solar:record-circle-bold-duotone" style="color:#FC4C02;font-size:6px;vertical-align:middle"></iconify-icon> Temps réel</span>' : `<span><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon> ${Utils.formatDate(selectedDate)}</span>`}
        <span>Maj: ${new Date(stats.derniereMaj).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</span>
      </div>
    `;
  },

  async _loadPerf30j(chauffeur) {
    const canvas = document.getElementById('chart-perf-30j');
    const loading = document.getElementById('perf-30j-loading');
    if (!canvas || !chauffeur.yangoDriverId) return;

    const days = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }

    // Fetch les 30 derniers jours (batch de 5)
    const results = {};
    for (let i = 0; i < days.length; i += 5) {
      const batch = days.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map(async (date) => {
          const stats = await Store.getYangoDriverStats(chauffeur.yangoDriverId, date);
          return { date, stats };
        })
      );
      batchResults.forEach(r => {
        if (r.status === 'fulfilled' && r.value.stats && !r.value.stats.error) {
          results[r.value.date] = r.value.stats;
        }
      });
    }

    if (loading) loading.style.display = 'none';

    const labels = days.map(d => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth()+1}`; });
    const caData = days.map(d => results[d] ? (results[d].totalCA || 0) : 0);
    const coursesData = days.map(d => results[d] ? (results[d].nbCourses || 0) : 0);
    const objectif = chauffeur.objectifCA || 0;

    if (this._perf30jChart) this._perf30jChart.destroy();
    this._perf30jChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'CA',
            data: caData,
            backgroundColor: caData.map(v => objectif > 0 && v >= objectif ? 'rgba(34,197,94,0.7)' : 'rgba(252,76,2,0.6)'),
            borderRadius: 3,
            yAxisID: 'y',
            order: 2
          },
          {
            label: 'Courses',
            data: coursesData,
            type: 'line',
            borderColor: '#3b82f6',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.4,
            yAxisID: 'y1',
            order: 1
          },
          ...(objectif > 0 ? [{
            label: 'Objectif',
            data: days.map(() => objectif),
            type: 'line',
            borderColor: 'rgba(239,68,68,0.5)',
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            yAxisID: 'y',
            order: 0
          }] : [])
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', labels: { font: { size: 10 }, padding: 8, usePointStyle: true } },
          tooltip: {
            callbacks: {
              title: (items) => items[0]?.label || '',
              label: (ctx) => ctx.dataset.label === 'CA' || ctx.dataset.label === 'Objectif' ? `${ctx.dataset.label}: ${Utils.formatCurrency(ctx.raw)}` : `${ctx.dataset.label}: ${ctx.raw}`
            }
          }
        },
        scales: {
          y: { beginAtZero: true, position: 'left', ticks: { callback: v => v >= 1000 ? Math.round(v/1000) + 'k' : v, font: { size: 9 } } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { size: 9 } } },
          x: { ticks: { font: { size: 8 }, maxRotation: 0 } }
        }
      }
    });
  },

  // ======== PHOTO UPLOAD ========

  _handlePhotoUpload(chauffeurId) {
    const fileInput = document.getElementById('photo-file-input');
    if (!fileInput || !fileInput.files[0]) return;

    const file = fileInput.files[0];
    if (!file.type.startsWith('image/')) {
      Toast.error('Veuillez sélectionner une image');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 200;
        let w = img.width, h = img.height;
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const base64 = canvas.toDataURL('image/jpeg', 0.7);

        Store.update('chauffeurs', chauffeurId, { photo: base64 });
        Toast.success('Photo mise à jour');
        this.renderDetail(chauffeurId);
      };
      img.onerror = () => Toast.error('Image invalide');
      img.src = e.target.result;
    };
    reader.onerror = () => Toast.error('Erreur de lecture du fichier');
    reader.readAsDataURL(file);
  },

  _deletePhoto(chauffeurId) {
    Modal.confirm(
      'Supprimer la photo',
      'Voulez-vous supprimer la photo de ce chauffeur ?',
      () => {
        Store.update('chauffeurs', chauffeurId, { photo: null });
        Toast.success('Photo supprimée');
        this.renderDetail(chauffeurId);
      }
    );
  },

  // CRUD operations
  _getFormFields() {
    const vehicules = Store.get('vehicules');
    return [
      { type: 'row-start' },
      { name: 'prenom', label: 'Prénom', type: 'text', required: true },
      { name: 'nom', label: 'Nom', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'email', label: 'Email', type: 'email', required: false },
      { name: 'telephone', label: 'Téléphone', type: 'tel', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'dateNaissance', label: 'Date de naissance', type: 'date' },
      { name: 'numeroPermis', label: 'N° Permis', type: 'text' },
      { type: 'row-end' },
      { name: 'dateExpirationPermis', label: 'Expiration permis', type: 'date' },
      { name: 'adresse', label: 'Adresse', type: 'text' },
      { type: 'row-start' },
      { name: 'dateDebutContrat', label: 'Début contrat', type: 'date', required: true },
      { name: 'statut', label: 'Statut', type: 'select', options: [
        { value: 'actif', label: 'Actif' },
        { value: 'inactif', label: 'Inactif' },
        { value: 'suspendu', label: 'Suspendu' }
      ]},
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'dateExpirationVTC', label: 'Expiration carte VTC', type: 'date' },
      { name: 'dateExpirationVisite', label: 'Prochaine visite médicale', type: 'date' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'vehiculeAssigne', label: 'Véhicule assigné', type: 'select', placeholder: 'Sélectionner...', options: vehicules.map(v => ({ value: v.id, label: `${v.marque} ${v.modele} (${v.immatriculation})` })) },
      { name: 'parcId', label: 'Parc', type: 'select', placeholder: 'Aucun parc', options: (Store.get('parcs') || []).map(p => ({ value: p.id, label: p.nom })) },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'redevanceQuotidienne', label: 'Recette quotidienne (FCFA)', type: 'number', min: 0, step: 500, placeholder: 'Montant journalier à verser', default: 0 },
      { name: 'objectifCA', label: 'Objectif CA Yango journalier (FCFA)', type: 'number', min: 0, step: 1000, placeholder: 'Ex: 30000', default: 0 },
      { type: 'row-end' },
      { type: 'divider' },
      { type: 'heading', label: 'Liaison Yango' },
      { name: 'yangoDriverId', label: 'Yango Driver ID', type: 'text', placeholder: 'Ex: abc123... (sera rempli auto par la sync ou manuellement)' },
      { name: 'noteInterne', label: 'Note interne', type: 'textarea', rows: 2 }
    ];
  },

  _add() {
    const fields = this._getFormFields();
    const formHtml = FormBuilder.build(fields);

    this._currentEditId = null; // Mode creation
    Modal.form('<iconify-icon icon="solar:user-plus-bold-duotone" class="text-blue"></iconify-icon> Nouveau chauffeur', formHtml, () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;

      const values = FormBuilder.getValues(body);
      const chauffeur = {
        id: Utils.generateId('CHF'),
        ...values,
        dateFinContrat: null,
        photo: null,
        documents: [],
        scoreConduite: Utils.random(60, 95),
        dateCreation: new Date().toISOString()
      };

      Store.add('chauffeurs', chauffeur);
      Modal.close();
      Toast.success(`${chauffeur.prenom} ${chauffeur.nom} ajouté avec succès`);
      this.render();
    }, 'modal-lg');

    // Injecter le bouton "+ Créer véhicule" a coté du select vehiculeAssigne
    this._injectQuickVehicleButton();
    // Injecter le bouton "Rechercher sur Yango" a coté du champ yangoDriverId
    this._injectYangoSearchButton();
  },

  _edit(id) {
    const chauffeur = Store.findById('chauffeurs', id);
    if (!chauffeur) return;

    const fields = this._getFormFields();
    const formHtml = FormBuilder.build(fields, chauffeur);

    this._currentEditId = id; // Mode edition
    Modal.form('<iconify-icon icon="solar:user-pen-bold-duotone" class="text-blue"></iconify-icon> Modifier chauffeur', formHtml, () => {
      const body = document.getElementById('modal-body');
      if (!FormBuilder.validate(body, fields)) return;

      const values = FormBuilder.getValues(body);
      Store.update('chauffeurs', id, values);
      Modal.close();
      Toast.success('Chauffeur modifié avec succès');

      // Re-render current view
      if (window.location.hash.includes(id)) {
        this.renderDetail(id);
      } else {
        this.render();
      }
    }, 'modal-lg');

    // Injecter le bouton "+ Créer véhicule" a coté du select vehiculeAssigne
    this._injectQuickVehicleButton();
    // Injecter le bouton "Rechercher sur Yango" a coté du champ yangoDriverId
    this._injectYangoSearchButton();
  },

  _delete(id) {
    const chauffeur = Store.findById('chauffeurs', id);
    if (!chauffeur) return;

    Modal.confirm(
      'Supprimer le chauffeur',
      `Êtes-vous sûr de vouloir supprimer <strong>${chauffeur.prenom} ${chauffeur.nom}</strong> ? Cette action est irréversible.`,
      () => {
        Store.delete('chauffeurs', id);
        Toast.success('Chauffeur supprimé');
        Router.navigate('/chauffeurs');
      }
    );
  },

  // ======== QUICK VEHICLE CREATION ========

  _injectQuickVehicleButton() {
    // Trouver le select vehiculeAssigne dans le modal ouvert
    setTimeout(() => {
      const select = document.querySelector('#modal-body [name="vehiculeAssigne"]');
      if (!select) return;

      // Verifier qu'on n'a pas deja ajoute le bouton
      if (select.parentElement.querySelector('.quick-add-vehicle-btn')) return;

      // Wrapper le select + bouton dans un flex container
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';

      select.parentElement.insertBefore(wrapper, select);
      wrapper.appendChild(select);
      select.style.flex = '1';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary quick-add-vehicle-btn';
      btn.style.cssText = 'white-space:nowrap;margin-top:0;height:38px;padding:0 12px;';
      btn.innerHTML = '<iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> <iconify-icon icon="solar:wheel-bold-duotone" style="font-size:11px;"></iconify-icon>';
      btn.title = 'Créer un véhicule rapidement';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._quickAddVehicle();
      });
      wrapper.appendChild(btn);
    }, 50);
  },

  // ======== YANGO SEARCH IN FORM ========

  _injectYangoSearchButton() {
    setTimeout(() => {
      const input = document.querySelector('#modal-body [name="yangoDriverId"]');
      if (!input) return;

      // Verifier qu'on n'a pas deja ajoute le bouton
      if (input.parentElement.querySelector('.yango-search-form-btn')) return;

      // Wrapper l'input + bouton dans un flex container
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';

      input.parentElement.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      input.style.flex = '1';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary yango-search-form-btn';
      btn.style.cssText = 'white-space:nowrap;margin-top:0;height:38px;padding:0 12px;';
      btn.innerHTML = '<iconify-icon icon="solar:magnifer-bold-duotone"></iconify-icon> Yango';
      btn.title = 'Rechercher un chauffeur sur Yango';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._searchYangoInForm();
      });
      wrapper.appendChild(btn);

      // Ajouter le container de résultats sous le wrapper
      const resultsDiv = document.createElement('div');
      resultsDiv.id = 'yango-form-search-results';
      resultsDiv.style.cssText = 'margin-top:4px;';
      wrapper.parentElement.insertBefore(resultsDiv, wrapper.nextSibling);
    }, 60);
  },

  async _searchYangoInForm() {
    const container = document.getElementById('yango-form-search-results');
    if (!container) return;

    // Récupérer nom + telephone du formulaire pour le scoring de pertinence
    const body = document.getElementById('modal-body');
    const prenom = (body.querySelector('[name="prenom"]')?.value || '').trim();
    const nom = (body.querySelector('[name="nom"]')?.value || '').trim();
    const telephone = (body.querySelector('[name="telephone"]')?.value || '').trim();

    container.innerHTML = '<div style="padding:8px;font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Recherche des chauffeurs Yango...</div>';

    try {
      const res = await Store.getYangoDriversForLinking();
      if (!res || !res.drivers) {
        container.innerHTML = '<div style="color:#ef4444;font-size:var(--font-size-xs);"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Impossible de charger les chauffeurs Yango</div>';
        return;
      }

      const drivers = res.drivers;
      const searchName = `${prenom} ${nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const searchPhone = telephone.replace(/\D/g, '').slice(-10);

      // Scoring identique a _searchYangoDriver
      const scored = drivers.map(d => {
        let score = 0;
        const yName = `${d.prenom} ${d.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const yPhone = (d.telephone || '').replace(/\D/g, '').slice(-10);

        if (searchName.length >= 3) {
          if (yName === searchName) score += 100;
          else if (`${d.nom} ${d.prenom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === searchName) score += 90;
          else {
            const searchWords = searchName.split(' ').filter(w => w.length >= 3);
            const yWords = yName.split(' ');
            for (const sw of searchWords) {
              if (yWords.some(yw => yw === sw)) score += 30;
            }
          }
        }

        if (searchPhone.length >= 8 && yPhone === searchPhone) score += 80;

        return { ...d, _score: score };
      });

      scored.sort((a, b) => b._score - a._score);

      const top = scored.slice(0, 20);
      const matchCount = scored.filter(d => d._score > 0).length;

      container.innerHTML = `
        <div style="margin-bottom:8px;">
          <input type="text" class="form-control" id="yango-form-filter-input" placeholder="Filtrer par nom..." style="font-size:var(--font-size-xs);padding:6px 10px;"
            oninput="ChauffeursPage._filterYangoFormResults()">
        </div>
        ${matchCount > 0 ? `<div style="font-size:var(--font-size-xs);color:#22c55e;margin-bottom:6px;"><iconify-icon icon="solar:star-bold-duotone"></iconify-icon> ${matchCount} correspondance(s) probable(s)</div>` : ''}
        ${(!prenom && !nom && !telephone) ? '<div style="font-size:var(--font-size-xs);color:var(--warning);margin-bottom:6px;"><iconify-icon icon="solar:info-circle-bold-duotone"></iconify-icon> Remplissez nom/téléphone pour un meilleur tri</div>' : ''}
        <div id="yango-form-drivers-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-sm);">
          ${this._renderYangoFormDriversList(top)}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${drivers.length} chauffeurs Yango au total</div>
      `;

      // Stocker pour le filtre
      this._yangoFormDriversCache = scored;
    } catch (err) {
      container.innerHTML = `<div style="color:#ef4444;font-size:var(--font-size-xs);"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Erreur: ${err.message}</div>`;
    }
  },

  _renderYangoFormDriversList(drivers) {
    if (drivers.length === 0) return '<div style="padding:12px;text-align:center;font-size:var(--font-size-xs);color:var(--text-muted);">Aucun résultat</div>';

    return drivers.map(d => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border-color);font-size:var(--font-size-xs);${d._score >= 80 ? 'background:rgba(34,197,94,0.06);' : ''}">
        <div style="flex:1;">
          <div style="font-weight:500;">
            ${d._score >= 80 ? '<iconify-icon icon="solar:star-bold-duotone" style="color:#22c55e;font-size:9px;"></iconify-icon> ' : ''}
            ${d.prenom} ${d.nom}
          </div>
          <div style="color:var(--text-muted);font-size:10px;">${d.telephone || 'Pas de tel'} &bull; ${d.workStatus || '?'}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="ChauffeursPage._linkYangoFromForm('${d.id}', '${(d.prenom + ' ' + d.nom).replace(/'/g, "\\'")}')">
          <iconify-icon icon="solar:link-bold-duotone"></iconify-icon> Lier
        </button>
      </div>
    `).join('');
  },

  _filterYangoFormResults() {
    const input = document.getElementById('yango-form-filter-input');
    const list = document.getElementById('yango-form-drivers-list');
    if (!input || !list || !this._yangoFormDriversCache) return;

    const query = input.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    let filtered = this._yangoFormDriversCache;

    if (query) {
      filtered = this._yangoFormDriversCache.filter(d => {
        const name = `${d.prenom} ${d.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const phone = d.telephone || '';
        return name.includes(query) || phone.includes(query);
      });
    }

    list.innerHTML = this._renderYangoFormDriversList(filtered.slice(0, 30));
  },

  _linkYangoFromForm(yangoId, yangoNom) {
    const input = document.querySelector('#modal-body [name="yangoDriverId"]');
    if (input) {
      input.value = yangoId;
      // Déclencher l'event change pour que FormBuilder le capte
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Remplacer la zone de résultats par un badge de confirmation
    const container = document.getElementById('yango-form-search-results');
    if (container) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius-sm);font-size:var(--font-size-xs);margin-top:4px;">
          <iconify-icon icon="solar:check-circle-bold-duotone" style="color:#22c55e;"></iconify-icon>
          <span>Lié à <strong>${yangoNom}</strong> (${yangoId})</span>
          <button type="button" class="btn btn-sm" style="margin-left:auto;padding:2px 8px;font-size:10px;" onclick="ChauffeursPage._unlinkYangoFromForm()">
            <iconify-icon icon="solar:close-circle-bold"></iconify-icon>
          </button>
        </div>
      `;
    }

    Toast.success(`Chauffeur sera lié à ${yangoNom} sur Yango`);
  },

  _unlinkYangoFromForm() {
    const input = document.querySelector('#modal-body [name="yangoDriverId"]');
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const container = document.getElementById('yango-form-search-results');
    if (container) container.innerHTML = '';
  },

  _quickAddVehicle() {
    // Sauvegarder l'etat du formulaire chauffeur actuellement ouvert
    const chauffeurModal = document.getElementById('modal-body');
    const savedValues = chauffeurModal ? FormBuilder.getValues(chauffeurModal) : {};
    if (this._currentEditId) savedValues._editId = this._currentEditId;

    // Construire un formulaire vehicule simplifie
    const quickFields = [
      { type: 'row-start' },
      { name: 'marque', label: 'Marque', type: 'text', required: true, placeholder: 'Ex: Toyota' },
      { name: 'modele', label: 'Modèle', type: 'text', required: true, placeholder: 'Ex: Corolla' },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'annee', label: 'Année', type: 'number', min: 2015, max: 2026, required: true, default: new Date().getFullYear() },
      { name: 'immatriculation', label: 'Immatriculation', type: 'text', required: true },
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'couleur', label: 'Couleur', type: 'text', placeholder: 'Ex: Noir' },
      { name: 'typeEnergie', label: "Énergie", type: 'select', options: [
        { value: 'thermique', label: 'Thermique' },
        { value: 'electrique', label: 'Électrique' }
      ]},
      { type: 'row-end' },
      { type: 'row-start' },
      { name: 'typeAcquisition', label: 'Acquisition', type: 'select', options: [
        { value: 'leasing', label: 'Leasing' },
        { value: 'cash', label: 'Cash' }
      ]},
      { name: 'kilometrage', label: 'Kilométrage', type: 'number', min: 0, default: 0 },
      { type: 'row-end' }
    ];

    const quickFormHtml = FormBuilder.build(quickFields);

    // Ouvrir un second modal (on ferme d'abord le premier, puis on le rouvrira)
    Modal.close();

    setTimeout(() => {
      Modal.form('<iconify-icon icon="solar:wheel-bold-duotone" class="text-blue"></iconify-icon> Création rapide véhicule', quickFormHtml, () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, quickFields)) return;

        const values = FormBuilder.getValues(body);
        const isEV = values.typeEnergie === 'electrique';
        const vehicule = {
          id: Utils.generateId('VEH'),
          ...values,
          vin: '',
          consommation: isEV ? 15 : 6.5,
          coutEnergie: isEV ? 120 : 800,
          kilometrageMensuel: 2500,
          dateDerniereRevision: null,
          prochainRevisionKm: (values.kilometrage || 0) + 10000,
          assureur: '',
          primeAnnuelle: 0,
          prixAchat: 0,
          mensualiteLeasing: 0,
          dureeLeasing: 0,
          apportInitial: 0,
          numeroPolice: '',
          dateExpirationAssurance: '',
          statut: 'en_service',
          coutsMaintenance: [],
          dateCreation: new Date().toISOString()
        };

        if (isEV) {
          vehicule.capaciteBatterie = 60;
          vehicule.autonomieKm = 350;
          vehicule.niveauBatterie = 100;
          vehicule.typeChargeur = 'CCS Combo 2';
          vehicule.puissanceChargeMax = 100;
          vehicule.tempsRechargeRapide = 30;
          vehicule.tempsRechargeNormale = 480;
          vehicule.dernierRecharge = new Date().toISOString().split('T')[0];
          vehicule.stationRechargeHabituelle = '';
        }

        Store.add('vehicules', vehicule);
        Modal.close();
        Toast.success(`${vehicule.marque} ${vehicule.modele} créé et sélectionné`);

        // Rouvrir le formulaire chauffeur avec le vehicule pre-selectionne
        savedValues.vehiculeAssigne = vehicule.id;
        this._reopenChauffeurForm(savedValues);
      }, 'modal-md', () => {
        // Annulation : rouvrir le formulaire chauffeur avec les valeurs sauvegardées
        this._reopenChauffeurForm(savedValues);
      });
    }, 200);
  },

  _reopenChauffeurForm(savedValues) {
    // Reconstruire les fields (avec le nouveau vehicule dans la liste)
    const fields = this._getFormFields();
    const formHtml = FormBuilder.build(fields, savedValues);

    const isEdit = savedValues._editId;
    const title = isEdit
      ? '<iconify-icon icon="solar:user-pen-bold-duotone" class="text-blue"></iconify-icon> Modifier chauffeur'
      : '<iconify-icon icon="solar:user-plus-bold-duotone" class="text-blue"></iconify-icon> Nouveau chauffeur';

    setTimeout(() => {
      Modal.form(title, formHtml, () => {
        const body = document.getElementById('modal-body');
        if (!FormBuilder.validate(body, fields)) return;

        const values = FormBuilder.getValues(body);
        delete values._editId;

        if (isEdit) {
          Store.update('chauffeurs', isEdit, values);
          Modal.close();
          Toast.success('Chauffeur modifié avec succès');
          if (window.location.hash.includes(isEdit)) {
            this.renderDetail(isEdit);
          } else {
            this.render();
          }
        } else {
          const chauffeur = {
            id: Utils.generateId('CHF'),
            ...values,
            dateFinContrat: null,
            photo: null,
            documents: [],
            scoreConduite: Utils.random(60, 95),
            dateCreation: new Date().toISOString()
          };
          Store.add('chauffeurs', chauffeur);
          Modal.close();
          Toast.success(`${chauffeur.prenom} ${chauffeur.nom} ajouté avec succès`);
          this.render();
        }
      }, 'modal-lg');

      this._injectQuickVehicleButton();
    }, 200);
  },

  // ======== YANGO LINKING ========

  async _searchYangoDriver(chauffeurId) {
    const container = document.getElementById('yango-search-results');
    if (!container) return;

    const chauffeur = Store.findById('chauffeurs', chauffeurId);
    if (!chauffeur) return;

    container.innerHTML = '<div style="padding:8px;font-size:var(--font-size-xs);color:var(--text-muted);"><iconify-icon icon="solar:refresh-bold" class="spin-icon"></iconify-icon> Recherche des chauffeurs Yango...</div>';

    try {
      const res = await Store.getYangoDriversForLinking();
      if (!res || !res.drivers) {
        container.innerHTML = '<div style="color:#ef4444;font-size:var(--font-size-xs);"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Impossible de charger les chauffeurs Yango</div>';
        return;
      }

      const drivers = res.drivers;
      const searchName = `${chauffeur.prenom} ${chauffeur.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const searchPhone = (chauffeur.telephone || '').replace(/\D/g, '').slice(-10);

      // Trier par pertinence : d'abord ceux qui matchent le nom/telephone
      const scored = drivers.map(d => {
        let score = 0;
        const yName = `${d.prenom} ${d.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const yPhone = (d.telephone || '').replace(/\D/g, '').slice(-10);

        // Match exact nom
        if (yName === searchName) score += 100;
        // Match inverse
        else if (`${d.nom} ${d.prenom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === searchName) score += 90;
        // Match partiel (un des mots du nom)
        else {
          const searchWords = searchName.split(' ');
          const yWords = yName.split(' ');
          for (const sw of searchWords) {
            if (sw.length >= 3 && yWords.some(yw => yw === sw)) score += 30;
          }
        }

        // Match telephone
        if (searchPhone.length >= 8 && yPhone === searchPhone) score += 80;

        return { ...d, _score: score };
      });

      scored.sort((a, b) => b._score - a._score);

      // Afficher les 20 premiers (pertinents d'abord)
      const top = scored.slice(0, 20);
      const matchCount = scored.filter(d => d._score > 0).length;

      container.innerHTML = `
        <div style="margin-bottom:8px;">
          <input type="text" class="form-control" id="yango-search-input" placeholder="Filtrer par nom..." style="font-size:var(--font-size-xs);padding:6px 10px;"
            oninput="ChauffeursPage._filterYangoResults()">
        </div>
        ${matchCount > 0 ? `<div style="font-size:var(--font-size-xs);color:#22c55e;margin-bottom:6px;"><iconify-icon icon="solar:star-bold-duotone"></iconify-icon> ${matchCount} correspondance(s) probable(s)</div>` : ''}
        <div id="yango-drivers-list" style="max-height:250px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-sm);">
          ${this._renderYangoDriversList(top, chauffeurId)}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${drivers.length} chauffeurs Yango au total</div>
      `;

      // Stocker pour le filtre
      this._yangoDriversCache = scored;
      this._yangoLinkChauffeurId = chauffeurId;
    } catch (err) {
      container.innerHTML = `<div style="color:#ef4444;font-size:var(--font-size-xs);"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> Erreur: ${err.message}</div>`;
    }
  },

  _renderYangoDriversList(drivers, chauffeurId) {
    if (drivers.length === 0) return '<div style="padding:12px;text-align:center;font-size:var(--font-size-xs);color:var(--text-muted);">Aucun resultat</div>';

    return drivers.map(d => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border-color);font-size:var(--font-size-xs);${d._score >= 80 ? 'background:rgba(34,197,94,0.06);' : ''}">
        <div style="flex:1;">
          <div style="font-weight:500;">
            ${d._score >= 80 ? '<iconify-icon icon="solar:star-bold-duotone" style="color:#22c55e;font-size:9px;"></iconify-icon> ' : ''}
            ${d.prenom} ${d.nom}
          </div>
          <div style="color:var(--text-muted);font-size:10px;">${d.telephone || 'Pas de tel'} &bull; ${d.workStatus || '?'}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="ChauffeursPage._linkYango('${chauffeurId}', '${d.id}', '${(d.prenom + ' ' + d.nom).replace(/'/g, "\\'")}')">
          <iconify-icon icon="solar:link-bold-duotone"></iconify-icon> Lier
        </button>
      </div>
    `).join('');
  },

  _filterYangoResults() {
    const input = document.getElementById('yango-search-input');
    const list = document.getElementById('yango-drivers-list');
    if (!input || !list || !this._yangoDriversCache) return;

    const query = input.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    let filtered = this._yangoDriversCache;

    if (query) {
      filtered = this._yangoDriversCache.filter(d => {
        const name = `${d.prenom} ${d.nom}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const phone = d.telephone || '';
        return name.includes(query) || phone.includes(query);
      });
    }

    list.innerHTML = this._renderYangoDriversList(filtered.slice(0, 30), this._yangoLinkChauffeurId);
  },

  async _linkYango(chauffeurId, yangoId, yangoNom) {
    Store.update('chauffeurs', chauffeurId, { yangoDriverId: yangoId });
    Toast.success(`Chauffeur lié a ${yangoNom} sur Yango`);
    this.renderDetail(chauffeurId);
  },

  async _unlinkYango(chauffeurId) {
    Modal.confirm(
      'D\u00e9lier le profil Yango',
      'Voulez-vous supprimer la liaison avec le profil Yango ? Le chauffeur ne sera plus synchronis\u00e9 automatiquement.',
      () => {
        Store.update('chauffeurs', chauffeurId, { yangoDriverId: '' });
        Toast.success('Liaison Yango supprim\u00e9e');
        this.renderDetail(chauffeurId);
      }
    );
  },

  // =================== BILAN MENSUEL ===================

  _showBilanMensuel(chauffeurId) {
    const ch = Store.findById('chauffeurs', chauffeurId);
    if (!ch) return;
    const name = `${ch.prenom} ${ch.nom}`;
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const monthLabel = Utils.getMonthName(thisMonth) + ' ' + thisYear;

    const versements = Store.query('versements', v => v.chauffeurId === chauffeurId);
    const planning = Store.query('planning', p => p.chauffeurId === chauffeurId);
    const absences = Store.query('absences', a => a.chauffeurId === chauffeurId);
    const courses = Store.query('courses', c => c.chauffeurId === chauffeurId && c.statut === 'terminee');

    // Ce mois
    const monthPlanning = planning.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const monthVersements = versements.filter(v => {
      const d = new Date(v.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const monthCourses = courses.filter(c => {
      const d = new Date(c.dateHeure);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const monthAbsences = absences.filter(a => {
      const debut = new Date(a.dateDebut);
      const fin = new Date(a.dateFin);
      const debutMois = new Date(thisYear, thisMonth, 1);
      const finMois = new Date(thisYear, thisMonth + 1, 0);
      return debut <= finMois && fin >= debutMois;
    });

    const joursTravailles = new Set(monthPlanning.map(p => p.date)).size;
    const joursAbsence = monthAbsences.reduce((s, a) => {
      const debut = new Date(Math.max(new Date(a.dateDebut), new Date(thisYear, thisMonth, 1)));
      const fin = new Date(Math.min(new Date(a.dateFin), new Date(thisYear, thisMonth + 1, 0)));
      return s + Math.max(0, Math.ceil((fin - debut) / 86400000) + 1);
    }, 0);

    const redevance = ch.redevanceQuotidienne || 0;
    const totalAttendu = joursTravailles * redevance;
    const totalPaye = monthVersements.filter(v => v.statut === 'valide').reduce((s, v) => s + v.montantVerse, 0);
    const totalRetard = monthVersements.filter(v => v.statut === 'retard').length;
    const totalEnAttente = monthVersements.filter(v => v.statut === 'en_attente').length;
    const solde = totalPaye - totalAttendu;
    const caMois = monthCourses.reduce((s, c) => s + c.montantTTC, 0);

    // Pénalités
    const joursImpayesSansPaiement = monthPlanning.filter(p => {
      const hasValid = versements.some(v => v.chauffeurId === chauffeurId && v.date === p.date && v.statut === 'valide');
      return !hasValid && p.date <= now.toISOString().split('T')[0];
    });
    let totalPenalites = 0;
    joursImpayesSansPaiement.forEach(p => {
      const jours = Math.floor((now - new Date(p.date)) / 86400000);
      if (jours > 7) totalPenalites += Math.round(redevance * 0.15);
      else if (jours > 4) totalPenalites += Math.round(redevance * 0.10);
      else if (jours > 2) totalPenalites += Math.round(redevance * 0.05);
    });

    const body = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);text-align:center;">
          <div style="font-size:var(--font-size-xl);font-weight:700;color:#3b82f6;">${joursTravailles}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Jours travaill\u00e9s</div>
        </div>
        <div style="padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);text-align:center;">
          <div style="font-size:var(--font-size-xl);font-weight:700;color:#f59e0b;">${joursAbsence}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Jours d'absence</div>
        </div>
        <div style="padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);text-align:center;">
          <div style="font-size:var(--font-size-xl);font-weight:700;color:#22c55e;">${Utils.formatCurrency(totalPaye)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Redevances pay\u00e9es</div>
        </div>
        <div style="padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);text-align:center;">
          <div style="font-size:var(--font-size-xl);font-weight:700;color:#ef4444;">${Utils.formatCurrency(totalAttendu)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">Redevances attendues</div>
        </div>
      </div>

      <div style="padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:var(--font-size-sm);font-weight:600;">Solde</span>
          <span style="font-size:var(--font-size-lg);font-weight:700;color:${solde >= 0 ? '#22c55e' : '#ef4444'};">${solde >= 0 ? '+' : ''}${Utils.formatCurrency(solde)}</span>
        </div>
        ${totalPenalites > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:var(--font-size-sm);color:#f59e0b;"><iconify-icon icon="solar:danger-triangle-bold-duotone"></iconify-icon> P\u00e9nalit\u00e9s</span>
          <span style="font-size:var(--font-size-sm);font-weight:600;color:#f59e0b;">${Utils.formatCurrency(totalPenalites)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:var(--font-size-sm);color:var(--text-muted);">CA courses (mois)</span>
          <span style="font-size:var(--font-size-sm);font-weight:500;">${Utils.formatCurrency(caMois)}</span>
        </div>
      </div>

      <div style="font-size:var(--font-size-xs);color:var(--text-muted);display:flex;gap:12px;flex-wrap:wrap;">
        <span><iconify-icon icon="solar:check-circle-bold-duotone" style="color:#22c55e;"></iconify-icon> ${monthVersements.filter(v => v.statut === 'valide').length} valid\u00e9(s)</span>
        <span><iconify-icon icon="solar:clock-circle-bold-duotone" style="color:#f59e0b;"></iconify-icon> ${totalEnAttente} en attente</span>
        <span><iconify-icon icon="solar:danger-triangle-bold-duotone" style="color:#ef4444;"></iconify-icon> ${totalRetard} en retard</span>
        <span><iconify-icon icon="solar:bus-bold-duotone"></iconify-icon> ${monthCourses.length} courses</span>
      </div>
    `;

    Modal.open({
      title: `<iconify-icon icon="solar:chart-bold-duotone" style="color:#3b82f6;"></iconify-icon> Bilan mensuel \u2014 ${name}`,
      body: `<div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:12px;">${monthLabel} &bull; Redevance: ${Utils.formatCurrency(redevance)}/jour</div>${body}`,
      footer: `<button class="btn btn-secondary" onclick="ChauffeursPage._exportBilanPDF('${chauffeurId}')" style="margin-right:auto;"><iconify-icon icon="solar:file-download-bold-duotone"></iconify-icon> PDF</button><button class="btn btn-secondary" data-action="cancel">Fermer</button>`,
      size: 'medium'
    });
  },

  _exportBilanPDF(chauffeurId) {
    const ch = Store.findById('chauffeurs', chauffeurId);
    if (!ch) return;
    const name = `${ch.prenom} ${ch.nom}`;
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const versements = Store.query('versements', v => v.chauffeurId === chauffeurId);
    const planning = Store.query('planning', p => p.chauffeurId === chauffeurId);
    const monthPlanning = planning.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const monthVersements = versements.filter(v => {
      const d = new Date(v.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const headers = ['Date', 'Cr\u00e9neau', 'Redevance', 'Vers\u00e9', 'Statut'];
    const rows = monthPlanning.sort((a, b) => a.date.localeCompare(b.date)).map(p => {
      const v = monthVersements.find(v => v.date === p.date);
      return [
        Utils.formatDate(p.date),
        p.typeCreneaux || '',
        Utils.formatCurrency(ch.redevanceQuotidienne || 0),
        v ? Utils.formatCurrency(v.montantVerse) : '-',
        v ? v.statut : 'Non pay\u00e9'
      ];
    });

    Utils.exportPDF(`Bilan ${Utils.getMonthName(thisMonth)} ${thisYear} - ${name}`, headers, rows, {
      orientation: 'portrait',
      subtitle: `Chauffeur: ${name} | Redevance: ${Utils.formatCurrency(ch.redevanceQuotidienne || 0)}/jour`
    });
  },

  // =================== HISTORIQUE COMPLET ===================

  _showHistorique(chauffeurId) {
    const ch = Store.findById('chauffeurs', chauffeurId);
    if (!ch) return;
    const name = `${ch.prenom} ${ch.nom}`;

    const versements = Store.query('versements', v => v.chauffeurId === chauffeurId);
    const planning = Store.query('planning', p => p.chauffeurId === chauffeurId);
    const absences = Store.query('absences', a => a.chauffeurId === chauffeurId);
    const courses = Store.query('courses', c => c.chauffeurId === chauffeurId);

    // Assembler une timeline unifi\u00e9e
    const timeline = [];

    versements.forEach(v => {
      timeline.push({
        date: v.date,
        type: 'versement',
        icon: 'solar:hand-money-bold-duotone',
        color: v.statut === 'valide' ? '#22c55e' : v.statut === 'retard' ? '#ef4444' : '#f59e0b',
        label: `Versement ${v.statut === 'valide' ? 'valid\u00e9' : v.statut === 'retard' ? 'en retard' : v.statut}`,
        detail: `${Utils.formatCurrency(v.montantVerse)}${v.moyenPaiement ? ' \u2014 ' + v.moyenPaiement : ''}`,
        extra: v.justification ? `<div style="font-size:10px;color:var(--volt-blue);margin-top:2px;"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon> ${v.justification}</div>` : ''
      });
    });

    absences.forEach(a => {
      const typeLabels = { repos: 'Repos', conge: 'Cong\u00e9', maladie: 'Maladie', formation: 'Formation', personnel: 'Personnel', suspension: 'Suspension' };
      timeline.push({
        date: a.dateDebut,
        type: 'absence',
        icon: 'solar:calendar-mark-bold-duotone',
        color: a.type === 'suspension' ? '#ef4444' : a.type === 'maladie' ? '#f59e0b' : '#8b5cf6',
        label: `${typeLabels[a.type] || a.type}`,
        detail: `${Utils.formatDate(a.dateDebut)} au ${Utils.formatDate(a.dateFin)}`,
        extra: a.motif ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${a.motif}</div>` : ''
      });
    });

    planning.slice(-50).forEach(p => {
      timeline.push({
        date: p.date,
        type: 'planning',
        icon: 'solar:clock-circle-bold-duotone',
        color: '#3b82f6',
        label: `Shift ${p.typeCreneaux || ''}`,
        detail: p.heureDebut && p.heureFin ? `${p.heureDebut} \u00e0 ${p.heureFin}` : p.typeCreneaux || '',
        extra: ''
      });
    });

    // Trier par date d\u00e9croissante
    timeline.sort((a, b) => b.date.localeCompare(a.date));

    const rows = timeline.slice(0, 80).map(item => `
      <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color);">
        <div style="flex-shrink:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${item.color}15;">
          <iconify-icon icon="${item.icon}" style="color:${item.color};font-size:14px;"></iconify-icon>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-size:var(--font-size-sm);font-weight:600;">${item.label}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);flex-shrink:0;">${Utils.formatDate(item.date)}</div>
          </div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${item.detail}</div>
          ${item.extra}
        </div>
      </div>
    `).join('');

    const stats = `
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        <span class="badge badge-info"><iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon> ${versements.length} versements</span>
        <span class="badge badge-warning"><iconify-icon icon="solar:calendar-mark-bold-duotone"></iconify-icon> ${absences.length} absences</span>
        <span class="badge badge-success"><iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> ${planning.length} shifts</span>
        <span class="badge badge-neutral"><iconify-icon icon="solar:bus-bold-duotone"></iconify-icon> ${courses.length} courses</span>
      </div>
    `;

    Modal.open({
      title: `<iconify-icon icon="solar:history-bold-duotone" style="color:#3b82f6;"></iconify-icon> Historique \u2014 ${name}`,
      body: stats + `<div style="max-height:55vh;overflow-y:auto;">${rows || '<div style="text-align:center;color:var(--text-muted);padding:20px;">Aucun historique</div>'}</div>`,
      footer: '<button class="btn btn-secondary" data-action="cancel">Fermer</button>',
      size: 'large'
    });
  },

  /**
   * Render temps en ligne & temps occupé card content for a given date
   */
  _renderTempsEnLigneCard(chauffeurId, selectedDate, yangoDriverId) {
    const container = document.getElementById('temps-en-ligne-content');
    const badgeEl = document.getElementById('temps-statut-badge');
    if (!container) return;

    const todayDate = new Date().toISOString().split('T')[0];
    const isToday = selectedDate === todayDate;
    const pointagesAll = Store.get('pointages') || [];
    const gpsAll = Store.get('gps') || [];
    const stg = Store.get('settings') || {};
    const objMin = stg.objectifs?.tempsEnLigneMin || 630;
    const objH = Math.floor(objMin / 60);
    const objLabel = objMin % 60 > 0 ? objH + 'h' + String(objMin % 60).padStart(2, '0') : objH + 'h';

    // Helper: comparer date GPS (ISO complet ou YYYY-MM-DD) avec date YYYY-MM-DD
    const matchDate = (gDate, target) => gDate === target || gDate.startsWith(target);

    // Tous les pointages et GPS de ce chauffeur
    const driverPointages = pointagesAll.filter(p => p.chauffeurId === chauffeurId).sort((a, b) => b.date.localeCompare(a.date));
    const driverGps = gpsAll.filter(g => g.chauffeurId === chauffeurId);

    // Pointage du jour sélectionné
    const ptg = driverPointages.find(p => p.date === selectedDate);

    // GPS du jour sélectionné (dates GPS en ISO complet)
    const gpsDay = driverGps.find(g => matchDate(g.date, selectedDate));
    const occupeMin = gpsDay?.evenements?.tempsActiviteYango || 0;

    // Temps en ligne : pointage si dispo, sinon activité Yango
    let enLigneMin = 0;
    let enLigneStatut = 'non_commence';
    let enLigneSource = 'none';
    if (ptg) {
      enLigneStatut = ptg.statut;
      enLigneSource = 'pointage';
      if (ptg.statut === 'termine') {
        enLigneMin = ptg.dureeTotaleMinutes || 0;
      } else if (ptg.heureDebut) {
        const debut = new Date(ptg.heureDebut);
        const now = new Date();
        let pMs = 0, pStart = null;
        for (const ev of (ptg.evenements || [])) {
          if (ev.type === 'pause') pStart = new Date(ev.heure);
          else if (ev.type === 'reprise' && pStart) { pMs += new Date(ev.heure) - pStart; pStart = null; }
        }
        if (ptg.statut === 'pause' && pStart) pMs += now - pStart;
        enLigneMin = Math.round((now - debut - pMs) / 60000);
      }
    } else if (occupeMin > 0) {
      // Pas de pointage mais activité Yango → utiliser comme temps en ligne minimum
      enLigneMin = occupeMin;
      enLigneStatut = 'termine';
      enLigneSource = 'yango';
    }

    const elH = Math.floor(enLigneMin / 60);
    const elM = enLigneMin % 60;
    const elLabel = elH + 'h' + String(elM).padStart(2, '0');
    const elPct = Math.min(100, Math.round((enLigneMin / objMin) * 100));
    const elColor = enLigneMin >= objMin ? '#22c55e' : (elPct >= 50 ? '#f59e0b' : '#ef4444');

    const ocH = Math.floor(occupeMin / 60);
    const ocM = occupeMin % 60;
    const ocLabel = ocH + 'h' + String(ocM).padStart(2, '0');

    // Taux d'occupation
    let tauxHTML;
    if (enLigneMin > 0 && occupeMin > 0) {
      const taux = Math.round(occupeMin / enLigneMin * 100);
      tauxHTML = '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:12px">Taux d\'occupation : <strong style="color:' + (taux >= 70 ? '#22c55e' : '#f59e0b') + '">' + taux + '%</strong></div>';
    } else if (occupeMin > 0) {
      tauxHTML = '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:12px">Données Yango disponibles</div>';
    } else {
      tauxHTML = '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:12px">' + (isToday ? 'Pas encore en service' : 'Pas de données') + '</div>';
    }

    // Statut badge + bouton Aujourd'hui
    const statutLabels = { en_service: 'En service', pause: 'En pause', termine: 'Terminé', non_commence: 'Non commencé' };
    const statutColors = { en_service: '#22c55e', pause: '#f59e0b', termine: '#94a3b8', non_commence: '#94a3b8' };
    if (badgeEl) {
      let badgeHTML = '';
      if (!isToday) {
        badgeHTML += '<button class="btn btn-sm btn-secondary" onclick="document.getElementById(\'temps-date-filter\').value=\'' + todayDate + '\';ChauffeursPage._renderTempsEnLigneCard(\'' + chauffeurId + '\',\'' + todayDate + '\',\'' + (yangoDriverId || '') + '\')" style="font-size:0.6rem;padding:2px 8px;margin-right:4px">Aujourd\'hui</button>';
      }
      if (isToday && ptg) {
        badgeHTML += '<span class="badge" style="background:' + statutColors[enLigneStatut] + '20;color:' + statutColors[enLigneStatut] + '">' + statutLabels[enLigneStatut] + '</span>';
      } else if (enLigneSource === 'yango') {
        badgeHTML += '<span class="badge" style="background:#FC4C0220;color:#FC4C02">Yango</span>';
      } else if (ptg) {
        badgeHTML += '<span class="badge" style="background:#94a3b820;color:#94a3b8">Terminé</span>';
      } else {
        badgeHTML += '<span class="badge" style="background:#94a3b820;color:#94a3b8">' + (isToday ? 'Non commencé' : 'Pas de données') + '</span>';
      }
      badgeEl.innerHTML = badgeHTML;
    }

    // Message d'aide quand pas de données du tout
    const hasAnyData = ptg || gpsDay;
    // Dernier enregistrement connu (pointage ou GPS)
    const lastKnownPtg = driverPointages[0];
    const lastKnownGps = driverGps.sort((a, b) => b.date.localeCompare(a.date))[0];
    const lastKnownDate = [lastKnownPtg?.date, lastKnownGps?.date?.split('T')[0]].filter(Boolean).sort().pop();

    let noDataHint = '';
    if (!hasAnyData) {
      let hintMsg = '<div data-no-data-hint style="text-align:center;padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-md);margin-bottom:16px">' +
        '<iconify-icon icon="solar:calendar-search-bold-duotone" style="font-size:1.5rem;color:var(--text-muted);margin-bottom:4px"></iconify-icon>' +
        '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px">Aucune donnée pour le <strong>' + new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</strong></div>';
      if (lastKnownDate) {
        const lastDateLabel = new Date(lastKnownDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        hintMsg += '<button class="btn btn-sm btn-primary" onclick="document.getElementById(\'temps-date-filter\').value=\'' + lastKnownDate + '\';ChauffeursPage._renderTempsEnLigneCard(\'' + chauffeurId + '\',\'' + lastKnownDate + '\',\'' + (yangoDriverId || '') + '\')" style="font-size:0.65rem;padding:3px 12px">' +
          '<iconify-icon icon="solar:arrow-left-bold"></iconify-icon> Dernières données : ' + lastDateLabel + '</button>';
      } else {
        hintMsg += '<div style="font-size:0.65rem;color:var(--text-muted)">Aucune donnée enregistrée pour ce chauffeur</div>';
      }
      hintMsg += '</div>';
      noDataHint = hintMsg;
    } else if (enLigneSource === 'yango') {
      noDataHint = '<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:#FC4C0210;border:1px solid #FC4C0230;border-radius:var(--radius-sm);margin-bottom:12px;font-size:0.65rem;color:#FC4C02">' +
        '<iconify-icon icon="solar:info-circle-bold-duotone"></iconify-icon> Données basées sur l\'activité Yango (pas de pointage ce jour)' +
      '</div>';
    }

    // Historique 7 jours (centrés sur la date sélectionnée)
    const last7 = [];
    const refDate = new Date(selectedDate + 'T12:00:00');
    for (let i = 6; i >= 0; i--) {
      const d = new Date(refDate); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
      const ptgDay = driverPointages.find(p => p.date === ds);
      const gDay = driverGps.find(g => matchDate(g.date, ds));
      const dayYango = gDay?.evenements?.tempsActiviteYango || 0;
      // Temps en ligne : pointage si dispo, sinon Yango
      const dayEnLigne = ptgDay ? (ptgDay.dureeTotaleMinutes || 0) : dayYango;
      last7.push({
        jour: dayLabel,
        date: ds,
        enLigne: dayEnLigne,
        occupe: dayYango,
        isSelected: ds === selectedDate
      });
    }
    const maxVal = Math.max(objMin, ...last7.map(d => d.enLigne));

    const barsHTML = last7.map(d => {
      const pctEL = maxVal > 0 ? Math.round((d.enLigne / maxVal) * 100) : 0;
      return '<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;gap:2px;cursor:pointer" onclick="document.getElementById(\'temps-date-filter\').value=\'' + d.date + '\';ChauffeursPage._renderTempsEnLigneCard(\'' + chauffeurId + '\',\'' + d.date + '\',\'' + (yangoDriverId || '') + '\')">' +
        '<div style="display:flex;align-items:flex-end;height:50px;width:100%">' +
          '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%"><div style="width:100%;height:' + pctEL + '%;background:' + (d.enLigne >= objMin ? '#22c55e' : '#3b82f6') + ';border-radius:2px;min-height:' + (d.enLigne > 0 ? '3px' : '0') + '"></div></div>' +
        '</div>' +
        '<div style="font-size:0.58rem;color:' + (d.isSelected ? 'var(--primary)' : 'var(--text-muted)') + ';font-weight:' + (d.isSelected ? '700' : '400') + '">' + d.jour + '</div>' +
      '</div>';
    }).join('');

    // Totaux de la semaine pour les stats
    const weekEnLigne = last7.reduce((s, d) => s + d.enLigne, 0);
    const weekOccupe = last7.reduce((s, d) => s + d.occupe, 0);
    const avgEnLigne = Math.round(weekEnLigne / 7);
    const avgOccupe = Math.round(weekOccupe / 7);
    const avgELH = Math.floor(avgEnLigne / 60);
    const avgELM = avgEnLigne % 60;
    const avgOCH = Math.floor(avgOccupe / 60);
    const avgOCM = avgOccupe % 60;

    container.innerHTML = noDataHint +
      '<div data-kpi-box style="margin-bottom:16px">' +
        '<div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:14px">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
            '<iconify-icon icon="solar:clock-circle-bold-duotone" style="font-size:1rem;color:#3b82f6"></iconify-icon>' +
            '<span style="font-size:0.72rem;font-weight:700;color:var(--text-secondary)">Temps en ligne' + (enLigneSource === 'yango' ? ' <span style="font-size:0.55rem;color:#FC4C02;font-weight:600">(Yango)</span>' : '') + '</span>' +
          '</div>' +
          '<div style="font-size:1.5rem;font-weight:900;color:' + elColor + '">' + elLabel + '</div>' +
          '<div style="height:5px;background:var(--border-color);border-radius:3px;margin-top:6px;overflow:hidden">' +
            '<div style="height:100%;width:' + elPct + '%;background:' + elColor + ';border-radius:3px"></div>' +
          '</div>' +
          '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px">' + elPct + '% de l\'objectif (' + objLabel + ')</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:8px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
          '<span style="font-size:0.72rem;font-weight:700;color:var(--text-secondary)">7 derniers jours</span>' +
        '</div>' +
        '<div style="display:flex;gap:4px;align-items:flex-end">' + barsHTML + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:16px;padding:8px 0;border-top:1px solid var(--border-color);margin-top:8px">' +
        '<div style="flex:1;text-align:center">' +
          '<div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:2px">Moy. en ligne / jour</div>' +
          '<div style="font-size:0.85rem;font-weight:700;color:#3b82f6">' + avgELH + 'h' + String(avgELM).padStart(2, '0') + '</div>' +
        '</div>' +
      '</div>';

    // Si chauffeur lié à Yango → toujours appeler l'API live pour avoir le temps de travail
    if (yangoDriverId) {
      this._fetchYangoTempsEnLigne(chauffeurId, yangoDriverId, selectedDate);
    }
  },

  /**
   * Fetch live Yango activity data via API and update the card
   */
  async _fetchYangoTempsEnLigne(chauffeurId, yangoDriverId, selectedDate) {
    const container = document.getElementById('temps-en-ligne-content');
    const badgeEl = document.getElementById('temps-statut-badge');
    if (!container) return;

    // Show loading indicator
    const hintEl = container.querySelector('[data-no-data-hint]');
    if (hintEl) {
      hintEl.innerHTML = '<div style="text-align:center;padding:12px">' +
        '<iconify-icon icon="solar:refresh-bold" class="spin-icon" style="font-size:1.2rem;color:#FC4C02"></iconify-icon>' +
        '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px">Chargement des données Yango...</div>' +
      '</div>';
    }

    const todayDate = new Date().toISOString().split('T')[0];
    const isToday = selectedDate === todayDate;
    let stats;
    try {
      stats = await Store.getYangoDriverStats(yangoDriverId, isToday ? null : selectedDate);
    } catch (e) {
      stats = null;
    }

    // Check we're still on the same date/chauffeur
    const currentDateInput = document.getElementById('temps-date-filter');
    if (!currentDateInput || currentDateInput.value !== selectedDate) return;
    if (!document.getElementById('temps-en-ligne-content')) return;

    const hasYangoData = stats && !stats.error && ((stats.tempsActiviteMinutes || 0) > 0 || (stats.nbCourses || 0) > 0);

    if (hasYangoData) {
      const stg = Store.get('settings') || {};
      const objMin = stg.objectifs?.tempsEnLigneMin || 630;
      const objH = Math.floor(objMin / 60);
      const objLabel = objMin % 60 > 0 ? objH + 'h' + String(objMin % 60).padStart(2, '0') : objH + 'h';
      const actMin = stats.tempsActiviteMinutes || 0;
      const nbCourses = stats.nbCourses || 0;
      const totalCA = stats.totalCA || 0;
      const h = Math.floor(actMin / 60);
      const m = actMin % 60;
      const label = actMin > 0 ? h + 'h' + String(m).padStart(2, '0') : '--';
      const pct = actMin > 0 ? Math.min(100, Math.round((actMin / objMin) * 100)) : 0;
      const color = actMin >= objMin ? '#22c55e' : (pct >= 50 ? '#f59e0b' : '#ef4444');

      // Update badge
      if (badgeEl) {
        let badgeHTML = '';
        if (!isToday) {
          badgeHTML += '<button class="btn btn-sm btn-secondary" onclick="document.getElementById(\'temps-date-filter\').value=\'' + todayDate + '\';ChauffeursPage._renderTempsEnLigneCard(\'' + chauffeurId + '\',\'' + todayDate + '\',\'' + yangoDriverId + '\')" style="font-size:0.6rem;padding:2px 8px;margin-right:4px">Aujourd\'hui</button>';
        }
        badgeHTML += '<span class="badge" style="background:#FC4C0220;color:#FC4C02">Yango · ' + nbCourses + ' course' + (nbCourses > 1 ? 's' : '') + '</span>';
        badgeEl.innerHTML = badgeHTML;
      }

      // Info bar Yango
      const infoBar = '<div data-yango-info style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:#FC4C0210;border:1px solid #FC4C0230;border-radius:var(--radius-sm);margin-bottom:12px;font-size:0.65rem;color:#FC4C02">' +
        '<iconify-icon icon="solar:info-circle-bold-duotone"></iconify-icon> Données en direct depuis Yango — ' + nbCourses + ' course' + (nbCourses > 1 ? 's' : '') + ' · ' + Utils.formatCurrency(totalCA) +
      '</div>';

      // Remove existing no-data hint or previous info bar
      const noDataHintEl = container.querySelector('[data-no-data-hint]');
      if (noDataHintEl) noDataHintEl.outerHTML = infoBar;
      else {
        // Insert info bar at top of container (before KPI box)
        const existingInfo = container.querySelector('[data-yango-info]');
        if (existingInfo) existingInfo.outerHTML = infoBar;
        else container.insertAdjacentHTML('afterbegin', infoBar);
      }

      // Update KPI box
      const kpiContainer = container.querySelector('[data-kpi-box]');
      if (kpiContainer) {
        if (actMin > 0) {
          kpiContainer.innerHTML =
            '<div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:14px">' +
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
                '<iconify-icon icon="solar:clock-circle-bold-duotone" style="font-size:1rem;color:#3b82f6"></iconify-icon>' +
                '<span style="font-size:0.72rem;font-weight:700;color:var(--text-secondary)">Temps en ligne <span style="font-size:0.55rem;color:#FC4C02;font-weight:600">(Yango)</span></span>' +
              '</div>' +
              '<div style="font-size:1.5rem;font-weight:900;color:' + color + '">' + label + '</div>' +
              '<div style="height:5px;background:var(--border-color);border-radius:3px;margin-top:6px;overflow:hidden">' +
                '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px"></div>' +
              '</div>' +
              '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px">' + pct + '% de l\'objectif (' + objLabel + ')</div>' +
            '</div>';
        } else {
          kpiContainer.innerHTML =
            '<div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:14px">' +
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
                '<iconify-icon icon="solar:map-arrow-right-bold-duotone" style="font-size:1rem;color:#3b82f6"></iconify-icon>' +
                '<span style="font-size:0.72rem;font-weight:700;color:var(--text-secondary)">Courses <span style="font-size:0.55rem;color:#FC4C02;font-weight:600">(Yango)</span></span>' +
              '</div>' +
              '<div style="font-size:1.5rem;font-weight:900;color:#3b82f6">' + nbCourses + '</div>' +
              '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:8px">Courses effectuées · CA : ' + Utils.formatCurrency(totalCA) + '</div>' +
            '</div>';
        }
      }

      // Update header KPIs (CA total + Courses) with Yango data
      const headerCA = document.querySelector('[data-header-ca]');
      const headerCourses = document.querySelector('[data-header-courses]');
      if (headerCA) {
        const localCA = parseFloat(headerCA.getAttribute('data-local-ca')) || 0;
        headerCA.textContent = Utils.formatCurrency(localCA + totalCA);
      }
      if (headerCourses) {
        const localCourses = parseInt(headerCourses.getAttribute('data-local-courses')) || 0;
        headerCourses.textContent = localCourses + nbCourses;
      }
    } else {
      // No Yango data — update hint if present, otherwise don't touch existing display
      const hintArea = container.querySelector('[data-no-data-hint]');
      if (hintArea) {
        const isError = !stats || stats.error;
        hintArea.innerHTML =
          '<iconify-icon icon="solar:calendar-search-bold-duotone" style="font-size:1.5rem;color:var(--text-muted);margin-bottom:4px"></iconify-icon>' +
          '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">' +
            (isError ? 'Impossible de récupérer les données Yango' : 'Aucune activité Yango pour cette date') +
          '</div>' +
          '<div style="font-size:0.6rem;color:var(--text-muted)">' +
            (isError ? (stats && stats.details ? stats.details : 'Vérifiez la connexion ou réessayez plus tard') : 'Le chauffeur n\'a pas eu d\'activité sur Yango') +
          '</div>';
      }
    }
  }
};
