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

// Helper: make Yango API call with detailed error logging
async function yangoFetch(endpoint, body = {}) {
  const parkId = process.env.YANGO_PARK_ID;
  const apiKey = process.env.YANGO_API_KEY;
  const clientId = process.env.YANGO_CLIENT_ID;

  if (!parkId || !apiKey || !clientId) {
    throw new Error('Yango API credentials not configured');
  }

  console.log(`Yango API call: POST ${endpoint}`);
  console.log('Yango request body:', JSON.stringify(body, null, 2));

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

  const text = await res.text();
  console.log(`Yango API response ${res.status}:`, text.substring(0, 500));

  if (!res.ok) {
    throw new Error(`Yango API error ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Yango API invalid JSON: ${text.substring(0, 200)}`);
  }
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
        car: ['brand', 'model', 'color', 'number', 'year'],
        current_status: ['status', 'status_updated_at'],
        driver_profile: [
          'id', 'first_name', 'last_name', 'phones', 'created_date',
          'hire_date', 'work_status'
        ]
      },
      limit: 100,
      offset: 0,
      query: {
        park: {
          id: process.env.YANGO_PARK_ID,
          driver_profile: {
            work_status: ['working']
          }
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
        annee: dp.car.year || ''
      } : null,
      dateCreation: dp.driver_profile?.created_date || null,
      dateEmbauche: dp.driver_profile?.hire_date || null
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
      limit: 100,
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

    const orders = (data.orders || []).map(o => {
      // Calculate duration in minutes
      let dureeMinutes = 0;
      if (o.started_at && o.ended_at) {
        dureeMinutes = Math.round((new Date(o.ended_at) - new Date(o.started_at)) / 60000);
      }

      return {
        id: o.id || '',
        statut: mapOrderStatus(o.status),
        statutRaw: o.status || '',
        chauffeurId: o.driver?.id || '',
        chauffeurNom: o.driver ? `${o.driver.first_name || ''} ${o.driver.last_name || ''}`.trim() : '',
        vehiculeImmat: o.car?.number || '',
        montant: parseFloat(o.price || o.cost?.total || 0),
        devise: o.currency || 'XOF',
        dateReservation: o.booked_at || '',
        dateDebut: o.started_at || '',
        dateFin: o.ended_at || '',
        categorie: o.category || '',
        depart: o.route?.[0]?.address?.fullname || o.address_from?.fullname || o.source || '',
        arrivee: o.route?.[1]?.address?.fullname || o.address_to?.fullname || o.destination || '',
        distance: o.route_info?.distance || o.distance || 0,
        dureeMinutes
      };
    });

    const totalCA = orders.reduce((sum, o) => sum + o.montant, 0);

    res.json({
      total: data.total || orders.length,
      orders,
      chiffreAffaires: totalCA,
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
      limit: 100,
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
      statut: car.status || '',
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
 * GET /api/yango/stats
 * Aggregated stats endpoint: combines drivers + orders for quick dashboard view
 */
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Fetch drivers first (most important)
    let driversData;
    try {
      driversData = await yangoFetch('/v1/parks/driver-profiles/list', {
        fields: {
          account: ['balance'],
          current_status: ['status', 'status_updated_at'],
          driver_profile: ['id', 'first_name', 'last_name', 'work_status']
        },
        limit: 100,
        offset: 0,
        query: {
          park: {
            id: process.env.YANGO_PARK_ID,
            driver_profile: {
              work_status: ['working']
            }
          }
        },
        sort_order: [{ direction: 'asc', field: 'driver_profile.last_name' }]
      });
    } catch (e) {
      console.error('Yango stats - drivers fetch failed:', e.message);
      driversData = { driver_profiles: [], total: 0 };
    }

    // Fetch today's orders
    let ordersToday;
    try {
      ordersToday = await yangoFetch('/v1/parks/orders/list', {
        limit: 100,
        query: {
          park: {
            id: process.env.YANGO_PARK_ID,
            order: { booked_at: { from: todayStart, to: now.toISOString() } }
          }
        }
      });
    } catch (e) {
      console.error('Yango stats - today orders failed:', e.message);
      ordersToday = { orders: [], total: 0 };
    }

    // Fetch month's orders
    let ordersMonth;
    try {
      ordersMonth = await yangoFetch('/v1/parks/orders/list', {
        limit: 100,
        query: {
          park: {
            id: process.env.YANGO_PARK_ID,
            order: { booked_at: { from: monthStart, to: now.toISOString() } }
          }
        }
      });
    } catch (e) {
      console.error('Yango stats - month orders failed:', e.message);
      ordersMonth = { orders: [], total: 0 };
    }

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

    // Calculate average activity time
    const completedToday = todayOrders.filter(o => o.ended_at && o.started_at);
    let tempsActiviteMoyen = 0;
    let tempsActiviteTotal = 0;
    if (completedToday.length > 0) {
      const totalMinutes = completedToday.reduce((sum, o) => {
        const start = new Date(o.started_at);
        const end = new Date(o.ended_at);
        return sum + (end - start) / 60000;
      }, 0);
      tempsActiviteMoyen = Math.round(totalMinutes / completedToday.length);
      tempsActiviteTotal = Math.round(totalMinutes);
    }

    // Calculate completed + cancelled counts
    const coursesTerminees = todayOrders.filter(o => o.status === 'complete').length;
    const coursesAnnulees = todayOrders.filter(o => o.status === 'cancelled').length;
    const coursesEnCours = todayOrders.filter(o =>
      o.status === 'driving' || o.status === 'transporting' || o.status === 'waiting'
    ).length;

    // Top drivers today (by revenue)
    const driverRevenue = {};
    todayOrders.filter(o => o.status === 'complete').forEach(o => {
      const driverId = o.driver?.id;
      if (driverId) {
        if (!driverRevenue[driverId]) {
          driverRevenue[driverId] = {
            id: driverId,
            nom: `${o.driver?.first_name || ''} ${o.driver?.last_name || ''}`.trim(),
            ca: 0,
            courses: 0
          };
        }
        driverRevenue[driverId].ca += parseFloat(o.price || o.cost?.total || 0);
        driverRevenue[driverId].courses++;
      }
    });
    const topChauffeurs = Object.values(driverRevenue)
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 5);

    // Recent orders (last 10)
    const coursesRecentes = todayOrders
      .sort((a, b) => new Date(b.booked_at || 0) - new Date(a.booked_at || 0))
      .slice(0, 10)
      .map(o => ({
        id: o.id || '',
        statut: mapOrderStatus(o.status),
        chauffeur: o.driver ? `${o.driver.first_name || ''} ${o.driver.last_name || ''}`.trim() : '--',
        montant: parseFloat(o.price || o.cost?.total || 0),
        heure: o.booked_at || '',
        depart: o.route?.[0]?.address?.fullname || o.address_from?.fullname || '',
        arrivee: o.route?.[1]?.address?.fullname || o.address_to?.fullname || ''
      }));

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
        enCours: coursesEnCours,
        terminees: coursesTerminees,
        annulees: coursesAnnulees,
        recentes: coursesRecentes
      },
      chiffreAffaires: {
        aujourd_hui: caToday,
        mois: caMonth
      },
      tempsActiviteMoyen,
      tempsActiviteTotal,
      topChauffeurs,
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

/**
 * Map Yango order status to French labels
 */
function mapOrderStatus(status) {
  const map = {
    'driving': 'en_route',
    'waiting': 'en_attente',
    'transporting': 'en_course',
    'complete': 'terminee',
    'cancelled': 'annulee',
    'failed': 'echouee',
    'expired': 'expiree',
    'search': 'recherche',
    'assigned': 'assignee'
  };
  return map[status] || status || 'inconnue';
}

module.exports = router;
