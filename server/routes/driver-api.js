const express = require('express');
const Chauffeur = require('../models/Chauffeur');
const Vehicule = require('../models/Vehicule');
const Planning = require('../models/Planning');
const Absence = require('../models/Absence');
const Versement = require('../models/Versement');
const Signalement = require('../models/Signalement');
const Gps = require('../models/Gps');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const Conversation = require('../models/Conversation');
const { getNextDeadline, calculatePenalty } = require('../utils/deadline');
const notifService = require('../utils/notification-service');

const router = express.Router();

// =================== DASHBOARD ===================

// GET /api/driver/dashboard — Resume agrege pour le chauffeur
router.get('/dashboard', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7); // YYYY-MM

    // Recuperer toutes les donnees en parallele
    const [chauffeur, planningToday, versementsMois, signalements, gpsRecent, settings] = await Promise.all([
      Chauffeur.findOne({ id: chauffeurId }).lean(),
      Planning.findOne({ chauffeurId, date: today }).lean(),
      Versement.find({
        chauffeurId,
        date: { $regex: `^${monthStart}` }
      }).lean(),
      Signalement.find({
        chauffeurId,
        statut: { $in: ['ouvert', 'en_cours'] }
      }).lean(),
      Gps.find({ chauffeurId }).sort({ date: -1 }).limit(1).lean(),
      Settings.findOne().lean()
    ]);

    // Vehicule assigne
    let vehicule = null;
    if (chauffeur && chauffeur.vehiculeAssigne) {
      vehicule = await Vehicule.findOne({ id: chauffeur.vehiculeAssigne }).lean();
      if (vehicule) {
        const { _id, __v, ...v } = vehicule;
        vehicule = v;
      }
    }

    // Stats versements du mois
    const totalBrut = versementsMois.reduce((s, v) => s + (v.montantBrut || 0), 0);
    const totalCommission = versementsMois.reduce((s, v) => s + (v.commission || 0), 0);
    const totalNet = versementsMois.reduce((s, v) => s + (v.montantNet || 0), 0);

    // Creneau du jour
    let creneauJour = null;
    if (planningToday) {
      creneauJour = {
        type: planningToday.typeCreneaux,
        notes: planningToday.notes
      };
    }

    // Score conduite
    const scoreConduite = chauffeur ? chauffeur.scoreConduite : null;
    const dernierGps = gpsRecent.length > 0 ? gpsRecent[0] : null;

    res.json({
      chauffeur: chauffeur ? {
        prenom: chauffeur.prenom,
        nom: chauffeur.nom,
        statut: chauffeur.statut,
        scoreConduite: chauffeur.scoreConduite
      } : null,
      creneauJour,
      vehicule: vehicule ? {
        marque: vehicule.marque,
        modele: vehicule.modele,
        immatriculation: vehicule.immatriculation,
        kilometrage: vehicule.kilometrage,
        typeEnergie: vehicule.typeEnergie
      } : null,
      statsMois: {
        totalBrut,
        totalCommission,
        totalNet,
        nbVersements: versementsMois.length
      },
      scoreConduite: dernierGps ? dernierGps.scoreGlobal : scoreConduite,
      alertesActives: signalements.length,
      dateJour: today,
      deadline: await (async () => {
        const vs = settings && settings.versements;
        if (!vs || !vs.deadlineType) return null;
        const info = getNextDeadline(vs);
        if (!info) return null;
        // Verifier si un versement a deja ete fait pour la periode en cours
        const versementPeriode = await Versement.findOne({
          chauffeurId,
          dateCreation: { $gte: info.previousDeadline.toISOString() }
        }).lean();
        return {
          configured: true,
          deadlineDate: info.deadlineDate.toISOString(),
          remainingMs: info.remainingMs,
          deadlineType: vs.deadlineType,
          penaliteActive: vs.penaliteActive || false,
          penaliteType: vs.penaliteType || 'pourcentage',
          penaliteValeur: vs.penaliteValeur || 0,
          alreadyPaid: !!versementPeriode
        };
      })(),
      bonus: (() => {
        const b = settings && settings.bonus;
        if (!b || !b.bonusActif) return null;
        const driverScore = dernierGps ? dernierGps.scoreGlobal : (chauffeur ? chauffeur.scoreConduite : 0);
        const tempsActivite = dernierGps && dernierGps.evenements ? dernierGps.evenements.tempsActiviteYango || 0 : 0;
        const scoreOk = driverScore >= (b.scoreMinimum || 90);
        const activiteOk = tempsActivite >= (b.tempsActiviteMin || 600);
        return {
          bonusActif: true,
          scoreMinimum: b.scoreMinimum || 90,
          tempsActiviteMin: b.tempsActiviteMin || 600,
          bonusType: b.bonusType || 'montant_fixe',
          bonusValeur: b.bonusValeur || 5000,
          bonusPeriode: b.bonusPeriode || 'mensuel',
          eligible: scoreOk && activiteOk,
          scoreActuel: driverScore || 0,
          tempsActiviteActuel: tempsActivite,
          scoreOk,
          activiteOk
        };
      })()
    });
  } catch (err) {
    next(err);
  }
});

