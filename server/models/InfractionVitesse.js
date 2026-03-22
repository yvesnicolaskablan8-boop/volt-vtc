const mongoose = require('mongoose');

const infractionVitesseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  chauffeurId: { type: String, required: true, index: true },
  vehiculeId: String,
  zoneId: String,
  zoneNom: String,
  date: String,
  heure: String,
  vitesseEnregistree: Number,
  vitesseLimite: Number,
  depassement: Number,
  categorie: Number, // 1-4
  montantAmende: Number,
  position: {
    lat: Number,
    lng: Number
  },
  statut: { type: String, enum: ['detectee', 'confirmee', 'annulee', 'convertie'], default: 'detectee' },
  contraventionId: String,
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

infractionVitesseSchema.index({ chauffeurId: 1, date: -1 });
infractionVitesseSchema.index({ zoneId: 1, date: -1 });

module.exports = mongoose.model('InfractionVitesse', infractionVitesseSchema);
