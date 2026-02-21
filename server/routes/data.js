const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/data - Fetch ALL collections at once (for cache initialization)
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

    // Fetch all collections in parallel
    const [
      chauffeurs, vehicules, courses, versements,
      gps, comptabilite, factures, budgets,
      planning, absences, users, settingsDoc
    ] = await Promise.all([
      Chauffeur.find().lean(),
      Vehicule.find().lean(),
      Course.find().lean(),
      Versement.find().lean(),
      Gps.find().lean(),
      Comptabilite.find().lean(),
      Facture.find().lean(),
      Budget.find().lean(),
      Planning.find().lean(),
      Absence.find().lean(),
      User.find().lean(),
      Settings.findOne().lean()
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
      settings
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
