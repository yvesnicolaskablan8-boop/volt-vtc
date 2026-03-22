/**
 * BonusCron — Attribution hebdomadaire du bonus meilleur chauffeur
 *
 * Toutes les heures, verifie si c'est lundi entre 1h et 2h du matin.
 * Si oui, calcule le classement composite de la semaine precedente (lun-dim)
 * et attribue un bonus de 25 000 FCFA au chauffeur #1.
 *
 * Score composite (meme formule que la page classement admin) :
 *   40% recettes (normalise vs meilleur CA)
 *   25% score conduite (chauffeur.scoreConduite)
 *   20% regularite versements
 *   15% contraventions/infractions penalty (-15pts/contravention, -5pts/infraction)
 */

const Chauffeur = require('../models/Chauffeur');
const Versement = require('../models/Versement');
const Planning = require('../models/Planning');
const Contravention = require('../models/Contravention');
const InfractionVitesse = require('../models/InfractionVitesse');
const notifService = require('./notification-service');
const { forEachTenant } = require('./tenant-iterator');

let _interval = null;
let _lastRunWeek = ''; // Empecher les doubles executions

const BONUS_AMOUNT = 25000; // FCFA — configurable

/**
 * Retourne les bornes lundi 00:00 → dimanche 23:59 de la semaine PRECEDENTE
 */
function getPreviousWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=dimanche, 1=lundi
  // Nombre de jours depuis le lundi precedent de la semaine DERNIERE
  const daysSinceLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - daysSinceLastMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const prevMonday = new Date(thisMonday);
  prevMonday.setDate(prevMonday.getDate() - 7);

  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevSunday.getDate() + 6);

  const fmt = d => d.toISOString().split('T')[0];
  return { start: fmt(prevMonday), end: fmt(prevSunday) };
}

/**
 * Calcule le classement composite pour une semaine donnee
 */
async function computeWeeklyRanking(startDate, endDate, entrepriseId) {
  // Charger les chauffeurs actifs
  const chauffeurFilter = { statut: { $in: ['actif', 'repos'] } };
  if (entrepriseId) chauffeurFilter.entrepriseId = entrepriseId;
  const chauffeurs = await Chauffeur.find(chauffeurFilter).lean();
  if (chauffeurs.length === 0) return [];

  const chauffeurIds = chauffeurs.map(c => c.id);

  // Charger les donnees de la semaine en parallele
  const baseFilter = (extra) => {
    const f = { ...extra, date: { $gte: startDate, $lte: endDate } };
    if (entrepriseId) f.entrepriseId = entrepriseId;
    return f;
  };

  const [versements, plannings, contraventions, infractions] = await Promise.all([
    Versement.find({ ...baseFilter({}), chauffeurId: { $in: chauffeurIds } }).lean(),
    Planning.find({ ...baseFilter({}), chauffeurId: { $in: chauffeurIds } }).lean(),
    Contravention.find({ ...baseFilter({}), chauffeurId: { $in: chauffeurIds } }).lean(),
    InfractionVitesse.find({ ...baseFilter({}), chauffeurId: { $in: chauffeurIds } }).lean()
  ]);

  // CA par chauffeur (versements valides hors supprime)
  const revenueByDriver = {};
  versements.filter(v => v.statut !== 'supprime' && v.montantVerse > 0).forEach(v => {
    revenueByDriver[v.chauffeurId] = (revenueByDriver[v.chauffeurId] || 0) + v.montantVerse;
  });
  const maxCA = Math.max(...Object.values(revenueByDriver), 1);

  // Calcul du score pour chaque chauffeur
  const ranked = chauffeurs.map(ch => {
    const cId = ch.id;

    // 1. Score recettes (40%)
    const ca = revenueByDriver[cId] || 0;
    const scoreRecettes = Math.min((ca / maxCA) * 100, 100);

    // 2. Score conduite (25%)
    const scoreConduite = ch.scoreConduite || 0;

    // 3. Regularite versements (20%)
    const planningMois = plannings.filter(p => p.chauffeurId === cId);
    const versementsMois = versements.filter(v =>
      v.chauffeurId === cId && (v.statut === 'valide' || v.statut === 'supprime')
    );
    const nbPlanifie = planningMois.length || 1;
    const nbVerse = Math.min(versementsMois.length, nbPlanifie);
    const scoreRegularite = (nbVerse / nbPlanifie) * 100;

    // 4. Contraventions/Infractions (15%)
    const nbContras = contraventions.filter(c => c.chauffeurId === cId).length;
    const nbInfractions = infractions.filter(inf => inf.chauffeurId === cId).length;
    const penalite = (nbContras * 15) + (nbInfractions * 5);
    const scoreContra = Math.max(100 - penalite, 0);

    // Score global pondere
    const scoreGlobal = Math.round(
      (scoreRecettes * 0.40) +
      (scoreConduite * 0.25) +
      (scoreRegularite * 0.20) +
      (scoreContra * 0.15)
    );

    return {
      chauffeurId: cId,
      prenom: ch.prenom || '',
      nom: ch.nom || '',
      scoreGlobal,
      ca,
      scoreConduite: Math.round(scoreConduite),
      regularite: Math.round(scoreRegularite),
      nbContras,
      nbInfractions
    };
  })
    .sort((a, b) => b.scoreGlobal - a.scoreGlobal);

  // Assigner les rangs
  ranked.forEach((r, i) => { r.rang = i + 1; });

  return ranked;
}

