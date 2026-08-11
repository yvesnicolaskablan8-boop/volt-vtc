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

  render() {
    const container = document.getElementById('page-content');
    container.innerHTML = this._template();
    // La liste s'affiche tout de suite ; les marqueurs attendent que la carte
    // soit REELLEMENT prete. Sans cela, le premier trace partait avant la fin
    // du chargement de Leaflet et la carte restait vide une minute entiere.
    this._rafraichir();
    this._initCarte().then(() => this._rafraichir());
    // Meme rythme que la synchronisation : inutile d'aller plus vite, les
    // boitiers eux-memes n'emettent pas en continu.
    if (this._minuteur) clearInterval(this._minuteur);
    this._minuteur = setInterval(() => this._rafraichir(), 60 * 1000);
    const btn = document.getElementById('sv-actualiser');
    if (btn) btn.addEventListener('click', () => this._forcer(btn));
    const az = document.getElementById('sv-ajouter-zone');
    if (az) az.addEventListener('click', () => {
      this._modeAjoutZone = !this._modeAjoutZone;
      az.classList.toggle('btn-primary', this._modeAjoutZone);
      az.innerHTML = this._modeAjoutZone
        ? '<iconify-icon icon="solar:cursor-bold-duotone"></iconify-icon> Cliquez sur la carte à l\'emplacement de la borne...'
        : '<iconify-icon icon="solar:map-point-add-bold-duotone"></iconify-icon> Ajouter — puis cliquez sur la carte';
    });
    this._rendreZones();
  },

  destroy() {
    if (this._minuteur) { clearInterval(this._minuteur); this._minuteur = null; }
    if (this._map) { this._map.remove(); this._map = null; this._marqueurs = {}; }
  },

  _template() {
    return `
      <div class="page-header">
        <h1><iconify-icon icon="solar:map-point-wave-bold-duotone"></iconify-icon> Suivi des véhicules</h1>
        <div class="page-actions">
          <button class="btn btn-sm btn-primary" id="sv-actualiser">
            <iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Actualiser
          </button>
        </div>
      </div>
      <div class="d-sub" style="margin-bottom:var(--space-md);">
        Position transmise par le boîtier posé sur le véhicule. Actualisée automatiquement chaque minute.
      </div>
      <div id="sv-alerte"></div>
      <div class="d-grid" style="grid-template-columns:minmax(260px,340px) 1fr;gap:var(--space-lg);align-items:start;">
        <div>
          <div id="sv-liste"></div>
          <div class="card" style="padding:13px 15px;">
            <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px;">Zones de recharge</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);line-height:1.55;margin-bottom:10px;">
              Une voiture immobile assez longtemps dans une zone est marquée rechargée automatiquement.
            </div>
            <div id="sv-zones"></div>
            <button class="btn btn-sm btn-secondary" id="sv-ajouter-zone" style="width:100%;margin-top:8px;">
              <iconify-icon icon="solar:map-point-add-bold-duotone"></iconify-icon> Ajouter — puis cliquez sur la carte
            </button>
          </div>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <div id="sv-map" style="height:520px;width:100%;"></div>
        </div>
      </div>`;
  },

  async _initCarte() {
    const el = document.getElementById('sv-map');
    if (!el || this._map) return;
    if (typeof L === 'undefined' && typeof LazyLibs !== 'undefined') await LazyLibs.leaflet();
    if (typeof L === 'undefined') return;
    this._map = L.map(el).setView([5.3600, -4.0083], 12);   // Abidjan
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(this._map);
    this._map.on('click', (ev) => {
      if (this._modeAjoutZone) this._creerZone(ev.latlng.lat, ev.latlng.lng);
    });
    this._dessinerZones();
  },

  _zones() {
    const st = Store.get('settings') || {};
    return Array.isArray(st.zonesRecharge) ? st.zonesRecharge : [];
  },

  _sauverZones(zones) {
    const st = Store.get('settings') || {};
    Store.set('settings', { ...st, zonesRecharge: zones });
    this._rendreZones();
    this._dessinerZones();
  },

  _creerZone(lat, lng) {
    this._modeAjoutZone = false;
    const az = document.getElementById('sv-ajouter-zone');
    if (az) { az.classList.remove('btn-primary'); az.innerHTML = '<iconify-icon icon="solar:map-point-add-bold-duotone"></iconify-icon> Ajouter — puis cliquez sur la carte'; }
    Modal.form(
      '<iconify-icon icon="solar:map-point-add-bold-duotone" class="text-blue"></iconify-icon> Nouvelle zone de recharge',
      `<div style="font-size:var(--font-size-sm);">
        <label style="font-weight:700;display:block;margin-bottom:4px;">Nom de la zone</label>
        <input id="zn-nom" class="form-control" placeholder="Ex : Dépôt Riviera" style="margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div><label style="font-size:var(--font-size-xs);font-weight:600;display:block;margin-bottom:4px;">Rayon (mètres)</label>
            <input id="zn-rayon" class="form-control" type="number" value="120" min="30" step="10"></div>
          <div><label style="font-size:var(--font-size-xs);font-weight:600;display:block;margin-bottom:4px;">Durée minimale (min)</label>
            <input id="zn-duree" class="form-control" type="number" value="45" min="10" step="5"></div>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:9px;line-height:1.5;">
          Position : ${lat.toFixed(5)}, ${lng.toFixed(5)}. Une voiture immobile plus de cette durée dans le rayon sera marquée rechargée.
        </div>
      </div>`,
      () => {
        const nom = ((document.getElementById('zn-nom') || {}).value || '').trim();
        if (!nom) { Toast.error('Donnez un nom à la zone.'); return false; }
        const zones = this._zones().concat([{
          id: 'ZN-' + Date.now().toString(36),
          nom,
          lat, lng,
          rayon: Math.max(30, parseInt((document.getElementById('zn-rayon') || {}).value, 10) || 120),
          dureeMin: Math.max(10, parseInt((document.getElementById('zn-duree') || {}).value, 10) || 45),
        }]);
        this._sauverZones(zones);
        Toast.success(`Zone « ${nom} » créée.`);
      },
      'small'
    );
  },

  _supprimerZone(id) {
    const z = this._zones().find(x => x.id === id);
    if (!z) return;
    Modal.confirm('Supprimer la zone',
      `Supprimer « ${Utils.escHtml(z.nom)} » ? Les recharges n'y seront plus détectées automatiquement.`,
      () => { this._sauverZones(this._zones().filter(x => x.id !== id)); });
  },

  _rendreZones() {
    const zone = document.getElementById('sv-zones');
    if (!zone) return;
    const zs = this._zones();
    zone.innerHTML = zs.length ? zs.map(z => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-color);font-size:var(--font-size-sm);">
        <iconify-icon icon="solar:bolt-circle-bold-duotone" style="color:#16a34a;flex:none;"></iconify-icon>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;">${Utils.escHtml(z.nom)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${z.rayon} m · ${z.dureeMin} min</div>
        </div>
        <button class="btn btn-sm btn-secondary" title="Supprimer" onclick="SuiviVehiculesPage._supprimerZone('${z.id}')" style="color:#b91c1c;">
          <iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon>
        </button>
      </div>`).join('')
      : '<div style="font-size:var(--font-size-xs);color:var(--text-muted);">Aucune zone. Déclarez le dépôt ou la borne où les voitures se rechargent.</div>';
  },

  _dessinerZones() {
    if (!this._map || typeof L === 'undefined') return;
    (this._cerclesZones || []).forEach(c => { try { this._map.removeLayer(c); } catch (e) {} });
    this._cerclesZones = this._zones().map(z =>
      L.circle([z.lat, z.lng], {
        radius: z.rayon || 120,
        color: '#16a34a', weight: 2, fillColor: '#16a34a', fillOpacity: 0.12,
      }).addTo(this._map).bindTooltip(`⚡ ${z.nom}`)
    );
  },

  async _forcer(btn) {
    const avant = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> Actualisation...';
    const r = await Store.synchroniserPositions();
    if (r && !r.error) { await Store.rechargerCollection('vehicules'); }
    btn.disabled = false; btn.innerHTML = avant;
    this._rafraichir(r && r.error ? r.error : null);
  },

  _equipes() {
    return (Store.get('vehicules') || []).filter(v => v.gpsCarId);
  },

  _rafraichir(erreur) {
    const equipes = this._equipes();
    const alerte = document.getElementById('sv-alerte');
    if (alerte) {
      if (erreur) {
        alerte.innerHTML = `<div style="padding:11px 13px;border-radius:10px;background:rgba(180,83,9,.08);border:1px solid rgba(180,83,9,.25);color:#b45309;font-size:var(--font-size-sm);margin-bottom:12px;">Impossible de joindre le service GPS : ${Utils.escHtml(String(erreur))}</div>`;
      } else if (!equipes.length) {
        alerte.innerHTML = `<div style="padding:11px 13px;border-radius:10px;background:rgba(37,99,235,.07);border:1px solid rgba(37,99,235,.2);color:#1d4ed8;font-size:var(--font-size-sm);margin-bottom:12px;">Aucun véhicule n'est encore relié à un boîtier GPS. Renseignez l'identifiant du boîtier sur la fiche du véhicule.</div>`;
      } else {
        alerte.innerHTML = '';
      }
    }
    this._rendreListe(equipes);
    this._placerMarqueurs(equipes);
  },

  /** Un boitier peut etre en ligne sans avoir bouge : on distingue les deux. */
  _etat(v) {
    const p = v.gpsPosition || null;
    if (!p) return { libelle: 'Aucun signal', couleur: '#94a3b8', roule: false };
    if (!p.enLigne) return { libelle: 'Hors ligne', couleur: '#b91c1c', roule: false };
    if (p.contact && (p.vitesse || 0) > 3) return { libelle: 'En route', couleur: '#15803d', roule: true };
    if (p.contact) return { libelle: 'Moteur tournant, à l\'arrêt', couleur: '#b45309', roule: false };
    return { libelle: 'À l\'arrêt', couleur: '#2563eb', roule: false };
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
      couleur: pct > 40 ? '#15803d' : pct > 15 ? '#b45309' : '#b91c1c',
      libelle: pct > 40 ? 'Batterie estimée' : pct > 15 ? 'À recharger bientôt' : 'À recharger',
    };
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
        Store.update('vehicules', id, { derniereChargeLe: new Date().toISOString(), kmDepuisCharge: 0, chargeMarqueePar: 'Administration' });
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
    if (!equipes.length) { zone.innerHTML = ''; return; }
    zone.innerHTML = equipes.map(v => {
      const p = v.gpsPosition || {};
      const e = this._etat(v);
      return `<div class="card" style="padding:13px 15px;margin-bottom:10px;cursor:pointer;" onclick="SuiviVehiculesPage._centrer('${v.id}')">
        <div style="display:flex;align-items:center;gap:9px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${e.couleur};flex:none;"></span>
          <strong style="flex:1;">${Utils.escHtml(v.immatriculation || v.id)}</strong>
          <span style="font-size:var(--font-size-xs);font-weight:700;color:${e.couleur};">${e.libelle}</span>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:6px;line-height:1.6;">
          ${e.roule ? `<strong>${Math.round(p.vitesse || 0)} km/h</strong> · ` : ''}Vu ${this._depuis(p.vuLe)}${p.tension != null ? ` · ${Number(p.tension).toFixed(1).replace('.', ',')} V` : ''}
          ${p.lat != null ? `<br>${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : ''}
        </div>
        ${(() => {
          const a = this._autonomie(v);
          if (!a) return `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color);font-size:var(--font-size-xs);color:var(--text-muted);display:flex;align-items:center;gap:8px;">
            <span style="flex:1;">Autonomie non suivie — marquez la prochaine recharge.</span>
            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();SuiviVehiculesPage._marquerChargee('${v.id}')">Chargée</button>
          </div>`;
          return `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color);">
            <div style="display:flex;align-items:center;gap:8px;font-size:var(--font-size-xs);">
              <span style="font-weight:800;color:${a.couleur};">${a.libelle} ~${a.pct} %</span>
              <span style="flex:1;color:var(--text-muted);">reste ~${a.reste} km</span>
              <button class="btn btn-sm btn-secondary" title="Recharge effectuée" onclick="event.stopPropagation();SuiviVehiculesPage._marquerChargee('${v.id}')">Chargée</button>
            </div>
            <div style="height:7px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;margin-top:6px;">
              <div style="height:100%;width:${a.pct}%;background:${a.couleur};border-radius:4px;transition:width .4s;"></div>
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;">${a.km.toFixed(1).replace('.', ',')} km depuis la charge du ${new Date(v.derniereChargeLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${v.chargeMarqueePar ? ' (' + Utils.escHtml(v.chargeMarqueePar) + ')' : ''} — estimation</div>
          </div>`;
        })()}
      </div>`;
    }).join('');
  },

  /**
   * Voiture vue de dessus, colorée selon l'état et orientée selon la
   * direction transmise par le boîtier (0° = nord). L'immatriculation reste
   * en étiquette sous la voiture : sur une carte, la plaque est le seul
   * moyen de savoir de quel véhicule il s'agit.
   */
  _iconeVoiture(v, e, p) {
    const rot = Number(p && p.direction) || 0;
    const plaque = Utils.escHtml(v.immatriculation || '');
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <div style="transform:rotate(${rot}deg);transition:transform .5s ease;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));">
        <svg width="26" height="40" viewBox="0 0 24 40" xmlns="http://www.w3.org/2000/svg">
          <!-- roues -->
          <rect x="1.2" y="6.5"  width="4" height="7" rx="2" fill="#1e293b"/>
          <rect x="18.8" y="6.5" width="4" height="7" rx="2" fill="#1e293b"/>
          <rect x="1.2" y="26.5" width="4" height="7" rx="2" fill="#1e293b"/>
          <rect x="18.8" y="26.5" width="4" height="7" rx="2" fill="#1e293b"/>
          <!-- carrosserie -->
          <path d="M5 7 C5 2.8 8.2 1 12 1 C15.8 1 19 2.8 19 7 L19 33 C19 37.2 15.8 39 12 39 C8.2 39 5 37.2 5 33 Z"
                fill="${e.couleur}" stroke="#ffffff" stroke-width="1.6"/>
          <!-- pare-brise et lunette -->
          <path d="M7 10.5 L17 10.5 L15.8 16 L8.2 16 Z" fill="rgba(255,255,255,.85)"/>
          <path d="M8.2 28 L15.8 28 L16.6 32.5 L7.4 32.5 Z" fill="rgba(255,255,255,.6)"/>
        </svg>
      </div>
      <div style="background:${e.couleur};color:#fff;border-radius:7px;padding:1px 6px;font-size:10px;font-weight:800;white-space:nowrap;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);">${plaque}</div>
    </div>`;
  },

  _placerMarqueurs(equipes) {
    if (!this._map || typeof L === 'undefined') return;
    const points = [];
    equipes.forEach(v => {
      const p = v.gpsPosition;
      if (!p || p.lat == null || p.lng == null) return;
      const e = this._etat(v);
      const icone = L.divIcon({
        className: '',
        html: this._iconeVoiture(v, e, p),
        iconSize: [64, 62],
        iconAnchor: [32, 21],     // la pointe du reticule = le centre de la voiture
        popupAnchor: [0, -16]
      });
      if (this._marqueurs[v.id]) {
        this._marqueurs[v.id].setLatLng([p.lat, p.lng]).setIcon(icone);
      } else {
        this._marqueurs[v.id] = L.marker([p.lat, p.lng], { icon: icone }).addTo(this._map);
      }
      this._marqueurs[v.id].bindPopup(
        `<strong>${Utils.escHtml(v.immatriculation || '')}</strong><br>${e.libelle}<br>Vu ${this._depuis(p.vuLe)}`);
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
    if (!v || !v.gpsPosition || v.gpsPosition.lat == null || !this._map) return;
    this._map.setView([v.gpsPosition.lat, v.gpsPosition.lng], 16);
    if (this._marqueurs[id]) this._marqueurs[id].openPopup();
  }
};
