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
  statut: { type: String, default: 'en_attente' },
  dateValidation: String,
  commentaire: String,
  nombreCourses: Number,
  soumisParChauffeur: { type: Boolean, default: false },
  enRetard: { type: Boolean, default: false },
  penaliteMontant: { type: Number, default: 0 },
  deadlineDate: String,
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
