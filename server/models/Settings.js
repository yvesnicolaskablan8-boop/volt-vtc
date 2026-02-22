const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  entreprise: {
    nom: String,
    slogan: String,
    email: String,
    telephone: String,
    adresse: String,
    siteWeb: String,
    numeroRegistre: String,
    devise: { type: String, default: 'FCFA' }
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
    deadlineType: { type: String, enum: ['hebdomadaire', 'mensuel'], default: 'hebdomadaire' },
    deadlineJour: { type: Number, default: 0 },
    deadlineHeure: { type: String, default: '23:59' },
    penaliteActive: { type: Boolean, default: false },
    penaliteType: { type: String, enum: ['pourcentage', 'montant_fixe'], default: 'pourcentage' },
    penaliteValeur: { type: Number, default: 5 },
    alerteRetard: { type: Boolean, default: true }
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
