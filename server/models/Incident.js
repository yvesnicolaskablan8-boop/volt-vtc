const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { type: String, required: true, enum: ['accident', 'panne', 'vol', 'agression', 'contravention', 'autre'] },
  date: { type: String, required: true },
  heure: String,
  chauffeurId: { type: String, required: true },
  vehiculeId: String,
  description: { type: String, required: true },
  lieu: String,
  gravite: { type: String, required: true, enum: ['mineur', 'moyen', 'grave', 'critique'], default: 'moyen' },
  statut: { type: String, required: true, enum: ['ouvert', 'en_cours', 'resolu', 'clos'], default: 'ouvert' },
  coutEstime: { type: Number, default: 0 },
  coutReel: { type: Number, default: 0 },
  assurancePriseEnCharge: { type: Boolean, default: false },
  referenceAssurance: String,
  photos: [String],
  notes: String,
  dateResolution: String,
  dateCreation: { type: String, default: () => new Date().toISOString() },
  dateModification: { type: String, default: () => new Date().toISOString() }
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

incidentSchema.index({ chauffeurId: 1, date: -1 });
incidentSchema.index({ vehiculeId: 1 });
incidentSchema.index({ statut: 1 });
incidentSchema.index({ date: -1 });
incidentSchema.index({ gravite: 1 });

module.exports = mongoose.model('Incident', incidentSchema);
