const mongoose = require('mongoose');

const depenseCategorieSchema = new mongoose.Schema({
  entrepriseId: { type: String, index: true, default: null },
  value: { type: String, required: true },
  label: { type: String, required: true }
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('DepenseCategorie', depenseCategorieSchema);
