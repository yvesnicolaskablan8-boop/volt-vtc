/**
 * GET /api/yango/vehicles-all
 * Fetches ALL vehicles (paginated) for manual linking UI
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
    let allVehicles = [];
    const PAGE_SIZE = 100;
    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await yangoFetch('/v1/parks/cars/list', {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        query: { park: { id: parkId } }
      });

      const cars = data.cars || [];
      for (const c of cars) {
        allVehicles.push({
          id: c.id,
          marque: c.brand || '',
          modele: c.model || '',
          immatriculation: c.number || '',
          couleur: c.color || '',
          annee: c.year || 0,
          statut: c.status || 'unknown'
        });
      }

      if (cars.length < PAGE_SIZE) break;
    }

    res.json({ total: allVehicles.length, vehicles: allVehicles });

  } catch (err) {
    console.error('[vehicles-all] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
};
