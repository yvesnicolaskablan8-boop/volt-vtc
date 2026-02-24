const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/data - Fetch collections for cache initialization
// Large collections (courses, versements, gps, comptabilite, planning) are limited
// to the recent period to avoid loading 500K+ records at once.
// Use ?months=N to control how far back to load (default: 3 months)
router.get('/', async (req, res, next) => {
  try {
    // Load all models
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

    // Date filter for large collections
    const months = parseInt(req.query.months) || 3;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    const cutoffISO = cutoffDate.toISOString();

    // For date-filtered collections, we filter on the 'date' or 'dateHeure' field
    // These fields are stored as ISO strings, so string comparison works
    const recentDateFilter = { date: { $gte: cutoffISO } };
    const recentDateHeureFilter = { dateHeure: { $gte: cutoffISO } };

    // Fetch all collections in parallel
    // Small collections: load ALL (chauffeurs, vehicules, budgets, absences, users, settings, signalements, factures)
    // Large collections: load only recent data
    const [
      chauffeurs, vehicules,
      courses, versements, gps, comptabilite, planning,
      factures, budgets, absences, users, settingsDoc, signalements,
      // Counts for totals (useful for dashboard stats)
      coursesTotal, versementsTotal, comptaTotal
    ] = await Promise.all([
      // Small — load all
      Chauffeur.find().lean(),
      Vehicule.find().lean(),
      // Large — filtered by date
      Course.find(recentDateHeureFilter).sort({ dateHeure: -1 }).lean(),
      Versement.find(recentDateFilter).sort({ date: -1 }).lean(),
      Gps.find(recentDateFilter).sort({ date: -1 }).lean(),
      Comptabilite.find(recentDateFilter).sort({ date: -1 }).lean(),
      Planning.find(recentDateFilter).sort({ date: -1 }).lean(),
      // Small — load all
      Facture.find().lean(),
      Budget.find().lean(),
      Absence.find().lean(),
      User.find().lean(),
      Settings.findOne().lean(),
      Signalement.find().lean(),
      // Counts
      Course.countDocuments(),
      Versement.countDocuments(),
      Comptabilite.countDocuments()
    ]);

    // Clean MongoDB fields (_id, __v) from all documents
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
      courses: clean(courses),
      versements: clean(versements),
      gps: clean(gps),
      comptabilite: clean(comptabilite),
      factures: clean(factures),
      budgets: clean(budgets),
      planning: clean(planning),
      absences: clean(absences),
      users: cleanUsers,
      signalements: clean(signalements),
      settings,
      // Metadata for the frontend to know data is partial
      _meta: {
        dataMonths: months,
        cutoffDate: cutoffISO,
        totals: {
          courses: coursesTotal,
          versements: versementsTotal,
          comptabilite: comptaTotal
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/data/range - Load data for a specific date range (for historical analysis)
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

    // Only load requested collections, or all large ones
    const cols = collections ? collections.split(',') : ['courses', 'versements', 'comptabilite', 'gps', 'planning'];
    const clean = (docs) => docs.map(({ _id, __v, ...rest }) => rest);

    const result = {};

    await Promise.all(cols.map(async (col) => {
      switch (col) {
        case 'courses':
          result.courses = clean(await Course.find(dateHeureFilter).sort({ dateHeure: -1 }).lean());
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

    // Monthly aggregates for comptabilite — revenue vs expenses per month
    const [revenueByMonth, expenseByMonth, versementsByMonth, coursesByMonth] = await Promise.all([
      Comptabilite.aggregate([
        { $match: { type: 'revenue' } },
        { $group: {
          _id: { $substr: ['$date', 0, 7] }, // YYYY-MM
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

    // Expense breakdown by category (all-time)
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
