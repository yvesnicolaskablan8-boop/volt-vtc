const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Minimal projection for courses — only fields used by dashboard, rapports, rentabilite
const COURSE_PROJECTION = {
  _id: 0, __v: 0,
  depart: 0, arrivee: 0, distanceKm: 0, dureeMn: 0,
  montantHT: 0, tva: 0, typeTrajet: 0, noteClient: 0
};

// GET /api/data - Fetch all collections for cache initialization
// Courses use minimal projection to reduce payload (~29MB instead of ~74MB)
// GPS and Planning are limited to recent records (not needed for reports)
router.get('/', async (req, res, next) => {
  try {
    const Chauffeur = require('../models/Chauffeur');
    const Vehicule = require('../models/Vehicule');
    const Course = require('../models/Course');
    const Versement = require('../models/Versement');
    const Gps = require('../models/Gps');
    const Comptabilite = require('../models/Comptabilite');
    const Facture = require('../models/Facture');
    const Budget = require('../models/Budget');
    const Planning = require('../models/Planning');
    const Absence = require('../models/Absence');
    const User = require('../models/User');
    const Settings = require('../models/Settings');
    const Signalement = require('../models/Signalement');

    // GPS and Planning limit (not needed for annual reports)
    const recentLimit = parseInt(req.query.recentLimit) || 5000;

    // Fetch all collections in parallel
    const [
      chauffeurs, vehicules,
      courses, versements, comptabilite,
      gps, planning,
      factures, budgets, absences, users, settingsDoc, signalements
    ] = await Promise.all([
      // Full load — small collections
      Chauffeur.find().lean(),
      Vehicule.find().lean(),
      // Full load with minimal projection — needed for all annual reports
      Course.find({}, COURSE_PROJECTION).sort({ dateHeure: -1 }).lean(),
      Versement.find().select('-_id -__v').sort({ date: -1 }).lean(),
      Comptabilite.find().select('-_id -__v').sort({ date: -1 }).lean(),
      // Limited — only recent, not needed for annual reports
      Gps.find().sort({ date: -1 }).limit(recentLimit).lean(),
      Planning.find().sort({ date: -1 }).limit(recentLimit).lean(),
      // Full load — small collections
      Facture.find().lean(),
      Budget.find().lean(),
      Absence.find().lean(),
      User.find().lean(),
      Settings.findOne().lean(),
      Signalement.find().lean()
    ]);

    // Clean MongoDB fields (_id, __v) from documents that don't use .select()
    const clean = (docs) => docs.map(({ _id, __v, ...rest }) => rest);

    // Remove passwordHash from users
    const cleanUsers = users.map(({ _id, __v, passwordHash, ...rest }) => rest);

    // Clean settings
    const settings = settingsDoc
      ? (() => { const { _id, __v, ...rest } = settingsDoc; return rest; })()
      : { entreprise: {}, preferences: {} };

    res.json({
      chauffeurs: clean(chauffeurs),
      vehicules: clean(vehicules),
      courses,           // Already projected, no _id/__v
      versements,        // Already selected, no _id/__v
      comptabilite,      // Already selected, no _id/__v
      gps: clean(gps),
      planning: clean(planning),
      factures: clean(factures),
      budgets: clean(budgets),
      absences: clean(absences),
      users: cleanUsers,
      signalements: clean(signalements),
      settings
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/data/range - Load data for a specific date range
router.get('/range', async (req, res, next) => {
  try {
    const { from, to, collections } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params required (ISO dates)' });
    }

    const Comptabilite = require('../models/Comptabilite');
    const Course = require('../models/Course');
    const Versement = require('../models/Versement');
    const Gps = require('../models/Gps');
    const Planning = require('../models/Planning');

    const dateFilter = { date: { $gte: from, $lte: to } };
    const dateHeureFilter = { dateHeure: { $gte: from, $lte: to } };

    const cols = collections ? collections.split(',') : ['courses', 'versements', 'comptabilite', 'gps', 'planning'];
    const clean = (docs) => docs.map(({ _id, __v, ...rest }) => rest);

    const result = {};

    await Promise.all(cols.map(async (col) => {
      switch (col) {
        case 'courses':
          result.courses = await Course.find(dateHeureFilter, COURSE_PROJECTION).sort({ dateHeure: -1 }).lean();
          break;
        case 'versements':
          result.versements = clean(await Versement.find(dateFilter).sort({ date: -1 }).lean());
          break;
        case 'comptabilite':
          result.comptabilite = clean(await Comptabilite.find(dateFilter).sort({ date: -1 }).lean());
          break;
        case 'gps':
          result.gps = clean(await Gps.find(dateFilter).sort({ date: -1 }).lean());
          break;
        case 'planning':
          result.planning = clean(await Planning.find(dateFilter).sort({ date: -1 }).lean());
          break;
      }
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/data/aggregates - Aggregated stats for dashboard (all-time)
router.get('/aggregates', async (req, res, next) => {
  try {
    const Comptabilite = require('../models/Comptabilite');
    const Versement = require('../models/Versement');
    const Course = require('../models/Course');

    const [revenueByMonth, expenseByMonth, versementsByMonth, coursesByMonth] = await Promise.all([
      Comptabilite.aggregate([
        { $match: { type: 'revenue' } },
        { $group: {
          _id: { $substr: ['$date', 0, 7] },
          total: { $sum: '$montant' },
          count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]),
      Comptabilite.aggregate([
        { $match: { type: 'expense' } },
        { $group: {
          _id: { $substr: ['$date', 0, 7] },
          total: { $sum: '$montant' },
          count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]),
      Versement.aggregate([
        { $group: {
          _id: { $substr: ['$date', 0, 7] },
          totalBrut: { $sum: '$montantBrut' },
          totalNet: { $sum: '$montantNet' },
          totalVerse: { $sum: '$montantVerse' },
          count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]),
      Course.aggregate([
        { $group: {
          _id: { $substr: ['$dateHeure', 0, 7] },
          totalMontant: { $sum: '$montantTTC' },
          count: { $sum: 1 },
          avgMontant: { $avg: '$montantTTC' }
        }},
        { $sort: { _id: 1 } }
      ])
    ]);

    const expenseByCategory = await Comptabilite.aggregate([
      { $match: { type: 'expense' } },
      { $group: {
        _id: '$categorie',
        total: { $sum: '$montant' },
        count: { $sum: 1 }
      }},
      { $sort: { total: -1 } }
    ]);

    res.json({
      revenueByMonth,
      expenseByMonth,
      versementsByMonth,
      coursesByMonth,
      expenseByCategory
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
