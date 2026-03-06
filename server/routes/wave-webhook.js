const express = require('express');
const Versement = require('../models/Versement');
const Contravention = require('../models/Contravention');

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

    // Determiner si c'est un versement (VRS-) ou une contravention (CTR-)
    if (client_reference.startsWith('CTR-')) {
      // Contravention
      const contravention = await Contravention.findOne({
        $or: [
          { id: client_reference },
          { waveCheckoutId: id }
        ]
      });

      if (!contravention) {
        console.warn('[Wave Webhook] Contravention non trouvee pour', client_reference);
        return res.status(200).json({ received: true });
      }

      if (payment_status === 'succeeded' && contravention.statut !== 'payee') {
        contravention.statut = 'payee';
        contravention.moyenPaiement = 'wave';
        contravention.waveTransactionId = transaction_id || '';
        contravention.datePaiement = new Date().toISOString();
        await contravention.save();
        console.log('[Wave Webhook] Contravention payee:', contravention.id);
      }

      return res.status(200).json({ received: true });
    }

    // Versement (VRS- ou autre)
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
