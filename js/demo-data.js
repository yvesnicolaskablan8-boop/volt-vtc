/**
 * DemoData - Initializes empty data with default admin user for Volt VTC
 */
const DemoData = {
  async generate() {
    const now = new Date();

    // Hash the default admin password
    const adminHash = await Auth.hashPassword('admin123');

    const data = {
      chauffeurs: [],
      vehicules: [],
      courses: [],
      versements: [],
      gps: [],
      comptabilite: [],
      factures: [],
      budgets: [],
      planning: [],
      absences: [],
      users: [
        {
          id: 'USR-001',
          prenom: 'Yves',
          nom: 'Nicolas',
          email: 'yves@volt.ci',
          telephone: '+225 07 00 00 01',
          role: 'Administrateur',
          statut: 'actif',
          avatar: null,
          passwordHash: adminHash,
          mustChangePassword: false,
          permissions: {
            dashboard: true, chauffeurs: true, vehicules: true, planning: true,
            versements: true, rentabilite: true, comptabilite: true,
            gps_conduite: true, alertes: true, rapports: true, parametres: true
          },
          dernierConnexion: now.toISOString(),
          dateCreation: '2024-01-10T08:00:00Z'
        }
      ],
      settings: {
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
      }
    };

    localStorage.setItem('volt_data', JSON.stringify(data));
    return data;
  }
};
