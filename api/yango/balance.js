const { withYango, yangoPost } = require('../_lib/yango');

/**
 * GET /api/yango/balance?driver_id=xxx
 * Fetches a single driver's balance from Yango.
 */
module.exports = withYango(async (req, res, creds) => {
  const driverId = req.query.driver_id;
  if (!driverId) {
    return res.status(400).json({ error: 'driver_id requis' });
  }

  const data = await yangoPost('/v1/parks/driver-profiles/list', {
    limit: 1,
    offset: 0,
    park_id: creds.parkId,
    fields: {
      account: ['balance', 'currency'],
      driver_profile: ['id', 'first_name', 'last_name'],
    },
    query: { park: { driver_profile: { id: [driverId] } } },
  }, creds);

  const profiles = data.driver_profiles || [];
  if (!profiles.length) {
    return res.status(404).json({ error: 'Chauffeur non trouvé dans Yango' });
  }

  const p = profiles[0];
  const acc = (p.accounts || [])[0] || {};

  res.json({
    driver_id: driverId,
    balance: acc.balance || '0',
    currency: acc.currency || 'XOF',
    nom: `${(p.driver_profile || {}).first_name || ''} ${(p.driver_profile || {}).last_name || ''}`.trim(),
  });
});
