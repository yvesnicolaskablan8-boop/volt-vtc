/**
 * YangoCron — Planificateur de synchronisation Yango
 *
 * Execute la sync Yango chaque nuit a 2h du matin (heure serveur)
 * Pas de dependance externe — utilise setInterval + check d'heure
 */

const { syncYangoActivity } = require('./yango-sync');

let _lastSyncDate = null;
let _interval = null;
let _enabled = true;

/**
 * Demarre le CRON de synchronisation Yango
 * Verifie toutes les 15 minutes si c'est l'heure de sync (2h du matin)
 */
function start() {
  if (_interval) return;

  console.log('[YangoCron] Planificateur demarré — sync quotidienne a 02:00');

  // Verifier toutes les 15 minutes
  _interval = setInterval(() => {
    if (!_enabled) return;

    const now = new Date();
    const hour = now.getHours();
    const todayStr = now.toISOString().split('T')[0];

    // Sync a 2h du matin, une seule fois par jour
    if (hour === 2 && _lastSyncDate !== todayStr) {
      _lastSyncDate = todayStr;
      console.log(`[YangoCron] Lancement de la sync automatique pour hier...`);

      syncYangoActivity() // Par defaut sync la veille
        .then(result => {
          console.log(`[YangoCron] Sync OK: ${result.matched} chauffeurs, ${result.updated + result.created} GPS mis a jour`);
        })
        .catch(err => {
          console.error('[YangoCron] Erreur sync:', err.message);
        });
    }
  }, 15 * 60 * 1000); // Toutes les 15 minutes
}

/**
 * Stoppe le CRON
 */
function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  console.log('[YangoCron] Planificateur arrêté');
}

/**
 * Active/desactive le CRON
 */
function setEnabled(enabled) {
  _enabled = enabled;
  console.log(`[YangoCron] ${enabled ? 'Activé' : 'Désactivé'}`);
}

/**
 * Retourne le statut du CRON
 */
function getStatus() {
  return {
    running: !!_interval,
    enabled: _enabled,
    lastSyncDate: _lastSyncDate
  };
}

module.exports = { start, stop, setEnabled, getStatus };
