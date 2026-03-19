const mongoose = require('mongoose');

const depenseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  vehiculeId: { type: String, default: '' },
  chauffeurId: String,
  typeDepense: { type: String, required: true },
  montant: { type: Number, required: true },
  date: { type: String, required: true },
  kilometrage: Number,
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

depenseSchema.index({ date: -1 });
depenseSchema.index({ vehiculeId: 1, date: -1 });
depenseSchema.index({ typeDepense: 1 });

module.exports = mongoose.model('Depense', depenseSchema);
