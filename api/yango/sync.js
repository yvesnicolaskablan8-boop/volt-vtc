/**
 * POST /api/yango/sync
 * Triggers a Yango ↔ Pilote data sync
 * Body: { date?: 'YYYY-MM-DD' }
 *
 * Fetches Yango driver stats and matches them to Pilote chauffeurs in Supabase,
 * creating/updating versements for each linked driver.
 */
const {
  verifyAuth, getToken, assertYangoCreds, yangoFetch,
  supabaseQuery, fetchAllTransactions, aggregateTransactions,
  setCors, handleOptions, SUPABASE_URL, SUPABASE_ANON_KEY
} = require('../_lib/helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = assertYangoCreds();
    const token = getToken(req);
    const syncDate = req.body?.date || null;

    // Determine date range
    let targetDate;
    if (syncDate) {
      targetDate = syncDate;
    } else {
      // Default: yesterday
      const d = new Date();
      d.setDate(d.getDate() - 1);
      targetDate = d.toISOString().slice(0, 10);
    }

    const from = `${targetDate}T00:00:00+00:00`;
    const to = `${targetDate}T23:59:59+00:00`;

    // 1) Get Pilote chauffeurs linked to Yango
    const chauffeurs = await supabaseQuery(
      'fleet_chauffeurs',
      'yango_driver_id=not.is.null&yango_driver_id=neq.&select=id,prenom,nom,yango_driver_id,vehicule_id',
      token
    );

    if (!chauffeurs.length) {
      return res.json({ success: true, message: 'Aucun chauffeur lie a Yango', matched: 0 });
    }

    // 2) Fetch all transactions for the target date
    const transactions = await fetchAllTransactions(from, to, 5);

    // 3) Fetch orders for activity time
    let allOrders = [];
    try {
      const ordersData = await yangoFetch('/v1/parks/orders/list', {
        limit: 500,
        query: { park: { id: parkId, order: { booked_at: { from, to } } } }
      });
      allOrders = ordersData.orders || [];
    } catch { /* ignore */ }

    // 4) Match: for each Pilote chauffeur, compute their Yango stats
    let matched = 0;
    const results = [];

    for (const ch of chauffeurs) {
      const yangoId = ch.yango_driver_id;
      const agg = aggregateTransactions(transactions, yangoId);

      // Count orders and activity time
      const driverOrders = allOrders.filter(o => {
        const dId = o.driver?.id || o.performer?.driver_id;
        return dId === yangoId;
      });
      const completed = driverOrders.filter(o => ['complete', 'finished'].includes(o.status));
      let activiteMinutes = 0;
      for (const o of completed) {
        if (o.started_at && o.ended_at) {
          const dur = (new Date(o.ended_at) - new Date(o.started_at)) / 60000;
          if (dur > 0 && dur < 480) activiteMinutes += dur;
        }
      }

      if (agg.totalCA > 0 || completed.length > 0) {
        matched++;
        results.push({
          chauffeurId: ch.id,
          nom: `${ch.prenom || ''} ${ch.nom || ''}`.trim(),
          yangoDriverId: yangoId,
          totalCA: Math.round(agg.totalCA),
          nbCourses: completed.length,
          activiteMinutes: Math.round(activiteMinutes),
          cash: Math.round(agg.cash),
          card: Math.round(agg.card)
        });

        // 5) Upsert versement in Supabase
        try {
          const versementId = `YANGO-${ch.id}-${targetDate}`;
          const versement = {
            id: versementId,
            chauffeur_id: ch.id,
            vehicule_id: ch.vehicule_id || null,
            date: targetDate,
            montant: Math.round(agg.totalCA),
            montant_cash: Math.round(agg.cash),
            montant_carte: Math.round(agg.card),
            commission_yango: Math.round(agg.commissionYango),
            nb_courses: completed.length,
            temps_activite: Math.round(activiteMinutes),
            source: 'yango_sync',
            statut: 'valide',
            updated_at: new Date().toISOString()
          };

          await fetch(`${SUPABASE_URL}/rest/v1/fleet_versements`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(versement)
          });
        } catch (e) {
          console.warn(`[sync] Versement upsert error for ${ch.id}:`, e.message);
        }
      }
    }

    res.json({
      success: true,
      date: targetDate,
      totalChauffeurs: chauffeurs.length,
      matched,
      matchedCount: matched,
      results
    });

  } catch (err) {
    console.error('[sync] Error:', err.message);
    if (err.message?.includes('credentials')) {
      return res.status(503).json({ error: 'Yango credentials non configurees', details: err.message });
    }
    res.status(502).json({ error: 'Erreur sync Yango', details: err.message });
  }
};
