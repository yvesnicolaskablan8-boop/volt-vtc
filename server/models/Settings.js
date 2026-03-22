const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  entrepriseId: { type: String, index: true, default: null },
  entreprise: {
    nom: String,
    slogan: String,
    email: String,
    telephone: String,
    adresse: String,
    siteWeb: String,
    numeroRegistre: String,
    devise: { type: String, default: 'FCFA' },
    objectifMensuelCA: { type: Number, default: 0 }
  },
  preferences: {
    themeDefaut: { type: String, default: 'dark' },
    langue: { type: String, default: 'fr' },
    formatDate: { type: String, default: 'DD/MM/YYYY' },
    notifications: { type: Boolean, default: true },
    alertesSonores: { type: Boolean, default: false },
    sessionTimeout: { type: Number, default: 30 }
  },
  versements: {
    deadlineType: { type: String, enum: ['quotidien', 'hebdomadaire', 'mensuel'], default: 'quotidien' },
    deadlineJour: { type: Number, default: 0 },
    deadlineHeure: { type: String, default: '23:59' },
    objectifRecette: { type: Number, default: 0 },
    penaliteActive: { type: Boolean, default: false },
    penaliteType: { type: String, enum: ['pourcentage', 'montant_fixe'], default: 'pourcentage' },
    penaliteValeur: { type: Number, default: 5 },
    alerteRetard: { type: Boolean, default: true }
  },
  objectifs: {
    tempsEnLigneMin: { type: Number, default: 630 },
    alerteTempsEnLigne: { type: Boolean, default: true }
  },
  bonus: {
    bonusActif: { type: Boolean, default: false },
    scoreMinimum: { type: Number, default: 90 },
    tempsActiviteMin: { type: Number, default: 600 },
    bonusType: { type: String, enum: ['pourcentage', 'montant_fixe'], default: 'montant_fixe' },
    bonusValeur: { type: Number, default: 5000 },
    bonusPeriode: { type: String, enum: ['hebdomadaire', 'mensuel'], default: 'mensuel' }
  },
  notifications: {
    smsActif: { type: Boolean, default: false },
    whatsappActif: { type: Boolean, default: false },
    pushActif: { type: Boolean, default: true },
    rappelDeadline24h: { type: Boolean, default: true },
    rappelDeadline1h: { type: Boolean, default: true },
    alerteDocuments30j: { type: Boolean, default: true },
    alerteDocuments7j: { type: Boolean, default: true },
    alerteScoreFaible: { type: Boolean, default: true },
    scoreSeuilAlerte: { type: Number, default: 60 },
    alerteAdminRetard: { type: Boolean, default: true },
    telephoneAdmin: String,
    telephoneAdminWhatsapp: String
  },
  contrat: {
    version: { type: Number, default: 1 },
    derniereMaj: { type: String, default: '' },
    employeur: { type: String, default: '' },
    typeContrat: { type: String, default: 'CDI' },
    poste: { type: String, default: 'Chauffeur VTC' },
    periodeEssai: { type: String, default: '3 mois, renouvelable une fois' },
    lieuTravail: { type: String, default: '' },
    organisation: { type: String, default: '' },
    horaires: { type: String, default: '' },
    salaireJournalier: { type: Number, default: 0 },
    bonusPerformance: { type: String, default: '' },
    objectifMinimum: { type: Number, default: 0 },
    obligations: { type: String, default: '' },
    responsabilites: { type: String, default: '' },
    protectionSociale: { type: String, default: '' },
    clauseResiliation: { type: String, default: '' },
    clausesParticulieres: { type: String, default: '' },
    amendements: [{
      date: String,
      description: String,
      auteur: String
    }]
  },
  integrations: {
    wave: {
      apiKey: { type: String, default: '' }
    },
    yango: {
      parkId: { type: String, default: '' },
      apiKey: { type: String, default: '' },
      clientId: { type: String, default: '' }
    }
  }
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Settings', settingsSchema);
