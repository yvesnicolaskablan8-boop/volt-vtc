/**
 * DriverCountdown — Widget compte a rebours deadline versement
 *
 * Affiche un compteur en temps reel avec couleurs selon l'urgence :
 * - Vert (>48h) / Orange (24-48h) / Rouge pulsant (<24h) / Rouge clignotant (expire)
 * - Alerte sonore 1x par session si < 24h (Web Audio API)
 */
const DriverCountdown = {
  _interval: null,
  _deadlineDate: null,
  _penaliteActive: false,
  _penaliteType: 'pourcentage',
  _penaliteValeur: 0,

  /**
   * Initialise avec les donnees deadline du serveur.
   */
  init(deadlineData) {
    if (!deadlineData || !deadlineData.configured) return;
    this._deadlineDate = new Date(deadlineData.deadlineDate);
    this._penaliteActive = deadlineData.penaliteActive || false;
    this._penaliteType = deadlineData.penaliteType || 'pourcentage';
    this._penaliteValeur = deadlineData.penaliteValeur || 0;
    this._deadlineType = deadlineData.deadlineType || 'quotidien';
    this._alreadyPaid = deadlineData.alreadyPaid || false;
  },

  /**
   * Retourne le HTML du widget countdown.
   */
  renderWidget() {
    if (!this._deadlineDate) return '';

    // Si deja paye → afficher message de confirmation
    if (this._alreadyPaid) {
      return `
        <div class="countdown-widget countdown-paid" id="countdown-widget">
          <div class="countdown-header">
            <i class="fas fa-check-circle"></i>
            <span>Recette du jour versee</span>
          </div>
          <div class="countdown-subtext">Ton versement a bien ete enregistre. Bonne route !</div>
        </div>
      `;
    }

    const remaining = this._deadlineDate - new Date();
    const status = this._getStatus(remaining);

    // Heure limite formatee (ex: "23h59")
    const heureLimit = String(this._deadlineDate.getHours()).padStart(2, '0') + 'h' + String(this._deadlineDate.getMinutes()).padStart(2, '0');

    // Textes adaptes au type de deadline
    let headerIcon, headerText, subText;
    if (status.level === 'expired') {
      headerIcon = 'fa-exclamation-circle';
      if (this._deadlineType === 'quotidien') {
        headerText = 'Recette non versee !';
        subText = `L'heure limite de ${heureLimit} est depassee`;
      } else {
        headerText = 'Deadline depassee !';
        subText = 'Versez votre recette au plus vite';
      }
    } else {
      headerIcon = 'fa-hourglass-half';
      if (this._deadlineType === 'quotidien') {
        headerText = `Verse ta recette avant ${heureLimit}`;
        subText = 'Temps restant pour verser sans penalite';
      } else {
        headerText = 'Deadline versement';
        subText = `Date limite : ${this._deadlineDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} a ${heureLimit}`;
      }
    }

    return `
      <div class="countdown-widget countdown-${status.level}" id="countdown-widget">
        <div class="countdown-header">
          <i class="fas ${headerIcon}"></i>
          <span>${headerText}</span>
          ${status.level === 'expired' ? '<span class="badge-countdown-expired">EN RETARD</span>' : ''}
        </div>
        <div class="countdown-subtext" id="countdown-subtext">${subText}</div>
        <div class="countdown-timer" id="countdown-timer">
          ${this._formatTime(remaining)}
        </div>
        ${status.level === 'critical' || status.level === 'expired' ? `
          <button class="btn btn-success btn-block btn-sm countdown-cta" onclick="DriverRouter.navigate('versements')">
            <i class="fas fa-money-bill-wave"></i> Faire un versement maintenant
          </button>
        ` : ''}
        ${status.level === 'expired' && this._penaliteActive ? `
          <div class="countdown-penalty">
            <i class="fas fa-exclamation-triangle"></i>
            Penalite de retard : ${this._penaliteType === 'pourcentage' ? this._penaliteValeur + '% preleve sur ta recette' : this._penaliteValeur.toLocaleString('fr-FR') + ' FCFA en plus'}
          </div>
        ` : ''}
      </div>
    `;
  },

  /**
   * Demarre le timer live (setInterval 1s).
   */
  startTimer() {
    if (this._interval) clearInterval(this._interval);
    if (!this._deadlineDate || this._alreadyPaid) return;

    this._interval = setInterval(() => {
      const el = document.getElementById('countdown-timer');
      const widget = document.getElementById('countdown-widget');
      if (!el || !widget) { this.stopTimer(); return; }

      const remaining = this._deadlineDate - new Date();
      el.innerHTML = this._formatTime(remaining);

      // Mettre a jour la classe de statut
      const status = this._getStatus(remaining);
      widget.className = `countdown-widget countdown-${status.level}`;

      // Check alerte sonore
      this._checkSoundAlert(remaining);
    }, 1000);
  },

  /**
   * Stoppe le timer.
   */
  stopTimer() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  },

  /**
   * Determine le niveau d'urgence.
   */
  _getStatus(remainingMs) {
    if (remainingMs <= 0) return { level: 'expired' };
    if (remainingMs <= 24 * 3600 * 1000) return { level: 'critical' };
    if (remainingMs <= 48 * 3600 * 1000) return { level: 'warning' };
    return { level: 'safe' };
  },

  /**
   * Formate le temps restant en HTML.
   */
  _formatTime(remainingMs) {
    if (remainingMs <= 0) {
      const elapsed = Math.abs(remainingMs);
      const h = Math.floor(elapsed / 3600000);
      const m = Math.floor((elapsed % 3600000) / 60000);
      return `<span class="countdown-expired-text"><i class="fas fa-exclamation-triangle"></i> Retard : ${h}h ${String(m).padStart(2, '0')}min</span>`;
    }

    const days = Math.floor(remainingMs / 86400000);
    const hours = Math.floor((remainingMs % 86400000) / 3600000);
    const minutes = Math.floor((remainingMs % 3600000) / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);

    let html = '<div class="countdown-units">';
    if (days > 0) html += `<div class="countdown-unit"><span class="countdown-num">${days}</span><span class="countdown-label">jour${days > 1 ? 's' : ''}</span></div>`;
    html += `<div class="countdown-unit"><span class="countdown-num">${String(hours).padStart(2, '0')}</span><span class="countdown-label">h</span></div>`;
    html += `<div class="countdown-unit"><span class="countdown-num">${String(minutes).padStart(2, '0')}</span><span class="countdown-label">min</span></div>`;
    html += `<div class="countdown-unit"><span class="countdown-num">${String(seconds).padStart(2, '0')}</span><span class="countdown-label">sec</span></div>`;
    html += '</div>';
    return html;
  },

  // =================== ALARM STATE ===================
  _alarmCtx: null,
  _alarmInterval: null,
  _alarmVibInterval: null,
  _alarmActive: false,

  /**
   * Verifie et joue l'alerte sonore selon l'urgence.
   * - Expire ou < 1h → alarme agressive (sirene + vibration + overlay)
   * - < 24h → son simple (2 accords)
   */
  _checkSoundAlert(remainingMs) {
    // Alarme deja en cours → ne rien faire
    if (this._alarmActive) return;

    // Cas 1 : Deadline depassee (impaye) ou < 1h → ALARME AGRESSIVE
    if (remainingMs <= 0 || (remainingMs > 0 && remainingMs <= 3600 * 1000)) {
      if (sessionStorage.getItem('volt_alarm_dismissed')) return;
      this.startAlarm();
      return;
    }

    // Cas 2 : < 24h → son simple (1 seule fois par session)
    if (remainingMs <= 24 * 3600 * 1000) {
      if (sessionStorage.getItem('volt_deadline_sound_played')) return;
      this.playAlertSound();
      sessionStorage.setItem('volt_deadline_sound_played', '1');
    }
  },

  /**
   * Joue un son d'alerte simple via Web Audio API.
   * Accord montant C5-E5-G5 joue 2 fois.
   */
  playAlertSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const playChord = (startTime) => {
        const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
        frequencies.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.12, startTime + i * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.7 + i * 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime + i * 0.12);
          osc.stop(startTime + 0.8 + i * 0.12);
        });
      };

      playChord(ctx.currentTime);
      playChord(ctx.currentTime + 1.0);
    } catch (e) {
      console.warn('Sound alert failed:', e);
    }
  },

  // =================== ALARME AGRESSIVE (sirene + vibration + overlay) ===================

  /**
   * Demarre l'alarme agressive : sirene en boucle + vibration continue + overlay plein ecran.
   */
  startAlarm() {
    if (this._alarmActive) return;
    this._alarmActive = true;

    // Si app native Android → utiliser les fonctions natives
    if (window.VoltNative) {
      try {
        window.VoltNative.setMaxVolume();
        window.VoltNative.keepScreenOn(true);
      } catch (e) {}
    }

    // 1. Sirene sonore en boucle via Web Audio API
    this._startSirenSound();

    // 2. Vibration en boucle
    this._startVibration();

    // 3. Overlay plein ecran
    this._showAlarmOverlay();
  },

  /**
   * Arrete completement l'alarme.
   */
  stopAlarm() {
    this._alarmActive = false;

    // Arreter le son
    if (this._alarmInterval) {
      clearInterval(this._alarmInterval);
      this._alarmInterval = null;
    }
    if (this._alarmCtx) {
      try { this._alarmCtx.close(); } catch (e) {}
      this._alarmCtx = null;
    }

    // Arreter la vibration
    if (this._alarmVibInterval) {
      clearInterval(this._alarmVibInterval);
      this._alarmVibInterval = null;
    }
    if (window.VoltNative) {
      try { window.VoltNative.cancelVibration(); } catch (e) {}
      try { window.VoltNative.keepScreenOn(false); } catch (e) {}
    } else if (navigator.vibrate) {
      navigator.vibrate(0);
    }

    // Masquer l'overlay
    const overlay = document.getElementById('alarm-overlay');
    if (overlay) overlay.remove();

    // Marquer dans sessionStorage (ne relancera pas cette session)
    sessionStorage.setItem('volt_alarm_dismissed', '1');
  },

  /**
   * Genere un son de sirene en boucle (oscillation 400→800→400 Hz).
   */
  _startSirenSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this._alarmCtx = new AudioCtx();
      const ctx = this._alarmCtx;

      const playSiren = () => {
        if (!this._alarmActive || !this._alarmCtx) return;
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(400, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.5);
          osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 1.0);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.setValueAtTime(0.3, ctx.currentTime + 1.0);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 1.3);
        } catch (e) {}
      };

      // Jouer immediatement puis en boucle
      playSiren();
      this._alarmInterval = setInterval(playSiren, 1500);
    } catch (e) {
      console.warn('Alarm siren failed:', e);
    }
  },

  /**
   * Lance la vibration en boucle.
   */
  _startVibration() {
    // App native → vibration native Android (plus puissante)
    if (window.VoltNative) {
      try {
        window.VoltNative.vibratePattern('[0,500,200,500,200,500,200,500]', 0);
        return; // La vibration native boucle toute seule
      } catch (e) {}
    }

    // Fallback PWA navigateur
    if (!navigator.vibrate) return;

    const vibratePattern = () => {
      if (!this._alarmActive) return;
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    };

    vibratePattern();
    this._alarmVibInterval = setInterval(vibratePattern, 2600);
  },

  /**
   * Affiche l'overlay plein ecran rouge avec bouton "J'ai compris".
   */
  _showAlarmOverlay() {
    // Supprimer si deja present
    const existing = document.getElementById('alarm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'alarm-overlay';
    overlay.className = 'alarm-overlay';

    overlay.innerHTML = `
      <div class="alarm-overlay-content">
        <div class="alarm-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <div class="alarm-title">VERSEMENT EN RETARD !</div>
        <div class="alarm-subtitle">Votre deadline de versement est depassee.<br>Effectuez votre versement immediatement.</div>
        <button class="alarm-btn-dismiss" id="alarm-btn-dismiss">
          <i class="fas fa-check"></i> J'ai compris
        </button>
        <button class="alarm-btn-payer" id="alarm-btn-payer">
          <i class="fas fa-money-bill-wave"></i> Faire un versement
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Bouton "J'ai compris" → arreter l'alarme
    document.getElementById('alarm-btn-dismiss').addEventListener('click', () => {
      this.stopAlarm();
    });

    // Bouton "Faire un versement" → arreter l'alarme + naviguer
    document.getElementById('alarm-btn-payer').addEventListener('click', () => {
      this.stopAlarm();
      if (typeof DriverRouter !== 'undefined') {
        DriverRouter.navigate('versements');
      }
    });
  },

  destroy() {
    this.stopTimer();
    this.stopAlarm();
  }
};
