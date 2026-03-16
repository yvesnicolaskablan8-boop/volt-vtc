const mongoose = require('mongoose');

const tacheSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  titre: { type: String, required: true },
  description: String,
  type: { type: String, default: 'autre' }, // maintenance, administratif, livraison, controle, autre
  priorite: { type: String, default: 'normale' }, // basse, normale, haute, urgente
  statut: { type: String, default: 'a_faire' }, // a_faire, en_cours, terminee, annulee
  assigneA: String, // chauffeurId
  assigneParId: String, // userId admin
  assigneParNom: String, // nom admin
  vehiculeId: String,
  dateEcheance: String,
  dateCreation: { type: String, default: () => new Date().toISOString() },
  dateModification: String,
  dateTerminaison: String,
  commentaireAdmin: String,
  commentaireChauffeur: String
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
