/**
 * Tache Hooks — Notifications push + WhatsApp lors de creation/modification de taches
 *
 * Intercepte POST et PUT sur /api/taches pour envoyer des notifications
 * push et WhatsApp aux utilisateurs assignes.
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { sendPushToUser, sendWhatsAppToUser } = require('../utils/notification-service');
const Tache = require('../models/Tache');

const router = express.Router();
router.use(authMiddleware);

/**
 * Envoie push + WhatsApp a un utilisateur (fire-and-forget)
 */
function notifyUser(userId, titre, message, pushData = {}) {
  // Push
  sendPushToUser(userId, titre, message, pushData)
    .catch(err => console.warn('[TacheHook] Push error:', err.message));
  // WhatsApp
  sendWhatsAppToUser(userId, `${titre}\n${message}`)
    .catch(err => console.warn('[TacheHook] WhatsApp error:', err.message));
}

// POST /api/taches — Apres creation, notifier l'assigne
router.post('/', async (req, res, next) => {
  // Sauvegarder la response originale pour intercepter apres le CRUD
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    // Envoyer la notification en arriere-plan (fire-and-forget)
    try {
      const assigneA = req.body.assigneA;
      const creePar = req.body.creePar;
      const creeParNom = req.body.creeParNom || 'Quelqu\'un';
      const titre = req.body.titre || 'Nouvelle tache';

      // Ne notifier que si assigne a quelqu'un d'autre que le createur
      if (assigneA && assigneA !== creePar) {
        notifyUser(assigneA, 'Nouvelle tache', `${creeParNom} vous a assigne : "${titre}"`, {
          url: '/#/taches',
          type: 'tache_nouvelle'
        });
      }
    } catch (e) { /* silent */ }

    return originalJson(data);
  };
  next();
});

// PUT /api/taches/:id — Detecter changement de statut ou reassignation
router.put('/:id', async (req, res, next) => {
  try {
    // Lire l'etat actuel avant modification
    const before = await Tache.findOne({ id: req.params.id }).lean();
    if (!before) return next();

    const originalJson = res.json.bind(res);
    res.json = function (data) {
      try {
        const newAssigne = req.body.assigneA;
        const newStatut = req.body.statut;
        const session = req.user || {};

        // 1. Reassignation a un nouvel utilisateur
        if (newAssigne && newAssigne !== before.assigneA && newAssigne !== (session.userId || session.id)) {
          const assignerNom = session.nom || session.login || 'Quelqu\'un';
          notifyUser(newAssigne, 'Tache assignee', `${assignerNom} vous a assigne : "${before.titre}"`, {
            url: '/#/taches',
            type: 'tache_assignee'
          });
        }

        // 2. Prise en charge ("en_cours") — notifier le createur
        if (newStatut === 'en_cours' && before.statut === 'a_faire' && before.creePar) {
          const preneurNom = req.body.assigneANom || session.nom || 'Quelqu\'un';
          if (before.creePar !== (session.userId || session.id)) {
            notifyUser(before.creePar, 'Tache prise en charge', `${preneurNom} s'occupe de "${before.titre}"`, {
              url: '/#/taches',
              type: 'tache_en_cours'
            });
          }
        }

        // 3. Terminee — notifier le createur
        if (newStatut === 'terminee' && before.statut !== 'terminee' && before.creePar) {
          const finisseurNom = req.body.assigneANom || session.nom || 'Quelqu\'un';
          if (before.creePar !== (session.userId || session.id)) {
            notifyUser(before.creePar, 'Tache terminee', `${finisseurNom} a termine "${before.titre}"`, {
              url: '/#/taches',
              type: 'tache_terminee'
            });
          }
        }
      } catch (e) { /* silent */ }

      return originalJson(data);
    };
  } catch (e) { /* silent */ }
  next();
});

module.exports = router;
