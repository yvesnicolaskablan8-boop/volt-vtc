const mongoose = require('mongoose');

const depenseRecurrenteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  nom: { type: String, required: true },
  chauffeurId: String,
  typeDepense: { type: String, required: true },
  montant: { type: Number, required: true },
  recurrence: { type: String, enum: ['par_shift', 'quotidien', 'hebdo', 'mensuel'], required: true },
  jourSemaine: Number,
  jourMois: Number,
  actif: { type: Boolean, default: true },
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

module.exports = mongoose.model('DepenseRecurrente', depenseRecurrenteSchema);
