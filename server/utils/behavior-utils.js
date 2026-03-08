/**
 * BehaviorUtils — Fonctions partagees pour l'analyse de conduite
 *
 * Utilisees par driver-api.js et behavior-cron.js
 */

const Chauffeur = require('../models/Chauffeur');
const Gps = require('../models/Gps');
const ConduiteBrute = require('../models/ConduiteBrute');

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

  // Calcul des scores par categorie
  const evts = conduiteBrute.evenements || [];
  const c = conduiteBrute.compteurs;

  const scoreFreinage = calculateCategoryScore(evts, 'freinage', { faible: -2, modere: -3, severe: -5 });
  const scoreAcceleration = calculateCategoryScore(evts, 'acceleration', { faible: -1, modere: -2, severe: -3 });
  const scoreVirage = calculateCategoryScore(evts, 'virage', { faible: -2, modere: -3, severe: -4 });
  const scoreVitesse = calculateCategoryScore(evts, 'exces_vitesse', { faible: -3, modere: -5, severe: -8 });

  // Bonus regularite
  const totalEvents = (c.freinagesBrusques || 0) + (c.accelerationsBrusques || 0) +
    (c.viragesAgressifs || 0) + (c.excesVitesse || 0);
  const regulariteBonus = totalEvents <= 2 ? 5 : totalEvents <= 5 ? 3 : 0;
  const scoreRegularite = Math.min(100, 80 + regulariteBonus * 4);

  // Score global pondere
  const scoreGlobal = Math.max(0, Math.min(100, Math.round(
    scoreVitesse * 0.25 +
    scoreFreinage * 0.25 +
    scoreAcceleration * 0.20 +
    scoreVirage * 0.20 +
    scoreRegularite * 0.10
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

  // Mettre a jour le scoreConduite du chauffeur (70% ancien + 30% aujourd'hui)
  const chauffeur = await Chauffeur.findOne({ id: chauffeurId });
  if (chauffeur) {
    const oldScore = chauffeur.scoreConduite || 80;
    chauffeur.scoreConduite = Math.round(oldScore * 0.7 + scoreGlobal * 0.3);
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
  finalizeBehaviorSession
};
