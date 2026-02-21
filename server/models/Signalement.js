const mongoose = require('mongoose');

const signalementSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  vehiculeId: String,
  type: {
    type: String,
    required: true,
    enum: ['panne', 'accident', 'amende', 'pneu', 'vol', 'agression', 'autre']
  },
  titre: { type: String, required: true },
  description: String,
  urgence: {
    type: String,
    default: 'normale',
    enum: ['normale', 'haute', 'critique']
  },
  statut: {
    type: String,
    default: 'ouvert',
    enum: ['ouvert', 'en_cours', 'resolu', 'ferme']
  },
  commentaireAdmin: String,
  localisation: String,
  dateSignalement: { type: String, default: () => new Date().toISOString() },
  dateResolution: String,
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

module.exports = mongoose.model('Signalement', signalementSchema);
