const mongoose = require('mongoose');

const planningSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  date: { type: String, required: true },
  typeCreneaux: { type: String, enum: ['matin', 'apres_midi', 'journee', 'nuit'], default: 'journee' },
  notes: String,
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

module.exports = mongoose.model('Planning', planningSchema);
