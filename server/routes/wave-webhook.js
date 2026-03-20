const express = require('express');
const crypto = require('crypto');
const Versement = require('../models/Versement');
const Contravention = require('../models/Contravention');
const { getWaveApiKey } = require('../utils/get-integration-keys');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/wave/webhook — Callback Wave apres paiement
// Verification de signature Wave si WAVE_WEBHOOK_SECRET est configure
router.post('/webhook', async (req, res) => {
  try {
    // Verify Wave webhook signature if secret is configured
    const webhookSecret = process.env.WAVE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['wave-signature'] || req.headers['x-wave-signature'] || '';
      if (!signature) {
        console.warn('[Wave Webhook] Requete sans signature — rejetee');
        return res.status(403).json({ error: 'Missing signature' });
      }
      const payload = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        console.warn('[Wave Webhook] Signature invalide — rejetee');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

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

// POST /api/wave/check-pending — Verification manuelle des paiements en attente (admin)
router.post('/check-pending', authMiddleware, async (req, res) => {
  try {
    const { checkPendingPayments } = require('../utils/wave-cron');
    const waveApiKey = await getWaveApiKey();
    if (!waveApiKey) {
      return res.status(500).json({ error: 'WAVE_API_KEY non configuree' });
    }
    await checkPendingPayments();
    res.json({ success: true, message: 'Verification terminee' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
