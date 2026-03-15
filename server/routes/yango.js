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

const Chauffeur = require('../models/Chauffeur');

// All Yango routes require authentication
router.use(authMiddleware);

const YANGO_BASE = 'https://fleet-api.taxi.yandex.net';

// Helper: make Yango POST API call with detailed error logging
async function yangoFetch(endpoint, body = {}, maxRetries = 3) {
  const parkId = process.env.YANGO_PARK_ID;
  const apiKey = process.env.YANGO_API_KEY;
  const clientId = process.env.YANGO_CLIENT_ID;

  if (!parkId || !apiKey || !clientId) {
    throw new Error('Yango API credentials not configured');
  }

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${YANGO_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': clientId,
          'X-API-Key': apiKey,
          'Accept-Language': 'fr'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const text = await res.text();

      if (!res.ok) {
        // Retry on 500/502/503/504
        if (res.status >= 500 && attempt < maxRetries) {
          console.warn(`Yango API ${res.status} on ${endpoint} (attempt ${attempt}/${maxRetries}), retrying...`);
          await new Promise(r => setTimeout(r, 500 * attempt));
          continue;
        }
        throw new Error(`Yango API error ${res.status}: ${text.substring(0, 200)}`);
      }

      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`Yango API invalid JSON: ${text.substring(0, 200)}`);
      }
    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError' && attempt < maxRetries) {
        console.warn(`Yango API timeout on ${endpoint} (attempt ${attempt}/${maxRetries}), retrying...`);
        continue;
      }
      if (attempt < maxRetries && e.message.includes('API error 5')) {
        continue;
      }
      throw e;
    }
  }
  throw lastError;
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-Client-ID': clientId,
      'X-API-Key': apiKey,
      'X-Park-ID': parkId,
      'Accept-Language': 'fr'
    },
    signal: controller.signal
  });
  clearTimeout(timeout);

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

// Cache for park orders (shared across driver-stats requests)
let _ordersCache = null;
let _ordersCacheTime = 0;
let _ordersCacheKey = ''; // from+to key
const ORDERS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

async function getCachedOrders(from, to) {
  // Use date-only key so "today" requests share cache regardless of exact timestamp
  const cacheKey = `${from.substring(0, 10)}|${to.substring(0, 10)}`;
  const now = Date.now();
  if (_ordersCache && _ordersCacheKey === cacheKey && (now - _ordersCacheTime) < ORDERS_CACHE_TTL) {
    console.log('driver-stats: using cached orders');
    return _ordersCache;
  }
  const data = await yangoFetch('/v1/parks/orders/list', {
    limit: 500,
    query: {
      park: {
        id: process.env.YANGO_PARK_ID,
        order: { booked_at: { from, to } }
      }
    }
  });
  _ordersCache = data;
  _ordersCacheTime = now;
  _ordersCacheKey = cacheKey;
  return data;
}

// Cache for work rules (refreshed every 10 minutes)
let _workRulesCache = null;
let _workRulesCacheTime = 0;
const WORK_RULES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch ALL transactions for a period with cursor-based pagination
 * Returns all transactions as a flat array
 * Categories for revenue:
 *   - cash_collected: especes collectees par le chauffeur
 *   - card: paiement par carte
 *   - partner_ride_cash_collected: course partenaire en especes
 *   - partner_ride_card: paiement par carte course partenaire
 *   - ewallet_payment: paiement portefeuille electronique
 *   - terminal_payment: paiement via terminal
 * Categories for commissions (negative amounts):
 *   - platform_ride_fee: commission Yango
 *   - platform_ride_vat: TVA sur commission
 *   - partner_ride_fee: commission partenaire (3%)
 */
