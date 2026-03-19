const mongoose = require('mongoose');

const versementSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  chauffeurId: { type: String, required: true },
  vehiculeId: String,
  date: String,
  dateService: String,
  periode: String,
  montantBrut: Number,
  commission: Number,
  montantNet: Number,
  montantVerse: Number,
  statut: { type: String, default: 'en_attente' },
  dateValidation: String,
  commentaire: String,
  nombreCourses: Number,
  soumisParChauffeur: { type: Boolean, default: false },
  enRetard: { type: Boolean, default: false },
  penaliteMontant: { type: Number, default: 0 },
  deadlineDate: String,
  justification: String,
  justificationDate: String,
  moyenPaiement: String,
  referencePaiement: String,
  waveCheckoutId: String,
  waveTransactionId: String,
  manquant: { type: Number, default: 0 },
  traitementManquant: { type: String, enum: ['dette', 'perte', null], default: null },
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

// Index for date-range queries and driver lookups
versementSchema.index({ date: -1 });
versementSchema.index({ chauffeurId: 1, date: -1 });
versementSchema.index({ vehiculeId: 1, date: -1 });

module.exports = mongoose.model('Versement', versementSchema);
