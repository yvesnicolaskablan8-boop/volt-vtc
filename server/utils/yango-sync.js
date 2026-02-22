/**
 * YangoSync — Synchronisation automatique des donnees Yango
 *
 * Recupere les courses et transactions Yango pour chaque chauffeur,
 * calcule le temps d'activite et met a jour les scores dans la BDD.
 *
 * Fonctionnalites :
 * - Matching automatique Yango driver → Volt chauffeur (par nom/prenom ou yangoDriverId)
 * - Calcul du temps d'activite Yango (premiere → derniere course du jour)
 * - Calcul du scoreActivite (0-100) base sur objectif 10h/jour
 * - Mise a jour des enregistrements GPS avec les nouvelles donnees
 * - Recalcul du scoreGlobal avec le critere activite
 */

const YANGO_BASE = 'https://fleet-api.taxi.yandex.net';

/**
 * Appel API Yango (POST)
 */
async function yangoFetch(endpoint, body = {}) {
  const parkId = process.env.YANGO_PARK_ID;
  const apiKey = process.env.YANGO_API_KEY;
  const clientId = process.env.YANGO_CLIENT_ID;

  if (!parkId || !apiKey || !clientId) {
    throw new Error('Yango API credentials not configured');
  }

  const res = await fetch(`${YANGO_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-ID': clientId,
      'X-API-Key': apiKey,
      'Accept-Language': 'fr'
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Yango API error ${res.status}: ${text.substring(0, 200)}`);
  }

  return JSON.parse(text);
}

/**
 * Recupere la liste des chauffeurs Yango (TOUS, pas seulement "working")
 * Avec pagination pour gerer plus de 300 chauffeurs
 */
async function fetchYangoDrivers() {
  const allDrivers = [];
  let offset = 0;
  const LIMIT = 300;
  const MAX_PAGES = 10;
  let page = 0;

  do {
    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        current_status: ['status', 'status_updated_at'],
        driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_status']
      },
      limit: LIMIT,
      offset,
      query: {
        park: {
          id: process.env.YANGO_PARK_ID
          // PAS de filtre work_status → recupere TOUS les chauffeurs
        }
      }
    });

    const profiles = data.driver_profiles || [];
    for (const dp of profiles) {
      allDrivers.push({
        id: dp.driver_profile?.id || '',
        prenom: dp.driver_profile?.first_name || '',
        nom: dp.driver_profile?.last_name || '',
        telephone: dp.driver_profile?.phones?.[0] || '',
        workStatus: dp.driver_profile?.work_status || '',
        statut: dp.current_status?.status || 'offline'
      });
    }

    if (profiles.length < LIMIT) break;
    offset += LIMIT;
    page++;
  } while (page < MAX_PAGES);

  console.log(`[YangoSync] ${allDrivers.length} chauffeurs Yango recuperes (toutes categories)`);
  return allDrivers;
}

/**
 * Recupere les courses Yango pour une periode donnee
 */
async function fetchYangoOrders(from, to) {
  const allOrders = [];
  let cursor = '';
  let pages = 0;

  // Premiere page
  const data = await yangoFetch('/v1/parks/orders/list', {
    limit: 500,
    query: {
      park: {
        id: process.env.YANGO_PARK_ID,
        order: { booked_at: { from, to } }
      }
    }
  });

  allOrders.push(...(data.orders || []));
  return allOrders;
}

/**
 * Recupere toutes les transactions pour une periode
 */
async function fetchAllTransactions(from, to) {
  const allTxns = [];
  let cursor = '';
  let pages = 0;
  const MAX_PAGES = 10;

  do {
    const body = {
      query: {
        park: {
          id: process.env.YANGO_PARK_ID,
          transaction: { event_at: { from, to } }
        }
      },
      limit: 1000
    };
    if (cursor) body.cursor = cursor;

    const data = await yangoFetch('/v2/parks/transactions/list', body);
    allTxns.push(...(data.transactions || []));
    cursor = data.cursor || '';
    pages++;
  } while (cursor && pages < MAX_PAGES);

  return allTxns;
}

/**
 * Normalise un nom : supprime les accents, lowercase, trim, supprime les doubles espaces
 */
