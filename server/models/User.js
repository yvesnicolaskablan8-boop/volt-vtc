const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  prenom: { type: String, required: true },
  nom: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  telephone: String,
  role: { type: String, default: 'Opérateur' },
  statut: { type: String, default: 'actif' },
  avatar: String,
  passwordHash: String,
  mustChangePassword: { type: Boolean, default: true },
  permissions: {
    dashboard: { type: Boolean, default: false },
    chauffeurs: { type: Boolean, default: false },
    vehicules: { type: Boolean, default: false },
    planning: { type: Boolean, default: false },
    versements: { type: Boolean, default: false },
    rentabilite: { type: Boolean, default: false },
    comptabilite: { type: Boolean, default: false },
    gps_conduite: { type: Boolean, default: false },
    alertes: { type: Boolean, default: false },
    rapports: { type: Boolean, default: false },
    parametres: { type: Boolean, default: false }
  },
  dernierConnexion: Date,
  dateCreation: { type: Date, default: Date.now }
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      return ret;
    }
  }
});

module.exports = mongoose.model('User', userSchema);
