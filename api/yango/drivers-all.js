/**
 * GET /api/yango/drivers-all
 * Fetches ALL drivers (paginated) for manual linking UI
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
    let allDrivers = [];
    const PAGE_SIZE = 300;
    const MAX_PAGES = 10;

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await yangoFetch('/v1/parks/driver-profiles/list', {
        fields: {
          driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_status']
        },
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        query: { park: { id: parkId } }
      });

      const profiles = data.driver_profiles || [];
      for (const p of profiles) {
        const dp = p.driver_profile || {};
        allDrivers.push({
          id: dp.id,
          prenom: dp.first_name || '',
          nom: dp.last_name || '',
          telephone: (dp.phones || [])[0] || '',
          workStatus: dp.work_status || '',
          statut: dp.work_status || 'unknown'
        });
      }

      if (profiles.length < PAGE_SIZE) break;
    }

    res.json({ total: allDrivers.length, drivers: allDrivers });

  } catch (err) {
    console.error('[drivers-all] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
};
