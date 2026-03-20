const express = require('express');
const Settings = require('../models/Settings');
const authMiddleware = require('../middleware/auth');
const { getWaveApiKey, getYangoCredentials, clearCache } = require('../utils/get-integration-keys');

const router = express.Router();
router.use(authMiddleware);

// Helper: mask API keys for safe display (show last 4 chars)
function maskKey(str) {
  if (!str || str.length <= 4) return str ? '••••' : '';
  return '••••••••' + str.slice(-4);
}

// Helper: get tenant filter — returns null if no entrepriseId (legacy user)
function tenantFilter(req) {
  // Backward compat: allow null entrepriseId for pre-migration users
  // After migration, this should reject
  if (req.user.entrepriseId) return { entrepriseId: req.user.entrepriseId };
  // Legacy fallback: no tenant scoping for unmigrated users
  return {};
}

// GET /api/settings
router.get('/', async (req, res, next) => {
  try {
    const ef = tenantFilter(req);
    let settings = await Settings.findOne(ef);
    if (!settings) {
      // Create default settings if none exist
      settings = await Settings.create({
        ...ef,
        entreprise: {
          nom: 'Mon Entreprise',
          slogan: 'Transport de qualité',
          email: 'contact@pilote.app',
          telephone: '+225 27 00 00 00',
          adresse: 'Abidjan, Cocody Riviera',
          siteWeb: 'www.pilote.app',
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
    const json = settings.toJSON();

    // Ensure integrations object exists
    if (!json.integrations) json.integrations = {};
    if (!json.integrations.wave) json.integrations.wave = {};
    if (!json.integrations.yango) json.integrations.yango = {};

    // Fallback to .env values if DB is empty (pre-fill for existing setups)
    const waveKey = json.integrations.wave.apiKey || process.env.WAVE_API_KEY || '';
    const yangoKey = json.integrations.yango.apiKey || process.env.YANGO_API_KEY || '';
    const yangoParkId = json.integrations.yango.parkId || process.env.YANGO_PARK_ID || '';
    const yangoClientId = json.integrations.yango.clientId || process.env.YANGO_CLIENT_ID || '';

    // Mask API keys before sending to client
    json.integrations.wave.apiKey = maskKey(waveKey);
    json.integrations.wave.configured = !!waveKey;
    json.integrations.wave.source = json.integrations.wave.apiKey ? 'db' : (process.env.WAVE_API_KEY ? 'env' : 'none');

    json.integrations.yango.apiKey = maskKey(yangoKey);
    json.integrations.yango.parkId = maskKey(yangoParkId);
    json.integrations.yango.clientId = maskKey(yangoClientId);
    json.integrations.yango.configured = !!(yangoKey && yangoParkId);
    json.integrations.yango.source = json.integrations.yango.parkId ? 'db' : (process.env.YANGO_PARK_ID ? 'env' : 'none');

    res.json(json);
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings
router.put('/', async (req, res, next) => {
  try {
    const ef = tenantFilter(req);
    let settings = await Settings.findOne(ef);
    if (settings) {
      // Update existing settings
      if (req.body.entreprise) settings.entreprise = req.body.entreprise;
      if (req.body.preferences) settings.preferences = req.body.preferences;
      if (req.body.versements) settings.versements = req.body.versements;
      if (req.body.bonus) settings.bonus = req.body.bonus;
      if (req.body.notifications) settings.notifications = req.body.notifications;

      // Handle integrations — skip masked values (user didn't change them)
      if (req.body.integrations) {
        if (!settings.integrations) settings.integrations = {};

        if (req.body.integrations.wave) {
          if (!settings.integrations.wave) settings.integrations.wave = {};
          const waveData = req.body.integrations.wave;
          if (waveData.apiKey && !waveData.apiKey.startsWith('••••')) {
            settings.integrations.wave.apiKey = waveData.apiKey;
          }
        }

        if (req.body.integrations.yango) {
          if (!settings.integrations.yango) settings.integrations.yango = {};
          const yangoData = req.body.integrations.yango;
          if (yangoData.parkId !== undefined && !yangoData.parkId.startsWith('••••')) settings.integrations.yango.parkId = yangoData.parkId;
          if (yangoData.clientId !== undefined && !yangoData.clientId.startsWith('••••')) settings.integrations.yango.clientId = yangoData.clientId;
          if (yangoData.apiKey && !yangoData.apiKey.startsWith('••••')) {
            settings.integrations.yango.apiKey = yangoData.apiKey;
          }
        }

        settings.markModified('integrations');
      }

      await settings.save();
      clearCache();
    } else {
      // Create new settings
      settings = await Settings.create({ ...req.body, ...ef });
      clearCache();
    }

    const json = settings.toJSON();
    // Mask keys in response
    if (json.integrations) {
      if (json.integrations.wave) json.integrations.wave.apiKey = maskKey(json.integrations.wave.apiKey);
      if (json.integrations.yango) json.integrations.yango.apiKey = maskKey(json.integrations.yango.apiKey);
    }

    res.json(json);
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/test-wave — Test Wave API connection
router.post('/test-wave', async (req, res) => {
  try {
    const entrepriseId = req.user.entrepriseId || null;
    const apiKey = await getWaveApiKey(entrepriseId);
    if (!apiKey) {
      return res.json({ success: false, message: 'Cle API Wave non configuree' });
    }

    const response = await fetch('https://api.wave.com/v1/balance', {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });

    if (response.ok) {
      const data = await response.json();
      res.json({ success: true, message: 'Connexion reussie', data: { currency: data.currency, amount: data.amount } });
    } else {
      const text = await response.text();
      res.json({ success: false, message: 'Erreur Wave: ' + response.status + ' - ' + text });
    }
  } catch (err) {
    res.json({ success: false, message: 'Erreur: ' + err.message });
  }
});

// POST /api/settings/test-yango — Test Yango API connection
router.post('/test-yango', async (req, res) => {
  try {
    const entrepriseId = req.user.entrepriseId || null;
    const creds = await getYangoCredentials(entrepriseId);
    if (!creds.parkId || !creds.apiKey || !creds.clientId) {
      return res.json({ success: false, message: 'Identifiants Yango incomplets' });
    }

    const response = await fetch('https://fleet-api.taxi.yandex.net/v1/parks/driver-profiles/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': creds.clientId,
        'X-API-Key': creds.apiKey
      },
      body: JSON.stringify({
        query: { park: { id: creds.parkId } },
        limit: 1,
        offset: 0
      })
    });

    if (response.ok) {
      const data = await response.json();
      const count = data.total || data.driver_profiles?.length || 0;
      res.json({ success: true, message: 'Connexion reussie — ' + count + ' chauffeur(s) trouves' });
    } else {
      const text = await response.text();
      res.json({ success: false, message: 'Erreur Yango: ' + response.status + ' - ' + text });
    }
  } catch (err) {
    res.json({ success: false, message: 'Erreur: ' + err.message });
  }
});

module.exports = router;
