const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id: String,                    // 'MSG-XXXXXX'
  auteur: String,                // 'admin' ou chauffeurId
  auteurNom: String,             // "Admin" ou "Prenom Nom"
  contenu: String,               // Texte du message
  type: { type: String, default: 'message' }, // 'message' | 'appel' | 'systeme'
  callData: {
    callSid: String,
    duree: Number,               // secondes
    statut: String               // 'initiated' | 'ringing' | 'completed' | 'no-answer' | 'busy' | 'failed'
  },
  dateCreation: { type: String, default: () => new Date().toISOString() }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  sujet: { type: String, default: '' },
  statut: { type: String, default: 'active' },         // 'active' | 'archivee'
  dernierMessage: String,                                // Apercu du dernier message
  dernierMessageDate: String,                            // Date du dernier message (pour tri)
  nonLusAdmin: { type: Number, default: 0 },
  nonLusChauffeur: { type: Number, default: 0 },
  messages: [messageSchema],
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

conversationSchema.index({ chauffeurId: 1, dernierMessageDate: -1 });
conversationSchema.index({ statut: 1, dernierMessageDate: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
