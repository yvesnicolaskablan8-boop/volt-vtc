const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  chauffeurId: { type: String, required: true },
  subscription: {
    endpoint: { type: String, required: true },
    expirationTime: mongoose.Schema.Types.Mixed,
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  },
  userAgent: String,     // Pour identifier le device
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

// Un chauffeur peut avoir plusieurs subscriptions (plusieurs devices)
// Mais on evite les doublons par endpoint
pushSubscriptionSchema.index({ chauffeurId: 1 });
pushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
