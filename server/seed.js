/**
 * Seed script - Creates default admin user and settings
 * Run: node seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Settings = require('./models/Settings');

async function seed() {
  try {
    // Connect to MongoDB
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('ERROR: MONGODB_URI not defined. Create a .env file from .env.example');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ id: 'USR-001' });
    if (existingAdmin) {
      console.log('Admin user already exists. Skipping user seed.');
    } else {
      // Hash admin password with bcrypt
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash('admin123', salt);

      // Create admin user
      await User.create({
        id: 'USR-001',
        prenom: 'Yves',
        nom: 'Nicolas',
        email: 'yves@volt.ci',
        telephone: '+225 07 00 00 01',
        role: 'Administrateur',
        statut: 'actif',
        avatar: null,
        passwordHash,
        mustChangePassword: false,
        permissions: {
          dashboard: true,
          chauffeurs: true,
          vehicules: true,
          planning: true,
          versements: true,
          rentabilite: true,
          comptabilite: true,
          gps_conduite: true,
          alertes: true,
          rapports: true,
          parametres: true
        },
        dernierConnexion: new Date(),
        dateCreation: new Date('2024-01-10T08:00:00Z')
      });
      console.log('Admin user created: yves@volt.ci / admin123');
    }

    // Check if settings already exist
    const existingSettings = await Settings.findOne();
    if (existingSettings) {
      console.log('Settings already exist. Skipping settings seed.');
    } else {
      await Settings.create({
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
      console.log('Default settings created');
    }

    console.log('\nSeed complete!');
    console.log('Admin credentials: yves@volt.ci / admin123');

  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seed();
