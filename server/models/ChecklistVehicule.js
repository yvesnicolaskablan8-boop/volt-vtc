const mongoose = require('mongoose');

const checklistVehiculeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  chauffeurId: { type: String, required: true },
  vehiculeId: String,
  date: { type: String, required: true },
  items: [{
    nom: {
      type: String,
      enum: ['pneus', 'feux', 'retroviseurs', 'proprete_interieur', 'proprete_exterieur',
             'niveau_huile', 'freins', 'ceintures', 'climatisation', 'documents_bord']
    },
    statut: {
      type: String,
      default: 'non_verifie',
      enum: ['ok', 'probleme', 'non_verifie']
    },
    commentaire: String
  }],
  resultat: {
    type: String,
    default: 'ok',
    enum: ['ok', 'problemes_detectes']
  },
  commentaireGeneral: String,
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

checklistVehiculeSchema.index({ chauffeurId: 1, date: -1 });
checklistVehiculeSchema.index({ date: -1 });

module.exports = mongoose.model('ChecklistVehicule', checklistVehiculeSchema);
