/**
 * GET /api/yango/driver-stats?yangoDriverId=xxx&from=ISO&to=ISO
 * Per-driver revenue + activity stats from Yango
 */
const { verifyAuth, assertYangoCreds, yangoFetch, fetchAllTransactions, aggregateTransactions, setCors, handleOptions } = require('../_lib/helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { yangoDriverId } = req.query;
    if (!yangoDriverId) return res.status(400).json({ error: 'yangoDriverId requis' });

    const { parkId } = assertYangoCreds();

    // Default date range: today
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const from = req.query.from || `${todayStr}T00:00:00+00:00`;
    const to = req.query.to || now.toISOString();
    const isCustom = !!(req.query.from || req.query.to);

    // Safety timeout: 25 seconds max
    let partial = false;
    const safetyTimer = setTimeout(() => { partial = true; }, 25000);

    // 1) Fetch transactions
    let txAgg = { totalCA: 0, cash: 0, card: 0, commissionYango: 0, commissionPartenaire: 0 };
    let nbCourses = 0;
    let tempsActiviteMinutes = 0;

    try {
      if (!partial) {
        const allTx = await fetchAllTransactions(from, to, 5);
        txAgg = aggregateTransactions(allTx, yangoDriverId);
      }
    } catch (e) {
      console.warn('[driver-stats] Transactions error:', e.message);
    }

    // 2) Fetch orders for activity time
    try {
      if (!partial) {
        const ordersData = await yangoFetch('/v1/parks/orders/list', {
          limit: 500,
          query: {
            park: { id: parkId, order: {} }
          }
        });

        const orders = (ordersData.orders || []).filter(o => {
          const driverId = o.driver?.id || o.performer?.driver_id;
          if (driverId !== yangoDriverId) return false;
          const bookedAt = o.booked_at || '';
          return bookedAt >= from && bookedAt <= to;
        });

        // Count completed orders
        const completed = orders.filter(o =>
          ['complete', 'finished'].includes(o.status)
        );
        nbCourses = completed.length;

        // Sum activity time
        for (const o of completed) {
          if (o.started_at && o.ended_at) {
            const dur = (new Date(o.ended_at) - new Date(o.started_at)) / 60000;
            if (dur > 0 && dur < 480) { // cap at 8h
              tempsActiviteMinutes += dur;
            }
          }
        }

        // Fallback: if transactions gave 0 revenue, use order prices
        if (txAgg.totalCA === 0 && completed.length > 0) {
          let cash = 0, card = 0;
          for (const o of completed) {
            const price = parseFloat(o.price || 0);
            if (o.payment_method === 'cash' || o.payment_method === 'наличные') {
              cash += price;
            } else {
              card += price;
            }
          }
          txAgg = { ...txAgg, totalCA: cash + card, cash, card };
        }
      }
    } catch (e) {
      console.warn('[driver-stats] Orders error:', e.message);
    }

    clearTimeout(safetyTimer);

    res.json({
      yangoDriverId,
      totalCA: Math.round(txAgg.totalCA),
      totalCash: Math.round(txAgg.cash),
      totalCard: Math.round(txAgg.card),
      nbCourses,
      commissionYango: Math.round(txAgg.commissionYango),
      commissionPartenaire: Math.round(txAgg.commissionPartenaire),
      tempsActiviteMinutes: Math.round(tempsActiviteMinutes),
      derniereMaj: new Date().toISOString(),
      periode: { from, to, isCustom },
      ...(partial ? { partial: true } : {})
    });

  } catch (err) {
    console.error('[driver-stats] Error:', err.message);
    res.status(502).json({ error: 'Erreur stats chauffeur', details: err.message });
  }
};
