const mongoose = require('mongoose');

const contraventionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  vehiculeId: String,
  date: String,
  type: String,
  description: String,
  lieu: String,
  montant: Number,
  statut: { type: String, default: 'impayee' },
  moyenPaiement: String,
  datePaiement: String,
  motifContestation: String,
  commentaire: String,
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

contraventionSchema.index({ date: -1 });
contraventionSchema.index({ chauffeurId: 1, date: -1 });

module.exports = mongoose.model('Contravention', contraventionSchema);
