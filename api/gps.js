/**
 * Suivi GPS des vehicules via WhatsGPS.
 *
 * Le boitier est pose sur la VOITURE : le suivi ne depend plus du telephone du
 * chauffeur, de sa batterie, de l'application ouverte ni d'une autorisation
 * accordee. C'est ce qui rend inutile le plugin natif qui faisait planter
 * l'application chauffeur.
 *
 *   GET ?action=positions   Ecrit la position de chaque vehicule equipe
 *   GET ?action=boitiers    Liste les boitiers du compte (pour rattachement)
 */
const {
  verifyAuth, isAdmin, getToken, supabaseQuery, supabaseUpsert,
  setCors, handleOptions, setRequestToken,
} = require('./_lib/helpers');

let _session = null;   // { token, expire } — reutilise entre deux appels

/** Identifiants WhatsGPS, lus avec le jeton de l'appelant (RLS). */
async function lireIdentifiants(token) {
  const rows = await supabaseQuery('fleet_settings', 'select=integrations&limit=1', token);
  const w = rows && rows[0] && rows[0].integrations && rows[0].integrations.whatsgps;
  if (!w || !w.compte || !w.motDePasse) {
    throw new Error('Identifiants WhatsGPS absents des parametres');
  }
  return w;
}

/**
 * Ouvre une session WhatsGPS. Le jeton est garde en memoire une heure : cette
 * API s'authentifie par mot de passe, inutile de le rejouer a chaque appel.
 */
async function ouvrirSession(creds) {
  if (_session && _session.expire > Date.now()) return _session.token;
  const base = creds.baseUrl || 'https://www.whatsgps.com';
  const url = `${base}/user/login.do?name=${encodeURIComponent(creds.compte)}&password=${encodeURIComponent(creds.motDePasse)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WhatsGPS login HTTP ${res.status}`);
  const data = await res.json();
  if (data.ret !== 1 || !data.data || !data.data.token) {
    throw new Error('WhatsGPS : identifiants refuses');
  }
  _session = { token: data.data.token, expire: Date.now() + 55 * 60 * 1000 };
  return _session.token;
}

async function appel(creds, jeton, chemin, params) {
  const base = creds.baseUrl || 'https://www.whatsgps.com';
  const qs = new URLSearchParams({ ...params, token: jeton }).toString();
  const res = await fetch(`${base}${chemin}?${qs}`);
  if (!res.ok) throw new Error(`WhatsGPS ${chemin} HTTP ${res.status}`);
  const data = await res.json();
  if (data.ret !== 1) throw new Error(`WhatsGPS ${chemin} : reponse ${data.ret}`);
  return data.data;
}

