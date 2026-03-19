const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const entrepriseSchema = new mongoose.Schema({
  id: { type: String, default: () => 'ENT-' + uuidv4().slice(0, 8).toUpperCase(), unique: true, index: true },
  nom: { type: String, required: true },
  slug: { type: String, unique: true, sparse: true },
  email: String,
  telephone: String,
  adresse: String,
  devise: { type: String, default: 'FCFA' },
  statut: { type: String, enum: ['actif', 'suspendu', 'essai'], default: 'actif' },
  plan: { type: String, enum: ['gratuit', 'standard', 'premium'], default: 'standard' },
  dateCreation: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Entreprise', entrepriseSchema);
