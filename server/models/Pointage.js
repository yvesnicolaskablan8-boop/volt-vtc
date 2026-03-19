const mongoose = require('mongoose');

const evenementSchema = new mongoose.Schema({
  type: { type: String, enum: ['debut', 'pause', 'reprise', 'fin'], required: true },
  heure: { type: String, required: true }
}, { _id: false });

const pointageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  chauffeurId: { type: String, required: true },
  date: { type: String, required: true },
  statut: { type: String, enum: ['en_service', 'pause', 'termine'], default: 'en_service' },
  evenements: [evenementSchema],
  heureDebut: String,
  heureFin: String,
  dureeTotaleMinutes: { type: Number, default: 0 },
  dureePauseMinutes: { type: Number, default: 0 },
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

pointageSchema.index({ chauffeurId: 1, date: -1 });
pointageSchema.index({ date: -1 });

module.exports = mongoose.model('Pointage', pointageSchema);
