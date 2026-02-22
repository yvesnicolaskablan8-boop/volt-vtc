const express = require('express');
const Chauffeur = require('../models/Chauffeur');
const Vehicule = require('../models/Vehicule');
const Planning = require('../models/Planning');
const Absence = require('../models/Absence');
const Versement = require('../models/Versement');
const Signalement = require('../models/Signalement');
const Gps = require('../models/Gps');
const Settings = require('../models/Settings');
const { getNextDeadline, calculatePenalty } = require('../utils/deadline');

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
      deadline: (() => {
        const vs = settings && settings.versements;
        if (!vs || !vs.deadlineType) return null;
        const info = getNextDeadline(vs);
        if (!info) return null;
        return {
          configured: true,
          deadlineDate: info.deadlineDate.toISOString(),
          remainingMs: info.remainingMs,
          deadlineType: vs.deadlineType,
          penaliteActive: vs.penaliteActive || false,
          penaliteType: vs.penaliteType || 'pourcentage',
          penaliteValeur: vs.penaliteValeur || 0
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
    const settings = await Settings.findOne().lean();
    const vs = settings && settings.versements;
    if (!vs || !vs.deadlineType) {
      return res.json({ configured: false });
    }
    const info = getNextDeadline(vs);
    if (!info) return res.json({ configured: false });

    res.json({
      configured: true,
      deadlineDate: info.deadlineDate.toISOString(),
      remainingMs: info.remainingMs,
      deadlineType: vs.deadlineType,
      penaliteActive: vs.penaliteActive || false,
      penaliteType: vs.penaliteType || 'pourcentage',
      penaliteValeur: vs.penaliteValeur || 0
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
    res.json(safeVehicule);
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

module.exports = router;
