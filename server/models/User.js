const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  prenom: { type: String, required: true },
  nom: { type: String, required: true },
  email: { type: String, lowercase: true, sparse: true },
  telephone: String,
  role: { type: String, default: 'Opérateur' },
  chauffeurId: String,
  pin: String,
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
      delete ret.pin;
      return ret;
    }
  }
});

// Pre-save: remove empty email to avoid duplicate key errors
userSchema.pre('save', function(next) {
  if (this.email !== undefined && (!this.email || !this.email.trim())) {
    this.email = undefined;
  }
  next();
});

// Pre-findOneAndUpdate: same cleanup
userSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update && update.$set && update.$set.email !== undefined) {
    if (!update.$set.email || !update.$set.email.trim()) {
      delete update.$set.email;
      this.update({}, { $unset: { email: 1 } });
    }
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
