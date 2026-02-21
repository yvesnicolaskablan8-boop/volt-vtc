const mongoose = require('mongoose');

const absenceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  type: { type: String, enum: ['repos', 'conge', 'maladie', 'formation', 'personnel', 'suspension'], required: true },
  dateDebut: { type: String, required: true },
  dateFin: { type: String, required: true },
  motif: String,
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

module.exports = mongoose.model('Absence', absenceSchema);
