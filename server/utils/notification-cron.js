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
const Planning = require('../models/Planning');
const Absence = require('../models/Absence');
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

    // Charger les chauffeurs actifs (nécessaire pour tous les checks)
    const chauffeurs = await Chauffeur.find({ statut: 'actif' }).lean();
    if (chauffeurs.length === 0) return;

    // === CHECK 6 : Dettes automatiques (TOUJOURS, indépendant des settings notif) ===
    await checkMissingPaymentDebts(chauffeurs, null);

    // Charger les settings pour les notifications
    const settings = await Settings.findOne().lean();
    if (!settings || !settings.notifications) return;

    const notifSettings = settings.notifications;

    // Verifier si au moins un canal est actif
    if (!notifSettings.pushActif && !notifSettings.smsActif && !notifSettings.whatsappActif) return;

    // Determiner le canal optimal selon les toggles actifs
    const canaux = [];
    if (notifSettings.pushActif) canaux.push('push');
    if (notifSettings.smsActif) canaux.push('sms');
    if (notifSettings.whatsappActif) canaux.push('whatsapp');

    let canal;
    if (canaux.length === 3) canal = 'all';
    else if (canaux.length === 2) {
      if (canaux.includes('push') && canaux.includes('sms')) canal = 'both';
      else if (canaux.includes('push') && canaux.includes('whatsapp')) canal = 'push+whatsapp';
      else canal = 'sms+whatsapp';
    } else canal = canaux[0];

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

    // === CHECK 5 : Resume hebdomadaire (dimanche) ===
    if (now.getDay() === 0) {
      await checkWeeklySummary(chauffeurs, canal);
    }

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

        // Escalade predictive : si a_venir mais prediction < 14 jours, passer en urgent
        if (!isEnRetard && !isUrgent && m.prochainKm && vehicule.kilometrage && vehicule.chauffeurAssigne) {
          if (!vehicule._kmParJour) {
            // Calculer kmParJour une seule fois par vehicule (cache sur l'objet)
            const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const gpsRecent = await Gps.find({ chauffeurId: vehicule.chauffeurAssigne, date: { $gte: thirtyDaysAgo.toISOString().split('T')[0] } }).lean();
            let totalKm = 0, activeDays = 0;
            for (const g of gpsRecent) { const dist = g.evenements ? (g.evenements.distanceParcourue || 0) : 0; if (dist > 0) { totalKm += dist; activeDays++; } }
            vehicule._kmParJour = activeDays > 0 ? Math.round(totalKm / activeDays) : 0;
          }
          if (vehicule._kmParJour > 0) {
            const kmRestant = m.prochainKm - vehicule.kilometrage;
            const joursEstimes = kmRestant > 0 ? Math.round(kmRestant / vehicule._kmParJour) : 0;
            if (joursEstimes < 14) {
              isUrgent = true;
              detail = detail ? detail + ` / prediction ~${joursEstimes}j` : `prediction ~${joursEstimes}j`;
            }
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
                isEnRetard ? 'maintenance_retard' : 'maintenance_urgente',
                titre,
                message,
                canal,
                { url: '/driver/#/maintenance' }
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

// ===================== CHECK : RESUME HEBDOMADAIRE =====================

async function checkWeeklySummary(chauffeurs, canal) {
  try {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(monday.getDate() - 6);
    const mondayStr = monday.toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    for (const c of chauffeurs) {
      const key = `weekly_summary_${c.id}_${todayStr}`;
      if (_sentToday.has(key)) continue;

      // Fetch GPS data de la semaine
      const gpsRecords = await Gps.find({
        chauffeurId: c.id,
        date: { $gte: mondayStr, $lte: todayStr }
      }).lean();

      if (gpsRecords.length === 0) continue;

      const totalDistance = gpsRecords.reduce((sum, g) => sum + (g.distanceKm || 0), 0);
      const totalHeures = gpsRecords.reduce((sum, g) => sum + (g.heuresConduite || 0), 0);
      const avgScore = Math.round(gpsRecords.reduce((sum, g) => sum + (g.scoreGlobal || 0), 0) / gpsRecords.length);
      const joursActifs = gpsRecords.length;

      const message = `${c.prenom}, votre semaine en resume : ${joursActifs} jour(s) actif(s), ${Math.round(totalDistance)} km, ${totalHeures.toFixed(1)}h de conduite. Score moyen : ${avgScore}/100. Bonne semaine !`;

      await notifService.notify(
        c.id,
        'resume_hebdo',
        'Resume de la semaine',
        message,
        canal,
        { url: '/driver/#/accueil' }
      );
      _sentToday.add(key);
    }
  } catch (err) {
    console.error('[NotifCron] Erreur check weekly summary:', err.message);
  }
}

// ===================== CHECK : DETTES AUTOMATIQUES =====================

/**
 * Vérifie les jours programmés passés sans versement validé.
 * Pour chaque jour manquant, crée un versement avec dette = redevance complète.
 * Ne vérifie que les 7 derniers jours pour éviter de remonter trop loin.
 */
async function checkMissingPaymentDebts(chauffeurs, canal) {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Ne vérifier que les jours passés (hier et les 6 jours précédents)
    const dates = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    if (dates.length === 0) return;

    // Charger les plannings des 7 derniers jours
    const plannings = await Planning.find({
      date: { $in: dates }
    }).lean();

    if (plannings.length === 0) return;

    // Charger les absences couvrant cette période
    const minDate = dates[dates.length - 1];
    const maxDate = dates[0];
    const absences = await Absence.find({
      $or: [
        { dateDebut: { $lte: maxDate }, dateFin: { $gte: minDate } }
      ]
    }).lean();

    // Charger les versements existants pour ces dates
    const versements = await Versement.find({
      date: { $in: dates }
    }).lean();

    // Construire un Set des versements existants (chauffeurId|date)
    const versementKeys = new Set();
    versements.forEach(v => {
      versementKeys.add(`${v.chauffeurId}|${v.date}`);
    });

    // Map des chauffeurs pour lookup rapide
    const chauffeurMap = {};
    chauffeurs.forEach(c => { chauffeurMap[c.id] = c; });

    let created = 0;

    for (const p of plannings) {
      const ch = chauffeurMap[p.chauffeurId];
      if (!ch || ch.statut === 'inactif') continue;

      // Vérifier si le chauffeur était en absence ce jour-là
      const hasAbsence = absences.some(a =>
        a.chauffeurId === p.chauffeurId && p.date >= a.dateDebut && p.date <= a.dateFin
      );
      if (hasAbsence) continue;

      // Calculer la redevance
      const redevance = (p.redevanceOverride != null && p.redevanceOverride > 0)
        ? p.redevanceOverride
        : (ch.redevanceQuotidienne || 0);
      if (redevance <= 0) continue;

      // Vérifier si un versement existe déjà pour ce chauffeur/date
      const key = `${p.chauffeurId}|${p.date}`;
      if (versementKeys.has(key)) continue;

      // Clé anti-doublon pour le cron (ne créer qu'une fois par jour de check)
      const cronKey = `auto_dette_${p.chauffeurId}_${p.date}`;
      if (_sentToday.has(cronKey)) continue;

      // Créer le versement-dette
      const versementId = 'V-DETTE-' + Math.random().toString(36).substr(2, 8).toUpperCase();
      await Versement.create({
        id: versementId,
        chauffeurId: p.chauffeurId,
        vehiculeId: ch.vehiculeAssigne || '',
        date: p.date,
        montantBrut: 0,
        montantNet: 0,
        montantVerse: 0,
        statut: 'retard',
        manquant: redevance,
        traitementManquant: 'dette',
        commentaire: `Auto: dette — aucun versement le ${p.date}`,
        dateCreation: new Date().toISOString()
      });

      versementKeys.add(key); // Éviter les doublons si plusieurs plannings même jour
      _sentToday.add(cronKey);
      created++;

      // Notifier le chauffeur (1 seule fois par jour manquant, seulement si canal dispo)
      if (canal) {
        const notifKey = `dette_notif_${p.chauffeurId}_${p.date}`;
        if (!_sentToday.has(notifKey)) {
          try {
            await notifService.notify(
              p.chauffeurId,
              'dette_auto',
              'Versement manquant — dette ajoutée',
              `${ch.prenom}, aucun versement reçu pour le ${p.date}. Une dette de ${redevance.toLocaleString('fr-FR')} FCFA a été ajoutée.`,
              canal,
              { url: '/driver/#/versements' }
            );
          } catch (notifErr) {
            console.warn(`[NotifCron] Notif dette échouée pour ${ch.prenom}:`, notifErr.message);
          }
          _sentToday.add(notifKey);
        }
      }
    }

    if (created > 0) {
      console.log(`[NotifCron] ${created} dette(s) automatique(s) créée(s)`);
    }
  } catch (err) {
    console.error('[NotifCron] Erreur check dettes automatiques:', err.message);
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
