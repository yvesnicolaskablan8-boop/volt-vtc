const express = require('express');
const Settings = require('../models/Settings');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/settings
router.get('/', async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      // Create default settings if none exist
      settings = await Settings.create({
        entreprise: {
          nom: 'Volt VTC',
          slogan: 'Transport de qualité',
          email: 'contact@volt.ci',
          telephone: '+225 27 00 00 00',
          adresse: 'Abidjan, Cocody Riviera',
          siteWeb: 'www.volt.ci',
          numeroRegistre: 'CI-ABJ-2024-0042',
          devise: 'FCFA'
        },
        preferences: {
          themeDefaut: 'dark',
          langue: 'fr',
          formatDate: 'DD/MM/YYYY',
          notifications: true,
          alertesSonores: false,
          sessionTimeout: 30
        }
      });
    }
    res.json(settings.toJSON());
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings
router.put('/', async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (settings) {
      // Update existing settings
      if (req.body.entreprise) settings.entreprise = req.body.entreprise;
      if (req.body.preferences) settings.preferences = req.body.preferences;
      if (req.body.versements) settings.versements = req.body.versements;
      if (req.body.bonus) settings.bonus = req.body.bonus;
      if (req.body.notifications) settings.notifications = req.body.notifications;
      await settings.save();
    } else {
      // Create new settings
      settings = await Settings.create(req.body);
    }
    res.json(settings.toJSON());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
