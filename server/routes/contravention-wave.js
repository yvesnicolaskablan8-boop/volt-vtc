const express = require('express');
const authMiddleware = require('../middleware/auth');
const Contravention = require('../models/Contravention');

const router = express.Router();
router.use(authMiddleware);

// POST /api/contraventions/wave/checkout — Creer une session Wave Checkout pour payer une contravention
router.post('/wave/checkout', async (req, res, next) => {
  try {
    const { contraventionId } = req.body;

    if (!contraventionId) {
      return res.status(400).json({ error: 'contraventionId requis' });
    }

    const contravention = await Contravention.findOne({ id: contraventionId });
    if (!contravention) {
      return res.status(404).json({ error: 'Contravention non trouvee' });
    }

    if (contravention.statut === 'payee') {
      return res.status(400).json({ error: 'Contravention deja payee' });
    }

    const montant = contravention.montant;
    if (!montant || montant <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const waveApiKey = process.env.WAVE_API_KEY;
    if (!waveApiKey) {
      return res.status(500).json({ error: 'Wave API non configuree' });
    }

    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://volt-vtc-production.up.railway.app'
      : `http://localhost:${process.env.PORT || 3001}`;

    const waveResponse = await fetch('https://api.wave.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waveApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: String(montant),
        currency: 'XOF',
        client_reference: contraventionId,
        success_url: `${baseUrl}/#/contraventions?wave=success&id=${contraventionId}`,
        error_url: `${baseUrl}/#/contraventions?wave=error&id=${contraventionId}`
      })
    });

    if (!waveResponse.ok) {
      const errData = await waveResponse.json().catch(() => ({}));
      console.error('[Wave Contravention] Checkout error:', errData);
      return res.status(502).json({ error: errData.message || 'Erreur Wave' });
    }

    const waveSession = await waveResponse.json();

    // Sauvegarder le checkoutId sur la contravention
    contravention.waveCheckoutId = waveSession.id;
    await contravention.save();

    res.json({
      contraventionId,
      waveCheckoutId: waveSession.id,
      waveLaunchUrl: waveSession.wave_launch_url,
      montant
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
