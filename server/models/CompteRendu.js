const mongoose = require('mongoose');

const compteRenduSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  titre: { type: String, required: true },
  date: { type: String, required: true }, // ISO date
  heureDebut: String,
  heureFin: String,
  lieu: String,
  type: { type: String, default: 'equipe' }, // equipe, direction, operationnel, urgence, autre
  statut: { type: String, default: 'brouillon' }, // brouillon, valide, archive
  // Participants
  participants: [{
    userId: String,
    nom: String,
    present: { type: Boolean, default: true },
    role: String // animateur, rapporteur, participant
  }],
  // Contenu structure
  ordreJour: [String],
  pointsDiscutes: [{
    titre: String,
    resume: String,
    decisions: [String]
  }],
  decisions: [{
    description: String,
    responsable: String,
    responsableNom: String,
    dateEcheance: String
  }],
  actionsAMener: [{
    description: String,
    responsable: String,
    responsableNom: String,
    dateEcheance: String,
    priorite: { type: String, default: 'normale' },
    tacheId: String // tache generee automatiquement
  }],
  notesLibres: String,
  // Meta
  creePar: String,
  creeParNom: String,
  dateCreation: { type: String, default: () => new Date().toISOString() },
  dateModification: String,
  prochainReunion: String // date de la prochaine reunion
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

compteRenduSchema.index({ date: -1 });
compteRenduSchema.index({ entrepriseId: 1 });

module.exports = mongoose.model('CompteRendu', compteRenduSchema);
