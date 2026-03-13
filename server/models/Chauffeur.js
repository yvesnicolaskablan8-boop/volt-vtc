const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  type: String,
  nom: String,
  dateExpiration: String,
  statut: { type: String, default: 'valide' },
  fichierData: String,      // Base64-encoded file
  fichierType: String,      // MIME type
  fichierNom: String,       // Original filename
  dateUpload: String
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
  yangoDriverId: String,
  vehiculeAssigne: String,
  photo: String,
  documents: [documentSchema],
  redevanceQuotidienne: { type: Number, default: 0 },
  objectifCA: { type: Number, default: 0 },
  noteInterne: String,
  location: {
    lat: Number,
    lng: Number,
    speed: Number,
    heading: Number,
    accuracy: Number,
    updatedAt: String
  },
  objectifs: {
    caMensuel: { type: Number, default: 0 },
    joursMinimum: { type: Number, default: 20 },
    scoreMinimum: { type: Number, default: 70 }
  },
  badges: [{
    id: String,
    nom: String,
    description: String,
    icon: String,
    dateObtenu: String
  }],
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
