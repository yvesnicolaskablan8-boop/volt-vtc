/**
 * BehaviorCron — Finalisation automatique des sessions de conduite
 *
 * S'execute chaque nuit a 3h du matin (apres la sync Yango a 2h).
 * Recherche toutes les sessions ConduiteBrute de la veille qui n'ont pas
 * ete finalisees (scoreCalcule = false) et les finalise automatiquement.
 *
 * Cas couverts :
 * - Chauffeur qui oublie de terminer son service
 * - App fermee sans fin de service
 * - Deconnexion intempestive
 *
 * Pas de dependance externe — utilise setInterval + check d'heure
 */

const ConduiteBrute = require('../models/ConduiteBrute');
const { finalizeBehaviorSession } = require('./behavior-utils');
const { forEachTenant } = require('./tenant-iterator');

let _lastRunDate = null;
let _interval = null;
let _enabled = true;

/**
 * Demarre le CRON de finalisation comportement
 * Verifie toutes les 15 minutes si c'est l'heure (3h du matin)
 */
function start() {
  if (_interval) return;

  console.log('[BehaviorCron] Planificateur demarre — finalisation quotidienne a 03:00');

  _interval = setInterval(() => {
    if (!_enabled) return;

    const now = new Date();
    const hour = now.getHours();
    const todayStr = now.toISOString().split('T')[0];

    // Executer a 3h du matin, une seule fois par jour
    if (hour === 3 && _lastRunDate !== todayStr) {
      _lastRunDate = todayStr;
      console.log('[BehaviorCron] Lancement de la finalisation automatique...');
      runFinalization()
        .then(result => {
          console.log(`[BehaviorCron] Finalisation OK: ${result.found} sessions trouvees, ${result.finalized} finalisees, ${result.skipped} deja finalisees, ${result.errors} erreurs`);
        })
        .catch(err => {
          console.error('[BehaviorCron] Erreur finalisation:', err.message);
        });
    }
  }, 15 * 60 * 1000); // Toutes les 15 minutes
}

/**
 * Execute la finalisation des sessions non finalisees
 * Cherche les sessions de la veille ET des jours precedents (jusqu'a 7 jours)
 */
async function runFinalization() {
  const result = { found: 0, finalized: 0, skipped: 0, errors: 0 };

  await forEachTenant(async (entrepriseId) => {
    // Chercher les sessions non finalisees des 7 derniers jours
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    // Aujourd'hui (on ne finalise pas le jour en cours)
    const todayStr = new Date().toISOString().split('T')[0];

    const sessionFilter = {
      scoreCalcule: { $ne: true },
      date: { $gte: sevenDaysAgoStr, $lt: todayStr }
    };
    if (entrepriseId) sessionFilter.entrepriseId = entrepriseId;

    const pendingSessions = await ConduiteBrute.find(sessionFilter).lean();

    result.found += pendingSessions.length;

    if (pendingSessions.length === 0) {
      return;
    }

    for (const session of pendingSessions) {
      try {
        // Extraire le chauffeurId du session.id (format: CB-{chauffeurId}-{date})
        const parts = session.id.split('-');
        const chauffeurId = parts.slice(1, -3).join('-'); // Tout sauf CB- et -YYYY-MM-DD
        const date = session.date;

        if (!chauffeurId || !date) {
          console.warn(`[BehaviorCron] Session ${session.id} — impossible d'extraire chauffeurId/date`);
          result.errors++;
          continue;
        }

        // Verifier qu'il y a des donnees exploitables
        const hasGpsSamples = session.gpsSamples && session.gpsSamples.length > 0;
        const hasEvents = session.evenements && session.evenements.length > 0;

        if (!hasGpsSamples && !hasEvents) {
          // Session vide — marquer comme calculee sans score
          await ConduiteBrute.findOneAndUpdate(
            { id: session.id },
            { $set: { scoreCalcule: true, sessionFin: new Date().toISOString() } }
          );
          result.skipped++;
          console.log(`[BehaviorCron] Session ${session.id} — vide, marquee comme traitee`);
          continue;
        }

        const finalResult = await finalizeBehaviorSession(chauffeurId, date);

        if (finalResult && finalResult.success) {
          result.finalized++;
          console.log(`[BehaviorCron] Session ${session.id} finalisee — score: ${finalResult.scores.scoreGlobal}/100`);
        } else {
          result.skipped++;
        }
      } catch (err) {
        result.errors++;
        console.error(`[BehaviorCron] Erreur session ${session.id}:`, err.message);
      }
    }
  });

  if (result.found === 0) {
    console.log('[BehaviorCron] Aucune session en attente de finalisation');
  }

  return result;
}

/**
 * Stoppe le CRON
 */
function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  console.log('[BehaviorCron] Planificateur arrete');
}

/**
 * Active/desactive le CRON
 */
function setEnabled(enabled) {
  _enabled = enabled;
  console.log(`[BehaviorCron] ${enabled ? 'Active' : 'Desactive'}`);
}

/**
 * Retourne le statut du CRON
 */
function getStatus() {
  return {
    running: !!_interval,
    enabled: _enabled,
    lastRunDate: _lastRunDate
  };
}

module.exports = { start, stop, setEnabled, getStatus, runFinalization };
