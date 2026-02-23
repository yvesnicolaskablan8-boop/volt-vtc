/**
 * NotificationCron — Planificateur de notifications automatiques
 *
 * Verifie toutes les 15 minutes si des notifications doivent etre envoyees :
 * 1. Rappels deadline versement (24h avant, 1h avant)
 * 2. Expiration documents (30 jours, 7 jours)
 * 3. Score conduite faible
 *
 * Utilise un Set de cles pour eviter les doublons par jour
 */

const Settings = require('../models/Settings');
const Chauffeur = require('../models/Chauffeur');
const Vehicule = require('../models/Vehicule');
const Versement = require('../models/Versement');
const Gps = require('../models/Gps');
const Notification = require('../models/Notification');
const { getNextDeadline } = require('./deadline');
const notifService = require('./notification-service');

let _interval = null;
let _enabled = true;
let _sentToday = new Set(); // Cles des notifs deja envoyees aujourd'hui
let _lastDateStr = '';

/**
 * Demarre le CRON de notifications
 * Verifie toutes les 15 minutes
 */
function start() {
  if (_interval) return;

  console.log('[NotifCron] Planificateur demarré — checks toutes les 15 min');

  // Premier check apres 1 minute (laisser le serveur demarrer)
  setTimeout(() => runChecks(), 60 * 1000);

  // Puis toutes les 15 minutes
  _interval = setInterval(() => {
    if (!_enabled) return;
    runChecks();
  }, 15 * 60 * 1000);
}

/**
 * Stoppe le CRON
 */
function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  console.log('[NotifCron] Planificateur arrêté');
}

/**
 * Active/desactive le CRON
 */
function setEnabled(enabled) {
  _enabled = enabled;
  console.log(`[NotifCron] ${enabled ? 'Activé' : 'Désactivé'}`);
}

/**
 * Retourne le statut du CRON
 */
function getStatus() {
  return {
    running: !!_interval,
    enabled: _enabled,
    sentToday: _sentToday.size,
    lastDate: _lastDateStr
  };
}

/**
 * Execute tous les checks de notifications
 */
async function runChecks() {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Reset les cles si nouveau jour
    if (todayStr !== _lastDateStr) {
      _sentToday = new Set();
      _lastDateStr = todayStr;
    }

    // Charger les settings
    const settings = await Settings.findOne().lean();
    if (!settings || !settings.notifications) return;

    const notifSettings = settings.notifications;

    // Verifier si au moins un canal est actif
    if (!notifSettings.pushActif && !notifSettings.smsActif) return;

    const canal = notifSettings.smsActif && notifSettings.pushActif ? 'both'
      : notifSettings.smsActif ? 'sms' : 'push';

    // Charger les chauffeurs actifs
    const chauffeurs = await Chauffeur.find({ statut: 'actif' }).lean();
    if (chauffeurs.length === 0) return;

    // === CHECK 1 : Deadline versement ===
    if (notifSettings.rappelDeadline24h || notifSettings.rappelDeadline1h) {
      await checkDeadlineReminders(chauffeurs, settings, canal, now);
    }

    // === CHECK 2 : Documents expiration ===
    if (notifSettings.alerteDocuments30j || notifSettings.alerteDocuments7j) {
      await checkDocumentExpiration(chauffeurs, notifSettings, canal, now);
    }

    // === CHECK 3 : Score conduite ===
    if (notifSettings.alerteScoreFaible) {
      await checkLowScores(chauffeurs, notifSettings, canal);
    }

    // === CHECK 4 : Maintenances planifiees ===
    await checkMaintenancesPlanifiees(chauffeurs, canal);

  } catch (err) {
    console.error('[NotifCron] Erreur:', err.message);
  }
}

// ===================== CHECK : DEADLINE VERSEMENT =====================

