/**
 * Routes Notifications — Admin
 *
 * GET  /api/notifications       — Lister les notifications (avec filtres)
 * POST /api/notifications/send  — Envoyer une annonce manuelle
 * GET  /api/notifications/stats — Stats globales
 */

const express = require('express');
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/auth');
const notifService = require('../utils/notification-service');

const router = express.Router();
router.use(authMiddleware);

// =================== LIST ===================

// GET /api/notifications?type=annonce&limit=50&offset=0
router.get('/', async (req, res, next) => {
  try {
    const { type, chauffeurId, statut, limit = 50, offset = 0 } = req.query;

    const query = {};
    if (type) query.type = type;
    if (chauffeurId) query.chauffeurId = chauffeurId;
    if (statut) query.statut = statut;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ dateCreation: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments(query)
    ]);

    const clean = notifications.map(({ _id, __v, ...rest }) => rest);
    res.json({ notifications: clean, total });
  } catch (err) {
    next(err);
  }
});

// =================== SEND ANNOUNCEMENT ===================

// POST /api/notifications/send
// body: { titre, message, canal: 'push'|'sms'|'both' }
router.post('/send', async (req, res, next) => {
  try {
    const { titre, message, canal = 'push' } = req.body;

    if (!titre || !message) {
      return res.status(400).json({ error: 'Titre et message requis' });
    }

    if (!['push', 'sms', 'both'].includes(canal)) {
      return res.status(400).json({ error: 'Canal invalide (push, sms, both)' });
    }

    const results = await notifService.notifyAll('annonce', titre, message, canal);

    const sent = results.filter(r => r.statut === 'envoyee').length;
    const failed = results.filter(r => r.statut === 'echec').length;

    res.json({
      success: true,
      sent,
      failed,
      total: results.length,
      details: results
    });
  } catch (err) {
    next(err);
  }
});

// =================== STATS ===================

// GET /api/notifications/stats
router.get('/stats', async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [totalMois, totalJour, parType, parCanal, echecs] = await Promise.all([
      Notification.countDocuments({ dateCreation: { $gte: monthStart } }),
      Notification.countDocuments({ dateCreation: { $gte: todayStart } }),
      Notification.aggregate([
        { $match: { dateCreation: { $gte: monthStart } } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Notification.aggregate([
        { $match: { dateCreation: { $gte: monthStart } } },
        { $group: { _id: '$canal', count: { $sum: 1 } } }
      ]),
      Notification.countDocuments({ dateCreation: { $gte: monthStart }, statut: 'echec' })
    ]);

    // Compter les SMS envoyes ce mois
    const smsMois = await Notification.countDocuments({
      dateCreation: { $gte: monthStart },
      smsSent: true
    });

    res.json({
      mois: {
        total: totalMois,
        echecs,
        sms: smsMois,
        coutEstimeSMS: Math.round(smsMois * 0.05 * 100) / 100 // ~0.05$ par SMS
      },
      aujourd_hui: totalJour,
      parType: parType.reduce((acc, t) => { acc[t._id] = t.count; return acc; }, {}),
      parCanal: parCanal.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {})
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