/**
 * Attribue le bonus au chauffeur #1 et envoie les notifications
 */
async function awardBonus(entrepriseId) {
  try {
    const { start, end } = getPreviousWeekRange();
    const weekKey = `${entrepriseId || 'g'}_${start}`;

    // Eviter les doubles executions
    if (_lastRunWeek === weekKey) {
      return;
    }

    // Verifier si un bonus a deja ete attribue pour cette semaine
    const existingBonus = await Versement.findOne({
      source: 'bonus',
      date: { $gte: start, $lte: end },
      ...(entrepriseId ? { entrepriseId } : {})
    }).lean();

    if (existingBonus) {
      console.log(`[BonusCron] Bonus deja attribue pour la semaine ${start} - ${end}`);
      _lastRunWeek = weekKey;
      return;
    }

    const ranking = await computeWeeklyRanking(start, end, entrepriseId);
    if (ranking.length === 0) {
      console.log('[BonusCron] Aucun chauffeur actif — pas de bonus');
      return;
    }

    const winner = ranking[0];
    if (winner.scoreGlobal <= 0) {
      console.log('[BonusCron] Score #1 = 0 — pas de bonus');
      return;
    }

    // Formater les dates pour l'affichage
    const fmtDate = (dateStr) => {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}`;
    };

    const commentaire = `Bonus meilleur chauffeur semaine du ${fmtDate(start)} au ${fmtDate(end)}`;

    // Creer le versement bonus
    const versementId = 'V-BONUS-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    const today = new Date().toISOString().split('T')[0];

    const bonusVersement = new Versement({
      id: versementId,
      entrepriseId: entrepriseId || undefined,
      chauffeurId: winner.chauffeurId,
      vehiculeId: '',
      date: today,
      montantBrut: 0,
      montantNet: 0,
      montantVerse: BONUS_AMOUNT,
      statut: 'valide',
      commentaire,
      source: 'bonus',
      traitementManquant: null,
      manquant: 0,
      dateCreation: new Date().toISOString()
    });

    await bonusVersement.save();

    console.log(`[BonusCron] Bonus ${BONUS_AMOUNT} FCFA attribue a ${winner.prenom} ${winner.nom} (score: ${winner.scoreGlobal}) — semaine ${start} a ${end}`);

    // Envoyer la notification push au gagnant
    try {
      await notifService.notify(
        winner.chauffeurId,
        'bonus',
        'Meilleur chauffeur de la semaine !',
        `Felicitations ${winner.prenom} ! Vous etes le meilleur chauffeur de la semaine et recevez un bonus de ${BONUS_AMOUNT.toLocaleString('fr-FR')} FCFA !`,
        'push',
        { url: '/driver/#/classement' }
      );
    } catch (notifErr) {
      console.warn('[BonusCron] Erreur notification push:', notifErr.message);
    }

    // Logger le top 3
    const top3 = ranking.slice(0, 3);
    console.log('[BonusCron] Top 3 de la semaine:');
    top3.forEach(r => {
      console.log(`  #${r.rang} ${r.prenom} ${r.nom} — Score: ${r.scoreGlobal} | CA: ${r.ca} | Conduite: ${r.scoreConduite}`);
    });

    _lastRunWeek = weekKey;
  } catch (err) {
    console.error('[BonusCron] Erreur attribution bonus:', err.message);
  }
}

/**
 * Execution principale — verifie si c'est le bon moment
 */
async function runCheck() {
  try {
    const now = new Date();
    // Executer uniquement le lundi entre 1h et 2h du matin (UTC)
    if (now.getDay() !== 1 || now.getHours() < 1 || now.getHours() >= 2) {
      return;
    }

    console.log('[BonusCron] Lundi 1h — calcul du bonus hebdomadaire...');

    await forEachTenant(async (entrepriseId) => {
      await awardBonus(entrepriseId);
    });
  } catch (err) {
    console.error('[BonusCron] Erreur globale:', err.message);
  }
}

function start() {
  console.log('[BonusCron] Demarrage — verification toutes les heures (bonus chaque lundi 1h)');

  // Premier check 2 minutes apres le demarrage
  setTimeout(() => runCheck(), 2 * 60 * 1000);

  // Puis toutes les heures
  _interval = setInterval(() => runCheck(), 60 * 60 * 1000);
}

function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = { start, stop, computeWeeklyRanking, getPreviousWeekRange, BONUS_AMOUNT };
