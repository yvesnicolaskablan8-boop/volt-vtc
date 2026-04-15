const { withYango, yangoPost } = require('../_lib/yango');

module.exports = withYango(async (req, res, creds) => {
  const workRuleFilter = req.query.work_rule ? req.query.work_rule.split(',') : [];
  const now = new Date();
  const from = req.query.from || new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const to = req.query.to || now.toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Fetch drivers, today orders, month orders in parallel
  const driverBody = {
    limit: 500, offset: 0, park_id: creds.parkId,
    fields: {
      account: ['balance', 'currency'],
      car: ['brand', 'model', 'number'],
      driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_status', 'work_rule_id'],
      current_status: ['status'],
    },
    query: { park: { work_status: ['working'] } },
  };
  if (workRuleFilter.length) driverBody.query.park.work_rule_id = workRuleFilter;

  const orderBody = {
    limit: 500, park_id: creds.parkId,
    query: {
      park: { order: {
        booked_at: { from, to },
        status: ['complete', 'cancelled', 'driving', 'waiting', 'transporting'],
      }},
    },
  };

  const monthOrderBody = {
    limit: 500, park_id: creds.parkId,
    query: {
      park: { order: {
        booked_at: { from: monthStart, to: now.toISOString() },
        status: ['complete'],
      }},
    },
  };

  const [driversData, ordersData, monthData] = await Promise.all([
    yangoPost('/v1/parks/driver-profiles/list', driverBody, creds),
    yangoPost('/v1/parks/orders/list', orderBody, creds),
    yangoPost('/v1/parks/orders/list', monthOrderBody, creds),
  ]);

  // Process drivers
  const profiles = driversData.driver_profiles || [];
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

  // Process today orders
  const orders = ordersData.orders || [];
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

  // Process month orders
  const monthOrders = monthData.orders || [];
  let caMois = 0;
  monthOrders.forEach(o => { caMois += parseFloat(o.price) || 0; });

  // Top chauffeurs by revenue
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