// =================== PLANNING ===================

// GET /api/driver/planning — Planning du chauffeur (lecture seule)
router.get('/planning', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const { from, to } = req.query;

    const query = { chauffeurId };
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }

    const planning = await Planning.find(query).sort({ date: 1 }).lean();
    const clean = planning.map(({ _id, __v, ...rest }) => rest);

    res.json(clean);
  } catch (err) {
    next(err);
  }
});

// =================== ABSENCES ===================

// GET /api/driver/absences — Absences du chauffeur
router.get('/absences', async (req, res, next) => {
  try {
    const absences = await Absence.find({ chauffeurId: req.user.chauffeurId })
      .sort({ dateDebut: -1 }).lean();
    const clean = absences.map(({ _id, __v, ...rest }) => rest);
    res.json(clean);
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/absences — Demander une absence
router.post('/absences', async (req, res, next) => {
  try {
    const { type, dateDebut, dateFin, motif } = req.body;

    if (!type || !dateDebut || !dateFin) {
      return res.status(400).json({ error: 'Type, date debut et date fin requis' });
    }

    // Generer un ID unique
    const id = 'ABS-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    const absence = new Absence({
      id,
      chauffeurId: req.user.chauffeurId,
      type,
      dateDebut,
      dateFin,
      motif: motif || '',
      dateCreation: new Date().toISOString()
    });

    await absence.save();
    res.status(201).json(absence.toJSON());
  } catch (err) {
    next(err);
  }
});

// =================== DEADLINE ===================

// GET /api/driver/deadline — Infos deadline legeres (pour refresh rapide)
router.get('/deadline', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const settings = await Settings.findOne().lean();
    const vs = settings && settings.versements;
    if (!vs || !vs.deadlineType) {
      return res.json({ configured: false });
    }
    const info = getNextDeadline(vs);
    if (!info) return res.json({ configured: false });

    // Verifier si un versement a deja ete fait pour la periode en cours
    const versementPeriode = await Versement.findOne({
      chauffeurId,
      dateCreation: { $gte: info.previousDeadline.toISOString() }
    }).lean();

    res.json({
      configured: true,
      deadlineDate: info.deadlineDate.toISOString(),
      remainingMs: info.remainingMs,
      deadlineType: vs.deadlineType,
      penaliteActive: vs.penaliteActive || false,
      penaliteType: vs.penaliteType || 'pourcentage',
      penaliteValeur: vs.penaliteValeur || 0,
      alreadyPaid: !!versementPeriode
    });
  } catch (err) {
    next(err);
  }
});

// =================== VERSEMENTS ===================

