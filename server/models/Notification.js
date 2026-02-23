const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  chauffeurId: String,  // null = broadcast a tous
  type: {
    type: String,
    enum: ['deadline_rappel', 'deadline_retard', 'document_expiration', 'score_faible', 'annonce', 'bonus', 'bienvenue'],
    required: true
  },
  titre: { type: String, required: true },
  message: { type: String, required: true },
  canal: {
    type: String,
    enum: ['push', 'sms', 'both'],
    default: 'push'
  },
  statut: {
    type: String,
    enum: ['envoyee', 'echec', 'lue'],
    default: 'envoyee'
  },
  smsSid: String,       // Twilio Message SID si SMS
  pushSent: { type: Boolean, default: false },
  smsSent: { type: Boolean, default: false },
  erreur: String,       // Message d'erreur si echec
  dateLue: String,
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

// Index pour les requetes frequentes
notificationSchema.index({ chauffeurId: 1, dateCreation: -1 });
notificationSchema.index({ type: 1, dateCreation: -1 });
notificationSchema.index({ statut: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
