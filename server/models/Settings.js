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
