/**
 * TacheCron — Generation automatique des taches recurrentes
 *
 * Toutes les 30 minutes, verifie les taches recurrentes dont
 * la prochaineExecution est passee, cree une nouvelle instance
 * et met a jour la prochaine date d'execution.
 */

const Tache = require('../models/Tache');

let _interval = null;

function generateId() {
  return 'TCH-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

/**
 * Calcule la prochaine date d'execution a partir d'aujourd'hui
 */
function calculerProchaineExecution(recurrence, joursSemaine, jourMois, fromDate) {
  const base = fromDate ? new Date(fromDate) : new Date();

  if (recurrence === 'quotidien') {
    const next = new Date(base);
    next.setDate(next.getDate() + 1);
    return next.toISOString().split('T')[0];
  }

  if (recurrence === 'hebdomadaire' && joursSemaine && joursSemaine.length > 0) {
    // Trouver le prochain jour de la semaine
    const today = base.getDay();
    const sorted = [...joursSemaine].sort((a, b) => a - b);

    for (const jour of sorted) {
      if (jour > today) {
        const next = new Date(base);
        next.setDate(next.getDate() + (jour - today));
        return next.toISOString().split('T')[0];
      }
    }
    // Aucun jour restant cette semaine, prendre le premier de la semaine suivante
    const next = new Date(base);
    const daysUntilNext = 7 - today + sorted[0];
    next.setDate(next.getDate() + daysUntilNext);
    return next.toISOString().split('T')[0];
  }

  if (recurrence === 'mensuel' && jourMois) {
    const next = new Date(base);
    // Si le jour du mois est deja passe, aller au mois suivant
    if (next.getDate() >= jourMois) {
      next.setMonth(next.getMonth() + 1);
    }
    next.setDate(Math.min(jourMois, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    return next.toISOString().split('T')[0];
  }

  // Fallback: demain
  const next = new Date(base);
  next.setDate(next.getDate() + 1);
  return next.toISOString().split('T')[0];
}

async function genererTachesRecurrentes() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Trouver toutes les taches recurrentes actives dont la prochaine execution est aujourd'hui ou passee
    const tachesRecurrentes = await Tache.find({
      recurrenceActif: true,
      recurrence: { $ne: 'aucune' },
      prochaineExecution: { $lte: today }
    });

    if (tachesRecurrentes.length === 0) return;

    console.log(`[TacheCron] ${tachesRecurrentes.length} tache(s) recurrente(s) a generer`);

    for (const tacheModele of tachesRecurrentes) {
      try {
        // Creer une nouvelle instance de la tache
        const nouvelleTache = new Tache({
          id: generateId(),
          titre: tacheModele.titre,
          description: tacheModele.description,
          type: tacheModele.type,
          priorite: tacheModele.priorite,
          statut: 'a_faire',
          assigneA: tacheModele.assigneA,
          assigneANom: tacheModele.assigneANom,
          creePar: tacheModele.creePar,
          creeParNom: tacheModele.creeParNom,
          dateEcheance: tacheModele.prochaineExecution,
          dateCreation: new Date().toISOString(),
          dateModification: new Date().toISOString(),
          commentaire: tacheModele.commentaire,
          recurrenceParentId: tacheModele.id
          // Pas de recurrence sur l'instance generee
        });

        await nouvelleTache.save();

        // Calculer la prochaine execution
        const prochaineDate = calculerProchaineExecution(
          tacheModele.recurrence,
          tacheModele.joursSemaine,
          tacheModele.jourMois,
          tacheModele.prochaineExecution
        );

        await Tache.findOneAndUpdate(
          { id: tacheModele.id },
          { $set: { prochaineExecution: prochaineDate, dateModification: new Date().toISOString() } }
        );

        console.log(`[TacheCron] Tache "${tacheModele.titre}" generee → prochaine: ${prochaineDate}`);
      } catch (err) {
        console.error(`[TacheCron] Erreur generation tache "${tacheModele.titre}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[TacheCron] Erreur globale:', err.message);
  }
}

function start() {
  console.log('[TacheCron] Demarrage — verification toutes les 30 minutes');

  // Premiere verification 60s apres le demarrage
  setTimeout(() => genererTachesRecurrentes(), 60000);

  // Puis toutes les 30 minutes
  _interval = setInterval(() => genererTachesRecurrentes(), 30 * 60 * 1000);
}

function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = { start, stop, genererTachesRecurrentes };
