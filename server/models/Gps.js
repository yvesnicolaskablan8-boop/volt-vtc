const mongoose = require('mongoose');

const gpsSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  vehiculeId: String,
  date: String,
  scoreGlobal: Number,
  scoreVitesse: Number,
  scoreFreinage: Number,
  scoreAcceleration: Number,
  scoreVirage: Number,
  scoreRegularite: Number,
  evenements: {
    freinagesBrusques: Number,
    accelerationsBrusques: Number,
    excesVitesse: Number,
    viragesAgressifs: Number,
    tempsConduite: Number,
    distanceParcourue: Number,
    vitesseMoyenne: Number,
    vitesseMax: Number
  },
  analyseIA: {
    resume: String,
    recommandations: [String],
    tendance: String,
    comparaisonFlotte: String
  }
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Gps', gpsSchema);
