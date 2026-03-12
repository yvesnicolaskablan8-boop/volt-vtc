const mongoose = require('mongoose');

const debtCallSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: { type: String, required: true },
  conversationId: String,       // ElevenLabs conversation ID
  callSid: String,              // Twilio call SID
  montantDette: { type: Number, default: 0 },
  statut: {
    type: String,
    enum: ['en_cours', 'termine', 'echoue', 'pas_repondu', 'occupe'],
    default: 'en_cours'
  },
  duree: { type: Number, default: 0 },           // secondes
  resultat: String,                                // success / failure / unknown
  resume: String,                                  // résumé de la conversation
  transcript: { type: Array, default: [] },
  declenchement: {
    type: String,
    enum: ['manuel', 'automatique'],
    default: 'manuel'
  },
  dateAppel: String,
  dateCreation: { type: String, default: () => new Date().toISOString() }
});

debtCallSchema.index({ chauffeurId: 1 });
debtCallSchema.index({ dateAppel: -1 });
debtCallSchema.index({ conversationId: 1 });

module.exports = mongoose.model('DebtCall', debtCallSchema);
