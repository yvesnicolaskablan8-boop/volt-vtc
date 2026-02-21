const mongoose = require('mongoose');

const versementSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  vehiculeId: String,
  date: String,
  periode: String,
  montantBrut: Number,
  commission: Number,
  montantNet: Number,
  montantVerse: Number,
  statut: { type: String, enum: ['valide', 'en_attente', 'retard', 'partiel'], default: 'en_attente' },
  dateValidation: String,
  commentaire: String,
  nombreCourses: Number,
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

module.exports = mongoose.model('Versement', versementSchema);
