const { assertYangoCreds, yangoFetch, setCors, handleOptions } = require('../_lib/helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;

  try {
    const { parkId } = assertYangoCreds();
    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      limit: 1,
      offset: 0,
      fields: { account: [], car: [], driver_profile: ['id'] },
      query: { park: { id: parkId } },
    });

    res.json({
      success: true,
      message: `Connexion reussie — ${data.total || 0} chauffeurs dans le parc`,
      total: data.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