// GET /api/driver/versements — Historique versements du chauffeur
router.get('/versements', async (req, res, next) => {
  try {
    const versements = await Versement.find({ chauffeurId: req.user.chauffeurId })
      .sort({ date: -1 }).lean();
    const clean = versements.map(({ _id, __v, ...rest }) => rest);
    res.json(clean);
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/versements — Declarer un versement
router.post('/versements', async (req, res, next) => {
  try {
    const { date, periode, montantBrut, nombreCourses, commentaire } = req.body;

    if (!montantBrut || montantBrut <= 0) {
      return res.status(400).json({ error: 'Montant brut requis et positif' });
    }

    const chauffeurId = req.user.chauffeurId;

    // Recuperer le vehicule assigne + settings en parallele
    const [chauffeur, settings] = await Promise.all([
      Chauffeur.findOne({ id: chauffeurId }).lean(),
      Settings.findOne().lean()
    ]);
    const vehiculeId = chauffeur ? chauffeur.vehiculeAssigne : null;

    // Calcul commission 20%
    const commission = Math.round(montantBrut * 0.20);

    // Verifier deadline et penalite
    const vs = settings && settings.versements;
    let enRetard = false;
    let penaliteMontant = 0;
    let deadlineDateStr = null;

    if (vs && vs.deadlineType) {
      const deadlineInfo = getNextDeadline(vs);
      if (deadlineInfo) {
        deadlineDateStr = deadlineInfo.previousDeadline.toISOString();
        // En retard si le temps restant indique qu'on est apres la deadline precedente
        // et qu'aucun versement n'a ete fait depuis cette deadline
        const now = new Date();
        if (now > deadlineInfo.previousDeadline) {
          // Verifier s'il existe deja un versement dans la periode courante
          const versementsPeriode = await Versement.find({
            chauffeurId,
            dateCreation: { $gte: deadlineInfo.previousDeadline.toISOString() }
          }).lean();

          if (versementsPeriode.length === 0) {
            // Premier versement de la periode — verifier si en retard
            // En retard si la previousDeadline est passee (ce qui est toujours le cas ici)
            // MAIS seulement si on depasse le delai depuis la previousDeadline
            enRetard = true;
            penaliteMontant = calculatePenalty(montantBrut, vs);
          }
        }
      }
    }

    const montantNet = montantBrut - commission - penaliteMontant;

    // Generer un ID unique
    const id = 'VRS-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    const versement = new Versement({
      id,
      chauffeurId,
      vehiculeId,
      date: date || new Date().toISOString().split('T')[0],
      periode: periode || '',
      montantBrut,
      commission,
      montantNet,
      montantVerse: montantNet,
      statut: enRetard ? 'retard' : 'en_attente',
      nombreCourses: nombreCourses || 0,
      commentaire: commentaire || '',
      soumisParChauffeur: true,
      enRetard,
      penaliteMontant,
      deadlineDate: deadlineDateStr,
      dateCreation: new Date().toISOString()
    });

    await versement.save();
    res.status(201).json(versement.toJSON());
  } catch (err) {
    next(err);
  }
});

// =================== SIGNALEMENTS ===================

// GET /api/driver/signalements — Signalements du chauffeur
router.get('/signalements', async (req, res, next) => {
  try {
    const signalements = await Signalement.find({ chauffeurId: req.user.chauffeurId })
      .sort({ dateSignalement: -1 }).lean();
    const clean = signalements.map(({ _id, __v, ...rest }) => rest);
    res.json(clean);
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/signalements — Creer un signalement
router.post('/signalements', async (req, res, next) => {
  try {
    const { type, titre, description, urgence, localisation } = req.body;

    if (!type || !titre) {
      return res.status(400).json({ error: 'Type et titre requis' });
    }

    const chauffeurId = req.user.chauffeurId;

    // Recuperer le vehicule assigne
    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    const vehiculeId = chauffeur ? chauffeur.vehiculeAssigne : null;

    // Generer un ID unique
    const id = 'SIG-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    const signalement = new Signalement({
      id,
      chauffeurId,
      vehiculeId,
      type,
      titre,
      description: description || '',
      urgence: urgence || 'normale',
      statut: 'ouvert',
      localisation: localisation || '',
      dateSignalement: new Date().toISOString(),
      dateCreation: new Date().toISOString()
    });

    await signalement.save();
    res.status(201).json(signalement.toJSON());
  } catch (err) {
    next(err);
  }
});

// =================== PROFIL ===================

// GET /api/driver/profil — Profil complet du chauffeur
router.get('/profil', async (req, res, next) => {
  try {
    const chauffeur = await Chauffeur.findOne({ id: req.user.chauffeurId }).lean();
    if (!chauffeur) {
      return res.status(404).json({ error: 'Profil introuvable' });
    }
    const { _id, __v, ...safeChauffeur } = chauffeur;
    res.json(safeChauffeur);
  } catch (err) {
    next(err);
  }
});

// =================== VEHICULE ===================

// GET /api/driver/vehicule — Vehicule assigne au chauffeur
router.get('/vehicule', async (req, res, next) => {
  try {
    const chauffeur = await Chauffeur.findOne({ id: req.user.chauffeurId }).lean();
    if (!chauffeur || !chauffeur.vehiculeAssigne) {
      return res.json(null);
    }

    const vehicule = await Vehicule.findOne({ id: chauffeur.vehiculeAssigne }).lean();
    if (!vehicule) {
      return res.json(null);
    }

    const { _id, __v, ...safeVehicule } = vehicule;

    // Ajouter les maintenances urgentes/en retard
    const maintenancesUrgentes = (vehicule.maintenancesPlanifiees || [])
      .filter(m => m.statut === 'urgent' || m.statut === 'en_retard')
      .map(m => ({
        type: m.type,
        label: m.label,
        statut: m.statut,
        prochainKm: m.prochainKm,
        prochaineDate: m.prochaineDate
      }));

    res.json({ ...safeVehicule, maintenancesUrgentes });
  } catch (err) {
    next(err);
  }
});

// =================== GPS / SCORE CONDUITE ===================

// GET /api/driver/gps — Score de conduite + sous-scores
router.get('/gps', async (req, res, next) => {
  try {
    const gpsRecords = await Gps.find({ chauffeurId: req.user.chauffeurId })
      .sort({ date: -1 }).limit(30).lean();
    const clean = gpsRecords.map(({ _id, __v, ...rest }) => rest);
    res.json(clean);
  } catch (err) {
    next(err);
  }
});

// =================== LOCATION TRACKING ===================

// POST /api/driver/location — Mettre a jour la position GPS du chauffeur
router.post('/location', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const { lat, lng, speed, heading, accuracy } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat et lng requis' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Coordonnees invalides' });
    }

    await Chauffeur.findOneAndUpdate(
      { id: chauffeurId },
      {
        $set: {
          'location.lat': lat,
          'location.lng': lng,
          'location.speed': speed || null,
          'location.heading': heading || null,
          'location.accuracy': accuracy || null,
          'location.updatedAt': new Date().toISOString()
        }
      }
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// =================== MAINTENANCES PLANIFIEES ===================

// GET /api/driver/maintenances — Toutes les maintenances planifiees du vehicule assigne
router.get('/maintenances', async (req, res, next) => {
  try {
    const chauffeur = await Chauffeur.findOne({ id: req.user.chauffeurId }).lean();
    if (!chauffeur || !chauffeur.vehiculeAssigne) {
      return res.json({ vehicule: null, maintenances: [] });
    }

    const vehicule = await Vehicule.findOne({ id: chauffeur.vehiculeAssigne }).lean();
    if (!vehicule) {
      return res.json({ vehicule: null, maintenances: [] });
    }

    const maintenances = (vehicule.maintenancesPlanifiees || []).map(m => ({
      id: m.id,
      type: m.type,
      label: m.label,
      declencheur: m.declencheur,
      intervalleKm: m.intervalleKm,
      intervalleMois: m.intervalleMois,
      dernierKm: m.dernierKm,
      derniereDate: m.derniereDate,
      prochainKm: m.prochainKm,
      prochaineDate: m.prochaineDate,
      coutEstime: m.coutEstime,
      prestataire: m.prestataire,
      statut: m.statut,
      notes: m.notes
    }));

    res.json({
      vehicule: {
        marque: vehicule.marque,
        modele: vehicule.modele,
        immatriculation: vehicule.immatriculation,
        kilometrage: vehicule.kilometrage
      },
      maintenances
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/maintenances/signal — Signaler un probleme de maintenance
router.post('/maintenances/signal', async (req, res, next) => {
  try {
    const { maintenanceId, maintenanceLabel, description } = req.body;
    const chauffeurId = req.user.chauffeurId;

    if (!maintenanceLabel) {
      return res.status(400).json({ error: 'Label maintenance requis' });
    }

    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    const vehiculeId = chauffeur ? chauffeur.vehiculeAssigne : null;

    const id = 'SIG-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    const signalement = new Signalement({
      id,
      chauffeurId,
      vehiculeId,
      type: 'panne',
      titre: `Probleme maintenance : ${maintenanceLabel}`,
      description: description || '',
      urgence: 'haute',
      statut: 'ouvert',
      dateSignalement: new Date().toISOString(),
      dateCreation: new Date().toISOString()
    });

    await signalement.save();
    res.status(201).json(signalement.toJSON());
  } catch (err) {
    next(err);
  }
});

// =================== YANGO ACTIVITE ===================

// GET /api/driver/yango — Activite Yango du chauffeur connecte
router.get('/yango', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();

    if (!chauffeur || !chauffeur.yangoDriverId) {
      return res.json({ linked: false, message: 'Compte Yango non lié' });
    }

    const yangoDriverId = chauffeur.yangoDriverId;

    // Dates
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (now.getDay() || 7) + 1); // Lundi
    weekStart.setHours(0, 0, 0, 0);

    // Recuperer les GPS Yango du chauffeur (derniers 30 jours)
    const gpsRecords = await Gps.find({
      chauffeurId,
      id: { $regex: /^yango_/ }
    }).sort({ date: -1 }).limit(30).lean();

    // GPS du jour
    const gpsDuJour = gpsRecords.find(g => g.date && g.date.startsWith(todayStr));

    // GPS de la semaine
    const gpsWeek = gpsRecords.filter(g => {
      if (!g.date) return false;
      return new Date(g.date) >= weekStart;
    });

    // Calculer les totaux semaine
    let weekActivite = 0;
    let weekCourses = 0;
    let weekDistance = 0;
    let weekJoursActifs = 0;

    for (const g of gpsWeek) {
      const evt = g.evenements || {};
      weekActivite += evt.tempsActiviteYango || 0;
      weekDistance += evt.distanceParcourue || 0;
      if ((evt.tempsActiviteYango || 0) > 0) weekJoursActifs++;
    }

    // Objectif activite depuis les settings
    const settings = await Settings.findOne().lean();
    const objectifMinJour = (settings?.bonus?.tempsActiviteMin) || 600;

    // Stats du jour
    const evtJour = gpsDuJour?.evenements || {};
    const activiteJour = evtJour.tempsActiviteYango || 0;
    const scoreActiviteJour = gpsDuJour?.scoreActivite || 0;
    const distanceJour = evtJour.distanceParcourue || 0;
    const tempsConduiteJour = evtJour.tempsConduite || 0;

    // Historique des 7 derniers jours (pour le graphique)
    const historique = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      const gpsDay = gpsRecords.find(g => g.date && g.date.startsWith(ds));
      historique.push({
        date: ds,
        jour: dayNames[d.getDay()],
        activiteMinutes: gpsDay?.evenements?.tempsActiviteYango || 0,
        score: gpsDay?.scoreActivite || 0,
        distance: gpsDay?.evenements?.distanceParcourue || 0
      });
    }

    res.json({
      linked: true,
      yangoDriverId,
      objectifMinJour,
      aujourd_hui: {
        activiteMinutes: activiteJour,
        scoreActivite: scoreActiviteJour,
        distanceKm: distanceJour,
        tempsConduiteMinutes: tempsConduiteJour,
        objectifAtteint: activiteJour >= objectifMinJour
      },
      semaine: {
        activiteTotaleMinutes: weekActivite,
        activiteMoyenneMinutes: weekJoursActifs > 0 ? Math.round(weekActivite / weekJoursActifs) : 0,
        distanceTotaleKm: weekDistance,
        joursActifs: weekJoursActifs
      },
      historique
    });
  } catch (err) {
    next(err);
  }
});

