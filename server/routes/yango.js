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

// Helper: make Yango POST API call with detailed error logging
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

// Helper: make Yango GET API call (for work-rules etc.)
async function yangoGet(endpoint, params = {}) {
  const parkId = process.env.YANGO_PARK_ID;
  const apiKey = process.env.YANGO_API_KEY;
  const clientId = process.env.YANGO_CLIENT_ID;

  if (!parkId || !apiKey || !clientId) {
    throw new Error('Yango API credentials not configured');
  }

  const url = new URL(`${YANGO_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

  console.log(`Yango API call: GET ${url.toString()}`);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-Client-ID': clientId,
      'X-API-Key': apiKey,
      'X-Park-ID': parkId,
      'Accept-Language': 'fr'
    }
  });

  const text = await res.text();
  console.log(`Yango GET response ${res.status}:`, text.substring(0, 500));

  if (!res.ok) {
    throw new Error(`Yango API error ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Yango API invalid JSON: ${text.substring(0, 200)}`);
  }
}

// Cache for work rules (refreshed every 10 minutes)
let _workRulesCache = null;
let _workRulesCacheTime = 0;
const WORK_RULES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getWorkRules() {
  const now = Date.now();
  if (_workRulesCache && (now - _workRulesCacheTime) < WORK_RULES_CACHE_TTL) {
    return _workRulesCache;
  }
  try {
    const data = await yangoGet('/v1/parks/driver-work-rules', {
      park_id: process.env.YANGO_PARK_ID
    });
    _workRulesCache = data;
    _workRulesCacheTime = now;
    return data;
  } catch (e) {
    console.error('Failed to fetch work rules:', e.message);
    // Return cached data if available, even if expired
    if (_workRulesCache) return _workRulesCache;
    throw e;
  }
}

/**
 * GET /api/yango/work-rules
 * Fetches all work rules/categories for the park
 * Returns list of { id, name } objects
 */
router.get('/work-rules', async (req, res) => {
  try {
    const data = await getWorkRules();
    // Yango API returns "rules" (not "work_rules")
    const rawRules = data.rules || data.work_rules || [];
    const rules = rawRules
      .filter(r => r.is_enabled !== false) // Only enabled rules
      .map(r => ({
        id: r.id || '',
        name: r.name || r.id || 'Sans nom'
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      total: rules.length,
      work_rules: rules
    });
  } catch (err) {
    console.error('Yango work-rules error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
});

/**
 * GET /api/yango/drivers?work_rule=RULE_ID_1,RULE_ID_2
 * Fetches driver profiles with optional work rule filter
 * Query params:
 *   work_rule - comma-separated work rule IDs to filter by
 */
router.get('/drivers', async (req, res) => {
  try {
    // Build driver profile filter
    const driverFilter = {
      work_status: ['working']
    };

    // Optional: filter by work rule ID(s)
    if (req.query.work_rule) {
      const workRuleIds = req.query.work_rule.split(',').map(s => s.trim()).filter(Boolean);
      if (workRuleIds.length > 0) {
        driverFilter.work_rule_id = workRuleIds;
      }
    }

    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        account: ['balance', 'currency'],
        car: ['brand', 'model', 'color', 'number', 'year'],
        current_status: ['status', 'status_updated_at'],
        driver_profile: [
          'id', 'first_name', 'last_name', 'phones', 'created_date',
          'hire_date', 'work_status', 'work_rule_id'
        ]
      },
      limit: 100,
      offset: 0,
      query: {
        park: {
          id: process.env.YANGO_PARK_ID,
          driver_profile: driverFilter
        }
      },
      sort_order: [
        { direction: 'asc', field: 'driver_profile.last_name' }
      ]
    });

    // Resolve work rule names (Yango API returns "rules" key)
    let workRulesMap = {};
    try {
      const rulesData = await getWorkRules();
      const rawRules = rulesData.rules || rulesData.work_rules || [];
      rawRules.forEach(r => {
        workRulesMap[r.id] = r.name || r.id;
      });
    } catch (e) {
      console.warn('Could not resolve work rule names:', e.message);
    }

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
      workRuleId: dp.driver_profile?.work_rule_id || '',
      workRuleName: workRulesMap[dp.driver_profile?.work_rule_id] || '',
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
 * GET /api/yango/stats?work_rule=RULE_ID_1,RULE_ID_2
 * Aggregated stats endpoint: combines drivers + orders for quick dashboard view
 * Query params:
 *   work_rule - comma-separated work rule IDs to filter drivers by
 */
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Build driver profile filter
    const driverFilter = {
      work_status: ['working']
    };

    // Optional: filter by work rule ID(s)
    if (req.query.work_rule) {
      const workRuleIds = req.query.work_rule.split(',').map(s => s.trim()).filter(Boolean);
      if (workRuleIds.length > 0) {
        driverFilter.work_rule_id = workRuleIds;
      }
    }

    // Fetch drivers first (most important)
    let driversData;
    try {
      driversData = await yangoFetch('/v1/parks/driver-profiles/list', {
        fields: {
          account: ['balance'],
          current_status: ['status', 'status_updated_at'],
          driver_profile: ['id', 'first_name', 'last_name', 'work_status', 'work_rule_id']
        },
        limit: 100,
        offset: 0,
        query: {
          park: {
            id: process.env.YANGO_PARK_ID,
            driver_profile: driverFilter
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

    // Get set of driver IDs for filtering orders when work_rule is active
    const driverIds = new Set(drivers.map(d => d.id));
    const hasWorkRuleFilter = !!req.query.work_rule;

    // Process orders — filter by driver IDs if work_rule filter is active
    let todayOrders = (ordersToday.orders || []);
    let monthOrders = (ordersMonth.orders || []);

    if (hasWorkRuleFilter && driverIds.size > 0) {
      todayOrders = todayOrders.filter(o => o.driver?.id && driverIds.has(o.driver.id));
      monthOrders = monthOrders.filter(o => o.driver?.id && driverIds.has(o.driver.id));
    }

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
        aujourd_hui: hasWorkRuleFilter ? todayOrders.length : (ordersToday.total || todayOrders.length),
        mois: hasWorkRuleFilter ? monthOrders.length : (ordersMonth.total || monthOrders.length),
        enCours: coursesEnCours,
        terminees: coursesTerminees,
        annulees: coursesAnnulees,
        recentes: coursesRecentes
      },
      chiffreAffaires: {
        aujourd_hui: caToday,
        mois: caMonth
      },
      commissionYango: {
        taux: 0.03,
        aujourd_hui: Math.round(caToday * 0.03),
        mois: Math.round(caMonth * 0.03)
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
