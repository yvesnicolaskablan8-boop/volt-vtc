const { withYango, yangoPost } = require('../_lib/yango');

/**
 * GET /api/yango/vehicles
 * Fetches all Yango vehicles for linking to local fleet.
 */
module.exports = withYango(async (req, res, creds) => {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const allVehicles = [];
  let offset = 0;
  const LIMIT = 100;
  const MAX_PAGES = 5;
  let page = 0;

  do {
    const data = await yangoPost('/v1/parks/cars/list', {
      limit: LIMIT,
      offset,
      query: { park: { id: creds.parkId } },
    }, creds);

    const cars = data.cars || [];
    for (const car of cars) {
      allVehicles.push({
        id: car.id || '',
        marque: car.brand || '',
        modele: car.model || '',
        immatriculation: car.number || '',
        couleur: car.color || '',
        annee: car.year || '',
        statut: car.status || '',
      });
    }

    if (cars.length < LIMIT) break;
    offset += LIMIT;
    page++;
  } while (page < MAX_PAGES);

  res.json({ total: allVehicles.length, vehicles: allVehicles });
});
