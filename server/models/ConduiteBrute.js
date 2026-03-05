const mongoose = require('mongoose');

const evenementSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['freinage', 'acceleration', 'virage', 'exces_vitesse'],
    required: true
  },
  heure: String,
  severite: {
    type: String,
    enum: ['faible', 'modere', 'severe'],
    default: 'modere'
  },
  valeur: Number,
  duree: Number,
  position: {
    lat: Number,
    lng: Number
  }
}, { _id: false });

const gpsSampleSchema = new mongoose.Schema({
  heure: String,
  lat: Number,
  lng: Number,
  speed: Number,
  heading: Number
}, { _id: false });

const conduiteBruteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  date: String,
  sessionDebut: String,
  sessionFin: String,
  evenements: [evenementSchema],
  gpsSamples: [gpsSampleSchema],
  compteurs: {
    freinagesBrusques: { type: Number, default: 0 },
    accelerationsBrusques: { type: Number, default: 0 },
    viragesAgressifs: { type: Number, default: 0 },
    excesVitesse: { type: Number, default: 0 }
  },
  stats: {
    distanceParcourue: { type: Number, default: 0 },
    tempsConduite: { type: Number, default: 0 },
    vitesseMoyenne: { type: Number, default: 0 },
    vitesseMax: { type: Number, default: 0 }
  },
  scoreCalcule: { type: Boolean, default: false },
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

conduiteBruteSchema.index({ chauffeurId: 1, date: -1 });
conduiteBruteSchema.index({ date: -1 });

module.exports = mongoose.model('ConduiteBrute', conduiteBruteSchema);
