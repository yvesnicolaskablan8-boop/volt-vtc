const mongoose = require('mongoose');

const tacheSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  titre: { type: String, required: true },
  description: String,
  type: { type: String, default: 'autre' }, // maintenance, administratif, livraison, controle, autre
  priorite: { type: String, default: 'normale' }, // basse, normale, haute, urgente
  statut: { type: String, default: 'a_faire' }, // a_faire, en_cours, terminee, annulee
  assigneA: String,
  assigneANom: String,
  creePar: String,
  creeParNom: String,
  dateEcheance: String,
  dateCreation: { type: String, default: () => new Date().toISOString() },
  dateModification: String,
  dateTerminaison: String,
  commentaire: String,
  // Eisenhower
  urgent: { type: Boolean, default: false },
  important: { type: Boolean, default: false },
  // Etiquettes et organisation
  etiquettes: [String], // tags personnalises
  couleur: String, // couleur carte Kanban
  ordre: { type: Number, default: 0 }, // ordre dans la colonne Kanban
  // Sous-taches
  sousTaches: [{
    id: String,
    titre: String,
    fait: { type: Boolean, default: false },
    dateCreation: String
  }],
  // Estimation temps
  tempsEstime: Number, // en minutes
  tempsReel: Number, // en minutes
  // Reunion liee
  reunionId: String, // lien vers un compte rendu de reunion
  // Recurrence
  recurrence: { type: String, default: 'aucune' },
  joursSemaine: [Number],
  jourMois: Number,
  recurrenceActif: { type: Boolean, default: false },
  recurrenceParentId: String,
  prochaineExecution: String
}, {
  toJSON: {
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

tacheSchema.index({ assigneA: 1, statut: 1 });
tacheSchema.index({ dateEcheance: 1 });
tacheSchema.index({ recurrenceActif: 1, prochaineExecution: 1 });

module.exports = mongoose.model('Tache', tacheSchema);
