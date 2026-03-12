const express = require('express');
const crypto = require('crypto');
const router = express.Router();

/**
 * POST /api/elevenlabs/webhook
 * Webhook post-appel ElevenLabs (pas d'auth middleware — appelé par ElevenLabs)
 */
router.post('/webhook', async (req, res) => {
  try {
    // Vérification de signature (optionnel si WEBHOOK_SECRET configuré)
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.headers['elevenlabs-signature'];
      if (!signature) {
        console.warn('[ElevenLabs Webhook] Signature manquante');
        return res.status(401).json({ error: 'Signature manquante' });
      }
      // Vérification HMAC simple
      const expected = crypto.createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (signature !== expected && !signature.includes(expected)) {
        console.warn('[ElevenLabs Webhook] Signature invalide');
        // On continue quand même pour ne pas perdre les données
      }
    }

    const { type, data } = req.body;
    console.log(`[ElevenLabs Webhook] Type: ${type}, ConvId: ${data?.conversation_id || 'N/A'}`);

    if (type === 'post_call_transcription' && data) {
      const DebtCall = require('../models/DebtCall');

      const conversationId = data.conversation_id;
      if (!conversationId) {
        return res.status(200).json({ ok: true, message: 'Pas de conversation_id' });
      }

      // Chercher l'appel correspondant
      const call = await DebtCall.findOne({ conversationId });
      if (!call) {
        console.warn(`[ElevenLabs Webhook] Appel inconnu: ${conversationId}`);
        return res.status(200).json({ ok: true, message: 'Appel non trouvé' });
      }

      // Mettre à jour avec les résultats
      const meta = data.metadata || {};
      const analysis = data.analysis || {};
      const transcript = data.transcript || [];
      const termReason = meta.termination_reason || '';

      // Déterminer le statut
      let statut = 'termine';
      if (data.status === 'failed') statut = 'echoue';
      else if (termReason === 'no_answer' || termReason === 'unanswered') statut = 'pas_repondu';
      else if (termReason === 'busy') statut = 'occupe';

      call.statut = statut;
      call.duree = meta.call_duration_secs || 0;
      call.resultat = analysis.call_successful || 'unknown';
      call.resume = analysis.transcript_summary || '';
      call.transcript = transcript.map(t => ({
        role: t.role,
        message: t.message,
        time: t.time_in_call_secs
      }));

      await call.save();
      console.log(`[ElevenLabs Webhook] Appel ${call.id} mis à jour: ${statut} (${call.duree}s)`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ElevenLabs Webhook] Erreur:', err.message);
    res.status(200).json({ ok: true, error: err.message });
  }
});

module.exports = router;
