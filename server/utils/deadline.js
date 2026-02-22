/**
 * Deadline utility — Calcul des deadlines de versement
 *
 * Utilisé par le dashboard driver et la création de versements
 * pour déterminer si un versement est en retard et calculer les pénalités.
 */

/**
 * Calcule la prochaine deadline à partir des paramètres versements.
 * @param {Object} vs - settings.versements
 * @param {Date} [now] - Date de référence (default: maintenant)
 * @returns {{ deadlineDate: Date, remainingMs: number, previousDeadline: Date }}
 */
function getNextDeadline(vs, now = new Date()) {
  if (!vs || !vs.deadlineType) return null;

  const [hh, mm] = (vs.deadlineHeure || '23:59').split(':').map(Number);

  if (vs.deadlineType === 'hebdomadaire') {
    // deadlineJour: 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
    const targetDay = vs.deadlineJour || 0;
    const currentDay = now.getDay();

    // Calculer la prochaine occurrence de ce jour
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;

    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + daysUntil);
    deadline.setHours(hh, mm, 0, 0);

    // Si même jour mais heure dépassée, passer à la semaine suivante
    if (deadline <= now) {
      deadline.setDate(deadline.getDate() + 7);
    }

    // Deadline précédente = 7 jours avant la prochaine
    const previous = new Date(deadline);
    previous.setDate(previous.getDate() - 7);

    return {
      deadlineDate: deadline,
      remainingMs: deadline - now,
      previousDeadline: previous
    };
  }

  if (vs.deadlineType === 'mensuel') {
    // deadlineJour: 1-31 (jour du mois)
    const targetDayOfMonth = vs.deadlineJour || 1;

    const deadline = new Date(now.getFullYear(), now.getMonth(), targetDayOfMonth, hh, mm, 0, 0);

    // Si la date est dépassée ce mois, aller au mois suivant
    if (deadline <= now) {
      deadline.setMonth(deadline.getMonth() + 1);
    }

    // Deadline précédente
    const previous = new Date(deadline);
    previous.setMonth(previous.getMonth() - 1);

    return {
      deadlineDate: deadline,
      remainingMs: deadline - now,
      previousDeadline: previous
    };
  }

  return null;
}

/**
 * Vérifie si la date actuelle dépasse la dernière deadline sans versement dans la période.
 * @param {Date} now - Date actuelle
 * @param {Object} vs - settings.versements
 * @returns {boolean}
 */
function isLateNow(vs, now = new Date()) {
  const info = getNextDeadline(vs, now);
  if (!info) return false;

  // On est "en retard" si la deadline précédente est passée
  // et qu'on est entre la previousDeadline et la prochaine deadline
  // La logique est simple: si remainingMs > 0, on n'est PAS en retard pour la PROCHAINE deadline
  // Mais on pourrait être en retard par rapport à la PRÉCÉDENTE deadline
  // Le serveur vérifie au moment de la soumission: si now > previousDeadline, c'est un retard
  return info.previousDeadline < now && now < info.deadlineDate;
}

/**
 * Calcule le montant de la pénalité.
 * @param {number} montantBrut - Montant brut du versement
 * @param {Object} vs - settings.versements
 * @returns {number} Montant de la pénalité (0 si désactivé)
 */
function calculatePenalty(montantBrut, vs) {
  if (!vs || !vs.penaliteActive) return 0;

  if (vs.penaliteType === 'pourcentage') {
    return Math.round(montantBrut * (vs.penaliteValeur || 0) / 100);
  }

  // montant_fixe
  return vs.penaliteValeur || 0;
}

module.exports = { getNextDeadline, isLateNow, calculatePenalty };
