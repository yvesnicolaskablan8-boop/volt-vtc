const mongoose = require('mongoose');

const comptabiliteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { type: String, enum: ['recette', 'depense'], required: true },
  categorie: { type: String, required: true },
  description: String,
  montant: { type: Number, required: true },
  date: { type: String, required: true },
  modePaiement: { type: String, enum: ['especes', 'virement', 'mobile_money', 'cheque', 'carte'] },
  reference: String,
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

module.exports = mongoose.model('Comptabilite', comptabiliteSchema);