// =================== NOTIFICATIONS ===================

// GET /api/driver/notifications — Notifications du chauffeur (recentes + non lues)
router.get('/notifications', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const limit = parseInt(req.query.limit) || 30;

    // Recuperer les notifications du chauffeur + broadcasts
    const notifications = await Notification.find({
      $or: [
        { chauffeurId },
        { chauffeurId: null } // Broadcasts
      ]
    })
      .sort({ dateCreation: -1 })
      .limit(limit)
      .lean();

    const clean = notifications.map(({ _id, __v, ...rest }) => rest);

    // Compter les non lues
    const nonLues = clean.filter(n => n.statut !== 'lue').length;

    res.json({
      notifications: clean,
      nonLues
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/driver/notifications/:id/read — Marquer comme lue
router.put('/notifications/:id/read', async (req, res, next) => {
  try {
    const notif = await Notification.findOne({ id: req.params.id });
    if (!notif) {
      return res.status(404).json({ error: 'Notification introuvable' });
    }

    notif.statut = 'lue';
    notif.dateLue = new Date().toISOString();
    await notif.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// =================== PUSH SUBSCRIPTION ===================

// GET /api/driver/push/vapid-key — Cle publique VAPID pour le frontend
router.get('/push/vapid-key', (req, res) => {
  const key = notifService.getVapidPublicKey();
  if (!key) {
    return res.json({ configured: false });
  }
  res.json({ configured: true, publicKey: key });
});

// POST /api/driver/push/subscribe — Enregistrer une subscription push
router.post('/push/subscribe', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Subscription invalide' });
    }

    // Upsert : mettre a jour si meme endpoint, creer sinon
    await PushSubscription.findOneAndUpdate(
      { 'subscription.endpoint': subscription.endpoint },
      {
        chauffeurId,
        subscription,
        userAgent: req.headers['user-agent'] || '',
        dateCreation: new Date().toISOString()
      },
      { upsert: true, new: true }
    );

    console.log(`[Push] Subscription enregistree pour chauffeur ${chauffeurId}`);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/driver/push/subscribe — Supprimer une subscription push
router.delete('/push/subscribe', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const { endpoint } = req.body;

    if (endpoint) {
      await PushSubscription.deleteOne({ chauffeurId, 'subscription.endpoint': endpoint });
    } else {
      // Supprimer toutes les subscriptions du chauffeur
      await PushSubscription.deleteMany({ chauffeurId });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// =================== MESSAGERIE ===================

// GET /api/driver/messages — Conversations du chauffeur
router.get('/messages', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const statut = req.query.statut || 'active';

    const conversations = await Conversation.find({ chauffeurId, statut })
      .sort({ dernierMessageDate: -1 })
      .lean();

    const result = conversations.map(({ _id, __v, messages, ...rest }) => ({
      ...rest,
      nbMessages: (messages || []).length
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/driver/messages/poll — Poll rapide (nombre non lus + dernier update)
router.get('/messages/poll', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;

    const conversations = await Conversation.find({ chauffeurId, statut: 'active' })
      .select('nonLusChauffeur dernierMessageDate')
      .lean();

    const nonLus = conversations.reduce((sum, c) => sum + (c.nonLusChauffeur || 0), 0);
    const dernierUpdate = conversations.length > 0
      ? conversations.reduce((max, c) => c.dernierMessageDate > max ? c.dernierMessageDate : max, '')
      : null;

    res.json({ nonLus, dernierUpdate });
  } catch (err) {
    next(err);
  }
});

// GET /api/driver/messages/:id — Detail conversation avec messages
router.get('/messages/:id', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const conv = await Conversation.findOne({ id: req.params.id, chauffeurId }).lean();
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const { _id, __v, ...rest } = conv;
    res.json(rest);
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/messages/:id/reply — Repondre a une conversation
router.post('/messages/:id/reply', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message requis' });

    const conv = await Conversation.findOne({ id: req.params.id, chauffeurId });
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    // Recuperer le nom du chauffeur
    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    const auteurNom = chauffeur ? `${chauffeur.prenom} ${chauffeur.nom}` : chauffeurId;

    const msgId = 'MSG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const now = new Date().toISOString();

    conv.messages.push({
      id: msgId,
      auteur: chauffeurId,
      auteurNom,
      contenu: message,
      type: 'message',
      dateCreation: now
    });

    conv.dernierMessage = message.substring(0, 100);
    conv.dernierMessageDate = now;
    conv.nonLusAdmin = (conv.nonLusAdmin || 0) + 1;

    await conv.save();

    res.json({ success: true, message: conv.messages[conv.messages.length - 1] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/driver/messages/:id/read — Marquer lus cote chauffeur
router.put('/messages/:id/read', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const conv = await Conversation.findOne({ id: req.params.id, chauffeurId });
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    conv.nonLusChauffeur = 0;
    await conv.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
