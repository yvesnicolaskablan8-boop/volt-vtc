const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: String,
  userNom: String,
  action: { type: String, enum: ['create', 'update', 'delete', 'bulk_replace'], required: true },
  collection: { type: String, required: true },
  documentId: String,
  details: String,
  ip: String,
  timestamp: { type: Date, default: () => new Date() }
}, {
  toJSON: { transform(doc, ret) { delete ret._id; delete ret.__v; return ret; } }
});

activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ collection: 1, timestamp: -1 });
activityLogSchema.index({ userId: 1, timestamp: -1 });
// TTL: auto-delete after 90 days
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 86400 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
