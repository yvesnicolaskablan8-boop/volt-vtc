/**
 * GET /api/yango/orders?from=ISO&to=ISO
 * Lists orders for the given date range (defaults to today)
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
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const from = req.query.from || `${todayStr}T00:00:00+00:00`;
    const to = req.query.to || now.toISOString();

    const data = await yangoFetch('/v1/parks/orders/list', {
      limit: 100,
      query: {
        park: {
          id: parkId,
          order: {
            booked_at: { from, to }
          }
        }
      }
    });

    const orders = (data.orders || []).map(o => {
      const started = o.started_at ? new Date(o.started_at) : null;
      const ended = o.ended_at ? new Date(o.ended_at) : null;
      const dureeMinutes = (started && ended) ? Math.round((ended - started) / 60000) : 0;

      return {
        id: o.id,
        statut: o.status || 'unknown',
        chauffeurId: o.driver?.id || o.performer?.driver_id || '',
        chauffeurNom: [o.driver?.first_name, o.driver?.last_name].filter(Boolean).join(' ') || '',
        montant: parseFloat(o.price || 0),
        depart: o.route?.[0]?.fullname || o.source || '',
        arrivee: o.route?.[1]?.fullname || o.destination || '',
        dureeMinutes,
        dateReservation: o.booked_at || '',
        modePaiement: o.payment_method || ''
      };
    });

    const totalCA = orders.reduce((sum, o) => sum + o.montant, 0);
    const coursesEnCours = orders.filter(o =>
      ['driving', 'transporting', 'waiting'].includes(o.statut)
    ).length;

    res.json({ total: orders.length, orders, chiffreAffaires: totalCA, coursesEnCours });

  } catch (err) {
    console.error('[orders] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
};
