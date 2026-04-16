/**
 * GET /api/yango/vehicles
 * Lists vehicles in the Yango park (single page)
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

    const data = await yangoFetch('/v1/parks/cars/list', {
      limit: 100,
      query: { park: { id: parkId } }
    });

    const vehicles = (data.cars || []).map(c => ({
      id: c.id,
      marque: c.brand || '',
      modele: c.model || '',
      couleur: c.color || '',
      immatriculation: c.number || '',
      annee: c.year || 0,
      statut: c.status || 'unknown',
      callsign: c.callsign || ''
    }));

    res.json({ total: vehicles.length, vehicles });

  } catch (err) {
    console.error('[vehicles] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
};
