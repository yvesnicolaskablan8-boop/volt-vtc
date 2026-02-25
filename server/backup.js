/**
 * Backup & Restore utility for Volt VTC MongoDB data
 *
 * Usage:
 *   Export: node backup.js export
 *   Import: node backup.js import <filename>
 *
 * Creates a JSON file in ./backups/ with all collections
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import all models
const User = require('./models/User');
const Settings = require('./models/Settings');
const Chauffeur = require('./models/Chauffeur');
const Vehicule = require('./models/Vehicule');
const Versement = require('./models/Versement');
const Course = require('./models/Course');
const Comptabilite = require('./models/Comptabilite');
const Gps = require('./models/Gps');
const Planning = require('./models/Planning');
const Absence = require('./models/Absence');
const Signalement = require('./models/Signalement');
const Budget = require('./models/Budget');

const BACKUP_DIR = path.join(__dirname, 'backups');

async function exportData() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  console.log('\n--- Exporting all collections ---');

  const [
    chauffeurs, vehicules, courses, versements,
    gps, comptabilite, budgets, planning,
    absences, signalements, users, settings
  ] = await Promise.all([
    Chauffeur.find().lean(),
    Vehicule.find().lean(),
    Course.find().lean(),
    Versement.find().lean(),
    Gps.find().lean(),
    Comptabilite.find().lean(),
    Budget.find().lean(),
    Planning.find().lean(),
    Absence.find().lean(),
    Signalement.find().lean(),
    User.find().lean(),
    Settings.findOne().lean()
  ]);

  const data = {
    exportDate: new Date().toISOString(),
    collections: {
      chauffeurs,
      vehicules,
      courses,
      versements,
      gps,
      comptabilite,
      budgets,
      planning,
      absences,
      signalements,
      users,
      settings: settings ? [settings] : []
    }
  };

  // Create backups directory if it doesn't exist
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `backup-${timestamp}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

  console.log(`\n✅ Backup saved to: ${filepath}`);
  console.log(`   Chauffeurs: ${chauffeurs.length}`);
  console.log(`   Vehicules: ${vehicules.length}`);
  console.log(`   Courses: ${courses.length}`);
  console.log(`   Versements: ${versements.length}`);
  console.log(`   GPS: ${gps.length}`);
  console.log(`   Comptabilite: ${comptabilite.length}`);
  console.log(`   Budgets: ${budgets.length}`);
  console.log(`   Planning: ${planning.length}`);
  console.log(`   Absences: ${absences.length}`);
  console.log(`   Signalements: ${signalements.length}`);
  console.log(`   Users: ${users.length}`);
  console.log(`   Settings: ${settings ? 'yes' : 'no'}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

async function importData(filename) {
  const filepath = path.resolve(filename);

  if (!fs.existsSync(filepath)) {
    console.error(`ERROR: File not found: ${filepath}`);
    process.exit(1);
  }

  console.log(`Reading backup from: ${filepath}`);
  const raw = fs.readFileSync(filepath, 'utf8');
  const data = JSON.parse(raw);

  if (!data.collections) {
    console.error('ERROR: Invalid backup file format');
    process.exit(1);
  }

  console.log(`Backup date: ${data.exportDate}`);

  // Safety confirmation
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await new Promise(resolve => {
    rl.question('\n⚠️  ATTENTION: This will REPLACE all current data with the backup data.\n   Are you sure? Type "RESTORE" to confirm: ', resolve);
  });
  rl.close();

  if (answer !== 'RESTORE') {
    console.log('Cancelled.');
    process.exit(0);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const { collections } = data;

  // Clear and restore each collection
  const modelMap = {
    chauffeurs: Chauffeur,
    vehicules: Vehicule,
    courses: Course,
    versements: Versement,
    gps: Gps,
    comptabilite: Comptabilite,
    budgets: Budget,
    planning: Planning,
    absences: Absence,
    signalements: Signalement,
    users: User
  };

  for (const [name, Model] of Object.entries(modelMap)) {
    const docs = collections[name] || [];
    await Model.deleteMany({});
    if (docs.length > 0) {
      // Insert in batches to avoid memory issues
      const BATCH_SIZE = 5000;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        await Model.insertMany(batch, { ordered: false });
      }
    }
    console.log(`  ✅ ${name}: ${docs.length} documents restored`);
  }

  // Restore settings
  if (collections.settings && collections.settings.length > 0) {
    const settingsData = collections.settings[0];
    const { _id, __v, ...rest } = settingsData;
    await Settings.findOneAndUpdate({}, { $set: rest }, { upsert: true });
    console.log('  ✅ settings: restored');
  }

  await mongoose.disconnect();
  console.log('\n✅ Restore complete!');
}

// Main
const command = process.argv[2];

if (command === 'export') {
  exportData().catch(err => {
    console.error('Export failed:', err);
    process.exit(1);
  });
} else if (command === 'import') {
  const file = process.argv[3];
  if (!file) {
    console.error('Usage: node backup.js import <filename>');
    process.exit(1);
  }
  importData(file).catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
} else {
  console.log('Volt VTC Backup & Restore Tool');
  console.log('');
  console.log('Usage:');
  console.log('  node backup.js export              - Export all data to a JSON file');
  console.log('  node backup.js import <filename>   - Restore data from a backup file');
  console.log('');
  console.log('Backup files are saved in ./backups/');
}