// ---------- positions ----------
async function handlePositions(req, res) {
  const token = getToken(req);
  const creds = await lireIdentifiants(token);
  const jeton = await ouvrirSession(creds);

  const etats = await appel(creds, jeton, '/carStatus/getByUserId.do', { targetUserId: creds.userId });
  const parBoitier = {};
  (etats || []).forEach(e => { parBoitier[String(e.carId)] = e; });

  const vehicules = await supabaseQuery(
    'fleet_vehicules',
    'select=id,immatriculation,gps_car_id,derniere_charge_le,charge_zone_entree_le,charge_zone_id,gps_position,km_offset_charge&gps_car_id=not.is.null', token);

  let zones = [];
  try {
    const st = await supabaseQuery('fleet_settings', 'select=zones_recharge&limit=1', token);
    zones = (st && st[0] && st[0].zones_recharge) || [];
  } catch (e) { console.warn('[gps] zones illisibles :', e.message); }

  // Tension du circuit 12 V, transmise dans exData (« s=1;v=13000;st=... »,
  // v en millivolts). C'est elle qui trahit un branchement : le convertisseur
  // du vehicule fait MONTER la tension des que la charge commence.
  const tensionDe = (e) => {
    const m = /(?:^|;)v=(\d+)/.exec((e && e.exData) || '');
    return m ? Math.round(Number(m[1]) / 100) / 10 : null;
  };

  const lignes = [];
  let horsLigne = 0, sansSignal = 0;
  for (const v of vehicules || []) {
    const e = parBoitier[String(v.gps_car_id)];
    if (!e) { sansSignal++; continue; }
    if (!e.online) horsLigne++;
    lignes.push({
      id: v.id,
      gps_position: {
        lat: e.lat, lng: e.lon,
        tension: tensionDe(e),
        vitesse: e.speed || 0,
        direction: e.dir,
        contact: e.accStatus === 1,          // ACC : moteur en marche
        enLigne: !!e.online,
        vuLe: e.pointTime ? new Date(e.pointTime).toISOString() : null,
      },
      gps_maj_le: new Date().toISOString(),
    });
  }

  // Detection automatique de recharge : une voiture immobile assez longtemps
  // dans une zone declaree est consideree rechargee, sans geste humain.
  // Le suivi n'a pas besoin d'etre continu : on note l'heure d'ENTREE en
  // zone immobile, et on compare a chaque passage de la synchronisation.
  const R_TERRE = 6371000;
  const distanceM = (a1, o1, a2, o2) => {
    const r = Math.PI / 180;
    const dA = (a2 - a1) * r, dO = (o2 - o1) * r;
    const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
    return 2 * R_TERRE * Math.asin(Math.sqrt(h));
  };
  const lignesZone = [];
  const lignesCharge = [];
  let chargesDetectees = 0;
  for (const v of vehicules || []) {
    const e = parBoitier[String(v.gps_car_id)];
    if (!e || !e.online || e.lat == null) continue;      // hors ligne : etat gele
    const immobile = (e.speed || 0) < 3;
    let zone = zones.find(z => z && z.lat != null &&
      distanceM(e.lat, e.lon, Number(z.lat), Number(z.lng)) <= (Number(z.rayon) || 120));

    // Second detecteur, valable PARTOUT : la signature du branchement.
    // Moteur eteint + immobile + tension qui MONTE d'au moins 0,4 V vers un
    // niveau de charge (>= 12,9 V) : le convertisseur vient de s'activer.
    // On exige la montee, pas un simple niveau absolu : certains vehicules
    // flottent a 13 V a l'arret, un seuil fixe declencherait a tort.
    if (!zone) {
      const tension = tensionDe(e);
      const precedente = (v.gps_position && v.gps_position.tension != null)
        ? Number(v.gps_position.tension) : null;
      // Seuils etablis sur les releves reels des boitiers (2026-08-10) : la
      // tension n'est donnee qu'au volt pres et oscille entre 12 et 13 V,
      // meme en roulant. On exige donc une montee d'au moins 1,5 V vers un
      // niveau >= 13,5 V — hors de portee du bruit de mesure.
      const monte = tension != null && precedente != null && (tension - precedente) >= 1.5;
      const enCours = v.charge_zone_id === 'TENSION' && tension != null && tension >= 13.5;
      if (immobile && e.accStatus !== 1 && (monte && tension >= 13.5 || enCours)) {
        zone = { id: 'TENSION', nom: 'Détection tension (' + tension.toFixed(1).replace('.', ',') + ' V)', dureeMin: 30 };
      }
    }

    if (!zone || !immobile) {
      // Sorti de zone ou reparti : la detection repart de zero.
      if (v.charge_zone_entree_le) lignesZone.push({ id: v.id, charge_zone_entree_le: null, charge_zone_id: null });
      continue;
    }
    if (!v.charge_zone_entree_le || v.charge_zone_id !== zone.id) {
      // Premiere fois vu immobile dans CETTE zone : on note l'heure d'entree.
      lignesZone.push({ id: v.id, charge_zone_entree_le: new Date().toISOString(), charge_zone_id: zone.id });
      continue;
    }
    const minutes = (Date.now() - new Date(v.charge_zone_entree_le).getTime()) / 60000;
    const seuil = Number(zone.dureeMin) || 45;
    const dejaComptee = v.derniere_charge_le &&
      new Date(v.derniere_charge_le) >= new Date(v.charge_zone_entree_le);
    if (minutes >= seuil && !dejaComptee) {
      chargesDetectees++;
      lignesCharge.push({
        id: v.id,
        derniere_charge_le: new Date().toISOString(),
        km_depuis_charge: 0,
        km_offset_charge: 0,
        charge_marquee_par: zone.id === 'TENSION' ? zone.nom : 'Zone : ' + (zone.nom || 'recharge'),
      });
    }
  }

  // Kilometres parcourus depuis la derniere charge : somme des trajets
  // WhatsGPS depuis cette date. Le champ mileage est en METRES.
  // Echec tolere vehicule par vehicule : une erreur sur l'un ne doit ni
  // bloquer les autres ni ecraser une valeur deja calculee.
  const fmtWg = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
  const versDate = (t) => new Date(String(t).replace(' ', 'T') + 'Z');
  const lignesKm = [];
  const ancres = new Set();
  const SEUIL_ARRET_H = 4;   // un VTC electrique en service se recharge a l'arret long
  for (const v of vehicules || []) {
    // Deja marque recharge par la detection en direct (zone ou tension) :
    // deux lignes pour le meme id dans un upsert font echouer l'ecriture.
    if (lignesCharge.some(l => l.id === v.id)) continue;
    try {
      // Fenetre : depuis la derniere charge connue, sinon 48 h en arriere.
      // Un vehicule jamais ancre obtient ainsi sa premiere estimation seul.
      // 72 h de fenetre : avec 48 h, un vehicule peu utilise n'avait que
      // deux trajets rapproches et son long arret restait hors champ.
      const depuis = v.derniere_charge_le || new Date(Date.now() - 72 * 3600 * 1000).toISOString();
      const trajets = (await appel(creds, jeton, '/position/distanceSta.do', {
        carId: v.gps_car_id, startTime: fmtWg(depuis), endTime: fmtWg(Date.now()),
      }) || []).slice().sort((a, b) => versDate(a.startTime) - versDate(b.startTime));

      // Ancrage autonome : un arret de plus de SEUIL_ARRET_H entre deux trajets
      // vaut recharge SUPPOSEE, ancree au REDEMARRAGE (la batterie est pleine
      // quand on repart, pas quand on se gare). On prend le dernier arret long.
      let ancre = null, dureeH = 0;
      for (let i = 0; i + 1 < trajets.length; i++) {
        const h = (versDate(trajets[i + 1].startTime) - versDate(trajets[i].endTime)) / 3600000;
        if (h >= SEUIL_ARRET_H) { ancre = versDate(trajets[i + 1].startTime); dureeH = h; }
      }
      // Premiere mise en service : aucun arret mesurable, mais des trajets.
      // On ancre au premier depart observe — mieux vaut une estimation
      // prudente (elle compte TOUS les km vus) que pas d'estimation.
      let etiquette = ancre ? 'Arrêt prolongé (' + Math.round(dureeH) + ' h) — recharge supposée' : null;
      if (!ancre && !v.derniere_charge_le && trajets.length) {
        ancre = versDate(trajets[0].startTime);
        etiquette = 'Premier départ observé — recharge supposée';
      }
      const dejaPlusRecent = v.derniere_charge_le && ancre && new Date(v.derniere_charge_le) >= ancre;
      if (ancre && !dejaPlusRecent) {
        const metresApres = trajets
          .filter(t => versDate(t.startTime) >= ancre)
          .reduce((s2, t) => s2 + (parseFloat(t.mileage) || 0), 0);
        lignesCharge.push({
          id: v.id,
          derniere_charge_le: ancre.toISOString(),
          km_depuis_charge: Math.round(metresApres / 100) / 10,
          km_offset_charge: 0,
          charge_marquee_par: etiquette,
        });
        ancres.add(v.id);
        chargesDetectees++;
        continue;   // le compteur vient d'etre ecrit avec l'ancre, ne pas le recouvrir
      }

      if (!v.derniere_charge_le) continue;
      // Le decalage vient d'un releve manuel : « km deja consommes » au moment
      // du releve, auxquels s'ajoutent les trajets faits depuis.
      const metres = trajets.reduce((s2, t) => s2 + (parseFloat(t.mileage) || 0), 0);
      const decalage = Number(v.km_offset_charge) || 0;
      lignesKm.push({ id: v.id, km_depuis_charge: Math.round(decalage * 10 + metres / 100) / 10 });
    } catch (e) {
      console.warn('[gps] distance', v.immatriculation, ':', e.message);
    }
  }

  // On n'ecrit QUE les colonnes GPS : un upsert complet effacerait le reste
  // de la fiche vehicule, qui n'est pas relue ici. Deux lots separes : les
  // lignes d'un meme upsert doivent porter les memes colonnes.
  if (lignes.length) await supabaseUpsert('fleet_vehicules', lignes, token, 'id');
  if (lignesZone.length) await supabaseUpsert('fleet_vehicules', lignesZone, token, 'id');
  if (lignesCharge.length) await supabaseUpsert('fleet_vehicules', lignesCharge, token, 'id');
  if (lignesKm.length) await supabaseUpsert('fleet_vehicules', lignesKm, token, 'id');

  res.json({
    success: true,
    vehiculesEquipes: (vehicules || []).length,
    positionsMisesAJour: lignes.length,
    kmDepuisChargeCalcules: lignesKm.length,
    chargesDetectees,
    zonesDeclarees: zones.length,
    horsLigne,
    sansSignal,
    boitiersDuCompte: (etats || []).length,
  });
}

// ---------- boitiers ----------
async function handleBoitiers(req, res) {
  const token = getToken(req);
  const creds = await lireIdentifiants(token);
  const jeton = await ouvrirSession(creds);
  const cars = await appel(creds, jeton, '/car/getByUserId.do',
    { userId: creds.userId, targetUserId: creds.userId });

  res.json({
    success: true,
    boitiers: (cars || []).map(c => ({
      carId: String(c.carId),
      nom: c.carNo || c.machineName || '',
      imei: c.imei || c.machineNo || '',
    })).sort((a, b) => a.nom.localeCompare(b.nom)),
  });
}

const ACTIONS = { positions: handlePositions, boitiers: handleBoitiers };

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
  setRequestToken(getToken(req));

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });
  // La position des vehicules est une donnee d'exploitation : administration
  // uniquement, comme les fonctions Yango.
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Reserve a l\'administration' });

  const fn = ACTIONS[req.query.action];
  if (!fn) return res.status(400).json({ error: 'Action inconnue', actions: Object.keys(ACTIONS) });

  try {
    await fn(req, res);
  } catch (e) {
    console.error('[gps]', e.message);
    res.status(500).json({ error: e.message });
  }
};
