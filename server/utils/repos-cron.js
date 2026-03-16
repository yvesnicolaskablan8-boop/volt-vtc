/**
 * ReposCron — Passage automatique en repos des chauffeurs non planifies
 *
 * Chaque jour (et toutes les 2h), verifie les chauffeurs actifs :
 * - Si pas de planning aujourd'hui → statut = 'repos'
 * - Si planning aujourd'hui et statut = 'repos' → statut = 'actif'
 * - Les chauffeurs 'suspendu' ou 'inactif' ne sont PAS touches
 */

const Chauffeur = require('../models/Chauffeur');
const Planning = require('../models/Planning');

let _interval = null;

async function mettreAJourRepos() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Recuperer tous les plannings du jour
    const planningsAujourdhui = await Planning.find({ date: today });
    const chauffeursPlanifies = new Set(planningsAujourdhui.map(p => p.chauffeurId));

    // Recuperer tous les chauffeurs actifs ou en repos (pas suspendu/inactif)
    const chauffeurs = await Chauffeur.find({
      statut: { $in: ['actif', 'repos'] }
    });

    let misEnRepos = 0;
    let remisActifs = 0;

    for (const c of chauffeurs) {
      const estPlanifie = chauffeursPlanifies.has(c.id);

      if (!estPlanifie && c.statut === 'actif') {
        // Pas planifie aujourd'hui → repos
        await Chauffeur.findOneAndUpdate(
          { id: c.id },
          { $set: { statut: 'repos' } }
        );
        misEnRepos++;
      } else if (estPlanifie && c.statut === 'repos') {
        // Planifie aujourd'hui mais etait en repos → remettre actif
        await Chauffeur.findOneAndUpdate(
          { id: c.id },
          { $set: { statut: 'actif' } }
        );
        remisActifs++;
      }
    }

    if (misEnRepos > 0 || remisActifs > 0) {
      console.log(`[ReposCron] ${misEnRepos} chauffeur(s) mis en repos, ${remisActifs} remis actif(s) pour ${today}`);
    }
  } catch (err) {
    console.error('[ReposCron] Erreur:', err.message);
  }
}

function start() {
  console.log('[ReposCron] Demarrage — verification toutes les 2 heures');

  // Premiere verification 30s apres le demarrage
  setTimeout(() => mettreAJourRepos(), 30000);

  // Puis toutes les 2 heures
  _interval = setInterval(() => mettreAJourRepos(), 2 * 60 * 60 * 1000);
}

function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = { start, stop, mettreAJourRepos };