async function fetchAllTransactions(from, to, driverIds = null) {
  const allTransactions = [];
  let cursor = '';
  let pageCount = 0;
  const MAX_PAGES = 10;

  // Ne PAS ajouter driver_profile_id au filtre API — il est unreliable
  // (retourne les transactions d'autres chauffeurs). Filtrage côté client uniquement.
  const transactionQuery = { event_at: { from, to } };

  do {
    const body = {
      query: {
        park: {
          id: process.env.YANGO_PARK_ID,
          transaction: transactionQuery
        }
      },
      limit: 1000
    };
    if (cursor) body.cursor = cursor;

    const data = await yangoFetch('/v2/parks/transactions/list', body);
    const txns = data.transactions || [];
    allTransactions.push(...txns);
    cursor = data.cursor || '';
    pageCount++;
  } while (cursor && pageCount < MAX_PAGES);

  // Always filter client-side when driverIds provided (API filter unreliable)
  if (driverIds && driverIds.size > 0) {
    return allTransactions.filter(t => t.driver_profile_id && driverIds.has(t.driver_profile_id));
  }

  return allTransactions;
}

/**
 * Aggregate transactions into financial summary
 */
function aggregateTransactions(transactions) {
  // Revenue categories (positive = income)
  const revenueCats = new Set([
    'cash_collected', 'partner_ride_cash_collected'
  ]);
  const cardCats = new Set([
    'card', 'partner_ride_card', 'ewallet_payment', 'terminal_payment'
  ]);
  // Commission categories (negative amounts from Yango)
  const commissionYangoCats = new Set([
    'platform_ride_fee', 'platform_ride_vat'
  ]);
  // Partner commission (your 3%)
  const commissionPartnerCats = new Set([
    'partner_ride_fee'
  ]);

  let totalCash = 0;
  let totalCard = 0;
  let commissionYango = 0;
  let commissionPartenaire = 0;
  let nbCoursesCash = 0;
  let nbCoursesCard = 0;

  // Track unique orders for counting
  const cashOrders = new Set();
  const cardOrders = new Set();

  // Per-driver revenue for top drivers
  const driverRevenue = {};

  // Track time span from event_at timestamps (for working hours estimation)
  let firstEventAt = null;
  let lastEventAt = null;

  for (const t of transactions) {
    const amount = parseFloat(t.amount || 0);
    const catId = t.category_id || '';
    const driverId = t.driver_profile_id || '';

    // Track event_at timestamps for working hours (only for ride-related transactions)
    if (t.event_at && t.order_id) {
      const eventTime = new Date(t.event_at);
      if (!isNaN(eventTime.getTime())) {
        if (!firstEventAt || eventTime < firstEventAt) firstEventAt = eventTime;
        if (!lastEventAt || eventTime > lastEventAt) lastEventAt = eventTime;
      }
    }

    if (revenueCats.has(catId)) {
      totalCash += amount;
      if (t.order_id) cashOrders.add(t.order_id);
      // Track per-driver
      if (driverId) {
        if (!driverRevenue[driverId]) driverRevenue[driverId] = { cash: 0, card: 0 };
        driverRevenue[driverId].cash += amount;
      }
    } else if (cardCats.has(catId)) {
      totalCard += amount;
      if (t.order_id) cardOrders.add(t.order_id);
      if (driverId) {
        if (!driverRevenue[driverId]) driverRevenue[driverId] = { cash: 0, card: 0 };
        driverRevenue[driverId].card += amount;
      }
    } else if (commissionYangoCats.has(catId)) {
      commissionYango += Math.abs(amount);
    } else if (commissionPartnerCats.has(catId)) {
      commissionPartenaire += Math.abs(amount);
    }
  }

  const totalCA = totalCash + totalCard;
  nbCoursesCash = cashOrders.size;
  nbCoursesCard = cardOrders.size;

  // Calculate working hours from first to last transaction timestamp
  let tempsActiviteMinutes = 0;
  if (firstEventAt && lastEventAt && firstEventAt < lastEventAt) {
    tempsActiviteMinutes = Math.round((lastEventAt - firstEventAt) / 60000);
    // Sanity check: cap at 24h (1440 min)
    if (tempsActiviteMinutes > 1440) tempsActiviteMinutes = 0;
  }

  return {
    totalCA: Math.round(totalCA),
    totalCash: Math.round(totalCash),
    totalCard: Math.round(totalCard),
    commissionYango: Math.round(commissionYango),
    commissionPartenaire: Math.round(commissionPartenaire),
    nbCoursesCash,
    nbCoursesCard,
    driverRevenue,
    tempsActiviteMinutes,
    firstEventAt: firstEventAt ? firstEventAt.toISOString() : null,
    lastEventAt: lastEventAt ? lastEventAt.toISOString() : null
  };
}

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
 * GET /api/yango/drivers/all
 * Fetches ALL driver profiles (without work_status filter) for manual linking
 * Uses pagination to get all drivers
 */
