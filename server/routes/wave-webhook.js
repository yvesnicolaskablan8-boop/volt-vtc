const express = require('express');
const Versement = require('../models/Versement');

const router = express.Router();

// POST /api/wave/webhook — Callback Wave apres paiement
// Pas d'auth middleware car Wave appelle directement ce endpoint
router.post('/webhook', async (req, res) => {
  try {
    const { id, checkout_status, payment_status, transaction_id, client_reference, amount } = req.body;

    console.log('[Wave Webhook]', JSON.stringify({ id, checkout_status, payment_status, transaction_id, client_reference }));

    if (!client_reference) {
      return res.status(200).json({ received: true });
    }

    // Trouver le versement correspondant
    const versement = await Versement.findOne({
      $or: [
        { id: client_reference },
        { waveCheckoutId: id }
      ]
    });

    if (!versement) {
      console.warn('[Wave Webhook] Versement non trouve pour', client_reference);
      return res.status(200).json({ received: true });
    }

    if (payment_status === 'succeeded') {
      versement.statut = 'valide';
      versement.montantVerse = versement.montantNet;
      versement.waveTransactionId = transaction_id || '';
      versement.referencePaiement = transaction_id || '';
      versement.dateValidation = new Date().toISOString();
      await versement.save();
      console.log('[Wave Webhook] Versement valide:', versement.id);
    } else if (payment_status === 'cancelled') {
      // Supprimer le versement en attente si le paiement est annule
      if (versement.statut === 'en_attente') {
        await Versement.deleteOne({ id: versement.id });
        console.log('[Wave Webhook] Versement supprime (paiement annule):', versement.id);
      }
    } else if (checkout_status === 'expired') {
      if (versement.statut === 'en_attente') {
        await Versement.deleteOne({ id: versement.id });
        console.log('[Wave Webhook] Versement supprime (session expiree):', versement.id);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Wave Webhook] Erreur:', err.message);
    res.status(200).json({ received: true });
  }
});

module.exports = router;
