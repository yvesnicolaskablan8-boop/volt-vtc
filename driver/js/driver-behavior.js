/**
 * DriverBehavior — Module d'analyse du comportement routier via capteurs du telephone
 * Utilise l'accelerometre (DeviceMotionEvent) pour detecter les evenements de conduite
 * et le GPS pour la detection d'exces de vitesse.
 */
const DriverBehavior = {

  // =================== CONFIGURATION ===================

  _config: {
    sampleRateHz: 10,
    batchIntervalMs: 60000,
    lowPassAlpha: 0.3,
    thresholds: {
      freinageFaible: 2.5,
      freinageModere: 3.9,
      freinageSevere: 5.9,
      accelerationFaible: 2.5,
      accelerationModere: 3.9,
      accelerationSevere: 5.9,
      virageFaible: 2.5,
      virageModere: 3.4,
      virageSevere: 4.9,
      excesVitesse: 130
    },
    eventCooldownMs: 3000,
    speedExcessMinDurationMs: 5000
  },

  // =================== STATE ===================

  _active: false,
  _paused: false,
  _permissionGranted: false,
  _motionListener: null,
  _batchInterval: null,
  _filtered: { x: 0, y: 0, z: 0 },
  _gravity: { x: 0, y: 0, z: 9.81 },
  _eventBuffer: [],
  _sentEventsCount: 0,
  _counters: { freinagesBrusques: 0, accelerationsBrusques: 0, viragesAgressifs: 0, excesVitesse: 0 },
  _lastEventTime: {},
  _speedExcessStart: null,
  _lastPosition: null,
  _currentScore: 100,
  _onEventCallback: null,

  // =================== API PUBLIQUE ===================

  /**
   * Demander la permission d'acces aux capteurs (requis par iOS 13+)
   * DOIT etre appele depuis un geste utilisateur (click/tap)
   */
  async requestPermission() {
    if (typeof DeviceMotionEvent === 'undefined') {
      console.warn('[Behavior] DeviceMotionEvent non supporte');
      return false;
    }

    // iOS 13+ requiert une permission explicite depuis un geste utilisateur
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const result = await DeviceMotionEvent.requestPermission();
        this._permissionGranted = (result === 'granted');
        console.log('[Behavior] Permission iOS:', result);
        return this._permissionGranted;
      } catch (e) {
        console.warn('[Behavior] Permission refusee:', e.message);
        return false;
      }
    }

    // Android / iOS ancien — pas de permission requise
    this._permissionGranted = true;
    return true;
  },

  /**
   * Demarrer la collecte des capteurs
   */
  start() {
    if (this._active) return;
    if (!this._permissionGranted) {
      console.warn('[Behavior] Permission non accordee');
      return;
    }

    this._active = true;
    this._paused = false;
    this._eventBuffer = [];
    this._sentEventsCount = 0;
    this._counters = { freinagesBrusques: 0, accelerationsBrusques: 0, viragesAgressifs: 0, excesVitesse: 0 };
    this._lastEventTime = {};
    this._filtered = { x: 0, y: 0, z: 0 };
    this._gravity = { x: 0, y: 0, z: 9.81 };
    this._currentScore = 100;
    this._speedExcessStart = null;

    // Ecouter l'accelerometre
    this._motionListener = (e) => this._onDeviceMotion(e);
    window.addEventListener('devicemotion', this._motionListener);

    // Timer d'envoi batch
    this._batchInterval = setInterval(() => this._sendBatch(), this._config.batchIntervalMs);

    // Tenter d'envoyer un buffer offline precedent
    this._sendOfflineBuffer();

    console.log('[Behavior] Demarrage collecte capteurs');
  },

  /**
   * Arreter la collecte et envoyer le dernier batch
   */
  stop() {
    if (!this._active) return;

    this._active = false;
    this._paused = false;

    if (this._motionListener) {
      window.removeEventListener('devicemotion', this._motionListener);
      this._motionListener = null;
    }

    if (this._batchInterval) {
      clearInterval(this._batchInterval);
      this._batchInterval = null;
    }

    // Envoyer le dernier batch
    this._sendBatch();

    console.log('[Behavior] Arret collecte capteurs');
  },

  /**
   * Mettre en pause (garde l'etat mais arrete la detection)
   */
  pause() {
    if (!this._active || this._paused) return;
    this._paused = true;
    console.log('[Behavior] Pause');
  },

  /**
   * Reprendre apres une pause
   */
  resume() {
    if (!this._active || !this._paused) return;
    this._paused = false;
    console.log('[Behavior] Reprise');
  },

  /**
   * Mettre a jour la position GPS (appele depuis driver-app.js)
   */
  updatePosition(lat, lng, speed, heading) {
    this._lastPosition = { lat, lng, speed, heading };
  },

  /**
   * Retourner l'etat actuel
   */
  getState() {
    return {
      active: this._active,
      paused: this._paused,
      score: this._currentScore,
      counters: { ...this._counters },
      eventCount: this._eventBuffer.length,
      permissionGranted: this._permissionGranted
    };
  },

  /**
   * Enregistrer un callback pour les evenements detectes
   */
  onEvent(callback) {
    this._onEventCallback = callback;
  },

  // =================== TRAITEMENT DU SIGNAL ===================

  _onDeviceMotion(event) {
    if (!this._active || this._paused) return;

    // Preferer acceleration (sans gravite) si disponible
    let ax, ay, az;
    if (event.acceleration && event.acceleration.x != null) {
      ax = event.acceleration.x || 0;
      ay = event.acceleration.y || 0;
      az = event.acceleration.z || 0;
    } else if (event.accelerationIncludingGravity) {
      // Retirer la gravite avec un filtre passe-bas
      const raw = event.accelerationIncludingGravity;
      const alpha = 0.8;
      this._gravity.x = alpha * this._gravity.x + (1 - alpha) * (raw.x || 0);
      this._gravity.y = alpha * this._gravity.y + (1 - alpha) * (raw.y || 0);
      this._gravity.z = alpha * this._gravity.z + (1 - alpha) * (raw.z || 0);
      ax = (raw.x || 0) - this._gravity.x;
      ay = (raw.y || 0) - this._gravity.y;
      az = (raw.z || 0) - this._gravity.z;
    } else {
      return;
    }

    // Filtre passe-bas pour reduire le bruit
    const filtered = this._lowPassFilter({ x: ax, y: ay, z: az });

    // Detecter les evenements
    this._detectEvents(filtered);
  },

  _lowPassFilter(raw) {
    const a = this._config.lowPassAlpha;
    this._filtered.x = this._filtered.x + a * (raw.x - this._filtered.x);
    this._filtered.y = this._filtered.y + a * (raw.y - this._filtered.y);
    this._filtered.z = this._filtered.z + a * (raw.z - this._filtered.z);
    return { x: this._filtered.x, y: this._filtered.y, z: this._filtered.z };
  },

  _detectEvents(filtered) {
    const now = Date.now();

    // Axe Y = longitudinal (freinage/acceleration en mode portrait)
    const longitudinalG = Math.abs(filtered.y);
    // Axe X = lateral (virages)
    const lateralG = Math.abs(filtered.x);

    // Detection freinage brusque
    if (longitudinalG > this._config.thresholds.freinageFaible) {
      if (!this._lastEventTime.freinage || now - this._lastEventTime.freinage > this._config.eventCooldownMs) {
        const severite = this._classifySeverity(longitudinalG, {
          severe: this._config.thresholds.freinageSevere,
          modere: this._config.thresholds.freinageModere,
          faible: this._config.thresholds.freinageFaible
        });
        this._addEvent('freinage', severite, longitudinalG);
        this._lastEventTime.freinage = now;
        this._counters.freinagesBrusques++;
      }
    }

    // Detection acceleration brusque (meme axe, on evite le doublon avec freinage)
    if (longitudinalG > this._config.thresholds.accelerationFaible) {
      const freinageCooldown = this._lastEventTime.freinage && (now - this._lastEventTime.freinage < 1000);
      if (!freinageCooldown) {
        if (!this._lastEventTime.acceleration || now - this._lastEventTime.acceleration > this._config.eventCooldownMs) {
          const severite = this._classifySeverity(longitudinalG, {
            severe: this._config.thresholds.accelerationSevere,
            modere: this._config.thresholds.accelerationModere,
            faible: this._config.thresholds.accelerationFaible
          });
          this._addEvent('acceleration', severite, longitudinalG);
          this._lastEventTime.acceleration = now;
          this._counters.accelerationsBrusques++;
        }
      }
    }

    // Detection virage agressif
    if (lateralG > this._config.thresholds.virageFaible) {
      if (!this._lastEventTime.virage || now - this._lastEventTime.virage > this._config.eventCooldownMs) {
        const severite = this._classifySeverity(lateralG, {
          severe: this._config.thresholds.virageSevere,
          modere: this._config.thresholds.virageModere,
          faible: this._config.thresholds.virageFaible
        });
        this._addEvent('virage', severite, lateralG);
        this._lastEventTime.virage = now;
        this._counters.viragesAgressifs++;
      }
    }

    // Detection exces de vitesse via GPS
    if (this._lastPosition && this._lastPosition.speed != null) {
      this._checkSpeedExcess(this._lastPosition.speed);
    }
  },

  _classifySeverity(value, thresholds) {
    if (value >= thresholds.severe) return 'severe';
    if (value >= thresholds.modere) return 'modere';
    return 'faible';
  },

  _addEvent(type, severite, valeur) {
    const event = {
      type,
      heure: new Date().toISOString(),
      severite,
      valeur: Math.round(valeur * 100) / 100,
      duree: 0,
      position: this._lastPosition
        ? { lat: this._lastPosition.lat, lng: this._lastPosition.lng }
        : null
    };

    this._eventBuffer.push(event);
    this._calculateLiveScore();

    // Notifier l'UI
    if (this._onEventCallback) {
      this._onEventCallback(event, this._counters, this._currentScore);
    }
  },

  _checkSpeedExcess(speedKmh) {
    const limit = this._config.thresholds.excesVitesse;
    const now = Date.now();

    if (speedKmh > limit) {
      if (!this._speedExcessStart) {
        this._speedExcessStart = now;
      } else if (now - this._speedExcessStart >= this._config.speedExcessMinDurationMs) {
        if (!this._lastEventTime.exces_vitesse || now - this._lastEventTime.exces_vitesse > 30000) {
          const excess = speedKmh - limit;
          const severite = excess > 30 ? 'severe' : excess > 15 ? 'modere' : 'faible';
          const event = {
            type: 'exces_vitesse',
            heure: new Date().toISOString(),
            severite,
            valeur: Math.round(speedKmh),
            duree: now - this._speedExcessStart,
            position: this._lastPosition
              ? { lat: this._lastPosition.lat, lng: this._lastPosition.lng }
              : null
          };
          this._eventBuffer.push(event);
          this._lastEventTime.exces_vitesse = now;
          this._counters.excesVitesse++;
          this._calculateLiveScore();

          if (this._onEventCallback) {
            this._onEventCallback(event, this._counters, this._currentScore);
          }

          this._speedExcessStart = null;
        }
      }
    } else {
      this._speedExcessStart = null;
    }
  },

  // =================== SCORE EN DIRECT ===================

  _calculateLiveScore() {
    let score = 100;
    const penaltyMap = {
      freinage: { faible: -2, modere: -3, severe: -5 },
      acceleration: { faible: -1, modere: -2, severe: -3 },
      virage: { faible: -2, modere: -3, severe: -4 },
      exces_vitesse: { faible: -3, modere: -5, severe: -8 }
    };

    for (const evt of this._eventBuffer) {
      const penalty = penaltyMap[evt.type];
      if (penalty) {
        score += penalty[evt.severite] || -2;
      }
    }

    this._currentScore = Math.max(0, Math.min(100, score));
  },

  // =================== ENVOI BATCH ===================

  async _sendBatch() {
    // Preparer les nouveaux evenements depuis le dernier envoi
    const newEvents = this._eventBuffer.slice(this._sentEventsCount);

    if (newEvents.length === 0 && !this._lastPosition) return;

    const batch = {
      evenements: newEvents,
      compteurs: { ...this._counters },
      gpsSample: this._lastPosition ? {
        heure: new Date().toISOString(),
        lat: this._lastPosition.lat,
        lng: this._lastPosition.lng,
        speed: this._lastPosition.speed,
        heading: this._lastPosition.heading
      } : null
    };

    if (typeof DriverStore !== 'undefined') {
      const result = await DriverStore.sendBehaviorEvents(batch);
      if (!result || result.error) {
        this._bufferOffline(batch);
      } else {
        this._sentEventsCount = this._eventBuffer.length;
      }
    } else {
      this._bufferOffline(batch);
    }
  },

  // =================== BUFFER OFFLINE ===================

  _bufferOffline(batch) {
    try {
      const key = 'volt_behavior_offline';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push(batch);
      // Garder max 50 batches (~50 minutes de donnees)
      if (existing.length > 50) existing.splice(0, existing.length - 50);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
      console.warn('[Behavior] Buffer offline plein');
    }
  },

  async _sendOfflineBuffer() {
    const key = 'volt_behavior_offline';
    try {
      const batches = JSON.parse(localStorage.getItem(key) || '[]');
      if (batches.length === 0) return;

      console.log(`[Behavior] Envoi de ${batches.length} batch(es) offline`);
      let allSent = true;
      for (const batch of batches) {
        if (typeof DriverStore !== 'undefined') {
          const result = await DriverStore.sendBehaviorEvents(batch);
          if (!result || result.error) {
            allSent = false;
            break;
          }
        }
      }
      if (allSent) {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('[Behavior] Erreur envoi buffer offline:', e);
    }
  }
};
