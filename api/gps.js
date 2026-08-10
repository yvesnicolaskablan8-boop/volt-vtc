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
    'select=id,immatriculation,gps_car_id,derniere_charge_le&gps_car_id=not.is.null', token);

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
        vitesse: e.speed || 0,
        direction: e.dir,
        contact: e.accStatus === 1,          // ACC : moteur en marche
        enLigne: !!e.online,
        vuLe: e.pointTime ? new Date(e.pointTime).toISOString() : null,
      },
      gps_maj_le: new Date().toISOString(),
    });
  }

  // Kilometres parcourus depuis la derniere charge : somme des trajets
  // WhatsGPS depuis cette date. Le champ mileage est en METRES.
  // Echec tolere vehicule par vehicule : une erreur sur l'un ne doit ni
  // bloquer les autres ni ecraser une valeur deja calculee.
  const fmtWg = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
  const lignesKm = [];
  for (const v of vehicules || []) {
    if (!v.derniere_charge_le) continue;
    try {
      const trajets = await appel(creds, jeton, '/position/distanceSta.do', {
        carId: v.gps_car_id,
        startTime: fmtWg(v.derniere_charge_le),
        endTime: fmtWg(Date.now()),
      });
      const metres = (trajets || []).reduce((s2, t) => s2 + (parseFloat(t.mileage) || 0), 0);
      lignesKm.push({ id: v.id, km_depuis_charge: Math.round(metres / 100) / 10 });
    } catch (e) {
      console.warn('[gps] distance', v.immatriculation, ':', e.message);
    }
  }

  // On n'ecrit QUE les colonnes GPS : un upsert complet effacerait le reste
  // de la fiche vehicule, qui n'est pas relue ici. Deux lots separes : les
  // lignes d'un meme upsert doivent porter les memes colonnes.
  if (lignes.length) await supabaseUpsert('fleet_vehicules', lignes, token, 'id');
  if (lignesKm.length) await supabaseUpsert('fleet_vehicules', lignesKm, token, 'id');

  res.json({
    success: true,
    vehiculesEquipes: (vehicules || []).length,
    positionsMisesAJour: lignes.length,
    kmDepuisChargeCalcules: lignesKm.length,
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
