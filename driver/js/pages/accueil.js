/**
 * AccueilPage — Tableau de bord chauffeur (enhanced)
 */
const AccueilPage = {
  async render(container) {
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    // Fetch dashboard + planning en parallele
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    // Planning: de aujourd'hui a +5 jours
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 5);
    const endStr = endDate.toISOString().split('T')[0];

    const [data, planningData, contraventionsData] = await Promise.all([
      DriverStore.getDashboard(),
      DriverStore.getPlanning(todayStr, endStr),
      typeof DriverStore.getContraventions === 'function' ? DriverStore.getContraventions() : Promise.resolve(null)
    ]);

    if (!data) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger le tableau de bord</p></div>';
      return;
    }

    const chauffeur = data.chauffeur || {};
    const prenom = chauffeur.prenom || 'Chauffeur';
    const dateStr = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    // Salutation selon l'heure
    const hour = today.getHours();
    let greeting = 'Bonjour';
    if (hour >= 18) greeting = 'Bonsoir';
    else if (hour < 5) greeting = 'Bonne nuit';

    // Creneau du jour
    const creneauLabels = {
      matin: 'Matin (6h-14h)',
      apres_midi: 'Apres-midi (14h-22h)',
      journee: 'Journee (8h-20h)',
      nuit: 'Nuit (22h-6h)'
    };
    const creneauIcons = {
      matin: 'solar:sunrise-bold-duotone',
      apres_midi: 'solar:sun-bold-duotone',
      journee: 'solar:sun-2-bold-duotone',
      nuit: 'solar:moon-bold-duotone',
      custom: 'solar:clock-circle-bold-duotone'
    };
    const creneauGradients = {
      matin: 'linear-gradient(135deg, #f59e0b, #d97706)',
      apres_midi: 'linear-gradient(135deg, #f97316, #ea580c)',
      journee: 'linear-gradient(135deg, #3b82f6, #2563eb)',
      nuit: 'linear-gradient(135deg, #6366f1, #4f46e5)',
      custom: 'linear-gradient(135deg, #6366f1, #4f46e5)'
    };
    const creneau = data.creneauJour;
    // Pour les creneaux personnalises, afficher les heures reelles
    let creneauText = null;
    if (creneau) {
      if (creneau.type === 'custom' && creneau.heureDebut && creneau.heureFin) {
        creneauText = `Personnalise (${creneau.heureDebut}-${creneau.heureFin})`;
      } else {
        creneauText = creneauLabels[creneau.type] || 'Personnalise';
      }
    }
    const creneauIcon = creneau ? (creneauIcons[creneau.type] || 'solar:clock-circle-bold-duotone') : null;
    const creneauGrad = creneau ? (creneauGradients[creneau.type] || creneauGradients.custom) : null;

    // Vehicule
    const v = data.vehicule;

    // Countdown deadline
    let countdownHTML = '';
    if (data.deadline && data.deadline.configured) {
      DriverCountdown.init(data.deadline);
      countdownHTML = DriverCountdown.renderWidget();
    }

    // === Build planning map ===
    const planningMap = {};
    if (planningData) planningData.forEach(p => { planningMap[p.date] = p; });
    const shortLabels = { matin: 'Matin', apres_midi: 'Apres-midi', journee: 'Journee', nuit: 'Nuit', custom: 'Personnalise' };

    // === Upcoming shifts (next 5 days, excluding today) ===
    const upcomingDays = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dStr = d.toISOString().split('T')[0];
      upcomingDays.push({ date: d, dateStr: dStr, planning: planningMap[dStr] || null });
    }

    // === Service card ===
    const serviceJour = data.serviceJour || null;
    this._objectifTempsEnLigne = data.objectifTempsEnLigne || 630;
    const serviceCardHTML = this._buildServiceCard(creneau, serviceJour, this._objectifTempsEnLigne);

    // === Today's shift card ===
    let todayShiftHTML = '';
    if (creneau) {
      todayShiftHTML = `
        <div style="border-radius:1.25rem;background:${creneauGrad};padding:1.25rem;color:white;margin-bottom:1.25rem;box-shadow:0 4px 16px rgba(0,0,0,0.12)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;opacity:0.9">
            <iconify-icon icon="${creneauIcon}" style="font-size:1.3rem"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">Creneau du jour</span>
          </div>
          <div style="font-size:1.4rem;font-weight:900;margin-bottom:6px">${creneauText}</div>
          ${v ? `<div style="display:flex;align-items:center;gap:6px;font-size:0.8rem;opacity:0.85;margin-top:4px">
            <iconify-icon icon="solar:wheel-bold-duotone" style="font-size:1rem"></iconify-icon>
            ${v.marque || ''} ${v.modele || ''} ${v.immatriculation ? '(' + v.immatriculation + ')' : ''}
          </div>` : ''}
          ${creneau.notes ? `<div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.15);font-size:0.78rem">${creneau.notes}</div>` : ''}
        </div>`;
    } else {
      todayShiftHTML = '';
    }

    // === Next shift info when no shift today ===
    let nextShiftHTML = '';
    if (!creneau) {
      const nextShift = upcomingDays.find(d => d.planning);
      if (nextShift) {
        const ns = nextShift.date;
        const nsLabel = ns.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        nextShiftHTML = `
          <div style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:1rem;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.12);margin-bottom:1.25rem">
            <div style="width:42px;height:42px;border-radius:12px;background:rgba(59,130,246,0.1);color:#3b82f6;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <iconify-icon icon="solar:calendar-date-bold-duotone" style="font-size:1.2rem"></iconify-icon>
            </div>
            <div style="flex:1">
              <div style="font-size:0.7rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Prochain creneau</div>
              <div style="font-size:0.9rem;font-weight:700;color:#0f172a">${nsLabel}</div>
              <div style="font-size:0.78rem;color:#3b82f6;font-weight:600">${nextShift.planning.typeCreneaux === 'custom' && nextShift.planning.heureDebut && nextShift.planning.heureFin ? 'Personnalise (' + nextShift.planning.heureDebut + '-' + nextShift.planning.heureFin + ')' : (shortLabels[nextShift.planning.typeCreneaux] || nextShift.planning.typeCreneaux)}</div>
            </div>
          </div>`;
      }
    }

    // Compteur contraventions impayees (pour badge sur bouton)
    let nbContraventionsImpayees = 0;
    if (contraventionsData && Array.isArray(contraventionsData)) {
      nbContraventionsImpayees = contraventionsData.filter(c => c.statut === 'impayee').length;
    }

    container.innerHTML = `
      <!-- Greeting -->
      <div style="margin-bottom:1.25rem">
        <h2 style="font-size:1.65rem;font-weight:800;color:#0f172a">${greeting}, ${prenom} !</h2>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:0.875rem;font-weight:500;color:#64748b">
          <iconify-icon icon="solar:calendar-date-bold-duotone" style="color:#3b82f6;font-size:1.1rem"></iconify-icon>
          ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
        </div>
      </div>

      <!-- Countdown deadline versement -->
      ${countdownHTML}

      <!-- Service / Pointage -->
      ${serviceCardHTML}

      <!-- Stats rapides -->
      ${this._renderQuickStats(data)}

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

      <!-- Alertes maintenance vehicule -->
      <div id="maintenance-alerts"></div>

      <!-- Actions rapides -->
      <div style="margin-bottom:1rem">
        <h3 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:1rem">Actions rapides</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
          <button onclick="DriverRouter.navigate('versements')" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:1.5rem 1rem;border-radius:1.5rem;border:none;background:rgba(34,197,94,0.9);color:white;cursor:pointer;box-shadow:0 4px 12px rgba(34,197,94,0.15);transition:transform 0.15s;font-family:inherit" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform=''">
            <iconify-icon icon="solar:wallet-money-bold-duotone" style="font-size:1.75rem"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;line-height:1.3;text-align:center">Faire un<br>versement</span>
          </button>
          <button onclick="DriverRouter.navigate('etat-lieux')" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:1.5rem 1rem;border-radius:1.5rem;border:none;background:#f59e0b;color:white;cursor:pointer;box-shadow:0 4px 12px rgba(245,158,11,0.15);transition:transform 0.15s;font-family:inherit" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform=''">
            <iconify-icon icon="solar:clipboard-check-bold-duotone" style="font-size:1.75rem"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;line-height:1.3;text-align:center">Etat des<br>lieux</span>
          </button>
          <button onclick="DriverRouter.navigate('planning')" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:1.5rem 1rem;border-radius:1.5rem;border:none;background:rgba(6,182,212,0.9);color:white;cursor:pointer;box-shadow:0 4px 12px rgba(6,182,212,0.15);transition:transform 0.15s;font-family:inherit" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform=''">
            <iconify-icon icon="solar:calendar-date-bold-duotone" style="font-size:1.75rem"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;line-height:1.3;text-align:center">Voir mon<br>planning</span>
          </button>
          <button onclick="DriverRouter.navigate('contraventions')" style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:1.5rem 1rem;border-radius:1.5rem;border:none;background:rgba(239,68,68,0.9);color:white;cursor:pointer;box-shadow:0 4px 12px rgba(239,68,68,0.15);transition:transform 0.15s;font-family:inherit" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform=''">
            ${nbContraventionsImpayees > 0 ? `<span style="position:absolute;top:8px;right:8px;min-width:22px;height:22px;border-radius:11px;background:#fff;color:#ef4444;font-size:0.7rem;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 2px 6px rgba(0,0,0,0.15)">${nbContraventionsImpayees}</span>` : ''}
            <iconify-icon icon="solar:document-text-bold-duotone" style="font-size:1.75rem"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;line-height:1.3;text-align:center">Mes<br>contraventions</span>
          </button>
          <button onclick="DriverRouter.navigate('support')" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:1.5rem 1rem;border-radius:1.5rem;border:none;background:rgba(107,114,128,0.9);color:white;cursor:pointer;box-shadow:0 4px 12px rgba(107,114,128,0.15);transition:transform 0.15s;font-family:inherit" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform=''">
            <iconify-icon icon="solar:danger-bold-duotone" style="font-size:1.75rem"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;line-height:1.3;text-align:center">Signaler un<br>problème</span>
          </button>
        </div>
      </div>

      <!-- Resume hebdomadaire (dimanche) -->
      <div id="weekly-summary-card"></div>
    `;

    // Demarrer le timer du countdown apres le render
    if (data.deadline && data.deadline.configured) {
      DriverCountdown.startTimer();
    }

    // Demarrer le timer du service si en cours
    if (serviceJour) {
      if (serviceJour.statut === 'en_service') {
        this._startServiceTimer(serviceJour.heureDebut, serviceJour.evenements);
        this._resumeBehaviorIfActive(serviceJour);
      } else if (serviceJour.statut === 'pause') {
        this._startPauseTimer(serviceJour.evenements);
      }
    }

    // Charger l'activite Yango en arriere plan
    this._loadYangoActivity();

    // Charger les alertes maintenance vehicule
    this._loadMaintenanceAlerts();

    // Charger le resume hebdomadaire (dimanche ou toujours pour info)
    this._loadWeeklySummary();

  },

  _formatCurrency(amount) {
    return amount.toLocaleString('fr-FR') + ' FCFA';
  },

  _renderQuickStats(data) {
    const stats = data.statsHebdo;
    const ranking = data.ranking;
    const streak = data.streakJours || 0;
    const evo = data.evolutionCA;
    const redevance = data.chauffeur ? (data.chauffeur.redevanceQuotidienne || 0) : 0;

    if (!stats && !ranking) return ''; // API ancienne, pas de stats enrichies

    const evoColor = evo && evo.tendancePct >= 0 ? '#22c55e' : '#ef4444';
    const evoIcon = evo && evo.tendancePct >= 0 ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold';
    const evoSign = evo && evo.tendancePct >= 0 ? '+' : '';
    const streakColor = streak >= 7 ? '#22c55e' : streak >= 3 ? '#f59e0b' : '#ef4444';

    // Objectif du jour : barre de progression redevance
    const todayVerse = data.statsMois && data.statsMois.nbVersements > 0 ? Math.round(data.statsMois.totalBrut / Math.max(data.statsMois.nbVersements, 1)) : 0;
    const objectifPct = redevance > 0 ? Math.min(Math.round((todayVerse / redevance) * 100), 100) : 0;
    const objColor = objectifPct >= 100 ? '#22c55e' : objectifPct >= 50 ? '#f59e0b' : '#ef4444';

    return `
      <!-- Stats rapides -->
      <div style="margin-bottom:1.25rem">
        <h3 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:0.75rem">Mes stats</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <!-- CA semaine -->
          <div style="padding:14px;border-radius:1rem;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <iconify-icon icon="solar:wallet-money-bold-duotone" style="color:#3b82f6;font-size:1.1rem;"></iconify-icon>
              <span style="font-size:0.68rem;color:#94a3b8;font-weight:600;">CA semaine</span>
            </div>
            <div style="font-size:1.1rem;font-weight:800;color:#0f172a;">${stats ? this._formatCurrency(stats.totalVerse) : '--'}</div>
            <div style="font-size:0.65rem;color:#94a3b8;margin-top:2px;">${stats ? stats.nbJoursTravailles : 0} jour${stats && stats.nbJoursTravailles > 1 ? 's' : ''} versé${stats && stats.nbJoursTravailles > 1 ? 's' : ''}</div>
          </div>

          <!-- Classement -->
          <div style="padding:14px;border-radius:1rem;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <iconify-icon icon="solar:cup-star-bold-duotone" style="color:#f59e0b;font-size:1.1rem;"></iconify-icon>
              <span style="font-size:0.68rem;color:#94a3b8;font-weight:600;">Classement</span>
            </div>
            <div style="font-size:1.1rem;font-weight:800;color:#0f172a;">${ranking ? ranking.position : '--'}<span style="font-size:0.7rem;color:#94a3b8;font-weight:500;">/${ranking ? ranking.total : '--'}</span></div>
            <div style="font-size:0.65rem;color:#94a3b8;margin-top:2px;">CA du mois</div>
          </div>

          <!-- Serie -->
          <div style="padding:14px;border-radius:1rem;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <iconify-icon icon="solar:fire-bold-duotone" style="color:${streakColor};font-size:1.1rem;"></iconify-icon>
              <span style="font-size:0.68rem;color:#94a3b8;font-weight:600;">Serie</span>
            </div>
            <div style="font-size:1.1rem;font-weight:800;color:${streakColor};">${streak} jour${streak > 1 ? 's' : ''}</div>
            <div style="font-size:0.65rem;color:#94a3b8;margin-top:2px;">sans impayé</div>
          </div>

          <!-- Evolution -->
          <div style="padding:14px;border-radius:1rem;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <iconify-icon icon="${evoIcon}" style="color:${evoColor};font-size:1.1rem;"></iconify-icon>
              <span style="font-size:0.68rem;color:#94a3b8;font-weight:600;">Évolution</span>
            </div>
            <div style="font-size:1.1rem;font-weight:800;color:${evoColor};">${evo ? evoSign + evo.tendancePct + '%' : '--'}</div>
            <div style="font-size:0.65rem;color:#94a3b8;margin-top:2px;">vs mois dernier</div>
          </div>
        </div>

        <!-- Objectif quotidien -->
        ${redevance > 0 ? `
        <div style="margin-top:12px;padding:14px;border-radius:1rem;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <iconify-icon icon="solar:target-bold-duotone" style="color:${objColor};font-size:1rem;"></iconify-icon>
              <span style="font-size:0.75rem;font-weight:600;color:#0f172a;">Objectif quotidien</span>
            </div>
            <span style="font-size:0.75rem;font-weight:700;color:${objColor};">${this._formatCurrency(redevance)}</span>
          </div>
          <div style="height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${objectifPct}%;background:${objColor};border-radius:4px;transition:width 0.5s;"></div>
          </div>
        </div>` : ''}

      </div>
    `;
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

  async _loadWeeklySummary() {
    const container = document.getElementById('weekly-summary-card');
    if (!container) return;

    try {
      const summary = await DriverStore.getResumeHebdo();
      if (!summary || summary.error) {
        container.style.display = 'none';
        return;
      }

      const scoreColor = (summary.scoreMoyen || 0) >= 70 ? '#22c55e' : (summary.scoreMoyen || 0) >= 50 ? '#f59e0b' : '#ef4444';
      const tendanceIcon = summary.tendance === 'up' ? '↑' : summary.tendance === 'down' ? '↓' : '→';
      const tendanceColor = summary.tendance === 'up' ? '#22c55e' : summary.tendance === 'down' ? '#ef4444' : '#94a3b8';

      container.innerHTML = `
        <div style="border-radius:1.5rem;background:linear-gradient(135deg,#6366f1,#4f46e5);padding:1.25rem;color:white;margin-bottom:1.25rem;box-shadow:0 4px 16px rgba(99,102,241,0.2)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;opacity:0.9">
            <iconify-icon icon="solar:chart-bold-duotone" style="font-size:1.2rem"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">Resume de la semaine</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <div style="text-align:center">
              <div style="font-size:1.4rem;font-weight:900">${summary.joursActifs || 0}</div>
              <div style="font-size:0.65rem;opacity:0.8;font-weight:600">Jours actifs</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:1.4rem;font-weight:900">${Math.round(summary.distanceKm || 0)}</div>
              <div style="font-size:0.65rem;opacity:0.8;font-weight:600">km parcourus</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:1.4rem;font-weight:900">${(summary.heuresTravail || 0).toFixed(1)}h</div>
              <div style="font-size:0.65rem;opacity:0.8;font-weight:600">de conduite</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.15)">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:0.8rem;font-weight:600;opacity:0.85">Score moyen</span>
              <span style="font-size:1.1rem;font-weight:900">${summary.scoreMoyen || '--'}/100</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:2rem;background:rgba(255,255,255,0.15)">
              <span style="font-size:0.9rem;color:${tendanceColor}">${tendanceIcon}</span>
              <span style="font-size:0.7rem;font-weight:600;opacity:0.9">${summary.tendance === 'up' ? 'En hausse' : summary.tendance === 'down' ? 'En baisse' : 'Stable'}</span>
            </div>
          </div>
        </div>`;
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

  // =================== SERVICE / POINTAGE ===================

  _serviceTimerInterval: null,

  _buildServiceCard(creneau, serviceJour, objectifMinutes) {
    const statut = serviceJour ? serviceJour.statut : null;
    const objMin = objectifMinutes || 630;
    const objH = Math.floor(objMin / 60);
    const objM = objMin % 60;
    const objLabel = objM > 0 ? `${objH}h${String(objM).padStart(2, '0')}` : `${objH}h`;

    if (!statut) {
      // Pas de créneau = pas de bouton commencer
      if (!creneau) {
        return `
        <div id="service-card" style="border-radius:1.25rem;background:white;border:1px solid #e2e8f0;padding:1.25rem;margin-bottom:1.25rem">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <iconify-icon icon="solar:clock-circle-bold-duotone" style="font-size:1.3rem;color:#94a3b8"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">Mon service</span>
          </div>
          <div style="text-align:center;padding:8px 0">
            <div style="font-size:0.88rem;font-weight:600;color:#64748b;margin-bottom:4px">Vous n'etes pas programme aujourd'hui</div>
            <div style="font-size:0.78rem;color:#94a3b8">Consultez votre planning pour voir vos prochains creneaux</div>
          </div>
        </div>`;
      }
      return `
        <div id="service-card" style="border-radius:1.25rem;background:white;border:1px solid #e2e8f0;padding:1.25rem;margin-bottom:1.25rem">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <iconify-icon icon="solar:play-circle-bold-duotone" style="font-size:1.3rem;color:#22c55e"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">Mon service</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(59,130,246,0.06);border-radius:0.75rem;margin-bottom:12px;border:1px solid rgba(59,130,246,0.12)">
            <iconify-icon icon="solar:clock-circle-bold-duotone" style="font-size:1rem;color:#3b82f6"></iconify-icon>
            <span style="font-size:0.78rem;font-weight:600;color:#3b82f6">Objectif temps en ligne : ${objLabel}</span>
          </div>
          <button onclick="AccueilPage._startService()" style="width:100%;padding:14px;border-radius:1rem;border:none;background:linear-gradient(135deg,#22c55e,#16a34a);color:white;font-size:0.95rem;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px rgba(34,197,94,0.3)">
            <iconify-icon icon="solar:play-bold" style="margin-right:6px"></iconify-icon> Commencer mon service
          </button>
        </div>`;
    }

    if (statut === 'en_service') {
      const behaviorState = typeof DriverBehavior !== 'undefined' ? DriverBehavior.getState() : null;
      const isTracking = behaviorState && behaviorState.active;
      const score = isTracking ? behaviorState.score : '--';
      const scoreColor = isTracking ? (behaviorState.score >= 70 ? '#fff' : behaviorState.score >= 50 ? '#fef3c7' : '#fecaca') : '#fff';
      const counters = isTracking ? behaviorState.counters : { freinagesBrusques: 0, accelerationsBrusques: 0, viragesAgressifs: 0, excesVitesse: 0 };

      return `
        <div id="service-card" style="border-radius:1.25rem;background:linear-gradient(135deg,#22c55e,#16a34a);padding:1.25rem;margin-bottom:1.25rem;color:white;box-shadow:0 4px 16px rgba(34,197,94,0.2)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:8px;height:8px;border-radius:50%;background:white;box-shadow:0 0 0 3px rgba(255,255,255,0.3);animation:pulse 2s infinite"></span>
              <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">En service</span>
            </div>
            <span id="service-timer" style="font-size:1.5rem;font-weight:800;font-variant-numeric:tabular-nums">--:--:--</span>
          </div>

          <!-- Analyse conduite en direct -->
          <div id="behavior-live" style="background:rgba(0,0,0,0.15);border-radius:0.75rem;padding:10px 12px;margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:6px">
                <iconify-icon icon="solar:shield-check-bold-duotone" style="font-size:0.9rem"></iconify-icon>
                <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;opacity:0.85">Conduite${isTracking ? '' : ' (capteurs inactifs)'}</span>
              </div>
              <span id="behavior-live-score" style="font-size:1.1rem;font-weight:900;color:${scoreColor}">${score}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
              <div style="text-align:center;background:rgba(255,255,255,0.1);border-radius:6px;padding:6px 2px">
                <iconify-icon icon="solar:hand-shake-bold-duotone" style="font-size:0.8rem;opacity:0.9"></iconify-icon>
                <div id="behavior-count-freinage" style="font-size:0.85rem;font-weight:800">${counters.freinagesBrusques}</div>
                <div style="font-size:0.55rem;opacity:0.7">Freinages</div>
              </div>
              <div style="text-align:center;background:rgba(255,255,255,0.1);border-radius:6px;padding:6px 2px">
                <iconify-icon icon="solar:rocket-2-bold-duotone" style="font-size:0.8rem;opacity:0.9"></iconify-icon>
                <div id="behavior-count-acceleration" style="font-size:0.85rem;font-weight:800">${counters.accelerationsBrusques}</div>
                <div style="font-size:0.55rem;opacity:0.7">Accel.</div>
              </div>
              <div style="text-align:center;background:rgba(255,255,255,0.1);border-radius:6px;padding:6px 2px">
                <iconify-icon icon="solar:route-bold-duotone" style="font-size:0.8rem;opacity:0.9"></iconify-icon>
                <div id="behavior-count-virage" style="font-size:0.85rem;font-weight:800">${counters.viragesAgressifs}</div>
                <div style="font-size:0.55rem;opacity:0.7">Virages</div>
              </div>
              <div style="text-align:center;background:rgba(255,255,255,0.1);border-radius:6px;padding:6px 2px">
                <iconify-icon icon="solar:speed-bold-duotone" style="font-size:0.8rem;opacity:0.9"></iconify-icon>
                <div id="behavior-count-vitesse" style="font-size:0.85rem;font-weight:800">${counters.excesVitesse}</div>
                <div style="font-size:0.55rem;opacity:0.7">Vitesse</div>
              </div>
            </div>
          </div>

          <!-- Progression temps en ligne / objectif -->
          <div style="background:rgba(0,0,0,0.15);border-radius:0.75rem;padding:10px 12px;margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:6px">
                <iconify-icon icon="solar:clock-circle-bold-duotone" style="font-size:0.9rem"></iconify-icon>
                <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;opacity:0.85">Temps en ligne</span>
              </div>
              <span id="objectif-progress-text" style="font-size:0.78rem;font-weight:700">--:-- / ${objLabel}</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden">
              <div id="objectif-progress-bar" style="height:100%;width:0%;background:white;border-radius:3px;transition:width 1s ease"></div>
            </div>
          </div>

          <div style="display:flex;gap:10px">
            <button onclick="AccueilPage._pauseService()" style="flex:1;padding:12px;border-radius:0.75rem;border:none;background:rgba(255,255,255,0.2);color:white;font-size:0.82rem;font-weight:700;cursor:pointer;font-family:inherit">
              <iconify-icon icon="solar:pause-bold" style="margin-right:4px"></iconify-icon> Faire une pause
            </button>
            <button onclick="AccueilPage._endService()" style="flex:1;padding:12px;border-radius:0.75rem;border:none;background:rgba(255,255,255,0.2);color:white;font-size:0.82rem;font-weight:700;cursor:pointer;font-family:inherit">
              <iconify-icon icon="solar:stop-bold" style="margin-right:4px"></iconify-icon> Terminer
            </button>
          </div>
        </div>`;
    }

    if (statut === 'pause') {
      return `
        <div id="service-card" style="border-radius:1.25rem;background:linear-gradient(135deg,#f59e0b,#d97706);padding:1.25rem;margin-bottom:1.25rem;color:white;box-shadow:0 4px 16px rgba(245,158,11,0.2)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:8px">
              <iconify-icon icon="solar:pause-bold" style="font-size:1rem"></iconify-icon>
              <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">En pause</span>
            </div>
            <span id="pause-timer" style="font-size:1.5rem;font-weight:800;font-variant-numeric:tabular-nums">--:--</span>
          </div>
          <div style="display:flex;gap:10px;margin-top:14px">
            <button onclick="AccueilPage._resumeService()" style="flex:1;padding:12px;border-radius:0.75rem;border:none;background:rgba(255,255,255,0.25);color:white;font-size:0.82rem;font-weight:700;cursor:pointer;font-family:inherit">
              <iconify-icon icon="solar:play-bold" style="margin-right:4px"></iconify-icon> Reprendre
            </button>
            <button onclick="AccueilPage._endService()" style="flex:1;padding:12px;border-radius:0.75rem;border:none;background:rgba(255,255,255,0.15);color:white;font-size:0.82rem;font-weight:700;cursor:pointer;font-family:inherit">
              <iconify-icon icon="solar:stop-bold" style="margin-right:4px"></iconify-icon> Terminer
            </button>
          </div>
        </div>`;
    }

    if (statut === 'termine') {
      const dureeH = Math.floor(serviceJour.dureeTotaleMinutes / 60);
      const dureeM = serviceJour.dureeTotaleMinutes % 60;
      const pauseH = Math.floor(serviceJour.dureePauseMinutes / 60);
      const pauseM = serviceJour.dureePauseMinutes % 60;
      const debut = new Date(serviceJour.heureDebut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const fin = new Date(serviceJour.heureFin).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const dureeLabel = `${dureeH}h${String(dureeM).padStart(2, '0')}`;
      const objectifAtteint = serviceJour.dureeTotaleMinutes >= objMin;
      const progressPct = Math.min(100, Math.round((serviceJour.dureeTotaleMinutes / objMin) * 100));

      // Score conduite (si disponible via behaviorScores)
      const bs = serviceJour.behaviorScores;
      const scoreGlobal = bs ? bs.scoreGlobal : null;
      const scoreColor = scoreGlobal !== null ? (scoreGlobal >= 80 ? '#22c55e' : scoreGlobal >= 50 ? '#f59e0b' : '#ef4444') : '#94a3b8';

      return `
        <div id="service-card" style="border-radius:1.25rem;background:white;border:1px solid #e2e8f0;padding:1.25rem;margin-bottom:1.25rem">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:1.2rem;color:#22c55e"></iconify-icon>
            <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">Journee terminee</span>
          </div>
          <div style="display:flex;gap:12px;text-align:center;margin-bottom:12px">
            <div style="flex:1;background:#f8fafc;border-radius:0.75rem;padding:10px 8px">
              <div style="font-size:0.68rem;color:#94a3b8">Duree travail</div>
              <div style="font-size:1.1rem;font-weight:800;color:#0f172a">${dureeLabel}</div>
            </div>
            <div style="flex:1;background:#f8fafc;border-radius:0.75rem;padding:10px 8px">
              <div style="font-size:0.68rem;color:#94a3b8">Pause</div>
              <div style="font-size:1.1rem;font-weight:800;color:#f59e0b">${pauseH}h${String(pauseM).padStart(2, '0')}</div>
            </div>
            <div style="flex:1;background:#f8fafc;border-radius:0.75rem;padding:10px 8px">
              <div style="font-size:0.68rem;color:#94a3b8">Horaires</div>
              <div style="font-size:0.85rem;font-weight:700;color:#0f172a">${debut} - ${fin}</div>
            </div>
          </div>

          <!-- Barre de progression temps en ligne -->
          <div style="background:#f8fafc;border-radius:0.75rem;padding:12px;margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:6px">
                <iconify-icon icon="solar:clock-circle-bold-duotone" style="font-size:0.85rem;color:${objectifAtteint ? '#22c55e' : '#ef4444'}"></iconify-icon>
                <span style="font-size:0.72rem;font-weight:700;color:#64748b">Temps en ligne</span>
              </div>
              <span style="font-size:0.72rem;font-weight:800;color:${objectifAtteint ? '#22c55e' : '#ef4444'}">${dureeLabel} / ${objLabel}</span>
            </div>
            <div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${progressPct}%;background:${objectifAtteint ? '#22c55e' : '#ef4444'};border-radius:3px"></div>
            </div>
            ${!objectifAtteint ? `
            <div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding:8px 10px;background:rgba(239,68,68,0.06);border-radius:8px;border:1px solid rgba(239,68,68,0.15)">
              <iconify-icon icon="solar:danger-triangle-bold-duotone" style="font-size:1rem;color:#ef4444;flex-shrink:0"></iconify-icon>
              <span style="font-size:0.72rem;font-weight:600;color:#ef4444">Objectif non atteint \u2014 il manque ${Math.floor((objMin - serviceJour.dureeTotaleMinutes) / 60)}h${String((objMin - serviceJour.dureeTotaleMinutes) % 60).padStart(2, '0')}</span>
            </div>` : `
            <div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding:8px 10px;background:rgba(34,197,94,0.06);border-radius:8px;border:1px solid rgba(34,197,94,0.15)">
              <iconify-icon icon="solar:check-circle-bold-duotone" style="font-size:1rem;color:#22c55e;flex-shrink:0"></iconify-icon>
              <span style="font-size:0.72rem;font-weight:600;color:#22c55e">Objectif atteint !</span>
            </div>`}
          </div>

          ${scoreGlobal !== null ? `
          <div style="background:#f8fafc;border-radius:0.75rem;padding:12px;display:flex;align-items:center;gap:12px">
            <div style="width:48px;height:48px;border-radius:50%;background:${scoreColor};display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:1.1rem;flex-shrink:0">${scoreGlobal}</div>
            <div style="flex:1">
              <div style="font-size:0.78rem;font-weight:700;color:#0f172a;margin-bottom:2px">Score conduite</div>
              <div style="font-size:0.68rem;color:#94a3b8">${scoreGlobal >= 80 ? 'Excellente conduite' : scoreGlobal >= 50 ? 'Conduite correcte, des ameliorations possibles' : 'Attention a votre conduite'}</div>
            </div>
            <iconify-icon icon="solar:shield-check-bold-duotone" style="font-size:1.5rem;color:${scoreColor}"></iconify-icon>
          </div>` : ''}
        </div>`;
    }

    return '';
  },

  async _startService() {
    // Verifier si l'etat des lieux a ete fait aujourd'hui (OBLIGATOIRE)
    const etatLieux = await DriverStore.getEtatLieuxToday();
    if (!etatLieux || !etatLieux.id) {
      DriverModal.show('Etat des lieux requis', `
        <div style="text-align:center;padding:0.5rem 0">
          <iconify-icon icon="solar:shield-warning-bold-duotone" style="font-size:3rem;color:#f59e0b;display:block;margin-bottom:12px"></iconify-icon>
          <p style="font-size:0.9rem;font-weight:700;color:var(--text-primary)">Etat des lieux obligatoire</p>
          <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:6px">Vous devez effectuer l'etat des lieux de votre vehicule avant de pouvoir commencer votre service.</p>
        </div>
      `, [
        { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
        { label: 'Faire l\'etat des lieux', class: 'btn btn-primary', onclick: 'DriverModal.close(); DriverRouter.navigate("etat-lieux")' }
      ]);
      return;
    }

    // Verifier la checklist vehicule (optionnel)
    const checklist = await DriverStore.getChecklistToday();
    if (!checklist || !checklist.id) {
      DriverModal.show('Inspection vehicule', `
        <div style="text-align:center;padding:0.5rem 0">
          <iconify-icon icon="solar:clipboard-check-bold-duotone" style="font-size:3rem;color:#3b82f6;display:block;margin-bottom:12px"></iconify-icon>
          <p style="font-size:0.9rem;color:var(--text-secondary)">Vous n'avez pas encore fait l'inspection de votre vehicule aujourd'hui.</p>
        </div>
      `, [
        { label: 'Passer', class: 'btn btn-outline', onclick: 'DriverModal.close(); AccueilPage._doStartService()' },
        { label: 'Faire l\'inspection', class: 'btn btn-primary', onclick: 'DriverModal.close(); DriverRouter.navigate("checklist")' }
      ]);
      return;
    }

    this._doStartService();
  },

  async _doStartService() {
    // Demander la permission capteurs AVANT l'appel API (geste utilisateur requis par iOS)
    if (typeof DriverBehavior !== 'undefined') {
      await DriverBehavior.requestPermission();
    }

    const result = await DriverStore.startService();
    if (result && !result.error) {
      // Demarrer l'analyse de conduite
      if (typeof DriverBehavior !== 'undefined' && DriverBehavior._permissionGranted) {
        DriverBehavior.start();
        DriverBehavior.onEvent((event, counters, score) => {
          this._updateBehaviorUI(event, counters, score);
        });
      }
      DriverToast.show('Service demarre !', 'success');
      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  async _pauseService() {
    const result = await DriverStore.pauseService();
    if (result && !result.error) {
      if (typeof DriverBehavior !== 'undefined') DriverBehavior.pause();
      DriverToast.show('Pause en cours', 'info');
      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  async _resumeService() {
    const result = await DriverStore.resumeService();
    if (result && !result.error) {
      if (typeof DriverBehavior !== 'undefined') DriverBehavior.resume();
      DriverToast.show('Service repris !', 'success');
      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  _endService() {
    DriverModal.show('Terminer la journee ?',
      '<p style="font-size:0.9rem;color:var(--text-secondary)">Etes-vous sur de vouloir terminer votre service pour aujourd\'hui ?</p>',
      [
        { label: 'Annuler', class: 'btn btn-outline', onclick: 'DriverModal.close()' },
        { label: 'Terminer', class: 'btn btn-danger', onclick: 'AccueilPage._confirmEndService()' }
      ]
    );
  },

  async _confirmEndService() {
    DriverModal.close();
    // Arreter l'analyse de conduite
    if (typeof DriverBehavior !== 'undefined') DriverBehavior.stop();
    const result = await DriverStore.endService();
    if (result && !result.error) {
      if (result.behaviorScores) {
        DriverToast.show(`Journee terminee ! Score conduite : ${result.behaviorScores.scoreGlobal}/100`, 'success', 4000);
      } else {
        DriverToast.show('Journee terminee !', 'success');
      }

      // Alerte si objectif temps en ligne non atteint
      if (result.objectifAtteint === false) {
        const dH = Math.floor(result.dureeTotaleMinutes / 60);
        const dM = result.dureeTotaleMinutes % 60;
        const oH = Math.floor(result.objectifTempsEnLigne / 60);
        const oM = result.objectifTempsEnLigne % 60;
        const oLabel = oM > 0 ? `${oH}h${String(oM).padStart(2, '0')}` : `${oH}h`;
        setTimeout(() => {
          DriverModal.show('Objectif non atteint', `
            <div style="text-align:center;padding:0.5rem 0">
              <iconify-icon icon="solar:danger-triangle-bold-duotone" style="font-size:3rem;color:#ef4444;display:block;margin-bottom:12px"></iconify-icon>
              <p style="font-size:0.95rem;font-weight:700;color:#ef4444">Temps en ligne insuffisant</p>
              <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px">
                Vous avez \u00e9t\u00e9 en ligne <strong>${dH}h${String(dM).padStart(2, '0')}</strong> aujourd'hui.<br>
                L'objectif minimum est de <strong>${oLabel}</strong>.
              </p>
              <p style="font-size:0.78rem;color:var(--text-muted);margin-top:10px">
                Il manque <strong>${Math.floor((result.objectifTempsEnLigne - result.dureeTotaleMinutes) / 60)}h${String((result.objectifTempsEnLigne - result.dureeTotaleMinutes) % 60).padStart(2, '0')}</strong> pour atteindre l'objectif.
              </p>
            </div>
          `, [
            { label: 'Compris', class: 'btn btn-primary', onclick: 'DriverModal.close()' }
          ]);
        }, 500);
      }

      this.render(document.getElementById('app-content'));
    } else {
      DriverToast.show(result?.error || 'Erreur', 'error');
    }
  },

  // =================== BEHAVIOR UI UPDATES ===================

  _updateBehaviorUI(event, counters, score) {
    // Mettre a jour le score en direct
    const scoreEl = document.getElementById('behavior-live-score');
    if (scoreEl) {
      scoreEl.textContent = score;
      scoreEl.style.color = score >= 70 ? '#fff' : score >= 50 ? '#fef3c7' : '#fecaca';
    }

    // Mettre a jour les compteurs
    const countEls = {
      'behavior-count-freinage': counters.freinagesBrusques,
      'behavior-count-acceleration': counters.accelerationsBrusques,
      'behavior-count-virage': counters.viragesAgressifs,
      'behavior-count-vitesse': counters.excesVitesse
    };
    for (const [id, val] of Object.entries(countEls)) {
      const el = document.getElementById(id);
      if (el) el.textContent = val || 0;
    }

    // Toast d'alerte
    const labels = {
      freinage: 'Freinage brusque detecte',
      acceleration: 'Acceleration brusque detectee',
      virage: 'Virage agressif detecte',
      exces_vitesse: 'Exces de vitesse detecte'
    };
    const toastType = event.severite === 'severe' ? 'error' : 'warning';
    DriverToast.show(labels[event.type] || 'Evenement detecte', toastType, 2000);
  },

  // Demarrer le behavior tracking si le service est deja en cours (retour sur la page)
  _resumeBehaviorIfActive(serviceJour) {
    if (!serviceJour || serviceJour.statut !== 'en_service') return;
    if (typeof DriverBehavior === 'undefined') return;

    // Si pas deja actif, demarrer (sans requestPermission car deja accorde ou pas de geste disponible)
    if (!DriverBehavior._active && DriverBehavior._permissionGranted) {
      DriverBehavior.start();
      DriverBehavior.onEvent((event, counters, score) => {
        this._updateBehaviorUI(event, counters, score);
      });
    } else if (DriverBehavior._active) {
      // Re-enregistrer le callback UI
      DriverBehavior.onEvent((event, counters, score) => {
        this._updateBehaviorUI(event, counters, score);
      });
    }
  },

  _startServiceTimer(heureDebut, evenements) {
    this._stopServiceTimer();
    const objMin = this._objectifTempsEnLigne || 630;
    const objH = Math.floor(objMin / 60);
    const objM = objMin % 60;
    const objLabel = objM > 0 ? `${objH}h${String(objM).padStart(2, '0')}` : `${objH}h`;

    const updateTimer = () => {
      const timerEl = document.getElementById('service-timer');
      if (!timerEl) { this._stopServiceTimer(); return; }
      const debut = new Date(heureDebut);
      const now = new Date();
      let pauseMs = 0;
      let pauseStart = null;
      for (const evt of evenements) {
        if (evt.type === 'pause') pauseStart = new Date(evt.heure);
        else if (evt.type === 'reprise' && pauseStart) { pauseMs += new Date(evt.heure) - pauseStart; pauseStart = null; }
      }
      const elapsedMs = now - debut - pauseMs;
      const h = Math.floor(elapsedMs / 3600000);
      const m = Math.floor((elapsedMs % 3600000) / 60000);
      const s = Math.floor((elapsedMs % 60000) / 1000);
      timerEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      // Mettre a jour la barre de progression temps en ligne
      const elapsedMin = Math.floor(elapsedMs / 60000);
      const progressPct = Math.min(100, Math.round((elapsedMin / objMin) * 100));
      const progressBar = document.getElementById('objectif-progress-bar');
      const progressText = document.getElementById('objectif-progress-text');
      if (progressBar) {
        progressBar.style.width = progressPct + '%';
        // Couleur verte si objectif atteint
        if (elapsedMin >= objMin) {
          progressBar.style.background = '#86efac';
        }
      }
      if (progressText) {
        progressText.textContent = `${h}h${String(m).padStart(2, '0')} / ${objLabel}`;
      }
    };
    updateTimer();
    this._serviceTimerInterval = setInterval(updateTimer, 1000);
  },

  _startPauseTimer(evenements) {
    this._stopServiceTimer();
    const lastPause = [...evenements].reverse().find(e => e.type === 'pause');
    if (!lastPause) return;
    const updateTimer = () => {
      const timerEl = document.getElementById('pause-timer');
      if (!timerEl) { this._stopServiceTimer(); return; }
      const pauseStart = new Date(lastPause.heure);
      const now = new Date();
      const elapsedMs = now - pauseStart;
      const m = Math.floor(elapsedMs / 60000);
      const s = Math.floor((elapsedMs % 60000) / 1000);
      timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    updateTimer();
    this._serviceTimerInterval = setInterval(updateTimer, 1000);
  },

  _stopServiceTimer() {
    if (this._serviceTimerInterval) {
      clearInterval(this._serviceTimerInterval);
      this._serviceTimerInterval = null;
    }
  },

  destroy() {
    DriverCountdown.stopTimer();
    this._stopServiceTimer();
  }
};
