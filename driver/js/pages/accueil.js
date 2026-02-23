/**
 * AccueilPage — Tableau de bord chauffeur
 */
const AccueilPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    const data = await DriverStore.getDashboard();
    if (!data) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger le tableau de bord</p></div>';
      return;
    }

    const chauffeur = data.chauffeur || {};
    const prenom = chauffeur.prenom || 'Chauffeur';
    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    // Creneau du jour
    const creneauLabels = {
      matin: 'Matin (6h-14h)',
      apres_midi: 'Apres-midi (14h-22h)',
      journee: 'Journee (8h-20h)',
      nuit: 'Nuit (22h-6h)'
    };
    const creneau = data.creneauJour;
    const creneauText = creneau ? creneauLabels[creneau.type] || creneau.type : null;

    // Vehicule
    const v = data.vehicule;

    // Stats
    const stats = data.statsMois || {};

    // Score
    const score = data.scoreConduite || 0;
    const scoreClass = score >= 70 ? 'good' : score >= 50 ? 'medium' : 'bad';

    // Countdown deadline
    let countdownHTML = '';
    if (data.deadline && data.deadline.configured) {
      DriverCountdown.init(data.deadline);
      countdownHTML = DriverCountdown.renderWidget();
    }

    container.innerHTML = `
      <!-- Greeting -->
      <div class="greeting">
        <h2>Bonjour, ${prenom} !</h2>
        <p><i class="fas fa-calendar-day"></i> ${dateStr}</p>
      </div>

      <!-- Countdown deadline versement -->
      ${countdownHTML}

      <!-- Planning du jour -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-clock"></i> Aujourd'hui</span>
          ${creneau ? `<span class="badge ${creneau.type}">${creneauText}</span>` : '<span class="badge neutral">Pas de creneau</span>'}
        </div>
        ${creneau && creneau.notes ? `<p style="font-size:0.82rem;color:var(--text-secondary);font-style:italic">${creneau.notes}</p>` : ''}
      </div>

      <!-- KPIs -->
      <div class="kpi-row">
        <div class="kpi-card kpi-clickable" onclick="AccueilPage._showScoreDetail()">
          <div class="kpi-label">Score conduite <i class="fas fa-chevron-right" style="font-size:0.6rem;opacity:0.5;margin-left:4px"></i></div>
          <div class="kpi-value" style="color: ${score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'}">${score}/100</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Versements du mois</div>
          <div class="kpi-value small">${this._formatCurrency(stats.totalNet || 0)}</div>
        </div>
      </div>

      <!-- Activite Yango -->
      <div class="card" id="yango-activity-card" style="display:none;">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-taxi" style="color:#FC4C02"></i> Mon activite Yango</span>
          <span class="badge" id="yango-activity-badge" style="background:#FC4C02;color:#fff;">--</span>
        </div>
        <div id="yango-activity-content">
          <div class="loading" style="padding:0.5rem"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
      </div>

      <!-- Vehicule -->
      ${v ? `
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-car"></i> Mon vehicule</span>
          <span class="card-icon cyan"><i class="fas fa-car"></i></span>
        </div>
        <div style="font-size:0.95rem;font-weight:600">${v.marque} ${v.modele}</div>
        <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px">
          ${v.immatriculation} ${v.kilometrage ? '• ' + v.kilometrage.toLocaleString('fr-FR') + ' km' : ''}
        </div>
      </div>
      ` : ''}

      <!-- Alertes maintenance vehicule -->
      <div id="maintenance-alerts"></div>

      <!-- Alertes actives -->
      ${data.alertesActives > 0 ? `
      <div class="card" style="border-left: 3px solid #ef4444">
        <div style="display:flex;align-items:center;gap:8px;color:#dc2626;font-weight:600;font-size:0.85rem">
          <i class="fas fa-bell"></i> ${data.alertesActives} signalement${data.alertesActives > 1 ? 's' : ''} en cours
        </div>
      </div>
      ` : ''}

      <!-- Actions rapides -->
      <div class="section-title">Actions rapides</div>
      <div class="action-grid">
        <button class="action-btn green" onclick="DriverRouter.navigate('versements')">
          <i class="fas fa-money-bill-wave"></i>
          Faire un versement
        </button>
        <button class="action-btn red" onclick="DriverRouter.navigate('signalements')">
          <i class="fas fa-exclamation-triangle"></i>
          Signaler un probleme
        </button>
        <button class="action-btn blue" onclick="AccueilPage._demanderAbsence()">
          <i class="fas fa-calendar-minus"></i>
          Demander une absence
        </button>
        <button class="action-btn cyan" onclick="DriverRouter.navigate('planning')">
          <i class="fas fa-calendar-alt"></i>
          Voir mon planning
        </button>
        <button class="action-btn" style="background:rgba(139,92,246,0.1);color:#8b5cf6;" onclick="DriverRouter.navigate('maintenance')">
          <i class="fas fa-wrench"></i>
          Entretien vehicule
        </button>
      </div>
    `;

    // Demarrer le timer du countdown apres le render
    if (data.deadline && data.deadline.configured) {
      DriverCountdown.startTimer();
    }

    // Charger l'activite Yango en arriere plan
    this._loadYangoActivity();

    // Charger les alertes maintenance vehicule
    this._loadMaintenanceAlerts();
  },

  _formatCurrency(amount) {
    return amount.toLocaleString('fr-FR') + ' FCFA';
  },

  async _showScoreDetail() {
    // Afficher un loading dans le modal pendant le fetch
    DriverModal.show('Score de conduite', '<div class="loading" style="padding:2rem"><i class="fas fa-spinner fa-spin"></i></div>', []);

    const gpsData = await DriverStore.getGps();
    const lastGps = gpsData && gpsData.length > 0 ? gpsData[0] : null;

    if (!lastGps) {
      DriverModal.show('Score de conduite', `
        <div style="text-align:center;padding:1.5rem 0">
          <i class="fas fa-satellite-dish" style="font-size:2.5rem;color:var(--text-muted);margin-bottom:12px;display:block"></i>
          <p style="font-size:0.9rem;color:var(--text-secondary);margin:0">Pas encore de donnees GPS enregistrees.</p>
          <p style="font-size:0.78rem;color:var(--text-muted);margin-top:8px">Ton score sera calcule automatiquement en fonction de ta conduite.</p>
        </div>
      `, [
        { label: 'Compris', class: 'btn btn-primary', onclick: 'DriverModal.close()' }
      ]);
      return;
    }

    const scoreGlobal = lastGps.scoreGlobal || 0;
    const scoreColor = scoreGlobal >= 70 ? '#22c55e' : scoreGlobal >= 50 ? '#f59e0b' : '#ef4444';
    const scoreLabel = scoreGlobal >= 70 ? 'Bon conducteur' : scoreGlobal >= 50 ? 'Peut mieux faire' : 'A ameliorer';

    // Sous-scores avec icones et descriptions
    const criteres = [
      { key: 'scoreVitesse', label: 'Vitesse', icon: 'fa-tachometer-alt', desc: 'Respect des limitations de vitesse' },
      { key: 'scoreFreinage', label: 'Freinage', icon: 'fa-brake-warning', desc: 'Douceur et anticipation au freinage', iconFallback: 'fa-hand-paper' },
      { key: 'scoreAcceleration', label: 'Acceleration', icon: 'fa-gauge-high', desc: 'Progressivite des accelerations' },
      { key: 'scoreVirage', label: 'Virages', icon: 'fa-road', desc: 'Fluidite dans les tournants' },
      { key: 'scoreRegularite', label: 'Regularite', icon: 'fa-clock', desc: 'Constance dans le style de conduite' },
      { key: 'scoreActivite', label: 'Activite Yango', icon: 'fa-mobile-screen', desc: 'Temps d\'activite sur Yango (objectif : 10h/jour)' }
    ];

    const scoresHTML = criteres.map(c => {
      const val = lastGps[c.key] || 0;
      const color = val >= 70 ? '#22c55e' : val >= 50 ? '#f59e0b' : '#ef4444';
      const barColor = val >= 70 ? 'good' : val >= 50 ? 'medium' : 'bad';
      return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="display:flex;align-items:center;gap:8px">
              <i class="fas ${c.icon}" style="color:${color};font-size:0.8rem;width:16px;text-align:center"></i>
              <span style="font-size:0.82rem;font-weight:600">${c.label}</span>
            </div>
            <span style="font-size:0.82rem;font-weight:700;color:${color}">${val}/100</span>
          </div>
          <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${val}%;background:${color};border-radius:3px;transition:width 0.6s ease"></div>
          </div>
          <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px">${c.desc}</div>
        </div>
      `;
    }).join('');

    // Evenements
    const evt = lastGps.evenements || {};
    let eventsHTML = '';
    const eventItems = [
      { key: 'excesVitesse', label: 'Exces de vitesse', icon: 'fa-tachometer-alt', color: '#ef4444' },
      { key: 'freinagesBrusques', label: 'Freinages brusques', icon: 'fa-hand-paper', color: '#f59e0b' },
      { key: 'accelerationsBrusques', label: 'Accelerations brusques', icon: 'fa-gauge-high', color: '#f59e0b' },
      { key: 'viragesAgressifs', label: 'Virages agressifs', icon: 'fa-road', color: '#f59e0b' }
    ];
    const activeEvents = eventItems.filter(e => (evt[e.key] || 0) > 0);
    if (activeEvents.length > 0) {
      eventsHTML = `
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-color)">
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.03em">Derniers evenements</div>
          ${activeEvents.map(e => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
              <div style="display:flex;align-items:center;gap:8px">
                <i class="fas ${e.icon}" style="color:${e.color};font-size:0.75rem;width:14px;text-align:center"></i>
                <span style="font-size:0.8rem">${e.label}</span>
              </div>
              <span style="font-size:0.82rem;font-weight:700;color:${e.color}">${evt[e.key]}x</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Stats conduite
    const tempsActiviteYango = evt.tempsActiviteYango || 0;
    let statsHTML = '';
    if (evt.distanceParcourue || evt.vitesseMoyenne || evt.tempsConduite || tempsActiviteYango) {
      statsHTML = `
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          ${evt.distanceParcourue ? `<div style="flex:1;min-width:80px;text-align:center;background:var(--bg-tertiary);border-radius:8px;padding:8px 6px">
            <div style="font-size:0.68rem;color:var(--text-muted)">Distance</div>
            <div style="font-size:0.85rem;font-weight:700">${evt.distanceParcourue.toLocaleString('fr-FR')} km</div>
          </div>` : ''}
          ${evt.vitesseMoyenne ? `<div style="flex:1;min-width:80px;text-align:center;background:var(--bg-tertiary);border-radius:8px;padding:8px 6px">
            <div style="font-size:0.68rem;color:var(--text-muted)">Vitesse moy.</div>
            <div style="font-size:0.85rem;font-weight:700">${evt.vitesseMoyenne} km/h</div>
          </div>` : ''}
          ${evt.tempsConduite ? `<div style="flex:1;min-width:80px;text-align:center;background:var(--bg-tertiary);border-radius:8px;padding:8px 6px">
            <div style="font-size:0.68rem;color:var(--text-muted)">Temps conduite</div>
            <div style="font-size:0.85rem;font-weight:700">${Math.floor(evt.tempsConduite / 60)}h${String(evt.tempsConduite % 60).padStart(2, '0')}</div>
          </div>` : ''}
          ${tempsActiviteYango ? `<div style="flex:1;min-width:80px;text-align:center;background:${tempsActiviteYango >= 600 ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)'};border-radius:8px;padding:8px 6px">
            <div style="font-size:0.68rem;color:var(--text-muted)"><i class="fas fa-mobile-screen" style="margin-right:2px"></i> Yango</div>
            <div style="font-size:0.85rem;font-weight:700;color:${tempsActiviteYango >= 600 ? '#22c55e' : '#f59e0b'}">${Math.floor(tempsActiviteYango / 60)}h${String(tempsActiviteYango % 60).padStart(2, '0')}</div>
          </div>` : ''}
        </div>
      `;
    }

    // Recommandations IA
    let recoHTML = '';
    const analyse = lastGps.analyseIA;
    if (analyse && analyse.recommandations && analyse.recommandations.length > 0) {
      recoHTML = `
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-color)">
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.03em">
            <i class="fas fa-lightbulb" style="color:#f59e0b;margin-right:4px"></i> Conseils
          </div>
          ${analyse.recommandations.map(r => `
            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
              <i class="fas fa-angle-right" style="color:var(--primary);margin-top:2px;font-size:0.7rem"></i>
              <span style="font-size:0.8rem;color:var(--text-secondary)">${r}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Bonus eligibility
    let bonusHTML = '';
    const dashData = await DriverStore.getDashboard();
    const bonusInfo = dashData && dashData.bonus;
    if (bonusInfo && bonusInfo.bonusActif) {
      const bonusAmount = bonusInfo.bonusType === 'montant_fixe'
        ? bonusInfo.bonusValeur.toLocaleString('fr-FR') + ' FCFA'
        : bonusInfo.bonusValeur + '% du net';
      const periodeLabel = bonusInfo.bonusPeriode === 'mensuel' ? 'mois' : 'semaine';
      const activiteMinH = Math.floor(bonusInfo.tempsActiviteMin / 60);
      const activiteActuelH = Math.floor(bonusInfo.tempsActiviteActuel / 60);
      const activiteActuelM = bonusInfo.tempsActiviteActuel % 60;

      bonusHTML = `
        <div style="margin-top:16px;padding:14px;border-radius:10px;background:${bonusInfo.eligible ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.08)'};border:1px solid ${bonusInfo.eligible ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.2)'}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <i class="fas fa-trophy" style="color:${bonusInfo.eligible ? '#22c55e' : '#6366f1'};font-size:1rem"></i>
            <span style="font-size:0.82rem;font-weight:700;color:${bonusInfo.eligible ? '#22c55e' : 'var(--text-primary)'}">
              ${bonusInfo.eligible ? 'Tu es eligible au bonus !' : 'Bonus de performance'}
            </span>
          </div>
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:10px">
            ${bonusInfo.eligible
              ? 'Felicitations ! Tu recevras un bonus de <strong>' + bonusAmount + '</strong> ce ' + periodeLabel + '.'
              : 'Atteins les objectifs pour recevoir <strong>' + bonusAmount + '</strong> / ' + periodeLabel + ' :'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:center;gap:8px;font-size:0.78rem">
              <i class="fas ${bonusInfo.scoreOk ? 'fa-check-circle' : 'fa-circle'}" style="color:${bonusInfo.scoreOk ? '#22c55e' : 'var(--text-muted)'};font-size:0.75rem"></i>
              <span>Score de conduite ≥ ${bonusInfo.scoreMinimum}/100</span>
              <span style="margin-left:auto;font-weight:600;color:${bonusInfo.scoreOk ? '#22c55e' : '#f59e0b'}">${bonusInfo.scoreActuel}/100</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:0.78rem">
              <i class="fas ${bonusInfo.activiteOk ? 'fa-check-circle' : 'fa-circle'}" style="color:${bonusInfo.activiteOk ? '#22c55e' : 'var(--text-muted)'};font-size:0.75rem"></i>
              <span>Activite Yango ≥ ${activiteMinH}h/jour</span>
              <span style="margin-left:auto;font-weight:600;color:${bonusInfo.activiteOk ? '#22c55e' : '#f59e0b'}">${activiteActuelH}h${String(activiteActuelM).padStart(2, '0')}</span>
            </div>
          </div>
        </div>
      `;
    }

    const bodyHTML = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:2.5rem;font-weight:800;color:${scoreColor};line-height:1">${scoreGlobal}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">sur 100</div>
        <div style="font-size:0.82rem;font-weight:600;color:${scoreColor};margin-top:4px">${scoreLabel}</div>
        ${lastGps.date ? `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:4px">Derniere mise a jour : ${new Date(lastGps.date).toLocaleDateString('fr-FR')}</div>` : ''}
      </div>

      <div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.03em">Criteres de notation</div>
      ${scoresHTML}
      ${statsHTML}
      ${eventsHTML}
      ${recoHTML}
      ${bonusHTML}
    `;

    DriverModal.show('Score de conduite', bodyHTML, [
      { label: 'Voir mon profil', class: 'btn btn-outline', onclick: "DriverModal.close(); DriverRouter.navigate('profil')" },
      { label: 'Compris', class: 'btn btn-primary', onclick: 'DriverModal.close()' }
    ]);
  },

  async _loadYangoActivity() {
    const card = document.getElementById('yango-activity-card');
    if (!card) return;

    const yango = await DriverStore.getYangoActivity();
    if (!yango || !yango.linked) {
      // Pas de compte Yango lie → cacher la carte
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    const content = document.getElementById('yango-activity-content');
    const badge = document.getElementById('yango-activity-badge');
    if (!content) return;

    const jour = yango.aujourd_hui || {};
    const semaine = yango.semaine || {};
    const historique = yango.historique || [];
    const objectif = yango.objectifMinJour || 600;
    const objectifH = Math.floor(objectif / 60);

    // Activite du jour
    const activiteMin = jour.activiteMinutes || 0;
    const activiteH = Math.floor(activiteMin / 60);
    const activiteM = activiteMin % 60;
    const progressPct = Math.min(100, Math.round((activiteMin / objectif) * 100));
    const isOk = activiteMin >= objectif;

    if (badge) {
      badge.textContent = isOk ? 'Objectif atteint' : `${activiteH}h${String(activiteM).padStart(2,'0')} / ${objectifH}h`;
      badge.style.background = isOk ? '#22c55e' : '#FC4C02';
    }

    // Mini barres pour l'historique (7 jours)
    const maxActivite = Math.max(objectif, ...historique.map(h => h.activiteMinutes));
    const barsHTML = historique.map(h => {
      const pct = maxActivite > 0 ? Math.round((h.activiteMinutes / maxActivite) * 100) : 0;
      const barColor = h.activiteMinutes >= objectif ? '#22c55e' : h.activiteMinutes > 0 ? '#FC4C02' : 'var(--bg-tertiary)';
      const hh = Math.floor(h.activiteMinutes / 60);
      const mm = h.activiteMinutes % 60;
      return `
        <div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;">
          <div style="font-size:0.58rem;color:var(--text-muted);margin-bottom:2px;">${h.activiteMinutes > 0 ? hh + 'h' : ''}</div>
          <div style="width:100%;max-width:20px;height:40px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;">
            <div style="width:100%;height:${pct}%;background:${barColor};border-radius:3px;transition:height 0.5s ease;"></div>
          </div>
          <div style="font-size:0.6rem;color:var(--text-muted);margin-top:2px;font-weight:${h.date === new Date().toISOString().split('T')[0] ? '700' : '400'}">${h.jour}</div>
        </div>
      `;
    }).join('');

    // Stats semaine
    const semActiviteH = Math.floor(semaine.activiteTotaleMinutes / 60);
    const semActiviteM = semaine.activiteTotaleMinutes % 60;

    content.innerHTML = `
      <!-- Activite du jour -->
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:0.78rem;color:var(--text-secondary);">Aujourd'hui</span>
          <span style="font-size:0.85rem;font-weight:700;color:${isOk ? '#22c55e' : '#FC4C02'};">${activiteH}h${String(activiteM).padStart(2,'0')} <span style="font-weight:400;font-size:0.7rem;color:var(--text-muted);">/ ${objectifH}h</span></span>
        </div>
        <div style="height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${progressPct}%;background:${isOk ? '#22c55e' : '#FC4C02'};border-radius:4px;transition:width 0.8s ease;"></div>
        </div>
        ${isOk ? '<div style="font-size:0.68rem;color:#22c55e;margin-top:4px;"><i class="fas fa-check-circle"></i> Objectif atteint ! Bravo !</div>' : '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:4px;">Il te reste ' + Math.floor((objectif - activiteMin) / 60) + 'h' + String((objectif - activiteMin) % 60).padStart(2,'0') + ' pour atteindre l\'objectif</div>'}
      </div>

      <!-- Graphique semaine -->
      <div style="margin-bottom:12px;">
        <div style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">Cette semaine</div>
        <div style="display:flex;gap:4px;align-items:flex-end;position:relative;">
          ${barsHTML}
        </div>
        <div style="height:1px;background:var(--border-color);margin-top:2px;position:relative;">
          <div style="position:absolute;top:-42px;left:0;right:0;height:1px;border-top:1px dashed rgba(34,197,94,0.4);"></div>
        </div>
      </div>

      <!-- Stats semaine compactes -->
      <div style="display:flex;gap:8px;">
        <div style="flex:1;text-align:center;background:var(--bg-tertiary);border-radius:6px;padding:6px 4px;">
          <div style="font-size:0.6rem;color:var(--text-muted);">Total semaine</div>
          <div style="font-size:0.8rem;font-weight:700;">${semActiviteH}h${String(semActiviteM).padStart(2,'0')}</div>
        </div>
        <div style="flex:1;text-align:center;background:var(--bg-tertiary);border-radius:6px;padding:6px 4px;">
          <div style="font-size:0.6rem;color:var(--text-muted);">Jours actifs</div>
          <div style="font-size:0.8rem;font-weight:700;">${semaine.joursActifs || 0}/6</div>
        </div>
        <div style="flex:1;text-align:center;background:var(--bg-tertiary);border-radius:6px;padding:6px 4px;">
          <div style="font-size:0.6rem;color:var(--text-muted);">Distance</div>
          <div style="font-size:0.8rem;font-weight:700;">${(semaine.distanceTotaleKm || 0).toLocaleString('fr-FR')} km</div>
        </div>
      </div>
    `;
  },

  async _loadMaintenanceAlerts() {
    const container = document.getElementById('maintenance-alerts');
    if (!container) return;

    try {
      const vehicule = await DriverStore.getVehicule();
      if (!vehicule || !vehicule.maintenancesUrgentes || vehicule.maintenancesUrgentes.length === 0) {
        container.style.display = 'none';
        return;
      }

      const typeLabels = {
        vidange: 'Vidange', revision: 'Revision', pneus: 'Pneus', freins: 'Freins',
        filtres: 'Filtres', climatisation: 'Climatisation', courroie: 'Courroie',
        controle_technique: 'Controle technique', batterie: 'Batterie',
        amortisseurs: 'Amortisseurs', echappement: 'Echappement',
        carrosserie: 'Carrosserie', autre: 'Entretien'
      };

      container.innerHTML = vehicule.maintenancesUrgentes.map(m => {
        const typeLabel = typeLabels[m.type] || m.label || m.type;
        const isRetard = m.statut === 'en_retard';
        const color = isRetard ? '#ef4444' : '#f59e0b';
        const icon = isRetard ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';

        let detail = '';
        if (m.prochainKm && vehicule.kilometrage) {
          const diff = m.prochainKm - vehicule.kilometrage;
          detail = diff > 0 ? `dans ${diff.toLocaleString('fr-FR')} km` : `depasse de ${Math.abs(diff).toLocaleString('fr-FR')} km`;
        }
        if (m.prochaineDate) {
          const jours = Math.ceil((new Date(m.prochaineDate) - new Date()) / 86400000);
          if (detail) detail += ' / ';
          detail += jours > 0 ? `dans ${jours} jour(s)` : `${Math.abs(jours)} jour(s) de retard`;
        }

        return `
          <div class="card" style="border-left:3px solid ${color};padding:10px 12px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <i class="fas ${icon}" style="color:${color};font-size:0.9rem;"></i>
              <div style="flex:1;">
                <div style="font-size:0.82rem;font-weight:600;color:${color};">
                  ${isRetard ? 'Maintenance en retard' : 'Maintenance imminente'} : ${typeLabel}
                </div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">
                  ${detail ? detail + ' — ' : ''}Contactez votre gestionnaire
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      container.style.display = 'none';
    }
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
      { label: 'Envoyer', class: 'btn btn-primary', onclick: 'AccueilPage._submitAbsence()' }
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
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  destroy() {
    DriverCountdown.stopTimer();
  }
};
