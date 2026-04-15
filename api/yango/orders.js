const { withYango, yangoPost } = require('../_lib/yango');

/**
 * GET /api/yango/orders?from=ISO&to=ISO
 * Fetches orders for a date range.
 */
module.exports = withYango(async (req, res, creds) => {
  const now = new Date();
  const from = req.query.from || new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const to = req.query.to || now.toISOString();

  const data = await yangoPost('/v1/parks/orders/list', {
    limit: 500,
    park_id: creds.parkId,
    query: {
      park: { order: {
        booked_at: { from, to },
        status: ['complete', 'cancelled', 'driving', 'waiting', 'transporting'],
      }},
    },
  }, creds);

  const orders = (data.orders || []).map(o => ({
    id: o.id,
    status: o.status,
    price: parseFloat(o.price) || 0,
    payment_method: o.payment_method || '',
    booked_at: o.booked_at,
    driver: o.driver ? {
      id: o.driver.id,
      first_name: o.driver.first_name || '',
      last_name: o.driver.last_name || '',
    } : null,
    depart: (o.route || [])[0]?.address?.fullname || '',
    arrivee: (o.route || [])[1]?.address?.fullname || '',
  }));

  res.json({ total: orders.length, orders, periode: { from, to } });
});
