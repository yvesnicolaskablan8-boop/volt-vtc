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
 * Recupere la liste des chauffeurs Yango
 */
async function fetchYangoDrivers() {
  const data = await yangoFetch('/v1/parks/driver-profiles/list', {
    fields: {
      current_status: ['status', 'status_updated_at'],
      driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_status']
    },
    limit: 200,
    offset: 0,
    query: {
      park: {
        id: process.env.YANGO_PARK_ID,
        driver_profile: { work_status: ['working'] }
      }
    }
  });

  return (data.driver_profiles || []).map(dp => ({
    id: dp.driver_profile?.id || '',
    prenom: dp.driver_profile?.first_name || '',
    nom: dp.driver_profile?.last_name || '',
    telephone: dp.driver_profile?.phones?.[0] || '',
    statut: dp.current_status?.status || 'offline'
  }));
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
 * Matche les chauffeurs Yango avec les chauffeurs Volt
 * Strategie : yangoDriverId direct > match par telephone > match par nom+prenom
 */
function matchDrivers(yangoDrivers, voltChauffeurs) {
  const matched = [];

  // Index par yangoDriverId
  const byYangoId = {};
  voltChauffeurs.forEach(c => {
    if (c.yangoDriverId) byYangoId[c.yangoDriverId] = c;
  });

  // Index par telephone (normalise)
  const byPhone = {};
  voltChauffeurs.forEach(c => {
    if (c.telephone) {
      const normalized = c.telephone.replace(/[\s\-\+]/g, '').slice(-10);
      byPhone[normalized] = c;
    }
  });

  // Index par nom+prenom (lowercase)
  const byName = {};
  voltChauffeurs.forEach(c => {
    const key = `${(c.prenom || '').toLowerCase().trim()}_${(c.nom || '').toLowerCase().trim()}`;
    if (key !== '_') byName[key] = c;
  });

  for (const yd of yangoDrivers) {
    let voltMatch = null;

    // 1. Match par yangoDriverId
    if (byYangoId[yd.id]) {
      voltMatch = byYangoId[yd.id];
    }

    // 2. Match par telephone
    if (!voltMatch && yd.telephone) {
      const normalizedPhone = yd.telephone.replace(/[\s\-\+]/g, '').slice(-10);
      if (byPhone[normalizedPhone]) voltMatch = byPhone[normalizedPhone];
    }

    // 3. Match par nom+prenom
    if (!voltMatch) {
      const key = `${(yd.prenom || '').toLowerCase().trim()}_${(yd.nom || '').toLowerCase().trim()}`;
      if (byName[key]) voltMatch = byName[key];
    }

    if (voltMatch) {
      matched.push({ yango: yd, volt: voltMatch });
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

  const summary = {
    date: dateStr,
    totalYangoDrivers: yangoDrivers.length,
    totalVoltChauffeurs: voltChauffeurs.length,
    matched: matched.length,
    unmatched: unmatchedYango.length,
    unmatchedDrivers: unmatchedYango.map(d => `${d.prenom} ${d.nom}`),
    updated,
    created,
    errors,
    totalOrders: orders.length,
    totalTransactions: transactions.length,
    details: results
  };

  console.log(`[YangoSync] Terminé: ${updated} mis a jour, ${created} créés, ${errors} erreurs, ${unmatchedYango.length} non matchés`);

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