function normalizeName(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Normalise un numero de telephone
 * Gere les formats Côte d'Ivoire (+225, 07xxx) et internationaux
 */
function normalizePhone(phone) {
  if (!phone) return '';
  // Enlever tout sauf les chiffres
  const digits = phone.replace(/\D/g, '');
  // Si commence par 225 (CI country code), enlever
  if (digits.startsWith('225') && digits.length >= 13) return digits.slice(3);
  // Prendre les 10 derniers chiffres
  return digits.slice(-10);
}

/**
 * Matche les chauffeurs Yango avec les chauffeurs Volt
 *
 * Strategie multi-niveaux :
 * 1. yangoDriverId (match direct)
 * 2. Telephone normalise
 * 3. prenom_nom exact (normalise sans accents)
 * 4. nom_prenom inverse (Yango peut inverser first_name / last_name)
 * 5. Match partiel : un seul des deux mots (prenom OU nom) correspond dans les deux sens
 */
function matchDrivers(yangoDrivers, voltChauffeurs) {
  const matched = [];
  const usedVoltIds = new Set();

  // 1. Index par yangoDriverId
  const byYangoId = {};
  voltChauffeurs.forEach(c => {
    if (c.yangoDriverId) byYangoId[c.yangoDriverId] = c;
  });

  // 2. Index par telephone (normalise)
  const byPhone = {};
  voltChauffeurs.forEach(c => {
    const normalized = normalizePhone(c.telephone);
    if (normalized.length >= 8) byPhone[normalized] = c;
  });

  // 3. Index par prenom_nom et nom_prenom (pour matcher dans les deux sens)
  const byNameDirect = {};  // prenom_nom
  const byNameReverse = {}; // nom_prenom
  const byFullName = {};    // "prenom nom" (string complet normalise)

  voltChauffeurs.forEach(c => {
    const p = normalizeName(c.prenom);
    const n = normalizeName(c.nom);
    if (p && n) {
      byNameDirect[`${p}_${n}`] = c;
      byNameReverse[`${n}_${p}`] = c;
      byFullName[`${p} ${n}`] = c;
      byFullName[`${n} ${p}`] = c;
    }
  });

  for (const yd of yangoDrivers) {
    let voltMatch = null;
    let matchMethod = '';

    // 1. Match par yangoDriverId
    if (!voltMatch && byYangoId[yd.id]) {
      voltMatch = byYangoId[yd.id];
      matchMethod = 'yangoId';
    }

    // 2. Match par telephone
    if (!voltMatch && yd.telephone) {
      const normalizedPhone = normalizePhone(yd.telephone);
      if (normalizedPhone.length >= 8 && byPhone[normalizedPhone]) {
        voltMatch = byPhone[normalizedPhone];
        matchMethod = 'telephone';
      }
    }

    // 3. Match par prenom_nom direct
    const yp = normalizeName(yd.prenom);
    const yn = normalizeName(yd.nom);

    if (!voltMatch && yp && yn) {
      const keyDirect = `${yp}_${yn}`;
      if (byNameDirect[keyDirect]) {
        voltMatch = byNameDirect[keyDirect];
        matchMethod = 'nom_direct';
      }
    }

    // 4. Match par nom_prenom inverse (Yango peut inverser nom/prenom)
    if (!voltMatch && yp && yn) {
      const keyReverse = `${yp}_${yn}`;
      if (byNameReverse[keyReverse]) {
        voltMatch = byNameReverse[keyReverse];
        matchMethod = 'nom_inverse';
      }
    }

    // 5. Match par nom complet (concatene prenom+nom dans les deux sens)
    if (!voltMatch && yp && yn) {
      const fullA = `${yp} ${yn}`;
      const fullB = `${yn} ${yp}`;
      if (byFullName[fullA]) {
        voltMatch = byFullName[fullA];
        matchMethod = 'nom_complet';
      } else if (byFullName[fullB]) {
        voltMatch = byFullName[fullB];
        matchMethod = 'nom_complet_inverse';
      }
    }

    // 6. Match partiel : prenom Yango = nom Volt ET nom Yango = prenom Volt
    if (!voltMatch && yp && yn) {
      const candidate = voltChauffeurs.find(c => {
        if (usedVoltIds.has(c.id)) return false;
        const cp = normalizeName(c.prenom);
        const cn = normalizeName(c.nom);
        // Match croise : prenom↔nom
        return (yp === cn && yn === cp);
      });
      if (candidate) {
        voltMatch = candidate;
        matchMethod = 'croise';
      }
    }

    // 7. Match par nom de famille seul (si unique)
    if (!voltMatch && yn) {
      const candidates = voltChauffeurs.filter(c => {
        if (usedVoltIds.has(c.id)) return false;
        const cn = normalizeName(c.nom);
        const cp = normalizeName(c.prenom);
        return cn === yn || cp === yn || cn === yp || cp === yp;
      });
      if (candidates.length === 1) {
        voltMatch = candidates[0];
        matchMethod = 'nom_partiel';
      }
    }

    if (voltMatch && !usedVoltIds.has(voltMatch.id)) {
      usedVoltIds.add(voltMatch.id);
      matched.push({ yango: yd, volt: voltMatch, method: matchMethod });
    }
  }

  return matched;
}

/**
 * Calcule le temps d'activite d'un chauffeur a partir de ses courses
 * Temps = somme des durees (started_at → ended_at) des courses completees
 * Retourne les minutes
 */
function calculateActivityTime(orders) {
  let totalMinutes = 0;
  let completedCount = 0;

  for (const o of orders) {
    if (o.status === 'complete' && o.started_at && o.ended_at) {
      const start = new Date(o.started_at);
      const end = new Date(o.ended_at);
      const diff = (end - start) / 60000;
      if (diff > 0 && diff < 480) { // max 8h par course (securite)
        totalMinutes += diff;
        completedCount++;
      }
    }
  }

  return { totalMinutes: Math.round(totalMinutes), completedCount };
}

/**
 * Calcule le scoreActivite (0-100) base sur le temps d'activite
 * Objectif configurable (defaut: 600 min = 10h)
 */
function calculateActivityScore(minutesActivite, objectifMinutes = 600) {
  if (objectifMinutes <= 0) return 100;
  const ratio = minutesActivite / objectifMinutes;
  // Score lineaire, plafonne a 100
  return Math.min(100, Math.round(ratio * 100));
}

/**
 * Recalcule le scoreGlobal avec le critere activite inclus
 * Ponderation : Vitesse 20%, Freinage 20%, Acceleration 15%, Virage 15%, Regularite 15%, Activite 15%
 */
function recalculateGlobalScore(gpsRecord) {
  const weights = {
    scoreVitesse: 0.20,
    scoreFreinage: 0.20,
    scoreAcceleration: 0.15,
    scoreVirage: 0.15,
    scoreRegularite: 0.15,
    scoreActivite: 0.15
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const val = gpsRecord[key];
    if (val !== undefined && val !== null) {
      weightedSum += val * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return gpsRecord.scoreGlobal || 0;
  return Math.round(weightedSum / totalWeight);
}

/**
 * Calcule le revenu d'un chauffeur a partir des transactions
 */
function calculateDriverRevenue(transactions, yangoDriverId) {
  const revenueCats = new Set(['cash_collected', 'partner_ride_cash_collected']);
  const cardCats = new Set(['card', 'partner_ride_card', 'ewallet_payment', 'terminal_payment']);

  let cash = 0;
  let card = 0;

  for (const t of transactions) {
    if (t.driver_profile_id !== yangoDriverId) continue;
    const amount = parseFloat(t.amount || 0);
    if (revenueCats.has(t.category_id)) cash += amount;
    else if (cardCats.has(t.category_id)) card += amount;
  }

  return { cash: Math.round(cash), card: Math.round(card), total: Math.round(cash + card) };
}

/**
 * Fonction principale de synchronisation
 * Appelee par le CRON ou manuellement
 *
 * @param {Date} date - La date a synchroniser (defaut: hier)
 * @returns {Object} Resultat de la sync
 */
async function syncYangoActivity(date = null) {
  const Chauffeur = require('../models/Chauffeur');
  const Gps = require('../models/Gps');
  const Settings = require('../models/Settings');

  // Date a synchroniser (defaut: hier pour le CRON de nuit)
  const syncDate = date || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  })();

  const dayStart = new Date(syncDate.getFullYear(), syncDate.getMonth(), syncDate.getDate());
  const dayEnd = new Date(syncDate.getFullYear(), syncDate.getMonth(), syncDate.getDate(), 23, 59, 59);
  const dateStr = dayStart.toISOString().split('T')[0];

  console.log(`[YangoSync] Synchronisation pour le ${dateStr}...`);

  // Lire les settings pour l'objectif d'activite
  const settings = await Settings.findOne().lean();
  const objectifMinutes = (settings?.bonus?.tempsActiviteMin) || 600;

  // 1. Recuperer les chauffeurs Yango + Volt
  const [yangoDrivers, voltChauffeurs] = await Promise.all([
    fetchYangoDrivers(),
    Chauffeur.find({ statut: 'actif' }).lean()
  ]);

  console.log(`[YangoSync] ${yangoDrivers.length} chauffeurs Yango, ${voltChauffeurs.length} chauffeurs Volt`);

  // Debug : afficher les chauffeurs Volt pour diagnostiquer le matching
  if (voltChauffeurs.length > 0 && voltChauffeurs.length <= 50) {
    console.log(`[YangoSync] Chauffeurs Volt :`);
    voltChauffeurs.forEach(c => {
      console.log(`  → ${c.prenom} ${c.nom} | tel: ${c.telephone || '-'} | yangoId: ${c.yangoDriverId || '-'} | norm: "${normalizeName(c.prenom)}_${normalizeName(c.nom)}" | phone: "${normalizePhone(c.telephone)}"`);
    });
  }

  // 2. Matcher les chauffeurs
  const matched = matchDrivers(yangoDrivers, voltChauffeurs);
  console.log(`[YangoSync] ${matched.length} chauffeurs matche(s)`);

  // 3. Recuperer les courses et transactions du jour
  const [orders, transactions] = await Promise.all([
    fetchYangoOrders(dayStart.toISOString(), dayEnd.toISOString()),
    fetchAllTransactions(dayStart.toISOString(), dayEnd.toISOString())
  ]);

  console.log(`[YangoSync] ${orders.length} courses, ${transactions.length} transactions`);

  // 4. Pour chaque chauffeur matche, calculer et sauvegarder
  const results = [];
  let updated = 0;
  let created = 0;
  let errors = 0;

  for (const { yango, volt } of matched) {
    try {
      // Filtrer les courses de ce chauffeur
      const driverOrders = orders.filter(o => o.driver?.id === yango.id);
      const completedOrders = driverOrders.filter(o => o.status === 'complete');

      if (completedOrders.length === 0) {
        results.push({ chauffeur: `${volt.prenom} ${volt.nom}`, status: 'skip', reason: 'Aucune course' });
        continue;
      }

      // Calculer le temps d'activite
      const activity = calculateActivityTime(driverOrders);
      const scoreActivite = calculateActivityScore(activity.totalMinutes, objectifMinutes);

      // Calculer le revenu
      const revenue = calculateDriverRevenue(transactions, yango.id);

      // Calculer les stats de conduite basiques
      let distanceTotale = 0;
      let vitesseMax = 0;
      const durees = [];

      for (const o of completedOrders) {
        if (o.route_info?.distance) distanceTotale += parseFloat(o.route_info.distance);
        else if (o.distance) distanceTotale += parseFloat(o.distance);

        if (o.started_at && o.ended_at) {
          const dur = (new Date(o.ended_at) - new Date(o.started_at)) / 60000;
          if (dur > 0) durees.push(dur);
        }
      }

      const tempsConducteMinutes = durees.reduce((s, d) => s + d, 0);
      const vitesseMoyenne = tempsConducteMinutes > 0 && distanceTotale > 0
        ? Math.round((distanceTotale / 1000) / (tempsConducteMinutes / 60))
        : 0;

      // Chercher un enregistrement GPS existant pour ce jour
      const gpsId = `yango_${volt.id}_${dateStr}`;
      let gpsRecord = await Gps.findOne({ id: gpsId });

      if (gpsRecord) {
        // Mise a jour
        gpsRecord.scoreActivite = scoreActivite;
        if (!gpsRecord.evenements) gpsRecord.evenements = {};
        gpsRecord.evenements.tempsActiviteYango = activity.totalMinutes;
        gpsRecord.evenements.tempsConduite = Math.round(tempsConducteMinutes);
        gpsRecord.evenements.distanceParcourue = Math.round(distanceTotale / 1000);
        gpsRecord.evenements.vitesseMoyenne = vitesseMoyenne;

        // Recalculer le score global
        gpsRecord.scoreGlobal = recalculateGlobalScore(gpsRecord.toObject());
        await gpsRecord.save();
        updated++;
      } else {
        // Creer un nouvel enregistrement GPS
        const newGps = {
          id: gpsId,
          chauffeurId: volt.id,
          vehiculeId: volt.vehiculeAssigne || '',
          date: dayStart.toISOString(),
          scoreActivite,
          evenements: {
            tempsActiviteYango: activity.totalMinutes,
            tempsConduite: Math.round(tempsConducteMinutes),
            distanceParcourue: Math.round(distanceTotale / 1000),
            vitesseMoyenne,
            freinagesBrusques: 0,
            accelerationsBrusques: 0,
            excesVitesse: 0,
            viragesAgressifs: 0
          }
        };

        // Score global : uniquement activite si pas d'autres scores
        newGps.scoreGlobal = scoreActivite;

        await Gps.create(newGps);
        created++;
      }

      // Sauvegarder le yangoDriverId si pas encore fait
      if (!volt.yangoDriverId) {
        await Chauffeur.updateOne({ id: volt.id }, { yangoDriverId: yango.id });
      }

      // Mettre a jour le scoreConduite du chauffeur
      const latestGps = await Gps.findOne({ chauffeurId: volt.id }).sort({ date: -1 }).lean();
      if (latestGps && latestGps.scoreGlobal) {
        await Chauffeur.updateOne({ id: volt.id }, { scoreConduite: latestGps.scoreGlobal });
      }

      results.push({
        chauffeur: `${volt.prenom} ${volt.nom}`,
        status: 'ok',
        courses: completedOrders.length,
        tempsActivite: activity.totalMinutes,
        scoreActivite,
        revenu: revenue.total
      });
    } catch (err) {
      console.error(`[YangoSync] Erreur pour ${volt.prenom} ${volt.nom}:`, err.message);
      results.push({ chauffeur: `${volt.prenom} ${volt.nom}`, status: 'error', error: err.message });
      errors++;
    }
  }

  // Chauffeurs Yango non matche(s)
  const unmatchedYango = yangoDrivers.filter(
    yd => !matched.find(m => m.yango.id === yd.id)
  );

  // Stats de matching par methode
  const matchMethods = {};
  matched.forEach(m => {
    matchMethods[m.method] = (matchMethods[m.method] || 0) + 1;
  });

  // Debug: chauffeurs Volt non matche(s)
  const unmatchedVolt = voltChauffeurs.filter(
    vc => !matched.find(m => m.volt.id === vc.id)
  );

  const summary = {
    date: dateStr,
    totalYangoDrivers: yangoDrivers.length,
    totalVoltChauffeurs: voltChauffeurs.length,
    matched: matched.length,
    matchMethods,
    unmatched: unmatchedYango.length,
    unmatchedDrivers: unmatchedYango.slice(0, 30).map(d => `${d.prenom} ${d.nom} (${d.telephone || 'pas de tel'})`),
    unmatchedVolt: unmatchedVolt.map(c => ({
      nom: `${c.prenom} ${c.nom}`,
      telephone: c.telephone || '',
      normalizedName: `${normalizeName(c.prenom)}_${normalizeName(c.nom)}`,
      normalizedPhone: normalizePhone(c.telephone),
      yangoDriverId: c.yangoDriverId || null
    })),
    updated,
    created,
    errors,
    totalOrders: orders.length,
    totalTransactions: transactions.length,
    details: results
  };

  console.log(`[YangoSync] Terminé: ${updated} mis a jour, ${created} créés, ${errors} erreurs`);
  console.log(`[YangoSync] Matching: ${matched.length} matchés, ${unmatchedYango.length} non matchés`);
  console.log(`[YangoSync] Méthodes:`, matchMethods);
  if (unmatchedYango.length > 0) {
    console.log(`[YangoSync] Non matchés (5 premiers):`, unmatchedYango.slice(0, 5).map(d => `${d.prenom} ${d.nom}`));
  }

  return summary;
}

module.exports = {
  syncYangoActivity,
  fetchYangoDrivers,
  matchDrivers,
  calculateActivityTime,
  calculateActivityScore,
  recalculateGlobalScore
};
