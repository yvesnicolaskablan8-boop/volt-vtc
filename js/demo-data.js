/**
 * DemoData - Generates realistic demo data for Volt VTC
 */
const DemoData = {
  generate() {
    const data = {
      chauffeurs: this._generateChauffeurs(),
      vehicules: this._generateVehicules(),
      courses: [],
      versements: [],
      gps: [],
      comptabilite: [],
      factures: [],
      budgets: [],
      planning: [],
      absences: [],
      users: this._generateUsers(),
      settings: this._generateSettings()
    };

    // Assign vehicles to drivers
    this._assignVehicles(data);

    // Generate courses, versements, GPS
    data.courses = this._generateCourses(data);
    data.versements = this._generateVersements(data);
    data.gps = this._generateGPS(data);
    data.comptabilite = this._generateComptabilite(data);
    data.factures = this._generateFactures(data);
    data.budgets = this._generateBudgets();
    data.planning = this._generatePlanning(data);
    data.absences = this._generateAbsences(data);

    localStorage.setItem('volt_data', JSON.stringify(data));
    return data;
  },

  _generateChauffeurs() {
    const chauffeurs = [
      { id: 'CHF-001', prenom: 'Amadou', nom: 'Diallo', telephone: '+225 07 12 34 56', email: 'amadou.diallo@volt-vtc.ci', dateNaissance: '1988-05-14', adresse: 'Cocody Riviera 3, Abidjan', numeroPermis: '12AB34567', dateDebutContrat: '2024-03-01', statut: 'actif', scoreConduite: 88, baseScore: 88, volatility: 5, weakness: 'freinage' },
      { id: 'CHF-002', prenom: 'Fatou', nom: 'Sow', telephone: '+225 05 23 45 67', email: 'fatou.sow@volt-vtc.ci', dateNaissance: '1992-08-22', adresse: 'Plateau, Rue du Commerce, Abidjan', numeroPermis: '23CD45678', dateDebutContrat: '2024-01-15', statut: 'actif', scoreConduite: 72, baseScore: 72, volatility: 10, weakness: 'vitesse' },
      { id: 'CHF-003', prenom: 'Mohamed', nom: 'Konaté', telephone: '+225 01 34 56 78', email: 'mohamed.konate@volt-vtc.ci', dateNaissance: '1985-12-03', adresse: 'Marcory Zone 4, Abidjan', numeroPermis: '34EF56789', dateDebutContrat: '2024-05-10', statut: 'actif', scoreConduite: 91, baseScore: 91, volatility: 4, weakness: 'virage' },
      { id: 'CHF-004', prenom: 'Seydou', nom: 'Traoré', telephone: '+225 07 45 67 89', email: 'seydou.traore@volt-vtc.ci', dateNaissance: '1990-03-17', adresse: 'Yopougon Toits Rouges, Abidjan', numeroPermis: '45GH67890', dateDebutContrat: '2024-02-20', statut: 'actif', scoreConduite: 65, baseScore: 65, volatility: 12, weakness: 'acceleration' },
      { id: 'CHF-005', prenom: 'Aïssatou', nom: 'Ba', telephone: '+225 05 56 78 90', email: 'aissatou.ba@volt-vtc.ci', dateNaissance: '1994-07-29', adresse: 'Treichville, Avenue 17, Abidjan', numeroPermis: '56IJ78901', dateDebutContrat: '2024-04-05', statut: 'actif', scoreConduite: 82, baseScore: 82, volatility: 6, weakness: 'regularite' },
      { id: 'CHF-006', prenom: 'Karim', nom: 'Ouédraogo', telephone: '+225 01 67 89 01', email: 'karim.ouedraogo@volt-vtc.ci', dateNaissance: '1987-11-08', adresse: 'Abobo Baoulé, Abidjan', numeroPermis: '67KL89012', dateDebutContrat: '2024-06-12', statut: 'suspendu', scoreConduite: 58, baseScore: 58, volatility: 15, weakness: 'vitesse' },
      { id: 'CHF-007', prenom: 'Mariama', nom: 'Condé', telephone: '+225 07 78 90 12', email: 'mariama.conde@volt-vtc.ci', dateNaissance: '1993-02-14', adresse: 'Cocody Angré, Abidjan', numeroPermis: '78MN90123', dateDebutContrat: '2024-07-01', statut: 'actif', scoreConduite: 85, baseScore: 85, volatility: 7, weakness: 'freinage' },
      { id: 'CHF-008', prenom: 'Kouadio', nom: 'N\'Guessan', telephone: '+225 05 89 01 23', email: 'kouadio.nguessan@volt-vtc.ci', dateNaissance: '1986-09-25', adresse: 'Bingerville, Route d\'Abidjan', numeroPermis: '89OP01234', dateDebutContrat: '2024-01-10', statut: 'inactif', scoreConduite: 75, baseScore: 75, volatility: 8, weakness: 'acceleration', dateFinContrat: '2025-01-31' }
    ];

    return chauffeurs.map(c => ({
      ...c,
      dateFinContrat: c.dateFinContrat || null,
      vehiculeAssigne: null,
      photo: null,
      documents: this._generateDocuments(c),
      noteInterne: '',
      dateCreation: c.dateDebutContrat + 'T10:00:00Z'
    }));
  },

  _generateDocuments(chauffeur) {
    const now = new Date();
    const isExpired = chauffeur.id === 'CHF-006'; // Karim has expired docs
    const expiryOffset = isExpired ? -60 : 365 * 3;

    return [
      {
        type: 'permis_conduire',
        nom: 'Permis de conduire',
        dateExpiration: this._addDays(now, isExpired ? -30 : 365 * 5).toISOString().split('T')[0],
        statut: isExpired ? 'expire' : 'valide'
      },
      {
        type: 'carte_vtc',
        nom: 'Carte professionnelle VTC',
        dateExpiration: this._addDays(now, expiryOffset).toISOString().split('T')[0],
        statut: isExpired ? 'expire' : (expiryOffset < 90 ? 'a_renouveler' : 'valide')
      },
      {
        type: 'carte_identite',
        nom: "Carte d'identité",
        dateExpiration: this._addDays(now, 365 * 8).toISOString().split('T')[0],
        statut: 'valide'
      },
      {
        type: 'attestation_assurance',
        nom: 'Attestation assurance RC Pro',
        dateExpiration: this._addDays(now, chauffeur.id === 'CHF-004' ? 45 : 300).toISOString().split('T')[0],
        statut: chauffeur.id === 'CHF-004' ? 'a_renouveler' : 'valide'
      }
    ];
  },

  _generateVehicules() {
    return [
      {
        id: 'VEH-001', marque: 'Toyota', modele: 'Corolla', annee: 2023, immatriculation: '1234 AB 01',
        vin: '5YJ3E1EA1PF000001', couleur: 'Noir', typeAcquisition: 'leasing',
        prixAchat: 18500000, mensualiteLeasing: 425000, dureeLeasing: 48, apportInitial: 3500000,
        datePremiereMensualite: '2023-01-15', kilometrage: 52300, kilometrageMensuel: 3200,
        dateDerniereRevision: '2025-01-15', prochainRevisionKm: 60000,
        assureur: 'NSIA Assurances', numeroPolice: 'POL-2023-4567', primeAnnuelle: 850000,
        dateExpirationAssurance: '2025-12-31',
        coutsMaintenance: [
          { id: 'MNT-001', date: '2024-06-15', type: 'revision', description: 'Révision 40000 km', montant: 175000, kilometrage: 40000 },
          { id: 'MNT-002', date: '2024-11-20', type: 'pneus', description: 'Changement 4 pneus', montant: 320000, kilometrage: 48000 },
          { id: 'MNT-003', date: '2025-01-15', type: 'revision', description: 'Révision 50000 km', montant: 195000, kilometrage: 50000 }
        ],
        statut: 'en_service', chauffeurAssigne: null, dateCreation: '2023-01-10T10:00:00Z',
        typeEnergie: 'thermique', consommation: 6.5, coutEnergie: 800
      },
      {
        id: 'VEH-002', marque: 'Mercedes', modele: 'Classe E', annee: 2022, immatriculation: '5678 CD 01',
        vin: 'WDD2130481A000002', couleur: 'Gris Argent', typeAcquisition: 'leasing',
        prixAchat: 35000000, mensualiteLeasing: 650000, dureeLeasing: 48, apportInitial: 5500000,
        datePremiereMensualite: '2022-06-01', kilometrage: 78500, kilometrageMensuel: 3500,
        dateDerniereRevision: '2025-02-01', prochainRevisionKm: 80000,
        assureur: 'Allianz CI', numeroPolice: 'POL-2022-8901', primeAnnuelle: 1200000,
        dateExpirationAssurance: '2025-09-30',
        coutsMaintenance: [
          { id: 'MNT-004', date: '2024-04-10', type: 'revision', description: 'Révision 60000 km', montant: 350000, kilometrage: 60000 },
          { id: 'MNT-005', date: '2024-08-22', type: 'freins', description: 'Plaquettes + disques avant', montant: 450000, kilometrage: 68000 },
          { id: 'MNT-006', date: '2024-12-15', type: 'pneus', description: 'Changement 4 pneus', montant: 480000, kilometrage: 75000 },
          { id: 'MNT-007', date: '2025-02-01', type: 'revision', description: 'Révision 78000 km', montant: 380000, kilometrage: 78000 }
        ],
        statut: 'en_service', chauffeurAssigne: null, dateCreation: '2022-05-20T10:00:00Z',
        typeEnergie: 'thermique', consommation: 7.2, coutEnergie: 800
      },
      {
        id: 'VEH-003', marque: 'Toyota', modele: 'Camry', annee: 2023, immatriculation: '9012 EF 01',
        vin: 'WBAJA5C50KB000003', couleur: 'Bleu Nuit', typeAcquisition: 'cash',
        prixAchat: 22000000, mensualiteLeasing: 0, dureeLeasing: 0, apportInitial: 22000000,
        datePremiereMensualite: null, kilometrage: 41200, kilometrageMensuel: 2800,
        dateDerniereRevision: '2024-12-10', prochainRevisionKm: 50000,
        assureur: 'SUNU Assurances', numeroPolice: 'POL-2023-2345', primeAnnuelle: 950000,
        dateExpirationAssurance: '2025-11-30',
        coutsMaintenance: [
          { id: 'MNT-008', date: '2024-07-20', type: 'revision', description: 'Révision 30000 km', montant: 165000, kilometrage: 30000 },
          { id: 'MNT-009', date: '2024-12-10', type: 'revision', description: 'Révision 40000 km', montant: 185000, kilometrage: 40000 }
        ],
        statut: 'en_service', chauffeurAssigne: null, dateCreation: '2023-03-15T10:00:00Z',
        typeEnergie: 'thermique', consommation: 6.8, coutEnergie: 800
      },
      {
        id: 'VEH-004', marque: 'Hyundai', modele: 'Tucson', annee: 2021, immatriculation: '3456 GH 01',
        vin: '4T1BZ1HK1MU000004', couleur: 'Blanc Nacré', typeAcquisition: 'cash',
        prixAchat: 16000000, mensualiteLeasing: 0, dureeLeasing: 0, apportInitial: 16000000,
        datePremiereMensualite: null, kilometrage: 95600, kilometrageMensuel: 2600,
        dateDerniereRevision: '2025-01-20', prochainRevisionKm: 100000,
        assureur: 'Saham Assurance', numeroPolice: 'POL-2021-6789', primeAnnuelle: 750000,
        dateExpirationAssurance: '2025-08-31',
        coutsMaintenance: [
          { id: 'MNT-010', date: '2024-03-15', type: 'revision', description: 'Révision 80000 km', montant: 145000, kilometrage: 80000 },
          { id: 'MNT-011', date: '2024-07-10', type: 'pneus', description: 'Changement 4 pneus', montant: 280000, kilometrage: 85000 },
          { id: 'MNT-012', date: '2024-10-05', type: 'freins', description: 'Plaquettes arrière', montant: 120000, kilometrage: 90000 },
          { id: 'MNT-013', date: '2025-01-20', type: 'revision', description: 'Révision 95000 km', montant: 165000, kilometrage: 95000 }
        ],
        statut: 'en_service', chauffeurAssigne: null, dateCreation: '2021-09-01T10:00:00Z',
        typeEnergie: 'thermique', consommation: 7.5, coutEnergie: 800
      },
      {
        id: 'VEH-005', marque: 'Peugeot', modele: '508', annee: 2023, immatriculation: '7890 IJ 01',
        vin: 'VF3LCYHZPLS000005', couleur: 'Gris Platinium', typeAcquisition: 'leasing',
        prixAchat: 20000000, mensualiteLeasing: 380000, dureeLeasing: 48, apportInitial: 3000000,
        datePremiereMensualite: '2023-04-01', kilometrage: 38900, kilometrageMensuel: 2900,
        dateDerniereRevision: '2024-11-30', prochainRevisionKm: 40000,
        assureur: 'AXA Assurances CI', numeroPolice: 'POL-2023-0123', primeAnnuelle: 820000,
        dateExpirationAssurance: '2025-10-31',
        coutsMaintenance: [
          { id: 'MNT-014', date: '2024-05-20', type: 'revision', description: 'Révision 25000 km', montant: 155000, kilometrage: 25000 },
          { id: 'MNT-015', date: '2024-11-30', type: 'revision', description: 'Révision 35000 km + filtres', montant: 210000, kilometrage: 35000 }
        ],
        statut: 'en_service', chauffeurAssigne: null, dateCreation: '2023-03-25T10:00:00Z',
        typeEnergie: 'thermique', consommation: 5.8, coutEnergie: 800
      },
      {
        id: 'VEH-006', marque: 'Kia', modele: 'Sportage', annee: 2022, immatriculation: '2345 KL 01',
        vin: 'WVWZZZ3CZPE000006', couleur: 'Noir Intense', typeAcquisition: 'cash',
        prixAchat: 17500000, mensualiteLeasing: 0, dureeLeasing: 0, apportInitial: 17500000,
        datePremiereMensualite: null, kilometrage: 62100, kilometrageMensuel: 2400,
        dateDerniereRevision: '2024-10-15', prochainRevisionKm: 70000,
        assureur: 'Allianz CI', numeroPolice: 'POL-2022-4567', primeAnnuelle: 780000,
        dateExpirationAssurance: '2025-07-31',
        coutsMaintenance: [
          { id: 'MNT-016', date: '2024-04-01', type: 'revision', description: 'Révision 50000 km', montant: 175000, kilometrage: 50000 },
          { id: 'MNT-017', date: '2024-10-15', type: 'revision', description: 'Révision 60000 km', montant: 190000, kilometrage: 60000 },
          { id: 'MNT-018', date: '2024-08-10', type: 'carrosserie', description: 'Réparation pare-chocs arrière', montant: 350000, kilometrage: 56000 }
        ],
        statut: 'en_maintenance', chauffeurAssigne: null, dateCreation: '2022-08-10T10:00:00Z',
        typeEnergie: 'thermique', consommation: 7.0, coutEnergie: 800
      },
      // ====== VÉHICULES ÉLECTRIQUES ======
      {
        id: 'VEH-007', marque: 'Tesla', modele: 'Model 3', annee: 2024, immatriculation: '4567 MN 01',
        vin: '5YJ3E1EA7RF000007', couleur: 'Blanc Nacré', typeAcquisition: 'leasing',
        prixAchat: 28000000, mensualiteLeasing: 520000, dureeLeasing: 48, apportInitial: 4500000,
        datePremiereMensualite: '2024-03-01', kilometrage: 32500, kilometrageMensuel: 3100,
        dateDerniereRevision: '2025-01-10', prochainRevisionKm: 40000,
        assureur: 'NSIA Assurances', numeroPolice: 'POL-2024-1234', primeAnnuelle: 920000,
        dateExpirationAssurance: '2026-02-28',
        coutsMaintenance: [
          { id: 'MNT-019', date: '2024-09-15', type: 'revision', description: 'Contrôle 20000 km (freins, pneus, multi-point)', montant: 95000, kilometrage: 20000 },
          { id: 'MNT-020', date: '2025-01-10', type: 'pneus', description: 'Rotation pneus + contrôle suspension', montant: 85000, kilometrage: 30000 }
        ],
        statut: 'en_service', chauffeurAssigne: null, dateCreation: '2024-02-20T10:00:00Z',
        typeEnergie: 'electrique',
        consommation: 14.5, // kWh/100km
        coutEnergie: 120, // FCFA/kWh
        capaciteBatterie: 60, // kWh
        autonomieKm: 415, // km WLTP
        niveauBatterie: 82, // % actuel
        typeChargeur: 'CCS Combo 2',
        puissanceChargeMax: 170, // kW
        tempsRechargeRapide: 25, // minutes (10-80%)
        tempsRechargeNormale: 480, // minutes (0-100% sur 7kW)
        dernierRecharge: '2025-02-19',
        stationRechargeHabituelle: 'Station CIE Cocody, Abidjan'
      },
      {
        id: 'VEH-008', marque: 'BYD', modele: 'Atto 3', annee: 2024, immatriculation: '6789 OP 01',
        vin: 'LGXCE4CB1R0000008', couleur: 'Bleu Surf', typeAcquisition: 'leasing',
        prixAchat: 22000000, mensualiteLeasing: 420000, dureeLeasing: 48, apportInitial: 3500000,
        datePremiereMensualite: '2024-05-01', kilometrage: 25800, kilometrageMensuel: 2700,
        dateDerniereRevision: '2024-12-20', prochainRevisionKm: 30000,
        assureur: 'Allianz CI', numeroPolice: 'POL-2024-5678', primeAnnuelle: 850000,
        dateExpirationAssurance: '2025-12-31',
        coutsMaintenance: [
          { id: 'MNT-021', date: '2024-12-20', type: 'revision', description: 'Contrôle 20000 km (freins, suspension, fluides)', montant: 80000, kilometrage: 20000 }
        ],
        statut: 'en_service', chauffeurAssigne: null, dateCreation: '2024-04-15T10:00:00Z',
        typeEnergie: 'electrique',
        consommation: 16.2, // kWh/100km
        coutEnergie: 120, // FCFA/kWh
        capaciteBatterie: 60.5, // kWh
        autonomieKm: 375, // km WLTP
        niveauBatterie: 68, // % actuel
        typeChargeur: 'CCS Combo 2',
        puissanceChargeMax: 88, // kW
        tempsRechargeRapide: 35, // minutes (10-80%)
        tempsRechargeNormale: 540, // minutes (0-100% sur 7kW)
        dernierRecharge: '2025-02-18',
        stationRechargeHabituelle: 'Station CIE Plateau, Abidjan'
      },
      {
        id: 'VEH-009', marque: 'MG', modele: 'MG4', annee: 2024, immatriculation: '8901 QR 01',
        vin: 'LSJW46E09R0000009', couleur: 'Gris Hologramme', typeAcquisition: 'cash',
        prixAchat: 18500000, mensualiteLeasing: 0, dureeLeasing: 0, apportInitial: 18500000,
        datePremiereMensualite: null, kilometrage: 18200, kilometrageMensuel: 2500,
        dateDerniereRevision: '2025-01-25', prochainRevisionKm: 20000,
        assureur: 'SUNU Assurances', numeroPolice: 'POL-2024-9012', primeAnnuelle: 790000,
        dateExpirationAssurance: '2026-01-31',
        coutsMaintenance: [
          { id: 'MNT-022', date: '2025-01-25', type: 'revision', description: 'Contrôle 15000 km (freins, pneus, climatisation)', montant: 75000, kilometrage: 15000 }
        ],
        statut: 'en_service', chauffeurAssigne: null, dateCreation: '2024-06-10T10:00:00Z',
        typeEnergie: 'electrique',
        consommation: 15.8, // kWh/100km
        coutEnergie: 120, // FCFA/kWh
        capaciteBatterie: 51, // kWh
        autonomieKm: 320, // km WLTP
        niveauBatterie: 91, // % actuel
        typeChargeur: 'CCS Combo 2',
        puissanceChargeMax: 117, // kW
        tempsRechargeRapide: 30, // minutes (10-80%)
        tempsRechargeNormale: 450, // minutes (0-100% sur 7kW)
        dernierRecharge: '2025-02-20',
        stationRechargeHabituelle: 'Station CIE Marcory, Abidjan'
      }
    ];
  },

  _assignVehicles(data) {
    const assignments = [
      ['CHF-001', 'VEH-001'],
      ['CHF-002', 'VEH-002'],
      ['CHF-003', 'VEH-003'],
      ['CHF-004', 'VEH-004'],
      ['CHF-005', 'VEH-007'], // Aïssatou conduit la Tesla Model 3
      ['CHF-007', 'VEH-008'], // Mariama conduit le BYD Atto 3
    ];

    assignments.forEach(([cid, vid]) => {
      const c = data.chauffeurs.find(x => x.id === cid);
      const v = data.vehicules.find(x => x.id === vid);
      if (c && v) {
        c.vehiculeAssigne = vid;
        v.chauffeurAssigne = cid;
      }
    });
  },

  _generateCourses(data) {
    const courses = [];
    const activeChauffeurs = data.chauffeurs.filter(c => c.statut === 'actif' || c.statut === 'suspendu');
    const now = new Date();
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 9);

    const departs = [
      'Plateau, Abidjan', 'Cocody Riviera 2, Abidjan', 'Marcory Zone 4, Abidjan',
      'Treichville, Abidjan', 'Adjamé, Abidjan', 'Cocody Angré, Abidjan',
      'Yopougon Maroc, Abidjan', 'Koumassi, Abidjan', 'II Plateaux, Abidjan',
      'Riviera Palmeraie, Abidjan', 'Bingerville Centre', 'Port-Bouët, Abidjan',
      'Cocody Danga, Abidjan', 'Marcory Résidentiel', 'Deux Plateaux Vallon'
    ];

    const arrivees = {
      aeroport: ['Aéroport FHB Terminal 1', 'Aéroport FHB Terminal 2', 'Aéroport FHB Arrivées', 'Aéroport FHB Départs'],
      gare: ['Gare de Treichville', 'Gare Routière Adjamé', 'Gare UTB Plateau', 'Gare STIF Yopougon', 'Gare Routière de Koumassi'],
      urbain: ['Hôtel Ivoire, Cocody', 'Sofitel Abidjan', 'Centre Commercial Cap Sud', 'Stade FHB, Plateau', 'Palais de la Culture'],
      banlieue: ['Grand-Bassam', 'Bingerville', 'Anyama', 'Songon', 'Dabou'],
      longue_distance: ['Yamoussoukro', 'Bouaké', 'San Pedro', 'Korhogo', 'Daloa']
    };

    const plateformes = ['yango', 'bolt', 'app_directe', 'telephone'];
    const prixBase = { aeroport: 15000, gare: 5000, urbain: 3500, banlieue: 8000, longue_distance: 45000 };
    const distBase = { aeroport: 25, gare: 8, urbain: 5, banlieue: 20, longue_distance: 150 };
    const dureeBase = { aeroport: 40, gare: 25, urbain: 20, banlieue: 35, longue_distance: 180 };

    let courseId = 1;
    const current = new Date(startDate);

    while (current <= now) {
      const dayOfWeek = current.getDay();

      activeChauffeurs.forEach(chauffeur => {
        if (chauffeur.statut === 'suspendu' && current > this._addDays(now, -60)) return;
        if (chauffeur.statut === 'inactif' && current > new Date(chauffeur.dateFinContrat)) return;

        // Courses per day: 5-10 weekday, 6-12 weekend
        const numCourses = dayOfWeek === 0 || dayOfWeek === 6
          ? Utils.random(6, 12)
          : Utils.random(5, 10);

        for (let i = 0; i < numCourses; i++) {
          const types = ['urbain', 'urbain', 'urbain', 'gare', 'aeroport', 'banlieue', 'longue_distance'];
          const typeTrajet = types[Utils.random(0, types.length - 1)];

          const prix = prixBase[typeTrajet] * Utils.randomFloat(0.7, 1.5);
          const montantTTC = Math.round(prix * 100) / 100;
          const montantHT = Math.round(montantTTC / 1.1 * 100) / 100;

          const hour = Utils.random(6, 23);
          const minute = Utils.random(0, 59);
          const courseDate = new Date(current);
          courseDate.setHours(hour, minute, 0, 0);

          courses.push({
            id: `CRS-${String(courseId++).padStart(4, '0')}`,
            chauffeurId: chauffeur.id,
            vehiculeId: chauffeur.vehiculeAssigne || 'VEH-004',
            dateHeure: courseDate.toISOString(),
            depart: departs[Utils.random(0, departs.length - 1)],
            arrivee: arrivees[typeTrajet][Utils.random(0, arrivees[typeTrajet].length - 1)],
            distanceKm: Math.round(distBase[typeTrajet] * Utils.randomFloat(0.7, 1.4) * 10) / 10,
            dureeMn: Math.round(dureeBase[typeTrajet] * Utils.randomFloat(0.8, 1.5)),
            montantTTC,
            montantHT,
            tva: Math.round((montantTTC - montantHT) * 100) / 100,
            typeTrajet,
            plateforme: plateformes[Utils.random(0, plateformes.length - 1)],
            statut: Utils.random(1, 100) <= 95 ? 'terminee' : 'annulee',
            noteClient: Utils.randomFloat(3.5, 5.0, 1)
          });
        }
      });

      current.setDate(current.getDate() + 1);
    }

    return courses;
  },

  _generateVersements(data) {
    const versements = [];
    const activeChauffeurs = data.chauffeurs.filter(c => c.statut !== 'inactif' || c.dateFinContrat);
    const now = new Date();
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 9);

    let vrsId = 1;

    activeChauffeurs.forEach(chauffeur => {
      const current = new Date(startDate);
      // Advance to next Monday
      current.setDate(current.getDate() + (8 - current.getDay()) % 7);

      while (current <= now) {
        const weekEnd = new Date(current);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekNum = Utils.getWeekNumber(current);
        const year = current.getFullYear();

        // Find courses for this week
        const weekCourses = data.courses.filter(c =>
          c.chauffeurId === chauffeur.id &&
          c.statut === 'terminee' &&
          new Date(c.dateHeure) >= current &&
          new Date(c.dateHeure) <= weekEnd
        );

        if (weekCourses.length > 0) {
          const montantBrut = weekCourses.reduce((sum, c) => sum + c.montantTTC, 0);
          const commission = Math.round(montantBrut * 0.20 * 100) / 100;
          const montantNet = Math.round((montantBrut - commission) * 100) / 100;

          // Determine status
          let statut = 'valide';
          let montantVerse = Math.round(commission * 100) / 100;
          const rand = Utils.random(1, 100);

          if (chauffeur.id === 'CHF-004' && rand <= 20) {
            statut = 'retard';
            montantVerse = 0;
          } else if (chauffeur.id === 'CHF-006' && rand <= 30) {
            statut = 'partiel';
            montantVerse = Math.round(commission * Utils.randomFloat(0.4, 0.8) * 100) / 100;
          } else if (rand <= 5) {
            statut = 'en_attente';
            montantVerse = 0;
          }

          // Recent versements more likely to be en_attente
          if (current > this._addDays(now, -14) && statut === 'valide' && Utils.random(1, 4) === 1) {
            statut = 'en_attente';
            montantVerse = 0;
          }

          const versementDate = new Date(weekEnd);
          versementDate.setDate(versementDate.getDate() + 1);

          versements.push({
            id: `VRS-${String(vrsId++).padStart(4, '0')}`,
            chauffeurId: chauffeur.id,
            vehiculeId: chauffeur.vehiculeAssigne || 'VEH-004',
            date: versementDate.toISOString().split('T')[0],
            periode: `${year}-S${String(weekNum).padStart(2, '0')}`,
            montantBrut: Math.round(montantBrut * 100) / 100,
            commission,
            montantNet,
            montantVerse,
            statut,
            dateValidation: statut === 'valide' ? this._addDays(versementDate, Utils.random(0, 2)).toISOString() : null,
            commentaire: statut === 'retard' ? 'Relance effectuée' : (statut === 'partiel' ? 'Versement incomplet - solde à récupérer' : ''),
            nombreCourses: weekCourses.length,
            dateCreation: versementDate.toISOString()
          });
        }

        current.setDate(current.getDate() + 7);
      }
    });

    return versements;
  },

  _generateGPS(data) {
    const gps = [];
    const activeChauffeurs = data.chauffeurs.filter(c => c.statut === 'actif');
    const now = new Date();

    activeChauffeurs.forEach(chauffeur => {
      for (let d = 0; d < 30; d++) {
        const date = this._addDays(now, -d);
        const dayStr = date.toISOString().split('T')[0];

        const base = chauffeur.baseScore || 80;
        const vol = chauffeur.volatility || 5;
        const weak = chauffeur.weakness || 'freinage';

        const scores = {
          vitesse: Utils.clamp(base + Utils.random(-vol, vol) + (weak === 'vitesse' ? Utils.random(-15, -8) : 0), 0, 100),
          freinage: Utils.clamp(base + Utils.random(-vol, vol) + (weak === 'freinage' ? Utils.random(-15, -8) : 0), 0, 100),
          acceleration: Utils.clamp(base + Utils.random(-vol, vol) + (weak === 'acceleration' ? Utils.random(-15, -8) : 0), 0, 100),
          virage: Utils.clamp(base + Utils.random(-vol, vol) + (weak === 'virage' ? Utils.random(-15, -8) : 0), 0, 100),
          regularite: Utils.clamp(base + Utils.random(-vol, vol) + (weak === 'regularite' ? Utils.random(-15, -8) : 0), 0, 100)
        };

        const scoreGlobal = Math.round(
          (scores.vitesse + scores.freinage + scores.acceleration + scores.virage + scores.regularite) / 5
        );

        const freinagesBrusques = scores.freinage < 70 ? Utils.random(3, 8) : Utils.random(0, 3);
        const accelerationsBrusques = scores.acceleration < 70 ? Utils.random(2, 6) : Utils.random(0, 2);
        const excesVitesse = scores.vitesse < 70 ? Utils.random(1, 5) : Utils.random(0, 1);

        gps.push({
          id: `GPS-${chauffeur.id}-${dayStr}`,
          chauffeurId: chauffeur.id,
          vehiculeId: chauffeur.vehiculeAssigne || 'VEH-004',
          date: dayStr,
          scoreGlobal,
          scoreVitesse: scores.vitesse,
          scoreFreinage: scores.freinage,
          scoreAcceleration: scores.acceleration,
          scoreVirage: scores.virage,
          scoreRegularite: scores.regularite,
          evenements: {
            freinagesBrusques,
            accelerationsBrusques,
            excesVitesse,
            viragesAgressifs: scores.virage < 70 ? Utils.random(1, 4) : Utils.random(0, 1),
            tempsConduite: Utils.randomFloat(5, 10, 1),
            distanceParcourue: Utils.random(120, 280),
            vitesseMoyenne: Utils.randomFloat(18, 35, 1),
            vitesseMax: Utils.random(80, 130)
          },
          analyseIA: this._generateAnalyseIA(chauffeur, scoreGlobal, scores, { freinagesBrusques, accelerationsBrusques, excesVitesse })
        });
      }
    });

    return gps;
  },

  _generateAnalyseIA(chauffeur, scoreGlobal, scores, events) {
    const nom = `${chauffeur.prenom} ${chauffeur.nom}`;

    // Find weakest score
    const scoreEntries = Object.entries(scores);
    scoreEntries.sort((a, b) => a[1] - b[1]);
    const faiblesse = scoreEntries[0][0];

    const faiblLabel = {
      vitesse: 'la gestion de la vitesse',
      freinage: 'le freinage',
      acceleration: "l'accélération",
      virage: 'la prise de virages',
      regularite: 'la régularité de conduite'
    };

    let resume, tendance, comparaison;
    const recommandations = [];

    if (scoreGlobal >= 85) {
      resume = `Conduite exemplaire. ${nom} fait partie des meilleurs chauffeurs de la flotte avec un comportement routier très sûr.`;
      tendance = 'stable';
      comparaison = 'au_dessus';
      recommandations.push('Maintenir ce niveau de conduite exemplaire');
      if (scores[faiblesse] < 85) recommandations.push(`Légère marge de progression sur ${faiblLabel[faiblesse]}`);
    } else if (scoreGlobal >= 70) {
      resume = `Conduite globalement prudente avec quelques axes d'amélioration, notamment sur ${faiblLabel[faiblesse]}.`;
      tendance = Utils.random(0, 1) ? 'amelioration' : 'stable';
      comparaison = 'dans_la_moyenne';
      recommandations.push(`Travailler sur ${faiblLabel[faiblesse]} pour améliorer le score global`);
      if (events.freinagesBrusques > 3) recommandations.push('Anticiper les ralentissements pour réduire les freinages brusques');
      if (events.excesVitesse > 1) recommandations.push('Respecter les limitations de vitesse en zone urbaine');
      recommandations.push('Maintenir une distance de sécurité suffisante');
    } else if (scoreGlobal >= 55) {
      resume = `Conduite nécessitant une attention particulière. Plusieurs incidents relevés concernant ${faiblLabel[faiblesse]}.`;
      tendance = 'degradation';
      comparaison = 'en_dessous';
      recommandations.push(`Formation recommandée sur ${faiblLabel[faiblesse]}`);
      recommandations.push('Réduire les accélérations brusques en sortie de virage');
      recommandations.push('Un entretien avec le responsable est conseillé');
      if (events.excesVitesse > 2) recommandations.push('Attention : excès de vitesse fréquents détectés');
    } else {
      resume = `Comportement routier préoccupant. ${nom} présente des scores en dessous des normes de sécurité sur ${faiblLabel[faiblesse]}.`;
      tendance = 'degradation';
      comparaison = 'en_dessous';
      recommandations.push('Formation de remise à niveau obligatoire recommandée');
      recommandations.push(`Améliorer en priorité ${faiblLabel[faiblesse]}`);
      recommandations.push('Mise en place d\'un suivi hebdomadaire recommandé');
      recommandations.push('Envisager une suspension temporaire si pas d\'amélioration');
    }

    return { resume, recommandations, tendance, comparaisonFlotte: comparaison };
  },

  _generateComptabilite(data) {
    const ops = [];
    const now = new Date();
    let opId = 1;

    // Categories de recettes et depenses
    const catRecettes = ['commissions_courses', 'courses_directes', 'location_vehicule', 'frais_service', 'autres_recettes'];
    const catDepenses = ['carburant', 'assurance', 'maintenance', 'leasing', 'salaires', 'loyer_bureau', 'fournitures', 'telecoms', 'marketing', 'taxes_impots', 'autres_depenses'];
    const modesPaiement = ['especes', 'virement', 'mobile_money', 'cheque'];

    // Generate 9 months of accounting operations
    for (let m = 8; m >= 0; m--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // === RECETTES ===

      // Commissions from versements (4 per month, one per week roughly)
      for (let w = 0; w < 4; w++) {
        const day = Math.min(7 * w + Utils.random(1, 6), daysInMonth);
        const montant = Utils.random(800000, 1800000);
        ops.push({
          id: `CPT-${String(opId++).padStart(4, '0')}`,
          type: 'recette',
          categorie: 'commissions_courses',
          description: `Commissions chauffeurs - Semaine ${w + 1}`,
          montant,
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          modePaiement: Utils.random(0, 1) ? 'virement' : 'mobile_money',
          reference: `COM-${year}${String(month + 1).padStart(2, '0')}-S${w + 1}`,
          notes: '',
          dateCreation: new Date(year, month, day).toISOString()
        });
      }

      // Courses directes (app et telephone) - 2-3 per month
      for (let i = 0; i < Utils.random(2, 3); i++) {
        const day = Utils.random(1, daysInMonth);
        ops.push({
          id: `CPT-${String(opId++).padStart(4, '0')}`,
          type: 'recette',
          categorie: 'courses_directes',
          description: `Courses directes (app & téléphone)`,
          montant: Utils.random(250000, 650000),
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          modePaiement: modesPaiement[Utils.random(0, 3)],
          reference: `DIR-${year}${String(month + 1).padStart(2, '0')}-${i + 1}`,
          notes: '',
          dateCreation: new Date(year, month, day).toISOString()
        });
      }

      // Frais de service plateforme - 1 per month
      ops.push({
        id: `CPT-${String(opId++).padStart(4, '0')}`,
        type: 'recette',
        categorie: 'frais_service',
        description: 'Frais de service plateforme Yango/Bolt',
        montant: Utils.random(150000, 350000),
        date: `${year}-${String(month + 1).padStart(2, '0')}-${String(Utils.random(20, 28)).padStart(2, '0')}`,
        modePaiement: 'virement',
        reference: `SRV-${year}${String(month + 1).padStart(2, '0')}`,
        notes: '',
        dateCreation: new Date(year, month, 25).toISOString()
      });

      // Location vehicule occasionnelle (every other month)
      if (m % 2 === 0) {
        ops.push({
          id: `CPT-${String(opId++).padStart(4, '0')}`,
          type: 'recette',
          categorie: 'location_vehicule',
          description: 'Location véhicule journalière (VEH-006 en maintenance)',
          montant: Utils.random(75000, 180000),
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(Utils.random(10, 20)).padStart(2, '0')}`,
          modePaiement: 'especes',
          reference: `LOC-${year}${String(month + 1).padStart(2, '0')}`,
          notes: 'Location temporaire pendant maintenance',
          dateCreation: new Date(year, month, 15).toISOString()
        });
      }

      // === DEPENSES ===

      // Carburant thermique (4 per month)
      for (let w = 0; w < 4; w++) {
        const day = Math.min(7 * w + Utils.random(1, 5), daysInMonth);
        ops.push({
          id: `CPT-${String(opId++).padStart(4, '0')}`,
          type: 'depense',
          categorie: 'carburant',
          description: `Carburant flotte thermique - Semaine ${w + 1}`,
          montant: Utils.random(250000, 550000),
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          modePaiement: 'especes',
          reference: `CARB-${year}${String(month + 1).padStart(2, '0')}-S${w + 1}`,
          notes: '6 véhicules thermiques',
          dateCreation: new Date(year, month, day).toISOString()
        });
      }

      // Recharge électrique (2 per month - 3 véhicules EV)
      for (let w = 0; w < 2; w++) {
        const day = Math.min(14 * w + Utils.random(1, 10), daysInMonth);
        ops.push({
          id: `CPT-${String(opId++).padStart(4, '0')}`,
          type: 'depense',
          categorie: 'recharge_electrique',
          description: `Recharge flotte électrique - Quinzaine ${w + 1}`,
          montant: Utils.random(85000, 180000),
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          modePaiement: 'mobile_money',
          reference: `RECH-${year}${String(month + 1).padStart(2, '0')}-Q${w + 1}`,
          notes: '3 véhicules électriques (Tesla, BYD, MG)',
          dateCreation: new Date(year, month, day).toISOString()
        });
      }

      // Assurance (once per month)
      ops.push({
        id: `CPT-${String(opId++).padStart(4, '0')}`,
        type: 'depense',
        categorie: 'assurance',
        description: 'Primes assurance véhicules (mensuel)',
        montant: Utils.random(380000, 450000),
        date: `${year}-${String(month + 1).padStart(2, '0')}-05`,
        modePaiement: 'virement',
        reference: `ASS-${year}${String(month + 1).padStart(2, '0')}`,
        notes: 'Assurance tous risques flotte',
        dateCreation: new Date(year, month, 5).toISOString()
      });

      // Leasing (once per month - 5 vehicles on leasing: 3 thermiques + 2 EV)
      ops.push({
        id: `CPT-${String(opId++).padStart(4, '0')}`,
        type: 'depense',
        categorie: 'leasing',
        description: 'Mensualités leasing (VEH-001, VEH-002, VEH-005, VEH-007, VEH-008)',
        montant: 425000 + 650000 + 380000 + 520000 + 420000, // Sum of all leasing payments
        date: `${year}-${String(month + 1).padStart(2, '0')}-10`,
        modePaiement: 'virement',
        reference: `LEAS-${year}${String(month + 1).padStart(2, '0')}`,
        notes: 'Toyota Corolla + Mercedes Classe E + Peugeot 508 + Tesla Model 3 + BYD Atto 3',
        dateCreation: new Date(year, month, 10).toISOString()
      });

      // Maintenance (0-2 per month, random)
      const numMaint = Utils.random(0, 2);
      for (let i = 0; i < numMaint; i++) {
        const day = Utils.random(1, daysInMonth);
        const descMaint = ['Vidange et filtres', 'Changement pneus', 'Plaquettes de frein', 'Révision générale', 'Réparation climatisation', 'Changement batterie'][Utils.random(0, 5)];
        ops.push({
          id: `CPT-${String(opId++).padStart(4, '0')}`,
          type: 'depense',
          categorie: 'maintenance',
          description: descMaint,
          montant: Utils.random(75000, 480000),
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          modePaiement: Utils.random(0, 1) ? 'especes' : 'virement',
          reference: `MNT-${year}${String(month + 1).padStart(2, '0')}-${i + 1}`,
          notes: '',
          dateCreation: new Date(year, month, day).toISOString()
        });
      }

      // Salaires (once per month)
      ops.push({
        id: `CPT-${String(opId++).padStart(4, '0')}`,
        type: 'depense',
        categorie: 'salaires',
        description: 'Salaires personnel administratif',
        montant: Utils.random(450000, 550000),
        date: `${year}-${String(month + 1).padStart(2, '0')}-28`,
        modePaiement: 'virement',
        reference: `SAL-${year}${String(month + 1).padStart(2, '0')}`,
        notes: 'Gestionnaire + assistant',
        dateCreation: new Date(year, month, 28).toISOString()
      });

      // Loyer bureau (once per month)
      ops.push({
        id: `CPT-${String(opId++).padStart(4, '0')}`,
        type: 'depense',
        categorie: 'loyer_bureau',
        description: 'Loyer bureau Plateau',
        montant: 250000,
        date: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        modePaiement: 'virement',
        reference: `LOY-${year}${String(month + 1).padStart(2, '0')}`,
        notes: '',
        dateCreation: new Date(year, month, 1).toISOString()
      });

      // Telecoms (once per month)
      ops.push({
        id: `CPT-${String(opId++).padStart(4, '0')}`,
        type: 'depense',
        categorie: 'telecoms',
        description: 'Forfaits téléphones + internet bureau',
        montant: Utils.random(85000, 120000),
        date: `${year}-${String(month + 1).padStart(2, '0')}-15`,
        modePaiement: 'mobile_money',
        reference: `TEL-${year}${String(month + 1).padStart(2, '0')}`,
        notes: '',
        dateCreation: new Date(year, month, 15).toISOString()
      });

      // Fournitures (every other month)
      if (m % 2 === 1) {
        ops.push({
          id: `CPT-${String(opId++).padStart(4, '0')}`,
          type: 'depense',
          categorie: 'fournitures',
          description: 'Fournitures bureau + nettoyage véhicules',
          montant: Utils.random(35000, 85000),
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(Utils.random(10, 20)).padStart(2, '0')}`,
          modePaiement: 'especes',
          reference: `FRN-${year}${String(month + 1).padStart(2, '0')}`,
          notes: '',
          dateCreation: new Date(year, month, 15).toISOString()
        });
      }

      // Marketing (every 3 months)
      if (m % 3 === 0) {
        ops.push({
          id: `CPT-${String(opId++).padStart(4, '0')}`,
          type: 'depense',
          categorie: 'marketing',
          description: 'Publicité réseaux sociaux + flyers',
          montant: Utils.random(100000, 250000),
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(Utils.random(5, 15)).padStart(2, '0')}`,
          modePaiement: 'mobile_money',
          reference: `MKT-${year}${String(month + 1).padStart(2, '0')}`,
          notes: 'Campagne Facebook + Instagram',
          dateCreation: new Date(year, month, 10).toISOString()
        });
      }

      // Taxes et impôts (every quarter)
      if (m % 3 === 0) {
        ops.push({
          id: `CPT-${String(opId++).padStart(4, '0')}`,
          type: 'depense',
          categorie: 'taxes_impots',
          description: 'Taxes trimestrielles + patente',
          montant: Utils.random(200000, 400000),
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(Utils.random(15, 25)).padStart(2, '0')}`,
          modePaiement: 'virement',
          reference: `TAX-${year}Q${Math.floor(month / 3) + 1}`,
          notes: '',
          dateCreation: new Date(year, month, 20).toISOString()
        });
      }
    }

    return ops;
  },

  _generateFactures(data) {
    const factures = [];
    const now = new Date();
    let facId = 1;

    const clientsNoms = [
      'Entreprise SODECI', 'Société Générale CI', 'Orange CI', 'MTN CI',
      'Hôtel Ivoire', 'Sofitel Abidjan', 'Total Energies CI', 'Bolloré Transport'
    ];
    const fournisseursNoms = [
      'Station Total Cocody', 'Garage Auto Plus', 'NSIA Assurances',
      'Société de Leasing CI', 'Orange Business', 'Imprimerie Plateau'
    ];

    // Generate client invoices (recettes)
    for (let m = 8; m >= 0; m--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // 2-4 client invoices per month
      const numFact = Utils.random(2, 4);
      for (let i = 0; i < numFact; i++) {
        const day = Utils.random(1, daysInMonth);
        const montantHT = Utils.random(200000, 1500000);
        const tva = Math.round(montantHT * 0.18);
        const montantTTC = montantHT + tva;
        const isPaid = m > 1 || (m === 1 && Utils.random(0, 1));

        factures.push({
          id: `FAC-${String(facId++).padStart(4, '0')}`,
          typeFacture: 'client',
          numero: `F${year}-${String(facId).padStart(4, '0')}`,
          client: clientsNoms[Utils.random(0, clientsNoms.length - 1)],
          description: `Transport VTC - Courses ${Utils.getMonthShort(month)} ${year}`,
          montantHT,
          tva,
          montantTTC,
          dateEmission: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          dateEcheance: `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day + 30, 28)).padStart(2, '0')}`,
          statut: isPaid ? 'payee' : (m === 0 ? 'en_attente' : 'en_retard'),
          datePaiement: isPaid ? `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day + Utils.random(5, 25), daysInMonth)).padStart(2, '0')}` : null,
          notes: '',
          dateCreation: new Date(year, month, day).toISOString()
        });
      }

      // 1-3 supplier invoices per month
      const numFactFourn = Utils.random(1, 3);
      for (let i = 0; i < numFactFourn; i++) {
        const day = Utils.random(1, daysInMonth);
        const montantHT = Utils.random(50000, 800000);
        const tva = Math.round(montantHT * 0.18);
        const montantTTC = montantHT + tva;
        const isPaid = m > 0;

        factures.push({
          id: `FAC-${String(facId++).padStart(4, '0')}`,
          typeFacture: 'fournisseur',
          numero: `FF${year}-${String(facId).padStart(4, '0')}`,
          client: fournisseursNoms[Utils.random(0, fournisseursNoms.length - 1)],
          description: ['Carburant mensuel', 'Maintenance véhicule', 'Prime assurance', 'Leasing mensuel', 'Forfait télécom', 'Impression supports'][Utils.random(0, 5)],
          montantHT,
          tva,
          montantTTC,
          dateEmission: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          dateEcheance: `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day + 30, 28)).padStart(2, '0')}`,
          statut: isPaid ? 'payee' : 'en_attente',
          datePaiement: isPaid ? `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day + Utils.random(3, 15), daysInMonth)).padStart(2, '0')}` : null,
          notes: '',
          dateCreation: new Date(year, month, day).toISOString()
        });
      }
    }

    return factures;
  },

  _generateBudgets() {
    const now = new Date();
    const year = now.getFullYear();

    return [
      { id: 'BDG-001', categorie: 'commissions_courses', type: 'recette', montantPrevu: 42000000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-002', categorie: 'courses_directes', type: 'recette', montantPrevu: 12000000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-003', categorie: 'frais_service', type: 'recette', montantPrevu: 3600000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-004', categorie: 'location_vehicule', type: 'recette', montantPrevu: 1200000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-005', categorie: 'autres_recettes', type: 'recette', montantPrevu: 600000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-006', categorie: 'carburant', type: 'depense', montantPrevu: 18000000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-016', categorie: 'recharge_electrique', type: 'depense', montantPrevu: 3600000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-007', categorie: 'assurance', type: 'depense', montantPrevu: 6500000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-008', categorie: 'leasing', type: 'depense', montantPrevu: 28740000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-009', categorie: 'maintenance', type: 'depense', montantPrevu: 4800000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-010', categorie: 'salaires', type: 'depense', montantPrevu: 6000000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-011', categorie: 'loyer_bureau', type: 'depense', montantPrevu: 3000000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-012', categorie: 'telecoms', type: 'depense', montantPrevu: 1200000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-013', categorie: 'fournitures', type: 'depense', montantPrevu: 480000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-014', categorie: 'marketing', type: 'depense', montantPrevu: 900000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() },
      { id: 'BDG-015', categorie: 'taxes_impots', type: 'depense', montantPrevu: 1600000, annee: year, dateCreation: new Date(year, 0, 1).toISOString() }
    ];
  },

  _generatePlanning(data) {
    const planning = [];
    const now = new Date();
    const activeChauffeurs = data.chauffeurs.filter(c => c.statut === 'actif');
    const shifts = ['matin', 'apres_midi', 'journee'];
    let plnId = 1;

    // Generate planning for the current week + 1 previous week + 1 next week
    for (let weekOffset = -1; weekOffset <= 1; weekOffset++) {
      const weekStart = new Date(now);
      const dow = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);

      activeChauffeurs.forEach(ch => {
        // Each driver works 5-6 days per week
        const workDays = Utils.random(5, 6);
        const daysOff = [];

        // Pick rest days
        while (daysOff.length < (7 - workDays)) {
          const d = Utils.random(0, 6);
          if (!daysOff.includes(d)) daysOff.push(d);
        }

        for (let d = 0; d < 7; d++) {
          if (daysOff.includes(d)) continue;

          const date = new Date(weekStart);
          date.setDate(date.getDate() + d);
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

          // Assign a shift type - mostly journee for VTC
          const shift = Utils.random(0, 10) <= 6 ? 'journee' : (Utils.random(0, 1) ? 'matin' : 'apres_midi');

          planning.push({
            id: `PLN-${String(plnId++).padStart(4, '0')}`,
            chauffeurId: ch.id,
            date: dateStr,
            typeCreneaux: shift,
            notes: '',
            dateCreation: new Date().toISOString()
          });
        }
      });
    }

    return planning;
  },

  _generateAbsences(data) {
    const absences = [];
    const now = new Date();
    const activeChauffeurs = data.chauffeurs.filter(c => c.statut !== 'inactif');
    let absId = 1;

    // CHF-006 (Karim - suspendu) has a suspension
    absences.push({
      id: `ABS-${String(absId++).padStart(4, '0')}`,
      chauffeurId: 'CHF-006',
      type: 'suspension',
      dateDebut: this._addDays(now, -15).toISOString().split('T')[0],
      dateFin: this._addDays(now, 15).toISOString().split('T')[0],
      motif: 'Suspension suite aux infractions répétées et score de conduite insuffisant',
      dateCreation: this._addDays(now, -15).toISOString()
    });

    // Some random absences for other drivers
    // Fatou took 3 days of congé recently
    absences.push({
      id: `ABS-${String(absId++).padStart(4, '0')}`,
      chauffeurId: 'CHF-002',
      type: 'conge',
      dateDebut: this._addDays(now, -8).toISOString().split('T')[0],
      dateFin: this._addDays(now, -6).toISOString().split('T')[0],
      motif: 'Congé familial',
      dateCreation: this._addDays(now, -10).toISOString()
    });

    // Seydou had a sick day
    absences.push({
      id: `ABS-${String(absId++).padStart(4, '0')}`,
      chauffeurId: 'CHF-004',
      type: 'maladie',
      dateDebut: this._addDays(now, -3).toISOString().split('T')[0],
      dateFin: this._addDays(now, -2).toISOString().split('T')[0],
      motif: 'Fièvre / Paludisme',
      dateCreation: this._addDays(now, -3).toISOString()
    });

    // Mariama has formation next week
    absences.push({
      id: `ABS-${String(absId++).padStart(4, '0')}`,
      chauffeurId: 'CHF-007',
      type: 'formation',
      dateDebut: this._addDays(now, 3).toISOString().split('T')[0],
      dateFin: this._addDays(now, 4).toISOString().split('T')[0],
      motif: 'Formation sécurité routière OSER',
      dateCreation: now.toISOString()
    });

    // Mohamed gets a repos day
    absences.push({
      id: `ABS-${String(absId++).padStart(4, '0')}`,
      chauffeurId: 'CHF-003',
      type: 'repos',
      dateDebut: this._addDays(now, 1).toISOString().split('T')[0],
      dateFin: this._addDays(now, 1).toISOString().split('T')[0],
      motif: 'Jour de repos hebdomadaire',
      dateCreation: now.toISOString()
    });

    // Aissatou has personal day upcoming
    absences.push({
      id: `ABS-${String(absId++).padStart(4, '0')}`,
      chauffeurId: 'CHF-005',
      type: 'personnel',
      dateDebut: this._addDays(now, 5).toISOString().split('T')[0],
      dateFin: this._addDays(now, 5).toISOString().split('T')[0],
      motif: 'Rendez-vous administratif',
      dateCreation: now.toISOString()
    });

    return absences;
  },

  _generateUsers() {
    const now = new Date();
    return [
      {
        id: 'USR-001',
        prenom: 'Yves',
        nom: 'Nicolas',
        email: 'yves@volt.ci',
        telephone: '+225 07 00 00 01',
        role: 'Administrateur',
        statut: 'actif',
        avatar: null,
        permissions: {
          dashboard: true, chauffeurs: true, vehicules: true, planning: true,
          versements: true, rentabilite: true, comptabilite: true,
          gps_conduite: true, alertes: true, rapports: true, parametres: true
        },
        dernierConnexion: now.toISOString(),
        dateCreation: '2024-01-10T08:00:00Z'
      },
      {
        id: 'USR-002',
        prenom: 'Aminata',
        nom: 'Koné',
        email: 'aminata@volt.ci',
        telephone: '+225 05 00 00 02',
        role: 'Manager',
        statut: 'actif',
        avatar: null,
        permissions: {
          dashboard: true, chauffeurs: true, vehicules: true, planning: true,
          versements: true, rentabilite: true, comptabilite: true,
          gps_conduite: true, alertes: true, rapports: true, parametres: false
        },
        dernierConnexion: this._addDays(now, -1).toISOString(),
        dateCreation: '2024-03-15T10:00:00Z'
      },
      {
        id: 'USR-003',
        prenom: 'Ibrahim',
        nom: 'Touré',
        email: 'ibrahim@volt.ci',
        telephone: '+225 01 00 00 03',
        role: 'Opérateur',
        statut: 'actif',
        avatar: null,
        permissions: {
          dashboard: true, chauffeurs: true, vehicules: true, planning: true,
          versements: false, rentabilite: false, comptabilite: false,
          gps_conduite: false, alertes: false, rapports: false, parametres: false
        },
        dernierConnexion: this._addDays(now, -3).toISOString(),
        dateCreation: '2024-06-20T14:00:00Z'
      }
    ];
  },

  _generateSettings() {
    return {
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
    };
  },

  _addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
};
