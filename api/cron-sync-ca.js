/**
 * Tâche planifiée Vercel (voir « crons » dans vercel.json) : synchronise le CA
 * Yango deux fois par jour, sans qu'un administrateur ait le tableau de bord
 * ouvert. Toute la logique est dans api/yango.js (handleCronSyncCa) ; ce fichier
 * n'existe que pour offrir à Vercel Cron un chemin sans paramètre.
 *
 * Variables d'environnement à poser dans Vercel (par le propriétaire) :
 *   CRON_SECRET                 une longue chaîne aléatoire ; Vercel l'envoie en
 *                               « Authorization: Bearer … » à chaque déclenchement
 *   SUPABASE_SERVICE_ROLE_KEY   clé « service_role » du projet Supabase
 * Tant qu'elles manquent, la tâche répond 503 et ne touche à rien.
 */
const { handleCronSyncCa } = require('./yango.js');

module.exports = async function handler(req, res) {
  return handleCronSyncCa(req, res);
};
