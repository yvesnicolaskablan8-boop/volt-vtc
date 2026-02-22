require('dotenv').config();
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
app.use('/api/versements', require('./routes/crud')('Versement'));
app.use('/api/gps', require('./routes/crud')('Gps'));
app.use('/api/comptabilite', require('./routes/crud')('Comptabilite'));
app.use('/api/factures', require('./routes/crud')('Facture'));
app.use('/api/budgets', require('./routes/crud')('Budget'));
app.use('/api/planning', require('./routes/crud')('Planning'));
app.use('/api/absences', require('./routes/crud')('Absence'));
app.use('/api/users', require('./routes/crud')('User'));
app.use('/api/signalements', require('./routes/crud')('Signalement'));
app.use('/api/yango', require('./routes/yango'));

// API Routes — Driver (PWA chauffeur)
app.use('/api/driver/auth', require('./routes/driver-auth'));
app.use('/api/driver', require('./middleware/driverAuth'), require('./routes/driver-api'));

// Serve driver PWA static files
app.use('/driver', express.static(path.join(__dirname, '..', 'driver')));

// Serve frontend static files in production
app.use(express.static(path.join(__dirname, '..')));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return;
  if (req.path.startsWith('/driver')) {
    return res.sendFile(path.join(__dirname, '..', 'driver', 'index.html'));
  }
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Volt VTC API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Demarrer le CRON Yango si les credentials sont configurees
    if (process.env.YANGO_PARK_ID && process.env.YANGO_API_KEY) {
      const yangoCron = require('./utils/yango-cron');
      yangoCron.start();
    }
  });
};

startServer();
