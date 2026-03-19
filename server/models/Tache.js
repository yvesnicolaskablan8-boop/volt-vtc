const mongoose = require('mongoose');

const tacheSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  entrepriseId: { type: String, index: true, default: null },
  titre: { type: String, required: true },
  description: String,
  type: { type: String, default: 'autre' }, // maintenance, administratif, livraison, controle, autre
  priorite: { type: String, default: 'normale' }, // basse, normale, haute, urgente
  statut: { type: String, default: 'a_faire' }, // a_faire, en_cours, terminee, annulee
  assigneA: String, // userId de l'utilisateur admin assigne
  assigneANom: String, // nom affiche de l'utilisateur assigne
  creePar: String, // userId du createur
  creeParNom: String, // nom affiche du createur
  dateEcheance: String,
  dateCreation: { type: String, default: () => new Date().toISOString() },
  dateModification: String,
  dateTerminaison: String,
  commentaire: String,
  // Recurrence
  recurrence: { type: String, default: 'aucune' }, // aucune, quotidien, hebdomadaire, mensuel
  joursSemaine: [Number], // pour hebdomadaire: 0=Dim,1=Lun,...6=Sam
  jourMois: Number, // pour mensuel: 1-31
  recurrenceActif: { type: Boolean, default: false },
  recurrenceParentId: String, // id de la tache modele (pour les instances generees)
  prochaineExecution: String // date ISO de la prochaine generation
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
