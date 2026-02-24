const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  vehiculeId: String,
  dateHeure: { type: String, required: true },
  depart: String,
  arrivee: String,
  distanceKm: Number,
  dureeMn: Number,
  montantTTC: Number,
  montantHT: Number,
  tva: Number,
  typeTrajet: String,
  plateforme: String,
  statut: { type: String, default: 'terminee' },
  noteClient: Number
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
courseSchema.index({ dateHeure: -1 });
courseSchema.index({ chauffeurId: 1, dateHeure: -1 });
courseSchema.index({ vehiculeId: 1, dateHeure: -1 });

module.exports = mongoose.model('Course', courseSchema);
