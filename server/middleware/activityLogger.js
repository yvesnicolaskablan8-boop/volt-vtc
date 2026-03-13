const ActivityLog = require('../models/ActivityLog');

function generateId() {
  return 'LOG-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

function logActivity(action, collection, documentId, details, req) {
  const log = new ActivityLog({
    id: generateId(),
    userId: req.user ? req.user.userId : 'system',
    userNom: req.user ? ((req.user.prenom || '') + ' ' + (req.user.nom || '')).trim() : 'Systeme',
    action,
    collection,
    documentId: documentId || null,
    details: typeof details === 'string' ? details : JSON.stringify(details),
    ip: req.ip || (req.connection && req.connection.remoteAddress) || ''
  });
  log.save().catch(err => console.warn('[ActivityLog] Save error:', err.message));
}

module.exports = { logActivity };
