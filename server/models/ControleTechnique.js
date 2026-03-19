const mongoose = require('mongoose');

const controleTechniqueSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  vehiculeId: { type: String, required: true },
  date: { type: String, required: true },
  dateExpiration: { type: String, required: true },
  resultat: { type: String, required: true },
  centre: String,
  cout: Number,
  observations: String,
  contreVisiteDate: String,
  contreVisiteResultat: String,
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

controleTechniqueSchema.index({ vehiculeId: 1, date: -1 });
controleTechniqueSchema.index({ dateExpiration: -1 });

module.exports = mongoose.model('ControleTechnique', controleTechniqueSchema);