async function checkDeadlineReminders(chauffeurs, settings, canal, now) {
  const vs = settings.versements;
  if (!vs || !vs.deadlineType) return;

  const deadlineInfo = getNextDeadline(vs);
  if (!deadlineInfo) return;

  const remainingMs = deadlineInfo.remainingMs;
  const remainingH = remainingMs / (3600 * 1000);

  // Pas de rappel si deadline passee ou trop loin
  if (remainingMs <= 0 || remainingH > 25) {
    // Si deadline passee, verifier les retards
    if (remainingMs <= 0) {
      await checkLatePayments(chauffeurs, deadlineInfo, settings, canal);
    }
    return;
  }

  const notifSettings = settings.notifications;

  for (const c of chauffeurs) {
    // Verifier si le chauffeur a deja paye pour cette periode
    const versementPeriode = await Versement.findOne({
      chauffeurId: c.id,
      dateCreation: { $gte: deadlineInfo.previousDeadline.toISOString() }
    }).lean();

    if (versementPeriode) continue; // Deja paye

    // Rappel 24h
    if (notifSettings.rappelDeadline24h && remainingH <= 24 && remainingH > 1) {
      const key = `deadline_24h_${c.id}_${deadlineInfo.deadlineDate.toISOString().split('T')[0]}`;
      if (!_sentToday.has(key)) {
        const heures = Math.floor(remainingH);
        await notifService.notify(
          c.id,
          'deadline_rappel',
          'Rappel versement',
          `${c.prenom}, il vous reste ${heures}h pour effectuer votre versement. Deadline : ${formatTime(deadlineInfo.deadlineDate)}`,
          canal,
          { url: '/driver/#/versements' }
        );
        _sentToday.add(key);
      }
    }

    // Rappel 1h
    if (notifSettings.rappelDeadline1h && remainingH <= 1 && remainingH > 0) {
      const key = `deadline_1h_${c.id}_${deadlineInfo.deadlineDate.toISOString().split('T')[0]}`;
      if (!_sentToday.has(key)) {
        const minutes = Math.floor(remainingH * 60);
        await notifService.notify(
          c.id,
          'deadline_rappel',
          'URGENT — Versement imminent',
          `${c.prenom}, plus que ${minutes} minutes ! Faites votre versement maintenant pour eviter la penalite.`,
          canal,
          { url: '/driver/#/versements' }
        );
        _sentToday.add(key);
      }
    }
  }
}

// ===================== CHECK : RETARDS =====================

async function checkLatePayments(chauffeurs, deadlineInfo, settings, canal) {
  const notifSettings = settings.notifications;

  for (const c of chauffeurs) {
    const versementPeriode = await Versement.findOne({
      chauffeurId: c.id,
      dateCreation: { $gte: deadlineInfo.previousDeadline.toISOString() }
    }).lean();

    if (versementPeriode) continue; // A paye

    const key = `deadline_retard_${c.id}_${deadlineInfo.deadlineDate.toISOString().split('T')[0]}`;
    if (_sentToday.has(key)) continue;

    // Notifier le chauffeur
    await notifService.notify(
      c.id,
      'deadline_retard',
      'Versement en retard',
      `${c.prenom}, votre deadline de versement est depassee. ${settings.versements.penaliteActive ? 'Une penalite sera appliquee.' : 'Veuillez regulariser.'}`,
      canal,
      { url: '/driver/#/versements' }
    );
    _sentToday.add(key);

    // Notifier l'admin si active
    if (notifSettings.alerteAdminRetard) {
      const adminKey = `admin_retard_${c.id}_${deadlineInfo.deadlineDate.toISOString().split('T')[0]}`;
      if (!_sentToday.has(adminKey)) {
        await notifService.notifyAdmin(
          'Retard de versement',
          `${c.prenom} ${c.nom} n'a pas effectue son versement a temps.`,
          settings
        );
        _sentToday.add(adminKey);
      }
    }
  }
}

// ===================== CHECK : DOCUMENTS =====================

async function checkDocumentExpiration(chauffeurs, notifSettings, canal, now) {
  const MS_PAR_JOUR = 24 * 3600 * 1000;

  for (const c of chauffeurs) {
    const docs = c.documents || [];

    for (const doc of docs) {
      if (!doc.dateExpiration) continue;

      const expDate = new Date(doc.dateExpiration);
      const joursRestants = Math.floor((expDate - now) / MS_PAR_JOUR);

      // Alerte 30 jours
      if (notifSettings.alerteDocuments30j && joursRestants <= 30 && joursRestants > 7) {
        const key = `doc_30j_${c.id}_${doc.nom}_${doc.dateExpiration}`;
        if (!_sentToday.has(key)) {
          await notifService.notify(
            c.id,
            'document_expiration',
            'Document bientot expire',
            `${c.prenom}, votre ${doc.nom} expire dans ${joursRestants} jours (${formatDate(expDate)}). Pensez a le renouveler.`,
            canal
          );
          _sentToday.add(key);
        }
      }

      // Alerte 7 jours
      if (notifSettings.alerteDocuments7j && joursRestants <= 7 && joursRestants >= 0) {
        const key = `doc_7j_${c.id}_${doc.nom}_${doc.dateExpiration}`;
        if (!_sentToday.has(key)) {
          await notifService.notify(
            c.id,
            'document_expiration',
            joursRestants === 0 ? 'Document expire aujourd\'hui !' : 'Document expire bientot',
            `${c.prenom}, votre ${doc.nom} expire ${joursRestants === 0 ? 'AUJOURD\'HUI' : `dans ${joursRestants} jour(s)`}. Renouvellement urgent.`,
            canal
          );
          _sentToday.add(key);
        }
      }
    }
  }
}

// ===================== CHECK : SCORE CONDUITE =====================

