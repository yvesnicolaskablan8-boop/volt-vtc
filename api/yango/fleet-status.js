/**
 * GET /api/yango/fleet-status
 * Real-time fleet status: counts of drivers by status
 */
const { verifyAuth, assertYangoCreds, yangoFetch, setCors, handleOptions } = require('../_lib/helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = assertYangoCreds();

    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        driver_profile: ['id', 'first_name', 'last_name'],
        current_status: ['status']
      },
      limit: 300,
      offset: 0,
      query: { park: { id: parkId } }
    });

    const profiles = data.driver_profiles || [];
    const counts = { free: 0, busy: 0, in_order: 0, offline: 0 };
    const drivers = [];

    for (const p of profiles) {
      const dp = p.driver_profile || {};
      const status = (p.current_status || {}).status || 'offline';

      if (counts[status] !== undefined) counts[status]++;
      else counts.offline++;

      // Only include non-offline drivers in the list
      if (status !== 'offline') {
        drivers.push({
          id: dp.id,
          nom: [dp.first_name, dp.last_name].filter(Boolean).join(' '),
          status
        });
      }
    }

    const enLigne = counts.free + counts.busy + counts.in_order;

    res.json({
      counts,
      disponible: counts.free,
      commandeActive: counts.in_order,
      occupe: counts.busy,
      horsLigne: counts.offline,
      total: profiles.length,
      enLigne,
      drivers
    });

  } catch (err) {
    console.error('[fleet-status] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
};
