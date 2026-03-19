require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API Routes — Admin
app.use('/api/auth', require('./routes/auth'));
app.use('/api/data', require('./routes/data'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/chauffeurs', require('./routes/crud')('Chauffeur'));
app.use('/api/vehicules', require('./routes/crud')('Vehicule'));
app.use('/api/courses', require('./routes/crud')('Course'));
app.use('/api/versements', require('./routes/versements-auto'));
app.use('/api/versements', require('./routes/crud')('Versement'));
app.use('/api/gps', require('./routes/gps-positions'));
app.use('/api/gps', require('./routes/crud')('Gps'));
app.use('/api/comptabilite', require('./routes/crud')('Comptabilite'));
app.use('/api/factures', require('./routes/crud')('Facture'));
app.use('/api/budgets', require('./routes/crud')('Budget'));
app.use('/api/planning', require('./routes/crud')('Planning'));
app.use('/api/absences', require('./routes/crud')('Absence'));
app.use('/api/users', require('./routes/crud')('User'));
app.use('/api/signalements', require('./routes/crud')('Signalement'));
app.use('/api/pointages', require('./routes/crud')('Pointage'));
app.use('/api/conduiteBrute', require('./routes/crud')('ConduiteBrute'));
app.use('/api/checklistVehicules', require('./routes/crud')('ChecklistVehicule'));
app.use('/api/contraventions', require('./routes/contravention-wave'));
app.use('/api/contraventions', require('./routes/crud')('Contravention'));
app.use('/api/depenses', require('./routes/crud')('Depense'));
app.use('/api/depenseRecurrentes', require('./routes/crud')('DepenseRecurrente'));
app.use('/api/depenseCategories', require('./routes/crud')('DepenseCategorie'));
app.use('/api/versementRecurrents', require('./routes/crud')('VersementRecurrent'));
app.use('/api/reparations', require('./routes/crud')('Reparation'));
app.use('/api/incidents', require('./routes/crud')('Incident'));
app.use('/api/activityLogs', require('./routes/crud')('ActivityLog'));
app.use('/api/taches', require('./routes/tache-hooks'));
app.use('/api/taches', require('./routes/crud')('Tache'));
app.use('/api/controlesTechniques', require('./routes/crud')('ControleTechnique'));
app.use('/api/yango', require('./routes/yango'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/messages', require('./routes/messages'));

// API Routes — Webhooks externes (pas d'auth)
app.use('/api/wave', require('./routes/wave-webhook'));

// API Routes — Driver (PWA chauffeur)
app.use('/api/driver/auth', require('./routes/driver-auth'));
app.use('/api/driver', require('./middleware/driverAuth'), require('./routes/driver-api'));

// Serve driver PWA static files
app.use('/driver', express.static(path.join(__dirname, '..', 'driver')));

// Serve monitor PWA static files
app.use('/monitor', express.static(path.join(__dirname, '..', 'monitor')));

// Serve frontend static files in production
// Railway: rootDirectory peut etre "/" (tout le repo) ou "server/" (juste le backend)
// On detecte automatiquement ou sont les fichiers frontend
const fs = require('fs');
const possiblePaths = [
  path.join(__dirname, '..'),           // Standard: server/ est un sous-dossier
  __dirname,                             // Cas ou tout est a plat
  path.join(__dirname, '..', '..'),      // Cas nested
];
let frontendPath = possiblePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || path.join(__dirname, '..');
console.log('[Server] __dirname:', __dirname);
console.log('[Server] Frontend path:', frontendPath);
console.log('[Server] index.html exists:', fs.existsSync(path.join(frontendPath, 'index.html')));

// Landing page — served at root "/" for visitors (BEFORE static middleware)
app.get('/', (req, res) => {
  const landingFile = path.join(frontendPath, 'landing.html');
  if (fs.existsSync(landingFile)) {
    return res.sendFile(landingFile);
  }
  const indexFile = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(503).send('App en cours de mise a jour.');
});

// Admin app — served at "/app"
app.get('/app', (req, res) => {
  const indexFile = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(503).send('Admin app not found');
});

// Static files (CSS, JS, images, etc.) — after explicit routes
app.use(express.static(frontendPath, { index: false }));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return;
  const indexFile = path.join(frontendPath, 'index.html');
  if (req.path.startsWith('/driver')) {
    const f = path.join(frontendPath, 'driver', 'index.html');
    return fs.existsSync(f) ? res.sendFile(f) : res.status(404).send('Driver app not found');
  }
  if (req.path.startsWith('/monitor')) {
    const f = path.join(frontendPath, 'monitor', 'index.html');
    return fs.existsSync(f) ? res.sendFile(f) : res.status(404).send('Monitor app not found');
  }
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(503).send('App en cours de mise a jour. Veuillez vider le cache (Railway rootDirectory doit pointer vers la racine du repo, pas server/).');
  }
});

// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pilote API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Demarrer le CRON Yango si les credentials sont configurees (DB ou env)
    const { getYangoCredentials } = require('./utils/get-integration-keys');
    getYangoCredentials().then(creds => {
      if (creds.parkId && creds.apiKey) {
        const yangoCron = require('./utils/yango-cron');
        yangoCron.start();
      } else {
        console.log('[Server] Yango credentials non configurees — CRON Yango desactive');
      }
    }).catch(err => {
      console.error('[Server] Erreur lecture credentials Yango:', err.message);
    });

    // Demarrer le CRON Notifications + initialiser VAPID
    const notifService = require('./utils/notification-service');
    notifService.initVAPID();

    const notifCron = require('./utils/notification-cron');
    notifCron.start();

    // Demarrer le CRON Behavior (finalisation conduite a 3h)
    const behaviorCron = require('./utils/behavior-cron');
    behaviorCron.start();

    // Demarrer le CRON Wave (verification paiements en attente toutes les 5min)
    const waveCron = require('./utils/wave-cron');
    waveCron.start();

    // Demarrer le CRON Taches recurrentes (toutes les 30min)
    const tacheCron = require('./utils/tache-cron');
    tacheCron.start();

    // Demarrer le CRON Repos automatique (toutes les 2h)
    const reposCron = require('./utils/repos-cron');
    reposCron.start();

  });
};

startServer();