async function checkLowScores(chauffeurs, notifSettings, canal) {
  const seuil = notifSettings.scoreSeuilAlerte || 60;

  for (const c of chauffeurs) {
    const score = c.scoreConduite;
    if (score === null || score === undefined || score >= seuil) continue;

    const key = `score_faible_${c.id}_${_lastDateStr}`;
    if (_sentToday.has(key)) continue;

    await notifService.notify(
      c.id,
      'score_faible',
      'Score de conduite faible',
      `${c.prenom}, votre score de conduite est de ${score}/100. Ameliorez votre conduite pour atteindre ${seuil}+ et debloquer votre bonus.`,
      canal,
      { url: '/driver/#/profil' }
    );
    _sentToday.add(key);
  }
}

// ===================== CHECK : MAINTENANCES PLANIFIEES =====================

async function checkMaintenancesPlanifiees(chauffeurs, canal) {
  try {
    const vehicules = await Vehicule.find({ statut: 'en_service' });
    const now = new Date();
    const MS_PAR_JOUR = 24 * 3600 * 1000;

    for (const vehicule of vehicules) {
      const maintenances = vehicule.maintenancesPlanifiees || [];
      let modified = false;

      for (const m of maintenances) {
        if (m.statut === 'complete') continue;

        let isUrgent = false;
        let isEnRetard = false;
        let detail = '';

        // Check par km
        if ((m.declencheur === 'km' || m.declencheur === 'les_deux') && m.prochainKm) {
          const kmRestant = m.prochainKm - vehicule.kilometrage;
          if (kmRestant <= 0) {
            isEnRetard = true;
            detail = `depasse de ${Math.abs(kmRestant)} km`;
          } else if (kmRestant <= 500) {
            isUrgent = true;
            detail = `dans ${kmRestant} km`;
          }
        }

        // Check par temps
        if ((m.declencheur === 'temps' || m.declencheur === 'les_deux') && m.prochaineDate) {
          const prochaineDate = new Date(m.prochaineDate);
          const joursRestants = Math.floor((prochaineDate - now) / MS_PAR_JOUR);
          if (joursRestants < 0) {
            isEnRetard = true;
            detail = detail ? detail + ` et ${Math.abs(joursRestants)} jours de retard` : `${Math.abs(joursRestants)} jours de retard`;
          } else if (joursRestants <= 7) {
            if (!isEnRetard) isUrgent = true;
            const timeDetail = `dans ${joursRestants} jour(s)`;
            detail = detail ? detail + ` / ${timeDetail}` : timeDetail;
          }
        }

        // Mettre a jour le statut
        const newStatut = isEnRetard ? 'en_retard' : isUrgent ? 'urgent' : 'a_venir';
        if (m.statut !== newStatut) {
          m.statut = newStatut;
          modified = true;
        }

        // Envoyer notification si urgent ou en retard
        if (isUrgent || isEnRetard) {
          const typeLabels = {
            vidange: 'Vidange', revision: 'Revision', pneus: 'Pneus', freins: 'Freins',
            filtres: 'Filtres', climatisation: 'Climatisation', courroie: 'Courroie',
            controle_technique: 'Controle technique', batterie: 'Batterie',
            amortisseurs: 'Amortisseurs', echappement: 'Echappement',
            carrosserie: 'Carrosserie', autre: 'Entretien'
          };
          const typeLabel = typeLabels[m.type] || m.label || m.type;
          const vLabel = `${vehicule.marque} ${vehicule.modele} (${vehicule.immatriculation})`;

          // Notifier le chauffeur assigne
          if (vehicule.chauffeurAssigne) {
            const key = `maintenance_${m.id}_${vehicule.chauffeurAssigne}_${_lastDateStr}`;
            if (!_sentToday.has(key)) {
              const chauffeur = chauffeurs.find(c => c.id === vehicule.chauffeurAssigne);
              const prenom = chauffeur ? chauffeur.prenom : 'Chauffeur';
              const titre = isEnRetard ? `Maintenance en retard : ${typeLabel}` : `Maintenance imminente : ${typeLabel}`;
              const message = isEnRetard
                ? `${prenom}, ${typeLabel.toLowerCase()} sur ${vLabel} est en retard (${detail}). Contactez votre gestionnaire.`
                : `${prenom}, ${typeLabel.toLowerCase()} sur ${vLabel} est prevue ${detail}. Contactez votre gestionnaire.`;

              await notifService.notify(
                vehicule.chauffeurAssigne,
                isEnRetard ? 'deadline_retard' : 'deadline_rappel',
                titre,
                message,
                canal,
                { url: '/driver/#/accueil' }
              );
              _sentToday.add(key);
            }
          }
        }
      }

      // Sauvegarder si statuts modifies
      if (modified) {
        await vehicule.save();
      }
    }
  } catch (err) {
    console.error('[NotifCron] Erreur check maintenances:', err.message);
  }
}

// ===================== HELPERS =====================

function formatTime(date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

module.exports = { start, stop, setEnabled, getStatus, runChecks };
