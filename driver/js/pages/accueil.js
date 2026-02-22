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
      </div>
    `;

    // Demarrer le timer du countdown apres le render
    if (data.deadline && data.deadline.configured) {
      DriverCountdown.startTimer();
    }
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
