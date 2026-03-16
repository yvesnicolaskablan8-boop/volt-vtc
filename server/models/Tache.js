const mongoose = require('mongoose');

const tacheSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
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
  commentaire: String
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

module.exports = mongoose.model('Tache', tacheSchema);
