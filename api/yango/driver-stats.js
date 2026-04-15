const { withYango, yangoPost } = require('../_lib/yango');

/**
 * GET /api/yango/driver-stats?driver_id=xxx&from=ISO&to=ISO
 * Revenue + activity for a single driver. Defaults to today.
 */
module.exports = withYango(async (req, res, creds) => {
  const yangoDriverId = req.query.driver_id;
  if (!yangoDriverId) {
    return res.status(400).json({ error: 'driver_id requis' });
  }

  const now = new Date();
  const customFrom = req.query.from ? new Date(req.query.from) : null;
  const customTo = req.query.to ? new Date(req.query.to) : null;
  const isCustom = customFrom && !isNaN(customFrom.getTime());

  const from = isCustom
    ? customFrom.toISOString()
    : new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const to = (customTo && !isNaN(customTo.getTime()))
    ? customTo.toISOString()
    : now.toISOString();

  let totalCA = 0, totalCash = 0, totalCard = 0;
  let nbCourses = 0, commissionYango = 0, commissionPartenaire = 0;
  let tempsActiviteMinutes = 0;

  // ---- 1. Try transactions first (most accurate) ----
  try {
    const allTransactions = [];
    let cursor = '';
    let pageCount = 0;

    do {
      const body = {
        query: { park: { id: creds.parkId, transaction: { event_at: { from, to } } } },
        limit: 1000,
      };
      if (cursor) body.cursor = cursor;

      const data = await yangoPost('/v2/parks/transactions/list', body, creds, { timeout: 20000 });
      allTransactions.push(...(data.transactions || []));
      cursor = data.cursor || '';
      pageCount++;
    } while (cursor && pageCount < 10);

    // Filter client-side (API filter unreliable)
    const driverTxns = allTransactions.filter(t => t.driver_profile_id === yangoDriverId);

    if (driverTxns.length > 0) {
      const revenueCats = new Set(['cash_collected', 'partner_ride_cash_collected']);
      const cardCats = new Set(['card', 'partner_ride_card', 'ewallet_payment', 'terminal_payment']);
      const commYangoCats = new Set(['platform_ride_fee', 'platform_ride_vat']);
      const commPartnerCats = new Set(['partner_ride_fee']);
      const cashOrders = new Set();
      const cardOrders = new Set();
      let firstEvent = null, lastEvent = null;

      for (const t of driverTxns) {
        const amount = parseFloat(t.amount || 0);
        const catId = t.category_id || '';

        if (t.event_at && t.order_id) {
          const d = new Date(t.event_at);
          if (!isNaN(d.getTime())) {
            if (!firstEvent || d < firstEvent) firstEvent = d;
            if (!lastEvent || d > lastEvent) lastEvent = d;
          }
        }

        if (revenueCats.has(catId)) {
          totalCash += amount;
          if (t.order_id) cashOrders.add(t.order_id);
        } else if (cardCats.has(catId)) {
          totalCard += amount;
          if (t.order_id) cardOrders.add(t.order_id);
        } else if (commYangoCats.has(catId)) {
          commissionYango += Math.abs(amount);
        } else if (commPartnerCats.has(catId)) {
          commissionPartenaire += Math.abs(amount);
        }
      }

      totalCA = totalCash + totalCard;
      nbCourses = cashOrders.size + cardOrders.size;

      if (firstEvent && lastEvent && firstEvent < lastEvent) {
        tempsActiviteMinutes = Math.round((lastEvent - firstEvent) / 60000);
        if (tempsActiviteMinutes > 1440) tempsActiviteMinutes = 0;
      }
    }
  } catch (e) {
    console.warn('driver-stats: transactions failed, falling back to orders:', e.message);
  }

  // ---- 2. Always fetch orders for activity time + fallback CA ----
  try {
    const ordersData = await yangoPost('/v1/parks/orders/list', {
      limit: 500,
      query: { park: { id: creds.parkId, order: { booked_at: { from, to } } } },
    }, creds, { timeout: 15000 });

    const driverOrders = (ordersData.orders || []).filter(o => o.driver && o.driver.id === yangoDriverId);
    const completed = driverOrders.filter(o => o.status === 'complete');

    // Activity time from completed orders
    let orderMinutes = 0;
    for (const order of completed) {
      const start = order.started_at || order.transporting_at || order.driving_at || order.booked_at;
      const end = order.ended_at || order.completed_at || order.finished_at;
      if (start && end) {
        const diff = (new Date(end) - new Date(start)) / 60000;
        if (diff > 0 && diff < 480) orderMinutes += diff;
      }
    }
    if (orderMinutes > 0 && tempsActiviteMinutes === 0) {
      tempsActiviteMinutes = Math.round(orderMinutes);
    }

    // Fallback CA from orders if transactions returned nothing
    if (totalCA === 0 && nbCourses === 0) {
      nbCourses = completed.length;
      for (const order of completed) {
        const price = parseFloat(order.price || 0);
        totalCA += price;
        if (order.payment_method === 'cash' || order.payment_method === 'corp') {
          totalCash += price;
        } else {
          totalCard += price;
        }
      }
    }
  } catch (e) {
    console.warn('driver-stats: orders failed:', e.message);
  }

  res.json({
    yangoDriverId,
    totalCA: Math.round(totalCA),
    totalCash: Math.round(totalCash),
    totalCard: Math.round(totalCard),
    nbCourses,
    commissionYango: Math.round(commissionYango),
    commissionPartenaire: Math.round(commissionPartenaire),
    tempsActiviteMinutes,
    derniereMaj: now.toISOString(),
    periode: { from, to, isCustom: !!isCustom },
  });
});
