#!/usr/bin/env node
/**
 * Migration script: Single-tenant → Multi-tenant
 *
 * 1. Creates a default Entreprise for existing data
 * 2. Assigns entrepriseId to ALL documents in ALL collections
 * 3. Idempotent — safe to run multiple times
 *
 * Usage: cd server && node scripts/migrate-to-multitenant.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const ENTREPRISE_ID = 'ENT-DEFAULT';
const ENTREPRISE_NOM = 'Volt VTC';

async function migrate() {
  console.log('=== Migration Multi-Tenant ===\n');

  // Connect to MongoDB
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  // Load models
  const Entreprise = require('../models/Entreprise');
  const models = {
    Absence: require('../models/Absence'),
    ActivityLog: require('../models/ActivityLog'),
    Budget: require('../models/Budget'),
    Chauffeur: require('../models/Chauffeur'),
    ChecklistVehicule: require('../models/ChecklistVehicule'),
    Comptabilite: require('../models/Comptabilite'),
    ConduiteBrute: require('../models/ConduiteBrute'),
    Contravention: require('../models/Contravention'),
    ControleTechnique: require('../models/ControleTechnique'),
    Conversation: require('../models/Conversation'),
    Course: require('../models/Course'),
    Depense: require('../models/Depense'),
    DepenseCategorie: require('../models/DepenseCategorie'),
    DepenseRecurrente: require('../models/DepenseRecurrente'),
    Facture: require('../models/Facture'),
    Gps: require('../models/Gps'),
    Incident: require('../models/Incident'),
    Notification: require('../models/Notification'),
    Planning: require('../models/Planning'),
    Pointage: require('../models/Pointage'),
    PushSubscription: require('../models/PushSubscription'),
    Reparation: require('../models/Reparation'),
    Settings: require('../models/Settings'),
    Signalement: require('../models/Signalement'),
    Tache: require('../models/Tache'),
    User: require('../models/User'),
    Vehicule: require('../models/Vehicule'),
    Versement: require('../models/Versement'),
    VersementRecurrent: require('../models/VersementRecurrent')
  };

  // Step 1: Create default entreprise if not exists
  let entreprise = await Entreprise.findOne({ id: ENTREPRISE_ID });
  if (!entreprise) {
    entreprise = await Entreprise.create({
      id: ENTREPRISE_ID,
      nom: ENTREPRISE_NOM,
      slug: 'volt-vtc',
      email: '',
      statut: 'actif',
      plan: 'premium'
    });
    console.log(`✓ Entreprise créée: ${ENTREPRISE_ID} (${ENTREPRISE_NOM})`);
  } else {
    console.log(`• Entreprise existe déjà: ${ENTREPRISE_ID}`);
  }

  // Step 2: Assign entrepriseId to all documents
  let totalUpdated = 0;

  for (const [name, Model] of Object.entries(models)) {
    try {
      // Count documents without entrepriseId
      const count = await Model.countDocuments({
        $or: [
          { entrepriseId: null },
          { entrepriseId: { $exists: false } },
          { entrepriseId: '' }
        ]
      });

      if (count > 0) {
        const result = await Model.updateMany(
          {
            $or: [
              { entrepriseId: null },
              { entrepriseId: { $exists: false } },
              { entrepriseId: '' }
            ]
          },
          { $set: { entrepriseId: ENTREPRISE_ID } }
        );
        console.log(`✓ ${name}: ${result.modifiedCount} document(s) mis à jour`);
        totalUpdated += result.modifiedCount;
      } else {
        const total = await Model.countDocuments();
        console.log(`• ${name}: ${total} document(s) — déjà migrés`);
      }
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
    }
  }

  console.log(`\n=== Migration terminée: ${totalUpdated} document(s) mis à jour ===`);

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
