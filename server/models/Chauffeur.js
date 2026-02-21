const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  type: String,
  nom: String,
  dateExpiration: String,
  statut: { type: String, default: 'valide' }
}, { _id: false });

const chauffeurSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  prenom: { type: String, required: true },
  nom: { type: String, required: true },
  telephone: String,
  email: String,
  dateNaissance: String,
  adresse: String,
  numeroPermis: String,
  dateDebutContrat: String,
  dateFinContrat: String,
  statut: { type: String, default: 'actif' },
  scoreConduite: { type: Number, default: 80 },
  baseScore: Number,
  volatility: Number,
  weakness: String,
  vehiculeAssigne: String,
  photo: String,
  documents: [documentSchema],
  noteInterne: String,
  dateCreation: { type: String, default: () => new Date().toISOString() }
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Chauffeur', chauffeurSchema);
