/**
 * BehaviorUtils — Fonctions partagees pour l'analyse de conduite
 *
 * Utilisees par driver-api.js et behavior-cron.js
 */

const Chauffeur = require('../models/Chauffeur');
const Gps = require('../models/Gps');
const ConduiteBrute = require('../models/ConduiteBrute');
const Settings = require('../models/Settings');

/**
 * Charge la config score conduite depuis Settings (avec fallback defaults)
 */
async function getScoreConduiteConfig() {
  const defaults = {
    poidsVitesse: 25, poidsFreinage: 25, poidsAcceleration: 20, poidsVirage: 20, poidsRegularite: 10,
    penaliteVitesse: { faible: -3, modere: -5, severe: -8 },
    penaliteFreinage: { faible: -2, modere: -3, severe: -5 },
    penaliteAcceleration: { faible: -1, modere: -2, severe: -3 },
    penaliteVirage: { faible: -2, modere: -3, severe: -4 },
    moyenneMobileAncien: 70, moyenneMobileNouveau: 30
  };
  try {
    const settings = await Settings.findOne({});
    if (settings && settings.scoreConduite) {
      const sc = settings.scoreConduite;
      return {
        poidsVitesse: sc.poidsVitesse ?? defaults.poidsVitesse,
        poidsFreinage: sc.poidsFreinage ?? defaults.poidsFreinage,
        poidsAcceleration: sc.poidsAcceleration ?? defaults.poidsAcceleration,
        poidsVirage: sc.poidsVirage ?? defaults.poidsVirage,
        poidsRegularite: sc.poidsRegularite ?? defaults.poidsRegularite,
        penaliteVitesse: { faible: sc.penaliteVitesse?.faible ?? defaults.penaliteVitesse.faible, modere: sc.penaliteVitesse?.modere ?? defaults.penaliteVitesse.modere, severe: sc.penaliteVitesse?.severe ?? defaults.penaliteVitesse.severe },
        penaliteFreinage: { faible: sc.penaliteFreinage?.faible ?? defaults.penaliteFreinage.faible, modere: sc.penaliteFreinage?.modere ?? defaults.penaliteFreinage.modere, severe: sc.penaliteFreinage?.severe ?? defaults.penaliteFreinage.severe },
        penaliteAcceleration: { faible: sc.penaliteAcceleration?.faible ?? defaults.penaliteAcceleration.faible, modere: sc.penaliteAcceleration?.modere ?? defaults.penaliteAcceleration.modere, severe: sc.penaliteAcceleration?.severe ?? defaults.penaliteAcceleration.severe },
        penaliteVirage: { faible: sc.penaliteVirage?.faible ?? defaults.penaliteVirage.faible, modere: sc.penaliteVirage?.modere ?? defaults.penaliteVirage.modere, severe: sc.penaliteVirage?.severe ?? defaults.penaliteVirage.severe },
        moyenneMobileAncien: sc.moyenneMobileAncien ?? defaults.moyenneMobileAncien,
        moyenneMobileNouveau: sc.moyenneMobileNouveau ?? defaults.moyenneMobileNouveau
      };
    }
  } catch (e) { /* fallback to defaults */ }
  return defaults;
}

/**
 * Distance haversine entre 2 points GPS (en km)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcule le score pour une categorie d'evenements
 */
