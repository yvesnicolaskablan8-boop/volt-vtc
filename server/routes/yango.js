/**
 * Yango Fleet API Proxy Routes
 *
 * Proxies requests to the Yango (Yandex Taxi) Fleet API
 * Base URL: https://fleet-api.taxi.yandex.net
 * Auth: X-Client-ID + X-API-Key headers
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// All Yango routes require authentication
router.use(authMiddleware);

const YANGO_BASE = 'https://fleet-api.taxi.yandex.net';

// Helper: make Yango API call
async function yangoFetch(endpoint, body = {}) {
  const parkId = process.env.YANGO_PARK_ID;
  const apiKey = process.env.YANGO_API_KEY;
  const clientId = process.env.YANGO_CLIENT_ID;

  if (!parkId || !apiKey || !clientId) {
    throw new Error('Yango API credentials not configured');
  }

  const res = await fetch(`${YANGO_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-ID': clientId,
      'X-API-Key': apiKey,
      'Accept-Language': 'fr'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yango API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * GET /api/yango/drivers
 * Fetches all driver profiles with their current status, vehicle, and account balance
 */
router.get('/drivers', async (req, res) => {
  try {
    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        account: ['balance', 'currency'],
        car: ['brand', 'model', 'color', 'number', 'year', 'category'],
        current_status: ['status', 'status_updated_at'],
        driver_profile: [
          'id', 'first_name', 'last_name', 'phones', 'created_date',
          'driver_license', 'hire_date', 'work_status'
        ]
      },
      limit: 500,
      offset: 0,
      query: {
        park: {
          id: process.env.YANGO_PARK_ID
        }
      },
      sort_order: [
        { direction: 'asc', field: 'driver_profile.last_name' }
      ]
    });

    // Map to simplified format
    const drivers = (data.driver_profiles || []).map(dp => ({
      id: dp.driver_profile?.id || '',
      prenom: dp.driver_profile?.first_name || '',
      nom: dp.driver_profile?.last_name || '',
      telephone: dp.driver_profile?.phones?.[0] || '',
      statut: mapDriverStatus(dp.current_status?.status),
      statutRaw: dp.current_status?.status || 'offline',
      derniereMaj: dp.current_status?.status_updated_at || null,
      workStatus: dp.driver_profile?.work_status || '',
      balance: dp.accounts?.[0]?.balance || '0',
      devise: dp.accounts?.[0]?.currency || 'XOF',
      vehicule: dp.car ? {
        marque: dp.car.brand || '',
        modele: dp.car.model || '',
        couleur: dp.car.color || '',
        immatriculation: dp.car.number || '',
        annee: dp.car.year || '',
        categorie: dp.car.category || []
      } : null,
      dateCreation: dp.driver_profile?.created_date || null,
      dateEmbauche: dp.driver_profile?.hire_date || null,
      permis: dp.driver_profile?.driver_license || null
    }));

    res.json({
      total: data.total || drivers.length,
      drivers,
      online: drivers.filter(d => d.statut === 'en_ligne').length,
      busy: drivers.filter(d => d.statut === 'occupe').length,
      offline: drivers.filter(d => d.statut === 'hors_ligne').length
    });
  } catch (err) {
    console.error('Yango drivers error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
});

/**
 * GET /api/yango/orders?from=ISO_DATE&to=ISO_DATE
 * Fetches orders/trips for a given period
 */
