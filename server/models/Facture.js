const mongoose = require('mongoose');

const factureSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  typeFacture: { type: String, required: true },
  numero: String,
  client: String,
  description: String,
  montantHT: Number,
  tva: Number,
  montantTTC: Number,
  dateEmission: String,
  dateEcheance: String,
  statut: { type: String, default: 'en_attente' },
  datePaiement: String,
  notes: String,
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

module.exports = mongoose.model('Facture', factureSchema);
