/**
 * POST /api/yango/recharge
 * Recharge (or debit) a driver's Yango balance
 * Body: { chauffeurId, amount, description? }
 */
const { verifyAuth, getToken, supabaseQuery, assertYangoCreds, setCors, handleOptions, YANGO_BASE } = require('../_lib/helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { chauffeurId, amount, description } = req.body;

    if (!chauffeurId || !amount) {
      return res.status(400).json({ error: 'chauffeurId et amount requis' });
    }

    const montant = parseFloat(amount);
    if (isNaN(montant) || montant === 0) {
      return res.status(400).json({ error: 'Le montant doit etre un nombre non nul' });
    }

    // Look up chauffeur in Supabase
    const token = getToken(req);
    const chauffeurs = await supabaseQuery(
      'fleet_chauffeurs',
      `id=eq.${encodeURIComponent(chauffeurId)}&select=id,prenom,nom,yango_driver_id`,
      token
    );
    const chauffeur = chauffeurs[0];
    if (!chauffeur) return res.status(404).json({ error: 'Chauffeur introuvable' });
    if (!chauffeur.yango_driver_id) {
      return res.status(400).json({ error: "Ce chauffeur n'est pas lie a un profil Yango" });
    }

    const { parkId, apiKey, clientId } = assertYangoCreds();

    // Idempotency token
    const idempotencyToken = `pilote-recharge-${chauffeurId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const body = {
      amount: montant.toFixed(4),
      category_id: 'partner_service_manual',
      description: description || `Recharge Pilote — ${chauffeur.prenom} ${chauffeur.nom}`,
      driver_profile_id: chauffeur.yango_driver_id,
      park_id: parkId
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${YANGO_BASE}/v2/parks/driver-profiles/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': clientId,
        'X-API-Key': apiKey,
        'X-Idempotency-Token': idempotencyToken,
        'Accept-Language': 'fr'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: `Erreur Yango: ${response.status}`,
        details: text.substring(0, 300)
      });
    }

    let result;
    try { result = JSON.parse(text); } catch { result = { raw: text.substring(0, 200) }; }

    res.json({
      success: true,
      message: `${montant > 0 ? 'Recharge' : 'Debit'} de ${Math.abs(montant)} XOF effectue pour ${chauffeur.prenom} ${chauffeur.nom}`,
      transaction: result,
      idempotencyToken
    });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout — Yango API ne repond pas' });
    }
    console.error('[Yango Recharge] Error:', err.message);
    res.status(502).json({ error: 'Erreur lors de la recharge', details: err.message });
  }
};
