/**
 * SuiviVehiculesPage — position en direct des vehicules equipes d'un boitier GPS.
 *
 * La source est le boitier pose sur la voiture, pas le telephone du chauffeur :
 * le suivi ne depend ni de la batterie du telephone, ni de l'application
 * ouverte, ni d'une autorisation accordee.
 */
const SuiviVehiculesPage = {
  _map: null,
  _marqueurs: {},
  _minuteur: null,

  _filtre: 'all',
  _recherche: '',
  _selection: null,
  _generation: 0,
  _erreur: null,

  render() {
    this.destroy();
    const container = document.getElementById('page-content');
    container.replaceChildren();
    container.insertAdjacentHTML('beforeend', this._template());
    this._rafraichir();
    this._initCarte();
    this._minuteur = setInterval(() => this._rafraichir(), 60 * 1000);
    const btn = document.getElementById('sv-actualiser');
    btn.addEventListener('click', () => this._forcer(btn));
    document.getElementById('sv-search').value = this._recherche;
    document.getElementById('sv-search').addEventListener('input', e => { this._recherche = e.target.value; this._rafraichir(); });
    document.querySelectorAll('[data-sv-filter]').forEach(button => button.addEventListener('click', () => {
      this._filtre = button.dataset.svFilter; this._cadre = false; this._rafraichir();
    }));
    document.getElementById('sv-expand').addEventListener('click', (event) => {
      const panel = document.querySelector('.fleet-map-panel');
      const expanded = panel.classList.toggle('is-expanded');
      event.currentTarget.setAttribute('aria-pressed', String(expanded));
      event.currentTarget.setAttribute('aria-label', expanded ? 'Réduire la carte' : 'Agrandir la carte');
      this._map?.invalidateSize();
      this._cadre = false;
      this._placerMarqueurs(this._visibles());
    });
    document.getElementById('sv-expand').addEventListener('keydown', event => {
      if (event.key === 'Escape' && event.currentTarget.getAttribute('aria-pressed') === 'true') event.currentTarget.click();
    });
    document.getElementById('sv-fit').addEventListener('click', () => { this._cadre = false; this._placerMarqueurs(this._visibles()); });
  },

  destroy() {
    this._generation++;
    if (this._minuteur) { clearInterval(this._minuteur); this._minuteur = null; }
    if (this._map) { this._map.remove(); this._map = null; }
    this._marqueurs = {}; this._cadre = false;
  },

  _navigation(active) {
    return `<nav class="fleet-tabs" aria-label="Suivi et sécurité">
      ${[['suivi-vehicules', 'solar:map-point-wave-linear', 'Suivi des véhicules'], ['controle-conduite', 'solar:shield-check-linear', 'Contrôle de conduite']].filter(([route]) => typeof Auth === 'undefined' || !Auth.canAccessRoute || Auth.canAccessRoute('/' + route)).map(([route, icon, label]) => `<a href="#/${route}" class="${active === route ? 'is-active' : ''}"${active === route ? ' aria-current="page"' : ''}><iconify-icon icon="${icon}"></iconify-icon>${label}</a>`).join('')}
    </nav>`;
  },

  _template() {
    return `<div class="fleet-module">
      <header class="fleet-heading"><div><span class="fleet-eyebrow">PILOTAGE DE LA FLOTTE</span><h1>Votre flotte, <span>en un regard.</span></h1><p>Localisez vos véhicules et anticipez les prochaines recharges.</p></div><button class="fleet-primary" id="sv-actualiser"><iconify-icon icon="solar:refresh-linear"></iconify-icon> Actualiser</button></header>
      ${this._navigation('suivi-vehicules')}
      <div id="sv-stats" class="fleet-stats"></div>
      <div id="sv-alerte" role="status"></div>
      <div class="fleet-workspace">
        <aside class="fleet-sidebar"><div class="fleet-sidebar-heading"><h2>Mes véhicules <span id="sv-count"></span></h2><span class="fleet-eyebrow">BOÎTIERS GPS</span></div>
          <label class="fleet-search"><iconify-icon icon="solar:magnifer-linear"></iconify-icon><input id="sv-search" type="search" placeholder="Plaque, marque, modèle…" aria-label="Rechercher un véhicule"></label>
          <div class="fleet-filters" aria-label="Filtrer les véhicules"><button data-sv-filter="all">Tous</button><button data-sv-filter="moving">En route</button><button data-sv-filter="stopped">À l’arrêt</button><button data-sv-filter="offline">Sans signal récent</button><button data-sv-filter="battery">À recharger</button></div>
          <div id="sv-liste" class="fleet-vehicle-list"></div>
        </aside>
        <section class="fleet-map-panel" aria-label="Carte des véhicules"><div class="fleet-map-heading"><div><span class="fleet-map-emblem"><iconify-icon icon="solar:map-point-wave-linear"></iconify-icon></span><div><small class="fleet-map-eyebrow">EXPLORER LA FLOTTE</small><strong>Vos véhicules, en un regard</strong></div></div><button id="sv-fit"><iconify-icon icon="solar:map-point-rotate-linear"></iconify-icon> Recentrer</button><button id="sv-expand" aria-label="Agrandir la carte" aria-pressed="false"><iconify-icon icon="solar:maximize-linear"></iconify-icon></button></div>
          <div class="fleet-map-area"><div id="sv-map"></div><div class="fleet-map-compass" aria-hidden="true"><span>N</span><iconify-icon icon="solar:compass-linear"></iconify-icon></div><div id="sv-map-status" class="fleet-map-status" role="status">Chargement de la carte…</div></div>
          <div class="fleet-map-footer"><span><i class="moving"></i> En route</span><span><i class="stopped"></i> À l’arrêt</span><span><i class="offline"></i> Signal ancien</span><small>Position du boîtier · affichage actualisé chaque minute</small></div>
        </section>
      </div>
      <p class="fleet-footnote"><iconify-icon icon="solar:info-circle-linear"></iconify-icon> L’autonomie est une estimation. Le pourcentage relevé au tableau de bord reste la référence.</p>
    </div>`;
  },

  async _initCarte() {
    const el = document.getElementById('sv-map');
    const generation = this._generation;
    if (!el || this._map) return;
    try {
      if (typeof L === 'undefined' && typeof LazyLibs !== 'undefined') await LazyLibs.leaflet();
      if (generation !== this._generation || !el.isConnected) return;
      if (typeof L === 'undefined') throw new Error('Carte indisponible');
      this._map = L.map(el, { zoomControl: false }).setView([5.3600, -4.0083], 12);
      L.control.zoom({ position: 'bottomright' }).addTo(this._map);
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(this._map);
      const status = document.getElementById('sv-map-status');
      let tileFailed = false;
      tiles.on('tileerror', () => { tileFailed = true; if (status.isConnected) { status.hidden = false; status.textContent = 'Fond de carte indisponible. Les positions restent accessibles dans la liste.'; } });
      tiles.on('load', () => { if (status.isConnected && !tileFailed) status.hidden = true; });
      status.hidden = true;
      this._rafraichir();
    } catch (error) {
      if (generation !== this._generation) return;
      const status = document.getElementById('sv-map-status');
      if (status) { status.textContent = 'La carte n’a pas pu être chargée. '; const retry = document.createElement('button'); retry.textContent = 'Réessayer'; retry.addEventListener('click', () => this._initCarte()); status.appendChild(retry); }
    }
  },

  async _forcer(btn) {
    if (btn.disabled) return;
    const generation = this._generation;
    btn.disabled = true; btn.textContent = 'Actualisation…';
    try {
      const result = await Store.synchroniserPositions();
      if (result && result.error) throw new Error(result.error);
      await Store.rechargerCollection('vehicules');
      if (generation === this._generation) { this._erreur = null; this._rafraichir(); }
    } catch (error) {
      if (generation === this._generation) { this._erreur = error.message || String(error); this._rafraichir(); }
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.replaceChildren(); btn.insertAdjacentHTML('beforeend', '<iconify-icon icon="solar:refresh-linear"></iconify-icon> Actualiser'); }
    }
  },

  _equipes() { return (Store.get('vehicules') || []).filter(v => v.gpsCarId); },

  _ancien(v) {
    const p = v.gpsPosition;
    const date = p && p.vuLe ? new Date(p.vuLe).getTime() : NaN;
    return !p || !p.enLigne || !Number.isFinite(date) || Date.now() - date > 20 * 60000;
  },

  _positionValide(v) {
    const p = v.gpsPosition;
    return !!p && p.lat != null && p.lng != null && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180;
  },

  _visibles() {
    const query = this._recherche.trim().toLocaleLowerCase('fr');
    return this._equipes().filter(v => {
      if (query && ![v.immatriculation, v.marque, v.modele].filter(Boolean).join(' ').toLocaleLowerCase('fr').includes(query)) return false;
      if (this._filtre === 'moving') return this._etat(v).roule;
      if (this._filtre === 'stopped') return !this._ancien(v) && !this._etat(v).roule;
      if (this._filtre === 'offline') return this._ancien(v);
      if (this._filtre === 'battery') { const a = this._autonomie(v); return a && a.pct <= 15; }
      return true;
    });
  },

  _rafraichir() {
    if (!document.getElementById('sv-liste')) return;
    const equipes = this._equipes();
    const visibles = this._visibles();
    const stats = document.getElementById('sv-stats');
    const low = equipes.filter(v => { const a = this._autonomie(v); return a && a.pct <= 15; }).length;
    stats.replaceChildren();
    stats.insertAdjacentHTML('beforeend', [
      ['all', 'Véhicules équipés', equipes.length, 'solar:wheel-linear', 'coral'],
      ['moving', 'En route', equipes.filter(v => this._etat(v).roule).length, 'solar:routing-linear', 'mint'],
      ['offline', 'Sans signal récent', equipes.filter(v => this._ancien(v)).length, 'solar:wi-fi-router-minimalistic-linear', 'blue'],
      ['battery', 'À recharger', low, 'solar:battery-low-linear', 'amber']
    ].map(([filter, label, count, icon, tone]) => `<button class="fleet-stat ${tone}" data-stat-filter="${filter}"><span>${label}<iconify-icon icon="${icon}"></iconify-icon></span><strong>${count}</strong><small>${filter === 'battery' ? 'Estimation ≤ 15 %' : filter === 'offline' ? 'Hors ligne ou plus de 20 min' : filter === 'moving' ? 'Dernier signal de moins de 20 min' : 'Reliés à un boîtier GPS'}<iconify-icon icon="solar:arrow-right-linear"></iconify-icon></small></button>`).join(''));
    stats.querySelectorAll('[data-stat-filter]').forEach(button => button.addEventListener('click', () => { this._filtre = button.dataset.statFilter; this._cadre = false; this._rafraichir(); }));
    const alerte = document.getElementById('sv-alerte');
    alerte.textContent = this._erreur ? 'Le service GPS est indisponible : ' + this._erreur + '. Les dernières positions connues sont conservées.' : !equipes.length ? 'Aucun boîtier relié. Ajoutez son identifiant depuis la fiche d’un véhicule pour commencer le suivi.' : '';
    alerte.hidden = !alerte.textContent;
    document.getElementById('sv-count').textContent = `${visibles.length} / ${equipes.length}`;
    document.querySelectorAll('[data-sv-filter]').forEach(button => { const active = button.dataset.svFilter === this._filtre; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    this._rendreListe(visibles);
    this._placerMarqueurs(visibles);
  },

  /** Un boitier peut etre en ligne sans avoir bouge : on distingue les deux. */
  _etat(v) {
    const p = v.gpsPosition || null;
    if (!p) return { libelle: 'Aucun signal', couleur: '#94a3b8', roule: false };
    if (!p.enLigne) return { libelle: 'Hors ligne', couleur: '#b91c1c', roule: false };
    if (this._ancien(v)) return { libelle: 'Signal ancien', couleur: '#7c89a3', roule: false };
    if (p.contact && (p.vitesse || 0) > 3) {
      return { libelle: 'En route', couleur: '#02b3a9', roule: true };
    }
    if (p.contact) return { libelle: 'Allumée, à l\'arrêt', couleur: '#b45309', roule: false };
    return { libelle: 'À l\'arrêt', couleur: '#4a43c2', roule: false };
  },

  /**
   * Autonomie ESTIMEE : autonomie reelle - km parcourus depuis la charge.
   * Le boitier ne lit pas la batterie de traction ; cette estimation repond
   * neanmoins a la question utile — la voiture tiendra-t-elle la journee ?
   * Marge d'erreur ~10 % (climatisation, trafic).
   */
  _autonomie(v) {
    if (!v.derniereChargeLe || v.kmDepuisCharge == null) return null;
    const capacite = Number(v.autonomieReelleKm) > 0 ? Number(v.autonomieReelleKm) : 250;
    const km = Math.max(0, Number(v.kmDepuisCharge) || 0);
    const reste = Math.max(0, capacite - km);
    const pct = Math.round(reste / capacite * 100);
    return {
      km, reste: Math.round(reste), pct,
      couleur: pct > 40 ? '#02b3a9' : pct > 15 ? '#b45309' : '#b91c1c',
      libelle: pct > 40 ? 'Batterie estimée' : pct > 15 ? 'À recharger bientôt' : 'À recharger',
    };
  },

  /**
   * Releve manuel du pourcentage affiche au tableau de bord du vehicule.
   * C'est la verite terrain : elle se traduit en « km deja consommes »
   * (decalage), et sert a CALIBRER l'autonomie reelle quand l'ecart entre
   * l'estimation et le releve est significatif.
   */
  _saisirPourcentage(id) {
    const v = (Store.get('vehicules') || []).find(x => x.id === id);
    if (!v) return;
    Modal.form(
      '<iconify-icon icon="solar:battery-half-bold-duotone" class="text-blue"></iconify-icon> Batterie réelle — ' + Utils.escHtml(v.immatriculation || id),
      `<div style="font-size:var(--font-size-sm);">
        <label style="font-weight:700;display:block;margin-bottom:5px;">Pourcentage affiché au tableau de bord</label>
        <input id="bat-pct" type="number" min="0" max="100" step="1" class="form-control"
               placeholder="Ex : 62" style="font-size:1.3rem;text-align:center;">
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:8px;line-height:1.5;">
          Recopiez simplement le chiffre du tableau de bord. L'estimation repartira de cette valeur.
        </div>
      </div>`,
      () => {
        const pct = parseInt((document.getElementById('bat-pct') || {}).value, 10);
        if (!(pct >= 0 && pct <= 100)) { Toast.error('Entrez un pourcentage entre 0 et 100.'); return false; }
        const capacite = Number(v.autonomieReelleKm) > 0 ? Number(v.autonomieReelleKm) : 250;
        const decalage = Math.round(capacite * (100 - pct)) / 100;
        const maj = {
          derniereChargeLe: new Date().toISOString(),
          kmDepuisCharge: decalage,
          kmOffsetCharge: decalage,
          chargeMarqueePar: 'Relevé manuel (' + pct + ' %)',
        };

        // Calibrage : l'ancre precedente venait d'une charge pleine et des
        // kilometres ont ete roules — le releve revele la consommation REELLE.
        const kmRoules = Number(v.kmDepuisCharge) || 0;
        const source = v.chargeMarqueePar || '';
        const calibrable = kmRoules >= 30 && pct < 95 && !/Relevé manuel/.test(source);
        const implique = calibrable ? Math.round(kmRoules * 100 / (100 - pct)) : null;
        const ecartRelatif = implique ? Math.abs(implique - capacite) / capacite : 0;

        Store.update('vehicules', id, maj);
        Toast.success(`Batterie de ${v.immatriculation || id} relevée à ${pct} %.`);
        this._rafraichir();

        if (implique && ecartRelatif > 0.1 && implique >= 120 && implique <= 500) {
          Modal.confirm('Ajuster l\'autonomie réelle ?',
            `Sur cette charge : <strong>${kmRoules.toFixed(0)} km</strong> ont consommé <strong>${100 - pct} %</strong>, soit une autonomie réelle d'environ <strong>${implique} km</strong> (réglage actuel : ${capacite} km).<br><br>Utiliser ${implique} km pour les prochaines estimations ?`,
            () => {
              Store.update('vehicules', id, { autonomieReelleKm: implique });
              Toast.success(`Autonomie de ${v.immatriculation || id} calibrée à ${implique} km.`);
              this._rafraichir();
            });
        }
      },
      'small'
    );
  },

  /** Marque le vehicule comme recharge : le compteur repart de zero. */
  _marquerChargee(id) {
    const v = (Store.get('vehicules') || []).find(x => x.id === id);
    if (!v) return;
    // Confirmation : un clic par erreur remettrait le compteur a zero et
    // afficherait une batterie pleine sur une voiture a plat.
    Modal.confirm(
      'Recharge effectuée ?',
      `Confirmer que <strong>${Utils.escHtml(v.immatriculation || id)}</strong> vient d'être rechargée. Le compteur d'autonomie repartira de 100 %.`,
      () => {
        Store.update('vehicules', id, { derniereChargeLe: new Date().toISOString(), kmDepuisCharge: 0, kmOffsetCharge: 0, chargeMarqueePar: 'Administration' });
        Toast.success(`${v.immatriculation || id} marquée comme rechargée.`);
        this._rafraichir();
      }
    );
  },

  _depuis(iso) {
    if (!iso) return 'jamais';
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'à l\'instant';
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.round(h / 24)} j`;
  },

  _rendreListe(equipes) {
    const zone = document.getElementById('sv-liste');
    if (!zone) return;
    const opened = new Set([...zone.querySelectorAll('details[open]')].map(d => d.dataset.vehicleDetails));
    zone.replaceChildren();
    if (!equipes.length) {
      zone.insertAdjacentHTML('beforeend', '<div class="fleet-empty"><iconify-icon icon="solar:map-point-search-linear"></iconify-icon><h3>Aucun véhicule à afficher</h3><p>Choisissez un autre filtre ou modifiez votre recherche.</p><button id="sv-reset">Voir tous les véhicules</button></div>');
      document.getElementById('sv-reset').addEventListener('click', () => { this._filtre = 'all'; this._recherche = ''; document.getElementById('sv-search').value = ''; this._rafraichir(); });
      return;
    }
    zone.insertAdjacentHTML('beforeend', equipes.map(v => {
      const p = v.gpsPosition || {};
      const e = this._etat(v);
      const a = this._autonomie(v);
      const ancien = this._ancien(v);
      return `<article class="fleet-vehicle${this._selection === v.id ? ' is-selected' : ''}">
        <button class="fleet-vehicle-select" data-center="${Utils.escHtml(v.id)}" aria-pressed="${this._selection === v.id}"><span class="fleet-car-icon" style="--state:${e.couleur}"><iconify-icon icon="solar:wheel-linear"></iconify-icon></span><span><strong>${Utils.escHtml(v.immatriculation || v.id)}</strong><small>${Utils.escHtml([v.marque, v.modele].filter(Boolean).join(' ') || 'Véhicule équipé')}</small></span><iconify-icon class="fleet-locate-icon" icon="solar:map-point-linear"></iconify-icon></button>
        <div class="fleet-vehicle-state"><span style="--state:${e.couleur}"><i></i>${e.libelle}</span>${e.roule ? `<b>${Math.round(p.vitesse || 0)} <small>km/h</small></b>` : ''}</div>
        <p class="fleet-last-seen${ancien ? ' is-old' : ''}"><iconify-icon icon="solar:clock-circle-linear"></iconify-icon>Dernier signal ${this._depuis(p.vuLe)}${ancien ? ' · position ancienne' : ''}</p>
        <div class="fleet-battery">${a ? `<div><span><iconify-icon icon="solar:battery-charge-linear"></iconify-icon> Autonomie estimée</span><strong style="color:${a.couleur}">~${a.pct}<small> %</small></strong></div><div class="fleet-battery-track"><span style="width:${a.pct}%;background:${a.couleur}"></span></div><p><strong>~${a.reste} km</strong> restants${a.pct <= 15 ? '<span class="fleet-charge-warning">Recharge à prévoir</span>' : ''}</p>` : '<p class="fleet-no-battery">Autonomie non renseignée. Relevez le pourcentage ou confirmez une recharge.</p>'}</div>
        <div class="fleet-vehicle-actions"><button data-battery="${Utils.escHtml(v.id)}"><iconify-icon icon="solar:pen-linear"></iconify-icon> Relever la batterie</button><button data-charge="${Utils.escHtml(v.id)}"><iconify-icon icon="solar:bolt-linear"></iconify-icon> Recharge faite</button></div>
        <details class="fleet-details" data-vehicle-details="${Utils.escHtml(v.id)}"${opened.has(v.id) ? ' open' : ''}><summary>Détails du boîtier et de la charge</summary><p>${p.tension != null ? `Tension du boîtier : ${Number(p.tension).toFixed(1).replace('.', ',')} V<br>` : ''}${this._positionValide(v) ? `Coordonnées : ${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : 'Position indisponible'}</p>${a ? `<p>${a.km.toFixed(1).replace('.', ',')} km depuis la charge du ${new Date(v.derniereChargeLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${v.chargeMarqueePar ? ' · ' + Utils.escHtml(v.chargeMarqueePar) : ''}.</p>` : ''}</details>
      </article>`;
    }).join(''));
    zone.querySelectorAll('[data-center]').forEach(button => button.addEventListener('click', () => this._centrer(button.dataset.center)));
    zone.querySelectorAll('[data-battery]').forEach(button => button.addEventListener('click', () => this._saisirPourcentage(button.dataset.battery)));
    zone.querySelectorAll('[data-charge]').forEach(button => button.addEventListener('click', () => this._marquerChargee(button.dataset.charge)));
  },

  /**
   * Repère directionnel, coloré selon l’état et orienté selon la
   * direction transmise par le boîtier (0° = nord). L'immatriculation reste
   * en étiquette sous la voiture : sur une carte, la plaque est le seul
   * moyen de savoir de quel véhicule il s'agit.
   */
  _iconeVoiture(v, e, p) {
    const plaque = Utils.escHtml(v.immatriculation || '');
    const heading = Number.isFinite(Number(p.direction)) ? Number(p.direction) : 0;
    return `<div class="fleet-map-marker" style="--marker-color:${e.couleur}"><div class="fleet-marker-halo"></div><div class="fleet-marker-pin"><svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${heading}deg)"><path d="M12 3 20 20 12 16 4 20Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"/></svg></div><div class="fleet-marker-label"><i></i>${plaque}</div></div>`;
  },

  _placerMarqueurs(equipes) {
    if (!this._map || typeof L === 'undefined') return;
    const visibleIds = new Set(equipes.filter(v => this._positionValide(v)).map(v => v.id));
    Object.keys(this._marqueurs).forEach(id => { if (!visibleIds.has(id)) { this._map.removeLayer(this._marqueurs[id]); delete this._marqueurs[id]; } });
    const points = [];
    equipes.forEach(v => {
      const p = v.gpsPosition;
      if (!this._positionValide(v)) return;
      const e = this._etat(v);
      const icone = L.divIcon({
        className: '',
        html: this._iconeVoiture(v, e, p),
        iconSize: [120, 72],
        iconAnchor: [60, 24],     // la pointe du reticule = le centre de la voiture
        popupAnchor: [0, -16]
      });
      if (this._marqueurs[v.id]) {
        this._marqueurs[v.id].setLatLng([p.lat, p.lng]).setIcon(icone);
      } else {
        this._marqueurs[v.id] = L.marker([p.lat, p.lng], { icon: icone, title: v.immatriculation || 'Véhicule' }).addTo(this._map);
        this._marqueurs[v.id].on('click', () => { this._selection = v.id; this._rendreListe(this._visibles()); const button = [...document.querySelectorAll('[data-center]')].find(b => b.dataset.center === v.id); button?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
      }
      this._marqueurs[v.id].bindPopup(
        `<div class="fleet-map-popup"><span class="fleet-popup-eyebrow">POSITION DU VÉHICULE</span><strong>${Utils.escHtml(v.immatriculation || '')}</strong><span class="fleet-popup-state" style="--marker-color:${e.couleur}">${e.libelle}</span><small>Dernier signal · ${this._depuis(p.vuLe)}</small></div>`);
      points.push([p.lat, p.lng]);
    });
    // On ne recadre qu'au premier affichage, pour ne pas deplacer la carte
    // sous les yeux de l'utilisateur a chaque rafraichissement.
    if (points.length && !this._cadre) {
      this._cadre = true;
      if (points.length === 1) this._map.setView(points[0], 15);
      else this._map.fitBounds(points, { padding: [40, 40] });
    }
  },

  _centrer(id) {
    const v = this._equipes().find(x => x.id === id);
    if (!v) return;
    this._selection = id;
    this._rendreListe(this._visibles());
    if (!this._positionValide(v)) { Toast.info('Aucune position disponible pour ce véhicule.'); return; }
    if (!this._map) { Toast.info('La carte est en cours de chargement.'); return; }
    this._map.setView([v.gpsPosition.lat, v.gpsPosition.lng], 16);
    if (this._marqueurs[id]) this._marqueurs[id].openPopup();
    if (window.innerWidth <= 900) document.querySelector('.fleet-map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
