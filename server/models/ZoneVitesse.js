const mongoose = require('mongoose');

const zoneVitesseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  nom: { type: String, required: true },
  type: { type: String, enum: ['axe', 'zone', 'radar'], default: 'radar' },
  vitesseMax: { type: Number, required: true },
  tolerance: { type: Number, default: 5 },
  coordinates: {
    lat: Number,
    lng: Number,
    rayon: { type: Number, default: 200 }
  },
  polygone: [{ lat: Number, lng: Number }],
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

zoneVitesseSchema.index({ entrepriseId: 1, actif: 1 });

module.exports = mongoose.model('ZoneVitesse', zoneVitesseSchema);