function calculateCategoryScore(events, type, penalties) {
  let score = 100;
  const typeEvents = events.filter(e => e.type === type);
  for (const evt of typeEvents) {
    score += penalties[evt.severite] || -2;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Genere une analyse IA basee sur les scores
 */
function generateAnalyseIA(scoreGlobal, compteurs, stats) {
  const recommandations = [];
  const c = compteurs;

  if ((c.freinagesBrusques || 0) > 3) {
    recommandations.push('Anticipez davantage pour reduire les freinages brusques. Gardez une distance de securite.');
  }
  if ((c.accelerationsBrusques || 0) > 3) {
    recommandations.push('Accelerez progressivement pour une conduite plus fluide et economique.');
  }
  if ((c.viragesAgressifs || 0) > 2) {
    recommandations.push('Ralentissez avant d\'aborder les virages pour plus de confort et de securite.');
  }
  if ((c.excesVitesse || 0) > 0) {
    recommandations.push('Respectez les limitations de vitesse. Chaque exces augmente le risque d\'accident.');
  }
  if (recommandations.length === 0) {
    recommandations.push('Excellente conduite ! Continuez ainsi.');
  }

  const tendance = scoreGlobal >= 85 ? 'amelioration' : scoreGlobal >= 50 ? 'stable' : 'degradation';

  const resume = scoreGlobal >= 80
    ? `Bonne journee de conduite avec un score de ${scoreGlobal}/100. ${stats.distanceParcourue || 0} km parcourus.`
    : scoreGlobal >= 50
      ? `Score moyen de ${scoreGlobal}/100. Des ameliorations sont possibles sur ${stats.distanceParcourue || 0} km.`
      : `Score faible de ${scoreGlobal}/100. Attention a la conduite.`;

  return { resume, recommandations, tendance, comparaisonFlotte: 'dans_la_moyenne' };
}

/**
 * Finalise une session de conduite : calcule les stats et scores
 * @param {string} chauffeurId
 * @param {string} date - Format YYYY-MM-DD
 * @returns {Object|null}
 */
async function finalizeBehaviorSession(chauffeurId, date) {
  const conduiteBruteId = `CB-${chauffeurId}-${date}`;
  const conduiteBrute = await ConduiteBrute.findOne({ id: conduiteBruteId });
  if (!conduiteBrute) return null;

  conduiteBrute.sessionFin = new Date().toISOString();

  // Calculer la distance a partir des samples GPS
  let totalDistance = 0;
  const samples = conduiteBrute.gpsSamples || [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].lat && samples[i - 1].lat) {
      totalDistance += haversineDistance(
        samples[i - 1].lat, samples[i - 1].lng,
        samples[i].lat, samples[i].lng
      );
    }
  }

  // Temps de conduite
  const sessionStart = conduiteBrute.sessionDebut ? new Date(conduiteBrute.sessionDebut) : null;
  const sessionEnd = new Date(conduiteBrute.sessionFin);
  const tempsConduiteMinutes = sessionStart ? Math.round((sessionEnd - sessionStart) / 60000) : 0;

  // Stats vitesse
  const speeds = samples.filter(s => s.speed != null && s.speed > 0).map(s => s.speed);
  const vitesseMoyenne = speeds.length > 0
    ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
    : 0;
  const vitesseMax = speeds.length > 0 ? Math.max(...speeds) : 0;

  conduiteBrute.stats = {
    distanceParcourue: Math.round(totalDistance * 10) / 10,
    tempsConduite: tempsConduiteMinutes,
    vitesseMoyenne,
    vitesseMax
  };
  conduiteBrute.scoreCalcule = true;
  await conduiteBrute.save();

  // Charger la config score conduite
  const cfg = await getScoreConduiteConfig();

  // Calcul des scores par categorie
  const evts = conduiteBrute.evenements || [];
  const c = conduiteBrute.compteurs;

  const scoreFreinage = calculateCategoryScore(evts, 'freinage', cfg.penaliteFreinage);
  const scoreAcceleration = calculateCategoryScore(evts, 'acceleration', cfg.penaliteAcceleration);
  const scoreVirage = calculateCategoryScore(evts, 'virage', cfg.penaliteVirage);
  const scoreVitesse = calculateCategoryScore(evts, 'exces_vitesse', cfg.penaliteVitesse);

  // Bonus regularite
  const totalEvents = (c.freinagesBrusques || 0) + (c.accelerationsBrusques || 0) +
    (c.viragesAgressifs || 0) + (c.excesVitesse || 0);
  const regulariteBonus = totalEvents <= 2 ? 5 : totalEvents <= 5 ? 3 : 0;
  const scoreRegularite = Math.min(100, 80 + regulariteBonus * 4);

  // Score global pondere (poids en %, divise par 100)
  const scoreGlobal = Math.max(0, Math.min(100, Math.round(
    scoreVitesse * (cfg.poidsVitesse / 100) +
    scoreFreinage * (cfg.poidsFreinage / 100) +
    scoreAcceleration * (cfg.poidsAcceleration / 100) +
    scoreVirage * (cfg.poidsVirage / 100) +
    scoreRegularite * (cfg.poidsRegularite / 100)
  )));

  // Mettre a jour le record Gps
  const gpsId = `gps-${chauffeurId}-${conduiteBrute.date}`;
  await Gps.findOneAndUpdate(
    { id: gpsId },
    {
      $set: {
        chauffeurId,
        date: conduiteBrute.date,
        scoreGlobal, scoreVitesse, scoreFreinage,
        scoreAcceleration, scoreVirage, scoreRegularite,
        scoreActivite: 0,
        'evenements.freinagesBrusques': c.freinagesBrusques || 0,
        'evenements.accelerationsBrusques': c.accelerationsBrusques || 0,
        'evenements.excesVitesse': c.excesVitesse || 0,
        'evenements.viragesAgressifs': c.viragesAgressifs || 0,
        'evenements.tempsConduite': tempsConduiteMinutes,
        'evenements.distanceParcourue': conduiteBrute.stats.distanceParcourue,
        'evenements.vitesseMoyenne': vitesseMoyenne,
        'evenements.vitesseMax': vitesseMax,
        analyseIA: generateAnalyseIA(scoreGlobal, c, conduiteBrute.stats)
      }
    },
    { upsert: true }
  );

  // Mettre a jour le scoreConduite du chauffeur (configurable ancien/nouveau)
  const chauffeur = await Chauffeur.findOne({ id: chauffeurId });
  if (chauffeur) {
    const oldScore = chauffeur.scoreConduite || 80;
    const pctAncien = cfg.moyenneMobileAncien / 100;
    const pctNouveau = cfg.moyenneMobileNouveau / 100;
    chauffeur.scoreConduite = Math.round(oldScore * pctAncien + scoreGlobal * pctNouveau);
    await chauffeur.save();
  }

  return {
    success: true,
    scores: { scoreGlobal, scoreVitesse, scoreFreinage, scoreAcceleration, scoreVirage, scoreRegularite },
    stats: conduiteBrute.stats
  };
}

module.exports = {
  haversineDistance,
  calculateCategoryScore,
  generateAnalyseIA,
  finalizeBehaviorSession,
  getScoreConduiteConfig
};
