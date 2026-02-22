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
  },

  /**
   * Retourne le HTML du widget countdown.
   */
  renderWidget() {
    if (!this._deadlineDate) return '';

    const remaining = this._deadlineDate - new Date();
    const status = this._getStatus(remaining);

    return `
      <div class="countdown-widget countdown-${status.level}" id="countdown-widget">
        <div class="countdown-header">
          <i class="fas ${status.level === 'expired' ? 'fa-exclamation-circle' : 'fa-hourglass-half'}"></i>
          <span>Deadline versement</span>
          ${status.level === 'expired' ? '<span class="badge-countdown-expired">EXPIRE</span>' : ''}
        </div>
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
            Penalite: ${this._penaliteType === 'pourcentage' ? this._penaliteValeur + '% du montant brut' : this._penaliteValeur.toLocaleString('fr-FR') + ' FCFA'}
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
    if (!this._deadlineDate) return;

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
      return `<span class="countdown-expired-text"><i class="fas fa-exclamation-triangle"></i> Depasse de ${h}h ${String(m).padStart(2, '0')}m</span>`;
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

  /**
   * Verifie et joue l'alerte sonore 1x par session si < 24h.
   */
  _checkSoundAlert(remainingMs) {
    if (sessionStorage.getItem('volt_deadline_sound_played')) return;
    if (remainingMs > 24 * 3600 * 1000 || remainingMs <= 0) return;

    this.playAlertSound();
    sessionStorage.setItem('volt_deadline_sound_played', '1');
  },

  /**
   * Joue un son d'alerte via Web Audio API.
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

      // Jouer 2 fois avec 1s d'ecart
      playChord(ctx.currentTime);
      playChord(ctx.currentTime + 1.0);
    } catch (e) {
      console.warn('Sound alert failed:', e);
    }
  },

  destroy() {
    this.stopTimer();
  }
};
