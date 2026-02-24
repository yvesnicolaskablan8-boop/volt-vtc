/**
 * Seed Demo Data for Mauralex Presentation
 * 31 vehicules, 62 chauffeurs, daily data from Jan 2022 to Jul 2025
 * Run: node seed-demo.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
const Notification = require('./models/Notification');

// ============================================================
// DATA DEFINITIONS
// ============================================================

const VEHICULES_DATA = [
  { immat: 'AA741AY', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: '210LP01', marque: 'Suzuki', modele: 'Dzire', annee: 2020 },
  { immat: '724AY', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: '145AZ', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: '715CY', marque: 'Suzuki', modele: 'Dzire', annee: 2022 },
  { immat: 'AA139AV01', marque: 'Suzuki', modele: 'Dzire', annee: 2020 },
  { immat: 'AA669AS', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: 'AA982AC', marque: 'Suzuki', modele: 'Dzire', annee: 2020 },
  { immat: 'AA704AJ', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: '3109LL01', marque: 'Suzuki', modele: 'S-Presso', annee: 2022 },
  { immat: 'AA708DC', marque: 'Suzuki', modele: 'S-Presso', annee: 2022 },
  { immat: 'AA071AT', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: '419KU01', marque: 'Suzuki', modele: 'Dzire', annee: 2020 },
  { immat: '1473LX01', marque: 'Suzuki', modele: 'Dzire', annee: 2022 },
  { immat: 'AA550AM01', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: 'AA509JL01', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: 'AA906AY', marque: 'Suzuki', modele: 'Dzire', annee: 2022 },
  { immat: '458AH', marque: 'Suzuki', modele: 'Dzire', annee: 2020 },
  { immat: '2677LC01', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: 'AA791AF01', marque: 'Suzuki', modele: 'S-Presso', annee: 2022 },
  { immat: 'AA380TR01', marque: 'Suzuki', modele: 'Dzire', annee: 2022 },
  { immat: 'AA601LY01', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: '1815LJ01', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: '483LX01', marque: 'Suzuki', modele: 'Dzire', annee: 2022 },
  { immat: '3346LP01', marque: 'Suzuki', modele: 'Dzire', annee: 2022 },
  { immat: 'AA642EP', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: 'AA351AD01', marque: 'Suzuki', modele: 'Dzire', annee: 2020 },
  { immat: 'AA760BP01', marque: 'Suzuki', modele: 'S-Presso', annee: 2022 },
  { immat: 'AA708DC2', marque: 'Suzuki', modele: 'S-Presso', annee: 2022 },
  { immat: '4943AT01', marque: 'Suzuki', modele: 'Dzire', annee: 2021 },
  { immat: 'AA031RR01', marque: 'Suzuki', modele: 'S-Presso', annee: 2023 }
];

// 62 Ivorian names (2 per vehicle)
const CHAUFFEURS_DATA = [
  // Vehicle 1 - AA741AY
  { prenom: 'Kouadio', nom: 'Yao Jean', tel: '+225 07 01 01 01' },
  { prenom: 'Dje', nom: 'Bi Tra Marcel', tel: '+225 07 01 01 02' },
  // Vehicle 2 - 210LP01
  { prenom: 'Koffi', nom: 'Aka Sylvain', tel: '+225 07 02 01 01' },
  { prenom: 'Bamba', nom: 'Moussa', tel: '+225 07 02 01 02' },
  // Vehicle 3 - 724AY
  { prenom: 'Coulibaly', nom: 'Ibrahim', tel: '+225 07 03 01 01' },
  { prenom: 'Traore', nom: 'Seydou', tel: '+225 07 03 01 02' },
  // Vehicle 4 - 145AZ
  { prenom: 'Diallo', nom: 'Mamadou', tel: '+225 07 04 01 01' },
  { prenom: 'Konan', nom: 'Kouassi Bertin', tel: '+225 07 04 01 02' },
  // Vehicle 5 - 715CY
  { prenom: 'Ouattara', nom: 'Lassina', tel: '+225 07 05 01 01' },
  { prenom: 'Kone', nom: 'Drissa', tel: '+225 07 05 01 02' },
  // Vehicle 6 - AA139AV01
  { prenom: 'Gnamba', nom: 'Ahou Viviane', tel: '+225 07 06 01 01' },
  { prenom: 'Ake', nom: 'N\'Guessan Firmin', tel: '+225 07 06 01 02' },
  // Vehicle 7 - AA669AS
  { prenom: 'Toure', nom: 'Abdoulaye', tel: '+225 07 07 01 01' },
  { prenom: 'Sanogo', nom: 'Bakary', tel: '+225 07 07 01 02' },
  // Vehicle 8 - AA982AC
  { prenom: 'Dosso', nom: 'Fofana', tel: '+225 07 08 01 01' },
  { prenom: 'Yapi', nom: 'Kouame Lucien', tel: '+225 07 08 01 02' },
  // Vehicle 9 - AA704AJ
  { prenom: 'Aka', nom: 'Bi Zeze Alphonse', tel: '+225 07 09 01 01' },
  { prenom: 'Dembele', nom: 'Souleymane', tel: '+225 07 09 01 02' },
  // Vehicle 10 - 3109LL01
  { prenom: 'Soro', nom: 'Nagolo', tel: '+225 07 10 01 01' },
  { prenom: 'Eba', nom: 'Adjoua Paulette', tel: '+225 07 10 01 02' },
  // Vehicle 11 - AA708DC
  { prenom: 'Tanoh', nom: 'Kra Ernest', tel: '+225 07 11 01 01' },
  { prenom: 'Meite', nom: 'Brahima', tel: '+225 07 11 01 02' },
  // Vehicle 12 - AA071AT
  { prenom: 'N\'Dri', nom: 'Kouadio Pascal', tel: '+225 07 12 01 01' },
  { prenom: 'Cisse', nom: 'Lacina', tel: '+225 07 12 01 02' },
  // Vehicle 13 - 419KU01
  { prenom: 'Diomande', nom: 'Vassiriki', tel: '+225 07 13 01 01' },
  { prenom: 'Zadi', nom: 'Bi Irrie Godefroy', tel: '+225 07 13 01 02' },
  // Vehicle 14 - 1473LX01
  { prenom: 'Kacou', nom: 'Amani Desire', tel: '+225 07 14 01 01' },
  { prenom: 'Fofana', nom: 'Sindou', tel: '+225 07 14 01 02' },
  // Vehicle 15 - AA550AM01
  { prenom: 'Loukou', nom: 'Adjoumani Bernard', tel: '+225 07 15 01 01' },
  { prenom: 'Dao', nom: 'Ladji', tel: '+225 07 15 01 02' },
  // Vehicle 16 - AA509JL01
  { prenom: 'Assi', nom: 'Brou Mathieu', tel: '+225 07 16 01 01' },
  { prenom: 'Camara', nom: 'Mohamed', tel: '+225 07 16 01 02' },
  // Vehicle 17 - AA906AY
  { prenom: 'Gnamien', nom: 'Konan Theodore', tel: '+225 07 17 01 01' },
  { prenom: 'Bakayoko', nom: 'Adama', tel: '+225 07 17 01 02' },
  // Vehicle 18 - 458AH
  { prenom: 'Tape', nom: 'Bi Bah Emile', tel: '+225 07 18 01 01' },
  { prenom: 'Sidibe', nom: 'Ousmane', tel: '+225 07 18 01 02' },
  // Vehicle 19 - 2677LC01
  { prenom: 'Guei', nom: 'Tai Olivier', tel: '+225 07 19 01 01' },
  { prenom: 'Konate', nom: 'Siaka', tel: '+225 07 19 01 02' },
  // Vehicle 20 - AA791AF01
  { prenom: 'Bledou', nom: 'Koffi Lazare', tel: '+225 07 20 01 01' },
  { prenom: 'Ouedraogo', nom: 'Hamidou', tel: '+225 07 20 01 02' },
  // Vehicle 21 - AA380TR01
  { prenom: 'Ehui', nom: 'Amoikon Franck', tel: '+225 07 21 01 01' },
  { prenom: 'Doumbia', nom: 'Karamoko', tel: '+225 07 21 01 02' },
  // Vehicle 22 - AA601LY01
  { prenom: 'Gbane', nom: 'Oumar', tel: '+225 07 22 01 01' },
  { prenom: 'Assamoi', nom: 'Aka Christian', tel: '+225 07 22 01 02' },
  // Vehicle 23 - 1815LJ01
  { prenom: 'Tano', nom: 'Kouassi Ange', tel: '+225 07 23 01 01' },
  { prenom: 'Diabate', nom: 'Yacouba', tel: '+225 07 23 01 02' },
  // Vehicle 24 - 483LX01
  { prenom: 'Abouo', nom: 'N\'Da Philippe', tel: '+225 07 24 01 01' },
  { prenom: 'Hien', nom: 'Sie Paul', tel: '+225 07 24 01 02' },
  // Vehicle 25 - 3346LP01
  { prenom: 'Brou', nom: 'Achi Landry', tel: '+225 07 25 01 01' },
  { prenom: 'Keita', nom: 'Moussa', tel: '+225 07 25 01 02' },
  // Vehicle 26 - AA642EP
  { prenom: 'Amani', nom: 'N\'Goran Felix', tel: '+225 07 26 01 01' },
  { prenom: 'Sylla', nom: 'Mamadou', tel: '+225 07 26 01 02' },
  // Vehicle 27 - AA351AD01
  { prenom: 'Okou', nom: 'Bi Tra Gerard', tel: '+225 07 27 01 01' },
  { prenom: 'Savane', nom: 'Aboubacar', tel: '+225 07 27 01 02' },
  // Vehicle 28 - AA760BP01
  { prenom: 'Irie', nom: 'Bi Gohi Serge', tel: '+225 07 28 01 01' },
  { prenom: 'Kra', nom: 'Kouadio Alexis', tel: '+225 07 28 01 02' },
  // Vehicle 29 - AA708DC2
  { prenom: 'Boni', nom: 'Kouame Rene', tel: '+225 07 29 01 01' },
  { prenom: 'Silue', nom: 'Tiemoko', tel: '+225 07 29 01 02' },
  // Vehicle 30 - 4943AT01
  { prenom: 'Dje', nom: 'Kouadio Samuel', tel: '+225 07 30 01 01' },
  { prenom: 'Kouyate', nom: 'Abou', tel: '+225 07 30 01 02' },
  // Vehicle 31 - AA031RR01
  { prenom: 'Goore', nom: 'Bi Lou Mathias', tel: '+225 07 31 01 01' },
  { prenom: 'Togba', nom: 'Zeze Isidore', tel: '+225 07 31 01 02' }
];

// Abidjan locations for courses
const LOCATIONS = [
  'Cocody Riviera', 'Cocody Angre', 'Cocody II Plateaux', 'Cocody Rivieria Palmeraie',
  'Marcory Zone 4', 'Marcory Anoumabo', 'Treichville', 'Plateau Centre',
  'Plateau Commerce', 'Adjame', 'Adjame 220 Logements', 'Abobo Avocatier',
  'Abobo Gare', 'Yopougon Selmer', 'Yopougon Maroc', 'Yopougon Niangon',
  'Koumassi', 'Port-Bouet', 'Bingerville', 'Bassam',
  'Cocody Attoban', 'Cocody Bonoumin', 'Riviera Faya', 'Riviera Golf',
  'Marcory Remblai', 'Koumassi Remblai', 'II Plateaux Vallon',
  'Williamsville', 'Adjame Liberté', 'Deux Plateaux ENA'
];

// Maintenance types and costs
const MAINTENANCE_TYPES = [
  { type: 'vidange', label: 'Vidange moteur', coutMin: 15000, coutMax: 35000, intervalleKm: 5000 },
  { type: 'pneus', label: 'Changement pneus', coutMin: 80000, coutMax: 160000, intervalleKm: 40000 },
  { type: 'freins', label: 'Plaquettes de frein', coutMin: 25000, coutMax: 60000, intervalleKm: 30000 },
  { type: 'filtres', label: 'Changement filtres', coutMin: 10000, coutMax: 25000, intervalleKm: 10000 },
  { type: 'revision', label: 'Revision générale', coutMin: 50000, coutMax: 120000, intervalleKm: 20000 },
  { type: 'climatisation', label: 'Climatisation', coutMin: 30000, coutMax: 80000, intervalleKm: 25000 },
  { type: 'batterie', label: 'Batterie', coutMin: 35000, coutMax: 65000, intervalleKm: 50000 },
  { type: 'amortisseurs', label: 'Amortisseurs', coutMin: 60000, coutMax: 150000, intervalleKm: 60000 },
  { type: 'courroie', label: 'Courroie distribution', coutMin: 45000, coutMax: 90000, intervalleKm: 80000 },
  { type: 'echappement', label: 'Echappement', coutMin: 40000, coutMax: 85000, intervalleKm: 70000 }
];

const COMPTABILITE_CATEGORIES = {
  revenue: ['courses_yango', 'courses_privees', 'location_vehicule'],
  expense: ['carburant', 'maintenance', 'assurance', 'leasing', 'salaires', 'amendes', 'lavage', 'peage', 'administratif', 'divers']
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function uid(prefix, idx) {
  return `${prefix}-${String(idx).padStart(3, '0')}`;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dateStr(date) {
  return date.toISOString();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 6; // Monday-Saturday
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Seeded random for reproducibility
let _seed = 42;
function seededRandom() {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}

function seededRand(min, max) {
  return Math.floor(seededRandom() * (max - min + 1)) + min;
}

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

async function seedDemo() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('ERROR: MONGODB_URI not defined');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // ====== CLEAR EXISTING DATA ======
    console.log('\n--- Clearing existing data ---');
    await Promise.all([
      Chauffeur.deleteMany({}),
      Vehicule.deleteMany({}),
      Versement.deleteMany({}),
      Course.deleteMany({}),
      Comptabilite.deleteMany({}),
      Gps.deleteMany({}),
      Planning.deleteMany({}),
      Absence.deleteMany({}),
      Signalement.deleteMany({}),
      Budget.deleteMany({}),
      Notification.deleteMany({})
    ]);
    console.log('All collections cleared');

    // ====== UPDATE SETTINGS ======
    console.log('\n--- Updating settings for Mauralex ---');
    await Settings.findOneAndUpdate({}, {
      $set: {
        'entreprise.nom': 'Mauralex',
        'entreprise.slogan': 'Excellence en transport VTC',
        'entreprise.email': 'contact@mauralex.ci',
        'entreprise.telephone': '+225 27 22 00 00 00',
        'entreprise.adresse': 'Abidjan, Cocody Riviera Bonoumin',
        'entreprise.siteWeb': 'www.mauralex.ci',
        'entreprise.numeroRegistre': 'CI-ABJ-2021-MAURALEX',
        'entreprise.devise': 'FCFA'
      }
    }, { upsert: true });
    console.log('Settings updated to Mauralex');

    // ====== CREATE VEHICULES ======
    console.log('\n--- Creating 31 vehicles ---');
    const vehicules = [];
    const COULEURS = ['Blanc', 'Gris', 'Noir', 'Argent', 'Blanc Nacré'];

    for (let i = 0; i < VEHICULES_DATA.length; i++) {
      const v = VEHICULES_DATA[i];
      const vId = uid('VEH', i + 1);
      const isSPresso = v.modele === 'S-Presso';
      const prix = isSPresso ? rand(6500000, 7500000) : rand(7500000, 9000000);
      const km = rand(80000, 220000);

      vehicules.push({
        id: vId,
        marque: v.marque,
        modele: v.modele,
        annee: v.annee,
        immatriculation: v.immat,
        vin: `MALA${String(i + 1).padStart(2, '0')}${rand(100000, 999999)}CI`,
        couleur: pickRandom(COULEURS),
        typeEnergie: 'thermique',
        typeAcquisition: i < 10 ? 'cash' : 'leasing',
        prixAchat: prix,
        mensualiteLeasing: i >= 10 ? Math.round(prix / 48) : 0,
        dureeLeasing: i >= 10 ? 48 : 0,
        apportInitial: i >= 10 ? Math.round(prix * 0.2) : 0,
        datePremiereMensualite: i >= 10 ? dateStr(new Date(v.annee, rand(0, 5), 1)) : '',
        kilometrage: km,
        kilometrageMensuel: rand(3000, 5000),
        dateDerniereRevision: dateStr(new Date(2025, rand(0, 5), rand(1, 28))),
        prochainRevisionKm: km + rand(3000, 8000),
        assureur: pickRandom(['NSIA', 'Saham', 'Atlantique Assurances', 'Allianz CI']),
        numeroPolice: `POL-${rand(100000, 999999)}`,
        primeAnnuelle: rand(250000, 400000),
        dateExpirationAssurance: dateStr(new Date(2025, rand(6, 11), rand(1, 28))),
        statut: 'en_service',
        chauffeurAssigne: uid('CHF', i * 2 + 1), // First driver of the pair
        consommation: isSPresso ? randFloat(5.5, 7.0) : randFloat(6.0, 8.0),
        coutEnergie: rand(700, 900),
        dateCreation: dateStr(new Date(2021, 11, rand(1, 28))),
        coutsMaintenance: [],
        maintenancesPlanifiees: []
      });
    }

    // Generate maintenance history for each vehicle
    for (let vi = 0; vi < vehicules.length; vi++) {
      const v = vehicules[vi];
      let currentKm = rand(5000, 15000); // Starting KM
      const startDate = new Date(2022, 0, 1);
      const endDate = new Date(2025, 6, 15);
      const maintenanceLogs = [];
      let maintIdx = 0;

      // Generate maintenance events over the years
      let d = new Date(startDate);
      while (d < endDate) {
        // Every ~2-4 months, a maintenance event
        d = addDays(d, rand(45, 120));
        if (d >= endDate) break;

        currentKm += rand(8000, 20000);
        const mt = MAINTENANCE_TYPES[maintIdx % MAINTENANCE_TYPES.length];
        maintIdx++;

        const cost = rand(mt.coutMin, mt.coutMax);
        maintenanceLogs.push({
          id: `MNT-${uid('V' + (vi + 1), maintIdx)}`,
          date: dateStr(d),
          type: mt.type,
          description: mt.label,
          montant: cost,
          kilometrage: currentKm
        });
      }

      v.coutsMaintenance = maintenanceLogs;
      v.kilometrage = currentKm + rand(1000, 5000);

      // Add planned maintenances
      const plannedTypes = ['vidange', 'pneus', 'revision', 'filtres'];
      v.maintenancesPlanifiees = plannedTypes.map((type, pi) => {
        const mt = MAINTENANCE_TYPES.find(m => m.type === type);
        return {
          id: `MPL-${uid('V' + (vi + 1), pi + 1)}`,
          type,
          label: mt.label,
          declencheur: 'les_deux',
          intervalleKm: mt.intervalleKm,
          intervalleMois: Math.round(mt.intervalleKm / 4000),
          dernierKm: v.kilometrage - rand(1000, mt.intervalleKm),
          derniereDate: dateStr(new Date(2025, rand(2, 5), rand(1, 28))),
          prochainKm: v.kilometrage + rand(500, mt.intervalleKm),
          prochaineDate: dateStr(new Date(2025, rand(7, 10), rand(1, 28))),
          coutEstime: rand(mt.coutMin, mt.coutMax),
          prestataire: pickRandom(['Garage Central Abidjan', 'Auto Service Cocody', 'Meca Plus Riviera', 'Suzuki Service CI', 'Garage Excellence']),
          notes: '',
          statut: pi === 0 ? 'urgent' : 'a_venir',
          dateCreation: dateStr(new Date(2025, 0, 1))
        };
      });
    }

    await Vehicule.insertMany(vehicules);
    console.log(`${vehicules.length} vehicles created`);

    // ====== CREATE CHAUFFEURS ======
    console.log('\n--- Creating 62 drivers ---');
    const chauffeurs = [];

    for (let i = 0; i < CHAUFFEURS_DATA.length; i++) {
      const c = CHAUFFEURS_DATA[i];
      const cId = uid('CHF', i + 1);
      const vehiculeIdx = Math.floor(i / 2);
      const vId = uid('VEH', vehiculeIdx + 1);

      chauffeurs.push({
        id: cId,
        prenom: c.prenom,
        nom: c.nom,
        telephone: c.tel,
        email: `${c.prenom.toLowerCase().replace(/['\s]/g, '')}.${c.nom.toLowerCase().split(' ')[0]}@mauralex.ci`,
        dateNaissance: dateStr(new Date(rand(1980, 1998), rand(0, 11), rand(1, 28))),
        adresse: `${pickRandom(LOCATIONS)}, Abidjan`,
        numeroPermis: `CI-${rand(100000, 999999)}`,
        dateDebutContrat: dateStr(new Date(2021, rand(6, 11), rand(1, 28))),
        statut: 'actif',
        scoreConduite: rand(65, 98),
        baseScore: rand(70, 90),
        volatility: randFloat(2, 8),
        weakness: pickRandom(['vitesse', 'freinage', 'acceleration', 'virage', null]),
        yangoDriverId: `yango_drv_${String(i + 1).padStart(4, '0')}`,
        vehiculeAssigne: vId,
        noteInterne: '',
        dateCreation: dateStr(new Date(2021, 11, rand(1, 28))),
        documents: [
          {
            type: 'permis',
            nom: 'Permis de conduire',
            dateExpiration: dateStr(new Date(2026, rand(0, 11), rand(1, 28))),
            statut: 'valide'
          },
          {
            type: 'carte_identite',
            nom: 'Carte nationale d\'identité',
            dateExpiration: dateStr(new Date(2027, rand(0, 11), rand(1, 28))),
            statut: 'valide'
          }
        ]
      });
    }

    await Chauffeur.insertMany(chauffeurs);
    console.log(`${chauffeurs.length} drivers created`);

    // ====== GENERATE DAILY DATA: Jan 2022 - Jul 2025 ======
    console.log('\n--- Generating daily operational data (Jan 2022 - Jul 2025) ---');
    console.log('This will take a few minutes...\n');

    const START_DATE = new Date(2022, 0, 3); // Monday Jan 3, 2022
    const END_DATE = new Date(2025, 6, 15);  // Jul 15, 2025
    const RECETTE_JOUR = 23000; // FCFA per day per vehicle
    const COMMISSION_YANGO_RATE = 0.18; // 18% Yango commission

    let versements = [];
    let courses = [];
    let comptaEntries = [];
    let gpsRecords = [];
    let planningRecords = [];
    let absences = [];
    let signalements = [];

    let versementCounter = 0;
    let courseCounter = 0;
    let comptaCounter = 0;
    let gpsCounter = 0;
    let planningCounter = 0;
    let absenceCounter = 0;
    let signalementCounter = 0;

    const BATCH_SIZE = 5000;

    // Track current driver per vehicle (alternates weekly)
    // Driver 0 = index i*2, Driver 1 = index i*2+1
    // Alternate every week

    let currentDate = new Date(START_DATE);
    let dayCount = 0;
    let weekNumber = 0;
    let lastWeekStart = getMonday(currentDate);

    while (currentDate <= END_DATE) {
      // Check week change
      const thisWeekStart = getMonday(currentDate);
      if (thisWeekStart.getTime() !== lastWeekStart.getTime()) {
        weekNumber++;
        lastWeekStart = thisWeekStart;
      }

      const isWorkDay = isWeekday(currentDate); // Mon-Sat
      const dateISO = dateStr(currentDate);
      const month = currentDate.getMonth();
      const year = currentDate.getFullYear();

      // Process each vehicle
      for (let vi = 0; vi < 31; vi++) {
        const vId = uid('VEH', vi + 1);
        // Determine active driver for this week (alternates)
        const driverOffset = weekNumber % 2;
        const activeDriverIdx = vi * 2 + driverOffset;
        const cId = uid('CHF', activeDriverIdx + 1);

        if (!isWorkDay) continue; // Sunday = rest

        // Random absence (~3% chance per driver-day)
        if (seededRandom() < 0.03) {
          // Skip this day (driver absent)
          if (seededRandom() < 0.4) {
            // Record the absence
            absenceCounter++;
            absences.push({
              id: uid('ABS', absenceCounter),
              chauffeurId: cId,
              type: pickRandom(['conge', 'maladie', 'repos', 'autre']),
              dateDebut: dateISO,
              dateFin: dateStr(addDays(currentDate, rand(1, 3))),
              motif: pickRandom(['Raison personnelle', 'Maladie', 'Repos hebdomadaire', 'Rendez-vous médical', 'Événement familial']),
              dateCreation: dateISO
            });
          }
          continue;
        }

        // ---- RECETTE DU JOUR ----
        // Variation: +/- 20% around 23000
        const variation = 0.8 + seededRandom() * 0.4; // 0.8 to 1.2
        const recetteJour = Math.round(RECETTE_JOUR * variation);
        const commissionYango = Math.round(recetteJour * COMMISSION_YANGO_RATE);
        const netAmount = recetteJour - commissionYango;

        // Number of courses per day: 12-20
        const nbCourses = seededRand(12, 20);
        const courseMontant = Math.round(recetteJour / nbCourses);

        // ---- PLANNING ----
        planningCounter++;
        planningRecords.push({
          id: uid('PLN', planningCounter),
          chauffeurId: cId,
          date: dateISO,
          typeCreneaux: 'journee',
          notes: '',
          dateCreation: dateISO
        });

        // ---- COURSES ----
        for (let ci = 0; ci < nbCourses; ci++) {
          courseCounter++;
          const heure = 6 + Math.floor(ci * (16 / nbCourses));
          const minute = seededRand(0, 59);
          const courseDate = new Date(currentDate);
          courseDate.setHours(heure, minute, 0, 0);
          const dist = randFloat(3, 25);

          courses.push({
            id: uid('CRS', courseCounter),
            chauffeurId: cId,
            vehiculeId: vId,
            dateHeure: dateStr(courseDate),
            depart: pickRandom(LOCATIONS),
            arrivee: pickRandom(LOCATIONS),
            distanceKm: dist,
            dureeMn: Math.round(dist * randFloat(2.5, 5)),
            montantTTC: courseMontant + seededRand(-300, 300),
            montantHT: Math.round(courseMontant * 0.82),
            tva: Math.round(courseMontant * 0.18),
            typeTrajet: pickRandom(['standard', 'confort', 'eco']),
            plateforme: 'yango',
            statut: 'terminee',
            noteClient: seededRand(3, 5)
          });
        }

        // ---- VERSEMENT (daily payment) ----
        versementCounter++;
        const statut = seededRandom() < 0.85 ? 'paye' : (seededRandom() < 0.5 ? 'approuve' : 'en_attente');
        versements.push({
          id: uid('VRS', versementCounter),
          chauffeurId: cId,
          vehiculeId: vId,
          date: dateISO,
          periode: `${year}-${String(month + 1).padStart(2, '0')}`,
          montantBrut: recetteJour,
          commission: commissionYango,
          montantNet: netAmount,
          montantVerse: statut === 'paye' ? netAmount : 0,
          statut: statut,
          nombreCourses: nbCourses,
          soumisParChauffeur: true,
          enRetard: seededRandom() < 0.08,
          penaliteMontant: 0,
          dateCreation: dateISO
        });

        // ---- GPS / CONDUITE ----
        gpsCounter++;
        const baseScore = 60 + seededRand(0, 35);
        gpsRecords.push({
          id: uid('GPS', gpsCounter),
          chauffeurId: cId,
          vehiculeId: vId,
          date: dateISO,
          scoreGlobal: baseScore + seededRand(-5, 10),
          scoreVitesse: baseScore + seededRand(-10, 15),
          scoreFreinage: baseScore + seededRand(-10, 10),
          scoreAcceleration: baseScore + seededRand(-8, 12),
          scoreVirage: baseScore + seededRand(-12, 8),
          scoreRegularite: baseScore + seededRand(-5, 15),
          scoreActivite: 60 + seededRand(0, 35),
          evenements: {
            freinagesBrusques: seededRand(0, 5),
            accelerationsBrusques: seededRand(0, 4),
            excesVitesse: seededRand(0, 3),
            viragesAgressifs: seededRand(0, 2),
            tempsConduite: seededRand(360, 660),
            tempsActiviteYango: seededRand(300, 600),
            distanceParcourue: rand(80, 200),
            vitesseMoyenne: randFloat(25, 45),
            vitesseMax: randFloat(80, 130)
          },
          dateCreation: dateISO
        });

        // ---- COMPTABILITE (revenue entry) ----
        comptaCounter++;
        comptaEntries.push({
          id: uid('CPT', comptaCounter),
          type: 'revenue',
          categorie: 'courses_yango',
          description: `Recette courses ${chauffeurs[activeDriverIdx].prenom} ${chauffeurs[activeDriverIdx].nom.split(' ')[0]}`,
          montant: recetteJour,
          date: dateISO,
          modePaiement: seededRandom() < 0.6 ? 'cash' : 'bank_transfer',
          reference: `REC-${year}${String(month + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}-V${vi + 1}`,
          dateCreation: dateISO
        });

        // ---- Fuel expense (~4000-6000 FCFA/day) ----
        if (seededRandom() < 0.85) {
          comptaCounter++;
          comptaEntries.push({
            id: uid('CPT', comptaCounter),
            type: 'expense',
            categorie: 'carburant',
            description: `Carburant ${VEHICULES_DATA[vi].immat}`,
            montant: seededRand(4000, 6500),
            date: dateISO,
            modePaiement: 'cash',
            reference: `FUEL-${vi + 1}-${dayCount}`,
            dateCreation: dateISO
          });
        }

      } // end vehicle loop

      // ---- MONTHLY expenses (insurance, leasing, salaries, washing) ----
      if (currentDate.getDate() === 1) {
        // Salaries/commissions for all 62 drivers
        for (let ci = 0; ci < 62; ci++) {
          comptaCounter++;
          comptaEntries.push({
            id: uid('CPT', comptaCounter),
            type: 'expense',
            categorie: 'salaires',
            description: `Commission chauffeur ${chauffeurs[ci].prenom} ${chauffeurs[ci].nom.split(' ')[0]}`,
            montant: rand(50000, 80000),
            date: dateISO,
            modePaiement: 'bank_transfer',
            reference: `SAL-${year}${String(month + 1).padStart(2, '0')}-CHF${ci + 1}`,
            dateCreation: dateISO
          });
        }

        // Insurance (yearly, but monthly provision)
        for (let vi = 0; vi < 31; vi++) {
          comptaCounter++;
          comptaEntries.push({
            id: uid('CPT', comptaCounter),
            type: 'expense',
            categorie: 'assurance',
            description: `Provision assurance ${VEHICULES_DATA[vi].immat}`,
            montant: Math.round(vehicules[vi].primeAnnuelle / 12),
            date: dateISO,
            modePaiement: 'bank_transfer',
            reference: `ASS-${year}${String(month + 1).padStart(2, '0')}-V${vi + 1}`,
            dateCreation: dateISO
          });
        }

        // Leasing payments (vehicles 10+)
        for (let vi = 10; vi < 31; vi++) {
          if (vehicules[vi].mensualiteLeasing > 0) {
            comptaCounter++;
            comptaEntries.push({
              id: uid('CPT', comptaCounter),
              type: 'expense',
              categorie: 'leasing',
              description: `Mensualité leasing ${VEHICULES_DATA[vi].immat}`,
              montant: vehicules[vi].mensualiteLeasing,
              date: dateISO,
              modePaiement: 'bank_transfer',
              reference: `LEAS-${year}${String(month + 1).padStart(2, '0')}-V${vi + 1}`,
              dateCreation: dateISO
            });
          }
        }

        // Car wash (2x per month per vehicle)
        for (let vi = 0; vi < 31; vi++) {
          comptaCounter++;
          comptaEntries.push({
            id: uid('CPT', comptaCounter),
            type: 'expense',
            categorie: 'lavage',
            description: `Lavage véhicule ${VEHICULES_DATA[vi].immat}`,
            montant: rand(3000, 5000) * 2,
            date: dateISO,
            modePaiement: 'cash',
            reference: `LAV-${year}${String(month + 1).padStart(2, '0')}-V${vi + 1}`,
            dateCreation: dateISO
          });
        }

        // Administrative costs (monthly)
        comptaCounter++;
        comptaEntries.push({
          id: uid('CPT', comptaCounter),
          type: 'expense',
          categorie: 'administratif',
          description: `Frais administratifs ${month + 1}/${year}`,
          montant: rand(50000, 150000),
          date: dateISO,
          modePaiement: 'bank_transfer',
          reference: `ADM-${year}${String(month + 1).padStart(2, '0')}`,
          dateCreation: dateISO
        });
      }

      // Random signalement (~1% chance per day for entire fleet)
      if (seededRandom() < 0.03) {
        signalementCounter++;
        const vi = seededRand(0, 30);
        const driverOffset = weekNumber % 2;
        const activeDriverIdx = vi * 2 + driverOffset;
        signalements.push({
          id: uid('SIG', signalementCounter),
          chauffeurId: uid('CHF', activeDriverIdx + 1),
          vehiculeId: uid('VEH', vi + 1),
          type: pickRandom(['panne', 'accident', 'amende', 'pneu', 'autre']),
          titre: pickRandom([
            'Panne moteur', 'Crevaison pneu', 'Accident léger', 'Amende excès de vitesse',
            'Problème climatisation', 'Batterie faible', 'Feu arrière cassé',
            'Problème embrayage', 'Vitre fissurée', 'Rétroviseur cassé'
          ]),
          description: 'Incident signalé par le chauffeur',
          urgence: pickRandom(['normale', 'haute', 'critique']),
          statut: pickRandom(['ouvert', 'en_cours', 'resolu', 'ferme']),
          localisation: pickRandom(LOCATIONS),
          dateSignalement: dateISO,
          dateCreation: dateISO
        });
      }

      dayCount++;
      currentDate = addDays(currentDate, 1);

      // Batch insert to avoid memory issues
      if (versements.length >= BATCH_SIZE) {
        await Versement.insertMany(versements);
        console.log(`  Versements batch: ${versementCounter} total`);
        versements = [];
      }
      if (courses.length >= BATCH_SIZE) {
        await Course.insertMany(courses);
        console.log(`  Courses batch: ${courseCounter} total`);
        courses = [];
      }
      if (comptaEntries.length >= BATCH_SIZE) {
        await Comptabilite.insertMany(comptaEntries);
        console.log(`  Comptabilité batch: ${comptaCounter} total`);
        comptaEntries = [];
      }
      if (gpsRecords.length >= BATCH_SIZE) {
        await Gps.insertMany(gpsRecords);
        console.log(`  GPS batch: ${gpsCounter} total`);
        gpsRecords = [];
      }
      if (planningRecords.length >= BATCH_SIZE) {
        await Planning.insertMany(planningRecords);
        console.log(`  Planning batch: ${planningCounter} total`);
        planningRecords = [];
      }

      // Progress log every 100 days
      if (dayCount % 100 === 0) {
        console.log(`  Day ${dayCount} - ${currentDate.toISOString().split('T')[0]} | VRS:${versementCounter} CRS:${courseCounter} CPT:${comptaCounter}`);
      }
    } // end date loop

    // Insert remaining records
    console.log('\n--- Inserting remaining records ---');
    if (versements.length) await Versement.insertMany(versements);
    if (courses.length) await Course.insertMany(courses);
    if (comptaEntries.length) await Comptabilite.insertMany(comptaEntries);
    if (gpsRecords.length) await Gps.insertMany(gpsRecords);
    if (planningRecords.length) await Planning.insertMany(planningRecords);
    if (absences.length) await Absence.insertMany(absences);
    if (signalements.length) await Signalement.insertMany(signalements);

    // ====== BUDGETS ======
    console.log('\n--- Creating yearly budgets ---');
    const budgets = [];
    let budgetCounter = 0;
    for (const year of [2022, 2023, 2024, 2025]) {
      const budgetCategories = [
        { cat: 'carburant', type: 'expense', montant: 31 * 5000 * 26 * 12 }, // 31 cars * 5000/day * 26 days/month * 12 months
        { cat: 'maintenance', type: 'expense', montant: 31 * 50000 * 4 }, // 31 cars * 50000 * 4 times/year
        { cat: 'assurance', type: 'expense', montant: 31 * 320000 }, // 31 cars * annual premium
        { cat: 'leasing', type: 'expense', montant: 21 * 170000 * 12 }, // 21 leased cars
        { cat: 'salaires', type: 'expense', montant: 62 * 65000 * 12 }, // 62 drivers
        { cat: 'courses_yango', type: 'revenue', montant: 31 * 23000 * 26 * 12 }, // Target revenue
        { cat: 'administratif', type: 'expense', montant: 100000 * 12 },
        { cat: 'lavage', type: 'expense', montant: 31 * 8000 * 12 }
      ];

      for (const b of budgetCategories) {
        budgetCounter++;
        budgets.push({
          id: uid('BDG', budgetCounter),
          categorie: b.cat,
          type: b.type,
          montantPrevu: Math.round(b.montant * (0.9 + seededRandom() * 0.2)),
          annee: year,
          dateCreation: dateStr(new Date(year, 0, 1))
        });
      }
    }
    await Budget.insertMany(budgets);
    console.log(`${budgets.length} budgets created`);

    // ====== SUMMARY ======
    console.log('\n========================================');
    console.log('   SEED DEMO COMPLETE - MAURALEX');
    console.log('========================================');
    console.log(`Véhicules:      ${vehicules.length}`);
    console.log(`Chauffeurs:     ${chauffeurs.length}`);
    console.log(`Versements:     ${versementCounter}`);
    console.log(`Courses:        ${courseCounter}`);
    console.log(`Comptabilité:   ${comptaCounter}`);
    console.log(`GPS/Conduite:   ${gpsCounter}`);
    console.log(`Planning:       ${planningCounter}`);
    console.log(`Absences:       ${absences.length}`);
    console.log(`Signalements:   ${signalements.length}`);
    console.log(`Budgets:        ${budgets.length}`);
    console.log(`Période:        Jan 2022 → Jul 2025`);
    console.log(`Recette/jour:   ${RECETTE_JOUR} FCFA`);
    console.log(`Entreprise:     Mauralex`);
    console.log('========================================\n');

  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seedDemo();