router.get('/drivers/all', async (req, res) => {
  try {
    const allDrivers = [];
    let offset = 0;
    const LIMIT = 300;
    const MAX_PAGES = 10;
    let page = 0;

    do {
      const data = await yangoFetch('/v1/parks/driver-profiles/list', {
        fields: {
          current_status: ['status'],
          driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_status']
        },
        limit: LIMIT,
        offset,
        query: {
          park: {
            id: process.env.YANGO_PARK_ID
            // Pas de filtre → TOUS les chauffeurs
          }
        }
      });

      const profiles = data.driver_profiles || [];
      for (const dp of profiles) {
        allDrivers.push({
          id: dp.driver_profile?.id || '',
          prenom: dp.driver_profile?.first_name || '',
          nom: dp.driver_profile?.last_name || '',
          telephone: dp.driver_profile?.phones?.[0] || '',
          workStatus: dp.driver_profile?.work_status || '',
          statut: dp.current_status?.status || 'offline'
        });
      }

      if (profiles.length < LIMIT) break;
      offset += LIMIT;
      page++;
    } while (page < MAX_PAGES);

    res.json({
      total: allDrivers.length,
      drivers: allDrivers
    });
  } catch (err) {
    console.error('Yango all drivers error:', err.message);
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
 * GET /api/yango/stats?work_rule=RULE_ID_1,RULE_ID_2&from=ISO_DATE&to=ISO_DATE
 * Aggregated stats endpoint: combines drivers + orders for quick dashboard view
 * Query params:
 *   work_rule - comma-separated work rule IDs to filter drivers by
 *   from - start date (ISO string), defaults to start of today
 *   to - end date (ISO string), defaults to now
 */
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    // Custom date range support
    const customFrom = req.query.from ? new Date(req.query.from) : null;
    const customTo = req.query.to ? new Date(req.query.to) : null;
    const isCustomRange = customFrom && !isNaN(customFrom.getTime());

    const todayStart = isCustomRange
      ? customFrom.toISOString()
      : new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = (customTo && !isNaN(customTo.getTime()))
      ? customTo.toISOString()
      : now.toISOString();

    // For month stats: if custom range, use same range; otherwise use month start
    const monthStart = isCustomRange
      ? customFrom.toISOString()
      : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = (customTo && !isNaN(customTo.getTime()))
      ? customTo.toISOString()
      : now.toISOString();

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

    // Fetch orders for selected period (today or custom range)
    let ordersToday;
    try {
      ordersToday = await yangoFetch('/v1/parks/orders/list', {
        limit: 100,
        query: {
          park: {
            id: process.env.YANGO_PARK_ID,
            order: { booked_at: { from: todayStart, to: todayEnd } }
          }
        }
      });
    } catch (e) {
      console.error('Yango stats - period orders failed:', e.message);
      ordersToday = { orders: [], total: 0 };
    }

    // Fetch month/full range orders (skip if custom range — same as period)
    let ordersMonth;
    if (isCustomRange) {
      // When using custom dates, month stats = same as period stats
      ordersMonth = ordersToday;
    } else {
      try {
        ordersMonth = await yangoFetch('/v1/parks/orders/list', {
          limit: 100,
          query: {
            park: {
              id: process.env.YANGO_PARK_ID,
              order: { booked_at: { from: monthStart, to: monthEnd } }
            }
          }
        });
      } catch (e) {
        console.error('Yango stats - month orders failed:', e.message);
        ordersMonth = { orders: [], total: 0 };
      }
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

    // Get set of driver IDs for filtering when work_rule is active
    const driverIds = new Set(drivers.map(d => d.id));
    const hasWorkRuleFilter = !!req.query.work_rule;

    // ========== TRANSACTIONS-BASED REVENUE (real payments) ==========
    // Fetch transactions for the period (with pagination)
    let todayTxns, monthTxns;
    try {
      todayTxns = await fetchAllTransactions(
        todayStart, todayEnd,
        hasWorkRuleFilter ? driverIds : null
      );
    } catch (e) {
      console.error('Yango stats - transactions fetch failed:', e.message);
      todayTxns = [];
    }

    if (isCustomRange) {
      monthTxns = todayTxns; // Same period
    } else {
      try {
        monthTxns = await fetchAllTransactions(
          monthStart, monthEnd,
          hasWorkRuleFilter ? driverIds : null
        );
      } catch (e) {
        console.error('Yango stats - month transactions failed:', e.message);
        monthTxns = [];
      }
    }

    // Aggregate financial data from real transactions
    const todayFinance = aggregateTransactions(todayTxns);
    const monthFinance = aggregateTransactions(monthTxns);

    // Build driver name map from drivers list
    const driverNameMap = {};
    drivers.forEach(d => { driverNameMap[d.id] = d.nom; });

    // Load Pilote-registered chauffeurs to filter top drivers
    // Only chauffeurs with a yangoDriverId are considered "registered on Pilote"
    let piloteChauffeurs = [];
    try {
      piloteChauffeurs = await Chauffeur.find(
        { yangoDriverId: { $exists: true, $ne: '' } },
        { yangoDriverId: 1, prenom: 1, nom: 1 }
      ).lean();
    } catch (e) {
      console.error('Yango stats - failed to load Pilote chauffeurs:', e.message);
    }

    // Map yangoDriverId → Pilote chauffeur name
    const piloteYangoIds = new Set();
    const piloteNameMap = {};
    piloteChauffeurs.forEach(c => {
      piloteYangoIds.add(c.yangoDriverId);
      piloteNameMap[c.yangoDriverId] = `${c.prenom} ${c.nom}`.trim();
    });

    // Top drivers from transactions — ONLY Pilote-registered chauffeurs
    const topChauffeurs = Object.entries(todayFinance.driverRevenue)
      .filter(([id]) => piloteYangoIds.has(id))
      .map(([id, rev]) => ({
        id,
        nom: piloteNameMap[id] || driverNameMap[id] || id,
        ca: Math.round(rev.cash + rev.card),
        cash: Math.round(rev.cash),
        card: Math.round(rev.card),
        courses: 0 // Will be enriched from orders if available
      }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 5);

    // ========== ORDERS for course counts + recent courses ==========
    let todayOrders = (ordersToday.orders || []);
    let monthOrders = (ordersMonth.orders || []);

    if (hasWorkRuleFilter && driverIds.size > 0) {
      todayOrders = todayOrders.filter(o => o.driver?.id && driverIds.has(o.driver.id));
      monthOrders = monthOrders.filter(o => o.driver?.id && driverIds.has(o.driver.id));
    }

    // Enrich top drivers with course count from orders
    const driverCourseCount = {};
    todayOrders.filter(o => o.status === 'complete').forEach(o => {
      const did = o.driver?.id;
      if (did) driverCourseCount[did] = (driverCourseCount[did] || 0) + 1;
    });
    topChauffeurs.forEach(d => {
      d.courses = driverCourseCount[d.id] || 0;
    });

    // Calculate average activity time from completed orders
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

    // Course status counts
    const coursesTerminees = todayOrders.filter(o => o.status === 'complete').length;
    const coursesAnnulees = todayOrders.filter(o => o.status === 'cancelled').length;
    const coursesEnCours = todayOrders.filter(o =>
      o.status === 'driving' || o.status === 'transporting' || o.status === 'waiting'
    ).length;

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

    // Filter drivers: only show Pilote-registered chauffeurs, use Volt names
    const piloteDrivers = drivers
      .filter(d => piloteYangoIds.has(d.id))
      .map(d => ({ ...d, nom: piloteNameMap[d.id] || d.nom }));

    res.json({
      chauffeurs: {
        total: piloteDrivers.length,
        enLigne: piloteDrivers.filter(d => d.statut === 'en_ligne').length,
        occupes: piloteDrivers.filter(d => d.statut === 'occupe').length,
        horsLigne: piloteDrivers.filter(d => d.statut === 'hors_ligne').length,
        liste: piloteDrivers
      },
      courses: {
        aujourd_hui: hasWorkRuleFilter ? todayOrders.length : (ordersToday.total || todayOrders.length),
        mois: hasWorkRuleFilter ? monthOrders.length : (ordersMonth.total || monthOrders.length),
        enCours: coursesEnCours,
        terminees: coursesTerminees,
        annulees: coursesAnnulees,
        recentes: coursesRecentes
      },
      // Revenue from REAL transactions (cash + card)
      chiffreAffaires: {
        aujourd_hui: todayFinance.totalCA,
        mois: monthFinance.totalCA,
        cash: {
          aujourd_hui: todayFinance.totalCash,
          mois: monthFinance.totalCash,
          nbCourses: todayFinance.nbCoursesCash
        },
        card: {
          aujourd_hui: todayFinance.totalCard,
          mois: monthFinance.totalCard,
          nbCourses: todayFinance.nbCoursesCard
        }
      },
      // Real commissions from Yango transactions
      commissionYango: {
        aujourd_hui: todayFinance.commissionYango,
        mois: monthFinance.commissionYango
      },
      commissionPartenaire: {
        aujourd_hui: todayFinance.commissionPartenaire,
        mois: monthFinance.commissionPartenaire
      },
      tempsActiviteMoyen,
      tempsActiviteTotal,
      topChauffeurs,
      derniereMaj: now.toISOString(),
      periode: {
        from: todayStart,
        to: todayEnd,
        isCustom: isCustomRange
      }
    });
  } catch (err) {
    console.error('Yango stats error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
});

/**
 * POST /api/yango/sync
 * Lance une synchronisation manuelle des donnees Yango
 * Body optionnel: { date: 'YYYY-MM-DD' } (defaut: hier)
 */
router.post('/sync', async (req, res) => {
  try {
    const { syncYangoActivity } = require('../utils/yango-sync');
    const syncDate = req.body.date ? new Date(req.body.date) : null;

    console.log(`[YangoSync] Synchronisation manuelle lancée${syncDate ? ' pour le ' + req.body.date : ''}...`);
    const result = await syncYangoActivity(syncDate);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('Yango sync error:', err.message, err.stack);
    const details = err.message || 'Erreur inconnue';
    // Distinguer les erreurs Yango API des erreurs internes
    if (details.includes('Yango API error')) {
      res.status(502).json({ error: 'Erreur API Yango', details });
    } else if (details.includes('credentials')) {
      res.status(503).json({ error: 'Configuration Yango manquante', details });
    } else {
      res.status(500).json({ error: 'Erreur de synchronisation', details });
    }
  }
});

/**
 * GET /api/yango/sync/status
 * Retourne le statut du CRON de synchronisation
 */
router.get('/sync/status', (req, res) => {
  const yangoCron = require('../utils/yango-cron');
  res.json(yangoCron.getStatus());
});

/**
 * GET /api/yango/fleet-status
 * Retourne les compteurs de statuts des chauffeurs en temps réel (comme Yango Fleet)
 */
router.get('/fleet-status', async (req, res) => {
  try {
    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        current_status: ['status'],
        driver_profile: ['id', 'first_name', 'last_name', 'work_status']
      },
      limit: 300,
      offset: 0,
      query: {
        park: {
          id: process.env.YANGO_PARK_ID
        }
      }
    });

    const profiles = data.driver_profiles || [];
    const counts = { free: 0, busy: 0, in_order: 0, offline: 0, total: profiles.length };
    const drivers = [];

    profiles.forEach(dp => {
      const status = dp.current_status?.status || 'offline';
      if (counts[status] !== undefined) counts[status]++;
      else counts.offline++;

      // N'inclure que les chauffeurs en ligne
      if (status !== 'offline') {
        drivers.push({
          id: dp.driver_profile?.id || '',
          nom: `${dp.driver_profile?.first_name || ''} ${dp.driver_profile?.last_name || ''}`.trim(),
          status
        });
      }
    });

    res.json({
      counts,
      disponible: counts.free,
      commandeActive: counts.in_order,
      occupe: counts.busy,
      horsLigne: counts.offline,
      total: counts.total,
      enLigne: counts.free + counts.busy + counts.in_order,
      drivers
    });
  } catch (err) {
    console.error('Yango fleet-status error:', err.message);
    res.status(500).json({ error: 'Erreur récupération statuts flotte' });
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

// =================== DRIVER INDIVIDUAL STATS ===================

/**
 * GET /api/yango/driver-stats/:yangoDriverId?from=ISO&to=ISO
 * Revenue for a single driver. Defaults to today if no dates.
 */
router.get('/driver-stats/:yangoDriverId', async (req, res) => {
  const { yangoDriverId } = req.params;
  if (!yangoDriverId) {
    return res.status(400).json({ error: 'yangoDriverId requis' });
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

  // Result defaults — always return something
  let totalCA = 0, totalCash = 0, totalCard = 0;
  let nbCourses = 0, commissionYango = 0, commissionPartenaire = 0;
  let tempsActiviteMinutes = 0;
  let sent = false;

  // Global safety timeout: respond with whatever we have after 30s
  const safetyTimer = setTimeout(() => {
    if (!sent) {
      sent = true;
      console.warn('driver-stats: global 30s timeout, returning partial data');
      res.json({
        yangoDriverId, totalCA, totalCash, totalCard, nbCourses,
        commissionYango, commissionPartenaire, tempsActiviteMinutes,
        derniereMaj: now.toISOString(),
        periode: { from, to, isCustom },
        partial: true
      });
    }
  }, 30000);

  try {
    // Primary: transactions (filtered by driver, paginated, reliable)
    const driverIds = new Set([yangoDriverId]);
    try {
      const txnTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Transactions timeout 25s')), 25000)
      );

      const transactionsData = await Promise.race([
        fetchAllTransactions(from, to, driverIds),
        txnTimeout
      ]);

      if (transactionsData && transactionsData.length > 0) {
        const finance = aggregateTransactions(transactionsData);
        totalCA = finance.totalCA;
        totalCash = finance.totalCash;
        totalCard = finance.totalCard;
        nbCourses = finance.nbCoursesCash + finance.nbCoursesCard;
        commissionYango = finance.commissionYango;
        commissionPartenaire = finance.commissionPartenaire;
        // Use transaction-based working hours (first→last event_at span)
        if (finance.tempsActiviteMinutes > 0) {
          tempsActiviteMinutes = finance.tempsActiviteMinutes;
        }
      }
    } catch (e) {
      console.warn('driver-stats: transactions failed, falling back to orders:', e.message);
    }

    // Always fetch orders for activity time + fallback CA
    if (!sent) {
      try {
        const ordersData = await getCachedOrders(from, to);
        if (ordersData) {
          const allOrders = ordersData.orders || [];
          const driverOrders = allOrders.filter(o => o.driver && o.driver.id === yangoDriverId);
          const completedOrders = driverOrders.filter(o => o.status === 'complete');

          // Calculate activity time from completed orders (try multiple Yango field names)
          for (const order of completedOrders) {
            const start = order.started_at || order.transporting_at || order.driving_at || order.booked_at;
            const end = order.ended_at || order.completed_at || order.finished_at;
            if (start && end) {
              const diff = (new Date(end) - new Date(start)) / 60000;
              if (diff > 0 && diff < 480) tempsActiviteMinutes += diff;
            }
          }
          tempsActiviteMinutes = Math.round(tempsActiviteMinutes);

          // Fallback CA from orders if transactions returned nothing
          if (totalCA === 0 && nbCourses === 0) {
            nbCourses = completedOrders.length;
            for (const order of completedOrders) {
              const price = parseFloat(order.price || 0);
              totalCA += price;
              if (order.payment_method === 'cash' || order.payment_method === 'corp') {
                totalCash += price;
              } else {
                totalCard += price;
              }
            }
            totalCA = Math.round(totalCA);
            totalCash = Math.round(totalCash);
            totalCard = Math.round(totalCard);
          }
        }
      } catch (e) {
        console.warn('driver-stats: orders failed:', e.message);
      }
    }

    if (!sent) {
      sent = true;
      clearTimeout(safetyTimer);
      res.json({
        yangoDriverId, totalCA, totalCash, totalCard, nbCourses,
        commissionYango, commissionPartenaire, tempsActiviteMinutes,
        derniereMaj: now.toISOString(),
        periode: { from, to, isCustom }
      });
    }
  } catch (err) {
    clearTimeout(safetyTimer);
    if (!sent) {
      sent = true;
      console.error('Yango driver-stats error:', err.message);
      res.status(502).json({ error: 'Erreur API Yango', details: err.message });
    }
  }
});

// =================== VEHICLES FOR LINKING ===================

/**
 * GET /api/yango/vehicles/all
 * Fetches ALL Yango vehicles for manual linking
 * Returns: { total, vehicles: [{ id, marque, modele, immatriculation, couleur, annee, statut }] }
 */
router.get('/vehicles/all', async (req, res) => {
  try {
    const allVehicles = [];
    let offset = 0;
    const LIMIT = 100;
    const MAX_PAGES = 5;
    let page = 0;

    do {
      const data = await yangoFetch('/v1/parks/cars/list', {
        limit: LIMIT,
        offset,
        query: { park: { id: process.env.YANGO_PARK_ID } }
      });

      const cars = data.cars || [];
      for (const car of cars) {
        allVehicles.push({
          id: car.id || '',
          marque: car.brand || '',
          modele: car.model || '',
          immatriculation: car.number || '',
          couleur: car.color || '',
          annee: car.year || '',
          statut: car.status || ''
        });
      }

      if (cars.length < LIMIT) break;
      offset += LIMIT;
      page++;
    } while (page < MAX_PAGES);

    res.json({
      total: allVehicles.length,
      vehicles: allVehicles
    });
  } catch (err) {
    console.error('Yango all vehicles error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
});

// =================== RECHARGE DRIVER BALANCE ===================

router.post('/recharge', async (req, res) => {
  try {
    const { chauffeurId, amount, description } = req.body;

    if (!chauffeurId || !amount) {
      return res.status(400).json({ error: 'chauffeurId et amount requis' });
    }

    const montant = parseFloat(amount);
    if (isNaN(montant) || montant === 0) {
      return res.status(400).json({ error: 'Le montant doit être un nombre non nul' });
    }

    // Trouver le chauffeur et son yangoDriverId
    const chauffeur = await Chauffeur.findOne({ id: chauffeurId });
    if (!chauffeur) {
      return res.status(404).json({ error: 'Chauffeur introuvable' });
    }
    if (!chauffeur.yangoDriverId) {
      return res.status(400).json({ error: 'Ce chauffeur n\'est pas lié à un profil Yango' });
    }

    const parkId = process.env.YANGO_PARK_ID;
    const apiKey = process.env.YANGO_API_KEY;
    const clientId = process.env.YANGO_CLIENT_ID;

    if (!parkId || !apiKey || !clientId) {
      return res.status(500).json({ error: 'Yango API credentials not configured' });
    }

    // Générer un token d'idempotence unique
    const idempotencyToken = `pilote-recharge-${chauffeurId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const body = {
      amount: montant.toFixed(4),
      category_id: 'partner_service_manual',
      description: description || `Recharge Pilote — ${chauffeur.prenom} ${chauffeur.nom}`,
      driver_profile_id: chauffeur.yangoDriverId,
      park_id: parkId
    };

    console.log(`[Yango Recharge] ${chauffeur.prenom} ${chauffeur.nom} — ${montant} XOF — driver=${chauffeur.yangoDriverId}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${YANGO_BASE}/v2/parks/driver-profiles/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': clientId,
        'X-API-Key': apiKey,
        'X-Idempotency-Token': idempotencyToken,
        'Accept-Language': 'fr'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const text = await response.text();

    if (!response.ok) {
      console.error(`[Yango Recharge] Erreur ${response.status}: ${text.substring(0, 300)}`);
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: `Erreur Yango: ${response.status}`,
        details: text.substring(0, 300)
      });
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      result = { raw: text.substring(0, 200) };
    }

    console.log(`[Yango Recharge] Succès — ${montant} XOF pour ${chauffeur.prenom} ${chauffeur.nom}`);

    res.json({
      success: true,
      message: `${montant > 0 ? 'Recharge' : 'Débit'} de ${Math.abs(montant)} XOF effectué pour ${chauffeur.prenom} ${chauffeur.nom}`,
      transaction: result,
      idempotencyToken
    });

  } catch (err) {
    console.error('[Yango Recharge] Error:', err.message);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout — Yango API ne répond pas' });
    }
    res.status(502).json({ error: 'Erreur lors de la recharge', details: err.message });
  }
});

/**
 * GET /api/yango/balance/:chauffeurId
 * Fetches the Yango account balance for a specific driver
 */
router.get('/balance/:chauffeurId', async (req, res) => {
  try {
    const chauffeur = await Chauffeur.findOne({ id: req.params.chauffeurId });
    if (!chauffeur) {
      return res.status(404).json({ error: 'Chauffeur introuvable' });
    }
    if (!chauffeur.yangoDriverId) {
      return res.status(400).json({ error: 'Ce chauffeur n\'est pas lié à un profil Yango' });
    }

    const parkId = process.env.YANGO_PARK_ID;

    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        account: ['balance'],
        driver_profile: ['id']
      },
      limit: 1,
      offset: 0,
      query: {
        park: {
          id: parkId,
          driver_profile: {
            id: [chauffeur.yangoDriverId]
          }
        }
      }
    });

    const profile = (data.driver_profiles || [])[0];
    if (!profile) {
      return res.status(404).json({ error: 'Profil Yango introuvable' });
    }

    const account = (profile.accounts || [])[0] || {};
    const balance = parseFloat(account.balance || 0);
    const currency = account.currency || 'XOF';

    console.log(`[Yango Balance] ${chauffeur.prenom} ${chauffeur.nom} — ${balance} ${currency}`);

    res.json({
      balance,
      currency,
      chauffeurId: req.params.chauffeurId,
      yangoDriverId: chauffeur.yangoDriverId
    });

  } catch (err) {
    console.error('[Yango Balance] Error:', err.message);
    res.status(502).json({ error: 'Erreur lors de la récupération du solde', details: err.message });
  }
});

module.exports = router;