router.get('/orders', async (req, res) => {
  try {
    const now = new Date();
    const from = req.query.from || new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const to = req.query.to || now.toISOString();

    const data = await yangoFetch('/v1/parks/orders/list', {
      limit: 500,
      query: {
        park: {
          id: process.env.YANGO_PARK_ID,
          order: {
            booked_at: {
              from: from,
              to: to
            }
          }
        }
      }
    });

    const orders = (data.orders || []).map(o => ({
      id: o.id || '',
      statut: o.status || '',
      chauffeurId: o.driver?.id || '',
      chauffeurNom: o.driver ? `${o.driver.first_name || ''} ${o.driver.last_name || ''}`.trim() : '',
      vehiculeImmat: o.car?.number || '',
      depart: o.route?.[0]?.address || '',
      arrivee: o.route?.[1]?.address || o.route?.[o.route?.length - 1]?.address || '',
      montant: parseFloat(o.price || o.cost?.total || 0),
      devise: o.currency || 'XOF',
      dateReservation: o.booked_at || '',
      dateDebut: o.started_at || '',
      dateFin: o.ended_at || '',
      duree: o.duration || 0,
      distance: o.distance || 0,
      categorie: o.category || ''
    }));

    // Calculs agrégés
    const totalCA = orders.reduce((sum, o) => sum + o.montant, 0);
    const completedOrders = orders.filter(o =>
      o.statut === 'complete' || o.statut === 'finished' || o.statut === 'transporting'
    );

    res.json({
      total: data.total || orders.length,
      orders,
      chiffreAffaires: totalCA,
      coursesTerminees: completedOrders.length,
      coursesEnCours: orders.filter(o => o.statut === 'driving' || o.statut === 'transporting' || o.statut === 'waiting').length
    });
  } catch (err) {
    console.error('Yango orders error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
});

/**
 * GET /api/yango/vehicles
 * Fetches all vehicles registered in the park
 */
router.get('/vehicles', async (req, res) => {
  try {
    const data = await yangoFetch('/v1/parks/cars/list', {
      limit: 500,
      offset: 0,
      query: {
        park: {
          id: process.env.YANGO_PARK_ID
        }
      }
    });

    const vehicles = (data.cars || []).map(car => ({
      id: car.id || '',
      marque: car.brand || '',
      modele: car.model || '',
      couleur: car.color || '',
      immatriculation: car.number || '',
      annee: car.year || '',
      vin: car.vin || '',
      statut: car.status || '',
      categorie: car.category || [],
      callsign: car.callsign || ''
    }));

    res.json({
      total: data.total || vehicles.length,
      vehicles
    });
  } catch (err) {
    console.error('Yango vehicles error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
});

/**
 * GET /api/yango/transactions?from=ISO_DATE&to=ISO_DATE&driver_id=DRIVER_ID
 * Fetches financial transactions
 */
router.get('/transactions', async (req, res) => {
  try {
    const now = new Date();
    const from = req.query.from || new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const to = req.query.to || now.toISOString();

    const body = {
      limit: 500,
      query: {
        park: {
          id: process.env.YANGO_PARK_ID,
          transaction: {
            event_at: {
              from: from,
              to: to
            }
          }
        }
      }
    };

    // Optional: filter by driver
    if (req.query.driver_id) {
      body.query.park.driver_profile = { id: req.query.driver_id };
    }

    const data = await yangoFetch('/v2/parks/driver-profiles/transactions/list', body);

    const transactions = (data.transactions || []).map(t => ({
      id: t.id || '',
      chauffeurId: t.driver_profile_id || '',
      montant: parseFloat(t.amount || 0),
      categorie: t.category_name || t.category_id || '',
      description: t.description || '',
      date: t.event_at || '',
      devise: t.currency || 'XOF'
    }));

    const totalRevenu = transactions
      .filter(t => t.montant > 0)
      .reduce((sum, t) => sum + t.montant, 0);
    const totalDepenses = transactions
      .filter(t => t.montant < 0)
      .reduce((sum, t) => sum + Math.abs(t.montant), 0);

    res.json({
      total: data.total || transactions.length,
      transactions,
      totalRevenu,
      totalDepenses,
      soldeNet: totalRevenu - totalDepenses
    });
  } catch (err) {
    console.error('Yango transactions error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
});

/**
 * GET /api/yango/stats
 * Aggregated stats endpoint: combines drivers + orders for quick dashboard view
 */
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Fetch drivers and today's orders in parallel
    const [driversData, ordersToday, ordersMonth] = await Promise.all([
      yangoFetch('/v1/parks/driver-profiles/list', {
        fields: {
          account: ['balance'],
          current_status: ['status', 'status_updated_at'],
          driver_profile: ['id', 'first_name', 'last_name', 'work_status']
        },
        limit: 500,
        offset: 0,
        query: { park: { id: process.env.YANGO_PARK_ID } },
        sort_order: [{ direction: 'asc', field: 'driver_profile.last_name' }]
      }),
      yangoFetch('/v1/parks/orders/list', {
        limit: 500,
        query: {
          park: {
            id: process.env.YANGO_PARK_ID,
            order: { booked_at: { from: todayStart, to: now.toISOString() } }
          }
        }
      }),
      yangoFetch('/v1/parks/orders/list', {
        limit: 1000,
        query: {
          park: {
            id: process.env.YANGO_PARK_ID,
            order: { booked_at: { from: monthStart, to: now.toISOString() } }
          }
        }
      })
    ]);

    // Process drivers
    const drivers = (driversData.driver_profiles || []).map(dp => ({
      id: dp.driver_profile?.id || '',
      nom: `${dp.driver_profile?.first_name || ''} ${dp.driver_profile?.last_name || ''}`.trim(),
      statut: mapDriverStatus(dp.current_status?.status),
      statutRaw: dp.current_status?.status || 'offline',
      derniereMaj: dp.current_status?.status_updated_at || null,
      balance: dp.accounts?.[0]?.balance || '0'
    }));

    // Process orders
    const todayOrders = (ordersToday.orders || []);
    const monthOrders = (ordersMonth.orders || []);

    const caToday = todayOrders.reduce((sum, o) => sum + parseFloat(o.price || o.cost?.total || 0), 0);
    const caMonth = monthOrders.reduce((sum, o) => sum + parseFloat(o.price || o.cost?.total || 0), 0);

    // Calculate average activity time from today's completed orders
    const completedToday = todayOrders.filter(o => o.ended_at && o.started_at);
    let tempsActiviteMoyen = 0;
    if (completedToday.length > 0) {
      const totalMinutes = completedToday.reduce((sum, o) => {
        const start = new Date(o.started_at);
        const end = new Date(o.ended_at);
        return sum + (end - start) / 60000; // minutes
      }, 0);
      tempsActiviteMoyen = Math.round(totalMinutes / completedToday.length);
    }

    res.json({
      chauffeurs: {
        total: driversData.total || drivers.length,
        enLigne: drivers.filter(d => d.statut === 'en_ligne').length,
        occupes: drivers.filter(d => d.statut === 'occupe').length,
        horsLigne: drivers.filter(d => d.statut === 'hors_ligne').length,
        liste: drivers
      },
      courses: {
        aujourd_hui: ordersToday.total || todayOrders.length,
        mois: ordersMonth.total || monthOrders.length,
        enCours: todayOrders.filter(o =>
          o.status === 'driving' || o.status === 'transporting' || o.status === 'waiting'
        ).length
      },
      chiffreAffaires: {
        aujourd_hui: caToday,
        mois: caMonth
      },
      tempsActiviteMoyen, // en minutes
      derniereMaj: now.toISOString()
    });
  } catch (err) {
    console.error('Yango stats error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
});

/**
 * Map Yango driver status to French labels
 */
function mapDriverStatus(status) {
  switch (status) {
    case 'free':
      return 'en_ligne';
    case 'busy':
    case 'in_order':
      return 'occupe';
    case 'offline':
    default:
      return 'hors_ligne';
  }
}

module.exports = router;
