/**
 * Deadline utility — Calcul des deadlines de versement
 *
 * Supporte 3 types de deadline :
 * - quotidien : chaque jour du lundi au samedi (dimanche = repos, deadline reportée à lundi)
 * - hebdomadaire : un jour fixe de la semaine
 * - mensuel : un jour fixe du mois
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

  if (vs.deadlineType === 'quotidien') {
    // Deadline chaque jour lundi-samedi
    // Dimanche = pas de deadline → prochaine = lundi
    const deadline = new Date(now);
    deadline.setHours(hh, mm, 0, 0);

    // Si on est aujourd'hui avant l'heure limite ET c'est un jour ouvré (lun-sam)
    const dayOfWeek = now.getDay(); // 0=Dim, 1=Lun, ..., 6=Sam

    if (dayOfWeek >= 1 && dayOfWeek <= 6 && deadline > now) {
      // Aujourd'hui est un jour ouvré et la deadline n'est pas encore passée
      // deadline = aujourd'hui à l'heure limite
    } else {
      // La deadline d'aujourd'hui est passée OU c'est dimanche → aller au prochain jour ouvré
      deadline.setDate(deadline.getDate() + 1);
      // Avancer jusqu'au prochain lun-sam
      while (deadline.getDay() === 0) {
        deadline.setDate(deadline.getDate() + 1);
      }
      deadline.setHours(hh, mm, 0, 0);
    }

    // Deadline précédente = le dernier jour ouvré précédent
    const previous = new Date(deadline);
    previous.setDate(previous.getDate() - 1);
    // Reculer si on tombe sur un dimanche
    while (previous.getDay() === 0) {
      previous.setDate(previous.getDate() - 1);
    }
    previous.setHours(hh, mm, 0, 0);

    return {
      deadlineDate: deadline,
      remainingMs: deadline - now,
      previousDeadline: previous
    };
  }

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
 * @param {Object} vs - settings.versements
 * @param {Date} [now] - Date actuelle
 * @returns {boolean}
 */
function isLateNow(vs, now = new Date()) {
  const info = getNextDeadline(vs, now);
  if (!info) return false;
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
