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
const Pointage = require('../models/Pointage');
const ConduiteBrute = require('../models/ConduiteBrute');
const ChecklistVehicule = require('../models/ChecklistVehicule');
const { getNextDeadline, calculatePenalty } = require('../utils/deadline');
const notifService = require('../utils/notification-service');
const { haversineDistance, calculateCategoryScore, generateAnalyseIA, finalizeBehaviorSession } = require('../utils/behavior-utils');

// fetch: natif en Node 18+, fallback node-fetch sinon
const fetch = globalThis.fetch || require('node-fetch');

const router = express.Router();

// =================== DASHBOARD ===================

// GET /api/driver/dashboard — Resume agrege pour le chauffeur
router.get('/dashboard', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7); // YYYY-MM

    // Recuperer toutes les donnees en parallele
    const [chauffeur, planningToday, versementsMois, signalements, gpsRecent, settings, pointageToday] = await Promise.all([
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
      Settings.findOne().lean(),
      Pointage.findOne({ chauffeurId, date: today }).lean()
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
        heureDebut: planningToday.heureDebut || null,
        heureFin: planningToday.heureFin || null,
        notes: planningToday.notes
      };
    }

    // Score conduite
    const scoreConduite = chauffeur ? chauffeur.scoreConduite : null;
    const dernierGps = gpsRecent.length > 0 ? gpsRecent[0] : null;

    // === Stats enrichies ===
    // Stats hebdo (7 derniers jours)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    const versementsHebdo = await Versement.find({
      chauffeurId,
      date: { $gte: weekAgoStr },
      statut: { $ne: 'supprime' }
    }).lean();
    const totalVerseHebdo = versementsHebdo.reduce((s, v) => s + (v.montantVerse || 0), 0);
    const joursVerseHebdo = new Set(versementsHebdo.filter(v => v.montantVerse > 0).map(v => v.date)).size;
    const redevance = chauffeur ? (chauffeur.redevanceQuotidienne || 0) : 0;
    const objectifHebdo = redevance * 7;

    // Ranking parmi chauffeurs actifs (CA du mois)
    const allChauffeurs = await Chauffeur.find({ statut: 'actif' }).lean();
    const allChauffeurIds = allChauffeurs.map(c => c.id);
    const allVersementsMois = await Versement.find({
      chauffeurId: { $in: allChauffeurIds },
      date: { $regex: `^${monthStart}` },
      statut: { $ne: 'supprime' }
    }).lean();
    // Calculer CA par chauffeur
    const caByDriver = {};
    allChauffeurIds.forEach(id => { caByDriver[id] = 0; });
    allVersementsMois.forEach(v => {
      if (caByDriver[v.chauffeurId] !== undefined) {
        caByDriver[v.chauffeurId] += (v.montantVerse || 0);
      }
    });
    const sorted = Object.entries(caByDriver).sort((a, b) => b[1] - a[1]);
    const rankIdx = sorted.findIndex(([id]) => id === chauffeurId);
    const ranking = { position: rankIdx >= 0 ? rankIdx + 1 : allChauffeurs.length, total: allChauffeurs.length };

    // Streak — jours consécutifs avec versement valide (en partant d'hier vers le passé)
    let streakJours = 0;
    const allVersements = await Versement.find({ chauffeurId, statut: { $ne: 'supprime' } }).sort({ date: -1 }).lean();
    const versementDates = new Set(allVersements.filter(v => v.montantVerse > 0).map(v => v.date));
    const allPlanning = await Planning.find({ chauffeurId, date: { $lte: today } }).sort({ date: -1 }).lean();
    const planDatesChecked = new Set();
    for (const p of allPlanning) {
      if (planDatesChecked.has(p.date)) continue;
      planDatesChecked.add(p.date);
      if (versementDates.has(p.date)) streakJours++;
      else break;
    }

    // Evolution CA (mois courant vs mois précédent)
    const caMoisCourant = versementsMois.reduce((s, v) => s + (v.montantVerse || 0), 0);
    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStart = prevMonth.toISOString().split('T')[0].slice(0, 7);
    const versementsMoisPrec = await Versement.find({
      chauffeurId,
      date: { $regex: `^${prevMonthStart}` },
      statut: { $ne: 'supprime' }
    }).lean();
    const caMoisPrecedent = versementsMoisPrec.reduce((s, v) => s + (v.montantVerse || 0), 0);
    const tendancePct = caMoisPrecedent > 0 ? Math.round(((caMoisCourant - caMoisPrecedent) / caMoisPrecedent) * 100) : (caMoisCourant > 0 ? 100 : 0);

    // CA des 4 dernières semaines (pour mini chart)
    const weeklyCA = [];
    for (let w = 3; w >= 0; w--) {
      const wStart = new Date();
      wStart.setDate(wStart.getDate() - (w * 7 + wStart.getDay()));
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      const wStartStr = wStart.toISOString().split('T')[0];
      const wEndStr = wEnd.toISOString().split('T')[0];
      const wVersements = allVersements.filter(v => v.date >= wStartStr && v.date <= wEndStr);
      weeklyCA.push({
        label: `S${Math.ceil((wStart.getDate() + wStart.getDay()) / 7)}`,
        total: wVersements.reduce((s, v) => s + (v.montantVerse || 0), 0)
      });
    }

    res.json({
      chauffeur: chauffeur ? {
        prenom: chauffeur.prenom,
        nom: chauffeur.nom,
        statut: chauffeur.statut,
        scoreConduite: chauffeur.scoreConduite,
        redevanceQuotidienne: redevance
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
      serviceJour: pointageToday ? (() => {
        const { _id, __v, ...p } = pointageToday;
        return { statut: p.statut, heureDebut: p.heureDebut, heureFin: p.heureFin,
                 dureeTotaleMinutes: p.dureeTotaleMinutes, dureePauseMinutes: p.dureePauseMinutes,
                 evenements: p.evenements };
      })() : null,
      objectifTempsEnLigne: settings?.objectifs?.tempsEnLigneMin || 630,
      deadline: await (async () => {
        const vs = settings && settings.versements;
        if (!vs || !vs.deadlineType) return null;
        const info = getNextDeadline(vs);
        if (!info) return null;
        // Verifier si le chauffeur etait programme dans la periode courante
        const prevDateStr = info.previousDeadline.toISOString().split('T')[0];
        const deadlineDateStr = info.deadlineDate.toISOString().split('T')[0];
        const wasScheduled = await Planning.findOne({
          chauffeurId,
          date: { $gte: prevDateStr, $lte: deadlineDateStr }
        }).lean();
        if (!wasScheduled) return null;
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
      })(),
      // === Statut sante du jour ===
      statutSante: await (async () => {
        const flags = [];
        let level = 'green';
        // 1. Versements en retard
        const allPlan = await Planning.find({ chauffeurId, date: { $lt: today } }).lean();
        const allVers = await Versement.find({ chauffeurId, statut: { $ne: 'supprime' } }).lean();
        const versDates = new Set(allVers.filter(vv => vv.montantVerse > 0).map(vv => vv.date));
        const unpaidDays = allPlan.filter(p => !versDates.has(p.date) && p.date !== today);
        // Ne compter que les 30 derniers jours
        const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
        const recentUnpaid = unpaidDays.filter(p => new Date(p.date) >= thirtyAgo);
        if (recentUnpaid.length > 0) {
          level = 'red';
          flags.push({ type: 'versement_retard', message: recentUnpaid.length + ' versement(s) en retard', level: 'red' });
        }
        // 2. Documents expiration
        const docs = chauffeur ? (chauffeur.documents || []) : [];
        const nowMs = Date.now();
        const expired = docs.filter(d => d.dateExpiration && new Date(d.dateExpiration) < new Date());
        const expiringSoon = docs.filter(d => {
          if (!d.dateExpiration) return false;
          const days = Math.ceil((new Date(d.dateExpiration) - nowMs) / 86400000);
          return days > 0 && days <= 30;
        });
        if (expired.length > 0) {
          level = 'red';
          flags.push({ type: 'doc_expire', message: expired.length + ' document(s) expire(s)', level: 'red' });
        } else if (expiringSoon.length > 0 && level !== 'red') {
          if (level !== 'red') level = 'orange';
          flags.push({ type: 'doc_bientot', message: expiringSoon.length + ' doc(s) expire(nt) bientot', level: 'orange' });
        }
        // 3. Maintenance urgente
        if (vehicule) {
          const mEnRetard = (vehicule.maintenancesPlanifiees || []).filter(m => m.statut === 'en_retard');
          const mUrgent = (vehicule.maintenancesPlanifiees || []).filter(m => m.statut === 'urgent');
          if (mEnRetard.length > 0) {
            level = 'red';
            flags.push({ type: 'maint_retard', message: mEnRetard.length + ' maintenance(s) en retard', level: 'red' });
          } else if (mUrgent.length > 0) {
            if (level !== 'red') level = 'orange';
            flags.push({ type: 'maint_urgent', message: mUrgent.length + ' maintenance(s) urgente(s)', level: 'orange' });
          }
        }
        return { level, flags };
      })(),
      // === Stats enrichies ===
      statsHebdo: {
        totalVerse: totalVerseHebdo,
        nbJoursTravailles: joursVerseHebdo,
        objectifHebdo
      },
      ranking,
      streakJours,
      evolutionCA: {
        caMoisPrecedent,
        caMoisCourant,
        tendancePct
      },
      weeklyCA
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

// =================== SERVICE / POINTAGE ===================

// GET /api/driver/service/today — Statut du service pour aujourd'hui
router.get('/service/today', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const pointage = await Pointage.findOne({ chauffeurId, date: today }).lean();

    // Recuperer l'objectif temps en ligne
    const settings = await Settings.findOne().lean();
    const objectifTempsEnLigne = settings?.objectifs?.tempsEnLigneMin || 630;

    if (!pointage) return res.json({ pointage: null, objectifTempsEnLigne });
    const { _id, __v, ...clean } = pointage;
    res.json({ pointage: clean, objectifTempsEnLigne });
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/service/start — Commencer le service
router.post('/service/start', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // Verifier que le chauffeur est programme aujourd'hui
    const planningToday = await Planning.findOne({ chauffeurId, date: today }).lean();
    if (!planningToday) {
      return res.status(400).json({ error: 'Vous n\'etes pas programme aujourd\'hui' });
    }

    const existing = await Pointage.findOne({ chauffeurId, date: today }).lean();
    if (existing) {
      return res.status(400).json({ error: 'Service deja commence aujourd\'hui' });
    }

    const id = 'PTG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const pointage = new Pointage({
      id, chauffeurId, date: today, statut: 'en_service',
      evenements: [{ type: 'debut', heure: now }],
      heureDebut: now, dateCreation: now
    });
    await pointage.save();
    res.status(201).json(pointage.toJSON());
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/service/pause — Mettre en pause
router.post('/service/pause', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const pointage = await Pointage.findOne({ chauffeurId, date: today });
    if (!pointage) return res.status(400).json({ error: 'Aucun service en cours' });
    if (pointage.statut !== 'en_service') return res.status(400).json({ error: 'Le service n\'est pas en cours' });

    pointage.evenements.push({ type: 'pause', heure: now });
    pointage.statut = 'pause';
    await pointage.save();
    res.json(pointage.toJSON());
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/service/resume — Reprendre le service
router.post('/service/resume', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const pointage = await Pointage.findOne({ chauffeurId, date: today });
    if (!pointage) return res.status(400).json({ error: 'Aucun service en cours' });
    if (pointage.statut !== 'pause') return res.status(400).json({ error: 'Le service n\'est pas en pause' });

    pointage.evenements.push({ type: 'reprise', heure: now });
    pointage.statut = 'en_service';
    await pointage.save();
    res.json(pointage.toJSON());
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/service/end — Terminer la journee
router.post('/service/end', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const pointage = await Pointage.findOne({ chauffeurId, date: today });
    if (!pointage) return res.status(400).json({ error: 'Aucun service en cours' });
    if (pointage.statut === 'termine') return res.status(400).json({ error: 'Le service est deja termine' });

    pointage.evenements.push({ type: 'fin', heure: now });
    pointage.statut = 'termine';
    pointage.heureFin = now;

    // Calculer les durees
    const debut = new Date(pointage.heureDebut);
    const fin = new Date(now);
    let pauseMs = 0;
    let pauseStart = null;
    for (const evt of pointage.evenements) {
      if (evt.type === 'pause') pauseStart = new Date(evt.heure);
      else if (evt.type === 'reprise' && pauseStart) { pauseMs += new Date(evt.heure) - pauseStart; pauseStart = null; }
    }
    if (pauseStart) pauseMs += fin - pauseStart;

    pointage.dureeTotaleMinutes = Math.round((fin - debut - pauseMs) / 60000);
    pointage.dureePauseMinutes = Math.round(pauseMs / 60000);

    await pointage.save();

    // Finaliser l'analyse de conduite si des donnees existent
    let behaviorScores = null;
    try {
      behaviorScores = await finalizeBehaviorSession(chauffeurId, today);
    } catch (e) {
      console.warn('[Behavior] Erreur finalisation:', e.message);
    }

    // Verifier l'objectif temps en ligne
    const settings = await Settings.findOne().lean();
    const objectifTempsEnLigne = settings?.objectifs?.tempsEnLigneMin || 630;
    const objectifAtteint = pointage.dureeTotaleMinutes >= objectifTempsEnLigne;

    const result = pointage.toJSON();
    if (behaviorScores) result.behaviorScores = behaviorScores;
    result.objectifTempsEnLigne = objectifTempsEnLigne;
    result.objectifAtteint = objectifAtteint;
    res.json(result);
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

    // Verifier si le chauffeur est programme AUJOURD'HUI (pas dans une plage)
    const todayStr = new Date().toISOString().split('T')[0];
    const [wasScheduled, versementPeriode, chauffeurDoc] = await Promise.all([
      Planning.findOne({ chauffeurId, date: todayStr }).lean(),
      Versement.findOne({ chauffeurId, dateCreation: { $gte: info.previousDeadline.toISOString() } }).lean(),
      Chauffeur.findOne({ id: chauffeurId }).lean()
    ]);
    if (!wasScheduled) return res.json({ configured: false });

    res.json({
      configured: true,
      deadlineDate: info.deadlineDate.toISOString(),
      remainingMs: info.remainingMs,
      deadlineType: vs.deadlineType,
      objectifRecette: chauffeurDoc ? (chauffeurDoc.redevanceQuotidienne || 0) : 0,
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

// GET /api/driver/dettes — Liste des dettes du chauffeur (recettes + contraventions)
router.get('/dettes', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    const redevance = chauffeur ? (chauffeur.redevanceQuotidienne || 0) : 0;

    // 1. Dettes explicites
    const dettesExplicites = await Versement.find({
      chauffeurId,
      traitementManquant: 'dette',
      manquant: { $gt: 0 }
    }).sort({ date: 1 }).lean();

    const isContravention = (v) => v.source === 'contravention' || (v.reference && v.reference.startsWith('CHF')) || (v.commentaire && /contravention/i.test(v.commentaire));

    // 2. Dettes implicites (planning passé sans versement)
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const plannings = await Planning.find({
      chauffeurId,
      date: { $gte: thirtyDaysAgoStr, $lt: today }
    }).lean();

    const absences = await Absence.find({ chauffeurId }).lean();
    const allVersements = await Versement.find({ chauffeurId }).lean();

    const implicitDettes = [];
    for (const p of plannings) {
      const hasAbsence = absences.some(a => p.date >= a.dateDebut && p.date <= a.dateFin);
      if (hasAbsence) continue;
      const rev = (p.redevanceOverride > 0) ? p.redevanceOverride : redevance;
      if (rev <= 0) continue;
      const hasPayment = allVersements.some(v => v.date === p.date && (v.statut === 'valide' || v.statut === 'supprime' || v.statut === 'partiel' || v.traitementManquant === 'perte'));
      const hasExplicitDette = dettesExplicites.some(v => v.date === p.date);
      if (!hasPayment && !hasExplicitDette) {
        implicitDettes.push({
          id: `implicit_${chauffeurId}_${p.date}`,
          date: p.date,
          manquant: rev,
          type: 'recette',
          implicit: true,
          label: 'Non verse (redevance due)'
        });
      }
    }

    // 2b. Contraventions impayees sans versement associe
    const Contravention = require('../models/Contravention');
    const contraImpayees = await Contravention.find({
      chauffeurId,
      statut: 'impayee',
      montant: { $gt: 0 }
    }).lean();
    const contraFromDb = [];
    for (const c of contraImpayees) {
      const hasVersement = dettesExplicites.some(v => v.reference === c.id) || allVersements.some(v => v.reference === c.id && (v.statut === 'valide' || v.statut === 'supprime'));
      if (!hasVersement) {
        contraFromDb.push({
          id: `contra_${c.id}`, date: c.date, manquant: c.montant, type: 'contravention', implicit: false,
          label: `Contravention — ${c.type || 'amende'}`, reference: c.id
        });
      }
    }

    // 3. Combiner et classer
    const recettes = [
      ...dettesExplicites.filter(v => !isContravention(v)).map(v => ({
        id: v.id, date: v.date, manquant: v.manquant, type: 'recette', implicit: false,
        label: `Verse : ${v.montantVerse || 0} sur ${(v.montantVerse || 0) + v.manquant}`
      })),
      ...implicitDettes
    ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const contraventions = [
      ...dettesExplicites.filter(v => isContravention(v)).map(v => ({
        id: v.id, date: v.date, manquant: v.manquant, type: 'contravention', implicit: false,
        label: v.commentaire || 'Contravention', reference: v.reference
      })),
      ...contraFromDb
    ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const totalRecettes = recettes.reduce((s, d) => s + d.manquant, 0);
    const totalContraventions = contraventions.reduce((s, d) => s + d.manquant, 0);

    res.json({
      recettes,
      contraventions,
      totalRecettes,
      totalContraventions,
      total: totalRecettes + totalContraventions
    });
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

    // Pas de commission — seuls les frais Wave 1% s'appliquent cote prestataire
    const commission = 0;

    // Verifier deadline et penalite
    const vs = settings && settings.versements;
    let enRetard = false;
    let penaliteMontant = 0;
    let deadlineDateStr = null;

    if (vs && vs.deadlineType) {
      const deadlineInfo = getNextDeadline(vs);
      if (deadlineInfo) {
        deadlineDateStr = deadlineInfo.previousDeadline.toISOString();
        const now = new Date();
        if (now > deadlineInfo.previousDeadline) {
          const versementsPeriode = await Versement.find({
            chauffeurId,
            dateCreation: { $gte: deadlineInfo.previousDeadline.toISOString() }
          }).lean();

          if (versementsPeriode.length === 0) {
            enRetard = true;
            penaliteMontant = calculatePenalty(montantBrut, vs);
          }
        }
      }
    }

    const montantNet = montantBrut - commission - penaliteMontant;

    // Calculer le manquant par rapport a la redevance quotidienne
    const redevance = chauffeur ? (chauffeur.redevanceQuotidienne || 0) : 0;
    const manquant = (redevance > 0 && montantNet < redevance) ? redevance - montantNet : 0;
    const traitementManquant = manquant > 0 ? 'dette' : null;

    // Determiner le statut en fonction du montant vs redevance
    let statut = enRetard ? 'retard' : 'en_attente';
    if (redevance > 0 && montantNet > 0) {
      if (montantNet >= redevance) {
        statut = 'valide';
      } else {
        statut = 'partiel';
      }
    }

    // Generer un ID unique
    const id = 'VRS-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    const serviceDate = date || new Date().toISOString().split('T')[0];
    const versement = new Versement({
      id,
      chauffeurId,
      vehiculeId,
      date: serviceDate,
      dateService: serviceDate,
      periode: periode || '',
      montantBrut,
      commission,
      montantNet,
      montantVerse: montantNet,
      statut,
      nombreCourses: nombreCourses || 0,
      commentaire: commentaire || '',
      soumisParChauffeur: true,
      enRetard,
      penaliteMontant,
      deadlineDate: deadlineDateStr,
      manquant: manquant || 0,
      traitementManquant,
      dateCreation: new Date().toISOString()
    });

    await versement.save();
    res.status(201).json(versement.toJSON());
  } catch (err) {
    next(err);
  }
});

// =================== ETAT DES LIEUX ===================

// GET /api/driver/etat-lieux/today — Verifier si l'etat des lieux a ete fait aujourd'hui
router.get('/etat-lieux/today', async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const signalement = await Signalement.findOne({
      chauffeurId: req.user.chauffeurId,
      titre: /etat des lieux/i,
      dateSignalement: { $gte: today, $lt: tomorrow }
    }).lean();

    if (signalement) {
      const { _id, __v, ...clean } = signalement;
      res.json(clean);
    } else {
      res.json(null);
    }
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
    const { type, titre, description, urgence, localisation, position } = req.body;

    if (!type || !titre) {
      return res.status(400).json({ error: 'Type et titre requis' });
    }

    const chauffeurId = req.user.chauffeurId;

    // Recuperer le vehicule assigne
    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    const vehiculeId = chauffeur ? chauffeur.vehiculeAssigne : null;

    // Generer un ID unique
    const id = 'SIG-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    const sigData = {
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
    };
    if (position && position.lat && position.lng) {
      sigData.position = { lat: position.lat, lng: position.lng };
    }

    const signalement = new Signalement(sigData);
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

// =================== CONTRAT ===================

// POST /api/driver/contrat/accepter — Le chauffeur accepte son contrat
router.post('/contrat/accepter', async (req, res, next) => {
  try {
    const result = await Chauffeur.findOneAndUpdate(
      { id: req.user.chauffeurId },
      {
        $set: {
          contratAccepte: true,
          contratAccepteLe: new Date(),
          contratAccepteIP: req.ip || req.headers['x-forwarded-for'] || ''
        }
      },
      { new: true }
    );
    if (!result) {
      return res.status(404).json({ error: 'Chauffeur introuvable' });
    }
    res.json({ success: true, accepteLe: result.contratAccepteLe });
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

    const chauffeurId = req.user.chauffeurId;
    const vehicule = await Vehicule.findOne({ id: chauffeur.vehiculeAssigne }).lean();
    if (!vehicule) {
      return res.json({ vehicule: null, maintenances: [] });
    }

    // Get GPS records for the last 30 days to compute km/day rate
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const gpsRecent = await Gps.find({
      chauffeurId,
      date: { $gte: thirtyDaysAgo.toISOString().split('T')[0] }
    }).lean();

    let totalKmGps = 0, activeDaysGps = 0;
    for (const g of gpsRecent) {
      const dist = g.evenements ? (g.evenements.distanceParcourue || 0) : 0;
      if (dist > 0) { totalKmGps += dist; activeDaysGps++; }
    }
    const kmParJour = activeDaysGps > 0 ? Math.round(totalKmGps / activeDaysGps) : 0;

    const maintenances = (vehicule.maintenancesPlanifiees || []).map(m => {
      const prediction = {};
      if (m.prochainKm && vehicule.kilometrage && kmParJour > 0) {
        const kmRestant = m.prochainKm - vehicule.kilometrage;
        prediction.joursEstimesKm = kmRestant > 0 ? Math.round(kmRestant / kmParJour) : 0;
        prediction.kmRestant = Math.max(0, kmRestant);
      }
      if (m.prochaineDate) {
        prediction.joursEstimesDate = Math.ceil((new Date(m.prochaineDate) - new Date()) / 86400000);
      }
      const estimates = [prediction.joursEstimesKm, prediction.joursEstimesDate].filter(x => x !== undefined && x !== null);
      prediction.joursEstimes = estimates.length > 0 ? Math.min(...estimates) : null;

      return {
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
        notes: m.notes,
        prediction,
        kmParJour
      };
    });

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

// =================== TRAJETS / HISTORIQUE ===================

// GET /api/driver/trajets — Historique des trajets avec GPS samples
router.get('/trajets', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const { from, to } = req.query;

    const query = { chauffeurId };
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }

    const records = await ConduiteBrute.find(query)
      .sort({ date: -1 })
      .limit(30)
      .lean();

    const result = records.map(({ _id, __v, ...r }) => ({
      date: r.date,
      gpsSamples: r.gpsSamples || [],
      evenements: r.evenements || [],
      stats: r.stats || {},
      compteurs: r.compteurs || {},
      sessionDebut: r.sessionDebut,
      sessionFin: r.sessionFin,
      scoreCalcule: r.scoreCalcule
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// =================== CHECKLIST VEHICULE ===================

// GET /api/driver/checklist/today — Checklist du jour
router.get('/checklist/today', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const id = `CHK-${chauffeurId}-${today}`;

    const checklist = await ChecklistVehicule.findOne({ id }).lean();
    if (!checklist) {
      return res.json({ exists: false });
    }

    const { _id, __v, ...rest } = checklist;
    res.json({ exists: true, checklist: rest });
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/checklist — Soumettre la checklist du jour
router.post('/checklist', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const id = `CHK-${chauffeurId}-${today}`;

    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    const vehiculeId = chauffeur ? chauffeur.vehiculeAssigne : null;

    const { items, commentaireGeneral } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items requis' });
    }

    const hasProblems = items.some(i => i.statut === 'probleme');
    const resultat = hasProblems ? 'problemes_detectes' : 'ok';

    const checklist = await ChecklistVehicule.findOneAndUpdate(
      { id },
      {
        id, chauffeurId, vehiculeId, date: today,
        items, resultat, commentaireGeneral,
        dateCreation: new Date().toISOString()
      },
      { upsert: true, new: true }
    );

    // Si problemes detectes, creer un signalement auto
    if (hasProblems) {
      const problemes = items.filter(i => i.statut === 'probleme');
      const labels = {
        pneus: 'Pneus', feux: 'Feux', retroviseurs: 'Retroviseurs',
        proprete_interieur: 'Proprete interieur', proprete_exterieur: 'Proprete exterieur',
        niveau_huile: 'Niveau huile', freins: 'Freins', ceintures: 'Ceintures',
        climatisation: 'Climatisation', documents_bord: 'Documents de bord'
      };
      const listeProb = problemes.map(p => labels[p.nom] || p.nom).join(', ');

      const sigId = 'SIG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      const sig = new Signalement({
        id: sigId, chauffeurId, vehiculeId,
        type: 'panne',
        titre: `Checklist : probleme(s) detecte(s)`,
        description: `Items signales : ${listeProb}. ${commentaireGeneral || ''}`,
        urgence: 'normale', statut: 'ouvert',
        dateSignalement: new Date().toISOString(),
        dateCreation: new Date().toISOString()
      });
      await sig.save();
    }

    res.status(201).json(checklist.toJSON());
  } catch (err) {
    next(err);
  }
});

// =================== CLASSEMENT ===================

// GET /api/driver/classement — Classement anonymise des chauffeurs
router.get('/classement', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;

    const chauffeurs = await Chauffeur.find({ statut: 'actif' })
      .select('id prenom scoreConduite')
      .sort({ scoreConduite: -1 })
      .lean();

    const classement = chauffeurs.map((c, i) => ({
      rang: i + 1,
      prenom: c.id === chauffeurId ? c.prenom : (c.prenom ? c.prenom.charAt(0) + '***' : '***'),
      score: c.scoreConduite || 80,
      estMoi: c.id === chauffeurId
    }));

    res.json(classement);
  } catch (err) {
    next(err);
  }
});

// =================== RESUME HEBDOMADAIRE ===================

// GET /api/driver/resume-hebdo — Resume de la semaine
router.get('/resume-hebdo', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    const fromStr = weekStart.toISOString().split('T')[0];
    const toStr = now.toISOString().split('T')[0];

    // GPS records de la semaine
    const gpsRecords = await Gps.find({
      chauffeurId,
      date: { $gte: fromStr, $lte: toStr }
    }).sort({ date: -1 }).lean();

    if (gpsRecords.length === 0) {
      return res.json({ hasData: false });
    }

    let totalMinutes = 0;
    let totalDistance = 0;
    let totalScore = 0;
    let totalEvents = 0;
    let joursActifs = 0;
    let scores = [];

    for (const g of gpsRecords) {
      const evt = g.evenements || {};
      const conduite = evt.tempsConduite || 0;
      const dist = evt.distanceParcourue || 0;
      const events = (evt.freinagesBrusques || 0) + (evt.accelerationsBrusques || 0) +
        (evt.viragesAgressifs || 0) + (evt.excesVitesse || 0);

      if (conduite > 0 || dist > 0) joursActifs++;
      totalMinutes += conduite;
      totalDistance += dist;
      totalEvents += events;
      if (g.scoreGlobal) {
        totalScore += g.scoreGlobal;
        scores.push(g.scoreGlobal);
      }
    }

    const scoreMoyen = scores.length > 0 ? Math.round(totalScore / scores.length) : null;

    // Tendance : comparer avec la semaine precedente
    const prevStart = new Date(weekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(weekStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevGps = await Gps.find({
      chauffeurId,
      date: { $gte: prevStart.toISOString().split('T')[0], $lte: prevEnd.toISOString().split('T')[0] }
    }).lean();

    let tendance = 'stable';
    if (prevGps.length > 0 && scoreMoyen !== null) {
      const prevScores = prevGps.filter(g => g.scoreGlobal).map(g => g.scoreGlobal);
      if (prevScores.length > 0) {
        const prevMoyen = Math.round(prevScores.reduce((a, b) => a + b, 0) / prevScores.length);
        if (scoreMoyen > prevMoyen + 3) tendance = 'amelioration';
        else if (scoreMoyen < prevMoyen - 3) tendance = 'degradation';
      }
    }

    // CA hebdo (versements de la semaine)
    const weekVersements = await Versement.find({
      chauffeurId,
      date: { $gte: fromStr, $lte: toStr },
      statut: { $ne: 'supprime' }
    }).lean();
    const caHebdo = weekVersements.reduce((s, v) => s + (v.montantVerse || 0), 0);

    // CA semaine precedente
    const prevWeekVersements = await Versement.find({
      chauffeurId,
      date: { $gte: prevStart.toISOString().split('T')[0], $lte: prevEnd.toISOString().split('T')[0] },
      statut: { $ne: 'supprime' }
    }).lean();
    const prevCaHebdo = prevWeekVersements.reduce((s, v) => s + (v.montantVerse || 0), 0);
    const evolutionCA = prevCaHebdo > 0 ? Math.round(((caHebdo - prevCaHebdo) / prevCaHebdo) * 100) : (caHebdo > 0 ? 100 : 0);

    res.json({
      hasData: true,
      heuresTravail: Math.round(totalMinutes / 60 * 10) / 10,
      distanceKm: Math.round(totalDistance * 10) / 10,
      scoreMoyen,
      nbEvenements: totalEvents,
      tendance,
      joursActifs,
      caHebdo,
      prevCaHebdo,
      evolutionCA,
      periode: { from: fromStr, to: toStr }
    });
  } catch (err) {
    next(err);
  }
});

// =================== BEHAVIOR / ANALYSE CONDUITE ===================

// POST /api/driver/behavior/events — Recevoir un batch d'evenements de conduite
router.post('/behavior/events', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const { evenements, compteurs, gpsSample } = req.body;

    if (!evenements && !gpsSample) {
      return res.status(400).json({ error: 'Aucune donnee' });
    }

    const today = new Date().toISOString().split('T')[0];
    const conduiteBruteId = `CB-${chauffeurId}-${today}`;

    const updateOps = {};

    if (evenements && evenements.length > 0) {
      updateOps.$push = { evenements: { $each: evenements } };
    }

    if (gpsSample) {
      if (!updateOps.$push) updateOps.$push = {};
      updateOps.$push.gpsSamples = gpsSample;
    }

    if (compteurs) {
      if (!updateOps.$set) updateOps.$set = {};
      updateOps.$set['compteurs.freinagesBrusques'] = compteurs.freinagesBrusques || 0;
      updateOps.$set['compteurs.accelerationsBrusques'] = compteurs.accelerationsBrusques || 0;
      updateOps.$set['compteurs.viragesAgressifs'] = compteurs.viragesAgressifs || 0;
      updateOps.$set['compteurs.excesVitesse'] = compteurs.excesVitesse || 0;
    }

    await ConduiteBrute.findOneAndUpdate(
      { id: conduiteBruteId },
      {
        ...updateOps,
        $setOnInsert: {
          id: conduiteBruteId,
          chauffeurId,
          date: today,
          sessionDebut: new Date().toISOString(),
          dateCreation: new Date().toISOString()
        }
      },
      { upsert: true, new: true }
    );

    // Mettre a jour le record Gps courant avec les compteurs running
    if (compteurs) {
      const gpsId = `gps-${chauffeurId}-${today}`;
      await Gps.findOneAndUpdate(
        { id: gpsId },
        {
          $set: {
            chauffeurId,
            date: today,
            'evenements.freinagesBrusques': compteurs.freinagesBrusques || 0,
            'evenements.accelerationsBrusques': compteurs.accelerationsBrusques || 0,
            'evenements.viragesAgressifs': compteurs.viragesAgressifs || 0,
            'evenements.excesVitesse': compteurs.excesVitesse || 0
          },
          $setOnInsert: {
            id: gpsId,
            scoreGlobal: 80,
            scoreVitesse: 80,
            scoreFreinage: 80,
            scoreAcceleration: 80,
            scoreVirage: 80,
            scoreRegularite: 80,
            scoreActivite: 0,
            'evenements.tempsConduite': 0,
            'evenements.distanceParcourue': 0,
            'evenements.vitesseMoyenne': 0,
            'evenements.vitesseMax': 0,
            analyseIA: { resume: '', recommandations: [], tendance: 'stable', comparaisonFlotte: '' }
          }
        },
        { upsert: true }
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/behavior/finalize — Finaliser la session et calculer les scores
router.post('/behavior/finalize', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const result = await finalizeBehaviorSession(chauffeurId, today);
    res.json(result || { success: true, message: 'Pas de donnees aujourd\'hui' });
  } catch (err) {
    next(err);
  }
});

// GET /api/driver/behavior/status — Etat du tracking du jour
router.get('/behavior/status', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const today = new Date().toISOString().split('T')[0];
    const conduiteBruteId = `CB-${chauffeurId}-${today}`;

    const record = await ConduiteBrute.findOne({ id: conduiteBruteId }).lean();
    if (!record) {
      return res.json({ hasData: false });
    }

    res.json({
      hasData: true,
      compteurs: record.compteurs,
      stats: record.stats,
      eventCount: (record.evenements || []).length,
      scoreCalcule: record.scoreCalcule
    });
  } catch (err) {
    next(err);
  }
});

// =================== HELPERS BEHAVIOR ===================
// Fonctions importees depuis ../utils/behavior-utils.js

// =================== WAVE CHECKOUT ===================

// POST /api/driver/wave/checkout — Creer une session Wave Checkout pour payer la redevance
router.post('/wave/checkout', async (req, res, next) => {
  try {
    const { montantBrut, date, periode, commentaire } = req.body;

    if (!montantBrut || montantBrut <= 0) {
      return res.status(400).json({ error: 'Montant requis et positif' });
    }

    const chauffeurId = req.user.chauffeurId;
    const [chauffeur, settings] = await Promise.all([
      Chauffeur.findOne({ id: chauffeurId }).lean(),
      Settings.findOne().lean()
    ]);
    const vehiculeId = chauffeur ? chauffeur.vehiculeAssigne : null;

    // Pas de commission — seuls les frais Wave 1% s'appliquent cote prestataire
    const commission = 0;

    // Verifier deadline et penalite
    const vs = settings && settings.versements;
    let enRetard = false;
    let penaliteMontant = 0;
    let deadlineDateStr = null;

    if (vs && vs.deadlineType) {
      const deadlineInfo = getNextDeadline(vs);
      if (deadlineInfo) {
        deadlineDateStr = deadlineInfo.previousDeadline.toISOString();
        const now = new Date();
        if (now > deadlineInfo.previousDeadline) {
          const versementsPeriode = await Versement.find({
            chauffeurId,
            dateCreation: { $gte: deadlineInfo.previousDeadline.toISOString() }
          }).lean();
          if (versementsPeriode.length === 0) {
            enRetard = true;
            penaliteMontant = calculatePenalty(montantBrut, vs);
          }
        }
      }
    }

    const montantNet = montantBrut - commission - penaliteMontant;

    // Generer un ID unique pour le versement
    const versementId = 'VRS-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Creer la session Wave Checkout
    const waveApiKey = process.env.WAVE_API_KEY;
    if (!waveApiKey) {
      console.error('[Wave] WAVE_API_KEY manquante dans les variables d\'environnement');
      return res.status(500).json({ error: 'Wave API non configuree. Contactez l\'administrateur.' });
    }

    // URL de base pour les redirections — utiliser l'origin du frontend (Vercel), pas le backend (Railway)
    const frontendOrigin = req.headers.origin || req.headers.referer?.replace(/\/+$/, '') || '';
    const baseUrl = frontendOrigin || (process.env.NODE_ENV === 'production'
      ? (process.env.FRONTEND_URL || 'https://volt-vtc-production.up.railway.app')
      : `http://localhost:${process.env.PORT || 3001}`);

    const waveResponse = await fetch('https://api.wave.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waveApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: String(montantBrut),
        currency: 'XOF',
        client_reference: versementId,
        success_url: `${baseUrl}/driver/#/versements?wave=success&id=${versementId}`,
        error_url: `${baseUrl}/driver/#/versements?wave=error&id=${versementId}`
      })
    });

    if (!waveResponse.ok) {
      const errData = await waveResponse.json().catch(() => ({}));
      console.error('Wave checkout error:', errData);
      return res.status(502).json({ error: errData.message || 'Erreur Wave' });
    }

    const waveSession = await waveResponse.json();

    // Creer le versement en statut 'en_attente' avec le checkoutId Wave
    const waveServiceDate = date || new Date().toISOString().split('T')[0];
    const versement = new Versement({
      id: versementId,
      chauffeurId,
      vehiculeId,
      date: waveServiceDate,
      dateService: waveServiceDate,
      periode: periode || '',
      montantBrut,
      commission,
      montantNet,
      montantVerse: 0,
      statut: 'en_attente',
      soumisParChauffeur: true,
      enRetard,
      penaliteMontant,
      deadlineDate: deadlineDateStr,
      moyenPaiement: 'wave',
      waveCheckoutId: waveSession.id,
      commentaire: commentaire || '',
      dateCreation: new Date().toISOString()
    });

    await versement.save();

    res.status(201).json({
      versementId,
      waveCheckoutId: waveSession.id,
      waveLaunchUrl: waveSession.wave_launch_url,
      montantBrut,
      commission,
      penaliteMontant,
      montantNet
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/driver/wave/status/:id — Verifier le statut d'un checkout Wave
router.get('/wave/status/:id', async (req, res, next) => {
  try {
    const versement = await Versement.findOne({
      id: req.params.id,
      chauffeurId: req.user.chauffeurId
    }).lean();

    if (!versement) {
      return res.status(404).json({ error: 'Versement non trouve' });
    }

    if (!versement.waveCheckoutId) {
      return res.json({ statut: versement.statut });
    }

    // Verifier le statut aupres de Wave
    const waveApiKey = process.env.WAVE_API_KEY;
    const waveResponse = await fetch(`https://api.wave.com/v1/checkout/sessions/${versement.waveCheckoutId}`, {
      headers: { 'Authorization': `Bearer ${waveApiKey}` }
    });

    if (!waveResponse.ok) {
      return res.json({ statut: versement.statut });
    }

    const waveSession = await waveResponse.json();

    // Si le paiement est confirme par Wave mais pas encore mis a jour localement
    if (waveSession.payment_status === 'succeeded' && versement.statut !== 'valide') {
      // Calculer le manquant par rapport a la redevance
      const chDoc = await Chauffeur.findOne({ id: versement.chauffeurId }).lean();
      const redev = chDoc ? (chDoc.redevanceQuotidienne || 0) : 0;
      const montantEffectif = versement.montantNet || 0;
      const waveManquant = (redev > 0 && montantEffectif < redev) ? redev - montantEffectif : 0;
      const waveStatut = (redev > 0 && montantEffectif > 0 && montantEffectif < redev) ? 'partiel' : 'valide';

      await Versement.updateOne({ id: versement.id }, {
        statut: waveStatut,
        montantVerse: versement.montantNet,
        waveTransactionId: waveSession.transaction_id || '',
        referencePaiement: waveSession.transaction_id || '',
        dateValidation: new Date().toISOString(),
        manquant: waveManquant,
        traitementManquant: waveManquant > 0 ? 'dette' : null
      });
      return res.json({ statut: waveStatut, waveStatus: 'succeeded', manquant: waveManquant });
    }

    if (waveSession.checkout_status === 'expired') {
      if (versement.statut === 'en_attente') {
        await Versement.deleteOne({ id: versement.id });
        return res.json({ statut: 'expire', waveStatus: 'expired' });
      }
    }

    res.json({
      statut: versement.statut,
      waveStatus: waveSession.payment_status,
      checkoutStatus: waveSession.checkout_status
    });
  } catch (err) {
    next(err);
  }
});

// =================== CONTRAVENTIONS ===================

// GET /api/driver/contraventions — Contraventions du chauffeur
router.get('/contraventions', async (req, res, next) => {
  try {
    const Contravention = require('../models/Contravention');
    const contraventions = await Contravention.find({ chauffeurId: req.user.chauffeurId })
      .sort({ date: -1 }).lean();
    const clean = contraventions.map(({ _id, __v, ...rest }) => rest);
    res.json(clean);
  } catch (err) {
    next(err);
  }
});

// PUT /api/driver/contraventions/:id/contester — Contester une contravention
router.put('/contraventions/:id/contester', async (req, res, next) => {
  try {
    const Contravention = require('../models/Contravention');
    const contravention = await Contravention.findOne({
      id: req.params.id,
      chauffeurId: req.user.chauffeurId
    });

    if (!contravention) {
      return res.status(404).json({ error: 'Contravention non trouvee' });
    }

    if (contravention.statut !== 'impayee') {
      return res.status(400).json({ error: 'Seule une contravention impayee peut etre contestee' });
    }

    contravention.statut = 'contestee';
    contravention.motifContestation = req.body.motif || '';
    await contravention.save();

    res.json(contravention.toJSON());
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/contraventions/wave/checkout — Payer une contravention via Wave
router.post('/contraventions/wave/checkout', async (req, res, next) => {
  try {
    const Contravention = require('../models/Contravention');
    const { contraventionId } = req.body;

    if (!contraventionId) {
      return res.status(400).json({ error: 'contraventionId requis' });
    }

    const contravention = await Contravention.findOne({
      id: contraventionId,
      chauffeurId: req.user.chauffeurId
    });

    if (!contravention) {
      return res.status(404).json({ error: 'Contravention non trouvee' });
    }

    if (contravention.statut === 'payee') {
      return res.status(400).json({ error: 'Contravention deja payee' });
    }

    const montant = contravention.montant;
    if (!montant || montant <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const waveApiKey = process.env.WAVE_API_KEY;
    if (!waveApiKey) {
      return res.status(500).json({ error: 'Wave API non configuree' });
    }

    // URL de base — utiliser l'origin du frontend (Vercel), pas le backend (Railway)
    const frontendOrigin = req.headers.origin || req.headers.referer?.replace(/\/+$/, '') || '';
    const baseUrl = frontendOrigin || (process.env.NODE_ENV === 'production'
      ? (process.env.FRONTEND_URL || 'https://volt-vtc-production.up.railway.app')
      : `http://localhost:${process.env.PORT || 3001}`);

    const waveResponse = await fetch('https://api.wave.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waveApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: String(montant),
        currency: 'XOF',
        client_reference: contraventionId,
        success_url: `${baseUrl}/driver/#/contraventions?wave=success&id=${contraventionId}`,
        error_url: `${baseUrl}/driver/#/contraventions?wave=error&id=${contraventionId}`
      })
    });

    if (!waveResponse.ok) {
      const errData = await waveResponse.json().catch(() => ({}));
      console.error('[Wave Contravention Driver] Checkout error:', errData);
      return res.status(502).json({ error: errData.message || 'Erreur Wave' });
    }

    const waveSession = await waveResponse.json();

    contravention.waveCheckoutId = waveSession.id;
    await contravention.save();

    res.json({
      contraventionId,
      waveCheckoutId: waveSession.id,
      waveLaunchUrl: waveSession.wave_launch_url,
      montant
    });
  } catch (err) {
    next(err);
  }
});

// =================== OBJECTIFS & GAMIFICATION ===================

router.get('/objectifs', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    if (!chauffeur) return res.status(404).json({ error: 'Chauffeur non trouve' });

    const now = new Date();
    const monthStart = now.toISOString().split('T')[0].slice(0, 7);

    const versementsMois = await Versement.find({
      chauffeurId, date: { $regex: '^' + monthStart }, statut: { $ne: 'supprime' }
    }).lean();
    const caMois = versementsMois.reduce((s, v) => s + (v.montantVerse || 0), 0);
    const joursTravailles = new Set(versementsMois.filter(v => v.montantVerse > 0).map(v => v.date)).size;

    const gpsRecords = await Gps.find({ chauffeurId, date: { $regex: '^' + monthStart } }).lean();
    const avgScore = gpsRecords.length > 0 ? Math.round(gpsRecords.reduce((s, g) => s + (g.scoreGlobal || 0), 0) / gpsRecords.length) : 0;

    const objectifs = chauffeur.objectifs || {};
    const existingBadges = chauffeur.badges || [];
    const redevance = chauffeur.redevanceQuotidienne || 0;

    // Badge definitions
    const badgeDefs = [
      { id: 'premier_versement', nom: 'Premier versement', description: 'Premier versement effectue', icon: 'solar:star-bold-duotone' },
      { id: 'score_80', nom: 'Conducteur exemplaire', description: 'Score de conduite superieur a 80', icon: 'solar:medal-ribbons-star-bold-duotone' },
      { id: '10_jours', nom: 'Regularite', description: '10 jours travailles ce mois', icon: 'solar:fire-bold-duotone' },
      { id: '20_jours', nom: 'Assidu', description: '20 jours travailles ce mois', icon: 'solar:cup-bold-duotone' },
      { id: 'ponctuel', nom: 'Ponctuel', description: 'Aucun retard de versement', icon: 'solar:clock-circle-bold-duotone' },
    ];

    // Check which badges are newly earned
    const checks = {
      premier_versement: versementsMois.length > 0,
      score_80: avgScore >= 80,
      '10_jours': joursTravailles >= 10,
      '20_jours': joursTravailles >= 20,
      ponctuel: versementsMois.length > 0 && versementsMois.every(v => !v.enRetard),
    };

    const newBadges = [];
    for (const def of badgeDefs) {
      if (!existingBadges.find(b => b.id === def.id) && checks[def.id]) {
        newBadges.push({ ...def, dateObtenu: new Date().toISOString() });
      }
    }

    if (newBadges.length > 0) {
      await Chauffeur.updateOne({ id: chauffeurId }, { $push: { badges: { $each: newBadges } } });
    }

    res.json({
      objectifs: {
        caMensuel: { cible: objectifs.caMensuel || redevance * 25, actuel: caMois },
        joursTravailles: { cible: objectifs.joursMinimum || 20, actuel: joursTravailles },
        scoreConduite: { cible: objectifs.scoreMinimum || 70, actuel: avgScore }
      },
      badges: [...existingBadges, ...newBadges],
      newBadges
    });
  } catch (err) {
    next(err);
  }
});

// =================== DOCUMENT UPLOAD ===================

// POST /api/driver/documents/:docType/upload
router.post('/documents/:docType/upload', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const { docType } = req.params;
    const { fichierData, fichierType, fichierNom } = req.body;

    if (!fichierData || !fichierType) {
      return res.status(400).json({ error: 'Fichier requis' });
    }
    if (fichierData.length > 7 * 1024 * 1024) {
      return res.status(400).json({ error: 'Fichier trop volumineux (max 5 Mo)' });
    }

    const chauffeur = await Chauffeur.findOne({ id: chauffeurId });
    if (!chauffeur) return res.status(404).json({ error: 'Chauffeur non trouve' });

    const docIdx = chauffeur.documents.findIndex(d => d.type === docType);
    if (docIdx === -1) {
      return res.status(404).json({ error: 'Type de document non trouve' });
    }

    chauffeur.documents[docIdx].fichierData = fichierData;
    chauffeur.documents[docIdx].fichierType = fichierType;
    chauffeur.documents[docIdx].fichierNom = fichierNom || 'document';
    chauffeur.documents[docIdx].dateUpload = new Date().toISOString();
    await chauffeur.save();

    res.json({ success: true, message: 'Document televerse' });
  } catch (err) { next(err); }
});

// GET /api/driver/documents/:docType/file
router.get('/documents/:docType/file', async (req, res, next) => {
  try {
    const chauffeurId = req.user.chauffeurId;
    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    if (!chauffeur) return res.status(404).json({ error: 'Chauffeur non trouve' });
    const doc = (chauffeur.documents || []).find(d => d.type === req.params.docType);
    if (!doc || !doc.fichierData) return res.status(404).json({ error: 'Aucun fichier' });
    res.json({ fichierData: doc.fichierData, fichierType: doc.fichierType, fichierNom: doc.fichierNom });
  } catch (err) { next(err); }
});

module.exports = router;
