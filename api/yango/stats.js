const { withYango, yangoPost, YANGO_BASE } = require('../_lib/yango');

const SUPABASE_URL = 'https://cnwigcbgzzwvvihopvto.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNud2lnY2Jnenp3dnZpaG9wdnRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTMzNTksImV4cCI6MjA5MTY2OTM1OX0.v9L44YLNpphKZZyMHSrDa9bYaxtZMqaF5BsEKtg9NH8';

// Cache Pilote driver IDs for 5 minutes
let _piloteIdsCache = null;
let _piloteIdsCacheTime = 0;

async function getPiloteDriverIds() {
  const now = Date.now();
  if (_piloteIdsCache && (now - _piloteIdsCacheTime) < 300000) return _piloteIdsCache;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/fleet_chauffeurs?select=yango_driver_id&yango_driver_id=not.is.null&yango_driver_id=neq.`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  _piloteIdsCache = new Set(rows.map(r => r.yango_driver_id).filter(Boolean));
  _piloteIdsCacheTime = now;
  return _piloteIdsCache;
}

module.exports = withYango(async (req, res, creds) => {
  // Edge cache: 2 min fresh, serve stale 5 min while revalidating
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  const workRuleFilter = req.query.work_rule ? req.query.work_rule.split(',') : [];
  const now = new Date();
  const from = req.query.from || new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const to = req.query.to || now.toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Fetch Pilote-linked driver IDs + Yango data in parallel
  const driverBody = {
    limit: 500, offset: 0,
    fields: {
      account: ['balance', 'currency'],
      car: ['brand', 'model', 'number'],
      driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_status', 'work_rule_id'],
      current_status: ['status'],
    },
    query: { park: { id: creds.parkId } },
  };

  const orderBody = {
    limit: 500,
    query: {
      park: { id: creds.parkId, order: {
        booked_at: { from, to },
        status: ['complete', 'cancelled', 'driving', 'waiting', 'transporting'],
      }},
    },
  };

  const monthOrderBody = {
    limit: 500,
    query: {
      park: { id: creds.parkId, order: {
        booked_at: { from: monthStart, to: now.toISOString() },
        status: ['complete'],
      }},
    },
  };

  const [piloteIds, driversData, ordersData, monthData] = await Promise.all([
    getPiloteDriverIds(),
    yangoPost('/v1/parks/driver-profiles/list', driverBody, creds),
    yangoPost('/v1/parks/orders/list', orderBody, creds),
    yangoPost('/v1/parks/orders/list', monthOrderBody, creds),
  ]);

  // Filter drivers to Pilote-linked only
  const allProfiles = driversData.driver_profiles || [];
  const profiles = allProfiles.filter(p => {
    const dp = p.driver_profile || {};
    if (!piloteIds.has(dp.id)) return false;
    if (workRuleFilter.length && !workRuleFilter.includes(dp.work_rule_id)) return false;
    return true;
  });

  let enLigne = 0, occupes = 0, horsLigne = 0;
  const chauffeursList = profiles.map(p => {
    const dp = p.driver_profile || {};
    const s = (p.current_status || {}).status || 'offline';
    if (s === 'free') enLigne++;
    else if (s === 'busy' || s === 'in_order') occupes++;
    else horsLigne++;
    return {
      id: dp.id,
      nom: `${dp.first_name || ''} ${dp.last_name || ''}`.trim(),
      statut: s,
      balance: (p.accounts || [])[0]?.balance || '0',
    };
  });

  // Filter orders to Pilote drivers only
  const allOrders = ordersData.orders || [];
  const orders = allOrders.filter(o => o.driver && piloteIds.has(o.driver.id));

  let caAujourdhui = 0, coursesEnCours = 0, terminees = 0, annulees = 0;
  const recentes = [];

  orders.forEach(o => {
    const price = parseFloat(o.price) || 0;
    if (o.status === 'complete') { caAujourdhui += price; terminees++; }
    else if (o.status === 'cancelled') annulees++;
    else coursesEnCours++;

    if (recentes.length < 10) {
      recentes.push({
        id: o.id,
        statut: o.status,
        chauffeur: o.driver ? `${o.driver.first_name || ''} ${o.driver.last_name || ''}`.trim() : '',
        montant: price,
        heure: o.booked_at,
        depart: (o.route || [])[0]?.address?.fullname || '',
        arrivee: (o.route || [])[1]?.address?.fullname || '',
      });
    }
  });

  // Filter month orders to Pilote drivers only
  const allMonthOrders = monthData.orders || [];
  const monthOrders = allMonthOrders.filter(o => o.driver && piloteIds.has(o.driver.id));
  let caMois = 0;
  monthOrders.forEach(o => { caMois += parseFloat(o.price) || 0; });

  // Top chauffeurs by revenue (Pilote only)
  const chauffeurCA = {};
  orders.filter(o => o.status === 'complete' && o.driver).forEach(o => {
    const id = o.driver.id || 'unknown';
    const nom = `${o.driver.first_name || ''} ${o.driver.last_name || ''}`.trim();
    if (!chauffeurCA[id]) chauffeurCA[id] = { id, nom, ca: 0, courses: 0 };
    chauffeurCA[id].ca += parseFloat(o.price) || 0;
    chauffeurCA[id].courses++;
  });
  const topChauffeurs = Object.values(chauffeurCA).sort((a, b) => b.ca - a.ca).slice(0, 5);

  res.json({
    chauffeurs: {
      total: profiles.length,
      enLigne, occupes, horsLigne,
      liste: chauffeursList,
    },
    courses: {
      aujourd_hui: orders.length,
      mois: monthOrders.length,
      enCours: coursesEnCours,
      terminees, annulees,
      recentes,
    },
    chiffreAffaires: { aujourd_hui: Math.round(caAujourdhui), mois: Math.round(caMois) },
    topChauffeurs,
    derniereMaj: now.toISOString(),
    periode: { from, to },
  });
});
