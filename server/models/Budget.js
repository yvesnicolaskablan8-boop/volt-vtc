const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  categorie: { type: String, required: true },
  type: { type: String, required: true },
  montantPrevu: { type: Number, required: true },
  annee: { type: Number, required: true },
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

module.exports = mongoose.model('Budget', budgetSchema);
