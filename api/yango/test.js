const { withYango, yangoPost } = require('../_lib/yango');

module.exports = withYango(async (req, res, creds) => {
  // Quick test: fetch 1 driver to verify credentials work
  const data = await yangoPost('/v1/parks/driver-profiles/list', {
    limit: 1,
    offset: 0,
    park_id: creds.parkId,
    fields: { account: [], car: [], driver_profile: ['id'] },
  }, creds, { timeout: 10000 });

  res.json({
    success: true,
    message: `Connexion reussie — ${data.total || 0} chauffeurs dans le parc`,
    total: data.total || 0,
  });
});
