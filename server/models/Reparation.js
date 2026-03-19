const mongoose = require('mongoose');

const reparationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  vehiculeId: { type: String, required: true },
  date: { type: String, required: true },
  dateFinImmobilisation: String,
  type: { type: String, required: true },
  description: { type: String, required: true },
  prestataire: String,
  coutEstime: Number,
  coutReel: { type: Number, required: true },
  pieces: String,
  kilometrage: Number,
  commentaire: String,
  statut: { type: String, default: 'terminee' },
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

reparationSchema.index({ vehiculeId: 1, date: -1 });
reparationSchema.index({ date: -1 });
reparationSchema.index({ type: 1 });

module.exports = mongoose.model('Reparation', reparationSchema);
